import assert from 'node:assert/strict'
import test from 'node:test'

import {
  selectStatefulDiagnosticMessages,
} from './stateful-copilot-real-context-loader.ts'

function buildMessage({
  id,
  occurred_at,
  observed_at = occurred_at,
}) {
  return {
    id: String(id),
    company_id: '10000000-0000-4000-8000-000000000001',
    cycle_id: '30000000-0000-4000-8000-000000000001',
    conversation_key: 'whatsapp:+5547999990001',
    message_key: `message-${id}`,
    version: 1,
    direction: 'incoming',
    occurred_at,
    observed_at,
    content_type: 'text',
    text_content: `Mensagem ${id}`,
    audio_transcription: null,
    is_deleted: false,
  }
}

test(
  'bootstrap preserva a sessao atual e inclui uma ponte curta do contexto anterior',
  () => {
    const selected =
      selectStatefulDiagnosticMessages([
        buildMessage({ id: 1, occurred_at: '2026-08-05T10:00:00.000Z' }),
        buildMessage({ id: 2, occurred_at: '2026-08-05T18:00:00.000Z' }),
        buildMessage({ id: 3, occurred_at: '2026-08-05T18:05:00.000Z' }),
      ])

    assert.deepEqual(
      selected.map(message => message.id),
      ['1', '2', '3'],
    )
  },
)

test(
  'ponte de contexto anterior fica limitada a seis mensagens',
  () => {
    const oldSession = Array.from(
      { length: 10 },
      (_, index) =>
        buildMessage({
          id: index + 1,
          occurred_at: new Date(
            Date.parse('2026-08-05T08:00:00.000Z') +
              index * 60_000,
          ).toISOString(),
        }),
    )

    const selected =
      selectStatefulDiagnosticMessages([
        ...oldSession,
        buildMessage({
          id: 11,
          occurred_at: '2026-08-05T18:00:00.000Z',
        }),
        buildMessage({
          id: 12,
          occcurred_at: '2026-08-05T18:05:00.000Z',
        }),
      ])

    assert.deepEqual(
      selected.map(message => message.id),
      ['5', '6', '7', '8', '9', '10', '11', '12'],
    )
  },
)

test(
  'mensagem antiga editada hoje entra pela observed_at sem alterar occurred_at',
  () => {
    const selected =
      selectStatefulDiagnosticMessages([
        buildMessage({
          id: 1,
          occurred_at: '2026-08-01T10:00:00.000Z',
          observed_at: '2026-08-05T18:04:00.000Z',
        }),
        buildMessage({ id: 2, occurred_at: '2026-08-05T18:05:00.000Z' }),
      ])

    assert.deepEqual(
      selected.map(message => message.id),
      ['1', '2'],
    )

    assert.equal(
      selected[0].occurred_at,
      '2026-08-01T10:00:00.000Z',
    )
  },
)

test(
  'sessao temporal limita o diagnostico as oitenta mensagens mais recentes',
  () => {
    const base = Date.parse('2026-08-05T18:00:00.000Z')

    const messages = Array.from(
      { length: 100 },
      (_, index) =>
        buildMessage({
          id: index + 1,
          occurred_at: new Date(base + index * 60_000).toISOString(),
        }),
    )

    const selected =
      selectStatefulDiagnosticMessages(messages)

    assert.equal(selected.length, 80)
    assert.equal(selected[0].id, '21')
    assert.equal(selected[selected.length - 1].id, '100')
  },
)
