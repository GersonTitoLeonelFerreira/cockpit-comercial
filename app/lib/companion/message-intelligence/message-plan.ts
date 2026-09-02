import type {
  KnowledgeGapV1,
} from './knowledge-gap'

import type {
  KnowledgeStatus,
} from './knowledge-resolution'

import type {
  SellerFormalityV1,
} from './seller-voice-profile'

import type {
  SourceTraceV1,
} from './source-trace'

import type {
  CommercialMoveDecisionV1,
  CommercialMoveV1,
  CommercialObjectiveV1,
  FrameworkReferenceV1,
  GovernanceConstraintV1,
  GovernanceStatusV1,
  MethodAlignmentStatusV1,
  ResponseModeV1,
  SituationClassificationV1,
  TechniqueSelectionStatusV1,
} from './strategy-contracts'

export const MESSAGE_PLAN_CONTRACT_VERSION =
  'message-plan-v1' as const

export const MESSAGE_PLAN_STATUSES = [
  'ready',
  'ready_with_constraints',
  'needs_information',
  'approval_required',
  'blocked',
] as const

export type MessagePlanStatusV1 =
  (typeof MESSAGE_PLAN_STATUSES)[number]

export const MESSAGE_PLAN_CONTENT_REQUIREMENTS = [
  'acknowledge_customer_point',
  'answer_requested_information',
  'explain_quote_requirement',
  'surface_verified_difference',
  'address_objection',
  'clarify_missing_information',
  'confirm_decision_criterion',
  'reduce_decision_risk',
  'recover_process',
  'propose_next_step',
  'confirm_commitment',
  'respect_customer_timing',
  'close_without_pressure',
  'acknowledge_non_commercial',
] as const

export type MessagePlanContentRequirementV1 =
  (typeof MESSAGE_PLAN_CONTENT_REQUIREMENTS)[number]

export type MessagePlanFactStatusV1 =
  | 'available'
  | 'missing'
  | 'conditioned'
  | 'conflicting'
  | 'forbidden'

export type MessagePlanFactNecessityV1 =
  | 'required'
  | 'supporting'

export type MessagePlanKnowledgeGapImpactV1 =
  | 'hard'
  | 'soft'
  | null

export type MessagePlanAssertionPolicyV1 =
  | 'may_assert'
  | 'describe_constraint_only'
  | 'must_not_assert'

export type MessagePlanFactRequirementV1 = {
  requirement_key: string
  necessity: MessagePlanFactNecessityV1
  status: MessagePlanFactStatusV1
  knowledge_status: KnowledgeStatus
  subject: Record<string, unknown>
  value: unknown | null
  gap: KnowledgeGapV1 | null
  gap_impact: MessagePlanKnowledgeGapImpactV1
  assertion_policy: MessagePlanAssertionPolicyV1
  provenance: SourceTraceV1[]
}

export type MessagePlanForbiddenContentV1 = {
  code: string
  source:
    | 'governance'
    | 'commercial_product'
    | 'commercial_config'
    | 'commercial_safety'
  rule: string
  provenance: SourceTraceV1[]
}

export type QuestionPlanPurposeV1 =
  | 'none'
  | 'clarify_request'
  | 'clarify_missing_information'
  | 'isolate_objection'
  | 'confirm_decision_criterion'
  | 'reduce_uncertainty'
  | 'obtain_context'

export type QuestionPlanTypeV1 =
  | 'none'
  | 'direct'
  | 'discovery'
  | 'objection_clarification'
  | 'decision_criterion'
  | 'context_clarification'

export type QuestionPlanV1 = {
  should_ask: boolean
  purpose: QuestionPlanPurposeV1
  max_questions: 0 | 1
  question_type: QuestionPlanTypeV1
  required_information: string[]
  avoid_reasking_known_fact: true
  known_information_skipped: string[]
}

export const NEXT_STEP_PLAN_KINDS = [
  'none',
  'clarify',
  'answer_and_wait',
  'ask',
  'propose_next_step',
  'confirm_commitment',
  'respect_timing',
  'give_space',
  'close',
  'escalate',
] as const

export type NextStepPlanKindV1 =
  (typeof NEXT_STEP_PLAN_KINDS)[number]

export type NextStepPlanV1 = {
  kind: NextStepPlanKindV1
  commercial_move: CommercialMoveV1
  requires_customer_action: boolean
  mutates_crm: false
  mutates_agenda: false
}

export type MessagePlanTargetLengthV1 =
  | 'short'
  | 'medium'
  | 'long'

export type MessagePlanDirectnessV1 =
  | 'direct'
  | 'balanced'

export type MessagePlanParagraphDensityV1 =
  | 'compact'
  | 'balanced'

export type MessagePlanQuestionDensityV1 =
  | 'none'
  | 'low'
  | 'balanced'

export type MessagePlanEmojiPolicyV1 =
  | 'none'
  | 'reduce'
  | 'preserve'
  | 'unconstrained'

export type MessagePlanPatternPolicyV1 =
  | 'preserve_seller'
  | 'omit'
  | 'unconstrained'

export type CommunicationStylePlanV1 = {
  target_length: MessagePlanTargetLengthV1
  directness: MessagePlanDirectnessV1
  paragraph_density: MessagePlanParagraphDensityV1
  question_density: MessagePlanQuestionDensityV1
  formality: SellerFormalityV1 | null
  emoji_policy: MessagePlanEmojiPolicyV1
  greeting_policy: MessagePlanPatternPolicyV1
  closing_policy: MessagePlanPatternPolicyV1
}

export type MessagePlanMethodAlignmentV1 = {
  status: MethodAlignmentStatusV1
  method_name: string | null
  stage_key: string | null
  recommended_move: CommercialMoveV1
  seller_requested_move: CommercialMoveV1 | null
  requested_move_outside_method: boolean
  reason: string
  constraints: string[]
}

export type MessagePlanTechniqueV1 = {
  status: TechniqueSelectionStatusV1
  technique_key: string | null
  commercial_move: CommercialMoveV1
  framework_reference: FrameworkReferenceV1 | null
  constraints: string[]
}

export type MessagePlanApprovalBoundaryV1 = {
  governance_status: GovernanceStatusV1
  requires_human_approval: boolean
  execution_before_approval:
    | 'not_applicable'
    | 'prohibited'
  constraints: GovernanceConstraintV1[]
}

export type MessagePlanGenerationConstraintSourceV1 =
  | 'governance'
  | 'knowledge'
  | 'method'
  | 'technique'
  | 'communication'

export type MessagePlanGenerationConstraintV1 = {
  code: string
  severity:
    | 'hard'
    | 'warning'
    | 'advisory'
  source: MessagePlanGenerationConstraintSourceV1
  detail: string
}

export type MessagePlanGenerationConstraintsV1 = {
  generation_allowed: boolean
  items: MessagePlanGenerationConstraintV1[]
}

export type MessagePlanEvidenceV1 = {
  message_ids: string[]
  memory_ids: string[]
}

export type MessagePlanV1 = {
  contract_version:
    typeof MESSAGE_PLAN_CONTRACT_VERSION

  status: MessagePlanStatusV1

  seller_intent: {
    value: string
    provenance: SourceTraceV1[]
  }

  situation: SituationClassificationV1
  commercial_objective: CommercialObjectiveV1
  response_mode: ResponseModeV1
  commercial_move: CommercialMoveDecisionV1

  method_alignment: MessagePlanMethodAlignmentV1
  governance_status: GovernanceStatusV1
  technique: MessagePlanTechniqueV1

  content_requirements:
    MessagePlanContentRequirementV1[]
  fact_requirements:
    MessagePlanFactRequirementV1[]
  knowledge_gaps: KnowledgeGapV1[]
  forbidden_content:
    MessagePlanForbiddenContentV1[]
  approval_boundaries:
    MessagePlanApprovalBoundaryV1

  question_plan: QuestionPlanV1
  next_step_plan: NextStepPlanV1
  communication_style:
    CommunicationStylePlanV1

  evidence: MessagePlanEvidenceV1
  provenance: SourceTraceV1[]

  generation_constraints:
    MessagePlanGenerationConstraintsV1
}
