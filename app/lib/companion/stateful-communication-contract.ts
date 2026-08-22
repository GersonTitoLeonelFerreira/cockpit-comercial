import type {
  CommercialReading,
  CommercialReadingModelOutput,
  CommercialReadingNormalizationContext,
  CommercialReadingSalesMethod,
} from './commercial-reading-contract'

import type {
  StatefulCopilotAgendaSuggestion,
  StatefulCopilotCommercialRelevance,
  StatefulCopilotCommercialRole,
  StatefulCopilotCrmSuggestion,
} from './stateful-copilot-contract'

import type {
  CompanionDiagnosticInput,
} from './diagnostic-input'

import type {
  StatefulCommercialState,
} from './stateful-commercial-state'

export const STATEFUL_COMMUNICATION_CONTRACT_VERSION =
  'phase-5.2-communication-v5' as const

export const STATEFUL_COMMUNICATION_MODEL_OUTPUT_FIELDS = [
  'intervention_needed',
  'recommended_question',
  'suggested_message',
  'commercial_reading',
] as const

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

export type StatefulCommunicationModelOutput =
  Omit<
    StatefulCommunicationOutput,
    | 'contract_version'
    | 'method_application'
    | 'guidance'
    | 'commercial_reading'
  > & {
    commercial_reading:
      CommercialReadingModelOutput
  }

export type StatefulCommunicationNormalizationContext = {
  candidate_state:
    StatefulCommercialState

  products:
    CompanionDiagnosticInput[
      'commercial_context'
    ]['products']

  commercial_role:
    StatefulCopilotCommercialRole

  commercial_relevance:
    StatefulCopilotCommercialRelevance

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

  sales_method:
    CommercialReadingSalesMethod
}
