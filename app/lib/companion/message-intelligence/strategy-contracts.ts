import type {
  MessageContextSnapshotV1,
} from './context-snapshot'

export const COMMERCIAL_STRATEGY_CONTRACT_VERSION =
  'message-commercial-strategy-v1' as const

export const SITUATION_KEYS = [
  'information_request',
  'discovery',
  'objection',
  'uncertainty',
  'comparison',
  'follow_up',
  'commitment_pending',
  'postponement',
  'rejection',
  'recovery',
  'decision_pending',
  'closing',
  'non_commercial',
  'insufficient_context',
] as const

export type SituationKeyV1 =
  (typeof SITUATION_KEYS)[number]

export const COMMERCIAL_OBJECTIVES = [
  'answer_factually',
  'clarify_need',
  'advance_discovery',
  'address_objection',
  'reduce_uncertainty',
  'confirm_decision_criteria',
  'secure_next_step',
  'confirm_commitment',
  'respect_timing',
  'stop_pursuit',
  'recover_process',
  'reduce_decision_risk',
  'confirm_decision',
  'no_commercial_action',
  'obtain_context',
] as const

export type CommercialObjectiveV1 =
  (typeof COMMERCIAL_OBJECTIVES)[number]

export const RESPONSE_MODES = [
  'answer',
  'ask',
  'clarify',
  'acknowledge',
  'reframe',
  'recommend',
  'confirm',
  'advance',
  'wait',
  'give_space',
  'stop',
  'escalate',
] as const

export type ResponseModeV1 =
  (typeof RESPONSE_MODES)[number]

export const COMMERCIAL_MOVES = [
  'answer_directly',
  'clarify_request',
  'advance_discovery',
  'surface_impact',
  'confirm_decision_criteria',
  'isolate_objection',
  'resolve_objection',
  'reduce_decision_risk',
  'compare_on_criteria',
  'propose_next_step',
  'confirm_commitment',
  'recover_stalled_process',
  'respect_customer_timing',
  'give_customer_space',
  'close_conversation',
  'request_more_context',
  'no_commercial_move',
] as const

export type CommercialMoveV1 =
  (typeof COMMERCIAL_MOVES)[number]

export type SituationEvidenceV1 = {
  source:
    | 'message'
    | 'memory'
    | 'commercial_reading'
    | 'seller_intent'
    | 'knowledge_hint'
  ids: string[]
  signal: string
}

export type SituationClassificationV1 = {
  situation: SituationKeyV1
  confidence: 'high' | 'medium' | 'low'
  evidence: SituationEvidenceV1[]
}

export type CommercialMoveDecisionV1 = {
  move: CommercialMoveV1
  default_move: CommercialMoveV1
  reason: string
  source: 'strategy_default' | 'seller_request' | 'playbook'
  requested_move: CommercialMoveV1 | null
}

export type MethodAlignmentStatusV1 =
  | 'aligned'
  | 'advisory_deviation'
  | 'not_applicable'
  | 'insufficient_method_context'

export type MethodAlignmentV1 = {
  status: MethodAlignmentStatusV1
  method_name: string | null
  stage_key: string | null
  reason: string
  constraints: string[]
  requested_move_outside_method: boolean
}

export type GovernanceStatusV1 =
  | 'allowed'
  | 'allowed_with_warning'
  | 'approval_required'
  | 'blocked'

export type GovernanceConstraintSourceV1 =
  | 'commercial_config'
  | 'required_behavior'
  | 'prohibited_behavior'
  | 'product_forbidden_claim'
  | 'product_condition'
  | 'fact_limitation'
  | 'authority'
  | 'commercial_safety'
  | 'playbook'

export type GovernanceConstraintV1 = {
  code: string
  source: GovernanceConstraintSourceV1
  detail: string
}

export type GovernanceDecisionV1 = {
  status: GovernanceStatusV1
  constraints: GovernanceConstraintV1[]
  requires_human_approval: boolean
  reason: string
}

export type FrameworkReferenceV1 =
  | 'SPIN'
  | 'GAP'
  | 'Sandler'
  | 'Challenger'
  | 'MEDDPICC'
  | 'JOLT'
  | 'Cialdini'
  | 'Yolen-native'

export type TechniqueSelectionStatusV1 =
  | 'selected'
  | 'not_applicable'
  | 'withheld_by_governance'

export type TechniqueSelectionV1 = {
  status: TechniqueSelectionStatusV1
  technique_key: string | null
  commercial_move: CommercialMoveV1
  framework_reference: FrameworkReferenceV1 | null
  why_applicable: string
  constraints: string[]
}

export type StrategyAuthorityHintV1 =
  | 'allowed'
  | 'approval_required'
  | 'blocked'
  | 'unknown'

export type StrategyFactSupportHintV1 =
  | 'supported'
  | 'insufficient'
  | 'unknown'

export type StrategyKnowledgeHintsV1 = {
  situation_hint?: SituationKeyV1
  requested_move?: CommercialMoveV1
  authority?: StrategyAuthorityHintV1
  fact_support?: StrategyFactSupportHintV1
  evidence_ids?: string[]
  notes?: string[]
}

export type StrategyKnowledgeResolverV1 = (
  snapshot: MessageContextSnapshotV1,
) => StrategyKnowledgeHintsV1 | null

export type CommercialStrategyDependenciesV1 = {
  resolve_knowledge_hints?: StrategyKnowledgeResolverV1
}

export type CommercialStrategyDecisionV1 = {
  contract_version:
    typeof COMMERCIAL_STRATEGY_CONTRACT_VERSION
  situation: SituationClassificationV1
  commercial_objective: CommercialObjectiveV1
  response_mode: ResponseModeV1
  commercial_move: CommercialMoveDecisionV1
  method_alignment: MethodAlignmentV1
  governance: GovernanceDecisionV1
  technique_selection: TechniqueSelectionV1
  limitations: string[]
}
