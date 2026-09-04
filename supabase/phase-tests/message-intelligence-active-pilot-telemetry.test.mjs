import assert from 'node:assert/strict'
import {
  readFileSync,
} from 'node:fs'
import test from 'node:test'

const migration =
  readFileSync(
    new URL(
      '../migrations/20260904014500_create_message_intelligence_active_pilot_events.sql',
      import.meta.url,
    ),
    'utf8',
  )

test(
  'migration cria domínio dedicado do piloto ativo MIE',
  () => {
    assert.match(
      migration,
      /create table\s+public\.message_intelligence_active_pilot_events/i,
    )

    assert.match(
      migration,
      /active_selected/,
    )

    assert.match(
      migration,
      /active_fallback_no_message/,
    )

    assert.match(
      migration,
      /active_execution_failed/,
    )
  },
)

test(
  'migration bloqueia qualquer ação automática',
  () => {
    assert.match(
      migration,
      /automatic_send\s*=\s*false/i,
    )

    assert.match(
      migration,
      /automatic_crm_write\s*=\s*false/i,
    )

    assert.match(
      migration,
      /automatic_agenda_write\s*=\s*false/i,
    )
  },
)

test(
  'migration não possui colunas com conteúdo seller-facing ou conversa',
  () => {
    const forbiddenColumns = [
      'conversation_key',
      'seller_intent',
      'mie_message',
      'legacy_message',
      'suggested_message',
      'conversation_text',
    ]

    for (const column of forbiddenColumns) {
      const columnPattern =
        new RegExp(
          `\\n\\s+${column}\\s+`,
          'i',
        )

      assert.doesNotMatch(
        migration,
        columnPattern,
      )
    }
  },
)

test(
  'cliente não recebe acesso à telemetria',
  () => {
    assert.match(
      migration,
      /force row level security/i,
    )

    assert.match(
      migration,
      /to anon, authenticated\s+using \(false\)/i,
    )

    assert.match(
      migration,
      /grant\s+select,\s+insert[\s\S]+to service_role/i,
    )
  },
)
