export type CommercialBuyerDecisionAnswer =
  | ''
  | 'no'
  | 'sometimes'
  | 'yes'

export type CommercialSolutionCustomization =
  | ''
  | 'standard'
  | 'some_adjustments'
  | 'highly_customized'

export type CommercialOperationIntensity =
  | ''
  | 'high_volume_short'
  | 'balanced'
  | 'few_complex'

export interface CommercialBuyerDecisionEventCriterion {
  event: string
  criteria: string[]
}

export interface CommercialBuyerDecisionDraft {
  confirmed: boolean

  approval_or_blocker: CommercialBuyerDecisionAnswer
  participant_roles: string[]
  other_participant_roles: string[]

  decision_criteria: string[]
  other_decision_criteria: string[]

  formal_process: CommercialBuyerDecisionAnswer
  formal_process_steps: string[]
  other_formal_process_steps: string[]

  investment_justification: CommercialBuyerDecisionAnswer
  investment_justification_notes: string

  real_urgency: CommercialBuyerDecisionAnswer
  urgency_drivers: string[]
  other_urgency_drivers: string[]

  event_success_criteria: CommercialBuyerDecisionEventCriterion[]

  solution_customization: CommercialSolutionCustomization
  operation_intensity: CommercialOperationIntensity

  buyer_commitment_signals: string[]
  formalization_steps: string[]
}

export interface CommercialBuyerDecisionVisibility {
  show_approval_and_blockers: boolean
  show_decision_criteria: boolean
  show_formal_process: boolean
  show_investment_justification: boolean
  show_real_urgency: boolean
  show_event_purpose: boolean
  show_customization: boolean
  show_operation_intensity: boolean
  show_decision_vs_formalization: boolean
}

export type CommercialBuyerDecisionDepth =
  | 'light'
  | 'moderate'
  | 'deep'

export interface CommercialBuyerDecisionProfile {
  depth: CommercialBuyerDecisionDepth
  discovery_depth: CommercialBuyerDecisionDepth
  decision_process: 'not_required' | 'recommended' | 'required'
  decision_criteria: 'not_required' | 'recommended' | 'required'
  approval_mapping: 'not_required' | 'recommended' | 'required'
  formal_buying_process: 'not_required' | 'recommended' | 'required'
  critical_event: 'not_required' | 'recommended' | 'required'
  presentation_evidence: 'not_required' | 'recommended' | 'required'
}
