import 'server-only'

import type {
  SupabaseClient,
} from '@supabase/supabase-js'

import {
  STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION,
  isPositiveStateVersion,
  isStatefulCommercialMemoryStatus,
  type StatefulCommercialCommitment,
  type StatefulCommercialFact,
  type StatefulCommercialMemoryBase,
  type StatefulCommercialObservedItem,
  type StatefulCommercialOpenLoop,
} from '@/app/lib/companion/stateful-commercial-state'

import {
  isStatefulCopilotCommitmentStatus,
  isStatefulCopilotConfidence,
} from '@/app/lib/companion/stateful-copilot-contract'

const CYCLE_COMMERCIAL_MEMORY_STATE_FIELDS = [
  'id',
  'company_id',
  'cycle_id',
  'conversation_key',
  'state_version',
  'state_contract_version',
  'state_updated_at',
  'state_snapshot',
].join(',')

type JsonRecord =
  Record<string, unknown>

export type CycleCommercialMemoryProvenance = {
  conversation_key: string
  state_record_id: string
  state_version: number
}

export type CycleCommercialMemoryItem<
  T extends StatefulCommercialMemoryBase,
> =
  Omit<T, 'id'> & {
    memory_id: string
    origin_id: string
    provenance: CycleCommercialMemoryProvenance
  }

export type CanonicalCycleCommercialMemory = {
  company_id: string
  cycle_id: string
  reference_time: string

  conversation_keys: string[]

  facts:
    CycleCommercialMemoryItem<StatefulCommercialFact>[]

  needs:
    CycleCommercialMemoryItem<StatefulCommercialObservedItem>[]

  open_loops:
    CycleCommercialMemoryItem<StatefulCommercialOpenLoop>[]

  objections:
    CycleCommercialMemoryItem<StatefulCommercialObservedItem>[]

  commitments:
    CycleCommercialMemoryItem<StatefulCommercialCommitment>[]

  signals:
    CycleCommercialMemoryItem<StatefulCommercialObservedItem>[]

  uncertainties:
    CycleCommercialMemoryItem<StatefulCommercialObservedItem>[]
}

function isRecord(
  value: unknown,
): value is JsonRecord {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value)
  )
}

function normalizeDateOrNull(
  value: unknown,
): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const timestamp =
    Date.parse(value)

  if (!Number.isFinite(timestamp)) {
    return null
  }

  return new Date(timestamp).toISOString()
}

function readNonEmptyString(
  value: unknown,
): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized =
    value.trim()

  return normalized || null
}

function readNullableString(
  value: unknown,
): { ok: true; value: string | null } | { ok: false } {
  if (value === null) {
    return { ok: true, value: null }
  }

  if (typeof value === 'string') {
    return { ok: true, value }
  }

  return { ok: false }
}

function readStringArray(
  value: unknown,
): string[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  const result: string[] = []

  for (const item of value) {
    if (typeof item !== 'string') {
      return null
    }

    result.push(item)
  }

  return result
}

/**
 * Valida SOMENTE a forma estrutural de um item de memória (id, status,
 * evidence_message_ids, versões de estado) — não revalida se as
 * mensagens referenciadas em evidence_message_ids ainda existem/estão
 * ativas na esteira daquela conversa. Essa revalidação é um conceito
 * por-conversa (exige o ledger daquela conversation_key específica) e
 * fica fora do escopo desta fase: o agregador lê muitas conversas de
 * uma vez e não paga o custo de N ledgers para uma leitura best-effort.
 * Limitação documentada, não uma lacuna silenciosa.
 */
function readMemoryItemBase(
  value: unknown,
): (
  Omit<StatefulCommercialMemoryBase, 'id'> & {
    origin_id: string
  }
) | null {
  if (!isRecord(value)) {
    return null
  }

  const originId =
    readNonEmptyString(value.id)

  const kind =
    readNonEmptyString(value.kind)

  const summary =
    readNonEmptyString(value.summary)

  const evidenceMessageIds =
    readStringArray(
      value.evidence_message_ids,
    )

  if (
    !originId ||
    !kind ||
    !summary ||
    !evidenceMessageIds ||
    !isStatefulCommercialMemoryStatus(
      value.memory_status,
    ) ||
    !isPositiveStateVersion(
      value.created_in_state_version,
    ) ||
    !isPositiveStateVersion(
      value.updated_in_state_version,
    )
  ) {
    return null
  }

  const closedInStateVersion =
    value.closed_in_state_version

  if (
    closedInStateVersion !== null &&
    !isPositiveStateVersion(
      closedInStateVersion,
    )
  ) {
    return null
  }

  return {
    origin_id:
      originId,

    kind,
    summary,

    evidence_message_ids:
      evidenceMessageIds,

    memory_status:
      value.memory_status,

    created_in_state_version:
      value.created_in_state_version,

    updated_in_state_version:
      value.updated_in_state_version,

    closed_in_state_version:
      closedInStateVersion as number | null,
  }
}

function qualifyMemoryId(
  conversationKey: string,
  originId: string,
): string {
  return `${conversationKey}::${originId}`
}

function collectActiveItems<
  T extends StatefulCommercialMemoryBase,
>(
  rawItems: unknown,
  provenance: CycleCommercialMemoryProvenance,
  extendExtra: (
    raw: JsonRecord,
  ) => Omit<
    T,
    keyof StatefulCommercialMemoryBase
  > | null,
): CycleCommercialMemoryItem<T>[] {
  if (!Array.isArray(rawItems)) {
    return []
  }

  const result: CycleCommercialMemoryItem<T>[] =
    []

  for (const rawItem of rawItems) {
    if (!isRecord(rawItem)) {
      continue
    }

    const base =
      readMemoryItemBase(rawItem)

    if (
      !base ||
      base.memory_status !== 'active'
    ) {
      continue
    }

    const extra =
      extendExtra(rawItem)

    if (!extra) {
      continue
    }

    const {
      origin_id: originId,
      ...baseRest
    } = base

    result.push({
      ...baseRest,
      ...extra,

      memory_id:
        qualifyMemoryId(
          provenance.conversation_key,
          originId,
        ),

      origin_id:
        originId,

      provenance,
    } as unknown as CycleCommercialMemoryItem<T>)
  }

  return result
}

function sortDeterministically<
  T extends StatefulCommercialMemoryBase,
>(
  items: CycleCommercialMemoryItem<T>[],
): CycleCommercialMemoryItem<T>[] {
  return [...items].sort((a, b) => {
    if (
      a.provenance.conversation_key !==
      b.provenance.conversation_key
    ) {
      return a.provenance.conversation_key <
        b.provenance.conversation_key
        ? -1
        : 1
    }

    if (
      a.created_in_state_version !==
      b.created_in_state_version
    ) {
      return (
        a.created_in_state_version -
        b.created_in_state_version
      )
    }

    return a.origin_id < b.origin_id
      ? -1
      : a.origin_id > b.origin_id
        ? 1
        : 0
  })
}

function readCommercialStateRow({
  row,
  companyId,
  cycleId,
}: {
  row: unknown
  companyId: string
  cycleId: string
}): {
  provenance: CycleCommercialMemoryProvenance
  snapshot: JsonRecord
} | null {
  if (!isRecord(row)) {
    return null
  }

  const stateRecordId =
    readNonEmptyString(row.id)

  const rowCompanyId =
    readNonEmptyString(row.company_id)

  const rowCycleId =
    readNonEmptyString(row.cycle_id)

  const conversationKey =
    readNonEmptyString(
      row.conversation_key,
    )

  const stateContractVersion =
    readNonEmptyString(
      row.state_contract_version,
    )

  if (
    !stateRecordId ||
    !rowCompanyId ||
    !rowCycleId ||
    !conversationKey ||
    !stateContractVersion ||
    rowCompanyId !== companyId ||
    rowCycleId !== cycleId ||
    stateContractVersion !==
      STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION ||
    !isPositiveStateVersion(
      row.state_version,
    ) ||
    !isRecord(row.state_snapshot)
  ) {
    return null
  }

  const snapshot =
    row.state_snapshot

  if (
    snapshot.contract_version !==
      STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION ||
    snapshot.cycle_id !== cycleId
  ) {
    return null
  }

  return {
    provenance: {
      conversation_key:
        conversationKey,

      state_record_id:
        stateRecordId,

      state_version:
        row.state_version,
    },

    snapshot,
  }
}

/**
 * Lê a memória comercial ATIVA de um ciclo consolidada através de
 * TODAS as conversas (conversation_key) que já persistiram estado
 * para ele — não apenas a conversa que está lendo agora.
 *
 * `companion_commercial_states` guarda um registro por
 * (company_id, cycle_id, conversation_key): a mesma oportunidade
 * discutida em dois canais (ex.: WhatsApp e ligação) produz duas
 * linhas independentes, cada uma com sua própria série de versões.
 * Sem este agregador, um fato ativo registrado na Conversation A fica
 * invisível para quem está na Conversation B do mesmo ciclo.
 *
 * IMPORTANTE — isolamento de identidade: o identificador de cada item
 * (`id` dentro do state_snapshot) é gerado deterministicamente a
 * partir de (cycle_id, collection, state_version, item_index) — SEM
 * conversation_key (ver createDeterministicStatefulCommercialMemoryId
 * em stateful-copilot-composition.ts). Duas conversas do mesmo ciclo
 * podem legitimamente colidir no mesmo `id` bruto ao descreverem
 * itens completamente diferentes (cada uma tem seu próprio contador
 * de versão começando em 1). Por isso este agregador NUNCA expõe o
 * `id` bruto como chave de leitura: todo item ganha um `memory_id`
 * qualificado por `${conversation_key}::${id}`, eliminando colisão
 * por construção e preservando a proveniência original em
 * `origin_id` + `provenance`.
 *
 * Escopo desta leitura (deliberado, não uma lacuna silenciosa):
 * - Somente itens com `memory_status: 'active'` são retornados.
 *   Resolved/superseded em uma conversa nunca reaparecem como ativos
 *   aqui, mesmo que outra conversa nunca os tenha fechado.
 * - Estado com `state_updated_at` posterior a `reference_time` é
 *   excluído (nunca promove memória "do futuro"), comparado como
 *   instante pela própria query (`.lte`), não como string em JS —
 *   mesma lição do achado do Codex na FASE 16.3A.
 * - A validação de cada item é estrutural (shape, status, versões).
 *   NÃO revalida se evidence_message_ids ainda pertence ao ledger
 *   ativo daquela conversa específica — isso exigiria carregar o
 *   ledger de cada conversation_key contribuinte, o que esta leitura
 *   best-effort e multi-conversa não faz nesta fase.
 * - "Mesma informação com ids diferentes" (duas conversas descrevendo
 *   o mesmo fato com side="active" e side ids distintos) NÃO é
 *   deduplicada: não existe no contrato atual nenhuma noção de
 *   equivalência semântica entre itens, então os dois convivem na
 *   leitura (coexistência), com proveniência própria cada um.
 * - Não promove memória de ciclo para memória de pessoa (e
 *   vice-versa): este agregador nunca cruza cycle_id. A herança
 *   entre ciclos continua sendo exclusivamente responsabilidade do
 *   contrato já endurecido em loadDurableMemorySeedForMissingState
 *   (FASE 16.3A), que este módulo não toca.
 * - Vazamento entre leads/empresas é estruturalmente impossível: a
 *   consulta filtra por (company_id, cycle_id) exatos, e um cycle_id
 *   pertence a exatamente um lead (sales_cycles.lead_id, FK fixa) e a
 *   exatamente uma company_id (sales_cycles_lead_id_fkey +
 *   companion_commercial_states_cycle_fkey).
 *
 * Este módulo é somente leitura e não é chamado por nenhum caminho
 * de produção ainda: nem pelo real-time context loader, nem pelo
 * MIE, nem por Commercial Reading. Ativá-lo em um desses caminhos é
 * uma decisão de produto sobre COMO e QUANDO memória de ciclo deve
 * ser exibida — território de Decision State/AGORA e Communication
 * Context/MENSAGEM, fora do escopo desta fase.
 */
export async function loadCanonicalCycleCommercialMemory({
  admin,
  company_id,
  cycle_id,
  reference_time,
}: {
  admin: SupabaseClient
  company_id: string
  cycle_id: string
  reference_time: string
}): Promise<CanonicalCycleCommercialMemory | null> {
  const referenceTime =
    normalizeDateOrNull(reference_time)

  if (!referenceTime) {
    return null
  }

  try {
    const {
      data: rows,
      error,
    } =
      await admin
        .from(
          'companion_commercial_states',
        )
        .select(
          CYCLE_COMMERCIAL_MEMORY_STATE_FIELDS,
        )
        .eq(
          'company_id',
          company_id,
        )
        .eq(
          'cycle_id',
          cycle_id,
        )
        .lte(
          'state_updated_at',
          referenceTime,
        )
        .order(
          'conversation_key',
          { ascending: true },
        )

    if (
      error ||
      !Array.isArray(rows)
    ) {
      return null
    }

    const facts: CycleCommercialMemoryItem<
      StatefulCommercialFact
    >[] = []

    const needs: CycleCommercialMemoryItem<
      StatefulCommercialObservedItem
    >[] = []

    const openLoops: CycleCommercialMemoryItem<
      StatefulCommercialOpenLoop
    >[] = []

    const objections: CycleCommercialMemoryItem<
      StatefulCommercialObservedItem
    >[] = []

    const commitments: CycleCommercialMemoryItem<
      StatefulCommercialCommitment
    >[] = []

    const signals: CycleCommercialMemoryItem<
      StatefulCommercialObservedItem
    >[] = []

    const uncertainties: CycleCommercialMemoryItem<
      StatefulCommercialObservedItem
    >[] = []

    const conversationKeys: string[] =
      []

    for (const row of rows) {
      const parsed =
        readCommercialStateRow({
          row,
          companyId: company_id,
          cycleId: cycle_id,
        })

      if (!parsed) {
        continue
      }

      const {
        provenance,
        snapshot,
      } = parsed

      conversationKeys.push(
        provenance.conversation_key,
      )

      facts.push(
        ...collectActiveItems<
          StatefulCommercialFact
        >(
          snapshot.facts,
          provenance,
          (raw) => {
            const value =
              raw.value === null ||
              typeof raw.value === 'string'
                ? raw.value
                : undefined

            if (
              value === undefined ||
              !isStatefulCopilotConfidence(
                raw.confidence,
              )
            ) {
              return null
            }

            return {
              value,
              confidence:
                raw.confidence,
            }
          },
        ),
      )

      const observed = (
        rawItems: unknown,
      ) =>
        collectActiveItems<
          StatefulCommercialObservedItem
        >(
          rawItems,
          provenance,
          (raw) => {
            if (
              !isStatefulCopilotConfidence(
                raw.confidence,
              )
            ) {
              return null
            }

            return {
              confidence:
                raw.confidence,
            }
          },
        )

      needs.push(
        ...observed(snapshot.needs),
      )

      objections.push(
        ...observed(
          snapshot.objections,
        ),
      )

      signals.push(
        ...observed(snapshot.signals),
      )

      uncertainties.push(
        ...observed(
          snapshot.uncertainties,
        ),
      )

      openLoops.push(
        ...collectActiveItems<
          StatefulCommercialOpenLoop
        >(
          snapshot.open_loops,
          provenance,
          () => ({}),
        ),
      )

      commitments.push(
        ...collectActiveItems<
          StatefulCommercialCommitment
        >(
          snapshot.commitments,
          provenance,
          (raw) => {
            const scheduledAt =
              readNullableString(
                raw.scheduled_at,
              )

            const proposedAt =
              readNullableString(
                raw.proposed_at,
              )

            if (
              !isStatefulCopilotCommitmentStatus(
                raw.commitment_status,
              ) ||
              !scheduledAt.ok ||
              !proposedAt.ok
            ) {
              return null
            }

            return {
              commitment_status:
                raw.commitment_status,
              scheduled_at:
                scheduledAt.value,
              proposed_at:
                proposedAt.value,
            }
          },
        ),
      )
    }

    return {
      company_id,
      cycle_id,
      reference_time:
        referenceTime,

      conversation_keys:
        [...new Set(conversationKeys)].sort(),

      facts:
        sortDeterministically(facts),

      needs:
        sortDeterministically(needs),

      open_loops:
        sortDeterministically(
          openLoops,
        ),

      objections:
        sortDeterministically(
          objections,
        ),

      commitments:
        sortDeterministically(
          commitments,
        ),

      signals:
        sortDeterministically(
          signals,
        ),

      uncertainties:
        sortDeterministically(
          uncertainties,
        ),
    }
  } catch (error) {
    console.error(
      '[CANONICAL_CYCLE_COMMERCIAL_MEMORY] lookup or aggregation failed, continuing without cycle memory',
      {
        company_id,
        cycle_id,
        error,
      },
    )

    return null
  }
}
