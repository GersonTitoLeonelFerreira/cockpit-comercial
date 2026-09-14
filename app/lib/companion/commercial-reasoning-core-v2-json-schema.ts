import {
  COMMERCIAL_REASONING_CORE_V2_COMMITMENT_STATUSES,
  COMMERCIAL_REASONING_CORE_V2_COMMERCIAL_RELEVANCES,
  COMMERCIAL_REASONING_CORE_V2_COMMERCIAL_ROLES,
  COMMERCIAL_REASONING_CORE_V2_CONFIDENCE_LEVELS,
  COMMERCIAL_REASONING_CORE_V2_CONTRACT_VERSION,
  COMMERCIAL_REASONING_CORE_V2_DECISIONS,
  COMMERCIAL_REASONING_CORE_V2_METHOD_ADHERENCE,
  COMMERCIAL_REASONING_CORE_V2_STATUSES,
  COMMERCIAL_REASONING_CORE_V2_WAITING_ON,
} from './commercial-reasoning-core-v2-contract'

type JsonSchema =
  Record<string, unknown>

function objectSchema(
  properties: Record<string, JsonSchema>,
): JsonSchema {
  return {
    type:
      'object',

    additionalProperties:
      false,

    properties,

    required:
      Object.keys(properties),
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
  values: readonly unknown[],
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
      value as Record<string, unknown>,
    )
  ) {
    deepFreeze(nestedValue)
  }

  return Object.freeze(value)
}

const stringSchema: JsonSchema = {
  type:
    'string',
}

const nullableStringSchema =
  nullableSchema(stringSchema)

const stringArraySchema =
  arraySchema(stringSchema)

const evidenceSchema =
  objectSchema({
    summary:
      stringSchema,

    evidence_message_ids:
      stringArraySchema,
  })

const strengthSchema =
  objectSchema({
    kind:
      stringSchema,

    summary:
      stringSchema,

    why_it_matters:
      stringSchema,

    evidence_message_ids:
      stringArraySchema,
  })

const improvementSchema =
  objectSchema({
    kind:
      stringSchema,

    summary:
      stringSchema,

    why_it_matters:
      stringSchema,

    impact:
      stringSchema,

    how_to_improve:
      stringSchema,

    evidence_message_ids:
      stringArraySchema,
  })

const memoryObservedSchema =
  objectSchema({
    kind:
      stringSchema,

    summary:
      stringSchema,

    confidence:
      enumSchema(
        COMMERCIAL_REASONING_CORE_V2_CONFIDENCE_LEVELS,
      ),

    evidence_message_ids:
      stringArraySchema,
  })

const memoryFactSchema =
  objectSchema({
    kind:
      stringSchema,

    value:
      nullableStringSchema,

    summary:
      stringSchema,

    confidence:
      enumSchema(
        COMMERCIAL_REASONING_CORE_V2_CONFIDENCE_LEVELS,
      ),

    evidence_message_ids:
      stringArraySchema,
  })

const memoryOpenLoopSchema =
  objectSchema({
    kind:
      stringSchema,

    summary:
      stringSchema,

    evidence_message_ids:
      stringArraySchema,
  })

const memoryCommitmentSchema =
  objectSchema({
    commitment_id:
      nullableStringSchema,

    kind:
      stringSchema,

    status:
      enumSchema(
        COMMERCIAL_REASONING_CORE_V2_COMMITMENT_STATUSES,
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

const memoryDeltaSchema =
  objectSchema({
    facts_to_add:
      arraySchema(
        memoryFactSchema,
      ),

    fact_ids_to_supersede:
      stringArraySchema,

    needs_to_add:
      arraySchema(
        memoryObservedSchema,
      ),

    need_ids_to_resolve:
      stringArraySchema,

    need_ids_to_supersede:
      stringArraySchema,

    open_loops_to_add:
      arraySchema(
        memoryOpenLoopSchema,
      ),

    open_loop_ids_to_resolve:
      stringArraySchema,

    open_loop_ids_to_supersede:
      stringArraySchema,

    objections_to_add:
      arraySchema(
        memoryObservedSchema,
      ),

    objection_ids_to_resolve:
      stringArraySchema,

    objection_ids_to_supersede:
      stringArraySchema,

    commitments_to_upsert:
      arraySchema(
        memoryCommitmentSchema,
      ),

    signals_to_add:
      arraySchema(
        memoryObservedSchema,
      ),

    signal_ids_to_resolve:
      stringArraySchema,

    uncertainties_to_add:
      arraySchema(
        memoryObservedSchema,
      ),

    uncertainty_ids_to_resolve:
      stringArraySchema,

    uncertainty_ids_to_supersede:
      stringArraySchema,
  })

export const COMMERCIAL_REASONING_CORE_V2_JSON_SCHEMA =
  deepFreeze(
    objectSchema({
      contract_version:
        enumSchema([
          COMMERCIAL_REASONING_CORE_V2_CONTRACT_VERSION,
        ]),

      status:
        enumSchema(
          COMMERCIAL_REASONING_CORE_V2_STATUSES,
        ),

      commercial_role:
        enumSchema(
          COMMERCIAL_REASONING_CORE_V2_COMMERCIAL_ROLES,
        ),

      commercial_relevance:
        enumSchema(
          COMMERCIAL_REASONING_CORE_V2_COMMERCIAL_RELEVANCES,
        ),

      situation:
        objectSchema({
          summary:
            stringSchema,

          customer_intent:
            nullableStringSchema,

          commercial_stage:
            nullableStringSchema,

          confidence:
            enumSchema(
              COMMERCIAL_REASONING_CORE_V2_CONFIDENCE_LEVELS,
            ),

          evidence_message_ids:
            stringArraySchema,
        }),

      responsibility:
        objectSchema({
          waiting_on:
            enumSchema(
              COMMERCIAL_REASONING_CORE_V2_WAITING_ON,
            ),

          summary:
            stringSchema,

          evidence_message_ids:
            stringArraySchema,
        }),

      decision:
        objectSchema({
          action:
            enumSchema(
              COMMERCIAL_REASONING_CORE_V2_DECISIONS,
            ),

          objective:
            stringSchema,

          reason:
            stringSchema,

          evidence_message_ids:
            stringArraySchema,
        }),

      coaching:
        objectSchema({
          strengths:
            arraySchema(
              strengthSchema,
            ),

          improvement_points:
            arraySchema(
              improvementSchema,
            ),
        }),

      method:
        objectSchema({
          configured: {
            type:
              'boolean',
          },

          name:
            nullableStringSchema,

          current_stage:
            nullableStringSchema,

          adherence:
            enumSchema(
              COMMERCIAL_REASONING_CORE_V2_METHOD_ADHERENCE,
            ),

          deviation:
            nullableStringSchema,

          recovery_move:
            nullableStringSchema,

          evidence_message_ids:
            stringArraySchema,
        }),

      technique:
        objectSchema({
          name:
            nullableStringSchema,

          why_applicable:
            nullableStringSchema,

          do_not_do:
            stringArraySchema,
        }),

      communication:
        objectSchema({
          intervention_needed: {
            type:
              'boolean',
          },

          recommended_question:
            nullableStringSchema,

          suggested_message:
            nullableStringSchema,
        }),

      memory_delta:
        memoryDeltaSchema,

      factuality:
        objectSchema({
          facts_used:
            arraySchema(
              evidenceSchema,
            ),

          unknowns:
            stringArraySchema,
        }),

      evidence_message_ids:
        stringArraySchema,
    }),
  )

export const COMMERCIAL_REASONING_CORE_V2_STRUCTURED_OUTPUT_FORMAT =
  deepFreeze({
    type:
      'json_schema',

    name:
      'yolen_commercial_reasoning_core_v2',

    description:
      'Leitura comercial holística da Yolen produzida em uma única chamada principal de raciocínio.',

    strict:
      true,

    schema:
      COMMERCIAL_REASONING_CORE_V2_JSON_SCHEMA,
  })
