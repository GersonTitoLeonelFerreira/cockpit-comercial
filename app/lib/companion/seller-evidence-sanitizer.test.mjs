import assert from 'node:assert/strict'
import test from 'node:test'

import {
  sanitizeSellerAttributedEvidence,
} from './seller-evidence-sanitizer.ts'

function buildOutput() {
  return {
    intervention_needed: true,
    recommended_question: null,
    suggested_message: null,
    commercial_reading: {
      seller_strengths: [
        {
          kind: 'answered_question',
          summary: 'Elogio sustentado apenas pelo cliente.',
          why_it_matters: 'Não deve sobreviver.',
          evidence_message_ids: ['customer-1'],
          memory_ids: [],
        },
        {
          kind: 'clear_explanation',
          summary: 'Explicação comprovada pelo vendedor.',
          why_it_matters: 'Pode sobreviver.',
          evidence_message_ids: ['seller-1', 'customer-1'],
          memory_ids: [],
        },
      ],
      improvement_points: [
        {
          kind: 'repetition',
          summary: 'Crítica sem mensagem do vendedor.',
          why_it_matters: 'Não deve sobreviver.',
          impact: 'Risco de contexto.',
          how_to_improve: 'Retomar o pedido.',
          evidence_message_ids: ['customer-2'],
          memory_ids: [],
        },
        {
          kind: 'insufficient_discovery',
          summary: 'Apresentou solução cedo demais.',
          why_it_matters: 'Reduz aderência.',
          impact: 'Recomendação genérica.',
          how_to_improve: 'Entender necessidade antes.',
          evidence_message_ids: ['customer-1', 'seller-2'],
          memory_ids: [],
        },
      ],
      risks: {
        customer_objections: [
          {
            kind: 'duvida_cliente',
            severity: 'low',
            summary: 'Objeção do cliente continua válida.',
            evidence_message_ids: ['customer-2'],
            memory_ids: [],
          },
        ],
        service_risks: [
          {
            kind: 'perda_contexto',
            severity: 'high',
            summary: 'Risco atribuído ao vendedor sem evidência outgoing.',
            evidence_message_ids: ['customer-2'],
            memory_ids: [],
          },
          {
            kind: 'retomada_generica',
            severity: 'medium',
            summary: 'Risco comprovado por mensagem do vendedor.',
            evidence_message_ids: ['seller-3', 'customer-2'],
            memory_ids: [],
          },
        ],
      },
    },
  }
}

test(
  'remove somente itens seller-facing sem nenhuma evidência outgoing',
  () => {
    const original =
      buildOutput()

    const result =
      sanitizeSellerAttributedEvidence({
        value: original,
        seller_message_ids: [
          'seller-1',
          'seller-2',
          'seller-3',
        ],
      })

    assert.equal(
      result.removed_items,
      3,
    )

    assert.deepEqual(
      result.value
        .commercial_reading
        .seller_strengths
        .map(item => item.summary),
      [
        'Explicação comprovada pelo vendedor.',
      ],
    )

    assert.deepEqual(
      result.value
        .commercial_reading
        .improvement_points
        .map(item => item.summary),
      [
        'Apresentou solução cedo demais.',
      ],
    )

    assert.deepEqual(
      result.value
        .commercial_reading
        .risks
        .service_risks
        .map(item => item.summary),
      [
        'Risco comprovado por mensagem do vendedor.',
      ],
    )

    assert.equal(
      result.value
        .commercial_reading
        .risks
        .customer_objections
        .length,
      1,
    )

    assert.equal(
      original
        .commercial_reading
        .service_risks,
      undefined,
    )

    assert.equal(
      original
        .commercial_reading
        .seller_strengths
        .length,
      2,
      'o payload original não deve ser mutado',
    )
  },
)

test(
  'sem mensagens outgoing remove apenas itens seller-facing bem formados',
  () => {
    const output =
      buildOutput()

    output
      .commercial_reading
      .seller_strengths
      .push('shape-invalido')

    const result =
      sanitizeSellerAttributedEvidence({
        value: output,
        seller_message_ids: [],
      })

    assert.equal(
      result.removed_items,
      6,
    )

    assert.deepEqual(
      result.value
        .commercial_reading
        .seller_strengths,
      ['shape-invalido'],
      'shape inválido deve permanecer para o contrato rejeitar',
    )

    assert.equal(
      result.value
        .commercial_reading
        .risks
        .customer_objections
        .length,
      1,
    )
  },
)
