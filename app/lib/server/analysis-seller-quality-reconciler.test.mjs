import assert from 'node:assert/strict'
import test from 'node:test'

import {
  reconcileAnalysisSellerQuality,
} from './analysis-seller-quality-reconciler.ts'

function buildViewModel(
  strengths,
) {
  return {
    available: true,
    unavailable_reason: null,
    neutral: false,
    neutral_headline: null,
    neutral_description: null,
    opportunity: null,
    current_moment: {
      is_active_session: true,
    },
    risks: [],
    objections_open: [],
    commitments: [],
    seller_conduct: {
      method: {
        configured: false,
        name: null,
        stages: [],
        current_stage: null,
        adherence: null,
        recovery_guidance: null,
      },
      stage_divergence: false,
    },
    strengths,
    improvements: [],
    continuity: {
      cycle_conversation_count: 1,
      cross_conversation_signals: [],
    },
    history: [],
    provenance: {
      reference_time: '2026-09-11T23:14:04.728Z',
      state_record_id: 'state-1',
      state_version: 8,
      state_updated_at: '2026-09-11T23:14:04.728Z',
    },
  }
}

test(
  'remove elogio do vendedor sustentado apenas por mensagens incoming',
  () => {
    const vm =
      reconcileAnalysisSellerQuality({
        viewModel:
          buildViewModel([
            {
              kind: 'good_discovery',
              summary:
                'Reconheceu o interesse por Pilates.',
              why_it_matters: null,
              impact: null,
              how_to_improve: null,
              evidence_message_ids: [
                '2520',
                '2522',
              ],
              memory_ids: [],
            },
          ]),
        canonicalMessages: [
          {
            id: 2520,
            direction: 'incoming',
          },
          {
            id: 2522,
            direction: 'incoming',
          },
        ],
        openLoops: [],
      })

    assert.deepEqual(
      vm.strengths,
      [],
    )
  },
)

test(
  'retomada genérica após pergunta ainda aberta não vira respected_space',
  () => {
    const vm =
      reconcileAnalysisSellerQuality({
        viewModel:
          buildViewModel([
            {
              kind: 'respected_space',
              summary:
                'Retomou contato respeitando o tempo do cliente.',
              why_it_matters: null,
              impact: null,
              how_to_improve: null,
              evidence_message_ids: [
                '2526',
              ],
              memory_ids: [],
            },
          ]),
        canonicalMessages: [
          {
            id: 2522,
            direction: 'incoming',
          },
          {
            id: 2526,
            direction: 'outgoing',
          },
        ],
        openLoops: [
          {
            kind: 'client.open_question',
            memory_status: 'active',
            evidence_message_ids: [
              '2522',
            ],
          },
        ],
      })

    assert.deepEqual(
      vm.strengths,
      [],
    )
  },
)

test(
  'preserva acerto realmente sustentado por mensagem outgoing',
  () => {
    const strength = {
      kind: 'answered_question',
      summary:
        'Respondeu objetivamente à pergunta do cliente.',
      why_it_matters: null,
      impact: null,
      how_to_improve: null,
      evidence_message_ids: [
        '2516',
      ],
      memory_ids: [],
    }

    const vm =
      reconcileAnalysisSellerQuality({
        viewModel:
          buildViewModel([
            strength,
          ]),
        canonicalMessages: [
          {
            id: 2515,
            direction: 'incoming',
          },
          {
            id: 2516,
            direction: 'outgoing',
          },
        ],
        openLoops: [],
      })

    assert.deepEqual(
      vm.strengths,
      [strength],
    )
  },
)
