import {
  COMMERCIAL_READING_MODEL_JSON_SCHEMA,
} from './commercial-reading-json-schema'

import {
  STATEFUL_COMMUNICATION_MODEL_OUTPUT_FIELDS,
} from './stateful-communication-contract'

export const STATEFUL_COMMUNICATION_RESPONSE_FORMAT_NAME =
  'yolen_stateful_communication_v5' as const

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

function nullableStringSchema(
  maximumLength: number,
): JsonSchema {
  return {
    anyOf: [
      {
        type:
          'string',

        description:
          `Texto não vazio com no máximo ${maximumLength} caracteres.`,
      },

      {
        type:
          'null',
      },
    ],
  }
}

const statefulCommunicationModelProperties = {
  intervention_needed: {
    type:
      'boolean',
  },

  recommended_question:
    nullableStringSchema(
      900,
    ),

  suggested_message:
    nullableStringSchema(
      900,
    ),

  commercial_reading:
    COMMERCIAL_READING_MODEL_JSON_SCHEMA,
} satisfies Record<
  (typeof STATEFUL_COMMUNICATION_MODEL_OUTPUT_FIELDS)[number],
  JsonSchema
>

export const STATEFUL_COMMUNICATION_JSON_SCHEMA =
  deepFreeze({
    type:
      'object',

    additionalProperties:
      false,

    properties:
      statefulCommunicationModelProperties,

    required: [
      ...STATEFUL_COMMUNICATION_MODEL_OUTPUT_FIELDS,
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


function cloneJsonSchema<T>(
  value: T,
): T {
  return JSON.parse(
    JSON.stringify(
      value,
    ),
  ) as T
}

export function buildStatefulCommunicationStructuredOutputFormat({
  method_assessment_allowed,
}: {
  method_assessment_allowed:
    boolean
}) {
  if (
    method_assessment_allowed
  ) {
    return STATEFUL_COMMUNICATION_STRUCTURED_OUTPUT_FORMAT
  }

  const schema =
    cloneJsonSchema(
      STATEFUL_COMMUNICATION_JSON_SCHEMA,
    ) as JsonSchema

  const rootProperties =
    schema.properties as
      Record<
        string,
        JsonSchema
      >

  const commercialReadingSchema =
    rootProperties
      .commercial_reading

  const commercialReadingProperties =
    commercialReadingSchema
      .properties as
      Record<
        string,
        JsonSchema
      >

  commercialReadingProperties
    .method = {
    type:
      'null',
  }

  return deepFreeze({
    ...STATEFUL_COMMUNICATION_STRUCTURED_OUTPUT_FORMAT,

    schema,
  })
}
