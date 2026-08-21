import type {
  DiagnosticLeadStatus,
} from './diagnostic-contract'

import {
  COMMERCIAL_READING_ANALYSIS_STATUSES,
  COMMERCIAL_READING_CHANNELS,
  COMMERCIAL_READING_COMMERCIAL_RELEVANCES,
  COMMERCIAL_READING_COMMERCIAL_ROLES,
  COMMERCIAL_READING_CONTRACT_VERSION,
  COMMERCIAL_READING_DECISIONS,
  COMMERCIAL_READING_EVOLUTION_STATUSES,
  COMMERCIAL_READING_IMPROVEMENT_KINDS,
  COMMERCIAL_READING_METHOD_STATUSES,
  COMMERCIAL_READING_MODEL_OUTPUT_FIELDS,
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
  })

const sellerStrengthSchema =
  objectSchema({
    kind:
      enumSchema(
        COMMERCIAL_READING_SELLER_STRENGTH_KINDS,
      ),

    summary:
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

    impact:
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
