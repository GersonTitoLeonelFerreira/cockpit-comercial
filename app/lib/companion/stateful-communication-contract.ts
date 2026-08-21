import type {
  CommercialReading,
  CommercialReadingNormalizationContext,
} from './commercial-reading-contract'

import type {
  StatefulCopilotAgendaSuggestion,
  StatefulCopilotCommercialRole,
  StatefulCopilotCrmSuggestion,
} from './stateful-copilot-contract'

export const STATEFUL_COMMUNICATION_CONTRACT_VERSION =
  'phase-5.2-communication-v2' as const

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

  commercial_reading:
    CommercialReading
}

export type StatefulCommunicationNormalizationContext = {
  commercial_role:
    StatefulCopilotCommercialRole

  commercial_reading:
    CommercialReadingNormalizationContext

  expected_analysis_status:
    CommercialReading['analysis_status']

  expected_analysis_limitations:
    string[]

  expected_crm:
    StatefulCopilotCrmSuggestion

  expected_agenda:
    StatefulCopilotAgendaSuggestion
}
