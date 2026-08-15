import assert from 'node:assert/strict'
import test from 'node:test'

import {
  countExecutionDaysInRange,
  countExecutionDaysUntilToday,
  countRemainingExecutionDays,
  getDefaultWorkDays,
} from './executionDayMath.ts'
import { buildRevenuePacingFromDayCounts } from './revenuePacingCore.ts'
import { allocateOfficialSellerRevenueToCycles } from './revenueAllocation.ts'

test('Cockpit, Simulador e Relatórios produzem o mesmo ritmo com o mesmo calendário', () => {
  const workDays = {
    ...getDefaultWorkDays(),
    6: true,
  }
  const referenceDate = new Date('2026-08-15T01:47:00.000Z')
  const pacing = buildRevenuePacingFromDayCounts({
    totalReal: 159_667.7,
    goal: 245_000,
    totalExecutionDays: countExecutionDaysInRange('2026-08-01', '2026-08-31', workDays),
    elapsedExecutionDays: countExecutionDaysUntilToday(
      '2026-08-01',
      '2026-08-31',
      workDays,
      {},
      referenceDate,
    ),
    remainingExecutionDays: countRemainingExecutionDays(
      '2026-08-31',
      workDays,
      {},
      referenceDate,
    ),
  })

  assert.equal(pacing.remainingExecutionDays, 15)
  assert.equal(Number(pacing.requiredPerRemainingExecutionDay.toFixed(2)), 5_688.82)
})

test('distribui o faturamento oficial entre vendas do mesmo vendedor e dia', () => {
  const allocated = allocateOfficialSellerRevenueToCycles(
    [
      { id: 'a', sellerId: 'seller-1', date: '2026-08-10', rawValue: 1_000 },
      { id: 'b', sellerId: 'seller-1', date: '2026-08-10', rawValue: 3_000 },
    ],
    [
      {
        date: '2026-08-10',
        value: 20_000,
        sourceKind: 'seller',
        sourceId: 'seller-1',
      },
    ],
  )

  assert.equal(allocated.get('a'), 5_000)
  assert.equal(allocated.get('b'), 15_000)
})

test('não transforma valor comercial bruto em faturamento oficial ausente', () => {
  const allocated = allocateOfficialSellerRevenueToCycles(
    [{ id: 'a', sellerId: 'seller-1', date: '2026-08-10', rawValue: 1_250 }],
    [],
  )

  assert.equal(allocated.get('a'), 0)
})

test('permite reconciliar ajustes oficiais sem venda ou produto vinculado', () => {
  const cycles = [
    { id: 'cycle-1', sellerId: 'seller-1', date: '2026-08-05', rawValue: 100 },
  ]
  const revenueDays = [
    { date: '2026-08-05', value: 100, sourceKind: 'seller', sourceId: 'seller-1' },
    { date: '2026-08-10', value: 900, sourceKind: 'seller', sourceId: 'seller-1' },
  ]

  const allocated = allocateOfficialSellerRevenueToCycles(cycles, revenueDays)
  const allocatedTotal = Array.from(allocated.values()).reduce((sum, value) => sum + value, 0)
  const officialTotal = revenueDays.reduce((sum, day) => sum + day.value, 0)

  assert.equal(officialTotal - allocatedTotal, 900)
})
