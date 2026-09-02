import type {
  CandidateGenerationResultV1,
} from './message-candidate'

import type {
  MessagePlanV1,
} from './message-plan'

import type {
  HardGateResultV1,
} from './hard-gate-contracts'

export const COMMERCIAL_NATURALNESS_CRITIC_CONTRACT_VERSION =
  'commercial-naturalness-critic-v1' as const

export const CRITIC_DIMENSIONS = [
  'commercial_coherence',
  'naturalness',
  'specificity',
  'clarity',
  'concision',
  'question_quality',
  'next_step_fit',
  'communication_fit',
] as const

export type CriticDimensionV1 =
  (typeof CRITIC_DIMENSIONS)[number]

export const CRITIC_DIMENSION_WEIGHTS: Record<CriticDimensionV1, number> = {
  commercial_coherence: 25,
  naturalness: 20,
  specificity: 20,
  clarity: 10,
  concision: 10,
  question_quality: 5,
  next_step_fit: 5,
  communication_fit: 5,
}

export const CRITIC_THRESHOLDS = {
  recommended: 80,
  acceptable: 65,
} as const

export const CRITIC_ISSUE_CODES = [
  'WEAK_COMMERCIAL_EXECUTION',
  'WEAK_ACKNOWLEDGEMENT',
  'GENERIC_OBJECTION_HANDLING',
  'GENERIC_RESPONSE',
  'SELLER_INTENT_MISMATCH',
  'WEAK_CONTEXT_ANCHORING',
  'ROBOTIC_LANGUAGE',
  'BOILERPLATE_DOMINATES',
  'REPETITIVE_LANGUAGE',
  'EXCESSIVE_CORPORATE_LANGUAGE',
  'CLARITY_LOW',
  'OVERLONG_FOR_TARGET',
  'UNDERDEVELOPED_FOR_TARGET',
  'INDIRECT_FOR_DIRECT_STYLE',
  'FORMALITY_MISMATCH',
  'VAGUE_QUESTION',
  'QUESTION_PURPOSE_MISMATCH',
  'GENERIC_NEXT_STEP',
  'TIMING_RESPONSE_STIFF',
  'REJECTION_STIFF',
] as const

export type CriticIssueCodeV1 =
  (typeof CRITIC_ISSUE_CODES)[number]

export type CriticIssueSeverityV1 =
  | 'minor'
  | 'moderate'
  | 'major'

export type CriticIssueV1 = {
  code: CriticIssueCodeV1
  dimension: CriticDimensionV1
  severity: CriticIssueSeverityV1
  detail: string
}

export type CriticDimensionScoresV1 =
  Record<CriticDimensionV1, number | null>

export type CandidateCriticStatusV1 =
  | 'recommended'
  | 'acceptable'
  | 'weak'

export type CandidateCritiqueV1 = {
  candidate_id: string
  status: CandidateCriticStatusV1
  overall_score: number
  dimensions: CriticDimensionScoresV1
  strengths: string[]
  issues: CriticIssueV1[]
}

export const CRITIC_RESULT_STATUSES = [
  'evaluated',
  'no_eligible_candidates',
  'blocked',
  'approval_required',
] as const

export type CriticResultStatusV1 =
  (typeof CRITIC_RESULT_STATUSES)[number]

export type CriticResultV1 = {
  contract_version:
    typeof COMMERCIAL_NATURALNESS_CRITIC_CONTRACT_VERSION
  status: CriticResultStatusV1
  critiques: CandidateCritiqueV1[]
  ranked_candidate_ids: string[]
  recommended_candidate_ids: string[]
  acceptable_candidate_ids: string[]
  weak_candidate_ids: string[]
}

export type CriticInputV1 = {
  message_plan: MessagePlanV1
  generation_result: CandidateGenerationResultV1
  hard_gate_result: HardGateResultV1
}
