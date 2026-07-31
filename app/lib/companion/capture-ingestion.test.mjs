import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCaptureMessageStateKey,
  CAPTURE_INGESTION_CONTRACT_VERSION,
  CaptureContractError,
  MAX_CAPTURE_BATCH_SIZE,
  normalizeCaptureIngestionEnvelope,
} from './capture-ingestion.ts'

const CYCLE_ID = '123e4567-e89b-42d3-a456-426614174000'
const DEVICE_ID = '987e6543-e21b-42d3-a456-426614174999'

function buildTextMessage(overrides = {}) {
  return {
    message_key: 'message-001',
    direction: 'incoming',
    occurred_at: '2026-07-31T15:20:00-03:00',
    content_type: 'text',
    text_content: 'Olá, quero conhecer os planos.',
    audio_transcription: null,
    is_deleted: false,
    ...overrides,
  }
}

function buildEnvelope(overrides = {}) {
  return {
    contract_version: CAPTURE_INGESTION_CONTRACT_VERSION,
    cycle_id: CYCLE_ID,
    conversation_key: 'Cliente Exemplo::data:5511999999999',
    device_key: DEVICE_ID,
    messages: [buildTextMessage()],
    ...overrides,
  }
}

test('normaliza o envelope canônico da captura', () => {
  const result = normalizeCaptureIngestionEnvelope(
    buildEnvelope({
      conversation_key: '  Cliente Exemplo::data:5511999999999  ',
      messages: [
        buildTextMessage({
          message_key: '  message-001  ',
          text_content: '  Olá, quero conhecer os planos.  ',
        }),
      ],
    }),
  )

  assert.equal(result.contract_version, 'pt4-c-v1')
  assert.equal(result.cycle_id, CYCLE_ID)
  assert.equal(result.device_key, DEVICE_ID)
  assert.equal(
    result.conversation_key,
    'Cliente Exemplo::data:5511999999999',
  )
  assert.equal(result.messages[0].message_key, 'message-001')
  assert.equal(
    result.messages[0].occurred_at,
    '2026-07-31T18:20:00.000Z',
  )
  assert.equal(
    result.messages[0].text_content,
    'Olá, quero conhecer os planos.',
  )
})

test('preserva quebras de linha internas da mensagem', () => {
  const result = normalizeCaptureIngestionEnvelope(
    buildEnvelope({
      messages: [
        buildTextMessage({
          text_content: '  Primeira linha\nSegunda linha  ',
        }),
      ],
    }),
  )

  assert.equal(
    result.messages[0].text_content,
    'Primeira linha\nSegunda linha',
  )
})

test('aceita mensagem de áudio sem transcrição', () => {
  const result = normalizeCaptureIngestionEnvelope(
    buildEnvelope({
      messages: [
        {
          message_key: 'audio-001',
          direction: 'incoming',
          occurred_at: '2026-07-31T18:21:00.000Z',
          content_type: 'audio',
          text_content: null,
          audio_transcription: null,
          is_deleted: false,
        },
      ],
    }),
  )

  assert.equal(result.messages[0].content_type, 'audio')
  assert.equal(result.messages[0].text_content, null)
  assert.equal(result.messages[0].audio_transcription, null)
})

test('aceita mensagem de áudio com legenda e transcrição', () => {
  const result = normalizeCaptureIngestionEnvelope(
    buildEnvelope({
      messages: [
        {
          message_key: 'audio-002',
          direction: 'outgoing',
          occurred_at: '2026-07-31T18:22:00.000Z',
          content_type: 'audio',
          text_content: 'Explicação do plano',
          audio_transcription: 'Aqui está a explicação completa.',
          is_deleted: false,
        },
      ],
    }),
  )

  assert.equal(
    result.messages[0].audio_transcription,
    'Aqui está a explicação completa.',
  )
})

test('mensagem excluída não preserva conteúdo', () => {
  const result = normalizeCaptureIngestionEnvelope(
    buildEnvelope({
      messages: [
        buildTextMessage({
          text_content: 'Conteúdo que foi excluído',
          audio_transcription: 'Transcrição que não pode permanecer',
          is_deleted: true,
        }),
      ],
    }),
  )

  assert.equal(result.messages[0].is_deleted, true)
  assert.equal(result.messages[0].text_content, null)
  assert.equal(result.messages[0].audio_transcription, null)
})

test('rejeita message_key duplicada no mesmo lote', () => {
  assert.throws(
    () => {
      normalizeCaptureIngestionEnvelope(
        buildEnvelope({
          messages: [
            buildTextMessage(),
            buildTextMessage({
              text_content: 'Outra versão no mesmo lote',
            }),
          ],
        }),
      )
    },
    (error) => {
      assert.ok(error instanceof CaptureContractError)
      assert.equal(error.code, 'DUPLICATE_MESSAGE_KEY')
      return true
    },
  )
})

test('rejeita mensagem de texto ativa sem conteúdo', () => {
  assert.throws(
    () => {
      normalizeCaptureIngestionEnvelope(
        buildEnvelope({
          messages: [
            buildTextMessage({
              text_content: '   ',
            }),
          ],
        }),
      )
    },
    (error) => {
      assert.ok(error instanceof CaptureContractError)
      assert.equal(error.code, 'TEXT_CONTENT_REQUIRED')
      return true
    },
  )
})

test('rejeita transcrição em mensagem de texto', () => {
  assert.throws(
    () => {
      normalizeCaptureIngestionEnvelope(
        buildEnvelope({
          messages: [
            buildTextMessage({
              audio_transcription: 'Transcrição indevida',
            }),
          ],
        }),
      )
    },
    (error) => {
      assert.ok(error instanceof CaptureContractError)
      assert.equal(
        error.code,
        'TEXT_MESSAGE_WITH_AUDIO_TRANSCRIPTION',
      )
      return true
    },
  )
})

test('rejeita device_key que não seja UUID', () => {
  assert.throws(
    () => {
      normalizeCaptureIngestionEnvelope(
        buildEnvelope({
          device_key: 'identificador-do-computador',
        }),
      )
    },
    (error) => {
      assert.ok(error instanceof CaptureContractError)
      assert.equal(error.code, 'INVALID_UUID')
      assert.equal(error.path, 'device_key')
      return true
    },
  )
})

test('rejeita versão incompatível do contrato', () => {
  assert.throws(
    () => {
      normalizeCaptureIngestionEnvelope(
        buildEnvelope({
          contract_version: 'pt4-c-v0',
        }),
      )
    },
    (error) => {
      assert.ok(error instanceof CaptureContractError)
      assert.equal(error.code, 'UNSUPPORTED_CONTRACT_VERSION')
      return true
    },
  )
})

test('rejeita lote acima do limite permitido', () => {
  const messages = Array.from(
    {
      length: MAX_CAPTURE_BATCH_SIZE + 1,
    },
    (_, index) => {
      return buildTextMessage({
        message_key: `message-${index}`,
      })
    },
  )

  assert.throws(
    () => {
      normalizeCaptureIngestionEnvelope(
        buildEnvelope({
          messages,
        }),
      )
    },
    (error) => {
      assert.ok(error instanceof CaptureContractError)
      assert.equal(error.code, 'CAPTURE_BATCH_TOO_LARGE')
      return true
    },
  )
})

test('estado idêntico gera a mesma chave de idempotência', () => {
  const first = normalizeCaptureIngestionEnvelope(
    buildEnvelope(),
  ).messages[0]

  const second = normalizeCaptureIngestionEnvelope(
    buildEnvelope(),
  ).messages[0]

  assert.equal(
    buildCaptureMessageStateKey(first),
    buildCaptureMessageStateKey(second),
  )
})

test('edição altera a chave de estado da mensagem', () => {
  const original = normalizeCaptureIngestionEnvelope(
    buildEnvelope(),
  ).messages[0]

  const edited = normalizeCaptureIngestionEnvelope(
    buildEnvelope({
      messages: [
        buildTextMessage({
          text_content: 'Olá, quero conhecer o Plano Open.',
        }),
      ],
    }),
  ).messages[0]

  assert.notEqual(
    buildCaptureMessageStateKey(original),
    buildCaptureMessageStateKey(edited),
  )
})

test('exclusão altera a chave e remove o conteúdo', () => {
  const original = normalizeCaptureIngestionEnvelope(
    buildEnvelope(),
  ).messages[0]

  const deleted = normalizeCaptureIngestionEnvelope(
    buildEnvelope({
      messages: [
        buildTextMessage({
          is_deleted: true,
        }),
      ],
    }),
  ).messages[0]

  assert.notEqual(
    buildCaptureMessageStateKey(original),
    buildCaptureMessageStateKey(deleted),
  )

  assert.equal(deleted.text_content, null)
  assert.equal(deleted.audio_transcription, null)
})