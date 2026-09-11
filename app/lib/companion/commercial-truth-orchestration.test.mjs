import assert from 'node:assert/strict'
import test from 'node:test'

import {
  STATEFUL_COPILOT_CONTRACT_VERSION,
} from './stateful-copilot-contract.ts'

import {
  STATEFUL_COPILOT_PROMPT_VERSION,
} from './stateful-copilot-execution-plan.ts'

import {
  executeStatefulCopilotPlan,
} from './stateful-copilot-orchestrator.ts'

function buildPrompt(text) {
  return JSON.stringify({
    input: {
      diagnostic_input: {
        current_crm_status:
          'contato',
        commercial_context: {
          products: [],
        },
        conversation: {
          messages: [
            {
              id: 'm1',
              direction: 'incoming',
              text_content: text,
              audio_transcription: null,
            },
          ],
          context_bridge_messages: [],
        },
      },
    },
  })
}

function buildPlan(text) {
  return {
    mode: 'model',
    request: {
      prompt_version:
        STATEFUL_COPILOT_PROMPT_VERSION,
      output_contract_version:
        STATEFUL_COPILOT_CONTRACT_VERSION,
      system_prompt:
        'SYSTEM',
      user_prompt:
        buildPrompt(text),
      normalization_context: {
        available_message_ids: ['m1'],
        customer_message_ids: ['m1'],
        pending_audio_message_ids: [],
        available_products: [],
        previous_communication_observations: [],
        available_memory_ids: [],
        active_memory_ids: [],
        negotiation_evidence_detected: true,
        expected_previous_state_version: null,
        current_crm_status: 'contato',
        prohibited_statuses: ['ganho', 'perdido'],
        reference_time:
          '2026-09-11T09:00:00-03:00',
      },
    },
  }
}

function buildOutput({
  relevance = 'commercial',
  role = 'buyer',
  facts = [],
} = {}) {
  return {
    contract_version:
      STATEFUL_COPILOT_CONTRACT_VERSION,
    previous_state_version:
      null,
    analyzed_message_ids: ['m1'],
    commercial_role:
      role,
    commercial_relevance:
      relevance,
    interpretation: {
      what_changed: null,
      what_remains_valid: [],
      current_moment: {
        summary: 'Momento atual.',
        evidence_message_ids: ['m1'],
        memory_ids: [],
      },
      customer_need: null,
      uncertainties: [],
    },
    state_patch: {
      facts_to_add:
        facts.map((kind) => ({
          kind,
          value: null,
          confidence: 'high',
          summary: kind,
          evidence_message_ids: ['m1'],
        })),
      fact_ids_to_supersede: [],
      needs_to_add: [],
      need_ids_to_resolve: [],
      need_ids_to_supersede: [],
      open_loops_to_add: [],
      open_loop_ids_to_resolve: [],
      open_loop_ids_to_supersede: [],
      objections_to_add: [],
      objection_ids_to_resolve: [],
      objection_ids_to_supersede: [],
      commitments_to_upsert: [],
      signals_to_add: [],
      signal_ids_to_resolve: [],
      uncertainties_to_add: [],
      uncertainty_ids_to_resolve: [],
      uncertainty_ids_to_supersede: [],
    },
    strategy: {
      method_application: 'Método.',
      rationale: 'Racional.',
      next_move: 'Próximo movimento.',
      recommended_question: null,
      suggested_message: null,
      evidence_message_ids: ['m1'],
      memory_ids: [],
    },
    operational_suggestions: {
      crm: {
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
    evidence_message_ids: ['m1'],
    memory_ids: [],
  }
}

function attemptResult(output, requestId) {
  return {
    output,
    execution: {
      mode: 'model',
      provider: 'test',
      model: 'test',
      request_id: requestId,
      usage: null,
    },
  }
}

test(
  'falso negativo comercial dispara reparo e segunda tentativa recebe instrução determinística',
  async () => {
    let calls = 0
    const seenPrompts = []

    const result =
      await executeStatefulCopilotPlan({
        plan:
          buildPlan(
            'Quero fechar o plano e preciso do link de pagamento.',
          ),
        provider:
          async () => {
            throw new Error('unused')
          },
        dependencies: {
          execute_attempt:
            async ({ plan }) => {
              calls += 1
              seenPrompts.push(
                plan.request.system_prompt,
              )

              return attemptResult(
                buildOutput({
                  relevance:
                    calls === 1
                      ? 'non_commercial'
                      : 'commercial',
                }),
                `request-${calls}`,
              )
            },
        },
      })

    assert.equal(calls, 2)
    assert.equal(
      result.execution.attempts,
      2,
    )
    assert.equal(
      result.output.commercial_relevance,
      'commercial',
    )
    assert.match(
      seenPrompts[0],
      /COMMERCIAL_TRUTH_GUARD/,
    )
    assert.match(
      seenPrompts[1],
      /REPARO OBRIGATÓRIO DO COMMERCIAL_TRUTH_GUARD/,
    )
  },
)

test(
  'indicação de irmã exige fatos separados para interlocutor e prospect',
  async () => {
    let calls = 0

    const result =
      await executeStatefulCopilotPlan({
        plan:
          buildPlan(
            'Minha irmã quer fazer o plano anual. Como faço para ela começar?',
          ),
        provider:
          async () => {
            throw new Error('unused')
          },
        dependencies: {
          execute_attempt:
            async () => {
              calls += 1

              return attemptResult(
                buildOutput({
                  facts:
                    calls === 1
                      ? []
                      : [
                          'commercial_party.current_contact.intermediary',
                          'commercial_party.related.prospect',
                        ],
                }),
                `request-${calls}`,
              )
            },
        },
      })

    assert.equal(calls, 2)
    assert.deepEqual(
      result.output.state_patch
        .facts_to_add
        .map((fact) => fact.kind),
      [
        'commercial_party.current_contact.intermediary',
        'commercial_party.related.prospect',
      ],
    )
  },
)
