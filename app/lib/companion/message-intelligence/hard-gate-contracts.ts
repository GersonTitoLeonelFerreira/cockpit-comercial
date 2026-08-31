import type {
  CandidateGenerationResultV1,
} from './message-candidate'

import type {
  MessagePlanV1,
} from './message-plan'

export const HARD_GATE_CONTRACT_VERSION =
  'hard-gate-v1' as const

export const HARD_GATE_CODES = [
  'GOVERNANCE_BLOCKED_CANDIDATE',
  'APPROVAL_REQUIRED_CANDIDATE',
  'GENERATION_NOT_ALLOWED_CANDIDATE',
  'GENERATION_STATUS_CANDIDATE_CONFLICT',
  'GENERATION_STATUS_PLAN_CONFLICT',
  'GENERATION_PLAN_STATUS_MISMATCH',
  'GENERATION_ALLOWED_MISMATCH',
  'GENERATION_MOVE_MISMATCH',
  'GENERATION_OBJECTIVE_MISMATCH',
  'COMMERCIAL_MOVE_MISMATCH',
  'COMMERCIAL_OBJECTIVE_MISMATCH',
  'QUESTION_LIMIT_EXCEEDED',
  'QUESTION_COUNT_MISMATCH',
  'SHOULD_NOT_ASK_HAS_QUESTION',
  'CONTENT_REQUIREMENT_MISSING',
  'CONTENT_REQUIREMENT_EXTRA',
  'CONTENT_COVERAGE_TEXT_INCONSISTENT',
  'FACT_REQUIREMENT_UNKNOWN',
  'FACT_USAGE_METADATA_MISSING',
  'MUST_NOT_ASSERT_REFERENCED',
  'MUST_NOT_ASSERT_TEXT',
  'FORBIDDEN_FACT_REFERENCED',
  'FORBIDDEN_FACT_TEXT',
  'HARD_GAP_HAS_CANDIDATE',
  'FORBIDDEN_CONTENT',
  'INTERNAL_JARGON_EXPOSED',
  'FRAMEWORK_EXPOSED',
  'PSYCHOLOGICAL_ATTRIBUTE_EXPOSED',
  'COMMAND_LEAKAGE',
  'EMPTY_TEXT',
  'EMPTY_CANDIDATE_ID',
  'DUPLICATE_CANDIDATE_ID',
  'INVALID_GENERATION_MODE',
  'EVIDENCE_MESSAGE_UNAUTHORIZED',
  'EVIDENCE_MEMORY_UNAUTHORIZED',
  'PROVENANCE_UNAUTHORIZED',
  'FACT_PROVENANCE_MISSING',
  'UNAUTHORIZED_MONETARY_ASSERTION',
  'UNAUTHORIZED_CTA',
  'REJECTION_REOPEN',
  'TIMING_PRESSURE',
  'TIMING_DATE_INVENTED',
  'NON_COMMERCIAL_CTA',
  'DUPLICATE_CANDIDATE_TEXT',
  'MAX_CANDIDATES_EXCEEDED',
] as const

export type HardGateCodeV1 =
  (typeof HARD_GATE_CODES)[number]

export type HardGateViolationSeverityV1 =
  | 'critical'
  | 'error'

export type HardGateViolationV1 = {
  code: HardGateCodeV1
  severity: HardGateViolationSeverityV1
  candidate_id: string | null
  detail: string
}

export type CandidateHardGateStatusV1 =
  | 'pass'
  | 'fail'

export type CandidateHardGateResultV1 = {
  candidate_id: string
  status: CandidateHardGateStatusV1
  violations: HardGateViolationV1[]
}

export const HARD_GATE_RESULT_STATUSES = [
  'all_passed',
  'partially_passed',
  'all_failed',
  'blocked',
  'approval_required',
] as const

export type HardGateResultStatusV1 =
  (typeof HARD_GATE_RESULT_STATUSES)[number]

export type HardGateResultV1 = {
  contract_version:
    typeof HARD_GATE_CONTRACT_VERSION
  status: HardGateResultStatusV1
  candidates: CandidateHardGateResultV1[]
  passed_candidate_ids: string[]
  failed_candidate_ids: string[]
  violations: HardGateViolationV1[]
}

export type HardGateInputV1 = {
  message_plan: MessagePlanV1
  generation_result: CandidateGenerationResultV1
}
