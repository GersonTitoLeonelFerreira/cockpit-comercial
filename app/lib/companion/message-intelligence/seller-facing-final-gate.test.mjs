import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMessageIntelligenceRequestFixture,
  buildMessageIntelligenceSourcesFixture,
} from './fixtures.ts'

import {
  assembleMessageContextSnapshotV1,
} from './context-assembler.ts'

import {
  runMessageIntelligenceFromSnapshotV1,
} from './message-intelligence-runner.ts'

const CUSTOMER_KEYS = [
  'objectives',
  'problems',
  'impacts',
  'needs',
  'interests',
  'decision_criteria',
  'preferences',
  'open_questions',
  'objections',
  'uncertainties',
  'products',
  'competitors',
  'commitments',
  'missing_discovery',
  'communication_observations',
  'signals',
  'resolved_information',
  'superseded_information',
]

function memory({
  collection,
  kind,
  summary,
  id,
}) {
  return {
    memory_id: id,
    collection,
    kind,
    summary,
    value: null,
    confidence: 'high',
    memory_status: 'active',
    created_in_state_version: 1,
    updated_in_state_version: 1,
    closed_in_state_version: null,
    evidence_message_ids: [
      'historical-message-1',
    ],
    attributes: {},
    provenance: [],
  }
}

function buildSnapshot({
  sellerIntent,
  incomingText,
  setup,
}) {
  const request =
    buildMessageIntelligenceRequestFixture()

  request.seller_intent =
    sellerIntent

  const snapshot =
    assembleMessageContextSnapshotV1({
      request,
      sources:
        buildMessageIntelligenceSourcesFixture(),
    })

  for (const key of CUSTOMER_KEYS) {
    snapshot.customer[key] = []
  }

  snapshot.commercial
    .commercial_relevance = null

  snapshot.commercial
    .recovery_guidance = null

  const incoming =
    snapshot.conversation.messages
      .filter(message =>
        message.direction === 'incoming'
      )
      .at(-1)

  const currentIncoming =
    snapshot.conversation
      .current_interaction
      ?.messages
      .filter(message =>
        message.direction === 'incoming'
      )
      .at(-1)

  assert.ok(incoming)
  assert.ok(currentIncoming)

  incoming.text_content =
    incomingText

  incoming.audio_transcription =
    null

  currentIncoming.text_content =
    incomingText

  currentIncoming.audio_transcription =
    null

  setup?.(snapshot)

  return snapshot
}

test(
  'seller-facing final: descoberta pergunta a necessidade antes de avançar',
  () => {
    const snapshot =
      buildSnapshot({
        incomingText:
          'Quero entender se isso serve para mim.',
        sellerIntent:
          'Entender melhor a necessidade antes de apresentar a solução.',
        setup(current) {
          current.customer
            .missing_discovery
            .push(
              memory({
                collection:
                  'missing_discovery',
                kind:
                  'client.missing_discovery.need',
                summary:
                  'Necessidade principal ainda precisa ser esclarecida.',
                id:
                  'missing-need',
              }),
            )
        },
      })

    const run =
      runMessageIntelligenceFromSnapshotV1(
        snapshot,
      )

    assert.equal(
      run.strategy.commercial_move.move,
      'advance_discovery',
    )

    assert.equal(
      run.final_message_result.status,
      'selected',
    )

    assert.equal(
      run.final_message_result
        .final_message?.text,
      'O que você precisa que a solução resolva?',
    )
  },
)

test(
  'seller-facing final: agradecimento casual recebe resposta natural',
  () => {
    const run =
      runMessageIntelligenceFromSnapshotV1(
        buildSnapshot({
          incomingText:
            'Obrigado pela ajuda!',
          sellerIntent:
            'Responder de forma casual e fortalecer o relacionamento, sem objetivo comercial.',
        }),
      )

    assert.equal(
      run.strategy.commercial_move.move,
      'no_commercial_move',
    )

    assert.equal(
      run.final_message_result.status,
      'selected',
    )

    assert.equal(
      run.final_message_result
        .final_message?.text,
      'Imagina! Se precisar, pode me chamar.',
    )
  },
)

test(
  'seller-facing final: follow-up não cai em próxima etapa genérica',
  () => {
    const run =
      runMessageIntelligenceFromSnapshotV1(
        buildSnapshot({
          incomingText:
            'Oi.',
          sellerIntent:
            'Quero fazer follow-up e cobrar retorno.',
        }),
      )

    assert.equal(
      run.strategy.situation.situation,
      'follow_up',
    )

    assert.equal(
      run.final_message_result.status,
      'selected',
    )

    assert.equal(
      run.final_message_result
        .final_message?.text,
      'Passando para retomar nossa conversa e saber se você conseguiu avaliar o que falamos.',
    )
  },
)
