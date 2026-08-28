import assert from 'node:assert/strict'
import test from 'node:test'

import {
  STATEFUL_COPILOT_COMMITMENT_STATUSES,
  STATEFUL_COPILOT_CONFIDENCE_LEVELS,
  STATEFUL_COPILOT_CONTRACT_VERSION,
  STATEFUL_COPILOT_COMMERCIAL_RELEVANCES,
  STATEFUL_COPILOT_COMMERCIAL_ROLES,
} from './stateful-copilot-contract.ts'

import {
  STATEFUL_COPILOT_JSON_SCHEMA,
  STATEFUL_COPILOT_RESPONSE_FORMAT_NAME,
  STATEFUL_COPILOT_STRUCTURED_OUTPUT_FORMAT,
  buildStatefulCopilotDiagnosticStructuredOutputFormat,
} from './stateful-copilot-json-schema.ts'

const ROOT_FIELDS = [
  'contract_version',
  'previous_state_version',
  'analyzed_message_ids',
  'commercial_role',
  'commercial_relevance',
  'interpretation',
  'state_patch',
  'strategy',
  'operational_suggestions',
  'evidence_message_ids',
  'memory_ids',
]

const LEAD_STATUSES = [
  'novo',
  'contato',
  'respondeu',
  'negociacao',
  'pausado',
  'cancelado',
  'ganho',
  'perdido',
]

const SUPPORTED_SCHEMA_KEYWORDS =
  new Set([
    'type',
    'properties',
    'required',
    'additionalProperties',
    'items',
    'enum',
    'anyOf',
  ])

function isRecord(
  value,
) {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value)
  )
}

function getObjectProperties(
  schema,
  path,
) {
  assert.ok(
    isRecord(schema),
    `${path} precisa ser um schema.`,
  )

  assert.equal(
    schema.type,
    'object',
    `${path} precisa ser object.`,
  )

  assert.ok(
    isRecord(
      schema.properties,
    ),
    `${path}.properties precisa ser objeto.`,
  )

  return schema.properties
}

function walkSchema(
  schema,
  path = 'schema',
) {
  assert.ok(
    isRecord(schema),
    `${path} precisa ser objeto.`,
  )

  for (
    const key of
    Object.keys(schema)
  ) {
    assert.ok(
      SUPPORTED_SCHEMA_KEYWORDS
        .has(key),
      `${path} utiliza keyword não autorizada: ${key}`,
    )
  }

  if (
    schema.type ===
    'object'
  ) {
    assert.equal(
      schema.additionalProperties,
      false,
      `${path} precisa fechar propriedades adicionais.`,
    )

    assert.ok(
      isRecord(
        schema.properties,
      ),
      `${path}.properties precisa ser objeto.`,
    )

    assert.ok(
      Array.isArray(
        schema.required,
      ),
      `${path}.required precisa ser lista.`,
    )

    assert.deepEqual(
      [
        ...schema.required,
      ].sort(),
      Object.keys(
        schema.properties,
      ).sort(),
      `${path} precisa declarar todas as propriedades como obrigatórias.`,
    )

    for (
      const [
        propertyName,
        propertySchema,
      ] of Object.entries(
        schema.properties,
      )
    ) {
      walkSchema(
        propertySchema,
        `${path}.properties.${propertyName}`,
      )
    }
  }

  if (
    schema.type ===
    'array'
  ) {
    walkSchema(
      schema.items,
      `${path}.items`,
    )
  }

  if (
    Array.isArray(
      schema.anyOf,
    )
  ) {
    assert.ok(
      schema.anyOf.length >= 2,
      `${path}.anyOf precisa possuir alternativas.`,
    )

    schema.anyOf.forEach(
      (
        alternative,
        index,
      ) => {
        walkSchema(
          alternative,
          `${path}.anyOf[${index}]`,
        )
      },
    )
  }
}

function assertDeepFrozen(
  value,
  path = 'value',
) {
  if (
    value === null ||
    typeof value !== 'object'
  ) {
    return
  }

  assert.equal(
    Object.isFrozen(value),
    true,
    `${path} precisa estar congelado.`,
  )

  if (Array.isArray(value)) {
    value.forEach(
      (
        item,
        index,
      ) => {
        assertDeepFrozen(
          item,
          `${path}[${index}]`,
        )
      },
    )

    return
  }

  for (
    const [
      key,
      nestedValue,
    ] of Object.entries(value)
  ) {
    assertDeepFrozen(
      nestedValue,
      `${path}.${key}`,
    )
  }
}

function assertNullableTypes(
  schema,
  expectedTypes,
) {
  assert.ok(
    Array.isArray(
      schema.anyOf,
    ),
  )

  assert.deepEqual(
    schema.anyOf
      .map(
        (alternative) =>
          alternative.type ??
          'enum',
      )
      .sort(),
    [
      ...expectedTypes,
    ].sort(),
  )
}

test(
  'formato estruturado declara json_schema estrito',
  () => {
    assert.equal(
      STATEFUL_COPILOT_STRUCTURED_OUTPUT_FORMAT
        .type,
      'json_schema',
    )

    assert.equal(
      STATEFUL_COPILOT_STRUCTURED_OUTPUT_FORMAT
        .strict,
      true,
    )

    assert.equal(
      STATEFUL_COPILOT_STRUCTURED_OUTPUT_FORMAT
        .name,
      STATEFUL_COPILOT_RESPONSE_FORMAT_NAME,
    )

    assert.match(
      STATEFUL_COPILOT_RESPONSE_FORMAT_NAME,
      /^[A-Za-z0-9_-]{1,64}$/,
    )

    assert.equal(
      STATEFUL_COPILOT_STRUCTURED_OUTPUT_FORMAT
        .schema,
      STATEFUL_COPILOT_JSON_SCHEMA,
    )
  },
)

test(
  'raiz do schema coincide com o contrato stateful v3',
  () => {
    const properties =
      getObjectProperties(
        STATEFUL_COPILOT_JSON_SCHEMA,
        'schema',
      )

    assert.deepEqual(
      Object.keys(
        properties,
      ),
      ROOT_FIELDS,
    )

    assert.deepEqual(
      STATEFUL_COPILOT_JSON_SCHEMA
        .required,
      ROOT_FIELDS,
    )

    assert.deepEqual(
      properties
        .contract_version
        .enum,
      [
        STATEFUL_COPILOT_CONTRACT_VERSION,
      ],
    )
  },
)

test(
  'todos os objetos são fechados e exigem todos os campos',
  () => {
    walkSchema(
      STATEFUL_COPILOT_JSON_SCHEMA,
    )
  },
)

test(
  'enums do schema acompanham as constantes do contrato',
  () => {
    const root =
      getObjectProperties(
        STATEFUL_COPILOT_JSON_SCHEMA,
        'schema',
      )

    assert.deepEqual(
      root
        .commercial_role
        .enum,
      [
        ...STATEFUL_COPILOT_COMMERCIAL_ROLES,
      ],
    )

    assert.deepEqual(
      root
        .commercial_relevance
        .enum,
      [
        ...STATEFUL_COPILOT_COMMERCIAL_RELEVANCES,
      ],
    )

    const statePatch =
      getObjectProperties(
        root.state_patch,
        'schema.state_patch',
      )

    const factItem =
      getObjectProperties(
        statePatch
          .facts_to_add
          .items,
        'schema.state_patch.facts_to_add.items',
      )

    assert.deepEqual(
      factItem
        .confidence
        .enum,
      [
        ...STATEFUL_COPILOT_CONFIDENCE_LEVELS,
      ],
    )

    const commitmentItem =
      getObjectProperties(
        statePatch
          .commitments_to_upsert
          .items,
        'schema.state_patch.commitments_to_upsert.items',
      )

    assert.deepEqual(
      commitmentItem
        .status
        .enum,
      [
        ...STATEFUL_COPILOT_COMMITMENT_STATUSES,
      ],
    )

    const operational =
      getObjectProperties(
        root.operational_suggestions,
        'schema.operational_suggestions',
      )

    const crm =
      getObjectProperties(
        operational.crm,
        'schema.operational_suggestions.crm',
      )

    assert.deepEqual(
      crm
        .recommended_status
        .anyOf[0]
        .enum,
      LEAD_STATUSES,
    )
  },
)

test(
  'campos opcionais são obrigatórios mas aceitam null',
  () => {
    const root =
      getObjectProperties(
        STATEFUL_COPILOT_JSON_SCHEMA,
        'schema',
      )

    assertNullableTypes(
      root.previous_state_version,
      [
        'integer',
        'null',
      ],
    )

    const interpretation =
      getObjectProperties(
        root.interpretation,
        'schema.interpretation',
      )

    assertNullableTypes(
      interpretation.what_changed,
      [
        'object',
        'null',
      ],
    )

    assertNullableTypes(
      interpretation.customer_need,
      [
        'object',
        'null',
      ],
    )

    const strategy =
      getObjectProperties(
        root.strategy,
        'schema.strategy',
      )

    assertNullableTypes(
      strategy.recommended_question,
      [
        'string',
        'null',
      ],
    )

    assertNullableTypes(
      strategy.suggested_message,
      [
        'string',
        'null',
      ],
    )
  },
)

test(
  'confirmação humana permanece obrigatoriamente verdadeira',
  () => {
    const root =
      getObjectProperties(
        STATEFUL_COPILOT_JSON_SCHEMA,
        'schema',
      )

    const operational =
      getObjectProperties(
        root.operational_suggestions,
        'schema.operational_suggestions',
      )

    const crm =
      getObjectProperties(
        operational.crm,
        'schema.operational_suggestions.crm',
      )

    const agenda =
      getObjectProperties(
        operational.agenda,
        'schema.operational_suggestions.agenda',
      )

    assert.deepEqual(
      crm
        .requires_human_confirmation
        .enum,
      [
        true,
      ],
    )

    assert.deepEqual(
      agenda
        .requires_human_confirmation
        .enum,
      [
        true,
      ],
    )
  },
)

test(
  'schema e formato são imutáveis e serializáveis de forma estável',
  () => {
    assertDeepFrozen(
      STATEFUL_COPILOT_JSON_SCHEMA,
      'schema',
    )

    assertDeepFrozen(
      STATEFUL_COPILOT_STRUCTURED_OUTPUT_FORMAT,
      'format',
    )

    const firstSerialization =
      JSON.stringify(
        STATEFUL_COPILOT_STRUCTURED_OUTPUT_FORMAT,
      )

    const secondSerialization =
      JSON.stringify(
        STATEFUL_COPILOT_STRUCTURED_OUTPUT_FORMAT,
      )

    assert.equal(
      firstSerialization,
      secondSerialization,
    )

    assert.doesNotThrow(
      () =>
        JSON.parse(
          firstSerialization,
        ),
    )
  },
)


test(
  'diagnóstico restringe memory_ids às memórias ativas do contexto',
  () => {
    const activeMemoryIds = [
      'memory-a',
      'memory-b',
    ]

    const format =
      buildStatefulCopilotDiagnosticStructuredOutputFormat({
        active_memory_ids:
          activeMemoryIds,
      })

    const root =
      format
        .schema
        .properties

    const assertAllowedMemoryArray = (
      schema,
      path,
    ) => {
      assert.deepEqual(
        schema
          .items
          .enum,
        activeMemoryIds,
        path,
      )
    }

    assertAllowedMemoryArray(
      root.memory_ids,
      'root.memory_ids',
    )

    const interpretation =
      root
        .interpretation
        .properties

    assertAllowedMemoryArray(
      interpretation
        .current_moment
        .properties
        .memory_ids,
      'current_moment.memory_ids',
    )

    assertAllowedMemoryArray(
      interpretation
        .what_remains_valid
        .items
        .properties
        .memory_ids,
      'what_remains_valid.memory_ids',
    )

    assertAllowedMemoryArray(
      interpretation
        .customer_need
        .anyOf[0]
        .properties
        .memory_ids,
      'customer_need.memory_ids',
    )

    assertAllowedMemoryArray(
      interpretation
        .uncertainties
        .items
        .properties
        .memory_ids,
      'uncertainties.memory_ids',
    )

    assertAllowedMemoryArray(
      root
        .strategy
        .properties
        .memory_ids,
      'strategy.memory_ids',
    )

    const statePatch =
      root
        .state_patch
        .properties

    const referenceFields = [
      'fact_ids_to_supersede',
      'need_ids_to_resolve',
      'need_ids_to_supersede',
      'open_loop_ids_to_resolve',
      'open_loop_ids_to_supersede',
      'objection_ids_to_resolve',
      'objection_ids_to_supersede',
      'signal_ids_to_resolve',
      'uncertainty_ids_to_resolve',
      'uncertainty_ids_to_supersede',
    ]

    for (
      const field of
      referenceFields
    ) {
      assertAllowedMemoryArray(
        statePatch[field],
        field,
      )
    }

    assert.deepEqual(
      statePatch
        .commitments_to_upsert
        .items
        .properties
        .commitment_id
        .anyOf[0]
        .enum,
      activeMemoryIds,
    )

    assert.equal(
      statePatch
        .commitments_to_upsert
        .items
        .properties
        .commitment_id
        .anyOf[1]
        .type,
      'null',
    )
  },
)

test(
  'diagnóstico proíbe memory_id quando não existe memória ativa',
  () => {
    const format =
      buildStatefulCopilotDiagnosticStructuredOutputFormat({
        active_memory_ids: [],
      })

    const root =
      format
        .schema
        .properties

    assert.equal(
      root
        .memory_ids
        .maxItems,
      0,
    )

    assert.equal(
      root
        .interpretation
        .properties
        .customer_need
        .anyOf[0]
        .properties
        .memory_ids
        .maxItems,
      0,
    )

    assert.equal(
      root
        .state_patch
        .properties
        .need_ids_to_resolve
        .maxItems,
      0,
    )

    assert.deepEqual(
      root
        .state_patch
        .properties
        .commitments_to_upsert
        .items
        .properties
        .commitment_id,
      {
        type:
          'null',
      },
    )
  },
)
