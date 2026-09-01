import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCockpitPriorityBuckets,
  getCockpitPriorityBucket,
} from './cockpit-priorities.ts'

const now = new Date('2026-08-13T15:00:00.000Z')

function item(overrides = {}) {
  const has = (key) => Object.prototype.hasOwnProperty.call(overrides, key)

  return {
    id: overrides.id ?? 'cycle-1',
    status: overrides.status ?? 'contato',
    next_action: has('next_action') ? overrides.next_action : 'Retomar contato',
    next_action_date: has('next_action_date')
      ? overrides.next_action_date
      : '2026-08-13T16:00:00.000Z',
    stage_entered_at: overrides.stage_entered_at ?? '2026-08-10T12:00:00.000Z',
  }
}

test('mantém as prioridades restritas às etapas operacionais', () => {
  for (const status of ['novo', 'ganho', 'perdido']) {
    assert.equal(getCockpitPriorityBucket(item({ status }), now), null)
  }
})

test('classifica agenda vencida antes de qualquer outra prioridade', () => {
  assert.equal(
    getCockpitPriorityBucket(
      item({ next_action: null, next_action_date: '2026-08-13T14:00:00.000Z' }),
      now,
    ),
    'overdue',
  )
})

test('classifica compromisso futuro do mesmo dia como hoje', () => {
  assert.equal(getCockpitPriorityBucket(item(), now), 'today')
})

test('classifica ciclo sem texto ou sem data como sem próxima ação', () => {
  assert.equal(
    getCockpitPriorityBucket(item({ next_action: '  ', next_action_date: null }), now),
    'missing',
  )
  assert.equal(
    getCockpitPriorityBucket(item({ next_action_date: null }), now),
    'missing',
  )
})

test('não inclui compromisso futuro completo nas prioridades do dia', () => {
  assert.equal(
    getCockpitPriorityBucket(
      item({ next_action_date: '2026-08-15T16:00:00.000Z' }),
      now,
    ),
    null,
  )
})

test('gera grupos exclusivos e ordena os mais antigos primeiro', () => {
  const buckets = buildCockpitPriorityBuckets(
    [
      item({ id: 'today-late', next_action_date: '2026-08-13T18:00:00.000Z' }),
      item({ id: 'overdue-new', next_action_date: '2026-08-13T14:30:00.000Z' }),
      item({ id: 'missing-new', next_action_date: null, stage_entered_at: '2026-08-12T12:00:00.000Z' }),
      item({ id: 'today-early', next_action_date: '2026-08-13T16:00:00.000Z' }),
      item({ id: 'overdue-old', next_action_date: '2026-08-12T10:00:00.000Z' }),
      item({ id: 'missing-old', next_action_date: null, stage_entered_at: '2026-08-01T12:00:00.000Z' }),
    ],
    now,
  )

  assert.deepEqual(buckets.overdue.map((entry) => entry.id), ['overdue-old', 'overdue-new'])
  assert.deepEqual(buckets.today.map((entry) => entry.id), ['today-early', 'today-late'])
  assert.deepEqual(buckets.missing.map((entry) => entry.id), ['missing-old', 'missing-new'])
})
