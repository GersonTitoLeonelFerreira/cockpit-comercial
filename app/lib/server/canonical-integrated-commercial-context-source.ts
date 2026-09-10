import 'server-only'

import type {
  SupabaseClient,
} from '@supabase/supabase-js'

import type {
  CompanionClientContext,
} from '@/app/lib/companion/companion-client-context-contract'

import {
  loadCanonicalCycleCommercialMemory,
  type CanonicalCycleCommercialMemory,
} from './canonical-cycle-commercial-memory-source'

import {
  loadCanonicalMethodCoachingSource,
  type CanonicalMethodCoachingSource,
} from './canonical-method-coaching-source'

import {
  loadCanonicalDecisionState,
  type DecisionState,
} from './canonical-decision-state-source'

import {
  loadCanonicalCommunicationContext,
  type CommunicationContext,
} from './canonical-communication-context-source'

import type {
  CanonicalCommercialReadingSource,
} from './canonical-commercial-reading-source'

// ---------------------------------------------------------------------------
// FASE 16.4 — Integrated Commercial Context
//
// Responde à pergunta central do mandato: "como a Yolen mantém
// continuidade comercial sem confundir sessão atual com histórico da
// oportunidade?" — não inventando uma nova fonte de verdade, mas
// ORQUESTRANDO as cinco camadas canônicas já existentes (16.3B-F) na
// ordem correta, com identidade/reference_time validados uma única vez
// e sem paginar a mesma tabela duas vezes na mesma execução.
//
// Por que um orquestrador, não um novo agregador (mandato §24-26):
// - Commercial Reading (16.3B), Cycle Memory (16.3C), Method/Coaching
//   (16.3D), Decision State (16.3E) e Communication Context (16.3F) já
//   implementam toda a separação temporal exigida pelo mandato: `is_
//   active_session: boolean | null` já é o "current moment" (camada 1,
//   §7), `cycle_memory` já sobrevive a gap de sessão e a sessão pessoal
//   (camada 2), `cross_conversation_coaching`/histórico de eventos já
//   nunca vira estado atual (camada 4), e nenhum dos cinco cruza
//   company_id/cycle_id por construção (mandato §34).
// - O que NÃO existe hoje é um único ponto que carregue as cinco na
//   ordem certa sem duplicar leitura: `loadCanonicalDecisionState`
//   (16.3E) sempre recarregava Cycle Memory e Method/Coaching
//   internamente, mesmo quando um chamador (este módulo) já precisa
//   dos mesmos objetos para repassar ao Communication Context (16.3F)
//   — um double-scan de `companion_commercial_states` e da descoberta
//   de coaching cross-conversation a cada execução (achado da FASE
//   16.4, mandato §25). A correção foi aditiva em
//   `canonical-decision-state-source.ts`: dois novos parâmetros
//   suplementares opcionais (`cycle_memory`/`method_coaching`), mesma
//   disciplina de três casos já usada pelos outros dois módulos.
// - Este módulo não duplica NENHUM campo material das cinco fontes —
//   `current_reading`/`cycle_memory`/`method_coaching`/`decision_state`/
//   `communication_context` são expostos por REFERÊNCIA, intactos.
//   O único valor agregado próprio é `freshness`, um resumo derivado
//   (não uma nova fonte de verdade) para um consumidor que só precisa
//   saber "a sessão atual está ativa?"/"há oportunidade disponível?"/
//   "dá para gerar comunicação agora?" sem escavar os cinco objetos.
//
// Persistência: runtime-only, mesma disciplina de Decision State e
// Communication Context (mandato §42) — nenhuma tabela nova, nenhum
// evento novo, nenhum cache persistido.
//
// `current_reading`/`client_context` continuam sendo caller-supplied
// (mesma disciplina de 16.3D/16.3E/16.3F): este módulo nunca reconstrói
// `validation_context`/`state_read` nem faz autenticação — quem chama
// (uma rota autenticada, ou o Message Intelligence source loader) já
// carregou essas duas peças corretamente escopadas para
// (company_id, cycle_id, conversation_key, reference_time).
// ---------------------------------------------------------------------------

export const INTEGRATED_COMMERCIAL_CONTEXT_CURRENT_MOMENT_FRESHNESS = [
  'active_session',
  'expired_session',
  'unknown',
] as const

export type IntegratedCommercialContextCurrentMomentFreshness =
  (typeof INTEGRATED_COMMERCIAL_CONTEXT_CURRENT_MOMENT_FRESHNESS)[number]

export const INTEGRATED_COMMERCIAL_CONTEXT_OPPORTUNITY_FRESHNESS = [
  'available',
  'unavailable',
] as const

export type IntegratedCommercialContextOpportunityFreshness =
  (typeof INTEGRATED_COMMERCIAL_CONTEXT_OPPORTUNITY_FRESHNESS)[number]

export const INTEGRATED_COMMERCIAL_CONTEXT_COMMUNICATION_FRESHNESS = [
  'executable',
  'non_executable',
  'unavailable',
] as const

export type IntegratedCommercialContextCommunicationFreshness =
  (typeof INTEGRATED_COMMERCIAL_CONTEXT_COMMUNICATION_FRESHNESS)[number]

// Resumo derivado, nunca uma nova fonte de verdade (mandato §27/§28) —
// cada campo é uma leitura direta de um sinal que já existe em uma das
// cinco fontes canônicas, só rotulado para quem não quer escavar os
// cinco objetos completos:
// - `current_moment` vem de `decision_state.current_moment.is_active_
//   session` (booleano OU `null` — `null` já É "unknown"/indeterminado,
//   mandato §28: nunca inferido como comercial nem pessoal por
//   omissão).
// - `opportunity` reflete só se Cycle Memory pôde ser lida — a
//   oportunidade em si (compromissos/fatos/objeções do ciclo) nunca é
//   apagada por sessão pessoal ou gap de sessão (mandato §9/§29); esta
//   flag é sobre DISPONIBILIDADE da leitura, não sobre o estado da
//   venda.
// - `communication` reflete `communication_context.executable` — que
//   já é `false` sem Decision State válido (mandato §20, "sem Decision
//   State válido, não há Communication Context executável").
export type IntegratedCommercialContextFreshness = {
  current_moment:
    IntegratedCommercialContextCurrentMomentFreshness

  opportunity:
    IntegratedCommercialContextOpportunityFreshness

  communication:
    IntegratedCommercialContextCommunicationFreshness
}

export type CanonicalIntegratedCommercialContext = {
  company_id: string
  cycle_id: string
  conversation_key: string
  reference_time: string

  // CAMADA 1 (mandato §7) — snapshot da leitura mais recente da
  // conversa atual. Caller-supplied, nunca recalculado aqui.
  current_reading:
    CanonicalCommercialReadingSource | null

  // CAMADA 2/4 (mandato §7) — memória comercial ATIVA consolidada de
  // todas as conversas do ciclo. Sobrevive a gap de sessão e a sessão
  // pessoal por construção (nunca filtra por conversation_key da
  // sessão atual nem por "atividade recente").
  cycle_memory:
    CanonicalCycleCommercialMemory | null

  // Aderência/estágio de método + coaching, incluindo sinais
  // cross-conversation (sempre históricos, nunca current — mandato
  // §19).
  method_coaching:
    CanonicalMethodCoachingSource | null

  // AGORA canônico — única autoridade sobre decisão/prioridade/
  // intervenção/silêncio (mandato §20/§37).
  decision_state:
    DecisionState | null

  // Contexto executável para um futuro motor de mensagem — nunca
  // decide por conta própria, apenas resolve detalhe sobre a decisão
  // já tomada por `decision_state` (mandato §21/§37).
  communication_context:
    CommunicationContext | null

  freshness:
    IntegratedCommercialContextFreshness
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

function computeFreshness({
  cycleMemory,
  decisionState,
  communicationContext,
}: {
  cycleMemory:
    CanonicalCycleCommercialMemory | null
  decisionState:
    DecisionState | null
  communicationContext:
    CommunicationContext | null
}): IntegratedCommercialContextFreshness {
  const isActiveSession =
    decisionState?.current_moment.is_active_session ??
    null

  const currentMoment:
    IntegratedCommercialContextCurrentMomentFreshness =
      isActiveSession === true
        ? 'active_session'
        : isActiveSession === false
          ? 'expired_session'
          : 'unknown'

  const opportunity:
    IntegratedCommercialContextOpportunityFreshness =
      cycleMemory !== null
        ? 'available'
        : 'unavailable'

  const communication:
    IntegratedCommercialContextCommunicationFreshness =
      communicationContext === null
        ? 'unavailable'
        : communicationContext.executable
          ? 'executable'
          : 'non_executable'

  return {
    current_moment: currentMoment,
    opportunity,
    communication,
  }
}

/**
 * Carrega o Integrated Commercial Context canônico da FASE 16.4: a
 * composição, sem double-scan e sem duplicar campos, das cinco camadas
 * canônicas já existentes (Commercial Reading, Cycle Memory, Method/
 * Coaching, Decision State, Communication Context) para uma conversa em
 * um dado `reference_time`.
 *
 * Ordem de carga (cada etapa alimenta a seguinte, nunca ao contrário):
 * Cycle Memory → Method/Coaching (recebe `cycle_memory` já carregado) →
 * Decision State (recebe `cycle_memory`/`method_coaching` já
 * carregados — parâmetros aditivos da FASE 16.4) → Communication
 * Context (recebe `decision_state`/`cycle_memory`/`method_coaching` já
 * carregados). `companion_commercial_states` e a descoberta de coaching
 * cross-conversation são paginados NO MÁXIMO uma vez cada, mesmo com as
 * cinco fontes sendo consumidas.
 *
 * Falha fechada (retorna `null`) apenas para `reference_time` inválido
 * — mesma disciplina de toda a cadeia 16.3B-F. Qualquer outra fonte
 * ausente ou com escopo divergente degrada para `null`/resultado não
 * executável, nunca derruba as demais (mandato §26): uma leitura sem
 * Decision State válido ainda pode ter `cycle_memory` disponível
 * (oportunidade preservada), e `communication_context` sempre existe
 * como objeto `executable: false` em vez de `null` quando Decision
 * State está ausente (contrato já estabelecido em 16.3F).
 *
 * `current_reading`/`client_context` são caller-supplied (mesma
 * disciplina de 16.3D/16.3E/16.3F) — este módulo nunca reconstrói
 * `validation_context`/`state_read` nem autentica nada.
 */
export async function loadCanonicalIntegratedCommercialContext({
  admin,
  company_id,
  cycle_id,
  conversation_key,
  reference_time,
  current_reading,
  client_context,
}: {
  admin: SupabaseClient
  company_id: string
  cycle_id: string
  conversation_key: string
  reference_time: string

  current_reading:
    CanonicalCommercialReadingSource | null

  client_context:
    CompanionClientContext | null
}): Promise<CanonicalIntegratedCommercialContext | null> {
  const referenceTime =
    normalizeDateOrNull(reference_time)

  if (!referenceTime) {
    return null
  }

  let cycleMemory:
    CanonicalCycleCommercialMemory | null =
      null

  try {
    cycleMemory =
      await loadCanonicalCycleCommercialMemory({
        admin,
        company_id,
        cycle_id,
        reference_time: referenceTime,
      })
  } catch (error) {
    console.error(
      '[CANONICAL_INTEGRATED_COMMERCIAL_CONTEXT] cycle memory lookup failed, continuing without it',
      { company_id, cycle_id, error },
    )

    cycleMemory = null
  }

  let methodCoaching:
    CanonicalMethodCoachingSource | null =
      null

  try {
    methodCoaching =
      await loadCanonicalMethodCoachingSource({
        admin,
        company_id,
        cycle_id,
        conversation_key,
        reference_time: referenceTime,
        current_reading,
        cycle_memory: cycleMemory,
      })
  } catch (error) {
    console.error(
      '[CANONICAL_INTEGRATED_COMMERCIAL_CONTEXT] method/coaching lookup failed, continuing without it',
      { company_id, cycle_id, conversation_key, error },
    )

    methodCoaching = null
  }

  let decisionState:
    DecisionState | null =
      null

  try {
    decisionState =
      await loadCanonicalDecisionState({
        admin,
        company_id,
        cycle_id,
        conversation_key,
        reference_time: referenceTime,
        current_reading,
        client_context,
        cycle_memory: cycleMemory,
        method_coaching: methodCoaching,
      })
  } catch (error) {
    console.error(
      '[CANONICAL_INTEGRATED_COMMERCIAL_CONTEXT] decision state computation failed, continuing without it',
      { company_id, cycle_id, conversation_key, error },
    )

    decisionState = null
  }

  let communicationContext:
    CommunicationContext | null =
      null

  try {
    communicationContext =
      await loadCanonicalCommunicationContext({
        admin,
        company_id,
        cycle_id,
        conversation_key,
        reference_time: referenceTime,
        decision_state: decisionState,
        current_reading,
        cycle_memory: cycleMemory,
        method_coaching: methodCoaching,
      })
  } catch (error) {
    console.error(
      '[CANONICAL_INTEGRATED_COMMERCIAL_CONTEXT] communication context computation failed, continuing without it',
      { company_id, cycle_id, conversation_key, error },
    )

    communicationContext = null
  }

  return {
    company_id,
    cycle_id,
    conversation_key,
    reference_time: referenceTime,

    current_reading,
    cycle_memory: cycleMemory,
    method_coaching: methodCoaching,
    decision_state: decisionState,
    communication_context: communicationContext,

    freshness:
      computeFreshness({
        cycleMemory,
        decisionState,
        communicationContext,
      }),
  }
}
