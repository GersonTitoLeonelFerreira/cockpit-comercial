import assert from 'node:assert/strict'
import test from 'node:test'

import captureTransport from '../src/capture-transport.js'

const {
  buildIngestionRequestBody,
  createDeviceKey,
  isUuid,
} = captureTransport

const DEVICE_KEY =
  '50000000-0000-4000-8000-000000000001'

test('reconhece um device_key UUID válido', () => {
  assert.equal(
    isUuid(DEVICE_KEY),
    true,
  )

  assert.equal(
    isUuid('device-invalido'),
    false,
  )
})

test('usa randomUUID quando disponível', () => {
  const generated = createDeviceKey({
    randomUUID() {
      return DEVICE_KEY.toUpperCase()
    },
  })

  assert.equal(
    generated,
    DEVICE_KEY,
  )
})

test('cria UUID versão 4 com getRandomValues', () => {
  const generated = createDeviceKey({
    getRandomValues(bytes) {
      for (
        let index = 0;
        index < bytes.length;
        index += 1
      ) {
        bytes[index] = index
      }

      return bytes
    },
  })

  assert.equal(
    isUuid(generated),
    true,
  )

  assert.equal(
    generated[14],
    '4',
  )

  assert.match(
    generated[19],
    /[89ab]/,
  )
})

test('background injeta e prevalece o device_key da instalação', () => {
  const payload = {
    contract_version: 'pt4-c-v1',
    cycle_id:
      '30000000-0000-4000-8000-000000000001',
    conversation_key:
      'Cliente Exemplo::data:5511999990001',
    device_key:
      '60000000-0000-4000-8000-000000000001',
    messages: [
      {
        message_key: 'message-001',
        direction: 'incoming',
        occurred_at:
          '2026-08-02T18:00:00.000Z',
        content_type: 'text',
        text_content: 'Olá',
        audio_transcription: null,
        is_deleted: false,
      },
    ],
  }

  const body = buildIngestionRequestBody(
    payload,
    DEVICE_KEY,
  )

  assert.equal(
    body.device_key,
    DEVICE_KEY,
  )

  assert.equal(
    body.cycle_id,
    payload.cycle_id,
  )

  assert.deepEqual(
    body.messages,
    payload.messages,
  )
})

test('rejeita payload ou device_key inválido', () => {
  assert.throws(
    () => {
      buildIngestionRequestBody(
        null,
        DEVICE_KEY,
      )
    },
    /precisa ser um objeto/i,
  )

  assert.throws(
    () => {
      buildIngestionRequestBody(
        {},
        'device-invalido',
      )
    },
    /identificador da instalação é inválido/i,
  )
})
