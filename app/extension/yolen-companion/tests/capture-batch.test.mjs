import assert from 'node:assert/strict'
import test from 'node:test'

import captureBatch from '../src/capture-batch.js'

const {
    selectCaptureWindow,
    buildCaptureIngestionPlan,
    buildCaptureMessages,
  } = captureBatch

function activeMessage(overrides = {}) {
  return {
    id: 'message-001',
    timestampMs: Date.parse(
      '2026-08-02T18:00:00.000Z',
    ),
    timestampLabel:
      '02/08/2026 15:00',
    dateKey: '2026-08-02',
    direction: 'incoming',
    sender: 'Lead',
    text: 'Olá, quero conhecer os planos.',
    hasAudio: false,
    ...overrides,
  }
}

test('inclui mutações antigas junto da data mais recente', () => {
    const editedFromOlderDate =
      activeMessage({
        id: 'older-edited',
        timestampMs: Date.parse(
          '2026-08-01T18:00:00.000Z',
        ),
        timestampLabel:
          '01/08/2026 15:00',
        dateKey: '2026-08-01',
        text: 'Mensagem antiga editada.',
      })

    const unchangedFromOlderDate =
      activeMessage({
        id: 'older-unchanged',
        timestampMs: Date.parse(
          '2026-08-01T19:00:00.000Z',
        ),
        timestampLabel:
          '01/08/2026 16:00',
        dateKey: '2026-08-01',
        text: 'Mensagem antiga inalterada.',
      })

    const deletedFromOlderDate =
      activeMessage({
        id: 'older-deleted',
        timestampMs: Date.parse(
          '2026-08-01T20:00:00.000Z',
        ),
        timestampLabel:
          '01/08/2026 17:00',
        dateKey: '2026-08-01',
        text: '',
      })

    const latestMessage =
      activeMessage({
        id: 'latest-message',
        timestampMs: Date.parse(
          '2026-08-02T18:00:00.000Z',
        ),
        dateKey: '2026-08-02',
      })

    const captureWindow =
      selectCaptureWindow({
        activeMessages: [
          editedFromOlderDate,
          unchangedFromOlderDate,
          latestMessage,
        ],
        deletedMessages: [
          deletedFromOlderDate,
        ],
        pendingMutationKeys:
          new Set([
            'older-edited',
            'older-deleted',
          ]),
      })

    assert.deepEqual(
      captureWindow.activeMessages.map(
        (message) => message.id,
      ),
      [
        'older-edited',
        'latest-message',
      ],
    )

    assert.deepEqual(
      captureWindow.deletedMessages.map(
        (message) => message.id,
      ),
      [
        'older-deleted',
      ],
    )
  })


test('converte mensagens de texto e áudio para o contrato de ingestão', () => {
  const messages = buildCaptureMessages({
    activeMessages: [
      activeMessage(),
      activeMessage({
        id: 'audio-001',
        timestampMs: Date.parse(
          '2026-08-02T18:01:00.000Z',
        ),
        direction: 'outgoing',
        text: '',
        hasAudio: true,
      }),
    ],
    transcriptionsByKey: {
      transcription: {
        targetKey: 'audio-001',
        text:
          'Vou explicar as opções disponíveis.',
      },
    },
  })

  assert.deepEqual(messages, [
    {
      message_key: 'message-001',
      direction: 'incoming',
      occurred_at:
        '2026-08-02T18:00:00.000Z',
      content_type: 'text',
      text_content:
        'Olá, quero conhecer os planos.',
      audio_transcription: null,
      is_deleted: false,
    },
    {
      message_key: 'audio-001',
      direction: 'outgoing',
      occurred_at:
        '2026-08-02T18:01:00.000Z',
      content_type: 'audio',
      text_content: null,
      audio_transcription:
        'Vou explicar as opções disponíveis.',
      is_deleted: false,
    },
  ])
})

test('mensagem excluída não preserva conteúdo ou transcrição', () => {
  const messages = buildCaptureMessages({
    deletedMessages: [
      activeMessage({
        id: 'deleted-001',
        text:
          'Este conteúdo não pode permanecer.',
        hasAudio: true,
      }),
    ],
  })

  assert.deepEqual(messages, [
    {
      message_key: 'deleted-001',
      direction: 'incoming',
      occurred_at:
        '2026-08-02T18:00:00.000Z',
      content_type: 'audio',
      text_content: null,
      audio_transcription: null,
      is_deleted: true,
    },
  ])
})

test('mensagem restaurada ativa prevalece sobre a fotografia excluída', () => {
  const restored =
    activeMessage({
      id: 'restored-001',
      text: 'Mensagem restaurada.',
    })

  const messages = buildCaptureMessages({
    deletedMessages: [
      {
        ...restored,
        text: '',
      },
    ],
    activeMessages: [
      restored,
    ],
  })

  assert.equal(
    messages.length,
    1,
  )

  assert.deepEqual(
    messages[0],
    {
      message_key: 'restored-001',
      direction: 'incoming',
      occurred_at:
        '2026-08-02T18:00:00.000Z',
      content_type: 'text',
      text_content:
        'Mensagem restaurada.',
      audio_transcription: null,
      is_deleted: false,
    },
  )
})

test('ordena as mensagens e divide lotes acima de duzentos itens', () => {
  const activeMessages =
    Array.from(
      { length: 201 },
      (_, index) => {
        return activeMessage({
          id: `message-${String(
            index,
          ).padStart(3, '0')}`,
          timestampMs:
            Date.parse(
              '2026-08-02T18:00:00.000Z',
            ) + index,
          text:
            `Mensagem ${index}`,
        })
      },
    ).reverse()

  const plan =
    buildCaptureIngestionPlan({
      cycleId:
        '30000000-0000-4000-8000-000000000001',
      conversationKey:
        'Cliente::data:5511999990001',
      activeMessages,
    })

  assert.equal(
    plan.messages.length,
    201,
  )

  assert.equal(
    plan.batches.length,
    2,
  )

  assert.equal(
    plan.batches[0].messages.length,
    200,
  )

  assert.equal(
    plan.batches[1].messages.length,
    1,
  )

  assert.equal(
    plan.messages[0].message_key,
    'message-000',
  )

  assert.equal(
    plan.messages[200].message_key,
    'message-200',
  )
})

test('fotografia idêntica é estável e muda com edição, exclusão ou transcrição', () => {
  const baseArguments = {
    cycleId:
      '30000000-0000-4000-8000-000000000001',
    conversationKey:
      'Cliente::data:5511999990001',
    activeMessages: [
      activeMessage(),
      activeMessage({
        id: 'audio-001',
        timestampMs: Date.parse(
          '2026-08-02T18:01:00.000Z',
        ),
        text: '',
        hasAudio: true,
      }),
    ],
  }

  const initial =
    buildCaptureIngestionPlan(
      baseArguments,
    )

  const repeated =
    buildCaptureIngestionPlan(
      baseArguments,
    )

  const edited =
    buildCaptureIngestionPlan({
      ...baseArguments,
      activeMessages: [
        activeMessage({
          text:
            'Olá, quero conhecer o Plano Open.',
        }),
        baseArguments.activeMessages[1],
      ],
    })

  const deleted =
    buildCaptureIngestionPlan({
      ...baseArguments,
      activeMessages: [
        baseArguments.activeMessages[1],
      ],
      deletedMessages: [
        baseArguments.activeMessages[0],
      ],
    })

  const transcribed =
    buildCaptureIngestionPlan({
      ...baseArguments,
      transcriptionsByKey: {
        audio: {
          targetKey: 'audio-001',
          text:
            'Transcrição adicionada.',
        },
      },
    })

  assert.equal(
    repeated.snapshotKey,
    initial.snapshotKey,
  )

  assert.notEqual(
    edited.snapshotKey,
    initial.snapshotKey,
  )

  assert.notEqual(
    deleted.snapshotKey,
    initial.snapshotKey,
  )

  assert.notEqual(
    transcribed.snapshotKey,
    initial.snapshotKey,
  )
})
