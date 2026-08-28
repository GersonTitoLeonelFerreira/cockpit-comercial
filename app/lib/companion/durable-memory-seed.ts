// Fase 12A, Frente 2B — Blocker 4.
//
// Contrato explícito entre MEMÓRIA DURÁVEL DO CLIENTE e ESTADO
// TRANSACIONAL DO CICLO.
//
// `StatefulCommercialState` é uma fotografia por (cycle_id,
// conversation_key): quando o mesmo lead abre um novo ciclo comercial, o
// novo estado nasce vazio — o que é correto para tudo que é
// transacional (etapa do funil, waiting/SLA, next action, negociação
// encerrada, compromissos), mas produz incoerência entre AGORA/ANÁLISE e
// CLIENTE quando o que se perde é conhecimento durável sobre o cliente
// (objetivo, preferência, produto discutido, padrão de comunicação,
// objeções já levantadas).
//
// Este módulo isola deliberadamente os únicos dois recortes considerados
// "memória durável do cliente" na taxonomia atual:
//   - facts cujo kind pertence à taxonomia `client.*`
//     (parseClientCommercialFactKind) — objetivo, problema, impacto,
//     interesse, critério de decisão, preferência, produto, concorrente,
//     padrão/evento de comunicação;
//   - objections ativas — "objeções passadas" é citada explicitamente
//     como herdável na missão.
//
// `needs`, `open_loops`, `commitments`, `signals` e `uncertainties` são
// deliberadamente EXCLUÍDOS: são estado transacional do ciclo (uma
// necessidade pontual, um compromisso agendado, um sinal do momento) e
// nascer "limpos" no novo ciclo é o comportamento correto, não um bug.
//
// Os itens herdados nunca entram como se fossem observações desta
// conversa: evidence_message_ids fica vazio (as mensagens do ciclo
// anterior não existem neste ledger), o summary carrega um prefixo de
// proveniência explícito, e a confiança nunca é promovida — na pior das
// hipóteses é rebaixada — porque o fato não foi reconfirmado nesta
// conversa.

import {
  parseClientCommercialFactKind,
} from './client-commercial-intelligence-contract'

import type {
  StatefulCommercialFact,
  StatefulCommercialObservedItem,
  StatefulCommercialState,
} from './stateful-commercial-state'

import type {
  StatefulCommercialMemoryIdFactory,
} from './stateful-commercial-state-reducer'

export const DURABLE_MEMORY_SEED_SUMMARY_PREFIX =
  '[Herdado do ciclo anterior deste cliente] '

const DURABLE_MEMORY_SEED_ITEM_INDEX_OFFSET =
  1_000_000

type StatefulCopilotConfidence =
  StatefulCommercialFact['confidence']

export type DurableMemorySeedFact = {
  kind: string
  value: string | null
  summary: string
  confidence: StatefulCopilotConfidence
}

export type DurableMemorySeedObjection = {
  kind: string
  summary: string
  confidence: StatefulCopilotConfidence
}

export type DurableMemorySeed = {
  source_cycle_id: string
  facts: DurableMemorySeedFact[]
  objections: DurableMemorySeedObjection[]
}

function isNonEmptyString(
  value: unknown,
): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0
  )
}

function isValidConfidence(
  value: unknown,
): value is StatefulCopilotConfidence {
  return (
    value === 'high' ||
    value === 'medium' ||
    value === 'low'
  )
}

function degradeConfidenceForInheritance(
  confidence: StatefulCopilotConfidence,
): StatefulCopilotConfidence {
  // Um fato herdado de outro ciclo não foi reconfirmado nesta conversa:
  // sua certeza nunca pode atravessar a fronteira do ciclo mais alta do
  // que "medium".
  return (
    confidence === 'high'
      ? 'medium'
      : confidence
  )
}

function parseRawDurableFact(
  item: unknown,
): DurableMemorySeedFact | null {
  if (
    typeof item !== 'object' ||
    item === null
  ) {
    return null
  }

  const record =
    item as Record<string, unknown>

  if (
    record.memory_status !==
    'active'
  ) {
    return null
  }

  if (
    !isNonEmptyString(
      record.kind,
    )
  ) {
    return null
  }

  const kind =
    record.kind

  if (
    parseClientCommercialFactKind(
      kind,
    ) === null
  ) {
    return null
  }

  if (
    !isNonEmptyString(
      record.summary,
    )
  ) {
    return null
  }

  const summary =
    record.summary

  if (
    !isValidConfidence(
      record.confidence,
    )
  ) {
    return null
  }

  const confidence =
    record.confidence

  const value =
    record.value

  if (
    value !== null &&
    value !== undefined &&
    typeof value !== 'string'
  ) {
    return null
  }

  return {
    kind,

    value:
      typeof value === 'string'
        ? value
        : null,

    summary:
      `${DURABLE_MEMORY_SEED_SUMMARY_PREFIX}${summary}`,

    confidence:
      degradeConfidenceForInheritance(
        confidence,
      ),
  }
}

function parseRawDurableObjection(
  item: unknown,
): DurableMemorySeedObjection | null {
  if (
    typeof item !== 'object' ||
    item === null
  ) {
    return null
  }

  const record =
    item as Record<string, unknown>

  if (
    record.memory_status !==
    'active'
  ) {
    return null
  }

  if (
    !isNonEmptyString(
      record.kind,
    )
  ) {
    return null
  }

  const kind =
    record.kind

  if (
    !isNonEmptyString(
      record.summary,
    )
  ) {
    return null
  }

  const summary =
    record.summary

  if (
    !isValidConfidence(
      record.confidence,
    )
  ) {
    return null
  }

  const confidence =
    record.confidence

  return {
    kind,

    summary:
      `${DURABLE_MEMORY_SEED_SUMMARY_PREFIX}${summary}`,

    confidence:
      degradeConfidenceForInheritance(
        confidence,
      ),
  }
}

// Aceita `unknown` (e não StatefulCommercialState) de propósito: a fonte
// real é o state_snapshot bruto de um ciclo ANTERIOR, persistido sob um
// universo de mensagens que não existe no ledger do ciclo atual — não é
// seguro (nem necessário) rodar o normalizador estrito de estado
// (normalizeStatefulCommercialState) sobre ele, já que evidence_message_ids
// do ciclo antigo é justamente o que este módulo descarta. Qualquer item
// malformado é simplesmente ignorado (falha segura): nunca fabrica
// memória, nunca lança exceção.
export function buildDurableMemorySeedFromPriorState(
  rawPriorState: unknown,
): DurableMemorySeed | null {
  if (
    typeof rawPriorState !== 'object' ||
    rawPriorState === null
  ) {
    return null
  }

  const record =
    rawPriorState as Record<string, unknown>

  if (
    !isNonEmptyString(
      record.cycle_id,
    )
  ) {
    return null
  }

  const cycleId =
    record.cycle_id

  const rawFacts =
    Array.isArray(
      record.facts,
    )
      ? record.facts
      : []

  const rawObjections =
    Array.isArray(
      record.objections,
    )
      ? record.objections
      : []

  const facts =
    rawFacts
      .map(
        parseRawDurableFact,
      )
      .filter(
        (
          fact,
        ): fact is DurableMemorySeedFact =>
          fact !== null,
      )

  const objections =
    rawObjections
      .map(
        parseRawDurableObjection,
      )
      .filter(
        (
          objection,
        ): objection is DurableMemorySeedObjection =>
          objection !== null,
      )

  if (
    facts.length === 0 &&
    objections.length === 0
  ) {
    return null
  }

  return {
    source_cycle_id:
      cycleId,

    facts,
    objections,
  }
}

// Aplica a memória durável herdada ao candidate_state produzido pelo
// motor. Só pode agir quando previousState é null: essa é a garantia,
// imposta pelo próprio banco (rpc_persist_stateful_copilot_state exige
// version=1 quando não há estado anterior), de que este é o PRIMEIRO
// estado real deste (cycle_id, conversation_key) — nunca uma rodada
// seguinte, onde o ciclo já tem vida própria e não deve "re-herdar" a
// cada turno.
export function applyDurableMemorySeedToFreshState({
  candidateState,
  previousState,
  seed,
  create_memory_id,
}: {
  candidateState:
    StatefulCommercialState

  previousState:
    StatefulCommercialState | null

  seed:
    DurableMemorySeed | null | undefined

  create_memory_id:
    StatefulCommercialMemoryIdFactory
}): StatefulCommercialState {
  if (
    previousState !== null ||
    !seed
  ) {
    return candidateState
  }

  const seededFacts: StatefulCommercialFact[] =
    seed.facts.map(
      (
        seedFact,
        index,
      ) => ({
        id:
          create_memory_id({
            cycle_id:
              candidateState.cycle_id,

            collection:
              'facts',

            state_version:
              candidateState.version,

            item_index:
              DURABLE_MEMORY_SEED_ITEM_INDEX_OFFSET +
              index,
          }),

        kind:
          seedFact.kind,

        value:
          seedFact.value,

        summary:
          seedFact.summary,

        confidence:
          seedFact.confidence,

        evidence_message_ids: [],

        memory_status:
          'active',

        created_in_state_version:
          candidateState.version,

        updated_in_state_version:
          candidateState.version,

        closed_in_state_version:
          null,
      }),
    )

  const seededObjections: StatefulCommercialObservedItem[] =
    seed.objections.map(
      (
        seedObjection,
        index,
      ) => ({
        id:
          create_memory_id({
            cycle_id:
              candidateState.cycle_id,

            collection:
              'objections',

            state_version:
              candidateState.version,

            item_index:
              DURABLE_MEMORY_SEED_ITEM_INDEX_OFFSET +
              index,
          }),

        kind:
          seedObjection.kind,

        summary:
          seedObjection.summary,

        confidence:
          seedObjection.confidence,

        evidence_message_ids: [],

        memory_status:
          'active',

        created_in_state_version:
          candidateState.version,

        updated_in_state_version:
          candidateState.version,

        closed_in_state_version:
          null,
      }),
    )

  if (
    seededFacts.length === 0 &&
    seededObjections.length === 0
  ) {
    return candidateState
  }

  return {
    ...candidateState,

    facts: [
      ...candidateState.facts,
      ...seededFacts,
    ],

    objections: [
      ...candidateState.objections,
      ...seededObjections,
    ],
  }
}
