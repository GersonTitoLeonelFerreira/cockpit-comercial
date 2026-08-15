import assert from 'node:assert/strict'
import test from 'node:test'

import {
  countExecutionDaysInRange,
  countExecutionDaysUntilToday,
  countRemainingExecutionDays,
  getDefaultWorkDays,
} from './executionDayMath.ts'

const AUGUST_14_2026 = new Date(2026, 7, 14, 12)

test('usa segunda a sexta quando não existe calendário personalizado', () => {
  const remainingDays = countRemainingExecutionDays(
    '2026-08-31',
    getDefaultWorkDays(),
    {},
    AUGUST_14_2026,
  )

  assert.equal(remainingDays, 12)
})

test('respeita os sábados configurados no calendário operacional', () => {
  const workDays = {
    ...getDefaultWorkDays(),
    6: true,
  }

  const remainingDays = countRemainingExecutionDays(
    '2026-08-31',
    workDays,
    {},
    AUGUST_14_2026,
  )

  assert.equal(remainingDays, 15)
  assert.equal(Number((85_332.3 / remainingDays).toFixed(2)), 5_688.82)
})

test('aplica inclusões e remoções de datas específicas', () => {
  const workDays = {
    ...getDefaultWorkDays(),
    6: true,
  }
  const overrides = {
    '2026-08-15': false,
    '2026-08-16': true,
  }

  assert.equal(
    countRemainingExecutionDays('2026-08-31', workDays, overrides, AUGUST_14_2026),
    15,
  )
})

test('mantém total, realizado e restante na mesma regra de calendário', () => {
  const workDays = {
    ...getDefaultWorkDays(),
    6: true,
  }

  assert.equal(countExecutionDaysInRange('2026-08-01', '2026-08-31', workDays), 26)
  assert.equal(
    countExecutionDaysUntilToday(
      '2026-08-01',
      '2026-08-31',
      workDays,
      {},
      AUGUST_14_2026,
    ),
    12,
  )
})

test('retorna zero quando o período já encerrou', () => {
  assert.equal(
    countRemainingExecutionDays(
      '2026-07-31',
      getDefaultWorkDays(),
      {},
      AUGUST_14_2026,
    ),
    0,
  )
})
