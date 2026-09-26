// FASE 10 — LIVE-03 (produção, Firefox real): depois de transcrever o único
// áudio visível, "Analisar agora" nunca concluía. O ledger do ciclo tinha
// DOIS áudios do cliente na sessão atual; o mais antigo estava fora da
// janela visível do Companion e nunca foi transcrito. O plano entregava ao
// modelo esse áudio como mensagem citável; o modelo o citava; o normalizador
// reprovava a saída (INVALID_MODEL_OUTPUT / AUDIO_EVIDENCE_NOT_TRANSCRIBED)
// e o worker reenfileirava 5 vezes (~14 min) até `failed`.

import assert from 'node:assert/strict'
import test from 'node:test'

import { COMPANION_DIAGNOSTIC_CONTRACT_VERSION } from './diagnostic-contract.ts'
import { COMPANION_DIAGNOSTIC_INPUT_VERSION } from './diagnostic-input.ts'
import { buildStatefulCopilotInput } from './stateful-copilot-input.ts'
import { buildStatefulCopilotExecutionPlan } from './stateful-copilot-execution-plan.ts'
import {
  resolveStatefulCopilotBackgroundFailureOutcome,
  shouldRetryStatefulCopilotBackgroundFailure,
} from '../server/stateful-copilot-background-job.ts'

function message(id, sequence, minute, overrides = {}) {
  return {
    id,
    message_key: `message-${id}`,
    version: 1,
    sequence,
    direction: 'incoming',
    author_kind: 'customer',
    occurred_at: `2026-09-26T09:${minute}:00-03:00`,
    observed_at: `2026-09-26T09:${minute}:01-03:00`,
    content_type: 'text',
    text_content: null,
    audio_transcription: null,
    ...overrides,
  }
}

function buildLiveInput() {
  const messages = [
    message('t1', 1, '46', { text_content: 'Oi, tudo bem? Queria entender o plano.' }),
    // Áudio fora da janela visível: nunca transcrito.
    message('a1', 2, '49', { content_type: 'audio' }),
    // Áudio visível: transcrito pelo vendedor antes da análise.
    message('a2', 3, '50', { content_type: 'audio', audio_transcription: 'Preciso saber o valor do plano anual e se tem desconto.' }),
    message('t2', 4, '52', { text_content: 'Pode me mandar a proposta?' }),
  ]

  return buildStatefulCopilotInput({
    diagnostic_input: {
      input_version: COMPANION_DIAGNOSTIC_INPUT_VERSION,
      diagnostic_contract_version: COMPANION_DIAGNOSTIC_CONTRACT_VERSION,
      company_id: 'company-1',
      cycle_id: 'cycle-1',
      conversation_key: 'conversation-1',
      current_crm_status: 'contato',
      reference_time: '2026-09-26T10:00:00-03:00',
      analysis_precondition: { status: 'ready', limitations: [] },
      conversation: {
        active_message_ids: messages.map((item) => item.id),
        excluded_message_ids: [],
        messages,
        excluded_messages: [],
      },
commercial_context: {
        configured:
          true,

        config_version_id:
          'config-version-1',

        config_version_number:
          1,

        config_contract_version:
          'commercial-config-v1',

        business_description:
          'Software de execução e inteligência comercial.',

        target_audience:
          'Empresas com equipes comerciais.',

        value_proposition:
          'Organizar o processo comercial e apoiar decisões.',

        communication_tone:
          'Consultivo, claro e direto.',

        required_behaviors: [
          'Responder perguntas pendentes antes de pressionar por avanço.',
        ],

        prohibited_behaviors: [
          'Inventar preço ou condição comercial.',
        ],

        sales_method: {
          configured:
            true,

          name:
            'Venda consultiva',

          description:
            'Compreender necessidade, contexto e critérios antes da recomendação.',

          steps: [
            {
              step_order:
                1,

              name:
                'Descoberta',

              objective:
                'Compreender contexto e necessidade.',

              completion_criteria: [
                'Necessidade identificada.',
              ],

              recommended_questions: [
                'Como vocês controlam os acompanhamentos atualmente?',
              ],

              is_required:
                true,
            },
          ],
        },

        products: [
          {
            product_id:
              'product-yolen',

            name:
              'Yolen',

            category:
              'Software comercial',

            base_price:
              null,

            active:
              true,

            indicated_audiences: [
              'Equipes comerciais',
            ],

            needs_addressed: [
              'Acompanhamento de leads',
            ],

            benefits: [
              'Contexto comercial preservado',
            ],

            verified_differentiators: [
              'Copiloto contextual',
            ],

            limitations: [
              'Não substitui confirmação humana',
            ],

            contract_conditions: [],
            payment_conditions: [],

            allowed_claims: [
              'Apoia a execução comercial',
            ],

            forbidden_claims: [
              'Garante vendas',
            ],
          },
        ],

        facts: [
          {
            contract_version:
              'commercial-fact-v1',

            definition:
              null,

            validity_status:
              'legacy',

            category:
              'commercial_policy',

            fact_key:
              'price_handling',

            fact_value:
              'Não inventar preços não configurados.',

            source_note:
              'Política comercial publicada.',
          },
        ],

        objection_guides: [
          {
            sort_order:
              1,

            objection:
              'Preço',

            signals: [
              'Pergunta sobre investimento',
            ],

            discovery_questions: [
              'Qual critério financeiro precisa ser considerado?',
            ],

            recommended_approach:
              'Contextualizar valor sem inventar condições.',

            response_limits: [
              'Não afirmar desconto inexistente.',
            ],
          },
        ],
      },
    },
    previous_state: null,
    known_message_ids: messages.map((item) => item.id),
  })
}

test('LIVE-03: áudio sem transcrição nunca é entregue ao modelo como mensagem citável; o transcrito continua', () => {
  const plan = buildStatefulCopilotExecutionPlan(buildLiveInput())

  assert.equal(plan.mode, 'model')
  const context = plan.request.normalization_context

  assert.ok(!context.available_message_ids.includes('a1'), 'áudio sem transcrição fora das evidências citáveis')
  assert.ok(context.available_message_ids.includes('a2'), 'áudio transcrito continua citável')
  assert.ok(context.available_message_ids.includes('t2'))
  assert.deepEqual(context.pending_audio_message_ids, [], 'nenhuma evidência possível pode cair no invariante de áudio pendente')
  assert.doesNotMatch(plan.request.user_prompt, /"a1"/, 'o id do áudio sem transcrição não aparece para o modelo')
})

test('LIVE-03: AUDIO_EVIDENCE_NOT_TRANSCRIBED é determinístico — sem retry, terminal imediato', () => {
  const outcome = resolveStatefulCopilotBackgroundFailureOutcome({
    failure: {
      code: 'INVALID_MODEL_OUTPUT',
      retryable: true,
      diagnostic_failure_path: 'output.evidence_message_ids',
      diagnostic_failure_invariant: 'AUDIO_EVIDENCE_NOT_TRANSCRIBED',
    },
    execution: null,
  })

  assert.equal(outcome.failure_code, 'INVALID_MODEL_OUTPUT')
  assert.equal(outcome.failure_invariant, 'AUDIO_EVIDENCE_NOT_TRANSCRIBED')
  assert.equal(outcome.retryable, false)
  assert.equal(shouldRetryStatefulCopilotBackgroundFailure({ retryable: outcome.retryable, delivery_count: 1 }), false)
})

test('LIVE-03 (controle): outras saídas inválidas do modelo continuam com retry', () => {
  const outcome = resolveStatefulCopilotBackgroundFailureOutcome({
    failure: {
      code: 'INVALID_MODEL_OUTPUT',
      retryable: true,
      diagnostic_failure_path: 'output.evidence_message_ids',
      diagnostic_failure_invariant: 'MISSING_GLOBAL_EVIDENCE',
    },
    execution: null,
  })

  assert.equal(outcome.retryable, true)
  assert.equal(shouldRetryStatefulCopilotBackgroundFailure({ retryable: outcome.retryable, delivery_count: 1 }), true)
})
