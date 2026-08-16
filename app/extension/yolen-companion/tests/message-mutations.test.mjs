import test from 'node:test'
import assert from 'node:assert/strict'
import messageMutations from '../src/message-mutations.js'

const {
  areCapturedMessagesEqual,
  buildMessageSnapshotFingerprint,
  buildStableCaptureConversationKey,
  cleanCapturedMessageText,
  findSafeDisappearedMessageIds,
  getLatestDateMessageBlock,
  inferCapturedMessageDirection,
  isDeletedMessageText,
  pickCapturedMessageText,
  prepareCapturedMessageTextForAnalysis,
  readCapturedElementText,
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

test('preserva quebras de linha internas da mensagem', () => {
  assert.equal(
    cleanCapturedMessageText(
      'Primeira linha\n Segunda linha',
    ),
    'Primeira linha\nSegunda linha',
  )
})

test('preserva conteúdo completo e limita somente a análise', () => {
  const prefix =
    'A'.repeat(4500)

  const originalText =
    `${prefix}final-original`

  const editedText =
    `${prefix}final-editado`

  const cleanedOriginal =
    cleanCapturedMessageText(
      originalText,
    )

  const cleanedEdited =
    cleanCapturedMessageText(
      editedText,
    )

  assert.equal(
    cleanedOriginal,
    originalText,
  )

  assert.equal(
    cleanedOriginal.length,
    originalText.length,
  )

  assert.equal(
    prepareCapturedMessageTextForAnalysis(
      cleanedOriginal,
    ),
    'A'.repeat(4000),
  )

  assert.notEqual(
    buildMessageSnapshotFingerprint([
      message({
        text: cleanedOriginal,
      }),
    ]),
    buildMessageSnapshotFingerprint([
      message({
        text: cleanedEdited,
      }),
    ]),
  )
})

test('lê quebras renderizadas por elementos br', () => {
  assert.equal(
    readCapturedElementText({
      innerText:
        'Primeira linha\nSegunda linha',
      textContent:
        'Primeira linhaSegunda linha',
    }),
    'Primeira linha\nSegunda linha',
  )
})

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

test('preserva quebras de linha internas da mensagem', () => {
  assert.equal(
    cleanCapturedMessageText(
      'Primeira linha\n Segunda linha',
    ),
    'Primeira linha\nSegunda linha',
  )
})

test('seleciona o corpo real e ignora conteúdo citado', () => {
  assert.equal(
    pickCapturedMessageText([
      {
        text: 'Mensagem citada',
        isQuoted: true,
      },
      {
        text:
          'Resposta atual às 17:35',
        isQuoted: false,
      },
      {
        text:
          'Resposta atual às 17:35',
        isQuoted: false,
      },
    ]),
    'Resposta atual às 17:35',
  )
})

test('gera chave estável pelo telefone e não pelo avatar ou título', () => {
  const firstKey =
    buildStableCaptureConversationKey({
      phone:
        '+55 (47) 99999-0001',
      title: 'Cliente',
    })

  const secondKey =
    buildStableCaptureConversationKey({
      phone:
        '5547999990001',
      title:
        'Cliente com outro avatar',
    })

  assert.equal(
    firstKey,
    'phone:5547999990001',
  )

  assert.equal(
    secondKey,
    firstKey,
  )

  assert.equal(
    buildStableCaptureConversationKey({
      title: 'Cliente Exemplo',
    }),
    'title:cliente exemplo',
  )
})

test('preserva marcadores antigos de direção', () => {
  assert.equal(
    inferCapturedMessageDirection({
      hasOutgoingClass: true,
    }),
    'outgoing',
  )

  assert.equal(
    inferCapturedMessageDirection({
      hasIncomingClass: true,
    }),
    'incoming',
  )

  assert.equal(
    inferCapturedMessageDirection({
      dataId:
        'true_5511999999999_message',
    }),
    'outgoing',
  )
})

test('classifica mensagens pela posição visual atual do WhatsApp', () => {
  assert.equal(
    inferCapturedMessageDirection({
      messageLeft: 500,
      messageWidth: 220,
      conversationLeft: 0,
      conversationWidth: 800,
    }),
    'outgoing',
  )

  assert.equal(
    inferCapturedMessageDirection({
      messageLeft: 62,
      messageWidth: 220,
      conversationLeft: 0,
      conversationWidth: 800,
    }),
    'incoming',
  )
})

test('usa incoming quando não há marcador ou geometria válida', () => {
  assert.equal(
    inferCapturedMessageDirection({
      messageLeft: null,
      messageWidth: null,
      conversationLeft: null,
      conversationWidth: null,
    }),
    'incoming',
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

test('detecta mensagens que desapareceram do meio ou final sem rolagem', () => {
  const previous = [
    message({
      id: 'm1',
      timestampMs: 100,
    }),
    message({
      id: 'm2',
      timestampMs: 200,
    }),
    message({
      id: 'm3',
      timestampMs: 300,
    }),
    message({
      id: 'm4',
      timestampMs: 400,
    }),
  ]

  const current = [
    previous[0],
    previous[1],
  ]

  assert.deepEqual(
    findSafeDisappearedMessageIds({
      previousVisibleMessages:
        previous,
      currentVisibleMessages:
        current,
      recentScroll:
        false,
    }),
    [
      'm3',
      'm4',
    ],
  )
})

test('não interpreta virtualização no topo como exclusão', () => {
  const previous = [
    message({
      id: 'm1',
      timestampMs: 100,
    }),
    message({
      id: 'm2',
      timestampMs: 200,
    }),
    message({
      id: 'm3',
      timestampMs: 300,
    }),
  ]

  assert.deepEqual(
    findSafeDisappearedMessageIds({
      previousVisibleMessages:
        previous,
      currentVisibleMessages: [
        previous[1],
        previous[2],
      ],
      recentScroll:
        false,
    }),
    [],
  )
})

test('não interpreta desaparecimento durante rolagem como exclusão', () => {
  const previous = [
    message({
      id: 'm1',
      timestampMs: 100,
    }),
    message({
      id: 'm2',
      timestampMs: 200,
    }),
    message({
      id: 'm3',
      timestampMs: 300,
    }),
  ]

  assert.deepEqual(
    findSafeDisappearedMessageIds({
      previousVisibleMessages:
        previous,
      currentVisibleMessages: [
        previous[0],
        previous[1],
      ],
      recentScroll:
        true,
    }),
    [],
  )
})
