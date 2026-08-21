import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COMMERCIAL_READING_CHANNELS,
  COMMERCIAL_READING_CONTRACT_VERSION,
  COMMERCIAL_READING_DECISIONS,
  COMMERCIAL_READING_EVOLUTION_STATUSES,
  COMMERCIAL_READING_IMPROVEMENT_KINDS,
  COMMERCIAL_READING_METHOD_STATUSES,
  COMMERCIAL_READING_RISK_SEVERITIES,
  COMMERCIAL_READING_SELLER_STRENGTH_KINDS,
} from './commercial-reading-contract.ts'

import {
  COMMERCIAL_READING_JSON_SCHEMA,
  COMMERCIAL_READING_RESPONSE_FORMAT_NAME,
  COMMERCIAL_READING_STRUCTURED_OUTPUT_FORMAT,
} from './commercial-reading-json-schema.ts'

function assertClosedObjects(
  value,
  path = 'schema',
) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return
  }

  if (
    value.type === 'object'
  ) {
    assert.equal(
      value.additionalProperties,
      false,
      `${path} precisa ser fechado`,
    )

    assert.deepEqual(
      value.required,
      Object.keys(
        value.properties,
      ),
      `${path} precisa exigir todos os campos`,
    )
  }

  for (
    const [key, child] of
    Object.entries(value)
  ) {
    if (Array.isArray(child)) {
      child.forEach(
        (item, index) =>
          assertClosedObjects(
            item,
            `${path}.${key}[${index}]`,
          ),
      )

      continue
    }

    assertClosedObjects(
      child,
      `${path}.${key}`,
    )
  }
}

test(
  'schema possui os dez blocos da leitura comercial completa',
  () => {
    const properties =
      COMMERCIAL_READING_JSON_SCHEMA
        .properties

    assert.deepEqual(
      Object.keys(properties),
      [
        'contract_version',
        'analysis_status',
        'analysis_limitations',
        'commercial_role',
        'conversation_summary',
        'customer',
        'commercial_evolution',
        'method',
        'seller_strengths',
        'improvement_points',
        'risks',
        'best_approach',
        'communication',
        'operations',
        'evidence_message_ids',
        'memory_ids',
      ],
    )

    assert.equal(
      properties
        .contract_version
        .enum[0],
      COMMERCIAL_READING_CONTRACT_VERSION,
    )
  },
)

test(
  'schema é estrito fechado e exige todos os campos',
  () => {
    assertClosedObjects(
      COMMERCIAL_READING_JSON_SCHEMA,
    )
  },
)

test(
  'taxonomias do contrato são preservadas no schema',
  () => {
    const properties =
      COMMERCIAL_READING_JSON_SCHEMA
        .properties

    assert.deepEqual(
      properties
        .commercial_evolution
        .items
        .properties
        .status
        .enum,
      [
        ...COMMERCIAL_READING_EVOLUTION_STATUSES,
      ],
    )

    assert.deepEqual(
      properties
        .method
        .properties
        .stages
        .items
        .properties
        .status
        .enum,
      [
        ...COMMERCIAL_READING_METHOD_STATUSES,
      ],
    )

    assert.deepEqual(
      properties
        .best_approach
        .properties
        .decision
        .enum,
      [
        ...COMMERCIAL_READING_DECISIONS,
      ],
    )

    assert.deepEqual(
      properties
        .best_approach
        .properties
        .channel
        .enum,
      [
        ...COMMERCIAL_READING_CHANNELS,
      ],
    )
  },
)

test(
  'acertos melhorias e riscos usam enums oficiais',
  () => {
    const properties =
      COMMERCIAL_READING_JSON_SCHEMA
        .properties

    assert.deepEqual(
      properties
        .seller_strengths
        .items
        .properties
        .kind
        .enum,
      [
        ...COMMERCIAL_READING_SELLER_STRENGTH_KINDS,
      ],
    )

    assert.deepEqual(
      properties
        .improvement_points
        .items
        .properties
        .kind
        .enum,
      [
        ...COMMERCIAL_READING_IMPROVEMENT_KINDS,
      ],
    )

    assert.deepEqual(
      properties
        .risks
        .properties
        .service_risks
        .items
        .properties
        .severity
        .enum,
      [
        ...COMMERCIAL_READING_RISK_SEVERITIES,
      ],
    )
  },
)

test(
  'CRM e Agenda exigem confirmação humana verdadeira',
  () => {
    const operations =
      COMMERCIAL_READING_JSON_SCHEMA
        .properties
        .operations
        .properties

    assert.deepEqual(
      operations
        .crm
        .properties
        .requires_human_confirmation
        .enum,
      [
        true,
      ],
    )

    assert.deepEqual(
      operations
        .agenda
        .properties
        .requires_human_confirmation
        .enum,
      [
        true,
      ],
    )
  },
)

test(
  'formato estruturado identifica a leitura comercial v1',
  () => {
    assert.equal(
      COMMERCIAL_READING_RESPONSE_FORMAT_NAME,
      'yolen_commercial_reading_v1',
    )

    assert.equal(
      COMMERCIAL_READING_STRUCTURED_OUTPUT_FORMAT
        .type,
      'json_schema',
    )

    assert.equal(
      COMMERCIAL_READING_STRUCTURED_OUTPUT_FORMAT
        .strict,
      true,
    )

    assert.equal(
      COMMERCIAL_READING_STRUCTURED_OUTPUT_FORMAT
        .schema,
      COMMERCIAL_READING_JSON_SCHEMA,
    )
  },
)

test(
  'schema e formato são profundamente imutáveis',
  () => {
    assert.equal(
      Object.isFrozen(
        COMMERCIAL_READING_JSON_SCHEMA,
      ),
      true,
    )

    assert.equal(
      Object.isFrozen(
        COMMERCIAL_READING_JSON_SCHEMA
          .properties
          .method,
      ),
      true,
    )

    assert.equal(
      Object.isFrozen(
        COMMERCIAL_READING_STRUCTURED_OUTPUT_FORMAT,
      ),
      true,
    )
  },
)
