import 'server-only'

import type {
  CommercialReadingCurrentMethodStage,
  CommercialReadingDecision,
  CommercialReadingEvolutionItem,
  CommercialReadingImprovementKind,
  CommercialReadingImprovementPoint,
  CommercialReadingMethodAdherence,
  CommercialReadingMethodStage,
  CommercialReadingRecoveryGuidance,
  CommercialReadingRiskSeverity,
  CommercialReadingSellerStrength,
} from '@/app/lib/companion/commercial-reading-contract'

import type {
  StatefulCopilotCommitmentStatus,
} from '@/app/lib/companion/stateful-copilot-contract'

import type {
  CanonicalIntegratedCommercialContext,
} from './canonical-integrated-commercial-context-source'

import type {
  CanonicalMethodCoachingCrossConversationSignal,
} from './canonical-method-coaching-source'

// ---------------------------------------------------------------------------
// FASE 16.6 — ANÁLISE seller-facing view model.
//
// Único ponto de tradução entre o Integrated Commercial Context canônico
// (FASE 16.4, `canonical-integrated-commercial-context-source.ts`) e a
// apresentação seller-facing da aba ANÁLISE. Responde "como está esta
// venda e como ela foi conduzida?" (mandato FASE 16.6 §2) — nunca "o que
// fazer agora?" (AGORA, FASE 16.5) nem "quem é esta pessoa?" (CLIENTE).
//
// Este módulo não recalcula estado da oportunidade, não reclassifica
// risco/objeção/compromisso, não reordena candidatos por urgência e não
// gera texto novo — cada um desses julgamentos já foi feito por uma das
// quatro camadas canônicas (Commercial Reading 16.3B, Cycle Memory
// 16.3C, Method/Coaching 16.3D, ou o próprio orquestrador 16.4). Ele só:
//
// - traduz `best_approach.decision` (os mesmos 23 valores de
//   `CommercialReadingDecision` que AGORA também traduz, FASE 16.5) em
//   uma das categorias de apresentação de "estado da venda" abaixo —
//   mapa exaustivo, nunca um `switch` com `default` silencioso, mesma
//   disciplina de `agora-view-model.ts`;
// - separa objeções ATUAIS (`cycle_memory.objections` com
//   `memory_status: 'active'`) de objeções já resolvidas/substituídas —
//   nunca reapresenta uma objeção que a própria memória do ciclo já
//   marcou como encerrada como se fosse uma trava atual (mandato §11);
// - categoriza compromissos por `commitment_status`/`scheduled_at` já
//   computados pela Cycle Memory — mesma regra de vencido/hoje/
//   reagendamento já usada por `canonical-decision-state-source.ts`
//   (`buildCycleCommitmentCandidates`), aplicada aqui de forma mais
//   completa (todos os compromissos ativos, não só os mais prioritários
//   para uma decisão imediata) (mandato §13);
// - preserva `source`/`evidence_message_ids`/`memory_ids`/`reference_time`
//   como provenance interna (mandato §29), sem expor jargão interno no
//   texto seller-facing;
// - nunca inventa texto: todo `headline`/`summary`/`why_it_matters` vem
//   de campos já computados pelas fontes canônicas — a única cópia
//   própria deste módulo são as frases fixas e conservadoras usadas
//   quando o contexto integrado é `null` ou a leitura está ausente
//   (mandato §23/§34), que nunca descrevem uma venda concreta, só a
//   ausência de contexto.
//
// Decision State existe aqui apenas como REFERÊNCIA indireta — via
// `current_moment.is_active_session`, que já é o sinal canônico de
// "sessão atual vs continuidade da oportunidade" (FASE 16.4, mandato
// §9) — nunca como a narrativa dominante da aba (mandato §4/§25): este
// módulo não lê `decision_state.primary_decision`/`interventions` para
// montar riscos ou bloqueios, porque isso duplicaria a mesma seleção
// que AGORA já faz para um propósito diferente (decisão imediata, no
// máximo 3 sinais) — ANÁLISE precisa da leitura mais completa da venda,
// não da mais urgente.
// ---------------------------------------------------------------------------

export const ANALYSIS_VIEW_MODEL_OPPORTUNITY_STATUSES = [
  // Nenhuma leitura comercial disponível ainda, ou a sessão atual não é
  // comercial — ver `neutral`/`available` no retorno; esta categoria só
  // aparece internamente no mapa de tradução, nunca como `opportunity.
  // status` de um resultado real (mandato §8: ANÁLISE nunca inventa
  // estado de venda sem evidência).
  'no_intervention',

  'give_space',

  // Avançando — a venda está em movimento (apresentar, comparar,
  // demonstrar valor, enviar material, propor call/reunião/visita,
  // negociar, pedir decisão, fechar, ou responder/esclarecer/confirmar
  // informação).
  'advancing',

  // Aguardando retomada — follow-up ou compromisso assumido, ainda sem
  // vencer.
  'follow_up',

  // Travada numa objeção do cliente.
  'handle_objection',

  // Risco/atenção — a leitura recomenda escalar (ex.: estagnação,
  // atendimento em risco).
  'escalate',

  // Descoberta incompleta — falta informação para decidir o próximo
  // passo.
  'deepen_discovery',

  // Deliberadamente aguardando (contrato só permite canal `wait`/`none`
  // para esta decisão) — não é "travada", é uma pausa recomendada.
  'wait',
] as const

export type AnalysisViewModelOpportunityStatus =
  (typeof ANALYSIS_VIEW_MODEL_OPPORTUNITY_STATUSES)[number]

const DECISION_TO_OPPORTUNITY_STATUS: Record<
  CommercialReadingDecision,
  AnalysisViewModelOpportunityStatus
> = {
  no_intervention: 'no_intervention',
  give_space: 'give_space',

  respond: 'advancing',
  ask: 'advancing',
  clarify: 'advancing',
  confirm_information: 'advancing',
  present_solution: 'advancing',
  compare: 'advancing',
  demonstrate_value: 'advancing',
  send_material: 'advancing',
  propose_call: 'advancing',
  propose_meeting: 'advancing',
  propose_visit: 'advancing',
  negotiate: 'advancing',
  ask_for_decision: 'advancing',
  close: 'advancing',

  follow_up: 'follow_up',
  set_commitment: 'follow_up',

  wait: 'wait',

  handle_objection: 'handle_objection',

  escalate: 'escalate',

  deepen_discovery: 'deepen_discovery',
  insufficient_information: 'deepen_discovery',
}

export type AnalysisViewModelEvidence = {
  kind: string
  summary: string

  why_it_matters: string | null
  impact: string | null
  how_to_improve: string | null

  evidence_message_ids: string[]
  memory_ids: string[]
}

export type AnalysisViewModelRisk = {
  source: 'customer_objection' | 'service_risk'
  kind: string
  severity: CommercialReadingRiskSeverity

  summary: string

  evidence_message_ids: string[]
  memory_ids: string[]
}

export type AnalysisViewModelObjection = {
  kind: string
  summary: string

  evidence_message_ids: string[]
  memory_ids: string[]
}

export type AnalysisViewModelCommitment = {
  status:
    | 'overdue'
    | 'due_today'
    | 'pending'
    | 'reschedule_requested'
    | 'completed'
    | 'cancelled'

  summary: string
  scheduled_at: string | null

  evidence_message_ids: string[]
  memory_ids: string[]
}

export type AnalysisViewModelCrossConversationSignal = {
  conversation_key: string
  generated_at: string

  strengths_count: number
  improvements_count: number
}

export const ANALYSIS_VIEW_MODEL_UNAVAILABLE_REASONS = [
  // `integratedContext` é `null` — sem escopo/instante válido para
  // computar absolutamente nada (mandato §34).
  'no_context',

  // Contexto integrado existe, mas não há Commercial Reading da
  // conversa atual (`current_reading: null`) — nenhuma análise foi
  // concluída ainda para esta conversa (mandato §34, primeiro
  // fallback).
  'no_reading',
] as const

export type AnalysisViewModelUnavailableReason =
  (typeof ANALYSIS_VIEW_MODEL_UNAVAILABLE_REASONS)[number]

export type AnalysisViewModel = {
  // `false` somente quando não há Commercial Reading nenhum para
  // traduzir (mandato §34 — fallback informativo e conservador, nunca
  // inventa estado/probabilidade/objeção/risco/qualidade do vendedor).
  // `true` inclusive quando `neutral` é `true` — sessão pessoal
  // continua sendo um resultado disponível e legítimo, só com
  // `opportunity`/`risks`/`blockers` suprimidos (mandato §7, o mesmo
  // padrão de continuidade já usado por AGORA/give_space).
  available: boolean
  unavailable_reason: AnalysisViewModelUnavailableReason | null

  // `true` quando a sessão atual não é comercial (`commercial_relevance
  // !== 'commercial'` ou `commercial_role !== 'buyer'`) — mesma
  // checagem de `isNeutralCommercialSession` já usada por AGORA/ANÁLISE
  // desde a FASE 16.5, preservada aqui em vez de reconstruída (mandato
  // §6: não duplicar a mesma classificação). Continuidade da
  // oportunidade (compromissos, memória do ciclo) permanece disponível
  // mesmo quando `neutral` é `true` — só a leitura da CONVERSA atual
  // (estado da venda, riscos, condução) é suprimida (mandato §9).
  neutral: boolean
  neutral_headline: string | null
  neutral_description: string | null

  // Estado da venda (mandato §8/§19) — `null` quando `neutral` ou
  // `unavailable_reason` não é `null`.
  opportunity: {
    status: AnalysisViewModelOpportunityStatus
    headline: string | null
    stage_name: string | null
  } | null

  // Camada 1 vs camada 2 (mandato §9) — `is_active_session: null`
  // significa indeterminado (sem evidência de frescor), nunca inferido
  // como ativo nem expirado por omissão (mesmo contrato de
  // `DecisionStateCurrentMoment`, FASE 16.3E).
  current_moment: {
    is_active_session: boolean | null
  }

  // Bloqueios/riscos da CONVERSA ATUAL (mandato §12) —
  // `risks.customer_objections` + `risks.service_risks` da leitura
  // atual, severidade `medium`/`high` apenas (`low` nunca infla a
  // lista — mandato §12: "dado ausente ≠ risco automaticamente").
  // Máximo 3 — o presenter só preserva a garantia de densidade, nunca
  // reordena por conta própria além do agrupamento por severidade que
  // o próprio campo `severity` já expressa.
  risks: AnalysisViewModelRisk[]

  // Objeções ainda ABERTAS do ciclo inteiro (mandato §11) —
  // `cycle_memory.objections` com `memory_status === 'active'` apenas;
  // uma objeção `resolved`/`superseded` nunca aparece aqui, mesmo que
  // tenha sido mencionada na conversa atual (mandato §11, exemplo do
  // preço aceito).
  objections_open: AnalysisViewModelObjection[]

  // Compromissos do ciclo (mandato §13), categorizados pela mesma regra
  // já usada por `canonical-decision-state-source.ts`
  // (`buildCycleCommitmentCandidates`): `confirmed` vencido vira
  // `overdue`, `confirmed` previsto para hoje vira `due_today`,
  // `confirmed`/`proposed` futuro vira `pending`,
  // `reschedule_requested` mantém sua própria categoria (pendente de
  // reconciliação, não confirmado nem cancelado), `completed`/
  // `cancelled` refletem o `commitment_status` literal. Nunca reviva um
  // compromisso `memory_status !== 'active'` como pendente (mandato
  // §13).
  commitments: AnalysisViewModelCommitment[]

  // Condução do vendedor (mandato §14/§16) — passthrough direto de
  // `method_coaching.method`/`current_reading.reading.method`, nunca
  // reclassificado. `method` tem exatamente o formato de
  // `CommercialReadingMethod` (configured/name/stages/current_stage/
  // adherence/recovery_guidance) para que a renderização reutilize os
  // mesmos primitivos de apresentação já usados por AGORA/ANÁLISE desde
  // antes da FASE 16.6 (`renderMethod`/`renderMethodStages`/
  // `renderRecovery`), nunca uma segunda implementação.
  seller_conduct: {
    method: {
      configured: boolean
      name: string | null
      stages: CommercialReadingMethodStage[]
      current_stage: CommercialReadingCurrentMethodStage | null
      adherence: CommercialReadingMethodAdherence | null
      recovery_guidance: CommercialReadingRecoveryGuidance | null
    }

    // `true` somente quando `stage_comparison_reliable` também é
    // `true` — uma divergência não confiável nunca aparece como
    // divergência real (mandato §16, mesma disciplina de
    // `canonical-method-coaching-source.ts`).
    stage_divergence: boolean
  }

  // O que foi bem (mandato §17) — `seller_strengths`, preferencialmente
  // da leitura consolidada de `method_coaching.coaching` (mesma
  // conversa); nunca fabricado quando a lista está vazia (mandato §17).
  // Máximo 3, na ordem já produzida pela leitura canônica — este
  // presenter não reordena por tipo/urgência (nenhum desses campos tem
  // prioridade explícita; inventar uma aqui seria o mesmo tipo de
  // heurística client-side que o mandato pede para eliminar).
  strengths: AnalysisViewModelEvidence[]

  // O que precisa melhorar (mandato §18) — `improvement_points`, máximo
  // 3 (1 principal + até 2 secundários), mesma disciplina de ordem
  // preservada acima.
  improvements: AnalysisViewModelEvidence[]

  // Continuidade da oportunidade (mandato §10/§17/§31) — nunca esvaziada
  // por sessão pessoal ou gap de sessão, por construção (Cycle Memory já
  // garante isso).
  continuity: {
    cycle_conversation_count: number

    // Sinais de coaching de OUTRAS conversas do mesmo ciclo — sempre
    // históricos, nunca tratados como leitura da conversa atual
    // (mandato §14/§19, mesma disciplina de
    // `cross_conversation_coaching`).
    cross_conversation_signals: AnalysisViewModelCrossConversationSignal[]
  }

  // Síntese da evolução comercial (mandato §20) — `commercial_evolution`
  // verbatim, já existia na aba ANÁLISE desde antes da FASE 16.6.
  history: CommercialReadingEvolutionItem[]

  provenance: {
    reference_time: string
    state_record_id: string | null
    state_version: number | null
    state_updated_at: string | null
    cycle_memory_conversation_keys: string[]
  }
}

// Kinds sempre-urgentes de coaching (mesma classificação já usada por
// `canonical-decision-state-source.ts`, `SELLER_COACHING_ALWAYS_URGENT_
// KINDS`) — usado só para decidir qual `improvement_point` aparece
// PRIMEIRO quando mais de um está presente, nunca para inventar uma
// nova prioridade: é a mesma distinção "corretivo/defensivo" vs "risco
// no próximo passo" que a leitura canônica já documenta por `kind`.
const ALWAYS_URGENT_IMPROVEMENT_KINDS: readonly CommercialReadingImprovementKind[] = [
  'incorrect_information',
  'poor_objection_handling',
  'missed_commitment',
  'promise_risk',
]

const RISK_SEVERITY_RANK: Record<CommercialReadingRiskSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
}

const MAX_RISKS = 3
const MAX_OBJECTIONS = 3
const MAX_STRENGTHS = 3
const MAX_IMPROVEMENTS = 3
const MAX_CROSS_CONVERSATION_SIGNALS = 3

function evidenceFromImprovement(
  point: CommercialReadingImprovementPoint,
): AnalysisViewModelEvidence {
  return {
    kind: point.kind,
    summary: point.summary,
    why_it_matters: point.why_it_matters,
    impact: point.impact,
    how_to_improve: point.how_to_improve,
    evidence_message_ids: point.evidence_message_ids,
    memory_ids: point.memory_ids,
  }
}

function evidenceFromStrength(
  strength: CommercialReadingSellerStrength,
): AnalysisViewModelEvidence {
  return {
    kind: strength.kind,
    summary: strength.summary,
    why_it_matters: strength.why_it_matters,
    impact: null,
    how_to_improve: null,
    evidence_message_ids: strength.evidence_message_ids,
    memory_ids: strength.memory_ids,
  }
}

function commitmentStatusFor({
  commitmentStatus,
  scheduledAt,
  referenceInstant,
  isSameBusinessCalendarDay,
}: {
  commitmentStatus: StatefulCopilotCommitmentStatus
  scheduledAt: string | null
  referenceInstant: number
  isSameBusinessCalendarDay: (a: number, b: number) => boolean
}): AnalysisViewModelCommitment['status'] {
  if (commitmentStatus === 'completed') {
    return 'completed'
  }

  if (commitmentStatus === 'cancelled') {
    return 'cancelled'
  }

  if (commitmentStatus === 'reschedule_requested') {
    return 'reschedule_requested'
  }

  // `proposed`/`confirmed` daqui em diante — só `confirmed` com data
  // válida pode estar vencido ou ser hoje (mesma disciplina de
  // `buildCycleCommitmentCandidates`: uma proposta ainda não aceita
  // nunca é tratada como vencida).
  if (commitmentStatus === 'confirmed' && scheduledAt) {
    const scheduledInstant = Date.parse(scheduledAt)

    if (Number.isFinite(scheduledInstant)) {
      if (scheduledInstant < referenceInstant) {
        return 'overdue'
      }

      if (isSameBusinessCalendarDay(scheduledInstant, referenceInstant)) {
        return 'due_today'
      }
    }
  }

  return 'pending'
}

const BUSINESS_TIME_ZONE = 'America/Sao_Paulo'

function isSameBusinessCalendarDay(instantA: number, instantB: number): boolean {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  return formatter.format(new Date(instantA)) === formatter.format(new Date(instantB))
}

function crossConversationSignal(
  signal: CanonicalMethodCoachingCrossConversationSignal,
): AnalysisViewModelCrossConversationSignal {
  return {
    conversation_key: signal.conversation_key,
    generated_at: signal.generated_at,
    strengths_count: signal.seller_strengths.length,
    improvements_count: signal.improvement_points.length,
  }
}

/**
 * Traduz o Integrated Commercial Context canônico (FASE 16.4) na
 * apresentação seller-facing da aba ANÁLISE (FASE 16.6).
 *
 * `integratedContext: null` é o único caso que produz
 * `unavailable_reason: 'no_context'` — nunca uma leitura de venda
 * inventada (mandato §23/§34). `current_reading: null` dentro de um
 * contexto integrado válido produz `unavailable_reason: 'no_reading'`
 * — ainda não há análise concluída para esta conversa, mas
 * `continuity`/`commitments`/`objections_open` (Cycle Memory) continuam
 * disponíveis quando existirem, porque a oportunidade nunca é apagada
 * só porque a conversa atual ainda não foi lida (mandato §9/§29).
 *
 * Função pura e síncrona — nenhum acesso a banco, nenhuma
 * reclassificação de estado/risco/objeção/compromisso. Toda decisão já
 * foi tomada pelas quatro camadas canônicas.
 */
export function buildAnalysisViewModel(
  integratedContext: CanonicalIntegratedCommercialContext | null,
): AnalysisViewModel {
  const emptyContinuity = {
    cycle_conversation_count: 0,
    cross_conversation_signals: [] as AnalysisViewModelCrossConversationSignal[],
  }

  const emptySellerConduct = {
    method: {
      configured: false,
      name: null,
      stages: [] as CommercialReadingMethodStage[],
      current_stage: null,
      adherence: null,
      recovery_guidance: null,
    },
    stage_divergence: false,
  }

  if (!integratedContext) {
    return {
      available: false,
      unavailable_reason: 'no_context',

      neutral: false,
      neutral_headline: null,
      neutral_description: null,

      opportunity: null,
      current_moment: { is_active_session: null },

      risks: [],
      objections_open: [],
      commitments: [],

      seller_conduct: emptySellerConduct,

      strengths: [],
      improvements: [],

      continuity: emptyContinuity,
      history: [],

      provenance: {
        reference_time: '',
        state_record_id: null,
        state_version: null,
        state_updated_at: null,
        cycle_memory_conversation_keys: [],
      },
    }
  }

  const {
    current_reading: currentReading,
    cycle_memory: cycleMemory,
    method_coaching: methodCoaching,
    decision_state: decisionState,
    reference_time: referenceTime,
  } = integratedContext

  const cycleConversationCount = cycleMemory?.conversation_keys.length ?? 0

  const crossConversationSignals =
    (methodCoaching?.cross_conversation_coaching ?? [])
      .slice(0, MAX_CROSS_CONVERSATION_SIGNALS)
      .map(crossConversationSignal)

  const continuity = {
    cycle_conversation_count: cycleConversationCount,
    cross_conversation_signals: crossConversationSignals,
  }

  const provenance = {
    reference_time: referenceTime,

    state_record_id:
      currentReading?.state_record_id ?? null,

    state_version:
      currentReading?.state_version ?? null,

    state_updated_at:
      currentReading?.state_updated_at ?? null,

    cycle_memory_conversation_keys:
      cycleMemory?.conversation_keys ?? [],
  }

  // Compromissos e objeções abertas vêm de Cycle Memory — disponíveis
  // mesmo sem Commercial Reading da conversa atual (mandato §9/§29: a
  // oportunidade nunca é apagada só porque a leitura mais recente ainda
  // não existe ou a sessão atual é pessoal).
  const referenceInstant = Date.parse(referenceTime)

  const commitments: AnalysisViewModelCommitment[] =
    (cycleMemory?.commitments ?? [])
      .filter((commitment) => commitment.memory_status === 'active')
      .map((commitment) => ({
        status: commitmentStatusFor({
          commitmentStatus: commitment.commitment_status,
          scheduledAt: commitment.scheduled_at,
          referenceInstant,
          isSameBusinessCalendarDay,
        }),
        summary: commitment.summary,
        scheduled_at: commitment.scheduled_at,
        evidence_message_ids: commitment.evidence_message_ids,
        memory_ids: [commitment.memory_id],
      }))

  const objectionsOpen: AnalysisViewModelObjection[] =
    (cycleMemory?.objections ?? [])
      .filter((objection) => objection.memory_status === 'active')
      .slice(0, MAX_OBJECTIONS)
      .map((objection) => ({
        kind: objection.kind,
        summary: objection.summary,
        evidence_message_ids: objection.evidence_message_ids,
        memory_ids: [objection.memory_id],
      }))

  if (!currentReading) {
    return {
      available: true,
      unavailable_reason: 'no_reading',

      neutral: false,
      neutral_headline: null,
      neutral_description: null,

      opportunity: null,
      current_moment: {
        is_active_session:
          decisionState?.current_moment.is_active_session ?? null,
      },

      risks: [],
      objections_open: objectionsOpen,
      commitments,

      seller_conduct: emptySellerConduct,

      strengths: [],
      improvements: [],

      continuity,
      history: [],

      provenance,
    }
  }

  const reading = currentReading.reading

  const isNeutral =
    reading.commercial_relevance !== 'commercial' ||
    reading.commercial_role !== 'buyer'

  if (isNeutral) {
    const neutralHeadline =
      reading.commercial_relevance === 'uncertain'
        ? 'Ainda não há evidência comercial suficiente.'
        : 'Conversa sem evidência comercial relevante.'

    const neutralDescription =
      reading.commercial_relevance === 'uncertain'
        ? 'Nenhuma leitura de venda será mostrada até o contexto ficar claro.'
        : 'Nenhuma leitura de venda desta conversa é necessária.'

    return {
      available: true,
      unavailable_reason: null,

      neutral: true,
      neutral_headline: neutralHeadline,
      neutral_description: neutralDescription,

      opportunity: null,
      current_moment: {
        is_active_session:
          decisionState?.current_moment.is_active_session ?? null,
      },

      risks: [],
      objections_open: objectionsOpen,
      commitments,

      seller_conduct: emptySellerConduct,

      strengths: [],
      improvements: [],

      continuity,
      history: [],

      provenance,
    }
  }

  const risks: AnalysisViewModelRisk[] = [
    ...reading.risks.customer_objections.map((risk) => ({
      source: 'customer_objection' as const,
      kind: risk.kind,
      severity: risk.severity,
      summary: risk.summary,
      evidence_message_ids: risk.evidence_message_ids,
      memory_ids: risk.memory_ids,
    })),
    ...reading.risks.service_risks.map((risk) => ({
      source: 'service_risk' as const,
      kind: risk.kind,
      severity: risk.severity,
      summary: risk.summary,
      evidence_message_ids: risk.evidence_message_ids,
      memory_ids: risk.memory_ids,
    })),
  ]
    .filter((risk) => risk.severity !== 'low')
    .sort((left, right) => RISK_SEVERITY_RANK[left.severity] - RISK_SEVERITY_RANK[right.severity])
    .slice(0, MAX_RISKS)

  const improvementPoints =
    methodCoaching?.coaching.improvement_points ??
    reading.improvement_points

  const improvements = [
    ...improvementPoints.filter((point) =>
      ALWAYS_URGENT_IMPROVEMENT_KINDS.includes(point.kind),
    ),
    ...improvementPoints.filter(
      (point) => !ALWAYS_URGENT_IMPROVEMENT_KINDS.includes(point.kind),
    ),
  ]
    .slice(0, MAX_IMPROVEMENTS)
    .map(evidenceFromImprovement)

  const strengths =
    (methodCoaching?.coaching.seller_strengths ?? reading.seller_strengths)
      .slice(0, MAX_STRENGTHS)
      .map(evidenceFromStrength)

  const method = methodCoaching?.method

  // `analise_stage` (Method/Coaching) é derivado do MESMO
  // `current_reading` desta chamada — mesmo formato de
  // `current_stage` (step_order/stage_key/name), preferido por
  // consistência com o resto do módulo (prefere a leitura consolidada
  // de Method/Coaching, cai para a leitura crua quando indisponível).
  const currentStage =
    reading.method.current_stage ??
    (method?.analise_stage
      ? {
        step_order: method.analise_stage.step_order,
        stage_key: method.analise_stage.stage_key,
        name: method.analise_stage.name,
      }
      : null)

  return {
    available: true,
    unavailable_reason: null,

    neutral: false,
    neutral_headline: null,
    neutral_description: null,

    opportunity: {
      status: DECISION_TO_OPPORTUNITY_STATUS[reading.best_approach.decision],
      headline: reading.conversation_summary.current_state.summary || null,
      stage_name: currentStage?.name ?? null,
    },

    current_moment: {
      is_active_session:
        decisionState?.current_moment.is_active_session ?? null,
    },

    risks,
    objections_open: objectionsOpen,
    commitments,

    seller_conduct: {
      method: {
        configured:
          method?.configured ?? reading.method.configured,

        name:
          method?.name ?? reading.method.name,

        stages:
          method?.stages ?? reading.method.stages,

        current_stage: currentStage,

        adherence:
          method?.adherence ?? reading.method.adherence,

        recovery_guidance:
          method?.recovery_guidance ?? reading.method.recovery_guidance,
      },

      stage_divergence:
        (method?.stage_comparison_reliable && method.stage_divergence) === true,
    },

    strengths,
    improvements,

    continuity,
    history: reading.commercial_evolution,

    provenance,
  }
}
