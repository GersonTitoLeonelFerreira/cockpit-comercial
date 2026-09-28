import type {
  CompanionDiagnosticInput,
} from './diagnostic-input'

import type {
  CommercialReading,
  CommercialReadingCurrentMethodStage,
} from './commercial-reading-contract'

import type {
  SellerExecutionSignal,
  SellerExecutionTrace,
} from './seller-execution-trace'

export const SELLER_SEQUENCE_METHOD_ASSESSMENT_VERSION =
  'seller-sequence-method-assessment-v1' as const

export type SellerSequenceMethodAssessment = {
  contract_version:
    typeof SELLER_SEQUENCE_METHOD_ASSESSMENT_VERSION

  situations: string[]
  signals: string[]
  restrictions: string[]

  sequence: {
    break_detected: boolean
    duplicate_action_detected: boolean
    waiting_for_customer: boolean
    customer_fact_after_action: boolean
    last_seller_message_id: string | null
  }

  method: {
    configured: boolean
    published_method_name: string | null
    current_stage:
      CommercialReadingCurrentMethodStage | null
    adherence_status:
      CommercialReading[
        'method'
      ]['adherence']['status']
    deviation_detected: boolean
    recovery_objective: string | null
    recovery_move: string | null
    source:
      'commercial_reading'
  }

  evidence_message_ids: string[]
}

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

function hasSignal(
  trace: SellerExecutionTrace,
  signal: SellerExecutionSignal,
): boolean {
  return trace.events.some(
    event =>
      event.signals.includes(
        signal,
      ),
  )
}

function latestEvent(
  trace: SellerExecutionTrace,
) {
  return trace.events.length > 0
    ? trace.events[
        trace.events.length - 1
      ]
    : null
}

export function buildSellerSequenceMethodAssessment({
  reading,
  diagnostic_input,
  trace,
}: {
  reading: CommercialReading
  diagnostic_input:
    CompanionDiagnosticInput
  trace: SellerExecutionTrace
}): SellerSequenceMethodAssessment {
  const situations: string[] = []
  const signals: string[] = []
  const restrictions: string[] = []

  const lastEvent =
    latestEvent(trace)

  const hasOpenSchedulingQuestion =
    hasSignal(
      trace,
      'seller_already_asked_open_question',
    )

  const hasGuidedChoice =
    hasSignal(
      trace,
      'guided_choice_used',
    )

  const sequenceBreak =
    hasSignal(
      trace,
      'sequence_break',
    )

  const duplicateAction =
    hasSignal(
      trace,
      'duplicate_followup',
    )

  const prematureOffer =
    hasSignal(
      trace,
      'premature_product_offer',
    )

  const lateDiscoveryAfterClose =
    hasSignal(
      trace,
      'late_discovery_after_close_intent',
    )

  const customerRejectedOptions =
    hasSignal(
      trace,
      'customer_rejected_options',
    )

  const waitingForCustomer =
    Boolean(
      lastEvent &&
      lastEvent.target_commitment &&
      lastEvent.observed_outcome ===
        'no_outcome_observed' &&
      !lastEvent.sequence
        .breaks_active_customer_goal &&
      !sequenceBreak,
    )

  const customerFactAfterAction =
    Boolean(
      lastEvent &&
      [
        'customer_replied',
        'customer_rejected_options',
        'customer_accepted',
      ].includes(
        lastEvent.observed_outcome,
      ),
    )

  if (
    hasOpenSchedulingQuestion ||
    hasGuidedChoice ||
    trace.summary
      .active_customer_intent
      ?.kind === 'scheduling'
  ) {
    situations.push(
      'scheduling_choice',
    )
  }

  if (hasOpenSchedulingQuestion) {
    signals.push(
      'seller_already_asked_open_question',
    )
  }

  if (hasGuidedChoice) {
    signals.push(
      'guided_choice_used',
    )
  }

  if (sequenceBreak) {
    situations.push(
      'method_alignment',
    )

    signals.push(
      'sequence_break',
    )

    restrictions.push(
      'Não abandonar o objetivo comercial ativo do cliente para avançar para outra etapa sem motivo novo.',
    )
  }

  if (duplicateAction) {
    situations.push(
      'duplicate_followup',
      'waiting_for_customer',
    )

    signals.push(
      'seller_action_already_performed',
      'waiting_on_customer',
    )

    restrictions.push(
      'Não repetir a mesma ação comercial sem resposta ou fato novo.',
    )
  }

  if (waitingForCustomer) {
    situations.push(
      'waiting_for_customer',
    )

    signals.push(
      'seller_action_already_performed',
      'waiting_on_customer',
    )

    restrictions.push(
      'Não repetir a pergunta ou o pedido de compromisso enquanto a próxima resposta ainda depende do cliente.',
    )
  }

  if (prematureOffer) {
    situations.push(
      'discovery_gap',
      'method_alignment',
      'stage_inference',
    )

    signals.push(
      'missing_context',
      'missing_transaction_evidence',
      'premature_product_offer',
    )

    restrictions.push(
      'Não prescrever produto ou preço como substituto de descoberta quando o contexto necessário ainda não foi estabelecido.',
    )
  }

  if (
    hasSignal(
      trace,
      'customer_intent_hot',
    )
  ) {
    situations.push(
      'next_step_choice',
    )

    signals.push(
      'customer_intent_hot',
    )
  }

  if (
    hasSignal(
      trace,
      'microcommitment_available',
    )
  ) {
    signals.push(
      'microcommitment_available',
    )
  }

  if (
    hasSignal(
      trace,
      'seller_message_overloaded',
    )
  ) {
    signals.push(
      'seller_message_overloaded',
    )
  }

  if (
    hasSignal(
      trace,
      'client_sparse_seller_rich',
    )
  ) {
    signals.push(
      'client_sparse_seller_rich',
    )
  }

  if (lateDiscoveryAfterClose) {
    situations.push(
      'method_alignment',
      'next_step_choice',
    )

    signals.push(
      'late_discovery_after_close_intent',
      'customer_intent_hot',
    )

    restrictions.push(
      'Não prolongar descoberta quando o cliente já declarou intenção explícita de fechar e fez um pedido operacional compatível.',
    )
  }

  if (customerRejectedOptions) {
    signals.push(
      'customer_rejected_options',
      'customer_resistance',
    )

    restrictions.push(
      'Não repetir opções que o cliente acabou de rejeitar sem apresentar fato novo.',
    )
  }

  if (
    hasSignal(
      trace,
      'generic_response_candidate',
    )
  ) {
    signals.push(
      'generic_response_candidate',
    )
  }

  const publishedMethod =
    diagnostic_input
      .commercial_context
      .sales_method

  const configured =
    reading.method.configured &&
    publishedMethod.configured

  if (
    configured &&
    reading.method.adherence
      .status !== 'on_method'
  ) {
    situations.push(
      'method_alignment',
    )

    signals.push(
      'method_configured',
    )
  }

  const readingDeviation =
    reading.method.adherence
      .status !== 'on_method' &&
    reading.method.adherence
      .status !== 'not_configured' &&
    reading.method.adherence
      .status !==
        'insufficient_evidence'

  const deviationDetected =
    sequenceBreak ||
    prematureOffer ||
    lateDiscoveryAfterClose ||
    readingDeviation

  const evidenceMessageIds =
    unique([
      ...trace.summary
        .evidence_message_ids,
      ...reading.method.adherence
        .evidence_message_ids,
      ...(
        reading.method
          .recovery_guidance
          ?.evidence_message_ids ??
        []
      ),
    ])

  return {
    contract_version:
      SELLER_SEQUENCE_METHOD_ASSESSMENT_VERSION,
    situations:
      unique(situations),
    signals:
      unique(signals),
    restrictions:
      unique(restrictions),
    sequence: {
      break_detected:
        sequenceBreak,
      duplicate_action_detected:
        duplicateAction,
      waiting_for_customer:
        waitingForCustomer,
      customer_fact_after_action:
        customerFactAfterAction,
      last_seller_message_id:
        lastEvent?.message_id ??
        null,
    },
    method: {
      configured,
      published_method_name:
        publishedMethod.name ??
        reading.method.name ??
        null,
      current_stage:
        reading.method
          .current_stage,
      adherence_status:
        reading.method
          .adherence.status,
      deviation_detected:
        deviationDetected,
      recovery_objective:
        reading.method
          .recovery_guidance
          ?.objective ??
        null,
      recovery_move:
        reading.method
          .recovery_guidance
          ?.recommended_move ??
        null,
      source:
        'commercial_reading',
    },
    evidence_message_ids:
      evidenceMessageIds,
  }
}
