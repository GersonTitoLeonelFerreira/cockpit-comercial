import assert from 'node:assert/strict'
import test from 'node:test'

import {
  reconcileCoachingWithResponsibility,
} from './analysis-view-model-loader.ts'

function viewModelWithImprovement(kind) {
  return {
    improvements: [
      {
        kind,
        summary:
          'Existe uma ação comercial ainda não concluída.',
        evidence_message_ids: [
          'customer-request',
        ],
        memory_ids: [],
      },
    ],
  }
}

test(
  'waiting operacional não apaga unanswered_question quando a leitura prova que o vendedor ainda deve ação',
  () => {
    const viewModel =
      viewModelWithImprovement(
        'unanswered_question',
      )

    const result =
      reconcileCoachingWithResponsibility({
        viewModel,
        waitingState:
          'seller_waiting_for_customer',
        sellerStillOwesAction: true,
      })

    assert.equal(result, viewModel)
    assert.equal(
      result.improvements.length,
      1,
    )
  },
)

test(
  'waiting operacional remove discovery já executada quando não existe pendência semântica do vendedor',
  () => {
    const result =
      reconcileCoachingWithResponsibility({
        viewModel:
          viewModelWithImprovement(
            'insufficient_discovery',
          ),
        waitingState:
          'seller_waiting_for_customer',
        sellerStillOwesAction: false,
      })

    assert.deepEqual(
      result.improvements,
      [],
    )
  },
)
