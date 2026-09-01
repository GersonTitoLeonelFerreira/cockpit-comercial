import type {
  CandidateGenerationResultV1,
  MessageCandidateV1,
} from './message-candidate'

import type {
  HardGateResultV1,
} from './hard-gate-contracts'

import type {
  CandidateCriticStatusV1,
  CriticResultV1,
} from './critic-contracts'

import type {
  MessagePlanV1,
} from './message-plan'

export const FINAL_MESSAGE_CONTRACT_VERSION =
  'final-message-v1' as const

export const SHADOW_EVALUATION_CONTRACT_VERSION =
  'message-intelligence-shadow-v1' as const

export const FINAL_MESSAGE_STATUSES = [
  'selected',
  'no_acceptable_message',
  'no_eligible_candidates',
  'blocked',
  'approval_required',
  'inconsistent_input',
] as const

export type FinalMessageStatusV1 =
  (typeof FINAL_MESSAGE_STATUSES)[number]

export const FINAL_MESSAGE_SELECTION_REASONS = [
  'best_recommended',
  'best_acceptable',
  'no_acceptable_candidate',
  'no_eligible_candidate',
  'hard_gate_blocked',
  'approval_required',
  'inconsistent_input',
] as const

export type FinalMessageSelectionReasonV1 =
  (typeof FINAL_MESSAGE_SELECTION_REASONS)[number]

export type SelectableCriticStatusV1 = Extract<
  CandidateCriticStatusV1,
  'recommended' | 'acceptable'
>

export type FinalMessageV1 = {
  candidate_id: string
  text: string
  critic_status: SelectableCriticStatusV1
  overall_score: number
  commercial_move: MessageCandidateV1['commercial_move']
  commercial_objective: MessageCandidateV1['commercial_objective']
  evidence: MessageCandidateV1['evidence']
  provenance: MessageCandidateV1['provenance']
}

export type FinalMessageResultV1 = {
  contract_version:
    typeof FINAL_MESSAGE_CONTRACT_VERSION
  status: FinalMessageStatusV1
  final_message: FinalMessageV1 | null
  selected_candidate_id: string | null
  selection_reason: FinalMessageSelectionReasonV1
  eligible_candidate_ids: string[]
  rejected_candidate_ids: string[]
}

export type FinalMessageInputV1 = {
  message_plan: MessagePlanV1
  generation_result: CandidateGenerationResultV1
  hard_gate_result: HardGateResultV1
  critic_result: CriticResultV1
}

export type ShadowEvaluationV1 = {
  contract_version:
    typeof SHADOW_EVALUATION_CONTRACT_VERSION
  final_status: FinalMessageStatusV1
  selected_candidate_id: string | null
  candidate_count: number
  hard_gate_pass_count: number
  critic_evaluated_count: number
  selected_critic_status: SelectableCriticStatusV1 | null
  selected_overall_score: number | null
  would_surface_message: boolean
  automatic_send: false
  automatic_crm_write: false
  automatic_agenda_write: false
}

export type ShadowEvaluationInputV1 = {
  generation_result: CandidateGenerationResultV1
  hard_gate_result: HardGateResultV1
  critic_result: CriticResultV1
  final_message_result: FinalMessageResultV1
}
