import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COMMERCIAL_READING_METHOD_STATUSES,
} from './commercial-reading-contract.ts'

import {
  COMMERCIAL_READING_JSON_SCHEMA,
  COMMERCIAL_READING_MODEL_JSON_SCHEMA,
} from './commercial-reading-json-schema.ts'

test(
  'método representa etapa ativa e aderência consolidada com recovery',
  () => {
    assert.ok(
      COMMERCIAL_READING_METHOD_STATUSES
        .includes('active'),
    )

    const methodProperties =
      COMMERCIAL_READING_JSON_SCHEMA
        .properties
        .method
        .properties

    assert.ok(methodProperties.current_stage)
    assert.ok(methodProperties.adherence)
    assert.ok(methodProperties.recovery_guidance)
  },
)

test(
  'modelo não redecide identidade canônica do método',
  () => {
    const modelMethod =
      COMMERCIAL_READING_MODEL_JSON_SCHEMA
        .properties
        .method

    assert.equal(
      modelMethod.anyOf[0].type,
      'null',
    )

    const modelMethodProperties =
      modelMethod.anyOf[1].properties

    assert.equal(
      modelMethodProperties.configured,
      undefined,
    )

    assert.equal(
      modelMethodProperties.name,
      undefined,
    )
  },
)

test(
  'coaching explicita importância risco e correção',
  () => {
    const properties =
      COMMERCIAL_READING_JSON_SCHEMA
        .properties

    assert.ok(
      properties
        .seller_strengths
        .items
        .properties
        .why_it_matters,
    )

    const improvementProperties =
      properties
        .improvement_points
        .items
        .properties

    assert.ok(
      improvementProperties
        .why_it_matters,
    )

    assert.ok(
      improvementProperties
        .how_to_improve,
    )
  },
)
