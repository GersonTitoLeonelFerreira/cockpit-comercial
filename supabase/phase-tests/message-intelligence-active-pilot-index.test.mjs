import assert from 'node:assert/strict'
import {
  readFileSync,
} from 'node:fs'
import test from 'node:test'

const migration =
  readFileSync(
    new URL(
      '../migrations/20260904015000_add_message_intelligence_active_pilot_cycle_index.sql',
      import.meta.url,
    ),
    'utf8',
  )

test(
  'piloto MIE possui índice cobrindo a FK company_id + cycle_id',
  () => {
    assert.match(
      migration,
      /create index\s+message_intelligence_active_pilot_company_cycle_idx/i,
    )

    assert.match(
      migration,
      /on public\.message_intelligence_active_pilot_events\s*\(\s*company_id,\s*cycle_id\s*\)/i,
    )
  },
)
