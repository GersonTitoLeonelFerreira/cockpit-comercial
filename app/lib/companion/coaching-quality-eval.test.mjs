import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COACHING_QUALITY_BASELINE_THRESHOLD,
  COACHING_QUALITY_DIMENSION_WEIGHTS,
  COACHING_QUALITY_GROUNDING_FLOOR,
  evaluateCoachingQuality,
} from './coaching-quality-eval.ts'

function allScores(value) {
  return Object.fromEntries(
    Object.keys(
      COACHING_QUALITY_DIMENSION_WEIGHTS,
    ).map(
      key => [key, value],
    ),
  )
}

test(
  'rubrica da Fase 0 soma exatamente 100 pontos de peso',
  () => {
    const total =
      Object.values(
        COACHING_QUALITY_DIMENSION_WEIGHTS,
      ).reduce(
        (sum, weight) =>
          sum + weight,
        0,
      )

    assert.equal(total, 100)
  },
)

test(
  'avaliação perfeita produz 100 e atende baseline',
  () => {
    const result =
      evaluateCoachingQuality({
        case_id: 'C01',
        scores:
          allScores(100),
      })

    assert.equal(
      result.weighted_score,
      100,
    )

    assert.equal(
      result.meets_baseline,
      true,
    )
  },
)

test(
  'score abaixo do baseline reprova mesmo sem violação bloqueante',
  () => {
    const result =
      evaluateCoachingQuality({
        case_id: 'C02',
        scores:
          allScores(
            COACHING_QUALITY_BASELINE_THRESHOLD -
              1,
          ),
      })

    assert.equal(
      result.meets_baseline,
      false,
    )
  },
)

test(
  'grounding abaixo do piso reprova mesmo com score ponderado alto',
  () => {
    const scores =
      allScores(100)

    scores.grounding_safety =
      COACHING_QUALITY_GROUNDING_FLOOR -
      1

    const result =
      evaluateCoachingQuality({
        case_id: 'C10',
        scores,
      })

    assert.ok(
      result.weighted_score >=
        COACHING_QUALITY_BASELINE_THRESHOLD,
    )

    assert.equal(
      result.meets_baseline,
      false,
    )
  },
)

test(
  'mensagem genérica é bloqueante independentemente da nota',
  () => {
    const result =
      evaluateCoachingQuality({
        case_id: 'C09',
        scores:
          allScores(100),
        blocking_violations: [
          'generic_message',
          'generic_message',
        ],
      })

    assert.deepEqual(
      result.blocking_violations,
      ['generic_message'],
    )

    assert.equal(
      result.meets_baseline,
      false,
    )
  },
)

test(
  'nota fora de 0..100 é rejeitada',
  () => {
    const scores =
      allScores(100)

    scores.technique = 101

    assert.throws(
      () =>
        evaluateCoachingQuality({
          case_id: 'invalid',
          scores,
        }),
      RangeError,
    )
  },
)
