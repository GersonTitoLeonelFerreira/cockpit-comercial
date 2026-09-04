// ============================================================================
// Message Intelligence Engine V2 — JSON Schema estrito (Structured Outputs)
//
// Não dependemos de "retorne JSON" em texto livre: o schema é estrito
// (additionalProperties=false, required=todos os campos) e vai em
// text.format na Responses API, no mesmo padrão já auditado em
// stateful-communication-json-schema.ts.
// ============================================================================

import {
  COMMERCIAL_OBJECTIVES,
} from '../strategy-contracts'

import {
  MESSAGE_INTELLIGENCE_V2_EVIDENCE_SOURCES,
  MESSAGE_INTELLIGENCE_V2_MODEL_OUTPUT_FIELDS,
  MESSAGE_INTELLIGENCE_V2_TURN_RELEVANCE_VALUES,
} from './generation-contract'

export const MESSAGE_INTELLIGENCE_V2_RESPONSE_FORMAT_NAME =
  'yolen_message_intelligence_v2' as const

type JsonSchema =
  Record<string, unknown>

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

function nullableStringSchema(
  maximumLength: number,
): JsonSchema {
  return {
    anyOf: [
      {
        type: 'string',
        description:
          `Texto não vazio com no máximo ${maximumLength} caracteres.`,
      },
      {
        type: 'null',
      },
    ],
  }
}

function boundedStringArraySchema(
  maximumItems: number,
): JsonSchema {
  return {
    type: 'array',
    maxItems: maximumItems,
    items: {
      type: 'string',
    },
  }
}

const groundedClaimSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    claim: {
      type: 'string',
      description:
        'Afirmação verificável feita na mensagem (não cumprimentos, empatia ou transições neutras).',
    },
    supported_by: {
      type: 'object',
      additionalProperties: false,
      properties: {
        source: {
          type: 'string',
          enum: [
            ...MESSAGE_INTELLIGENCE_V2_EVIDENCE_SOURCES,
          ],
        },
        id: {
          type: 'string',
        },
      },
      required: [
        'source',
        'id',
      ],
    },
  },
  required: [
    'claim',
    'supported_by',
  ],
}

const safetySelfCheckSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    no_unsupported_commercial_claim: {
      type: 'boolean',
    },
    no_commitment_assumed_beyond_evidence: {
      type: 'boolean',
    },
    no_resolved_question_repeated: {
      type: 'boolean',
    },
  },
  required: [
    'no_unsupported_commercial_claim',
    'no_commitment_assumed_beyond_evidence',
    'no_resolved_question_repeated',
  ],
}

const messageIntelligenceV2ModelProperties = {
  intervention_needed: {
    type: 'boolean',
  },

  current_turn_relevance: {
    type: 'string',
    enum: [
      ...MESSAGE_INTELLIGENCE_V2_TURN_RELEVANCE_VALUES,
    ],
  },

  customer_meaning: {
    type: 'string',
    description:
      'Resumo curto e auditável do que o cliente quis dizer no turno atual. Não é chain-of-thought.',
  },

  seller_intent_interpretation: {
    type: 'string',
    description:
      'Resumo curto do objetivo do vendedor. seller_intent é instrução do vendedor, nunca fato do cliente.',
  },

  recommended_commercial_objective: {
    anyOf: [
      {
        type: 'string',
        enum: [
          ...COMMERCIAL_OBJECTIVES,
        ],
      },
      {
        type: 'null',
      },
    ],
  },

  method_alignment_summary:
    nullableStringSchema(600),

  evidence_message_ids:
    boundedStringArraySchema(40),

  evidence_memory_ids:
    boundedStringArraySchema(40),

  grounded_claims: {
    type: 'array',
    maxItems: 12,
    items: groundedClaimSchema,
  },

  safety_self_check:
    safetySelfCheckSchema,

  suggested_message:
    nullableStringSchema(900),
} satisfies Record<
  (typeof MESSAGE_INTELLIGENCE_V2_MODEL_OUTPUT_FIELDS)[number],
  JsonSchema
>

export const MESSAGE_INTELLIGENCE_V2_JSON_SCHEMA =
  deepFreeze({
    type: 'object',
    additionalProperties: false,
    properties:
      messageIntelligenceV2ModelProperties,
    required: [
      ...MESSAGE_INTELLIGENCE_V2_MODEL_OUTPUT_FIELDS,
    ],
  })

export const MESSAGE_INTELLIGENCE_V2_STRUCTURED_OUTPUT_FORMAT =
  deepFreeze({
    type: 'json_schema',
    name: MESSAGE_INTELLIGENCE_V2_RESPONSE_FORMAT_NAME,
    description:
      'Interpretação, condução e mensagem seller-facing gerada pelo Message Intelligence Engine V2 da Yolen.',
    strict: true,
    schema: MESSAGE_INTELLIGENCE_V2_JSON_SCHEMA,
  })
