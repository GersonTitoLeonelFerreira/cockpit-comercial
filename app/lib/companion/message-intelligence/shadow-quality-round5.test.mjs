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
  evaluateCommercialStrategyV1,
} from './commercial-strategy.ts'

import {
  runMessageIntelligenceFromSnapshotV1,
} from './message-intelligence-runner.ts'

import {
  generateMessageCandidatesV1,
} from './candidate-generator.ts'

import {
  runHardGatesV1,
} from './hard-gates.ts'

import {
  critiqueMessageCandidatesV1,
} from './commercial-naturalness-critic.ts'

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

function buildSnapshot({
  sellerIntent,
  incomingText,
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
      .filter(
        message =>
          message.direction ===
            'incoming',
      )
      .at(-1)

  assert.ok(incoming)
  incoming.text_content =
    incomingText
  incoming.audio_transcription =
    null

  const currentIncoming =
    snapshot.conversation
      .current_interaction
      ?.messages
      .filter(
        message =>
          message.direction ===
            'incoming',
      )
      .at(-1)

  assert.ok(currentIncoming)
  currentIncoming.text_content =
    incomingText
  currentIncoming.audio_transcription =
    null

  return snapshot
}

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

test(
  'round5: uncertainty histórica não sequestra turno operacional atual',
  () => {
    const snapshot =
      buildSnapshot({
        sellerIntent:
          'Quero responder ao ponto principal desta conversa.',
        incomingText:
          'Oii pede pra Bela dar uma olhadinha no insta, tem algumas mensagens sem responder',
      })

    snapshot.customer.uncertainties = [
      memory({
        collection:
          'uncertainties',
        kind:
          'decision_uncertainty',
        summary:
          'Cliente tinha uma dúvida comercial em momento anterior.',
        id:
          'old-uncertainty',
      }),
    ]

    const strategy =
      evaluateCommercialStrategyV1({
        snapshot,
      })

    assert.equal(
      strategy.situation.situation,
      'insufficient_context',
    )
    assert.notEqual(
      strategy.situation.situation,
      'uncertainty',
    )

    const run =
      runMessageIntelligenceFromSnapshotV1(
        snapshot,
      )

    assert.notEqual(
      run.final_message_result
        .final_message?.text,
      'Entendi. Para facilitar a decisão, faz sentido ficar apenas no que está confirmado e evitar qualquer suposição. O que ainda está deixando você em dúvida?',
    )
    assert.equal(
      run.final_message_result.status,
      'no_eligible_candidates',
    )
  },
)

test(
  'round5: seller pode reabrir explicitamente uncertainty histórica',
  () => {
    const snapshot =
      buildSnapshot({
        sellerIntent:
          'Quero retomar a dúvida e entender o que ainda está deixando o cliente inseguro.',
        incomingText:
          'Sobre o outro assunto, já resolvi.',
      })

    snapshot.customer.uncertainties = [
      memory({
        collection:
          'uncertainties',
        kind:
          'decision_uncertainty',
        summary:
          'Cliente ainda tinha uma dúvida comercial registrada.',
        id:
          'active-uncertainty',
      }),
    ]

    const strategy =
      evaluateCommercialStrategyV1({
        snapshot,
      })

    assert.equal(
      strategy.situation.situation,
      'uncertainty',
    )
  },
)

test(
  'round5: critic força weak quando uncertainty vem só de memória sem reabertura explícita',
  () => {
    const snapshot =
      buildSnapshot({
        sellerIntent:
          'Quero retomar a dúvida e entender o que ainda está deixando o cliente inseguro.',
        incomingText:
          'Sobre o outro assunto, já resolvi.',
      })

    snapshot.customer.uncertainties = [
      memory({
        collection:
          'uncertainties',
        kind:
          'decision_uncertainty',
        summary:
          'Cliente ainda tinha uma dúvida comercial registrada.',
        id:
          'active-uncertainty',
      }),
    ]

    const run =
      runMessageIntelligenceFromSnapshotV1(
        snapshot,
      )

    const guardedPlan = {
      ...run.plan,
      seller_intent: {
        ...run.plan.seller_intent,
        value:
          'Quero responder ao ponto principal desta conversa.',
      },
    }

    const generation =
      generateMessageCandidatesV1({
        message_plan:
          guardedPlan,
      })

    const hardGate =
      runHardGatesV1({
        message_plan:
          guardedPlan,
        generation_result:
          generation,
      })

    const critic =
      critiqueMessageCandidatesV1({
        message_plan:
          guardedPlan,
        generation_result:
          generation,
        hard_gate_result:
          hardGate,
      })

    assert.equal(
      critic.status,
      'evaluated',
    )
    assert.ok(
      critic.critiques.length > 0,
    )
    assert.ok(
      critic.critiques.every(
        critique =>
          critique.status ===
            'weak',
      ),
    )
    assert.ok(
      critic.critiques.every(
        critique =>
          critique.overall_score <=
            55,
      ),
    )
    assert.ok(
      critic.critiques.every(
        critique =>
          critique.issues.some(
            issue =>
              issue.code ===
                'SELLER_INTENT_MISMATCH' &&
              issue.severity ===
                'major',
          ),
      ),
    )
  },
)

test(
  'round5: confirmar agendamento explicitamente vira confirm_commitment mesmo após assunto paralelo',
  () => {
    const snapshot =
      buildSnapshot({
        sellerIntent:
          'Confirmar agendamento da demonstração para amanhã às 17h',
        incomingText:
          'Será que esse adaptador serve?',
      })

    snapshot.customer.commitments = [
      memory({
        collection:
          'commitments',
        kind:
          'appointment',
        summary:
          'Demonstração combinada para amanhã às 17h.',
        id:
          'demo-appointment',
      }),
    ]

    const run =
      runMessageIntelligenceFromSnapshotV1(
        snapshot,
      )

    assert.equal(
      run.strategy.commercial_move.move,
      'confirm_commitment',
    )
    assert.equal(
      run.final_message_result.status,
      'selected',
    )
    assert.ok([
      'Combinado.',
      'Confirmado.',
    ].includes(
      run.final_message_result
        .final_message?.text,
    ))
  },
)

test(
  'round5: apoio administrativo é reconhecido como família de suporte',
  () => {
    const run =
      runMessageIntelligenceFromSnapshotV1(
        buildSnapshot({
          sellerIntent:
            'Oferecer apoio para auxiliar nas pendências administrativas',
          incomingText:
            'O que precisar é só me chamar',
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
      'Se precisar de ajuda com as pendências, pode me chamar.',
    )
  },
)

test(
  'round5: ajuda para futuras dúvidas ou necessidades gera disponibilidade útil',
  () => {
    const run =
      runMessageIntelligenceFromSnapshotV1(
        buildSnapshot({
          sellerIntent:
            'Oferecer ajuda para futuras dúvidas ou necessidades',
          incomingText:
            'Eu quem agradeço.',
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
      'Se precisar de alguma coisa ou tiver alguma dúvida, pode me chamar.',
    )
  },
)
