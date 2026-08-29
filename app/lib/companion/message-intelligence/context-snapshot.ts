import type {
  CommercialConfigProductOption,
  CommercialProductDefinition,
} from '@/app/types/commercial-config'

import type {
  CommercialFactDefinition,
} from '../commercial-fact-contract'

import type {
  CommercialObjectionDefinition,
} from '../commercial-objection-contract'

import type {
  CommercialMethodDefinition,
} from '../commercial-method-contract'

import type {
  CommercialReadingBestApproach,
  CommercialReadingCommercialRelevance,
  CommercialReadingCommercialRole,
  CommercialReadingCurrentMethodStage,
  CommercialReadingMethodAdherence,
  CommercialReadingRecoveryGuidance,
} from '../commercial-reading-contract'

import type {
  StatefulCommercialMemoryStatus,
} from '../stateful-commercial-state'

import type {
  SourcedValueV1,
  SourceTraceV1,
} from './source-trace'

export const MESSAGE_CONTEXT_SNAPSHOT_CONTRACT_VERSION =
  'message-context-snapshot-v1' as const

export type MessageContextSnapshotMessageV1 = {
  message_id: string
  message_key: string
  version: number
  sequence: number
  direction: 'incoming' | 'outgoing'
  occurred_at: string
  observed_at: string
  content_type: 'text' | 'audio'
  text_content: string | null
  audio_transcription: string | null
  canonical_state: 'active'
  provenance: SourceTraceV1[]
}

export type MessageContextSnapshotExcludedMessageV1 = {
  message_id: string
  message_key: string
  version: number
  reason: 'deleted'
  deletion_reason:
    | 'explicit_deletion'
    | 'dom_disappearance'
  canonical_state:
    | 'deleted'
    | 'unavailable'
  provenance: SourceTraceV1[]
}

export type MessageContextCurrentInteractionMessageV1 = {
  message_id: string
  direction: 'incoming' | 'outgoing'
  occurred_at: string
  content_type: 'text' | 'audio'
  text_content: string | null
  audio_transcription: string | null
  provenance: SourceTraceV1[]
}

export type MessageContextCurrentInteractionV1 = {
  messages:
    MessageContextCurrentInteractionMessageV1[]

  started_at: string
  ended_at: string

  provenance: SourceTraceV1[]
}

export type MessageContextMemoryCollectionV1 =
  | 'facts'
  | 'needs'
  | 'open_loops'
  | 'objections'
  | 'commitments'
  | 'signals'
  | 'uncertainties'

export type MessageContextMemoryItemV1 = {
  memory_id: string | null
  collection:
    MessageContextMemoryCollectionV1
  kind: string
  summary: string
  value: string | null
  confidence: string | null
  memory_status:
    StatefulCommercialMemoryStatus
  created_in_state_version: number | null
  updated_in_state_version: number | null
  closed_in_state_version: number | null
  evidence_message_ids: string[]
  attributes: Record<string, string | number | boolean | null>
  provenance: SourceTraceV1[]
}

export type MessageContextCustomerV1 = {
  objectives: MessageContextMemoryItemV1[]
  problems: MessageContextMemoryItemV1[]
  impacts: MessageContextMemoryItemV1[]
  needs: MessageContextMemoryItemV1[]
  interests: MessageContextMemoryItemV1[]
  decision_criteria: MessageContextMemoryItemV1[]
  preferences: MessageContextMemoryItemV1[]
  open_questions: MessageContextMemoryItemV1[]
  objections: MessageContextMemoryItemV1[]
  uncertainties: MessageContextMemoryItemV1[]
  products: MessageContextMemoryItemV1[]
  competitors: MessageContextMemoryItemV1[]
  commitments: MessageContextMemoryItemV1[]
  missing_discovery: MessageContextMemoryItemV1[]
  communication_observations:
    MessageContextMemoryItemV1[]
  signals: MessageContextMemoryItemV1[]
  resolved_information: MessageContextMemoryItemV1[]
  superseded_information: MessageContextMemoryItemV1[]
}

export type MessageContextPublishedMethodV1 = {
  config_version_id: string
  config_version_number: number
  definition: CommercialMethodDefinition
  provenance: SourceTraceV1[]
}

export type MessageContextCommercialConfigV1 = {
  config_version_id: string
  config_version_number: number
  business_description: string
  target_audience: string
  value_proposition: string
  communication_tone: string
  required_behaviors: string[]
  prohibited_behaviors: string[]
  provenance: SourceTraceV1[]
}

export type MessageContextProductV1 = {
  profile_id: string
  product_id: string
  definition: CommercialProductDefinition
  catalog: CommercialConfigProductOption | null
  provenance: SourceTraceV1[]
}

export type MessageContextFactV1 = {
  fact_id: string
  fact_key: string
  fact_value: string
  definition: CommercialFactDefinition
  provenance: SourceTraceV1[]
}

export type MessageContextObjectionGuideV1 = {
  objection_guide_id: string
  definition: CommercialObjectionDefinition
  provenance: SourceTraceV1[]
}

export type MessageContextCommercialV1 = {
  commercial_role:
    SourcedValueV1<CommercialReadingCommercialRole> | null

  commercial_relevance:
    SourcedValueV1<CommercialReadingCommercialRelevance> | null

  current_crm_status:
    SourcedValueV1<string> | null

  current_method_stage:
    SourcedValueV1<CommercialReadingCurrentMethodStage> | null

  method_adherence:
    SourcedValueV1<CommercialReadingMethodAdherence> | null

  recovery_guidance:
    SourcedValueV1<CommercialReadingRecoveryGuidance> | null

  best_approach:
    SourcedValueV1<CommercialReadingBestApproach> | null
}

export type MessageContextSnapshotV1 = {
  contract_version:
    typeof MESSAGE_CONTEXT_SNAPSHOT_CONTRACT_VERSION

  request_id: string
  reference_time: string

  identity: {
    company_id: string
    seller_user_id: string
    cycle_id: string
    conversation_key: string
    provenance: SourceTraceV1[]
  }

  seller_intent:
    SourcedValueV1<string>

  conversation: {
    messages:
      MessageContextSnapshotMessageV1[]

    excluded_messages:
      MessageContextSnapshotExcludedMessageV1[]

    current_interaction:
      MessageContextCurrentInteractionV1 | null
  }

  customer:
    MessageContextCustomerV1

  commercial:
    MessageContextCommercialV1

  company: {
    published_method:
      MessageContextPublishedMethodV1 | null

    commercial_config:
      MessageContextCommercialConfigV1 | null

    products:
      MessageContextProductV1[]

    facts:
      MessageContextFactV1[]

    objection_guides:
      MessageContextObjectionGuideV1[]
  }
}