import type {
  StatefulCopilotCommercialRole,
} from './stateful-copilot-contract'

export const STATEFUL_COMMUNICATION_CONTRACT_VERSION =
  'phase-5.2-communication-v1' as const

export type StatefulCommunicationOutput = {
  contract_version:
    typeof STATEFUL_COMMUNICATION_CONTRACT_VERSION

  intervention_needed:
    boolean

  method_application:
    string

  guidance:
    string

  recommended_question:
    string | null

  suggested_message:
    string | null
}

export type StatefulCommunicationNormalizationContext = {
  commercial_role:
    StatefulCopilotCommercialRole
}
