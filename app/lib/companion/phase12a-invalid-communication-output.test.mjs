import assert from 'node:assert/strict'
import {
  readFileSync,
} from 'node:fs'
import test from 'node:test'

import {
  COMMERCIAL_READING_MODEL_JSON_SCHEMA,
} from './commercial-reading-json-schema.ts'

import {
  buildStatefulCommunicationStructuredOutputFormat,
} from './stateful-communication-json-schema.ts'

function getMethodSchema() {
  return COMMERCIAL_READING_MODEL_JSON_SCHEMA
    .properties
    .method
}

test(
  '12A sessão sem autorização comercial exige method null no structured output',
  () => {
    const format =
      buildStatefulCommunicationStructuredOutputFormat({
        method_assessment_allowed:
          false,
      })

    const method =
      format
        .schema
        .properties
        .commercial_reading
        .properties
        .method

    assert.deepEqual(
      method,
      {
        type:
          'null',
      },
    )
  },
)

test(
  '12A sessão comercial preserva avaliação de método',
  () => {
    const format =
      buildStatefulCommunicationStructuredOutputFormat({
        method_assessment_allowed:
          true,
      })

    const method =
      format
        .schema
        .properties
        .commercial_reading
        .properties
        .method

    assert.equal(
      Array.isArray(
        method.anyOf,
      ),
      true,
    )

    assert.equal(
      method.anyOf.length,
      3,
    )
  },
)

test(
  '12A aderência sem desvio não pode carregar campos de desvio',
  () => {
    const method =
      getMethodSchema()

    const nonDeviation =
      method.anyOf.find(
        variant =>
          variant.type ===
            'object' &&
          variant
            .properties
            .adherence
            .properties
            .status
            .enum
            .includes(
              'on_method',
            ),
      )

    assert.ok(
      nonDeviation,
    )

    assert.deepEqual(
      nonDeviation
        .properties
        .adherence
        .properties
        .deviation_stage_order,
      {
        type:
          'null',
      },
    )

    assert.deepEqual(
      nonDeviation
        .properties
        .adherence
        .properties
        .what_happened,
      {
        type:
          'null',
      },
    )

    assert.deepEqual(
      nonDeviation
        .properties
        .adherence
        .properties
        .why_it_matters,
      {
        type:
          'null',
      },
    )

    assert.deepEqual(
      nonDeviation
        .properties
        .recovery_guidance,
      {
        type:
          'null',
      },
    )
  },
)

test(
  '12A off_method exige branch própria com dados de desvio e recovery',
  () => {
    const method =
      getMethodSchema()

    const offMethod =
      method.anyOf.find(
        variant =>
          variant.type ===
            'object' &&
          variant
            .properties
            .adherence
            .properties
            .status
            .enum
            .includes(
              'off_method',
            ),
      )

    assert.ok(
      offMethod,
    )

    assert.equal(
      offMethod
        .properties
        .adherence
        .properties
        .deviation_stage_order
        .type,
      'integer',
    )

    assert.equal(
      offMethod
        .properties
        .adherence
        .properties
        .what_happened
        .type,
      'string',
    )

    assert.equal(
      offMethod
        .properties
        .recovery_guidance
        .type,
      'object',
    )
  },
)

test(
  '12A executor usa schema contextual em vez do formato estático',
  () => {
    const source =
      readFileSync(
        new URL(
          './stateful-communication-executor.ts',
          import.meta.url,
        ),
        'utf8',
      )

    assert.match(
      source,
      /buildStatefulCommunicationStructuredOutputFormat/,
    )

    assert.match(
      source,
      /method_assessment_allowed:/,
    )
  },
)
