import {
  STATEFUL_COMMUNICATION_CONTRACT_VERSION,
} from './stateful-communication-contract'

export const STATEFUL_COMMUNICATION_RESPONSE_FORMAT_NAME =
  'yolen_stateful_communication_v1' as const

type JsonSchema =
  Record<string, unknown>

function deepFreeze<T>(
  value: T,
): T {
  if (
    value === null ||
    typeof value !== 'object' ||
    Object.isFrozen(value)
  ) {
    return value
  }

  for (
    const nestedValue of
    Object.values(
      value as Record<
        string,
        unknown
      >,
    )
  ) {
    deepFreeze(
      nestedValue,
    )
  }

  return Object.freeze(
    value,
  )
}

function nullableStringSchema(): JsonSchema {
  return {
    anyOf: [
      {
        type:
          'string',
      },

      {
        type:
          'null',
      },
    ],
  }
}

export const STATEFUL_COMMUNICATION_JSON_SCHEMA =
  deepFreeze({
    type:
      'object',

    additionalProperties:
      false,

    properties: {
      contract_version: {
        type:
          'string',

        enum: [
          STATEFUL_COMMUNICATION_CONTRACT_VERSION,
        ],
      },

      intervention_needed: {
        type:
          'boolean',
      },

      method_application: {
        type:
          'string',
      },

      guidance: {
        type:
          'string',
      },

      recommended_question:
        nullableStringSchema(),

      suggested_message:
        nullableStringSchema(),
    },

    required: [
      'contract_version',
      'intervention_needed',
      'method_application',
      'guidance',
      'recommended_question',
      'suggested_message',
    ],
  })

export const STATEFUL_COMMUNICATION_STRUCTURED_OUTPUT_FORMAT =
  deepFreeze({
    type:
      'json_schema',

    name:
      STATEFUL_COMMUNICATION_RESPONSE_FORMAT_NAME,

    description:
      'Decisão de comunicação contextual do Companion da Yolen.',

    strict:
      true,

    schema:
      STATEFUL_COMMUNICATION_JSON_SCHEMA,
  })
