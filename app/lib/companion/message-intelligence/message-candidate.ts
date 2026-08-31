import type {
  MessagePlanContentRequirementV1,
  MessagePlanEvidenceV1,
  MessagePlanStatusV1,
  MessagePlanV1,
} from './message-plan'

import type {
  SourceTraceV1,
} from './source-trace'

import type {
  CommercialMoveV1,
  CommercialObjectiveV1,
} from './strategy-contracts'

export const MESSAGE_CANDIDATE_CONTRACT_VERSION =
  'message-candidate-v1' as const

export const CANDIDATE_GENERATION_RESULT_CONTRACT_VERSION =
  'candidate-generation-result-v1' as const

export const CANDIDATE_GENERATION_MODE =
  'deterministic-template-v1' as const

export type CandidateGenerationModeV1 =
  typeof CANDIDATE_GENERATION_MODE

export type MessageCandidateV1 = {
  contract_version:
    typeof MESSAGE_CANDIDATE_CONTRACT_VERSION

  candidate_id: string
  text: string
  generation_mode:
    CandidateGenerationModeV1

  commercial_move:
    CommercialMoveV1
  commercial_objective:
    CommercialObjectiveV1

  content_requirements_covered:
    MessagePlanContentRequirementV1[]

  fact_requirements_used:
    string[]

  question_count: number

  evidence:
    MessagePlanEvidenceV1
  provenance:
    SourceTraceV1[]
}

export const CANDIDATE_GENERATION_STATUSES = [
  'generated',
  'not_generated',
  'blocked',
  'approval_required',
  'needs_information',
] as const

export type CandidateGenerationStatusV1 =
  (typeof CANDIDATE_GENERATION_STATUSES)[number]

export type CandidateGenerationInputV1 = {
  message_plan: MessagePlanV1

  /**
   * Limite de opções pedido pelo consumidor desta camada.
   * O Generator nunca produz mais de três candidates e pode produzir
   * menos quando não existe diversidade material legítima.
   */
  max_candidates?: 1 | 2 | 3
}

export type CandidateGenerationLimitationCodeV1 =
  | 'SELLER_GREETING_PATTERN_NOT_IN_MESSAGE_PLAN'
  | 'SELLER_CLOSING_PATTERN_NOT_IN_MESSAGE_PLAN'
  | 'SELLER_EMOJI_PATTERN_NOT_IN_MESSAGE_PLAN'

export type CandidateGenerationLimitationV1 = {
  code:
    CandidateGenerationLimitationCodeV1
  detail: string
}

export type CandidateGenerationResultV1 = {
  contract_version:
    typeof CANDIDATE_GENERATION_RESULT_CONTRACT_VERSION

  status:
    CandidateGenerationStatusV1

  plan_status:
    MessagePlanStatusV1

  commercial_move:
    CommercialMoveV1
  commercial_objective:
    CommercialObjectiveV1

  generation_allowed: boolean

  candidates:
    MessageCandidateV1[]

  limitations:
    CandidateGenerationLimitationV1[]

  reason: string
}
