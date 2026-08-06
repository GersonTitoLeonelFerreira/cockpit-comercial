import type {
  StatefulCopilotCommercialRole,
  StatefulCopilotCommitmentStatus,
  StatefulCopilotConfidence,
  StatefulCopilotEvidence,
} from './stateful-copilot-contract'

export const STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION =
  'phase-5.1-commercial-state-v1' as const

export const STATEFUL_COMMERCIAL_MEMORY_STATUSES = [
  'active',
  'resolved',
  'superseded',
] as const

export type StatefulCommercialMemoryStatus =
  (typeof STATEFUL_COMMERCIAL_MEMORY_STATUSES)[number]

export type StatefulCommercialMemoryBase = {
  id: string
  kind: string
  summary: string

  evidence_message_ids:
    string[]

  memory_status:
    StatefulCommercialMemoryStatus

  created_in_state_version:
    number

  updated_in_state_version:
    number

  closed_in_state_version:
    number | null
}

export type StatefulCommercialFact =
  StatefulCommercialMemoryBase & {
    value: string | null

    confidence:
      StatefulCopilotConfidence
  }

export type StatefulCommercialObservedItem =
  StatefulCommercialMemoryBase & {
    confidence:
      StatefulCopilotConfidence
  }

export type StatefulCommercialOpenLoop =
  StatefulCommercialMemoryBase

export type StatefulCommercialCommitment =
  StatefulCommercialMemoryBase & {
    commitment_status:
      StatefulCopilotCommitmentStatus

    scheduled_at:
      string | null

    proposed_at:
      string | null
  }

export type StatefulCommercialState = {
  contract_version:
    typeof STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION

  cycle_id: string

  version: number

  commercial_role:
    StatefulCopilotCommercialRole

  current_moment:
    StatefulCopilotEvidence

  current_priority:
    StatefulCopilotEvidence

  last_analyzed_message_ids:
    string[]

  last_evidence_message_ids:
    string[]

  facts:
    StatefulCommercialFact[]

  needs:
    StatefulCommercialObservedItem[]

  open_loops:
    StatefulCommercialOpenLoop[]

  objections:
    StatefulCommercialObservedItem[]

  commitments:
    StatefulCommercialCommitment[]

  signals:
    StatefulCommercialObservedItem[]

  uncertainties:
    StatefulCommercialObservedItem[]

  created_at: string
  updated_at: string
}

export type StatefulCommercialMemoryCollections = {
  facts:
    StatefulCommercialFact[]

  needs:
    StatefulCommercialObservedItem[]

  open_loops:
    StatefulCommercialOpenLoop[]

  objections:
    StatefulCommercialObservedItem[]

  commitments:
    StatefulCommercialCommitment[]

  signals:
    StatefulCommercialObservedItem[]

  uncertainties:
    StatefulCommercialObservedItem[]
}

export type StatefulCommercialCollectionName =
  keyof StatefulCommercialMemoryCollections

export function isStatefulCommercialMemoryStatus(
  value: unknown,
): value is StatefulCommercialMemoryStatus {
  return (
    typeof value === 'string' &&
    STATEFUL_COMMERCIAL_MEMORY_STATUSES
      .includes(
        value as StatefulCommercialMemoryStatus,
      )
  )
}

export function isPositiveStateVersion(
  value: unknown,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1
  )
}
