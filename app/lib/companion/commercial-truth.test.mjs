import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CommercialTruthGuardError,
  assessCommercialTruthFromUserPrompt,
  reconcileStatefulCommercialTruth,
} from './commercial-truth.ts'

function buildPrompt({
  currentMessages,
  bridgeMessages = [],
  currentCrmStatus = 'contato',
  products = [],
}) {
  return JSON.stringify({
    input: {
      diagnostic_input: {
        current_crm_status:
          currentCrmStatus,
        commercial_context: {
          products,
        },
        conversation: {
          messages:
            currentMessages,
          context_bridge_messages:
            bridgeMessages,
        },
      },
    },
  })
}

function incoming(text) {
  return {
    direction: 'incoming',
    text_content: text,
    audio_transcription: null,
  }
}

function outgoing(text) {
  return {
    direction: 'outgoing',
    text_content: text,
    audio_transcription: null,
  }
}

function buildOutput({
  relevance = 'commercial',
  role = 'buyer',
  currentCrm = false,
} = {}) {
  return {
    commercial_relevance:
      relevance,
    commercial_role:
      role,
    operational_suggestions: {
      crm: currentCrm
        ? {
            should_change_crm_stage: true,
            recommended_status: 'respondeu',
            rationale: 'Modelo sugeriu avanço.',
            requires_human_confirmation: true,
          }
        : {
            should_change_crm_stage: false,
            recommended_status: null,
            rationale: null,
            requires_human_confirmation: true,
          },
      agenda: {
        should_change_agenda: false,
        expected_next_action_at: null,
        rationale: null,
        requires_human_confirmation: true,
      },
    },
  }
}

test(
  'plano + preço + pagamento + objeção é relevância comercial forte e negociação',
  () => {
    const prompt =
      buildPrompt({
        currentMessages: [
          incoming(
            'Quero o plano anual. O valor é R$ 1.200, mas estou sem limite no cartão. Tem outra forma de pagamento?',
          ),
        ],
      })

    const truth =
      assessCommercialTruthFromUserPrompt(
        prompt,
      )

    assert.equal(
      truth.requires_commercial_relevance,
      true,
    )
    assert.equal(
      truth.requires_buyer_side_role,
      true,
    )
    assert.equal(
      truth.stage_floor,
      'negociacao',
    )
    assert.ok(
      truth.signal_categories.includes(
        'plan_offer',
      ),
    )
    assert.ok(
      truth.signal_categories.includes(
        'price',
      ),
    )
    assert.ok(
      truth.signal_categories.includes(
        'payment',
      ),
    )
    assert.ok(
      truth.signal_categories.includes(
        'objection',
      ),
    )
  },
)

test(
  'palavra preço isolada em conversa pessoal não vira venda',
  () => {
    const truth =
      assessCommercialTruthFromUserPrompt(
        buildPrompt({
          currentMessages: [
            incoming(
              'O preço do almoço aumentou muito hoje.',
            ),
          ],
        }),
      )

    assert.equal(
      truth.requires_commercial_relevance,
      false,
    )
    assert.equal(
      truth.stage_floor,
      null,
    )
  },
)

test(
  'resposta curta mantém continuidade quando a ponte imediatamente anterior é comercial forte',
  () => {
    const truth =
      assessCommercialTruthFromUserPrompt(
        buildPrompt({
          currentMessages: [
            incoming('Sim'),
          ],
          bridgeMessages: [
            outgoing(
              'O plano fica R$ 1.200. Posso te mandar o link de pagamento para concluir a matrícula?',
            ),
          ],
        }),
      )

    assert.equal(
      truth.requires_commercial_relevance,
      true,
    )
    assert.ok(
      truth.signal_categories.includes(
        'direct_commercial_continuity',
      ),
    )
  },
)

test(
  'indicação da irmã distingue oportunidade de terceiro',
  () => {
    const truth =
      assessCommercialTruthFromUserPrompt(
        buildPrompt({
          currentMessages: [
            incoming(
              'Minha irmã quer fazer o plano anual. Como faço para ela começar?',
            ),
          ],
        }),
      )

    assert.equal(
      truth.requires_commercial_relevance,
      true,
    )
    assert.equal(
      truth.third_party_prospect_detected,
      true,
    )
    assert.equal(
      truth.requires_buyer_side_role,
      true,
    )
  },
)

test(
  'guard rejeita falso negativo de commercial_relevance',
  () => {
    const prompt =
      buildPrompt({
        currentMessages: [
          incoming(
            'Quero fechar o plano e preciso do link de pagamento.',
          ),
        ],
      })

    assert.throws(
      () =>
        reconcileStatefulCommercialTruth({
          user_prompt:
            prompt,
          output:
            buildOutput({
              relevance:
                'non_commercial',
            }),
        }),
      (error) => {
        assert.ok(
          error instanceof
            CommercialTruthGuardError,
        )
        assert.equal(
          error.code,
          'COMMERCIAL_RELEVANCE_FALSE_NEGATIVE',
        )
        return true
      },
    )
  },
)

test(
  'guard rejeita provider quando a interação está do lado comprador da empresa',
  () => {
    const prompt =
      buildPrompt({
        currentMessages: [
          incoming(
            'Quero contratar e assinar o plano hoje.',
          ),
        ],
      })

    assert.throws(
      () =>
        reconcileStatefulCommercialTruth({
          user_prompt:
            prompt,
          output:
            buildOutput({
              role:
                'provider',
            }),
        }),
      (error) => {
        assert.equal(
          error.code,
          'BUYER_SIDE_ROLE_REQUIRED',
        )
        return true
      },
    )
  },
)

test(
  'estágio mínimo avançado corrige sugestão abaixo de negociação',
  () => {
    const prompt =
      buildPrompt({
        currentCrmStatus:
          'contato',
        currentMessages: [
          incoming(
            'Quero o plano. Já vi o valor e só preciso resolver o pagamento no cartão para fechar.',
          ),
        ],
      })

    const output =
      reconcileStatefulCommercialTruth({
        user_prompt:
          prompt,
        output:
          buildOutput(),
      })

    assert.equal(
      output
        .operational_suggestions
        .crm
        .should_change_crm_stage,
      true,
    )
    assert.equal(
      output
        .operational_suggestions
        .crm
        .recommended_status,
      'negociacao',
    )
  },
)
