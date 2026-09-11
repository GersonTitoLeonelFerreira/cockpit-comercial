import type {
  CommercialReadingDecision,
  CommercialReadingImprovementPoint,
  CommercialReadingSellerStrength,
} from './commercial-reading-contract'

import type {
  CommercialIntelligenceScope,
  CommercialIntelligenceKind,
} from './commercial-intelligence-contract'

export const COMMERCIAL_REASONING_CONTRACT_VERSION =
  'commercial-reasoning-v1' as const

export const COMMERCIAL_REASONING_STATUSES = [
  'ready',
  'limited',
  'silent',
] as const

export type CommercialReasoningStatus =
  (typeof COMMERCIAL_REASONING_STATUSES)[number]

export type CommercialReasoningTechnique = {
  intelligence_id: string
  title: string
  kind: CommercialIntelligenceKind
  scope: CommercialIntelligenceScope
  why_applicable: string
  risks: string[]
}

export type CommercialReasoningKnowledgeReference = {
  intelligence_id: string
  title: string
  scope: CommercialIntelligenceScope
  source_type: string
  source_id: string | null
  product_id: string | null
  why_relevant: string
}

export type CommercialReasoningSellerAssessment = {
  strengths: CommercialReadingSellerStrength[]
  improvement_points: CommercialReadingImprovementPoint[]
}

export type CommercialReasoningComparison = {
  similarities: string[]
  differences: string[]
}

export type CommercialReasoning = {
  contract_version:
    typeof COMMERCIAL_REASONING_CONTRACT_VERSION

  status: CommercialReasoningStatus

  decision: CommercialReadingDecision
  decision_reason: string

  current_situation: string
  objective_now: string

  do_not_do: string[]

  selected_techniques:
    CommercialReasoningTechnique[]

  company_knowledge_used:
    CommercialReasoningKnowledgeReference[]

  seller_assessment:
    CommercialReasoningSellerAssessment

  comparison:
    CommercialReasoningComparison

  evidence_message_ids: string[]
  memory_ids: string[]

  limitations: string[]
}
