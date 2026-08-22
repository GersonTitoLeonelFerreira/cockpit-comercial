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
