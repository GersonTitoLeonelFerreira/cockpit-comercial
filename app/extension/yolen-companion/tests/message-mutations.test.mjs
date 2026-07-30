import test from 'node:test'
import assert from 'node:assert/strict'
import messageMutations from '../src/message-mutations.js'

const {
  areCapturedMessagesEqual,
  buildMessageSnapshotFingerprint,
  cleanCapturedMessageText,
  getLatestDateMessageBlock,
  isDeletedMessageText,
} = messageMutations

function message(overrides = {}) {
  return {
    id: 'message-1',
    timestampMs: 100,
    timestampLabel: '29/07/2026 10:00',
    dateKey: '2026-07-29',
    direction: 'incoming',
    sender: 'Lead',
    text: 'Olá',
    hasAudio: false,
    ...overrides,
  }
}

test('preserva horário legítimo no final da mensagem', () => {
  assert.equal(
    cleanCapturedMessageText(
      'Pode ser às 17:35',
    ),
    'Pode ser às 17:35',
  )
})

test('preserva texto repetido sem cortar metade', () => {
  assert.equal(
    cleanCapturedMessageText('haha'),
    'haha',
  )
})

test('descarta apenas um nó que contém somente horário', () => {
  assert.equal(
    cleanCapturedMessageText('17:35'),
    '',
  )
})

test('reconhece mensagens apagadas em português e inglês', () => {
  assert.equal(
    isDeletedMessageText(
      'Esta mensagem foi apagada 17:35',
    ),
    true,
  )
  assert.equal(
    isDeletedMessageText(
      'This message was deleted',
    ),
    true,
  )
  assert.equal(
    isDeletedMessageText(
      'Pode ser às 17:35',
    ),
    false,
  )
})

test('distingue mensagem editada de mensagem inalterada', () => {
  const current = message()

  assert.equal(
    areCapturedMessagesEqual(
      current,
      message(),
    ),
    true,
  )
  assert.equal(
    areCapturedMessagesEqual(
      current,
      message({
        text: 'Olá, tudo bem?',
      }),
    ),
    false,
  )
})

test('mantém conversa retomada no mesmo dia mesmo após quatro horas', () => {
  const messages = [
    message({
      id: 'old-day',
      dateKey: '2026-07-28',
      timestampMs: 1,
    }),
    message({
      id: 'morning',
      timestampMs: 2,
      text: 'Bom dia',
    }),
    message({
      id: 'evening',
      timestampMs:
        2 + 8 * 60 * 60 * 1000,
      text: 'Retomando a conversa',
    }),
  ]

  assert.deepEqual(
    getLatestDateMessageBlock(
      messages,
    ).map((item) => item.id),
    ['morning', 'evening'],
  )
})

test('altera a chave somente quando o conteúdo efetivamente muda', () => {
  const currentMessages = [
    {
      id: 'message-1',
      timestamp_ms: 100,
      direction: 'incoming',
      text: 'Olá',
      has_audio: false,
      audio_transcription: null,
    },
  ]

  const currentHash =
    buildMessageSnapshotFingerprint(
      currentMessages,
    )

  assert.equal(
    buildMessageSnapshotFingerprint(
      currentMessages,
    ),
    currentHash,
  )

  assert.notEqual(
    buildMessageSnapshotFingerprint([
      {
        ...currentMessages[0],
        text: 'Olá, tudo bem?',
      },
    ]),
    currentHash,
  )

  assert.notEqual(
    buildMessageSnapshotFingerprint(
      currentMessages,
      ['message-deleted'],
    ),
    currentHash,
  )
})
