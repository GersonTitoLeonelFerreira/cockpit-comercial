import type {
  DiagnosticLeadStatus,
} from './diagnostic-contract'

import {
  COMMERCIAL_RELEVANCES,
  isCommercialRelevance,
  type CommercialRelevance,
} from './commercial-relevance'

export const STATEFUL_COPILOT_CONTRACT_VERSION =
  'phase-5.2-stateful-copilot-v3' as const

export const STATEFUL_COPILOT_COMMERCIAL_ROLES = [
  'buyer',
  'provider',
  'unknown',
] as const

export const STATEFUL_COPILOT_COMMERCIAL_RELEVANCES =
  COMMERCIAL_RELEVANCES

export const STATEFUL_COPILOT_CONFIDENCE_LEVELS = [
  'high',
  'medium',
  'low',
] as const

export const STATEFUL_COPILOT_COMMITMENT_STATUSES = [
  'proposed',
  'confirmed',
  'reschedule_requested',
  'cancelled',
  'completed',
] as const

export type StatefulCopilotCommercialRole =
  (typeof STATEFUL_COPILOT_COMMERCIAL_ROLES)[number]

export type StatefulCopilotCommercialRelevance =
  CommercialRelevance

export type StatefulCopilotConfidence =
  (typeof STATEFUL_COPILOT_CONFIDENCE_LEVELS)[number]

export type StatefulCopilotCommitmentStatus =
  (typeof STATEFUL_COPILOT_COMMITMENT_STATUSES)[number]

export type StatefulCopilotEvidence = {
  summary: string
  evidence_message_ids: string[]
}

export type StatefulCopilotContextualEvidence =
  StatefulCopilotEvidence & {
    memory_ids: string[]
  }

export type StatefulCopilotObservedItem =
  StatefulCopilotEvidence & {
    kind: string
    confidence: StatefulCopilotConfidence
  }

export type StatefulCopilotValueItem =
  StatefulCopilotObservedItem & {
    value: string | null
  }

export type StatefulCopilotOpenLoopCandidate =
  StatefulCopilotEvidence & {
    kind: string
  }

export type StatefulCopilotCommitmentPatch =
  StatefulCopilotEvidence & {
    commitment_id: string | null
    kind: string
    status: StatefulCopilotCommitmentStatus
    scheduled_at: string | null
    proposed_at: string | null
  }

export type StatefulCopilotStatePatch = {
  facts_to_add:
    StatefulCopilotValueItem[]

  fact_ids_to_supersede:
    string[]

  needs_to_add:
    StatefulCopilotObservedItem[]

  need_ids_to_resolve:
    string[]

  open_loops_to_add:
    StatefulCopilotOpenLoopCandidate[]

  open_loop_ids_to_resolve:
    string[]

  objections_to_add:
    StatefulCopilotObservedItem[]

  objection_ids_to_resolve:
    string[]

  objection_ids_to_supersede:
    string[]

  commitments_to_upsert:
    StatefulCopilotCommitmentPatch[]

  signals_to_add:
    StatefulCopilotObservedItem[]

  signal_ids_to_resolve:
    string[]

  uncertainties_to_add:
    StatefulCopilotObservedItem[]

  uncertainty_ids_to_resolve:
    string[]
}

export type StatefulCopilotInterpretation = {
  what_changed:
    StatefulCopilotEvidence | null

  what_remains_valid:
    StatefulCopilotContextualEvidence[]

  current_moment:
    StatefulCopilotContextualEvidence

  customer_need:
    StatefulCopilotContextualEvidence | null

  uncertainties:
    StatefulCopilotContextualEvidence[]
}

export type StatefulCopilotStrategy = {
  method_application: string
  rationale: string
  next_move: string

  recommended_question:
    string | null

  suggested_message:
    string | null

  evidence_message_ids:
    string[]

  memory_ids:
    string[]
}

export type StatefulCopilotCrmSuggestion = {
  should_change_crm_stage: boolean

  recommended_status:
    DiagnosticLeadStatus | null

  rationale:
    string | null

  requires_human_confirmation:
    true
}

export type StatefulCopilotAgendaSuggestion = {
  should_change_agenda: boolean

  expected_next_action_at:
    string | null

  rationale:
    string | null

  requires_human_confirmation:
    true
}

export type StatefulCopilotOutput = {
  contract_version:
    typeof STATEFUL_COPILOT_CONTRACT_VERSION

  previous_state_version:
    number | null

  analyzed_message_ids:
    string[]

  commercial_role:
    StatefulCopilotCommercialRole

  commercial_relevance:
    StatefulCopilotCommercialRelevance

  interpretation:
    StatefulCopilotInterpretation

  state_patch:
    StatefulCopilotStatePatch

  strategy:
    StatefulCopilotStrategy

  operational_suggestions: {
    crm:
      StatefulCopilotCrmSuggestion

    agenda:
      StatefulCopilotAgendaSuggestion
  }

  evidence_message_ids:
    string[]

  memory_ids:
    string[]
}

export function isStatefulCopilotCommercialRole(
  value: unknown,
): value is StatefulCopilotCommercialRole {
  return (
    typeof value === 'string' &&
    STATEFUL_COPILOT_COMMERCIAL_ROLES
      .includes(
        value as StatefulCopilotCommercialRole,
      )
  )
}

export function isStatefulCopilotCommercialRelevance(
  value: unknown,
): value is StatefulCopilotCommercialRelevance {
  return isCommercialRelevance(
    value,
  )
}

export function isStatefulCopilotConfidence(
  value: unknown,
): value is StatefulCopilotConfidence {
  return (
    typeof value === 'string' &&
    STATEFUL_COPILOT_CONFIDENCE_LEVELS
      .includes(
        value as StatefulCopilotConfidence,
      )
  )
}

export function isStatefulCopilotCommitmentStatus(
  value: unknown,
): value is StatefulCopilotCommitmentStatus {
  return (
    typeof value === 'string' &&
    STATEFUL_COPILOT_COMMITMENT_STATUSES
      .includes(
        value as StatefulCopilotCommitmentStatus,
      )
  )
}
