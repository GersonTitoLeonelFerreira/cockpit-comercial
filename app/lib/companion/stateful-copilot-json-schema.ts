import type {
  DiagnosticLeadStatus,
} from './diagnostic-contract'

import {
  STATEFUL_COPILOT_COMMITMENT_STATUSES,
  STATEFUL_COPILOT_CONFIDENCE_LEVELS,
  STATEFUL_COPILOT_CONTRACT_VERSION,
  STATEFUL_COPILOT_COMMERCIAL_RELEVANCES,
  STATEFUL_COPILOT_COMMERCIAL_ROLES,
} from './stateful-copilot-contract'

export const STATEFUL_COPILOT_RESPONSE_FORMAT_NAME =
  'yolen_stateful_copilot_v3' as const

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

const booleanTrueSchema:
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

const evidenceSchema =
  objectSchema({
    summary:
      stringSchema,

    evidence_message_ids:
      stringArraySchema,
  })

const contextualEvidenceSchema =
  objectSchema({
    summary:
      stringSchema,

    evidence_message_ids:
      stringArraySchema,

    memory_ids:
      stringArraySchema,
  })

const observedItemSchema =
  objectSchema({
    kind:
      stringSchema,

    confidence:
      enumSchema(
        STATEFUL_COPILOT_CONFIDENCE_LEVELS,
      ),

    summary:
      stringSchema,

    evidence_message_ids:
      stringArraySchema,
  })

const valueItemSchema =
  objectSchema({
    kind:
      stringSchema,

    value:
      nullableStringSchema,

    confidence:
      enumSchema(
        STATEFUL_COPILOT_CONFIDENCE_LEVELS,
      ),

    summary:
      stringSchema,

    evidence_message_ids:
      stringArraySchema,
  })

const openLoopCandidateSchema =
  objectSchema({
    kind:
      stringSchema,

    summary:
      stringSchema,

    evidence_message_ids:
      stringArraySchema,
  })

const commitmentPatchSchema =
  objectSchema({
    commitment_id:
      nullableStringSchema,

    kind:
      stringSchema,

    status:
      enumSchema(
        STATEFUL_COPILOT_COMMITMENT_STATUSES,
      ),

    scheduled_at:
      nullableStringSchema,

    proposed_at:
      nullableStringSchema,

    summary:
      stringSchema,

    evidence_message_ids:
      stringArraySchema,
  })

const statePatchSchema =
  objectSchema({
    facts_to_add:
      arraySchema(
        valueItemSchema,
      ),

    fact_ids_to_supersede:
      stringArraySchema,

    needs_to_add:
      arraySchema(
        observedItemSchema,
      ),

    need_ids_to_resolve:
      stringArraySchema,

    open_loops_to_add:
      arraySchema(
        openLoopCandidateSchema,
      ),

    open_loop_ids_to_resolve:
      stringArraySchema,

    objections_to_add:
      arraySchema(
        observedItemSchema,
      ),

    objection_ids_to_resolve:
      stringArraySchema,

    objection_ids_to_supersede:
      stringArraySchema,

    commitments_to_upsert:
      arraySchema(
        commitmentPatchSchema,
      ),

    signals_to_add:
      arraySchema(
        observedItemSchema,
      ),

    signal_ids_to_resolve:
      stringArraySchema,

    uncertainties_to_add:
      arraySchema(
        observedItemSchema,
      ),

    uncertainty_ids_to_resolve:
      stringArraySchema,
  })

const interpretationSchema =
  objectSchema({
    what_changed:
      nullableSchema(
        evidenceSchema,
      ),

    what_remains_valid:
      arraySchema(
        contextualEvidenceSchema,
      ),

    current_moment:
      contextualEvidenceSchema,

    customer_need:
      nullableSchema(
        contextualEvidenceSchema,
      ),

    uncertainties:
      arraySchema(
        contextualEvidenceSchema,
      ),
  })

const strategySchema =
  objectSchema({
    method_application:
      stringSchema,

    rationale:
      stringSchema,

    next_move:
      stringSchema,

    recommended_question:
      nullableStringSchema,

    suggested_message:
      nullableStringSchema,

    evidence_message_ids:
      stringArraySchema,

    memory_ids:
      stringArraySchema,
  })

const diagnosticDeferredStrategyTextSchema:
  JsonSchema = {
  type:
    'string',

  enum: [
    'deferred_to_communication',
  ],
}

const diagnosticNullSchema:
  JsonSchema = {
  type:
    'null',
}

function buildDiagnosticStrategySchema({
  evidenceMessageIds,
  memoryIds,
}: {
  evidenceMessageIds:
    JsonSchema

  memoryIds:
    JsonSchema
}): JsonSchema {
  return objectSchema({
    method_application:
      diagnosticDeferredStrategyTextSchema,

    rationale:
      diagnosticDeferredStrategyTextSchema,

    next_move:
      diagnosticDeferredStrategyTextSchema,

    recommended_question:
      diagnosticNullSchema,

    suggested_message:
      diagnosticNullSchema,

    evidence_message_ids:
      evidenceMessageIds,

    memory_ids:
      memoryIds,
  })
}

const diagnosticStrategySchema =
  buildDiagnosticStrategySchema({
    evidenceMessageIds: {
      ...stringArraySchema,
      minItems:
        1,
    },

    memoryIds:
      stringArraySchema,
  })

const crmSuggestionSchema =
  objectSchema({
    should_change_crm_stage: {
      type:
        'boolean',
    },

    recommended_status:
      nullableSchema(
        enumSchema(
          LEAD_STATUSES,
        ),
      ),

    rationale:
      nullableStringSchema,

    requires_human_confirmation:
      booleanTrueSchema,
  })

const agendaSuggestionSchema =
  objectSchema({
    should_change_agenda: {
      type:
        'boolean',
    },

    expected_next_action_at:
      nullableStringSchema,

    rationale:
      nullableStringSchema,

    requires_human_confirmation:
      booleanTrueSchema,
  })

const operationalSuggestionsSchema =
  objectSchema({
    crm:
      crmSuggestionSchema,

    agenda:
      agendaSuggestionSchema,
  })

export const STATEFUL_COPILOT_JSON_SCHEMA =
  deepFreeze(
    objectSchema({
      contract_version:
        enumSchema([
          STATEFUL_COPILOT_CONTRACT_VERSION,
        ]),

      previous_state_version:
        nullableSchema(
          integerSchema,
        ),

      analyzed_message_ids:
        stringArraySchema,

      commercial_role:
        enumSchema(
          STATEFUL_COPILOT_COMMERCIAL_ROLES,
        ),

      commercial_relevance:
        enumSchema(
          STATEFUL_COPILOT_COMMERCIAL_RELEVANCES,
        ),

      interpretation:
        interpretationSchema,

      state_patch:
        statePatchSchema,

      strategy:
        strategySchema,

      operational_suggestions:
        operationalSuggestionsSchema,

      evidence_message_ids:
        stringArraySchema,

      memory_ids:
        stringArraySchema,
    }),
  )

export const STATEFUL_COPILOT_STRUCTURED_OUTPUT_FORMAT =
  deepFreeze({
    type:
      'json_schema',

    name:
      STATEFUL_COPILOT_RESPONSE_FORMAT_NAME,

    description:
      'Saída contextual stateful do Copiloto Comercial da Yolen.',

    strict:
      true,

    schema:
      STATEFUL_COPILOT_JSON_SCHEMA,
  })


function cloneStatefulCopilotJsonSchema<T>(
  value: T,
): T {
  return JSON.parse(
    JSON.stringify(
      value,
    ),
  ) as T
}

export const STATEFUL_COPILOT_DIAGNOSTIC_JSON_SCHEMA =
  (() => {
    const schema =
      cloneStatefulCopilotJsonSchema(
        STATEFUL_COPILOT_JSON_SCHEMA,
      ) as JsonSchema

    const properties =
      schema.properties as
        Record<
          string,
          JsonSchema
        >

    properties.strategy =
      diagnosticStrategySchema

    const diagnosticStatePatchProperties =
      (
        properties
          .state_patch
          .properties as
            Record<
              string,
              JsonSchema
            >
      )

    const diagnosticEvidenceCollections = [
      'facts_to_add',
      'needs_to_add',
      'open_loops_to_add',
      'objections_to_add',
      'commitments_to_upsert',
      'signals_to_add',
      'uncertainties_to_add',
    ] as const

    for (
      const collectionName of
      diagnosticEvidenceCollections
    ) {
      const collectionSchema =
        diagnosticStatePatchProperties[
          collectionName
        ]

      const itemSchema =
        collectionSchema
          .items as
            JsonSchema

      const itemProperties =
        itemSchema
          .properties as
            Record<
              string,
              JsonSchema
            >

      itemProperties
        .evidence_message_ids = {
        ...itemProperties
          .evidence_message_ids,

        minItems:
          1,
      }
    }

    const diagnosticInterpretationProperties =
      (
        properties
          .interpretation
          .properties as
            Record<
              string,
              JsonSchema
            >
      )

    const diagnosticCurrentMomentProperties =
      (
        diagnosticInterpretationProperties
          .current_moment
          .properties as
            Record<
              string,
              JsonSchema
            >
      )

    diagnosticCurrentMomentProperties
      .evidence_message_ids = {
      ...diagnosticCurrentMomentProperties
        .evidence_message_ids,

      minItems:
        1,
    }

    properties
      .analyzed_message_ids = {
      ...properties
        .analyzed_message_ids,

      minItems:
        1,
    }

    properties
      .evidence_message_ids = {
      ...properties
        .evidence_message_ids,

      minItems:
        1,
    }

    return deepFreeze(
      schema,
    )
  })()

export const STATEFUL_COPILOT_DIAGNOSTIC_STRUCTURED_OUTPUT_FORMAT =
  deepFreeze({
    type:
      'json_schema',

    name:
      'yolen_stateful_diagnostic_v1',

    description:
      'Diagnóstico contextual stateful sem duplicar a comunicação seller-facing.',

    strict:
      true,

    schema:
      STATEFUL_COPILOT_DIAGNOSTIC_JSON_SCHEMA,
  })

function buildDiagnosticMemoryArraySchema(
  activeMemoryIds:
    readonly string[],
): JsonSchema {
  if (
    activeMemoryIds.length ===
    0
  ) {
    return {
      ...stringArraySchema,

      maxItems:
        0,
    }
  }

  return arraySchema(
    enumSchema(
      activeMemoryIds,
    ),
  )
}

function buildDiagnosticNullableMemoryIdSchema(
  activeMemoryIds:
    readonly string[],
): JsonSchema {
  if (
    activeMemoryIds.length ===
    0
  ) {
    return {
      type:
        'null',
    }
  }

  return nullableSchema(
    enumSchema(
      activeMemoryIds,
    ),
  )
}

export function buildStatefulCopilotDiagnosticStructuredOutputFormat({
  active_memory_ids,
}: {
  active_memory_ids:
    readonly string[]
}) {
  const activeMemoryIds = [
    ...new Set(
      active_memory_ids,
    ),
  ]

  const schema =
    cloneStatefulCopilotJsonSchema(
      STATEFUL_COPILOT_DIAGNOSTIC_JSON_SCHEMA,
    ) as JsonSchema

  const rootProperties =
    schema.properties as
      Record<
        string,
        JsonSchema
      >

  const memoryArraySchema =
    buildDiagnosticMemoryArraySchema(
      activeMemoryIds,
    )

  const assignMemoryArray = (
    properties:
      Record<
        string,
        JsonSchema
      >,
    key:
      string,
  ) => {
    properties[key] =
      cloneStatefulCopilotJsonSchema(
        memoryArraySchema,
      )
  }

  assignMemoryArray(
    rootProperties,
    'memory_ids',
  )

  const interpretationProperties =
    rootProperties
      .interpretation
      .properties as
        Record<
          string,
          JsonSchema
        >

  const whatRemainsValidProperties =
    (
      interpretationProperties
        .what_remains_valid
        .items as JsonSchema
    )
      .properties as
        Record<
          string,
          JsonSchema
        >

  assignMemoryArray(
    whatRemainsValidProperties,
    'memory_ids',
  )

  const currentMomentProperties =
    interpretationProperties
      .current_moment
      .properties as
        Record<
          string,
          JsonSchema
        >

  assignMemoryArray(
    currentMomentProperties,
    'memory_ids',
  )

  const customerNeedAlternatives =
    interpretationProperties
      .customer_need
      .anyOf as
        JsonSchema[]

  const customerNeedProperties =
    customerNeedAlternatives[0]
      .properties as
        Record<
          string,
          JsonSchema
        >

  assignMemoryArray(
    customerNeedProperties,
    'memory_ids',
  )

  const uncertaintyProperties =
    (
      interpretationProperties
        .uncertainties
        .items as JsonSchema
    )
      .properties as
        Record<
          string,
          JsonSchema
        >

  assignMemoryArray(
    uncertaintyProperties,
    'memory_ids',
  )

  const strategyProperties =
    rootProperties
      .strategy
      .properties as
        Record<
          string,
          JsonSchema
        >

  assignMemoryArray(
    strategyProperties,
    'memory_ids',
  )

  const statePatchProperties =
    rootProperties
      .state_patch
      .properties as
        Record<
          string,
          JsonSchema
        >

  const statePatchMemoryReferences = [
    'fact_ids_to_supersede',
    'need_ids_to_resolve',
    'open_loop_ids_to_resolve',
    'objection_ids_to_resolve',
    'objection_ids_to_supersede',
    'signal_ids_to_resolve',
    'uncertainty_ids_to_resolve',
  ] as const

  for (
    const field of
    statePatchMemoryReferences
  ) {
    assignMemoryArray(
      statePatchProperties,
      field,
    )
  }

  const commitmentProperties =
    (
      statePatchProperties
        .commitments_to_upsert
        .items as JsonSchema
    )
      .properties as
        Record<
          string,
          JsonSchema
        >

  commitmentProperties
    .commitment_id =
    buildDiagnosticNullableMemoryIdSchema(
      activeMemoryIds,
    )

  return deepFreeze({
    ...STATEFUL_COPILOT_DIAGNOSTIC_STRUCTURED_OUTPUT_FORMAT,

    schema,
  })
}
