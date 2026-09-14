import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COMMERCIAL_REASONING_CORE_V2_DECISIONS,
} from './commercial-reasoning-core-v2-contract.ts'

import {
  COMMERCIAL_REASONING_CORE_V2_TO_COMMERCIAL_READING_DECISION,
  buildCommercialReasoningCoreV2SellerProjection,
  isCommercialReasoningCoreV2SellerActionable,
  mapCommercialReasoningCoreV2Decision,
} from './commercial-reasoning-core-v2-seller-adapter.ts'

function buildOutput({
  role = 'buyer',
  relevance = 'commercial',
  action = 'schedule',
  interventionNeeded = true,
  recommendedQuestion = null,
  suggestedMessage =
    'Vou verificar a disponibilidade e retorno com a confirmação.',
} = {}) {
  return {
    contract_version:
      'commercial-reasoning-core-v2',

    status:
      'ready',

    commercial_role:
      role,

    commercial_relevance:
      relevance,

    situation: {
      summary:
        'O cliente já definiu o próximo passo comercial.',
      customer_intent:
        'Avançar no processo.',
      commercial_stage:
        'decisao',
      confidence:
        'high',
      evidence_message_ids: [
        'm1',
      ],
    },

    responsibility: {
      waiting_on:
        'seller',
      summary:
        'O vendedor precisa agir.',
      evidence_message_ids: [
        'm1',
      ],
    },

    decision: {
      action,
      objective:
        'Executar o próximo passo sem reiniciar descoberta.',
      reason:
        'A intenção já está suficientemente clara.',
      evidence_message_ids: [
        'm1',
        'm2',
      ],
    },

    coaching: {
      strengths: [],
      improvement_points: [],
    },

    method: {
      configured:
        false,
      name:
        null,
      current_stage:
        null,
      adherence:
        'not_configured',
      deviation:
        null,
      recovery_move:
        null,
      evidence_message_ids:
        [],
    },

    technique: {
      name:
        null,
      why_applicable:
        null,
      do_not_do:
        [],
    },

    communication: {
      intervention_needed:
        interventionNeeded,
      recommended_question:
        recommendedQuestion,
      suggested_message:
        suggestedMessage,
    },

    factuality: {
      facts_used: [],
      unknowns: [],
    },

    evidence_message_ids: [
      'm1',
      'm2',
      'm1',
    ],
  }
}

test(
  'adapter possui mapeamento exaustivo para todas as decisões do Core V2',
  () => {
    assert.deepEqual(
      Object
        .keys(
          COMMERCIAL_REASONING_CORE_V2_TO_COMMERCIAL_READING_DECISION,
        )
        .sort(),
      [
        ...COMMERCIAL_REASONING_CORE_V2_DECISIONS,
      ].sort(),
    )

    assert.equal(
      mapCommercialReasoningCoreV2Decision(
        'answer_question',
      ),
      'respond',
    )

    assert.equal(
      mapCommercialReasoningCoreV2Decision(
        'discover',
      ),
      'deepen_discovery',
    )

    assert.equal(
      mapCommercialReasoningCoreV2Decision(
        'schedule',
      ),
      'set_commitment',
    )

    assert.equal(
      mapCommercialReasoningCoreV2Decision(
        'recover_context',
      ),
      'respond',
    )
  },
)

test(
  'buyer commercial preserva intervenção e mensagem seller-facing',
  () => {
    const output =
      buildOutput({
        action:
          'schedule',

        recommendedQuestion:
          'Qual data funciona melhor?',
      })

    assert.equal(
      isCommercialReasoningCoreV2SellerActionable(
        output,
      ),
      true,
    )

    const projection =
      buildCommercialReasoningCoreV2SellerProjection(
        output,
      )

    assert.equal(
      projection
        .seller_actionable,
      true,
    )

    assert.equal(
      projection.decision,
      'set_commitment',
    )

    assert.equal(
      projection
        .intervention_needed,
      true,
    )

    assert.equal(
      projection
        .recommended_question,
      'Qual data funciona melhor?',
    )

    assert.equal(
      projection
        .suggested_message,
      'Vou verificar a disponibilidade e retorno com a confirmação.',
    )

    assert.deepEqual(
      projection
        .evidence_message_ids,
      [
        'm1',
        'm2',
      ],
    )
  },
)

test(
  'buyer commercial pode recomendar espera sem gerar comunicação',
  () => {
    const projection =
      buildCommercialReasoningCoreV2SellerProjection(
        buildOutput({
          action:
            'wait',

          interventionNeeded:
            false,

          recommendedQuestion:
            'Posso insistir agora?',

          suggestedMessage:
            'Mensagem que não pode aparecer.',
        }),
      )

    assert.equal(
      projection
        .seller_actionable,
      true,
    )

    assert.equal(
      projection.decision,
      'wait',
    )

    assert.equal(
      projection
        .intervention_needed,
      false,
    )

    assert.equal(
      projection
        .recommended_question,
      null,
    )

    assert.equal(
      projection
        .suggested_message,
      null,
    )
  },
)

test(
  'provider commercial nunca vira ação seller-facing',
  () => {
    const output =
      buildOutput({
        role:
          'provider',

        relevance:
          'commercial',

        action:
          'present_solution',

        interventionNeeded:
          true,

        recommendedQuestion:
          'Quer conhecer nosso plano?',

        suggestedMessage:
          'Posso te vender nosso plano.',
      })

    assert.equal(
      isCommercialReasoningCoreV2SellerActionable(
        output,
      ),
      false,
    )

    const projection =
      buildCommercialReasoningCoreV2SellerProjection(
        output,
      )

    assert.equal(
      projection
        .commercial_role,
      'provider',
    )

    assert.equal(
      projection
        .commercial_relevance,
      'commercial',
    )

    assert.equal(
      projection.decision,
      'no_intervention',
    )

    assert.equal(
      projection
        .intervention_needed,
      false,
    )

    assert.equal(
      projection
        .recommended_question,
      null,
    )

    assert.equal(
      projection
        .suggested_message,
      null,
    )
  },
)

test(
  'buyer non commercial nunca vira ação seller-facing',
  () => {
    const projection =
      buildCommercialReasoningCoreV2SellerProjection(
        buildOutput({
          role:
            'buyer',

          relevance:
            'non_commercial',

          action:
            'answer_question',

          interventionNeeded:
            true,

          suggestedMessage:
            'Mensagem indevida.',
        }),
      )

    assert.equal(
      projection
        .seller_actionable,
      false,
    )

    assert.equal(
      projection.decision,
      'no_intervention',
    )

    assert.equal(
      projection
        .intervention_needed,
      false,
    )

    assert.equal(
      projection
        .suggested_message,
      null,
    )
  },
)

test(
  'recover_context vira resposta seller-facing sem criar uma decisão nova',
  () => {
    const projection =
      buildCommercialReasoningCoreV2SellerProjection(
        buildOutput({
          action:
            'recover_context',

          interventionNeeded:
            true,

          suggestedMessage:
            'Vou retomar exatamente do ponto que ficou pendente.',
        }),
      )

    assert.equal(
      projection.decision,
      'respond',
    )

    assert.equal(
      projection
        .recommended_next_approach,
      'Executar o próximo passo sem reiniciar descoberta.',
    )

    assert.equal(
      projection
        .suggested_message,
      'Vou retomar exatamente do ponto que ficou pendente.',
    )
  },
)
