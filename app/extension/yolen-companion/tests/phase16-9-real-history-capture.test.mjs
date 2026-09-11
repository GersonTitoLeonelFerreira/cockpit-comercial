import assert from 'node:assert/strict'
import test from 'node:test'

import captureBatch from '../src/capture-batch.js'

const {
  selectCaptureWindow,
  buildCaptureIngestionPlan,
} = captureBatch

function message({
  id,
  occurredAt,
  dateKey,
  text,
}) {
  return {
    id,
    timestampMs: Date.parse(occurredAt),
    timestampLabel: occurredAt,
    dateKey,
    direction: 'incoming',
    sender: 'Cliente',
    text,
    hasAudio: false,
    observedAt: '2026-09-11T19:25:00.000Z',
  }
}

test(
  '16.9 real: objeção de cartão do dia anterior continua no lote quando a mensagem atual é Bom dia',
  () => {
    const cardObjection = message({
      id: 'card-objection-18-08',
      occurredAt: '2026-08-19T00:39:00.000Z',
      dateKey: '2026-08-18',
      text: 'Eu não uso cartão de crédito, como que faz nessa situação?',
    })

    const greeting = message({
      id: 'greeting-19-08',
      occurredAt: '2026-08-19T09:12:00.000Z',
      dateKey: '2026-08-19',
      text: 'Bom dia',
    })

    const captureWindow = selectCaptureWindow({
      activeMessages: [
        cardObjection,
        greeting,
      ],
      deletedMessages: [],
      pendingMutationKeys: new Set(),
    })

    assert.deepEqual(
      captureWindow.activeMessages.map(item => item.id),
      [
        'card-objection-18-08',
        'greeting-19-08',
      ],
      'mensagem ativa visível do dia anterior não pode desaparecer só porque existe mensagem em uma data mais recente',
    )

    const plan = buildCaptureIngestionPlan({
      cycleId: '30000000-0000-4000-8000-000000000001',
      conversationKey: 'phone:554498299921',
      activeMessages: captureWindow.activeMessages,
      deletedMessages: captureWindow.deletedMessages,
    })

    assert.deepEqual(
      plan.messages.map(item => ({
        key: item.message_key,
        text: item.text_content,
      })),
      [
        {
          key: 'card-objection-18-08',
          text: 'Eu não uso cartão de crédito, como que faz nessa situação?',
        },
        {
          key: 'greeting-19-08',
          text: 'Bom dia',
        },
      ],
      'o payload que chega à ingestão precisa conter a objeção anterior e a saudação atual',
    )
  },
)
