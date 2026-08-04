import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COMPANION_DIAGNOSTIC_CONTRACT_VERSION,
  CompanionDiagnosticContractError,
  normalizeCompanionDiagnostic,
} from './diagnostic-contract.ts'

const CONTEXT = {
  available_message_ids: [
    'message-001',
    'message-002',
    'message-003',
  ],
  current_crm_status: 'respondeu',
  reference_time:
    '2026-08-04T20:00:00.000Z',
}

function buildDiagnostic(overrides = {}) {
  return {
    contract_version:
      COMPANION_DIAGNOSTIC_CONTRACT_VERSION,

    analysis_status: 'complete',
    analysis_limitations: [],

    commercial_relevance: 'commercial',
    confidence: 'high',

    customer_intent: {
      summary:
        'O cliente quer entender qual plano atende seu objetivo.',
      evidence_message_ids: [
        'message-001',
      ],
    },

    needs: [
      {
        summary:
          'Treinar três vezes por semana.',
        evidence_message_ids: [
          'message-001',
        ],
      },
    ],

    missing_information: [
      {
        summary:
          'Confirmar a disponibilidade de horário.',
        reason:
          'A rotina ainda não foi detalhada.',
      },
    ],

    unanswered_questions: [],

    active_objections: [],

    seller_assessment: {
      strengths: [
        {
          summary:
            'O vendedor conectou a necessidade ao produto.',
          evidence_message_ids: [
            'message-002',
          ],
        },
      ],
      risks: [],
    },

    sales_method: {
      configured: true,
      current_step: 'Diagnóstico',
      completed_steps: [
        'Acolhimento',
      ],
      skipped_steps: [],
      evidence_message_ids: [
        'message-001',
        'message-002',
      ],
    },

    solution_fit: {
      status: 'fit',
      rationale:
        'O produto atende a frequência informada pelo cliente.',
      evidence_message_ids: [
        'message-001',
        'message-002',
      ],
    },

    guidance: {
      intervention_required: true,
      next_move:
        'Confirmar disponibilidade e avançar para proposta.',
      recommended_question:
        'Quais dias e horários funcionam melhor para você?',
      suggested_message:
        'Para te indicar a melhor opção, quais dias e horários funcionam melhor?',
    },

    crm_suggestion: {
      should_change_crm_stage: true,
      recommended_status: 'negociacao',
      next_action_required: false,
      expected_next_action_at: null,
      prohibited_statuses: [
        'ganho',
        'perdido',
      ],
      requires_human_confirmation: true,
    },

    evidence_message_ids: [
      'message-001',
      'message-002',
    ],

    ...overrides,
  }
}

function assertContractError(
  callback,
  expectedCode,
) {
  assert.throws(
    callback,
    (error) => {
      assert.ok(
        error instanceof
          CompanionDiagnosticContractError,
      )

      assert.equal(
        error.code,
        expectedCode,
      )

      return true
    },
  )
}

test(
  'normaliza um diagnóstico completo do contrato phase-1-v1',
  () => {
    const result =
      normalizeCompanionDiagnostic(
        buildDiagnostic(),
        CONTEXT,
      )

    assert.equal(
      result.contract_version,
      'phase-1-v1',
    )

    assert.equal(
      result.analysis_status,
      'complete',
    )

    assert.equal(
      result.crm_suggestion
        .recommended_status,
      'negociacao',
    )

    assert.equal(
      result.crm_suggestion
        .requires_human_confirmation,
      true,
    )
  },
)

test(
  'rejeita evidência que não pertence à fotografia atual',
  () => {
    assertContractError(
      () =>
        normalizeCompanionDiagnostic(
          buildDiagnostic({
            customer_intent: {
              summary:
                'Conclusão sem evidência válida.',
              evidence_message_ids: [
                'message-inexistente',
              ],
            },
          }),
          CONTEXT,
        ),
      'INVALID_EVIDENCE',
    )
  },
)

test(
  'análise limitada precisa declarar limitações e não pode ter confiança alta',
  () => {
    assertContractError(
      () =>
        normalizeCompanionDiagnostic(
          buildDiagnostic({
            analysis_status: 'limited',
            analysis_limitations: [
              'conversation_context_insufficient',
            ],
            confidence: 'high',
          }),
          CONTEXT,
        ),
      'INVARIANT_VIOLATION',
    )
  },
)

test(
  'método ausente não inventa etapas e adequação fica desconhecida sem produto',
  () => {
    const result =
      normalizeCompanionDiagnostic(
        buildDiagnostic({
          analysis_status: 'limited',

          analysis_limitations: [
            'method_not_configured',
            'product_information_missing',
          ],

          confidence: 'medium',

          sales_method: {
            configured: false,
            current_step: null,
            completed_steps: [],
            skipped_steps: [],
            evidence_message_ids: [],
          },

          solution_fit: {
            status: 'unknown',
            rationale: null,
            evidence_message_ids: [],
          },

          crm_suggestion: {
            should_change_crm_stage: false,
            recommended_status: 'respondeu',
            next_action_required: false,
            expected_next_action_at: null,
            prohibited_statuses: [
              'ganho',
              'perdido',
            ],
            requires_human_confirmation: true,
          },
        }),
        CONTEXT,
      )

    assert.equal(
      result.sales_method.configured,
      false,
    )

    assert.equal(
      result.solution_fit.status,
      'unknown',
    )
  },
)

test(
  'conversa não comercial não gera intervenção nem alteração de CRM',
  () => {
    assertContractError(
      () =>
        normalizeCompanionDiagnostic(
          buildDiagnostic({
            commercial_relevance:
              'non_commercial',
          }),
          CONTEXT,
        ),
      'INVARIANT_VIOLATION',
    )
  },
)

test(
  'análise bloqueada não inventa orientação ou mensagem',
  () => {
    assertContractError(
      () =>
        normalizeCompanionDiagnostic(
          buildDiagnostic({
            analysis_status: 'blocked',

            analysis_limitations: [
              'audio_without_transcription',
            ],

            confidence: 'low',
            customer_intent: null,
            needs: [],

            seller_assessment: {
              strengths: [],
              risks: [],
            },

            solution_fit: {
              status: 'unknown',
              rationale: null,
              evidence_message_ids: [],
            },

            guidance: {
              intervention_required: false,
              next_move: null,
              recommended_question: null,
              suggested_message:
                'Mensagem inventada.',
            },

            crm_suggestion: {
              should_change_crm_stage: false,
              recommended_status: null,
              next_action_required: false,
              expected_next_action_at: null,
              prohibited_statuses: [],
              requires_human_confirmation: true,
            },
          }),
          CONTEXT,
        ),
      'INVARIANT_VIOLATION',
    )
  },
)

test(
  'rejeita próxima ação com data inválida como erro contratual',
  () => {
    assert.throws(
      () =>
        normalizeCompanionDiagnostic(
          buildDiagnostic({
            crm_suggestion: {
              should_change_crm_stage:
                false,

              recommended_status:
                'respondeu',

              next_action_required:
                true,

              expected_next_action_at:
                'data-inválida',

              prohibited_statuses: [
                'ganho',
              ],

              requires_human_confirmation:
                true,
            },
          }),
          CONTEXT,
        ),
      (error) => {
        assert.ok(
          error instanceof
            CompanionDiagnosticContractError,
        )

        assert.equal(
          error.code,
          'INVALID_REFERENCE_TIME',
        )

        assert.equal(
          error.path,
          'crm_suggestion.expected_next_action_at',
        )

        return true
      },
    )
  },
)

test(
  'próxima ação com data precisa estar no futuro',
  () => {
    assertContractError(
      () =>
        normalizeCompanionDiagnostic(
          buildDiagnostic({
            crm_suggestion: {
              should_change_crm_stage: false,
              recommended_status:
                'respondeu',
              next_action_required: true,
              expected_next_action_at:
                '2026-08-04T19:00:00.000Z',
              prohibited_statuses: [
                'ganho',
              ],
              requires_human_confirmation:
                true,
            },
          }),
          CONTEXT,
        ),
      'INVARIANT_VIOLATION',
    )
  },
)

test(
  'toda sugestão de CRM exige confirmação humana',
  () => {
    assertContractError(
      () =>
        normalizeCompanionDiagnostic(
          buildDiagnostic({
            crm_suggestion: {
              should_change_crm_stage: true,
              recommended_status:
                'negociacao',
              next_action_required: false,
              expected_next_action_at: null,
              prohibited_statuses: [],
              requires_human_confirmation:
                false,
            },
          }),
          CONTEXT,
        ),
      'INVARIANT_VIOLATION',
    )
  },
)

test(
  'mudança de CRM precisa recomendar etapa diferente da atual',
  () => {
    assertContractError(
      () =>
        normalizeCompanionDiagnostic(
          buildDiagnostic({
            crm_suggestion: {
              should_change_crm_stage: true,
              recommended_status:
                'respondeu',
              next_action_required: false,
              expected_next_action_at: null,
              prohibited_statuses: [],
              requires_human_confirmation:
                true,
            },
          }),
          CONTEXT,
        ),
      'INVARIANT_VIOLATION',
    )
  },
)
