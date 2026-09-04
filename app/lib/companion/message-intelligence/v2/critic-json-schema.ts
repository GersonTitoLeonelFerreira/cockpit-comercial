// ============================================================================
// Message Intelligence Engine V2 — Semantic Critic
// JSON Schema estrito (Structured Outputs).
// ============================================================================

import {
  MESSAGE_INTELLIGENCE_V2_CRITIC_MODEL_OUTPUT_FIELDS,
  MESSAGE_INTELLIGENCE_V2_CRITIC_REASON_CODES,
  MESSAGE_INTELLIGENCE_V2_CRITIC_VERDICTS,
} from './critic-contract'

export const MESSAGE_INTELLIGENCE_V2_CRITIC_RESPONSE_FORMAT_NAME =
  'yolen_message_intelligence_v2_critic' as const

const MAX_REASON_CODES = 6
const MAX_UNSUPPORTED_CLAIM_INDEXES = 12
const MAX_CONCISE_FEEDBACK_LENGTH = 500

type JsonSchema = Record<string, unknown>

function deepFreeze<T>(value: T): T {
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
      value as Record<string, unknown>,
    )
  ) {
    deepFreeze(nestedValue)
  }

  return Object.freeze(value)
}

const criticModelProperties = {
  verdict: {
    type: 'string',
    enum: [
      ...MESSAGE_INTELLIGENCE_V2_CRITIC_VERDICTS,
    ],
  },

  reason_codes: {
    type: 'array',
    maxItems: MAX_REASON_CODES,
    items: {
      type: 'string',
      enum: [
        ...MESSAGE_INTELLIGENCE_V2_CRITIC_REASON_CODES,
      ],
    },
  },

  unsupported_claim_indexes: {
    type: 'array',
    maxItems:
      MAX_UNSUPPORTED_CLAIM_INDEXES,
    items: {
      type: 'integer',
      minimum: 0,
    },
  },

  missing_grounded_claim: {
    type: 'boolean',
  },
  claim_source_mismatch: {
    type: 'boolean',
  },
  semantic_mismatch: {
    type: 'boolean',
  },
  repeated_resolved_question: {
    type: 'boolean',
  },
  commitment_assumption: {
    type: 'boolean',
  },
  seller_intent_became_fact: {
    type: 'boolean',
  },
  seller_intent_not_executed: {
    type: 'boolean',
  },
  unnatural_seller_message: {
    type: 'boolean',
  },
  method_violation: {
    type: 'boolean',
  },

  concise_feedback: {
    anyOf: [
      {
        type: 'string',
        description:
          `Texto curto (até ${MAX_CONCISE_FEEDBACK_LENGTH} caracteres) explicando o veredito. Sem chain-of-thought.`,
      },
      {
        type: 'null',
      },
    ],
  },
} satisfies Record<
  (typeof MESSAGE_INTELLIGENCE_V2_CRITIC_MODEL_OUTPUT_FIELDS)[number],
  JsonSchema
>

export const MESSAGE_INTELLIGENCE_V2_CRITIC_JSON_SCHEMA =
  deepFreeze({
    type: 'object',
    additionalProperties: false,
    properties: criticModelProperties,
    required: [
      ...MESSAGE_INTELLIGENCE_V2_CRITIC_MODEL_OUTPUT_FIELDS,
    ],
  })

export const MESSAGE_INTELLIGENCE_V2_CRITIC_STRUCTURED_OUTPUT_FORMAT =
  deepFreeze({
    type: 'json_schema',
    name:
      MESSAGE_INTELLIGENCE_V2_CRITIC_RESPONSE_FORMAT_NAME,
    description:
      'Revisão semântica de uma candidate de mensagem seller-facing gerada pelo MIE V2 da Yolen.',
    strict: true,
    schema:
      MESSAGE_INTELLIGENCE_V2_CRITIC_JSON_SCHEMA,
  })

export {
  MAX_CONCISE_FEEDBACK_LENGTH,
  MAX_REASON_CODES,
  MAX_UNSUPPORTED_CLAIM_INDEXES,
}
