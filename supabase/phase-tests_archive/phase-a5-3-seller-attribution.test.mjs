import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const migrationPath =
  new URL(
    '../migrations/20260820200000_add_stateful_seller_attribution.sql',
    import.meta.url,
  )

const sql =
  fs.readFileSync(
    migrationPath,
    'utf8',
  )

test(
  'A5.3.1 adiciona seller_user_id como snapshot histórico',
  () => {
    assert.match(
      sql,
      /add column if not exists\s+seller_user_id uuid/i,
    )
  },
)

test(
  'snapshot usa owner_user_id do ciclo no instante do insert',
  () => {
    assert.match(
      sql,
      /select\s+cycle\.owner_user_id\s+into\s+v_owner_user_id/i,
    )

    assert.match(
      sql,
      /cycle\.company_id\s*=\s*new\.company_id/i,
    )

    assert.match(
      sql,
      /cycle\.id\s*=\s*new\.cycle_id/i,
    )

    assert.match(
      sql,
      /new\.seller_user_id\s*:=\s*v_owner_user_id/i,
    )
  },
)

test(
  'snapshot acontece antes da persistência do evento',
  () => {
    assert.match(
      sql,
      /create trigger\s+companion_state_event_seller_snapshot\s+before insert/i,
    )

    assert.match(
      sql,
      /public\.companion_commercial_state_events/i,
    )
  },
)

test(
  'migração não tenta atribuir retroativamente eventos antigos ao dono atual',
  () => {
    assert.doesNotMatch(
      sql,
      /update\s+public\.companion_commercial_state_events\s+set\s+seller_user_id/i,
    )

    assert.match(
      sql,
      /eventos históricos anteriores a esta coluna podem permanecer NULL/i,
    )
  },
)

test(
  'snapshot não depende do usuário que executou a análise',
  () => {
    assert.doesNotMatch(
      sql,
      /created_by/i,
    )

    assert.doesNotMatch(
      sql,
      /requesting_user_id/i,
    )

    assert.doesNotMatch(
      sql,
      /auth\.uid/i,
    )
  },
)

test(
  'migração cria índice para consultas gerenciais por vendedor',
  () => {
    assert.match(
      sql,
      /companion_commercial_state_events_seller_generated_idx/i,
    )

    assert.match(
      sql,
      /company_id,\s*seller_user_id,\s*generated_at desc/i,
    )
  },
)

test(
  'migração não adiciona escrita automática de CRM ou Agenda',
  () => {
    assert.doesNotMatch(
      sql,
      /update\s+public\.sales_cycles/i,
    )

    assert.doesNotMatch(
      sql,
      /automatic_crm_write\s*=\s*true/i,
    )

    assert.doesNotMatch(
      sql,
      /automatic_agenda_write\s*=\s*true/i,
    )
  },
)

test(
  'trigger falha fechado quando o ciclo não existe',
  () => {
    assert.match(
      sql,
      /if not found then/i,
    )

    assert.match(
      sql,
      /Ciclo comercial não encontrado para snapshot do vendedor/i,
    )
  },
)
