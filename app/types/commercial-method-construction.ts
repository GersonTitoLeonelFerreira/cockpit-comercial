import type {
  CommercialMethodDefinition,
  CommercialMethodDimension,
  CommercialMethodStageRequirement,
} from '@/app/lib/companion/commercial-method-contract'

import type {
  CommercialMethodBuilderData,
} from '@/app/types/commercial-method-builder'

export const COMMERCIAL_METHOD_CONSTRUCTION_VERSION =
  'assisted-method-construction-v1' as const

export type CommercialMethodConstructionStatus =
  | 'not_started'
  | 'editing'
  | 'review_ready'

export type CommercialMethodConstructionStep =
  | 'structure'
  | 'stages'
  | 'principles'
  | 'review'

export type CommercialMethodConstructionStageSource =
  | 'yolen_suggestion'
  | 'manager'

export interface CommercialMethodConstructionDimensionDraft
  extends CommercialMethodDimension {
  id: string
}

export interface CommercialMethodConstructionStageDraft {
  id: string
  source: CommercialMethodConstructionStageSource
  suggestion_basis: string[]

  key: string
  name: string
  objective: string
  requirement: CommercialMethodStageRequirement

  completion_criteria: string[]
  partial_completion_criteria: string[]
  skip_conditions: string[]
  recommended_questions: string[]
  common_mistakes: string[]
  deepen_when: string[]
  sufficient_when: string[]
  advance_when: string[]
  wait_when: string[]
  stop_asking_when: string[]
  dimensions: CommercialMethodConstructionDimensionDraft[]
}

export interface CommercialMethodConstructionDraft {
  construction_version:
    typeof COMMERCIAL_METHOD_CONSTRUCTION_VERSION

  construction_step: CommercialMethodConstructionStep
  method_name: string
  method_description: string
  principles: string[]
  active_stage_id: string | null
  stages: CommercialMethodConstructionStageDraft[]
}

export interface CommercialMethodConstructionRecord {
  company_id: string
  ready_for_method: boolean
  diagnosis: CommercialMethodBuilderData
  status: CommercialMethodConstructionStatus
  construction: CommercialMethodConstructionDraft | null
  method_definition: CommercialMethodDefinition | null
  method_started_at: string | null
  method_updated_at: string | null
  updated_at: string
}

export interface CommercialMethodConstructionSaveInput {
  status: Exclude<CommercialMethodConstructionStatus, 'not_started'>
  construction: CommercialMethodConstructionDraft
}

export interface CommercialMethodConstructionQualityItem {
  level: 'pass' | 'warning'
  message: string
  stage_id?: string
}

export interface CommercialMethodStageAssistiveSuggestions {
  context_notes: string[]
  completion_criteria: string[]
  recommended_questions: string[]
  common_mistakes: string[]
}
