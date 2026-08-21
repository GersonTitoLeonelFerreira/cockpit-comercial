import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assessCompanionClientSla,
} from './companion-client-sla.ts'

// Cenário M: SLA configurado e estourado.
test(
  'SLA configurado e ultrapassado classifica risco alto',
  () => {
    const assessment =
      assessCompanionClientSla({
        cycle_status:
          'novo',

        stage_entered_at:
          '2026-08-22T08:00:00.000Z',

        reference_time:
          '2026-08-22T12:00:00.000Z',

        rule: {
          status:
            'novo',

          target_minutes:
            60,

          warning_minutes:
            120,

          danger_minutes:
            180,
        },
      })

    assert.equal(
      assessment.configured,
      true,
    )

    assert.equal(
      assessment.applicable,
      true,
    )

    assert.equal(
      assessment.elapsed_minutes,
      240,
    )

    assert.equal(
      assessment.risk,
      'high',
    )
  },
)

test(
  'SLA configurado dentro do limite classifica risco baixo',
  () => {
    const assessment =
      assessCompanionClientSla({
        cycle_status:
          'novo',

        stage_entered_at:
          '2026-08-22T11:50:00.000Z',

        reference_time:
          '2026-08-22T12:00:00.000Z',

        rule: {
          status:
            'novo',

          target_minutes:
            60,

          warning_minutes:
            120,

          danger_minutes:
            180,
        },
      })

    assert.equal(
      assessment.elapsed_minutes,
      10,
    )

    assert.equal(
      assessment.risk,
      'low',
    )
  },
)

test(
  'SLA configurado no meio do caminho classifica risco médio',
  () => {
    const assessment =
      assessCompanionClientSla({
        cycle_status:
          'contato',

        stage_entered_at:
          '2026-08-22T09:30:00.000Z',

        reference_time:
          '2026-08-22T12:00:00.000Z',

        rule: {
          status:
            'contato',

          target_minutes:
            60,

          warning_minutes:
            120,

          danger_minutes:
            300,
        },
      })

    assert.equal(
      assessment.elapsed_minutes,
      150,
    )

    assert.equal(
      assessment.risk,
      'medium',
    )
  },
)

// Cenário N: SLA não configurado → não inventa risco.
test(
  'sem regra de SLA configurada, o risco nunca é inventado',
  () => {
    const assessment =
      assessCompanionClientSla({
        cycle_status:
          'negociacao',

        stage_entered_at:
          '2026-08-20T08:00:00.000Z',

        reference_time:
          '2026-08-22T12:00:00.000Z',

        rule:
          null,
      })

    assert.equal(
      assessment.configured,
      false,
    )

    assert.equal(
      assessment.risk,
      null,
    )

    assert.equal(
      assessment.target_minutes,
      null,
    )

    assert.equal(
      assessment.warning_minutes,
      null,
    )

    assert.equal(
      assessment.danger_minutes,
      null,
    )

    // O tempo decorrido em si é um fato do banco (stage_entered_at), não
    // uma invenção — pode continuar sendo mostrado sem virar um veredito
    // de risco.
    assert.equal(
      assessment.elapsed_minutes,
      2 *
        24 *
        60 +
        4 *
        60,
    )
  },
)

test(
  'ciclo fechado nunca recebe avaliação de SLA aplicável',
  () => {
    const assessment =
      assessCompanionClientSla({
        cycle_status:
          'ganho',

        stage_entered_at:
          '2026-08-20T08:00:00.000Z',

        reference_time:
          '2026-08-22T12:00:00.000Z',

        rule: {
          status:
            'ganho',

          target_minutes:
            60,

          warning_minutes:
            120,

          danger_minutes:
            180,
        },
      })

    assert.equal(
      assessment.applicable,
      false,
    )

    assert.equal(
      assessment.risk,
      null,
    )

    assert.equal(
      assessment.elapsed_minutes,
      null,
    )
  },
)

test(
  'regra malformada é tratada como ausência de configuração, não como erro',
  () => {
    const assessment =
      assessCompanionClientSla({
        cycle_status:
          'novo',

        stage_entered_at:
          '2026-08-22T08:00:00.000Z',

        reference_time:
          '2026-08-22T12:00:00.000Z',

        rule: {
          status:
            'novo',

          target_minutes:
            60,

          warning_minutes:
            Number.NaN,

          danger_minutes:
            180,
        },
      })

    assert.equal(
      assessment.configured,
      false,
    )

    assert.equal(
      assessment.risk,
      null,
    )
  },
)
