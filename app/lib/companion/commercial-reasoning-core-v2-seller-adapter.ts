import type {
  CommercialReadingDecision,
} from './commercial-reading-contract'

import {
  COMMERCIAL_REASONING_CORE_V2_DECISIONS,
  type CommercialReasoningCoreV2Decision,
  type CommercialReasoningCoreV2Output,
} from './commercial-reasoning-core-v2-contract'

export const COMMERCIAL_REASONING_CORE_V2_SELLER_ADAPTER_VERSION =
  'commercial-reasoning-core-v2-seller-adapter-v1' as const

const DECISION_MAP = {
  no_intervention:
    'no_intervention',

  answer_question:
    'respond',

  clarify:
    'clarify',

  discover:
    'deepen_discovery',

  present_solution:
    'present_solution',

  handle_objection:
    'handle_objection',

  confirm_next_step:
    'set_commitment',

  schedule:
    'set_commitment',

  close:
    'close',

  wait:
    'wait',

  give_space:
    'give_space',

  recover_context:
    'respond',
} as const satisfies
  Record<
    CommercialReasoningCoreV2Decision,
    CommercialReadingDecision
  >

export const COMMERCIAL_REASONING_CORE_V2_TO_COMMERCIAL_READING_DECISION =
  Object.freeze(
    DECISION_MAP,
  )

export type CommercialReasoningCoreV2SellerProjection = {
  adapter_version:
    typeof COMMERCIAL_REASONING_CORE_V2_SELLER_ADAPTER_VERSION

  engine_source:
    'commercial_reasoning_core_v2'

  seller_actionable:
    boolean

  commercial_role:
    CommercialReasoningCoreV2Output[
      'commercial_role'
    ]

  commercial_relevance:
    CommercialReasoningCoreV2Output[
      'commercial_relevance'
    ]

  summary:
    string

  decision:
    CommercialReadingDecision

  recommended_next_approach:
    string

  reason:
    string

  intervention_needed:
    boolean

  recommended_question:
    string | null

  suggested_message:
    string | null

  evidence_message_ids:
    string[]
}

function uniqueStrings(
  values: string[],
): string[] {
  return [
    ...new Set(
      values.filter(
        value =>
          typeof value ===
            'string' &&
          value.length > 0,
      ),
    ),
  ]
}

export function isCommercialReasoningCoreV2SellerActionable(
  output:
    CommercialReasoningCoreV2Output,
): boolean {
  return (
    output.commercial_role ===
      'buyer' &&
    output.commercial_relevance ===
      'commercial'
  )
}

export function mapCommercialReasoningCoreV2Decision(
  decision:
    CommercialReasoningCoreV2Decision,
): CommercialReadingDecision {
  return (
    COMMERCIAL_REASONING_CORE_V2_TO_COMMERCIAL_READING_DECISION[
      decision
    ]
  )
}

export function buildCommercialReasoningCoreV2SellerProjection(
  output:
    CommercialReasoningCoreV2Output,
): CommercialReasoningCoreV2SellerProjection {
  const sellerActionable =
    isCommercialReasoningCoreV2SellerActionable(
      output,
    )

  const interventionNeeded =
    sellerActionable &&
    output
      .communication
      .intervention_needed

  return {
    adapter_version:
      COMMERCIAL_REASONING_CORE_V2_SELLER_ADAPTER_VERSION,

    engine_source:
      'commercial_reasoning_core_v2',

    seller_actionable:
      sellerActionable,

    commercial_role:
      output
        .commercial_role,

    commercial_relevance:
      output
        .commercial_relevance,

    summary:
      output
        .situation
        .summary,

    decision:
      sellerActionable
        ? mapCommercialReasoningCoreV2Decision(
            output
              .decision
              .action,
          )
        : 'no_intervention',

    recommended_next_approach:
      output
        .decision
        .objective,

    reason:
      output
        .decision
        .reason,

    intervention_needed:
      interventionNeeded,

    recommended_question:
      interventionNeeded
        ? output
            .communication
            .recommended_question
        : null,

    suggested_message:
      interventionNeeded
        ? output
            .communication
            .suggested_message
        : null,

    evidence_message_ids:
      uniqueStrings([
        ...output
          .evidence_message_ids,

        ...output
          .decision
          .evidence_message_ids,
      ]),
  }
}

for (
  const decision of
  COMMERCIAL_REASONING_CORE_V2_DECISIONS
) {
  if (
    !Object.prototype.hasOwnProperty.call(
      COMMERCIAL_REASONING_CORE_V2_TO_COMMERCIAL_READING_DECISION,
      decision,
    )
  ) {
    throw new Error(
      `COMMERCIAL_REASONING_CORE_V2_SELLER_ADAPTER_MISSING_DECISION: ${decision}`,
    )
  }
}
