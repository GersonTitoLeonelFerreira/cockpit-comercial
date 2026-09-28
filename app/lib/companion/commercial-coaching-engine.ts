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

import {
  buildSellerExecutionTrace,
  type SellerExecutionActionType,
  type SellerExecutionConfidence,
  type SellerExecutionEvent,
  type SellerExecutionCustomerIntent,
} from './seller-execution-trace'

import {
  buildSellerSequenceMethodAssessment,
} from './seller-sequence-method-assessment'

export const COMMERCIAL_COACHING_DIAGNOSIS_VERSION =
  'commercial-coaching-diagnosis-v1' as const

export type CommercialCoachingDiagnosisStatus =
  | 'ready'
  | 'limited'
  | 'silent'

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

export type CommercialCoachingDiagnosis = {
  contract_version:
    typeof COMMERCIAL_COACHING_DIAGNOSIS_VERSION

  status:
    CommercialCoachingDiagnosisStatus

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
  } | null

  seller_last_valid_move:
    CommercialCoachingLastMove | null

  seller_strength:
    CommercialCoachingEvidence | null

  seller_mistake:
    CommercialCoachingEvidence | null

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
  }

  chosen_technique: {
    id: string
    title: string
    why_now: string
    risks: string[]
  } | null

  next_action: string | null
  do_not_do: string[]

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

function mistakeFromTrace(
  trace:
    ReturnType<
      typeof buildSellerExecutionTrace
    >,
): CommercialCoachingEvidence | null {
  const reversed = [
    ...trace.events,
  ].reverse()

  const lateDiscovery =
    reversed.find(
      event =>
        event.signals.includes(
          'late_discovery_after_close_intent',
        ),
    )

  if (lateDiscovery) {
    return {
      summary:
        'O vendedor continuou descobrindo depois de o cliente já demonstrar intenção explícita de avançar.',
      why_it_matters:
        'Descoberta adicional sem necessidade pode criar atrito justamente quando a conversa já pede execução do próximo passo.',
      impact:
        'A venda pode perder ritmo e fazer o cliente repetir uma decisão que já havia sinalizado.',
      how_to_improve:
        'Responder ao pedido operacional atual e avançar o compromisso; só voltar à descoberta se surgir uma lacuna que realmente impeça o fechamento.',
      evidence_message_ids: [
        ...lateDiscovery
          .evidence_message_ids,
      ],
      memory_ids: [],
      source:
        'seller_execution_trace',
    }
  }

  const sequenceBreak =
    reversed.find(
      event =>
        event.signals.includes(
          'sequence_break',
        ),
    )

  if (sequenceBreak) {
    return {
      summary:
        'A condução saiu do objetivo comercial que o cliente havia demonstrado antes de concluir esse próximo passo.',
      why_it_matters:
        'Mudar de objetivo sem fato novo aumenta fricção e enfraquece a continuidade da conversa.',
      impact:
        'O cliente pode precisar reconstruir contexto ou abandonar uma intenção que já estava ativa.',
      how_to_improve:
        'Retomar o objetivo ativo do cliente e concluir esse compromisso antes de apresentar uma etapa diferente.',
      evidence_message_ids: [
        ...sequenceBreak
          .evidence_message_ids,
      ],
      memory_ids: [],
      source:
        'seller_execution_trace',
    }
  }

  const premature =
    reversed.find(
      event =>
        event.signals.includes(
          'premature_product_offer',
        ),
    )

  if (premature) {
    return {
      summary:
        'Produto, solução ou preço foi apresentado antes de o contexto necessário estar suficientemente estabelecido.',
      why_it_matters:
        'Prescrever cedo demais reduz a personalização e pode deslocar a conversa para comparação de oferta antes de existir critério de decisão.',
      impact:
        'A recomendação tende a parecer genérica ou prematura.',
      how_to_improve:
        'Fazer a descoberta mínima que altera a recomendação e só então conectar a solução ao contexto comprovado.',
      evidence_message_ids: [
        ...premature
          .evidence_message_ids,
      ],
      memory_ids: [],
      source:
        'seller_execution_trace',
    }
  }

  const duplicate =
    reversed.find(
      event =>
        event.signals.includes(
          'duplicate_followup',
        ),
    )

  if (duplicate) {
    return {
      summary:
        'A mesma ação comercial foi repetida sem resposta ou fato novo entre as tentativas.',
      why_it_matters:
        'Repetição sem nova informação gera pressão e transmite pouca leitura do histórico.',
      impact:
        'O contato pode perceber automação ou insistência desnecessária.',
      how_to_improve:
        'Preservar a ação já executada e esperar a resposta, salvo se um novo fato justificar outra abordagem.',
      evidence_message_ids: [
        ...duplicate
          .evidence_message_ids,
      ],
      memory_ids: [],
      source:
        'seller_execution_trace',
    }
  }

  return null
}

function lastValidMove(
  trace:
    ReturnType<
      typeof buildSellerExecutionTrace
    >,
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
          'low',
    ) ??
    events[0] ??
    null
  )
}

function evidenceOverlaps(
  left: readonly string[],
  right: readonly string[],
): boolean {
  const rightIds =
    new Set(right)

  return left.some(
    id =>
      rightIds.has(id),
  )
}

function recommendedMethodStage(
  reading: CommercialReading,
): {
  name: string | null
  reason: string | null
} {
  const deviationOrder =
    reading.method.adherence
      .deviation_stage_order

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

  const currentStage =
    reading.method
      .current_stage

  if (currentStage) {
    const incompleteEarlierStage =
      [...reading.method.stages]
        .sort(
          (a, b) =>
            a.step_order -
            b.step_order,
        )
        .find(
          stage =>
            stage.step_order <
              currentStage.step_order &&
            stage.status ===
              'partial',
        )

    if (incompleteEarlierStage) {
      return {
        name:
          incompleteEarlierStage.name,
        reason:
          reading.method
            .recovery_guidance
            ?.objective ??
          `A execução avançou para ${currentStage.name} enquanto ${incompleteEarlierStage.name} ainda estava parcial; recuperar essa etapa evita consolidar o avanço fora de sequência.`,
      }
    }
  }

  return {
    name:
      currentStage?.name ??
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

export function buildCommercialCoachingDiagnosis({
  reading,
  reasoning,
  diagnostic_input,
}: {
  reading: CommercialReading
  reasoning: CommercialReasoning
  diagnostic_input:
    CompanionDiagnosticInput
}): CommercialCoachingDiagnosis {
  const trace =
    buildSellerExecutionTrace({
      diagnostic_input,
    })

  const sequenceMethod =
    buildSellerSequenceMethodAssessment({
      reading,
      diagnostic_input,
      trace,
    })

  const lastMove =
    lastValidMove(trace)

  const deterministicMistake =
    mistakeFromTrace(trace)

  const readingMistake =
    improvementFromReading(
      firstReadingImprovement({
        reading,
        waitingForCustomer:
          sequenceMethod.sequence
            .waiting_for_customer,
        customerFactAfterAction:
          sequenceMethod.sequence
            .customer_fact_after_action,
      }),
    )

  const mistake =
    deterministicMistake ??
    readingMistake

  const breakEvent =
    [...trace.events]
      .reverse()
      .find(
        event =>
          event.sequence
            .breaks_active_customer_goal,
      ) ??
    null

  const readingStrength =
    strengthFromReading(
      reading.seller_strengths[0],
    )

  const traceStrength =
    strengthFromTrace(
      lastMove,
    )

  const readingStrengthEvidenceEvents =
    readingStrength
      ? trace.events.filter(
          event =>
            readingStrength
              .evidence_message_ids
              .includes(
                event.message_id,
              ),
        )
      : []

  const readingStrengthConflicts =
    Boolean(
      readingStrength &&
      (
        (
          deterministicMistake &&
          evidenceOverlaps(
            readingStrength
              .evidence_message_ids,
            deterministicMistake
              .evidence_message_ids,
          )
        ) ||
        readingStrengthEvidenceEvents
          .some(
            event =>
              event.sequence
                .breaks_active_customer_goal ||
              event.signals.includes(
                'premature_product_offer',
              ) ||
              event.quality
                .relevance === 'low',
          )
      ),
    )

  const strength =
    readingStrengthConflicts
      ? traceStrength
      : readingStrength ??
        traceStrength

  const methodRecommendation =
    recommendedMethodStage(
      reading,
    )

  const selectedTechnique =
    reasoning
      .selected_techniques[0] ??
    null

  const clientIntent =
    trace.summary
      .active_customer_intent

  return {
    contract_version:
      COMMERCIAL_COACHING_DIAGNOSIS_VERSION,
    status:
      reasoning.status,
    client_context_confidence:
      trace.summary
        .client_context_confidence,
    seller_execution_confidence:
      trace.summary
        .seller_execution_confidence,
    current_commercial_goal:
      reasoning.status ===
        'silent'
        ? null
        : reasoning.objective_now,
    client_intent_now:
      clientIntent
        ? {
            kind:
              clientIntent.kind,
            label:
              intentLabel(
                clientIntent.kind,
              ),
            confidence:
              clientIntent.confidence,
            evidence_message_id:
              clientIntent
                .evidence_message_id,
          }
        : null,
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
    sequence_break: {
      happened:
        Boolean(
          breakEvent,
        ),
      what_changed:
        breakEvent
          ? `A condução mudou para ${actionLabel(
              breakEvent.action_type,
            ).toLowerCase()} antes de concluir o objetivo anterior do cliente.`
          : null,
      why_it_hurts:
        breakEvent
          ? 'A quebra de sequência aumenta fricção e pode fazer a conversa perder o compromisso que já estava ativo.'
          : null,
      evidence_message_ids:
        breakEvent
          ? [
              ...breakEvent
                .evidence_message_ids,
            ]
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
        methodRecommendation.reason,
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
        sequenceMethod
          .method.recovery_move,
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
      reasoning.status ===
        'silent'
        ? null
        : reasoning.objective_now,
    do_not_do: [
      ...reasoning.do_not_do,
    ],
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
}
