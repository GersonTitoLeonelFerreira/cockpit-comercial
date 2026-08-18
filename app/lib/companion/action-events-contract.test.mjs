import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ActionEventContractError,
  COMPANION_ACTION_TYPES,
  getActionEventRpcErrorHttpStatus,
  normalizeRegisterActionEventBody,
} from './action-events-contract.ts'

const CYCLE_ID = '10000000-0000-4000-8000-000000000001'
const COACHING_NOTE_ID = '20000000-0000-4000-8000-000000000001'

function validBody(overrides = {}) {
  return {
    cycle_id: CYCLE_ID,
    action_type: 'suggestion_shown',
    idempotency_key: 'evt-001',
    coaching_note_id: COACHING_NOTE_ID,
    conversation_key: 'Cliente Exemplo::5511999990001',
    metadata: { channel: 'whatsapp' },
    ...overrides,
  }
}

test('normaliza um payload válido completo', () => {
  const normalized = normalizeRegisterActionEventBody(validBody())

  assert.deepEqual(normalized, {
    cycle_id: CYCLE_ID,
    action_type: 'suggestion_shown',
    idempotency_key: 'evt-001',
    coaching_note_id: COACHING_NOTE_ID,
    conversation_key: 'Cliente Exemplo::5511999990001',
    metadata: { channel: 'whatsapp' },
  })
})

test('aceita payload mínimo sem campos opcionais', () => {
  const normalized = normalizeRegisterActionEventBody({
    cycle_id: CYCLE_ID,
    action_type: 'suggestion_sent',
    idempotency_key: 'evt-002',
  })

  assert.deepEqual(normalized, {
    cycle_id: CYCLE_ID,
    action_type: 'suggestion_sent',
    idempotency_key: 'evt-002',
    coaching_note_id: null,
    conversation_key: null,
    metadata: {},
  })
})

test('suporta todos os action_type do contrato', () => {
  for (const actionType of COMPANION_ACTION_TYPES) {
    const normalized = normalizeRegisterActionEventBody(
      validBody({ action_type: actionType, idempotency_key: `evt-${actionType}` }),
    )

    assert.equal(normalized.action_type, actionType)
  }
})

test('rejeita corpo que não é objeto', () => {
  assert.throws(
    () => normalizeRegisterActionEventBody(null),
    ActionEventContractError,
  )

  assert.throws(
    () => normalizeRegisterActionEventBody('string'),
    ActionEventContractError,
  )
})

test('rejeita cycle_id ausente ou inválido', () => {
  assert.throws(
    () => normalizeRegisterActionEventBody(validBody({ cycle_id: undefined })),
    /cycle_id/,
  )

  assert.throws(
    () => normalizeRegisterActionEventBody(validBody({ cycle_id: 'not-a-uuid' })),
    /cycle_id/,
  )
})

test('rejeita action_type fora da lista suportada', () => {
  assert.throws(
    () =>
      normalizeRegisterActionEventBody(
        validBody({ action_type: 'suggestion_deleted' }),
      ),
    (error) => {
      assert.ok(error instanceof ActionEventContractError)
      assert.equal(error.code, 'INVALID_ACTION_TYPE')
      return true
    },
  )
})

test('rejeita idempotency_key vazia', () => {
  assert.throws(
    () => normalizeRegisterActionEventBody(validBody({ idempotency_key: '   ' })),
    (error) => {
      assert.ok(error instanceof ActionEventContractError)
      assert.equal(error.code, 'EMPTY_IDEMPOTENCY_KEY')
      return true
    },
  )
})

test('rejeita idempotency_key acima do limite', () => {
  assert.throws(
    () =>
      normalizeRegisterActionEventBody(
        validBody({ idempotency_key: 'a'.repeat(201) }),
      ),
    (error) => {
      assert.ok(error instanceof ActionEventContractError)
      assert.equal(error.code, 'IDEMPOTENCY_KEY_TOO_LONG')
      return true
    },
  )
})

test('rejeita coaching_note_id malformado', () => {
  assert.throws(
    () =>
      normalizeRegisterActionEventBody(
        validBody({ coaching_note_id: 'not-a-uuid' }),
      ),
    /coaching_note_id/,
  )
})

test('rejeita metadata que não é objeto', () => {
  assert.throws(
    () => normalizeRegisterActionEventBody(validBody({ metadata: ['a', 'b'] })),
    (error) => {
      assert.ok(error instanceof ActionEventContractError)
      assert.equal(error.code, 'INVALID_METADATA')
      return true
    },
  )
})

test('rejeita metadata com conteúdo de conversa', () => {
  for (const forbiddenKey of [
    'conversation_text',
    'messages',
    'suggested_message',
    'text_content',
    'audio_transcription',
  ]) {
    assert.throws(
      () =>
        normalizeRegisterActionEventBody(
          validBody({ metadata: { [forbiddenKey]: 'conteúdo sensível' } }),
        ),
      (error) => {
        assert.ok(error instanceof ActionEventContractError)
        assert.equal(error.code, 'METADATA_CONTAINS_CONVERSATION_CONTENT')
        return true
      },
    )
  }
})

test('mapeia mensagens de erro da RPC para status HTTP', () => {
  assert.equal(
    getActionEventRpcErrorHttpStatus({
      message: 'Ciclo comercial não encontrado na empresa informada',
    }),
    404,
  )

  assert.equal(
    getActionEventRpcErrorHttpStatus({
      message: 'coaching_note_id não pertence a esta empresa ou ciclo',
    }),
    409,
  )

  assert.equal(
    getActionEventRpcErrorHttpStatus({
      message: 'idempotency_key já foi usada para um evento diferente',
    }),
    409,
  )

  assert.equal(
    getActionEventRpcErrorHttpStatus({ message: 'action_type inválido' }),
    400,
  )

  assert.equal(
    getActionEventRpcErrorHttpStatus({ message: 'erro inesperado no banco' }),
    500,
  )
})
