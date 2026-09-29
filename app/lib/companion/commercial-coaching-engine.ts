import type {
  CompanionDiagnosticInput,
} from './diagnostic-input'

import type {
  CommercialReading,
  CommercialReadingImprovementPoint,
  CommercialReadingSellerStrength,
} from './commercial-reading-contract'

import type {
  CommercialReasoning,
} from './commercial-reasoning-contract'

import type {
  StatefulCommercialState,
} from './stateful-commercial-state'

import {
  buildSellerExecutionTrace,
  type SellerExecutionActionType,
  type SellerExecutionConfidence,
  type SellerExecutionCustomerIntentKind,
  type SellerExecutionEvent,
  type SellerExecutionCustomerIntent,
  type SellerExecutionTrace,
  type SellerExecutionTurn,
} from './seller-execution-trace'

import {
  buildSellerSequenceMethodAssessment,
} from './seller-sequence-method-assessment'

import {
  buildCommercialTemporalContext,
  formatCommercialDuration,
  type CommercialIntentFreshness,
  type CommercialMomentumState,
  type CommercialReactivationMode,
  type CommercialTemporalContext,
  type CommercialTemporalWaitingOn,
} from './commercial-temporal-context'

import {
  actionFamily,
  buildNegativeExecutionUnits,
  strengthConflictsWithNegativeUnits,
  type CoherenceAdjustment,
  type CommercialActionFamily,
  type NegativeExecutionUnit,
} from './commercial-intelligence-coherence'

export const COMMERCIAL_COACHING_DIAGNOSIS_VERSION =
  'commercial-coaching-diagnosis-v1' as const

export type CommercialCoachingDiagnosisStatus =
  | 'ready'
  | 'limited'
  | 'silent'

// `full`: leitura completa (cliente + condução). `seller_execution_only`:
// o contexto do cliente ainda é incerto, mas a execução observável do
// vendedor tem evidência suficiente para coaching. Pouca certeza sobre o
// cliente NÃO significa ausência de informação sobre a execução.
export type CommercialCoachingScope =
  | 'full'
  | 'seller_execution_only'

export type CommercialCoachingEvidence = {
  summary: string
  why_it_matters: string
  impact: string | null
  how_to_improve: string | null
  evidence_message_ids: string[]
  memory_ids: string[]
  source:
    | 'commercial_reading'
    | 'seller_execution_trace'
}

export type CommercialCoachingFindingKind =
  | 'response_relevance'
  | 'response_timing'
  | 'question_quality'
  | 'context_relevance'
  | 'message_load'
  | 'follow_up'
  | 'momentum'
  | 'closure_respect'
  | 'pressure'
  | 'discovery_timing'

export type CommercialCoachingFinding = {
  kind: CommercialCoachingFindingKind
  title: string
  summary: string
  why_it_matters: string
  how_to_improve: string | null
  evidence_message_ids: string[]
}

export type CommercialCoachingLastMove = {
  message_id: string
  action_type: SellerExecutionActionType
  action_label: string
  commercial_objective: string
  summary: string
  observed_outcome: SellerExecutionEvent[
    'observed_outcome'
  ]
  evidence_message_ids: string[]
}

export type CommercialCoachingTemporalView = {
  evaluated_at: string
  momentum_state:
    CommercialMomentumState
  momentum_label: string
  waiting_on:
    CommercialTemporalWaitingOn
  intent_freshness:
    CommercialIntentFreshness | null
  intent_label: string | null
  reactivation_mode:
    CommercialReactivationMode
  requalify_before_continuing: boolean
  facts: string[]
}

export type CommercialCoachingSynthesis = {
  // 1. Diagnóstico principal da condução (uma leitura, não uma pilha).
  diagnosis: string | null
  // 2. Principal oportunidade de melhoria.
  main_improvement: string | null
  // 3. Próximo aprendizado útil.
  next_learning: string | null
}

export type CommercialCoachingDiagnosis = {
  contract_version:
    typeof COMMERCIAL_COACHING_DIAGNOSIS_VERSION

  status:
    CommercialCoachingDiagnosisStatus

  scope:
    CommercialCoachingScope

  client_context_confidence:
    SellerExecutionConfidence

  seller_execution_confidence:
    SellerExecutionConfidence

  current_commercial_goal:
    string | null

  client_intent_now: {
    kind:
      SellerExecutionCustomerIntent[
        'kind'
      ]
    label: string
    confidence:
      SellerExecutionConfidence
    evidence_message_id: string
    // Histórico != atual: uma intenção demonstrada há semanas continua
    // como evidência, mas não é tratada como atual até ser reconfirmada.
    freshness:
      CommercialIntentFreshness | null
    demonstrated_at: string | null
    is_current: boolean
  } | null

  seller_last_valid_move:
    CommercialCoachingLastMove | null

  seller_strength:
    CommercialCoachingEvidence | null

  seller_mistake:
    CommercialCoachingEvidence | null

  additional_findings:
    CommercialCoachingFinding[]

  sequence_break: {
    happened: boolean
    what_changed: string | null
    why_it_hurts: string | null
    evidence_message_ids: string[]
  }

  method_state: {
    configured: boolean
    current_stage_name: string | null
    recommended_stage_name: string | null
    recommended_stage_reason: string | null
    adherence:
      CommercialReading[
        'method'
      ]['adherence']['status']
    deviation_detected: boolean
    recovery_objective: string | null
    recovery_move: string | null
    // Quando o tempo tornou a intenção incerta, o que "faltou" na última
    // tentativa (ex.: dia/horário) é histórico, não a lacuna atual.
    historical_open_loops: boolean
  }

  chosen_technique: {
    id: string
    title: string
    why_now: string
    risks: string[]
  } | null

  next_action: string | null
  do_not_do: string[]

  temporal:
    CommercialCoachingTemporalView | null

  synthesis:
    CommercialCoachingSynthesis

  coherence: {
    adjustments:
      CoherenceAdjustment[]
  }

  evidence_message_ids: string[]
  memory_ids: string[]
}

const WAITING_FILTERED_IMPROVEMENT_KINDS =
  new Set([
    'unanswered_question',
    'insufficient_discovery',
  ])

function unique(
  values: string[],
): string[] {
  return Array.from(
    new Set(
      values
        .map(value => value.trim())
        .filter(Boolean),
    ),
  )
}

function actionLabel(
  action: SellerExecutionActionType,
): string {
  const labels:
    Record<
      SellerExecutionActionType,
      string
    > = {
      rapport_opening:
        'Abertura e rapport',
      discovery_question:
        'Pergunta de descoberta',
      qualification_question:
        'Pergunta de qualificação',
      clarification_question:
        'Pergunta de esclarecimento',
      factual_response:
        'Resposta factual',
      value_explanation:
        'Explicação de valor',
      product_presentation:
        'Apresentação de solução',
      price_presentation:
        'Apresentação de preço',
      objection_probe:
        'Diagnóstico de objeção',
      objection_response:
        'Resposta à objeção',
      factual_proof:
        'Prova factual',
      commitment_request:
        'Pedido de compromisso',
      scheduling_open_question:
        'Pergunta aberta de agendamento',
      scheduling_guided_choice:
        'Escolha guiada de agendamento',
      follow_up:
        'Follow-up',
      reengagement:
        'Retomada da conversa',
      close_request:
        'Pedido de fechamento',
      confirmation:
        'Confirmação',
      stage_jump_unrelated_offer:
        'Avanço fora de sequência',
      pressure_or_false_urgency:
        'Pressão ou urgência artificial',
      unknown:
        'Ação não classificada',
    }

  return labels[action]
}

function intentLabel(
  intent:
    SellerExecutionCustomerIntent[
      'kind'
    ],
): string {
  const labels:
    Record<
      SellerExecutionCustomerIntent[
        'kind'
      ],
      string
    > = {
      scheduling:
        'Agendamento ou compromisso de agenda',
      close:
        'Fechamento ou contratação',
      payment_objection:
        'Objeção de pagamento',
      objection:
        'Objeção',
      pricing:
        'Preço ou investimento',
      product_interest:
        'Interesse em solução ou oferta',
      third_party_interest:
        'Interesse de terceiro',
      general_interest:
        'Interesse comercial inicial',
      deferral:
        'Adiamento declarado pelo cliente',
      disengaged:
        'Cliente encerrou ou resolveu por outro caminho',
      unknown:
        'Intenção ainda não determinada',
    }

  return labels[intent]
}

function strengthFromReading(
  strength:
    CommercialReadingSellerStrength | undefined,
): CommercialCoachingEvidence | null {
  if (!strength) {
    return null
  }

  return {
    summary:
      strength.summary,
    why_it_matters:
      strength.why_it_matters,
    impact: null,
    how_to_improve: null,
    evidence_message_ids: [
      ...strength.evidence_message_ids,
    ],
    memory_ids: [
      ...strength.memory_ids,
    ],
    source:
      'commercial_reading',
  }
}

function improvementFromReading(
  point:
    CommercialReadingImprovementPoint | undefined,
): CommercialCoachingEvidence | null {
  if (!point) {
    return null
  }

  return {
    summary:
      point.summary,
    why_it_matters:
      point.why_it_matters,
    impact:
      point.impact,
    how_to_improve:
      point.how_to_improve,
    evidence_message_ids: [
      ...point.evidence_message_ids,
    ],
    memory_ids: [
      ...point.memory_ids,
    ],
    source:
      'commercial_reading',
  }
}

function strengthFromTrace(
  event:
    SellerExecutionEvent | null,
): CommercialCoachingEvidence | null {
  if (!event) {
    return null
  }

  const evidence = [
    event.message_id,
  ]

  switch (
    event.action_type
  ) {
    case 'scheduling_open_question':
      return {
        summary:
          'O vendedor identificou que a conversa precisava avançar para um compromisso de agenda.',
        why_it_matters:
          'Transformar interesse em um próximo passo concreto reduz ambiguidade sobre a continuidade da venda.',
        impact: null,
        how_to_improve: null,
        evidence_message_ids:
          evidence,
        memory_ids: [],
        source:
          'seller_execution_trace',
      }

    case 'scheduling_guided_choice':
      return {
        summary:
          'O vendedor estruturou a decisão em alternativas concretas em vez de deixar toda a escolha aberta.',
        why_it_matters:
          'Uma escolha simples pode reduzir esforço decisório quando as opções são reais e continuam válidas.',
        impact: null,
        how_to_improve: null,
        evidence_message_ids:
          evidence,
        memory_ids: [],
        source:
          'seller_execution_trace',
      }

    case 'objection_probe':
      return {
        summary:
          'O vendedor investigou a causa da objeção antes de prescrever uma resposta.',
        why_it_matters:
          'Diagnosticar a restrição real evita responder ao sintoma errado.',
        impact: null,
        how_to_improve: null,
        evidence_message_ids:
          evidence,
        memory_ids: [],
        source:
          'seller_execution_trace',
      }

    case 'reengagement':
      return {
        summary:
          'O vendedor retomou a conversa reconhecendo o contexto anterior em vez de recomeçar do zero.',
        why_it_matters:
          'Retomar pelo que o cliente já trouxe reduz esforço de resposta e mostra leitura do histórico.',
        impact: null,
        how_to_improve: null,
        evidence_message_ids:
          evidence,
        memory_ids: [],
        source:
          'seller_execution_trace',
      }

    case 'discovery_question':
      return {
        summary:
          'O vendedor buscou contexto antes de avançar para uma recomendação.',
        why_it_matters:
          'Descoberta útil melhora a adequação da solução e reduz apresentação genérica.',
        impact: null,
        how_to_improve: null,
        evidence_message_ids:
          evidence,
        memory_ids: [],
        source:
          'seller_execution_trace',
      }

    default:
      return null
  }
}

function intentObjectivePhrase(
  kind:
    SellerExecutionCustomerIntentKind | null | undefined,
): string {
  switch (kind) {
    case 'scheduling':
      return 'agendar o próximo passo'
    case 'close':
      return 'fechar'
    case 'pricing':
      return 'entender valores'
    case 'payment_objection':
      return 'resolver a dúvida de pagamento'
    case 'objection':
      return 'tratar a objeção'
    case 'product_interest':
      return 'entender a solução'
    case 'third_party_interest':
      return 'encaminhar o interesse de outra pessoa'
    default:
      return 'avançar no que havia pedido'
  }
}

type TraceMistake = {
  evidence: CommercialCoachingEvidence
  unit_kind:
    NegativeExecutionUnit['kind']
  seller_message_ids: string[]
  families: CommercialActionFamily[]
}

function eventsOfUnit(
  trace: SellerExecutionTrace,
  unit: NegativeExecutionUnit,
): SellerExecutionEvent[] {
  const ids =
    new Set(
      unit.seller_message_ids,
    )

  return trace.events.filter(
    event =>
      ids.has(event.message_id),
  )
}

function dominantOf(
  events: SellerExecutionEvent[],
): SellerExecutionActionType {
  const priority:
    SellerExecutionActionType[] = [
      'close_request',
      'price_presentation',
      'product_presentation',
      'stage_jump_unrelated_offer',
      'pressure_or_false_urgency',
      'scheduling_guided_choice',
      'scheduling_open_question',
      'discovery_question',
      'reengagement',
    ]

  return (
    priority.find(
      action =>
        events.some(
          event =>
            event.action_type ===
              action,
        ),
    ) ??
    events[events.length - 1]
      ?.action_type ??
    'unknown'
  )
}

function mistakeEvidenceIds(
  events: SellerExecutionEvent[],
): string[] {
  return unique(
    events.flatMap(
      event => [
        event
          .customer_intent_before_action
          ?.evidence_message_id ??
          '',
        event.message_id,
      ],
    ),
  )
}

function mistakeFromTrace({
  trace,
  units,
  temporal,
}: {
  trace: SellerExecutionTrace
  units: NegativeExecutionUnit[]
  temporal:
    CommercialTemporalContext | null
}): TraceMistake | null {
  const latestUnit = (
    kind: NegativeExecutionUnit['kind'],
  ) =>
    [...units]
      .reverse()
      .find(
        unit =>
          unit.kind === kind,
      ) ?? null

  const requalify =
    Boolean(
      temporal?.reactivation
        .requalify_before_continuing,
    )

  const lateDiscovery =
    latestUnit('late_discovery')

  if (lateDiscovery) {
    const events =
      eventsOfUnit(
        trace,
        lateDiscovery,
      )

    return {
      evidence: {
        summary:
          'O vendedor continuou descobrindo depois de o cliente já demonstrar intenção explícita de avançar.',
        why_it_matters:
          'Descoberta adicional sem necessidade pode criar atrito justamente quando a conversa já pede execução do próximo passo.',
        impact:
          'A venda pode perder ritmo e fazer o cliente repetir uma decisão que já havia sinalizado.',
        how_to_improve:
          'Responder ao pedido operacional atual e avançar o compromisso; só voltar à descoberta se surgir uma lacuna que realmente impeça o fechamento.',
        evidence_message_ids:
          mistakeEvidenceIds(events),
        memory_ids: [],
        source:
          'seller_execution_trace',
      },
      unit_kind:
        'late_discovery',
      seller_message_ids:
        lateDiscovery
          .seller_message_ids,
      families:
        lateDiscovery.families,
    }
  }

  const sequenceBreak =
    latestUnit('sequence_break')

  if (sequenceBreak) {
    const events =
      eventsOfUnit(
        trace,
        sequenceBreak,
      )

    const dominant =
      dominantOf(events)

    const intentKind =
      events[0]
        ?.customer_intent_before_action
        ?.kind

    const abandonedPendingQuestion =
      events.some(
        event =>
          event.signals.includes(
            'premature_product_offer',
          ),
      )

    return {
      evidence: {
        summary:
          `A condução saiu do objetivo comercial que o cliente havia demonstrado (${intentObjectivePhrase(intentKind)}) e passou para ${actionLabel(dominant).toLowerCase()} antes de concluir esse próximo passo${abandonedPendingQuestion ? ', com a pergunta anterior ainda sem resposta' : ''}.`,
        why_it_matters:
          'Mudar de objetivo sem fato novo aumenta fricção e enfraquece a continuidade da conversa.',
        impact:
          'O cliente pode precisar reconstruir contexto ou abandonar uma intenção que já estava ativa.',
        how_to_improve:
          requalify
            ? 'Na retomada, primeiro reconfirmar se o interesse do cliente continua; depois concluir esse compromisso antes de apresentar uma etapa diferente.'
            : 'Retomar o objetivo ativo do cliente e concluir esse compromisso antes de apresentar uma etapa diferente.',
        evidence_message_ids:
          mistakeEvidenceIds(events),
        memory_ids: [],
        source:
          'seller_execution_trace',
      },
      unit_kind:
        'sequence_break',
      seller_message_ids:
        sequenceBreak
          .seller_message_ids,
      families:
        sequenceBreak.families,
    }
  }

  const premature =
    latestUnit('premature_offer')

  if (premature) {
    const events =
      eventsOfUnit(
        trace,
        premature,
      )

    return {
      evidence: {
        summary:
          'Produto, solução ou preço foi apresentado antes de o contexto necessário estar suficientemente estabelecido.',
        why_it_matters:
          'Prescrever cedo demais reduz a personalização e pode deslocar a conversa para comparação de oferta antes de existir critério de decisão.',
        impact:
          'A recomendação tende a parecer genérica ou prematura.',
        how_to_improve:
          'Fazer a descoberta mínima que altera a recomendação e só então conectar a solução ao contexto comprovado.',
        evidence_message_ids:
          mistakeEvidenceIds(events),
        memory_ids: [],
        source:
          'seller_execution_trace',
      },
      unit_kind:
        'premature_offer',
      seller_message_ids:
        premature
          .seller_message_ids,
      families:
        premature.families,
    }
  }

  const notAddressed =
    [...units]
      .reverse()
      .find(
        unit =>
          unit.kind ===
            'request_not_addressed',
      ) ?? null

  if (notAddressed) {
    const turn =
      trace.turns.find(
        item =>
          item.turn_id ===
            notAddressed.turn_id,
      )

    const latency =
      turn?.response_latency_ms ??
      null

    const slow =
      latency !== null &&
      latency > 60 * 60 * 1000

    return {
      evidence: {
        summary:
          slow
            ? `O cliente fez um pedido comercial claro e a resposta veio ${formatCommercialDuration(latency)} depois sem tratar esse pedido.`
            : 'O cliente fez um pedido comercial claro e a resposta do vendedor não tratou esse pedido.',
        why_it_matters:
          'Pedido com intenção clara é o momento de maior disposição do cliente; responder sem endereçá-lo desperdiça esse momentum.',
        impact:
          'O cliente precisa repetir o pedido ou perde o interesse enquanto espera.',
        how_to_improve:
          'Responder primeiro exatamente ao que o cliente pediu e, na mesma mensagem, propor o próximo passo concreto.',
        evidence_message_ids:
          unique([
            ...(turn
              ?.responds_to_customer_message_ids ??
              []),
            ...notAddressed
              .seller_message_ids,
          ]),
        memory_ids: [],
        source:
          'seller_execution_trace',
      },
      unit_kind:
        'request_not_addressed',
      seller_message_ids:
        notAddressed
          .seller_message_ids,
      families:
        notAddressed.families,
    }
  }

  const duplicate =
    latestUnit('duplicate_followup')

  if (duplicate) {
    const events =
      eventsOfUnit(
        trace,
        duplicate,
      )

    return {
      evidence: {
        summary:
          'A mesma ação comercial foi repetida sem resposta ou fato novo entre as tentativas.',
        why_it_matters:
          'Repetição sem nova informação gera pressão e transmite pouca leitura do histórico.',
        impact:
          'O contato pode perceber automação ou insistência desnecessária.',
        how_to_improve:
          'Preservar a ação já executada e esperar a resposta, salvo se um novo fato justificar outra abordagem.',
        evidence_message_ids:
          mistakeEvidenceIds(events),
        memory_ids: [],
        source:
          'seller_execution_trace',
      },
      unit_kind:
        'duplicate_followup',
      seller_message_ids:
        duplicate
          .seller_message_ids,
      families:
        duplicate.families,
    }
  }

  const pushAfterClosure =
    latestUnit(
      'push_after_closure',
    )

  if (pushAfterClosure) {
    return {
      evidence: {
        summary:
          'O vendedor voltou a oferecer ou cobrar depois de o cliente declarar que encerrou ou resolveu por outro caminho.',
        why_it_matters:
          'Insistir depois de uma decisão explícita transmite pressão e desgasta a relação para oportunidades futuras.',
        impact:
          'O cliente tende a bloquear novos contatos.',
        how_to_improve:
          'Respeitar a decisão: agradecer, deixar a porta aberta e não reenviar oferta.',
        evidence_message_ids: [
          ...pushAfterClosure
            .seller_message_ids,
        ],
        memory_ids: [],
        source:
          'seller_execution_trace',
      },
      unit_kind:
        'push_after_closure',
      seller_message_ids:
        pushAfterClosure
          .seller_message_ids,
      families:
        pushAfterClosure.families,
    }
  }

  return null
}

function readingImprovementFindingKind(
  kind:
    CommercialReadingImprovementPoint['kind'] | null,
): CommercialCoachingFindingKind | null {
  switch (kind) {
    case 'unanswered_question':
      return 'response_relevance'
    case 'premature_price':
    case 'premature_presentation':
      return 'context_relevance'
    case 'interrogation':
      return 'question_quality'
    case 'repetition':
      return 'follow_up'
    case 'pressure':
      return 'pressure'
    default:
      return null
  }
}

function buildAdditionalCoachingFindings({
  trace,
  units,
  temporal,
  primaryMistake,
  primaryMistakeMessageIds,
  primaryMistakeKind,
  primaryReadingImprovement,
}: {
  trace: SellerExecutionTrace
  units: NegativeExecutionUnit[]
  temporal:
    CommercialTemporalContext | null
  primaryMistake:
    CommercialCoachingEvidence | null
  primaryMistakeMessageIds: string[]
  primaryMistakeKind:
    NegativeExecutionUnit['kind'] | null
  primaryReadingImprovement:
    CommercialReadingImprovementPoint | null
}): CommercialCoachingFinding[] {
  const candidates:
    CommercialCoachingFinding[] = []

  const primaryText =
    primaryMistake
      ? normalizedCoachingText(
          `${primaryMistake.summary} ${primaryMistake.why_it_matters}`,
        )
      : ''

  const primaryIds =
    new Set(
      primaryMistakeMessageIds,
    )

  const primaryReadingFindingKind =
    readingImprovementFindingKind(
      primaryReadingImprovement
        ?.kind ?? null,
    )

  const primaryReadingEvidence =
    new Set(
      primaryReadingImprovement
        ?.evidence_message_ids ??
      [],
    )

  const reversed = [
    ...trace.events,
  ].reverse()

  const latestUnit = (
    kind: NegativeExecutionUnit['kind'],
  ) =>
    [...units]
      .reverse()
      .find(
        unit =>
          unit.kind === kind,
      ) ?? null

  // Mesma ação já coberta pelo principal ajuste não vira "outro
  // aprendizado" com outra redação (ex.: quebra de sequência e oferta
  // prematura sobre a MESMA oferta).
  const coveredByPrimary = (
    ids: readonly string[],
  ) =>
    ids.length > 0 &&
    ids.every(
      id =>
        primaryIds.has(id),
    )

  // Timing do pedido de alta intenção (latência + conteúdo).
  const highIntent =
    temporal?.seller_timing
      .high_intent_request ??
    null

  const slowUnit =
    latestUnit(
      'slow_high_intent_response',
    )

  let timingCoversTurnId:
    string | null =
      null

  if (
    highIntent &&
    slowUnit &&
    primaryMistakeKind !==
      'request_not_addressed'
  ) {
    const firstLatency =
      highIntent
        .first_response_latency_ms

    const effectiveLatency =
      highIntent
        .effective_response_latency_ms

    const timeSensitive =
      highIntent.time_reference !==
        null

    const parts: string[] = []

    if (
      firstLatency !== null
    ) {
      parts.push(
        highIntent
          .first_response_addressed ===
          false
          ? `a primeira resposta veio ${formatCommercialDuration(firstLatency)} depois e não tratou o pedido`
          : `a primeira resposta levou ${formatCommercialDuration(firstLatency)}`,
      )
    }

    if (
      effectiveLatency !== null &&
      highIntent
        .effective_response_message_id !==
        highIntent
          .first_response_message_id
    ) {
      parts.push(
        `o pedido só foi efetivamente tratado ${formatCommercialDuration(effectiveLatency)} depois`,
      )
    }

    candidates.push({
      kind:
        'response_timing',
      title:
        'Tempo de resposta a um pedido de alta intenção',
      summary:
        `${timeSensitive ? 'O pedido do cliente tinha urgência temporal' : 'O cliente fez um pedido de alta intenção'}: ${parts.join('; ')}.`,
      why_it_matters:
        'Intenção alta é perecível: cada hora sem resposta efetiva reduz o momentum e aumenta a chance de o cliente esfriar ou procurar outra opção.',
      how_to_improve:
        'Responder a pedidos de alta intenção o quanto antes e já tratando o pedido — uma saudação sozinha não conta como resposta.',
      evidence_message_ids:
        unique([
          highIntent
            .customer_message_id,
          ...slowUnit
            .seller_message_ids,
        ]),
    })

    timingCoversTurnId =
      slowUnit.turn_id
  }

  const notAddressed =
    latestUnit(
      'request_not_addressed',
    )

  if (
    notAddressed &&
    notAddressed.turn_id !==
      timingCoversTurnId &&
    primaryMistakeKind !==
      'request_not_addressed'
  ) {
    candidates.push({
      kind:
        'response_relevance',
      title:
        'Resposta ao que o cliente pediu',
      summary:
        'A resposta do vendedor não endereçou diretamente o pedido comercial que estava ativo naquele momento.',
      why_it_matters:
        'Quando o cliente já sinalizou uma intenção concreta, responder sem avançar esse pedido pode desperdiçar momentum e obrigar o cliente a repetir o que precisa.',
      how_to_improve:
        'Responder primeiro ao pedido atual do cliente e só depois acrescentar contexto ou condução adicional.',
      evidence_message_ids: [
        ...notAddressed
          .seller_message_ids,
      ],
    })
  }

  const lowRelevanceResponse =
    reversed.find(
      event =>
        event.action_type ===
          'factual_response' &&
        event.quality.relevance ===
          'low' &&
        !event.sequence
          .breaks_active_customer_goal,
    )

  if (lowRelevanceResponse) {
    candidates.push({
      kind:
        'response_relevance',
      title:
        'Resposta ao que o cliente pediu',
      summary:
        'A resposta do vendedor não endereçou diretamente o pedido comercial que estava ativo naquele momento.',
      why_it_matters:
        'Quando o cliente já sinalizou uma intenção concreta, responder sem avançar esse pedido pode desperdiçar momentum e obrigar o cliente a repetir o que precisa.',
      how_to_improve:
        'Responder primeiro ao pedido atual do cliente e só depois acrescentar contexto ou condução adicional.',
      evidence_message_ids: [
        ...lowRelevanceResponse
          .evidence_message_ids,
      ],
    })
  }

  const openSchedulingQuestion =
    reversed.find(
      event =>
        event.action_type ===
          'scheduling_open_question' &&
        event.quality
          .question_quality ===
          'open',
    )

  if (openSchedulingQuestion) {
    candidates.push({
      kind:
        'question_quality',
      title:
        'Qualidade da pergunta',
      summary:
        'A intenção de avançar para o agendamento foi correta, mas a pergunta deixou a decisão ampla demais para o cliente.',
      why_it_matters:
        'Pedir dia e horário de forma totalmente aberta aumenta o esforço de resposta e pode reduzir a continuidade mesmo quando existe interesse.',
      how_to_improve:
        'Quando houver opções reais disponíveis, estreite a decisão com poucas alternativas. Se ainda não houver disponibilidade conhecida, peça primeiro um microcompromisso menor.',
      evidence_message_ids: [
        ...openSchedulingQuestion
          .evidence_message_ids,
      ],
    })
  }

  // Momentum: tentativas seguidas sem resposta no mesmo formato.
  if (
    temporal &&
    temporal.reactivation
      .outbound_unanswered_turns >= 2 &&
    (
      temporal.momentum.state ===
        'dormant' ||
      temporal.momentum.state ===
        'cooling'
    )
  ) {
    const unansweredTurns =
      trace.turns.slice(
        -temporal.reactivation
          .outbound_unanswered_turns,
      )

    const lastTurn =
      unansweredTurns[
        unansweredTurns.length - 1
      ]

    const pushedOffer =
      lastTurn?.action_types.some(
        action =>
          actionFamily(action) ===
            'presentation',
      ) ?? false

    candidates.push({
      kind:
        'momentum',
      title:
        'Continuidade da oportunidade',
      summary:
        pushedOffer
          ? `Depois de ${temporal.reactivation.outbound_unanswered_turns} tentativas sem resposta, a última abordagem foi uma oferta em vez de reconfirmar se o interesse do cliente continuava.`
          : `Houve ${temporal.reactivation.outbound_unanswered_turns} tentativas seguidas sem resposta sem mudar a forma de retomar a conversa.`,
      why_it_matters:
        'Quando o cliente para de responder, repetir o mesmo formato tende a ser ignorado; o que recupera a conversa é reconfirmar o interesse com uma pergunta fácil de responder.',
      how_to_improve:
        'Antes de enviar oferta ou nova cobrança, retome o que o cliente queria e pergunte como está esse interesse hoje.',
      evidence_message_ids:
        unique(
          unansweredTurns.flatMap(
            turn =>
              turn.message_ids,
          ),
        ),
    })
  }

  const closureUnit =
    latestUnit(
      'push_after_closure',
    )

  if (
    closureUnit &&
    primaryMistakeKind !==
      'push_after_closure'
  ) {
    candidates.push({
      kind:
        'closure_respect',
      title:
        'Respeito à decisão do cliente',
      summary:
        'Houve nova oferta ou cobrança depois de o cliente dizer que encerrou ou resolveu por outro caminho.',
      why_it_matters:
        'Insistir depois de uma decisão explícita desgasta a relação.',
      how_to_improve:
        'Agradecer, respeitar a decisão e deixar a porta aberta sem reenviar oferta.',
      evidence_message_ids: [
        ...closureUnit
          .seller_message_ids,
      ],
    })
  }

  const prematureOffer =
    latestUnit('premature_offer')

  if (
    prematureOffer &&
    !/oferta|produto|preco|solucao/
      .test(
        primaryText,
      )
  ) {
    candidates.push({
      kind:
        'context_relevance',
      title:
        'Relevância da oferta',
      summary:
        'Uma oferta de produto entrou antes de o compromisso anterior da conversa estar resolvido.',
      why_it_matters:
        'Adicionar uma nova decisão enquanto o cliente ainda não concluiu a anterior aumenta carga cognitiva e enfraquece a continuidade.',
      how_to_improve:
        'Conclua ou recupere o objetivo já aberto antes de introduzir uma nova oferta, salvo quando o próprio cliente trouxer um fato novo.',
      evidence_message_ids: [
        ...prematureOffer
          .seller_message_ids,
      ],
    })
  }

  const overloaded =
    reversed.find(
      event =>
        event.signals.includes(
          'seller_message_overloaded',
        ),
    )

  if (overloaded) {
    candidates.push({
      kind:
        'message_load',
      title:
        'Carga da mensagem',
      summary:
        'A mensagem concentrou informação demais para um único movimento comercial.',
      why_it_matters:
        'Misturar muitos argumentos e decisões reduz clareza sobre o que o cliente precisa fazer em seguida.',
      how_to_improve:
        'Escolha um objetivo por mensagem e deixe o próximo passo explícito.',
      evidence_message_ids: [
        ...overloaded
          .evidence_message_ids,
      ],
    })
  }

  const duplicate =
    latestUnit(
      'duplicate_followup',
    )

  if (
    duplicate &&
    primaryMistakeKind !==
      'duplicate_followup'
  ) {
    candidates.push({
      kind:
        'follow_up',
      title:
        'Qualidade do follow-up',
      summary:
        'A mesma ação comercial foi repetida sem resposta ou fato novo entre as tentativas.',
      why_it_matters:
        'Repetição sem mudança de contexto pode parecer insistência e mostra pouca adaptação ao histórico.',
      how_to_improve:
        'Mude a abordagem somente quando existir um novo fato, ou preserve o último pedido e dê espaço quando a ação correta já foi executada.',
      evidence_message_ids: [
        ...duplicate
          .seller_message_ids,
      ],
    })
  }

  const lateDiscovery =
    latestUnit(
      'late_discovery',
    )

  if (
    lateDiscovery &&
    primaryMistakeKind !==
      'late_discovery'
  ) {
    candidates.push({
      kind:
        'discovery_timing',
      title:
        'Timing da descoberta',
      summary:
        'A conversa voltou para descoberta depois de o cliente já demonstrar intenção explícita de avançar.',
      why_it_matters:
        'Perguntar além do necessário nesse momento pode criar fricção e desacelerar uma decisão que já estava madura.',
      how_to_improve:
        'Execute o próximo passo pedido pelo cliente e só reabra descoberta se surgir uma lacuna que realmente bloqueie a decisão.',
      evidence_message_ids: [
        ...lateDiscovery
          .seller_message_ids,
      ],
    })
  }

  const pressure =
    reversed.find(
      event =>
        event.quality
          .pressure_risk ===
          'high' ||
        event.quality
          .pressure_risk ===
          'medium',
    )

  if (pressure) {
    candidates.push({
      kind:
        'pressure',
      title:
        'Pressão comercial',
      summary:
        'A abordagem contém sinais de pressão ou urgência que precisam ser sustentados por fatos reais.',
      why_it_matters:
        'Pressão sem base pode reduzir confiança e induzir uma decisão em vez de facilitar uma decisão.',
      how_to_improve:
        'Use urgência somente quando ela for factual e mantenha a autonomia do cliente.',
      evidence_message_ids: [
        ...pressure
          .evidence_message_ids,
      ],
    })
  }

  const findings:
    CommercialCoachingFinding[] = []

  const seenKinds =
    new Set<
      CommercialCoachingFindingKind
    >()

  for (const finding of candidates) {
    if (
      seenKinds.has(
        finding.kind,
      )
    ) {
      continue
    }

    const overlapsPrimaryReading =
      primaryReadingFindingKind ===
        finding.kind &&
      finding.evidence_message_ids
        .some(
          id =>
            primaryReadingEvidence
              .has(id),
        )

    if (overlapsPrimaryReading) {
      continue
    }

    const sellerIds =
      finding.evidence_message_ids
        .filter(
          id =>
            trace.events.some(
              event =>
                event.message_id ===
                  id,
            ),
        )

    // A mesma ação já explicada no principal ajuste não é repetida com
    // outra redação — exceto aprendizados de natureza distinta sobre ela
    // (carga da mensagem, pressão).
    if (
      finding.kind !==
        'message_load' &&
      finding.kind !==
        'pressure' &&
      finding.kind !==
        'momentum' &&
      coveredByPrimary(sellerIds)
    ) {
      continue
    }

    const normalized =
      normalizedCoachingText(
        `${finding.summary} ${finding.why_it_matters}`,
      )

    if (
      primaryText &&
      (
        normalized ===
          primaryText ||
        (
          normalized.includes(
            primaryText,
          ) &&
          primaryText.length > 40
        ) ||
        (
          primaryText.includes(
            normalized,
          ) &&
          normalized.length > 40
        )
      )
    ) {
      continue
    }

    seenKinds.add(
      finding.kind,
    )
    findings.push(
      finding,
    )
  }

  return findings.slice(
    0,
    3,
  )
}

function lastValidMove(
  trace: SellerExecutionTrace,
): SellerExecutionEvent | null {
  const events = [
    ...trace.events,
  ].reverse()

  return (
    events.find(
      event =>
        !event.sequence
          .breaks_active_customer_goal &&
        event.quality.relevance !==
          'low' &&
        event.action_type !==
          'rapport_opening' &&
        event.action_type !==
          'confirmation',
    ) ??
    events.find(
      event =>
        !event.sequence
          .breaks_active_customer_goal &&
        event.quality.relevance !==
          'low',
    ) ??
    events[0] ??
    null
  )
}

function normalizedCoachingText(
  value: string,
): string {
  return value
    .normalize('NFD')
    .replace(
      /[̀-ͯ]/g,
      '',
    )
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      ' ',
    )
    .replace(
      /\s+/g,
      ' ',
    )
    .trim()
}

const COMMERCIAL_CUSTOMER_KINDS =
  new Set<SellerExecutionCustomerIntentKind>([
    'scheduling',
    'close',
    'payment_objection',
    'objection',
    'pricing',
    'product_interest',
    'third_party_interest',
  ])

const COMMERCIAL_SELLER_ACTIONS =
  new Set<SellerExecutionActionType>([
    'scheduling_open_question',
    'scheduling_guided_choice',
    'product_presentation',
    'price_presentation',
    'close_request',
    'discovery_question',
    'qualification_question',
    'objection_probe',
    'objection_response',
    'commitment_request',
    'reengagement',
  ])

function cycleHasActiveCommercialMemory(
  state:
    StatefulCommercialState | null,
): boolean {
  if (!state) {
    return false
  }

  return [
    ...state.needs,
    ...state.open_loops,
    ...state.objections,
    ...state.commitments,
  ].some(
    item =>
      item.memory_status ===
        'active',
  )
}

// Separa CLIENT CONTEXT CONFIDENCE de SELLER EXECUTION CONFIDENCE: quando a
// leitura do momento ficou neutralizada por incerteza, o coaching da
// execução observável do vendedor continua válido se houver evidência
// comercial determinística suficiente na conversa. Conversa realmente
// pessoal (sem sinal comercial nenhum) continua neutra.
export function sellerExecutionCoachingAvailable({
  reading,
  trace,
  cycle_state = null,
}: {
  reading: CommercialReading
  trace: SellerExecutionTrace
  cycle_state?:
    StatefulCommercialState | null
}): boolean {
  if (
    reading.commercial_role ===
      'provider' ||
    trace.events.length === 0
  ) {
    return false
  }

  const strongCustomerSignal =
    trace.customer_signals.some(
      signal =>
        COMMERCIAL_CUSTOMER_KINDS.has(
          signal.kind,
        ) &&
        signal.confidence ===
          'high',
    )

  const customerSignal =
    trace.customer_signals.some(
      signal =>
        COMMERCIAL_CUSTOMER_KINDS.has(
          signal.kind,
        ) &&
        signal.confidence !==
          'low',
    )

  const commercialTurns =
    trace.turns.filter(
      turn =>
        turn.action_types.some(
          action =>
            COMMERCIAL_SELLER_ACTIONS.has(
              action,
            ),
        ),
    ).length

  const evidence =
    strongCustomerSignal ||
    (
      customerSignal &&
      commercialTurns >= 1
    ) ||
    commercialTurns >= 2

  if (!evidence) {
    return false
  }

  if (
    reading.commercial_relevance ===
      'uncertain'
  ) {
    return true
  }

  // "non_commercial" descreve a sessão atual. Só a execução do ciclo com
  // memória comercial ativa e evidência determinística sustenta coaching.
  return (
    reading.commercial_relevance ===
      'non_commercial' &&
    cycleHasActiveCommercialMemory(
      cycle_state,
    )
  )
}

function temporalView(
  temporal:
    CommercialTemporalContext | null,
): CommercialCoachingTemporalView | null {
  if (!temporal) {
    return null
  }

  return {
    evaluated_at:
      temporal.evaluated_at,
    momentum_state:
      temporal.momentum.state,
    momentum_label:
      temporal.narrative
        .momentum_label,
    waiting_on:
      temporal.momentum
        .waiting_on,
    intent_freshness:
      temporal.intent
        ?.freshness ??
      null,
    intent_label:
      temporal.narrative
        .intent_label,
    reactivation_mode:
      temporal.reactivation.mode,
    requalify_before_continuing:
      temporal.reactivation
        .requalify_before_continuing,
    facts: [
      ...temporal.narrative.facts,
    ],
  }
}

function buildSynthesis({
  scope,
  intent,
  temporal,
  mistake,
  findings,
  strength,
  nextAction,
}: {
  scope: CommercialCoachingScope
  intent:
    CommercialCoachingDiagnosis['client_intent_now']
  temporal:
    CommercialTemporalContext | null
  mistake:
    CommercialCoachingEvidence | null
  findings:
    CommercialCoachingFinding[]
  strength:
    CommercialCoachingEvidence | null
  nextAction: string | null
}): CommercialCoachingSynthesis {
  const pieces: string[] = []

  if (
    scope ===
      'seller_execution_only'
  ) {
    pieces.push(
      'O contexto do cliente ainda é incerto; esta leitura avalia apenas a execução observável do vendedor.',
    )
  }

  const timing =
    findings.find(
      finding =>
        finding.kind ===
          'response_timing',
    )

  if (mistake) {
    pieces.push(
      mistake.summary,
    )
  } else if (strength) {
    pieces.push(
      `Condução sem erro estrutural comprovado: ${strength.summary.charAt(0).toLowerCase()}${strength.summary.slice(1)}`,
    )
  }

  if (
    timing &&
    !pieces.some(
      piece =>
        piece === timing.summary,
    )
  ) {
    pieces.push(
      timing.summary,
    )
  }

  if (
    temporal &&
    (
      temporal.momentum.state ===
        'dormant' ||
      temporal.momentum.state ===
        'cooling' ||
      temporal.momentum.state ===
        'closed'
    )
  ) {
    const momentum =
      temporal.momentum.state ===
        'closed'
        ? 'Hoje o cliente já encerrou esta oportunidade.'
        : temporal.reactivation
            .requalify_before_continuing
          ? `Hoje: ${temporal.narrative.momentum_label.toLowerCase()} — o interesse atual precisa ser reconfirmado antes de retomar o passo antigo.`
          : `Hoje: ${temporal.narrative.momentum_label.toLowerCase()}.`

    pieces.push(momentum)
  } else if (
    intent &&
    !intent.is_current &&
    intent.freshness === 'aging'
  ) {
    pieces.push(
      'A intenção do cliente ainda não foi reconfirmada desde a última conversa.',
    )
  }

  const nextFinding =
    findings.find(
      finding =>
        finding.kind !==
          'response_timing' &&
        finding.how_to_improve,
    ) ??
    timing ??
    null

  return {
    diagnosis:
      pieces.length > 0
        ? pieces.join(' ')
        : null,
    main_improvement:
      mistake?.how_to_improve ??
      null,
    next_learning:
      nextFinding?.how_to_improve ??
      (
        scope ===
          'seller_execution_only'
          ? null
          : nextAction
      ),
  }
}

function recommendedMethodStage(
  reading: CommercialReading,
  diagnosticInput:
    CompanionDiagnosticInput,
  sequenceBreakDetected: boolean,
): {
  name: string | null
  reason: string | null
} {
  const deviationOrder =
    reading.method.adherence
      .deviation_stage_order

  const methodSteps =
    diagnosticInput
      .commercial_context
      .sales_method
      .steps

  const requiredOrders =
    new Set(
      methodSteps
        .filter(
          step =>
            step.is_required,
        )
        .map(
          step =>
            step.step_order,
        ),
    )

  const currentStageOrder =
    reading.method
      .current_stage
      ?.step_order ??
    null

  const requiredPartialBlocker =
    sequenceBreakDetected &&
    currentStageOrder !== null
      ? [...reading.method.stages]
          .filter(
            stage =>
              stage.step_order <
                currentStageOrder &&
              stage.status ===
                'partial' &&
              requiredOrders.has(
                stage.step_order,
              ),
          )
          .sort(
            (left, right) =>
              left.step_order -
              right.step_order,
          )[0]
      : undefined

  if (
    requiredPartialBlocker &&
    (
      typeof deviationOrder !==
        'number' ||
      requiredPartialBlocker
        .step_order <=
        deviationOrder
    )
  ) {
    return {
      name:
        requiredPartialBlocker.name,
      reason:
        reading.method
          .recovery_guidance
          ?.objective ??
        `A etapa obrigatória ${requiredPartialBlocker.name} já possui progresso, mas ainda não foi concluída; o método não deve tratá-la como resolvida só porque a execução avançou.`,
    }
  }

  if (
    typeof deviationOrder ===
      'number' &&
    Number.isSafeInteger(
      deviationOrder,
    )
  ) {
    const deviationStage =
      reading.method.stages
        .find(
          stage =>
            stage.step_order ===
            deviationOrder,
        )

    if (deviationStage) {
      return {
        name:
          deviationStage.name,
        reason:
          reading.method
            .recovery_guidance
            ?.objective ??
          reading.method.adherence
            .why_it_matters ??
          'Retomar a etapa em que a sequência perdeu aderência antes de avançar novamente.',
      }
    }
  }

  if (
    sequenceBreakDetected &&
    reading.method.current_stage
  ) {
    const earlierIncomplete =
      [...reading.method.stages]
        .filter(
          stage =>
            stage.step_order <
              reading.method
                .current_stage!
                .step_order &&
            (
              stage.status ===
                'partial' ||
              stage.status ===
                'not_started'
            ),
        )

    const requiredBlocker =
      earlierIncomplete
        .filter(
          stage =>
            requiredOrders.has(
              stage.step_order,
            ),
        )
        .sort(
          (left, right) => {
            const leftPriority =
              left.status ===
                'partial'
                ? 0
                : 1
            const rightPriority =
              right.status ===
                'partial'
                ? 0
                : 1

            return (
              leftPriority -
                rightPriority ||
              left.step_order -
                right.step_order
            )
          },
        )[0]

    const evidenceBackedBlocker =
      earlierIncomplete
        .filter(
          stage =>
            stage.status ===
              'partial',
        )
        .sort(
          (left, right) =>
            left.step_order -
            right.step_order,
        )[0]

    const earlierIncompleteStage =
      requiredBlocker ??
      evidenceBackedBlocker ??
      earlierIncomplete
        .sort(
          (left, right) =>
            left.step_order -
            right.step_order,
        )[0]

    if (earlierIncompleteStage) {
      const isRequired =
        requiredOrders.has(
          earlierIncompleteStage
            .step_order,
        )

      return {
        name:
          earlierIncompleteStage.name,
        reason:
          reading.method
            .recovery_guidance
            ?.objective ??
          (
            isRequired
              ? `A etapa obrigatória ${earlierIncompleteStage.name} ainda não foi concluída; avançar em ${reading.method.current_stage.name} sem resolver esse bloqueio enfraquece o método.`
              : `A execução avançou para ${reading.method.current_stage.name} enquanto ${earlierIncompleteStage.name} ainda estava parcialmente resolvida.`
          ),
      }
    }
  }

  return {
    name:
      reading.method
        .current_stage
        ?.name ??
      null,
    reason:
      reading.method
        .recovery_guidance
        ?.objective ??
      null,
  }
}

function firstReadingImprovement({
  reading,
  waitingForCustomer,
  customerFactAfterAction,
}: {
  reading: CommercialReading
  waitingForCustomer: boolean
  customerFactAfterAction: boolean
}):
  | CommercialReadingImprovementPoint
  | undefined {
  if (waitingForCustomer) {
    return reading
      .improvement_points
      .find(
        point =>
          !WAITING_FILTERED_IMPROVEMENT_KINDS
            .has(point.kind),
      )
  }

  if (customerFactAfterAction) {
    return reading
      .improvement_points
      .find(
        point =>
          point.kind !==
            'unanswered_question',
      )
  }

  return reading
    .improvement_points[0]
}


function sellerMessageIdsIn(
  trace: SellerExecutionTrace,
  ids: readonly string[],
): string[] {
  const sellerIds =
    new Set(
      trace.events.map(
        event =>
          event.message_id,
      ),
    )

  return ids.filter(
    id =>
      sellerIds.has(id),
  )
}

function familiesOfMessages(
  trace: SellerExecutionTrace,
  ids: readonly string[],
): CommercialActionFamily[] {
  const wanted =
    new Set(ids)

  return Array.from(
    new Set(
      trace.events
        .filter(
          event =>
            wanted.has(
              event.message_id,
            ),
        )
        .map(
          event =>
            actionFamily(
              event.action_type,
            ),
        )
        .filter(
          (
            value,
          ): value is CommercialActionFamily =>
            value !== null,
        ),
    ),
  )
}

function clientIntentNow({
  trace,
  temporal,
}: {
  trace: SellerExecutionTrace
  temporal:
    CommercialTemporalContext | null
}): CommercialCoachingDiagnosis['client_intent_now'] {
  const intent =
    trace.summary
      .active_customer_intent

  if (!intent) {
    return null
  }

  const temporalIntent =
    temporal?.intent ?? null

  const freshness:
    CommercialIntentFreshness | null =
      intent.kind ===
        'disengaged'
        ? 'closed'
        : intent.kind ===
            'deferral'
          ? temporal?.momentum.state ===
              'awaiting_customer'
            ? 'current'
            : temporalIntent
                ?.freshness ??
              null
          : temporalIntent &&
              temporalIntent
                .evidence_message_id ===
                intent.evidence_message_id
            ? temporalIntent.freshness
            : temporalIntent
                ?.freshness ??
              null

  const demonstratedAt =
    trace.customer_signals.find(
      signal =>
        signal.message_id ===
          intent.evidence_message_id,
    )?.occurred_at ??
    null

  const age =
    demonstratedAt &&
    temporal
      ? Math.max(
          0,
          Date.parse(
            temporal.evaluated_at,
          ) -
            Date.parse(
              demonstratedAt,
            ),
        )
      : null

  const baseLabel =
    intentLabel(intent.kind)

  const label =
    freshness === 'stale' &&
    age !== null
      ? `${baseLabel} — demonstrada há ${formatCommercialDuration(age)}; interesse atual ainda não reconfirmado`
      : freshness === 'aging' &&
          age !== null
        ? `${baseLabel} — demonstrada há ${formatCommercialDuration(age)}`
        : baseLabel

  return {
    kind:
      intent.kind,
    label,
    confidence:
      intent.confidence,
    evidence_message_id:
      intent.evidence_message_id,
    freshness,
    demonstrated_at:
      demonstratedAt,
    is_current:
      intent.kind ===
        'disengaged' ||
      freshness === null ||
      freshness === 'current',
  }
}

const WAIT_TECHNIQUE = {
  id:
    'technique.commitment_wait',
  title:
    'Espera disciplinada',
  risks: [
    'Confundir espera disciplinada com abandono da oportunidade.',
  ],
}

// Arbitragem final: nenhuma conclusão seller-facing pode contradizer
// outra da mesma fotografia.
function arbitrateCoachingCoherence({
  diagnosis,
  reasoning,
  temporal,
  mistakeSellerIds,
}: {
  diagnosis:
    CommercialCoachingDiagnosis
  reasoning:
    CommercialReasoning
  temporal:
    CommercialTemporalContext | null
  mistakeSellerIds: string[]
}): CommercialCoachingDiagnosis {
  const adjustments:
    CoherenceAdjustment[] = []

  let result = {
    ...diagnosis,
  }

  // 1. Elogio e crítica principal nunca apontam para a mesma ação.
  if (
    result.seller_strength &&
    mistakeSellerIds.some(
      id =>
        result.seller_strength!
          .evidence_message_ids
          .includes(id),
    )
  ) {
    result = {
      ...result,
      seller_strength: null,
    }

    adjustments.push({
      code:
        'strength_removed_same_action_as_mistake',
      detail:
        'O elogio citava a mesma ação apontada como principal ajuste.',
    })
  }

  // 2. Decisão de espera exige técnica de espera (e vice-versa).
  if (
    result.status !== 'silent' &&
    reasoning.decision ===
      'wait' &&
    result.chosen_technique &&
    result.chosen_technique.id !==
      WAIT_TECHNIQUE.id
  ) {
    result = {
      ...result,
      chosen_technique: {
        id:
          WAIT_TECHNIQUE.id,
        title:
          WAIT_TECHNIQUE.title,
        why_now:
          reasoning.decision_reason,
        risks: [
          ...WAIT_TECHNIQUE.risks,
        ],
      },
    }

    adjustments.push({
      code:
        'technique_aligned_with_wait_decision',
      detail:
        'A decisão canônica é aguardar; a técnica de envio anterior foi substituída por espera disciplinada.',
    })
  }

  // 3. Esperar enquanto o CLIENTE espera o vendedor é contradição.
  if (
    result.next_action &&
    reasoning.decision ===
      'wait' &&
    temporal?.momentum
      .waiting_on === 'seller'
  ) {
    result = {
      ...result,
      next_action:
        'Responder ao cliente, que está aguardando o vendedor; não tratar como espera.',
    }

    adjustments.push({
      code:
        'wait_replaced_customer_waiting',
      detail:
        'A responsabilidade atual é do vendedor; espera foi descartada.',
    })
  }

  // 4. Intenção envelhecida nunca aparece como atual confirmada.
  if (
    result.client_intent_now &&
    temporal?.intent
      ?.needs_reconfirmation &&
    result.client_intent_now
      .is_current &&
    result.client_intent_now.kind !==
      'disengaged'
  ) {
    result = {
      ...result,
      client_intent_now: {
        ...result.client_intent_now,
        is_current: false,
      },
    }

    adjustments.push({
      code:
        'historical_intent_not_current',
      detail:
        'A intenção precisa de reconfirmação e não é tratada como atual.',
    })
  }

  return {
    ...result,
    coherence: {
      adjustments: [
        ...result.coherence
          .adjustments,
        ...adjustments,
      ],
    },
  }
}

export function buildCommercialCoachingDiagnosis({
  reading,
  reasoning,
  diagnostic_input,
  evaluated_at = null,
  cycle_state = null,
}: {
  reading: CommercialReading
  reasoning: CommercialReasoning
  diagnostic_input:
    CompanionDiagnosticInput
  evaluated_at?: string | null
  cycle_state?:
    StatefulCommercialState | null
}): CommercialCoachingDiagnosis {
  const trace =
    buildSellerExecutionTrace({
      diagnostic_input,
    })

  // Mesma leitura temporal que decidiu o reasoning; recalcula só quando o
  // reasoning veio de um contrato anterior sem o campo.
  const temporal =
    reasoning.temporal_context ??
    buildCommercialTemporalContext({
      diagnostic_input,
      trace,
      evaluated_at:
        evaluated_at ??
        diagnostic_input
          .reference_time,
    })

  const sequenceMethod =
    buildSellerSequenceMethodAssessment({
      reading,
      diagnostic_input,
      trace,
      temporal,
    })

  const executionOnly =
    reasoning.status ===
      'silent' &&
    sellerExecutionCoachingAvailable({
      reading,
      trace,
      cycle_state,
    })

  const status:
    CommercialCoachingDiagnosisStatus =
      executionOnly
        ? 'limited'
        : reasoning.status

  const scope:
    CommercialCoachingScope =
      executionOnly
        ? 'seller_execution_only'
        : 'full'

  const units =
    buildNegativeExecutionUnits({
      trace,
      temporal,
    })

  const lastMove =
    lastValidMove(trace)

  const traceMistake =
    mistakeFromTrace({
      trace,
      units,
      temporal,
    })

  const primaryReadingImprovement =
    scope === 'full'
      ? firstReadingImprovement({
          reading,
          waitingForCustomer:
            sequenceMethod.sequence
              .waiting_for_customer,
          customerFactAfterAction:
            sequenceMethod.sequence
              .customer_fact_after_action,
        })
      : undefined

  const readingMistake =
    improvementFromReading(
      primaryReadingImprovement,
    )

  const mistake =
    traceMistake?.evidence ??
    readingMistake

  const mistakeSellerIds =
    traceMistake
      ? traceMistake
          .seller_message_ids
      : readingMistake
        ? sellerMessageIdsIn(
            trace,
            readingMistake
              .evidence_message_ids,
          )
        : []

  const mistakeFamilies =
    traceMistake
      ? traceMistake.families
      : familiesOfMessages(
          trace,
          mistakeSellerIds,
        )

  // Arbitragem de elogio: percorre TODOS os acertos da leitura (não só o
  // primeiro) e depois os acertos observáveis do trace; aceita o primeiro
  // que não seja a mesma ação — ou a mesma família de ação — que causou
  // quebra, erro ou perda de timing.
  const readingCandidates =
    scope === 'full'
      ? reading.seller_strengths
          .map(
            (
              item: CommercialReadingSellerStrength,
            ) =>
              strengthFromReading(
                item,
              ),
          )
          .filter(
            (
              item,
            ): item is CommercialCoachingEvidence =>
              item !== null,
          )
      : []

  const traceCandidates =
    [
      lastMove,
      ...[...trace.events]
        .reverse()
        .filter(
          event =>
            event !== lastMove &&
            !event.sequence
              .breaks_active_customer_goal &&
            event.quality.relevance !==
              'low',
        ),
    ]
      .map(
        event =>
          strengthFromTrace(
            event,
          ),
      )
      .filter(
        (
          item,
        ): item is CommercialCoachingEvidence =>
          item !== null,
      )

  const strength =
    [
      ...readingCandidates,
      ...traceCandidates,
    ].find(
      candidate =>
        !strengthConflictsWithNegativeUnits({
          strength:
            candidate,
          units,
          primaryMistakeMessageIds:
            mistakeSellerIds,
          primaryMistakeFamilies:
            mistake
              ? mistakeFamilies
              : [],
        }),
    ) ?? null

  const breakUnit =
    [...units]
      .reverse()
      .find(
        unit =>
          unit.kind ===
            'sequence_break',
      ) ?? null

  const breakTurn:
    SellerExecutionTurn | null =
      breakUnit
        ? trace.turns.find(
            turn =>
              turn.turn_id ===
                breakUnit.turn_id,
          ) ?? null
        : null

  const breakEvents =
    breakUnit
      ? eventsOfUnit(
          trace,
          breakUnit,
        )
      : []

  const methodRecommendation =
    recommendedMethodStage(
      reading,
      diagnostic_input,
      sequenceMethod.sequence
        .break_detected,
    )

  const requalify =
    temporal.reactivation
      .requalify_before_continuing

  const selectedTechnique =
    scope === 'full'
      ? reasoning
          .selected_techniques[0] ??
        null
      : null

  const intentNow =
    clientIntentNow({
      trace,
      temporal,
    })

  const findings =
    buildAdditionalCoachingFindings({
      trace,
      units,
      temporal,
      primaryMistake:
        mistake,
      primaryMistakeMessageIds:
        mistakeSellerIds,
      primaryMistakeKind:
        traceMistake?.unit_kind ??
        null,
      primaryReadingImprovement:
        traceMistake
          ? null
          : primaryReadingImprovement ??
            null,
    })

  const nextAction =
    reasoning.status ===
      'silent'
      ? null
      : reasoning.objective_now

  const diagnosis:
    CommercialCoachingDiagnosis = {
      contract_version:
        COMMERCIAL_COACHING_DIAGNOSIS_VERSION,
      status,
      scope,
      client_context_confidence:
        scope ===
          'seller_execution_only'
          ? 'low'
          : trace.summary
              .client_context_confidence,
      seller_execution_confidence:
        trace.summary
          .seller_execution_confidence,
      current_commercial_goal:
        nextAction,
      client_intent_now:
        intentNow,
      seller_last_valid_move:
        lastMove
          ? {
              message_id:
                lastMove.message_id,
              action_type:
                lastMove.action_type,
              action_label:
                actionLabel(
                  lastMove.action_type,
                ),
              commercial_objective:
                lastMove
                  .commercial_objective,
              summary:
                lastMove
                  .content_summary,
              observed_outcome:
                lastMove
                  .observed_outcome,
              evidence_message_ids: [
                ...lastMove
                  .evidence_message_ids,
              ],
            }
          : null,
      seller_strength:
        strength,
      seller_mistake:
        mistake,
      additional_findings:
        findings,
      sequence_break: {
        happened:
          Boolean(breakUnit),
        what_changed:
          breakUnit
            ? `A condução mudou para ${actionLabel(
                dominantOf(
                  breakEvents,
                ),
              ).toLowerCase()} antes de concluir o objetivo anterior do cliente.`
            : null,
        why_it_hurts:
          breakUnit
            ? 'A quebra de sequência aumenta fricção e pode fazer a conversa perder o compromisso que já estava ativo.'
            : null,
        evidence_message_ids:
          breakUnit
            ? unique([
                ...breakEvents.flatMap(
                  event =>
                    event.evidence_message_ids,
                ),
                ...(breakTurn
                  ?.message_ids ??
                  []),
              ])
            : [],
      },
      method_state: {
        configured:
          sequenceMethod
            .method.configured,
        current_stage_name:
          sequenceMethod
            .method.current_stage
            ?.name ??
          null,
        recommended_stage_name:
          methodRecommendation.name,
        recommended_stage_reason:
          requalify &&
          methodRecommendation.name
            ? `Antes de retomar ${methodRecommendation.name}, reconfirmar se o interesse do cliente continua depois do intervalo. ${methodRecommendation.reason ?? ''}`.trim()
            : methodRecommendation.reason,
        adherence:
          sequenceMethod
            .method.adherence_status,
        deviation_detected:
          sequenceMethod
            .method.deviation_detected,
        recovery_objective:
          sequenceMethod
            .method.recovery_objective,
        recovery_move:
          requalify
            ? null
            : sequenceMethod
                .method.recovery_move,
        historical_open_loops:
          requalify,
      },
      chosen_technique:
        selectedTechnique
          ? {
              id:
                selectedTechnique
                  .intelligence_id,
              title:
                selectedTechnique
                  .title,
              why_now:
                selectedTechnique
                  .why_applicable,
              risks: [
                ...selectedTechnique
                  .risks,
              ],
            }
          : null,
      next_action:
        scope ===
          'seller_execution_only'
          ? null
          : nextAction,
      do_not_do:
        scope ===
          'seller_execution_only'
          ? []
          : [
              ...reasoning.do_not_do,
            ],
      temporal:
        temporalView(temporal),
      synthesis: {
        diagnosis: null,
        main_improvement: null,
        next_learning: null,
      },
      coherence: {
        adjustments: [],
      },
      evidence_message_ids:
        unique([
          ...reasoning
            .evidence_message_ids,
          ...trace.summary
            .evidence_message_ids,
          ...(
            strength
              ?.evidence_message_ids ??
            []
          ),
          ...(
            mistake
              ?.evidence_message_ids ??
            []
          ),
        ]),
      memory_ids:
        unique([
          ...reasoning.memory_ids,
          ...(
            strength
              ?.memory_ids ??
            []
          ),
          ...(
            mistake
              ?.memory_ids ??
            []
          ),
        ]),
    }

  const arbitrated =
    arbitrateCoachingCoherence({
      diagnosis,
      reasoning,
      temporal,
      mistakeSellerIds,
    })

  return {
    ...arbitrated,
    synthesis:
      status === 'silent'
        ? {
            diagnosis: null,
            main_improvement: null,
            next_learning: null,
          }
        : buildSynthesis({
            scope,
            intent:
              arbitrated.client_intent_now,
            temporal,
            mistake:
              arbitrated.seller_mistake,
            findings:
              arbitrated.additional_findings,
            strength:
              arbitrated.seller_strength,
            nextAction:
              arbitrated.next_action,
          }),
  }
}
