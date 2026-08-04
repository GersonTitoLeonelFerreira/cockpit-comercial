import assert from 'node:assert/strict'
import test from 'node:test'

import captureBatch from '../src/capture-batch.js'

const {
    isCaptureResolutionEligible,
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
    observedAt:
      '2026-08-03T20:00:00.000Z',
    ...overrides,
  }
}

test('permite captura somente com resolução habilitada e ciclo aberto', () => {
    const eligibleResolution = {
      status: 'OWNED_BY_ME',
      cycle: {
        id:
          '30000000-0000-4000-8000-000000000001',
      },
      actions: {
        can_analyze_conversation: true,
      },
      flags: {
        is_closed: false,
      },
    }

    assert.equal(
      isCaptureResolutionEligible(
        eligibleResolution,
      ),
      true,
    )

    assert.equal(
      isCaptureResolutionEligible({
        ...eligibleResolution,
        status: 'CLOSED_CYCLE',
        flags: {
          is_closed: true,
        },
      }),
      false,
    )

    assert.equal(
      isCaptureResolutionEligible({
        ...eligibleResolution,
        actions: {
          can_analyze_conversation: false,
        },
      }),
      false,
    )

    assert.equal(
      isCaptureResolutionEligible({
        ...eligibleResolution,
        cycle: null,
      }),
      false,
    )

    assert.equal(
      isCaptureResolutionEligible(null),
      false,
    )
  })

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
      observed_at:
        '2026-08-03T20:00:00.000Z',
      base_version: null,
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
      observed_at:
        '2026-08-03T20:00:00.000Z',
      base_version: null,
      content_type: 'audio',
      text_content: null,
      audio_transcription:
        'Vou explicar as opções disponíveis.',
      is_deleted: false,
    },
  ])
})

test('inclui a versão causal confirmada por mensagem', () => {
  const messages = buildCaptureMessages({
    activeMessages: [
      activeMessage(),
    ],
    baseVersionsByMessageKey: {
      'message-001': '7',
    },
  })

  assert.equal(
    messages[0].base_version,
    '7',
  )
})

test('preserva mensagem longa e detecta edição depois do caractere quatro mil', () => {
    const prefix =
      'A'.repeat(4500)

    const originalText =
      `${prefix}final-original`

    const editedText =
      `${prefix}final-editado`

    const originalPlan =
      buildCaptureIngestionPlan({
        cycleId:
          '30000000-0000-4000-8000-000000000001',
        conversationKey:
          'phone:5511999990001',
        activeMessages: [
          activeMessage({
            text: originalText,
          }),
        ],
      })

    const editedPlan =
      buildCaptureIngestionPlan({
        cycleId:
          '30000000-0000-4000-8000-000000000001',
        conversationKey:
          'phone:5511999990001',
        activeMessages: [
          activeMessage({
            text: editedText,
          }),
        ],
      })

    assert.equal(
      originalPlan.messages[0]
        .text_content,
      originalText,
    )

    assert.ok(
      originalPlan.messages[0]
        .text_content.length > 4000,
    )

    assert.notEqual(
      originalPlan.snapshotKey,
      editedPlan.snapshotKey,
    )
  })

  test('preserva a observação individual sem alterar o fingerprint do estado', () => {
    const firstObservation =
      buildCaptureIngestionPlan({
        cycleId:
          '30000000-0000-4000-8000-000000000001',
        conversationKey:
          'phone:5511999990001',
        activeMessages: [
          activeMessage({
            observedAt:
              '2026-08-03T20:00:00.000Z',
          }),
          activeMessage({
            id: 'message-002',
            timestampMs: Date.parse(
              '2026-08-02T18:01:00.000Z',
            ),
            observedAt:
              '2026-08-03T20:05:00.000Z',
          }),
        ],
      })

    const laterObservation =
      buildCaptureIngestionPlan({
        cycleId:
          '30000000-0000-4000-8000-000000000001',
        conversationKey:
          'phone:5511999990001',
        activeMessages: [
          activeMessage({
            observedAt:
              '2026-08-03T20:10:00.000Z',
          }),
          activeMessage({
            id: 'message-002',
            timestampMs: Date.parse(
              '2026-08-02T18:01:00.000Z',
            ),
            observedAt:
              '2026-08-03T20:10:00.000Z',
          }),
        ],
      })

    assert.equal(
      firstObservation.messages[0]
        .observed_at,
      '2026-08-03T20:00:00.000Z',
    )

    assert.equal(
      firstObservation.messages[1]
        .observed_at,
      '2026-08-03T20:05:00.000Z',
    )

    assert.equal(
      firstObservation.observedAt,
      '2026-08-03T20:05:00.000Z',
    )

    assert.equal(
      firstObservation
        .batches[0]
        .observed_at,
      '2026-08-03T20:05:00.000Z',
    )

    assert.equal(
      firstObservation.snapshotKey,
      laterObservation.snapshotKey,
    )
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
      observed_at:
        '2026-08-03T20:00:00.000Z',
      base_version: null,
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
      observed_at:
        '2026-08-03T20:00:00.000Z',
      base_version: null,
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
