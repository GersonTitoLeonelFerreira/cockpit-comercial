import type {
  DiagnosticLeadStatus,
} from './diagnostic-contract'

import {
  COMMERCIAL_READING_ANALYSIS_STATUSES,
  COMMERCIAL_READING_CHANNELS,
  COMMERCIAL_READING_COMMUNICATION_BEHAVIORS,
  COMMERCIAL_READING_COMMUNICATION_OBSERVATION_TYPES,
  COMMERCIAL_READING_COMMERCIAL_RELEVANCES,
  COMMERCIAL_READING_COMMERCIAL_ROLES,
  COMMERCIAL_READING_COMPETITOR_MENTION_TYPES,
  COMMERCIAL_READING_CONTRACT_VERSION,
  COMMERCIAL_READING_CUSTOMER_HISTORY_CATEGORIES,
  COMMERCIAL_READING_DECISIONS,
  COMMERCIAL_READING_EVOLUTION_STATUSES,
  COMMERCIAL_READING_IMPROVEMENT_KINDS,
  COMMERCIAL_READING_METHOD_ADHERENCE_STATUSES,
  COMMERCIAL_READING_METHOD_STATUSES,
  COMMERCIAL_READING_MISSING_DISCOVERY_TOPICS,
  COMMERCIAL_READING_MODEL_OUTPUT_FIELDS,
  COMMERCIAL_READING_PRODUCT_INTEREST_LEVELS,
  COMMERCIAL_READING_RISK_SEVERITIES,
  COMMERCIAL_READING_SELLER_STRENGTH_KINDS,
} from './commercial-reading-contract'

export const COMMERCIAL_READING_RESPONSE_FORMAT_NAME =
  'yolen_commercial_reading_v1' as const

const LEAD_STATUSES = [
  'novo',
  'contato',
  'respondeu',
  'negociacao',
  'pausado',
  'cancelado',
  'ganho',
  'perdido',
] as const satisfies
  readonly DiagnosticLeadStatus[]

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

function objectSchema(
  properties:
    Record<string, JsonSchema>,
): JsonSchema {
  return {
    type:
      'object',

    additionalProperties:
      false,

    properties,

    required:
      Object.keys(
        properties,
      ),
  }
}

function arraySchema(
  items: JsonSchema,
): JsonSchema {
  return {
    type:
      'array',

    items,
  }
}

function enumSchema(
  values:
    readonly unknown[],
): JsonSchema {
  return {
    enum: [
      ...values,
    ],
  }
}

function nullableSchema(
  schema: JsonSchema,
): JsonSchema {
  return {
    anyOf: [
      schema,

      {
        type:
          'null',
      },
    ],
  }
}

const stringSchema:
  JsonSchema = {
    type:
      'string',
  }

const integerSchema:
  JsonSchema = {
    type:
      'integer',
  }

const booleanSchema:
  JsonSchema = {
    type:
      'boolean',
  }

const literalTrueSchema:
  JsonSchema = {
    type:
      'boolean',

    enum: [
      true,
    ],
  }

const stringArraySchema =
  arraySchema(
    stringSchema,
  )

const nullableStringSchema =
  nullableSchema(
    stringSchema,
  )

const referenceFields = {
  evidence_message_ids:
    stringArraySchema,

  memory_ids:
    stringArraySchema,
}

const evidenceItemSchema =
  objectSchema({
    summary:
      stringSchema,

    ...referenceFields,
  })

const nullableEvidenceItemSchema =
  nullableSchema(
    evidenceItemSchema,
  )

const conversationSummarySchema =
  objectSchema({
    initial_context:
      nullableEvidenceItemSchema,

    evolution:
      nullableEvidenceItemSchema,

    important_events:
      arraySchema(
        evidenceItemSchema,
      ),

    current_state:
      evidenceItemSchema,

    last_customer_request_or_decision:
      nullableEvidenceItemSchema,
  })

const customerSchema =
  objectSchema({
    objectives:
      arraySchema(
        evidenceItemSchema,
      ),

    problems:
      arraySchema(
        evidenceItemSchema,
      ),

    impacts:
      arraySchema(
        evidenceItemSchema,
      ),

    needs:
      arraySchema(
        evidenceItemSchema,
      ),

    interests:
      arraySchema(
        evidenceItemSchema,
      ),

    decision_criteria:
      arraySchema(
        evidenceItemSchema,
      ),

    preferences:
      arraySchema(
        evidenceItemSchema,
      ),

    open_questions:
      arraySchema(
        evidenceItemSchema,
      ),

    objections:
      arraySchema(
        evidenceItemSchema,
      ),

    uncertainties:
      arraySchema(
        evidenceItemSchema,
      ),

    discussed_products:
      arraySchema(
        objectSchema({
          canonical_product_id:
            nullableStringSchema,

          name:
            stringSchema,

          interest_level:
            enumSchema(
              COMMERCIAL_READING_PRODUCT_INTEREST_LEVELS,
            ),

          summary:
            stringSchema,

          ...referenceFields,
        }),
      ),

    primary_product_interest:
      nullableSchema(
        objectSchema({
          canonical_product_id:
            nullableStringSchema,

          name:
            stringSchema,

          interest_level:
            enumSchema(
              COMMERCIAL_READING_PRODUCT_INTEREST_LEVELS,
            ),

          summary:
            stringSchema,

          ...referenceFields,
        }),
      ),

    competitors:
      arraySchema(
        objectSchema({
          name:
            nullableStringSchema,

          mention_type:
            enumSchema(
              COMMERCIAL_READING_COMPETITOR_MENTION_TYPES,
            ),

          summary:
            stringSchema,

          ...referenceFields,
        }),
      ),

    commitments:
      arraySchema(
        objectSchema({
          status:
            enumSchema([
              'proposed',
              'confirmed',
              'reschedule_requested',
              'cancelled',
              'completed',
            ] as const),

          scheduled_at:
            nullableStringSchema,

          proposed_at:
            nullableStringSchema,

          summary:
            stringSchema,

          ...referenceFields,
        }),
      ),

    missing_discovery:
      arraySchema(
        objectSchema({
          topic:
            enumSchema(
              COMMERCIAL_READING_MISSING_DISCOVERY_TOPICS,
            ),

          summary:
            stringSchema,

          ...referenceFields,
        }),
      ),

    resolved_information:
      arraySchema(
        objectSchema({
          category:
            enumSchema(
              COMMERCIAL_READING_CUSTOMER_HISTORY_CATEGORIES,
            ),

          summary:
            stringSchema,

          ...referenceFields,
        }),
      ),

    superseded_information:
      arraySchema(
        objectSchema({
          category:
            enumSchema(
              COMMERCIAL_READING_CUSTOMER_HISTORY_CATEGORIES,
            ),

          summary:
            stringSchema,

          ...referenceFields,
        }),
      ),

    communication:
      objectSchema({
        events:
          arraySchema(
            objectSchema({
              observation_type:
                enumSchema(
                  COMMERCIAL_READING_COMMUNICATION_OBSERVATION_TYPES,
                ),

              behavior:
                enumSchema(
                  COMMERCIAL_READING_COMMUNICATION_BEHAVIORS,
                ),

              summary:
                stringSchema,

              ...referenceFields,
            }),
          ),

        patterns:
          arraySchema(
            objectSchema({
              observation_type:
                enumSchema(
                  COMMERCIAL_READING_COMMUNICATION_OBSERVATION_TYPES,
                ),

              behavior:
                enumSchema(
                  COMMERCIAL_READING_COMMUNICATION_BEHAVIORS,
                ),

              summary:
                stringSchema,

              ...referenceFields,
            }),
          ),
      }),
  })

const evolutionItemSchema =
  objectSchema({
    key:
      stringSchema,

    label:
      stringSchema,

    status:
      enumSchema(
        COMMERCIAL_READING_EVOLUTION_STATUSES,
      ),

    explanation:
      stringSchema,

    ...referenceFields,
  })

const methodStageSchema =
  objectSchema({
    step_order:
      integerSchema,

    stage_key:
      nullableStringSchema,

    name:
      stringSchema,

    status:
      enumSchema(
        COMMERCIAL_READING_METHOD_STATUSES,
      ),

    explanation:
      stringSchema,

    ...referenceFields,
  })

const methodStageModelSchema =
  objectSchema({
    step_order:
      integerSchema,

    status:
      enumSchema(
        COMMERCIAL_READING_METHOD_STATUSES,
      ),

    explanation:
      stringSchema,

    ...referenceFields,
  })

const currentMethodStageSchema =
  objectSchema({
    step_order:
      integerSchema,

    stage_key:
      nullableStringSchema,

    name:
      stringSchema,
  })

const methodAdherenceSchema =
  objectSchema({
    status:
      enumSchema(
        COMMERCIAL_READING_METHOD_ADHERENCE_STATUSES,
      ),

    summary:
      stringSchema,

    deviation_stage_order:
      nullableSchema(
        integerSchema,
      ),

    what_happened:
      nullableStringSchema,

    missing_information:
      stringArraySchema,

    why_it_matters:
      nullableStringSchema,

    ...referenceFields,
  })

const recoveryGuidanceSchema =
  objectSchema({
    objective:
      stringSchema,

    missing_information:
      stringArraySchema,

    recommended_move:
      stringSchema,

    optional_question:
      nullableStringSchema,

    ...referenceFields,
  })

const methodSchema =
  objectSchema({
    configured:
      booleanSchema,

    name:
      nullableStringSchema,

    stages:
      arraySchema(
        methodStageSchema,
      ),

    current_stage:
      nullableSchema(
        currentMethodStageSchema,
      ),

    adherence:
      methodAdherenceSchema,

    recovery_guidance:
      nullableSchema(
        recoveryGuidanceSchema,
      ),
  })

const methodAdherenceWithoutDeviationModelSchema =
  objectSchema({
    status:
      enumSchema([
        'on_method',
        'partially_on_method',
        'insufficient_evidence',
      ] as const),

    summary:
      stringSchema,

    deviation_stage_order: {
      type:
        'null',
    },

    what_happened: {
      type:
        'null',
    },

    missing_information:
      stringArraySchema,

    why_it_matters: {
      type:
        'null',
    },

    ...referenceFields,
  })

const offMethodAdherenceModelSchema =
  objectSchema({
    status:
      enumSchema([
        'off_method',
      ] as const),

    summary:
      stringSchema,

    deviation_stage_order:
      integerSchema,

    what_happened:
      stringSchema,

    missing_information:
      stringArraySchema,

    why_it_matters:
      stringSchema,

    ...referenceFields,
  })

const methodModelSchema = {
  anyOf: [
    {
      type:
        'null',
    },

    objectSchema({
      stages:
        arraySchema(
          methodStageModelSchema,
        ),

      adherence:
        methodAdherenceWithoutDeviationModelSchema,

      recovery_guidance: {
        type:
          'null',
      },
    }),

    objectSchema({
      stages:
        arraySchema(
          methodStageModelSchema,
        ),

      adherence:
        offMethodAdherenceModelSchema,

      recovery_guidance:
        recoveryGuidanceSchema,
    }),
  ],
}

const sellerStrengthSchema =
  objectSchema({
    kind:
      enumSchema(
        COMMERCIAL_READING_SELLER_STRENGTH_KINDS,
      ),

    summary:
      stringSchema,

    why_it_matters:
      stringSchema,

    ...referenceFields,
  })

const improvementPointSchema =
  objectSchema({
    kind:
      enumSchema(
        COMMERCIAL_READING_IMPROVEMENT_KINDS,
      ),

    summary:
      stringSchema,

    why_it_matters:
      stringSchema,

    impact:
      stringSchema,

    how_to_improve:
      stringSchema,

    ...referenceFields,
  })

const riskSchema =
  objectSchema({
    kind:
      stringSchema,

    severity:
      enumSchema(
        COMMERCIAL_READING_RISK_SEVERITIES,
      ),

    summary:
      stringSchema,

    ...referenceFields,
  })

const risksSchema =
  objectSchema({
    customer_objections:
      arraySchema(
        riskSchema,
      ),

    service_risks:
      arraySchema(
        riskSchema,
      ),
  })

const bestApproachSchema =
  objectSchema({
    decision:
      enumSchema(
        COMMERCIAL_READING_DECISIONS,
      ),

    reason:
      stringSchema,

    channel:
      enumSchema(
        COMMERCIAL_READING_CHANNELS,
      ),

    ...referenceFields,
  })

const communicationSchema =
  objectSchema({
    intervention_needed:
      booleanSchema,

    recommended_question:
      nullableStringSchema,

    recommended_message:
      nullableStringSchema,
  })

const crmSchema =
  objectSchema({
    should_change_crm_stage:
      booleanSchema,

    recommended_status:
      nullableSchema(
        enumSchema(
          LEAD_STATUSES,
        ),
      ),

    rationale:
      nullableStringSchema,

    requires_human_confirmation:
      literalTrueSchema,
  })

const agendaSchema =
  objectSchema({
    should_change_agenda:
      booleanSchema,

    expected_next_action_at:
      nullableStringSchema,

    rationale:
      nullableStringSchema,

    requires_human_confirmation:
      literalTrueSchema,
  })

const operationsSchema =
  objectSchema({
    crm:
      crmSchema,

    agenda:
      agendaSchema,
  })

const commercialReadingModelProperties = {
  conversation_summary:
    conversationSummarySchema,

  commercial_evolution:
    arraySchema(
      evolutionItemSchema,
    ),

  method:
    methodModelSchema,

  seller_strengths:
    arraySchema(
      sellerStrengthSchema,
    ),

  improvement_points:
    arraySchema(
      improvementPointSchema,
    ),

  risks:
    risksSchema,

  best_approach:
    bestApproachSchema,
} satisfies Record<
  (typeof COMMERCIAL_READING_MODEL_OUTPUT_FIELDS)[number],
  JsonSchema
>

export const COMMERCIAL_READING_MODEL_JSON_SCHEMA =
  deepFreeze(
    objectSchema(
      commercialReadingModelProperties,
    ),
  )

export const COMMERCIAL_READING_JSON_SCHEMA =
  deepFreeze(
    objectSchema({
      contract_version:
        enumSchema([
          COMMERCIAL_READING_CONTRACT_VERSION,
        ]),

      analysis_status:
        enumSchema(
          COMMERCIAL_READING_ANALYSIS_STATUSES,
        ),

      analysis_limitations:
        stringArraySchema,

      commercial_role:
        enumSchema(
          COMMERCIAL_READING_COMMERCIAL_ROLES,
        ),

      commercial_relevance:
        enumSchema(
          COMMERCIAL_READING_COMMERCIAL_RELEVANCES,
        ),

      conversation_summary:
        conversationSummarySchema,

      customer:
        customerSchema,

      commercial_evolution:
        arraySchema(
          evolutionItemSchema,
        ),

      method:
        methodSchema,

      seller_strengths:
        arraySchema(
          sellerStrengthSchema,
        ),

      improvement_points:
        arraySchema(
          improvementPointSchema,
        ),

      risks:
        risksSchema,

      best_approach:
        bestApproachSchema,

      communication:
        communicationSchema,

      operations:
        operationsSchema,

      evidence_message_ids:
        stringArraySchema,

      memory_ids:
        stringArraySchema,
    }),
  )

export const COMMERCIAL_READING_STRUCTURED_OUTPUT_FORMAT =
  deepFreeze({
    type:
      'json_schema',

    name:
      COMMERCIAL_READING_RESPONSE_FORMAT_NAME,

    description:
      'Leitura Comercial Completa estruturada do cérebro comercial da Yolen.',

    strict:
      true,

    schema:
      COMMERCIAL_READING_JSON_SCHEMA,
  })
