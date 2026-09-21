import assert from 'node:assert/strict'
import test from 'node:test'

import {
  reconcileDecisionStateWithCommercialResponsibility,
  reconcileReasoningWithCommercialResponsibility,
} from '../server/canonical-commercial-responsibility.ts'

const REFERENCE_TIME =
  '2026-09-13T15:40:00.000Z'

function clientContextSellerWroteLast() {
  return {
    waiting: {
      state: 'seller_waiting_for_customer',
      waiting_since:
        '2026-09-13T15:39:00.000Z',
      waiting_duration_ms: 60_000,
    },
    relationship: {
      last_interaction_at:
        '2026-09-13T15:39:00.000Z',
    },
  }
}

function currentReadingWithPendingRequest({
  openQuestion = true,
  improvementKind = null,
} = {}) {
  return {
    reading: {
      customer: {
        open_questions: openQuestion
          ? [
              {
                summary:
                  'Cliente fez um pedido operacional específico que ainda precisa ser concluído.',
                evidence_message_ids: [
                  'customer-request',
                ],
                memory_ids: [],
              },
            ]
          : [],
      },
      improvement_points:
        improvementKind
          ? [
              {
                kind: improvementKind,
                summary:
                  'O pedido do cliente permaneceu sem conclusão.',
                evidence_message_ids: [
                  'customer-request',
                ],
                memory_ids: [],
              },
            ]
          : [],
    },
  }
}

function actionableDecisionState() {
  return {
    reference_time: REFERENCE_TIME,
    primary_decision: {
      kind: 'set_commitment',
      source: 'seller_coaching',
      priority: 'high',
      silent: false,
      summary:
        'Concluir a solicitação pendente.',
      reason:
        'O cliente já forneceu os dados necessários e aguarda execução.',
      recommended_action:
        'Executar ou confirmar a próxima etapa solicitada.',
      evidence_message_ids: [
        'customer-request',
      ],
      memory_ids: [],
    },
    interventions: [],
    provenance: {
      agora_updated_at: null,
    },
  }
}

function actionableReasoning() {
  return {
    contract_version:
      'commercial-reasoning-v1',
    status: 'ready',
    decision: 'set_commitment',
    decision_reason:
      'Existe um pedido operacional ainda não concluído.',
    current_situation:
      'O vendedor escreveu por último, mas o pedido anterior do cliente continua aberto.',
    objective_now:
      'Concluir a próxima etapa solicitada pelo cliente.',
    do_not_do: [
      'Não reiniciar uma descoberta já concluída.',
    ],
    selected_techniques: [],
    company_knowledge_used: [],
    seller_assessment: {
      strengths: [],
      improvement_points: [],
    },
    comparison: {
      similarities: [],
      differences: [],
    },
    evidence_message_ids: [
      'customer-request',
    ],
    memory_ids: [],
    limitations: [],
  }
}

test(
  'última mensagem outgoing não transfere responsabilidade ao cliente quando há pergunta/pedido canônico ainda aberto',
  () => {
    const decisionState =
      actionableDecisionState()

    const reconciled =
      reconcileDecisionStateWithCommercialResponsibility({
        decisionState,
        clientContext:
          clientContextSellerWroteLast(),
        currentReading:
          currentReadingWithPendingRequest(),
      })

    assert.equal(
      reconciled,
      decisionState,
      'a camada operacional não pode apagar uma pendência semanticamente comprovada',
    )
    assert.equal(
      reconciled.primary_decision.kind,
      'set_commitment',
    )
    assert.doesNotMatch(
      reconciled.primary_decision.recommended_action,
      /aguardar a resposta do cliente/i,
    )
  },
)

test(
  'omissão material mantém responsabilidade do vendedor mesmo se ele foi o último a escrever',
  () => {
    const decisionState =
      actionableDecisionState()

    const reconciled =
      reconcileDecisionStateWithCommercialResponsibility({
        decisionState,
        clientContext:
          clientContextSellerWroteLast(),
        currentReading:
          currentReadingWithPendingRequest({
            openQuestion: false,
            improvementKind:
              'missing_next_commitment',
          }),
      })

    assert.equal(
      reconciled.primary_decision.kind,
      'set_commitment',
    )
  },
)

test(
  'reasoning seller-facing não vira wait quando a Commercial Reading prova pedido pendente',
  () => {
    const reasoning =
      actionableReasoning()

    const reconciled =
      reconcileReasoningWithCommercialResponsibility({
        reasoning,
        clientContext:
          clientContextSellerWroteLast(),
        referenceTime: REFERENCE_TIME,
        currentReading:
          currentReadingWithPendingRequest({
            openQuestion: false,
            improvementKind:
              'unanswered_question',
          }),
      })

    assert.equal(
      reconciled,
      reasoning,
    )
    assert.equal(
      reconciled.decision,
      'set_commitment',
    )
    assert.match(
      reconciled.objective_now,
      /concluir/i,
    )
    assert.doesNotMatch(
      reconciled.objective_now,
      /aguardar a resposta do cliente/i,
    )
  },
)
