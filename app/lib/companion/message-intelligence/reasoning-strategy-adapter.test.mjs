import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyCommercialReasoningToMessageStrategy,
} from './reasoning-strategy-adapter.ts'

function strategy() {
  return {
    contract_version:
      'message-commercial-strategy-v1',
    situation: {
      situation: 'objection',
      confidence: 'high',
      evidence: [],
    },
    commercial_objective:
      'address_objection',
    response_mode: 'answer',
    commercial_move: {
      move: 'resolve_objection',
      default_move: 'resolve_objection',
      reason: 'Base strategy.',
      source: 'strategy_default',
      requested_move: null,
    },
    method_alignment: {
      status: 'aligned',
      method_name: 'Método Yolen',
      stage_key: 'negociacao',
      reason: 'Alinhado.',
      constraints: [],
      requested_move_outside_method: false,
    },
    governance: {
      status: 'allowed',
      constraints: [],
      requires_human_approval: false,
      reason: 'Permitido.',
    },
    technique_selection: {
      status: 'selected',
      technique_key: 'legacy-technique',
      commercial_move: 'resolve_objection',
      framework_reference: 'Yolen-native',
      why_applicable: 'Legacy.',
      constraints: [],
    },
    limitations: [],
  }
}

function reasoning(overrides = {}) {
  return {
    contract_version:
      'commercial-reasoning-v1',
    status: 'ready',
    decision: 'handle_objection',
    decision_reason:
      'Existe intenção de compra, mas a objeção precisa ser diagnosticada.',
    current_situation:
      'Cliente quer fechar e está sem limite no cartão.',
    objective_now:
      'Entender a trava antes de oferecer alternativa.',
    do_not_do: [
      'Não inventar condição de pagamento.',
    ],
    selected_techniques: [
      {
        intelligence_id:
          'technique.objection_diagnosis',
        title: 'Diagnóstico de objeção',
        kind: 'technique',
        scope: 'general',
        why_applicable:
          'Há uma trava concreta depois de intenção de compra.',
        risks: [
          'Não presumir que o cartão é o único bloqueio.',
        ],
      },
    ],
    company_knowledge_used: [],
    seller_assessment: {
      strengths: [],
      improvement_points: [],
    },
    comparison: {
      similarities: [],
      differences: [],
    },
    evidence_message_ids: ['m1'],
    memory_ids: [],
    limitations: [],
    ...overrides,
  }
}

test(
  'MENSAGEM usa técnica e movimento do Commercial Reasoning para objeção',
  () => {
    const result =
      applyCommercialReasoningToMessageStrategy({
        strategy: strategy(),
        reasoning: reasoning(),
      })

    assert.equal(
      result.commercial_move.move,
      'isolate_objection',
    )
    assert.equal(
      result.technique_selection.technique_key,
      'technique.objection_diagnosis',
    )
    assert.match(
      result.technique_selection.why_applicable,
      /trava concreta/,
    )
    assert.ok(
      result.technique_selection.constraints.includes(
        'Não inventar condição de pagamento.',
      ),
    )
  },
)

test(
  'reasoning de espera impede MENSAGEM de inventar novo avanço',
  () => {
    const result =
      applyCommercialReasoningToMessageStrategy({
        strategy: strategy(),
        reasoning:
          reasoning({
            decision: 'wait',
            decision_reason:
              'O cliente assumiu a próxima ação.',
            selected_techniques: [
              {
                intelligence_id:
                  'technique.commitment_wait',
                title: 'Espera disciplinada',
                kind: 'technique',
                scope: 'general',
                why_applicable:
                  'Há compromisso ativo do cliente.',
                risks: [],
              },
            ],
          }),
      })

    assert.equal(
      result.commercial_move.move,
      'respect_customer_timing',
    )
    assert.equal(result.response_mode, 'wait')
  },
)

test(
  'reasoning silencioso fecha o movimento comercial da MENSAGEM',
  () => {
    const result =
      applyCommercialReasoningToMessageStrategy({
        strategy: strategy(),
        reasoning:
          reasoning({
            status: 'silent',
            decision: 'no_intervention',
            selected_techniques: [],
          }),
      })

    assert.equal(
      result.commercial_move.move,
      'no_commercial_move',
    )
    assert.equal(
      result.commercial_objective,
      'no_commercial_action',
    )
    assert.equal(
      result.technique_selection.status,
      'not_applicable',
    )
  },
)

test(
  'sem reasoning o pipeline legado não é alterado',
  () => {
    const base = strategy()
    const result =
      applyCommercialReasoningToMessageStrategy({
        strategy: base,
        reasoning: null,
      })

    assert.equal(result, base)
  },
)
