import assert from 'node:assert/strict'
import test from 'node:test'

import {
  STATEFUL_COPILOT_CONTRACT_VERSION,
} from './stateful-copilot-contract.ts'

import {
  STATEFUL_COPILOT_PROMPT_VERSION,
} from './stateful-copilot-execution-plan.ts'

import {
  StatefulCopilotExecutionError,
} from './stateful-copilot-executor.ts'

import {
  executeStatefulCopilotPlan,
} from './stateful-copilot-orchestrator.ts'

function buildNormalizationContext() {
  return {
    available_message_ids: [
      'm1',
    ],

    available_memory_ids: [],
    active_memory_ids: [],

    expected_previous_state_version:
      null,

    current_crm_status:
      'respondeu',

    prohibited_statuses: [
      'ganho',
      'perdido',
    ],

    reference_time:
      '2026-08-06T00:45:00-03:00',
  }
}

function buildModelPlan() {
  return {
    mode:
      'model',

    request: {
      prompt_version:
        STATEFUL_COPILOT_PROMPT_VERSION,

      output_contract_version:
        STATEFUL_COPILOT_CONTRACT_VERSION,

      system_prompt:
        'SYSTEM PROMPT',

      user_prompt:
        'USER PROMPT',

      normalization_context:
        buildNormalizationContext(),
    },
  }
}

function buildBlockedPlan() {
  return {
    mode:
      'blocked',

    reason:
      'analysis_precondition_blocked',

    limitations: [
      'conversation_context_insufficient',
    ],

    normalization_context:
      buildNormalizationContext(),
  }
}

function buildAttemptResult({
  requestId = 'request-1',
} = {}) {
  return {
    output: {
      contract_version:
        STATEFUL_COPILOT_CONTRACT_VERSION,

      previous_state_version:
        null,

      analyzed_message_ids: [
        'm1',
      ],

      commercial_role:
        'buyer',

      commercial_relevance:
        'commercial',

      interpretation: {
        what_changed:
          null,

        what_remains_valid: [],

        current_moment: {
          summary:
            'Momento comercial válido.',

          evidence_message_ids: [
            'm1',
          ],

          memory_ids: [],
        },

        customer_need:
          null,

        uncertainties: [],
      },

      state_patch: {
        facts_to_add: [],
        fact_ids_to_supersede: [],

        needs_to_add: [],
        need_ids_to_resolve: [],

        open_loops_to_add: [],
        open_loop_ids_to_resolve: [],

        objections_to_add: [],
        objection_ids_to_resolve: [],

        commitments_to_upsert: [],

        signals_to_add: [],
        signal_ids_to_resolve: [],

        uncertainties_to_add: [],
        uncertainty_ids_to_resolve: [],
      },

      strategy: {
        method_application:
          'Aplicar o método configurado.',

        rationale:
          'A estratégia está sustentada pela conversa.',

        next_move:
          'Manter a condução consultiva.',

        recommended_question:
          null,

        suggested_message:
          null,

        evidence_message_ids: [
          'm1',
        ],

        memory_ids: [],
      },

      operational_suggestions: {
        crm: {
          should_change_crm_stage:
            false,

          recommended_status:
            null,

          rationale:
            null,

          requires_human_confirmation:
            true,
        },

        agenda: {
          should_change_agenda:
            false,

          expected_next_action_at:
            null,

          rationale:
            null,

          requires_human_confirmation:
            true,
        },
      },

      evidence_message_ids: [
        'm1',
      ],

      memory_ids: [],
    },

    execution: {
      mode:
        'model',

      provider:
        'test-provider',

      model:
        'test-model',

      request_id:
        requestId,

      usage: {
        input_tokens:
          10,

        output_tokens:
          20,

        total_tokens:
          30,
      },
    },
  }
}

function executionError({
  code,
  retryable = true,
}) {
  return new StatefulCopilotExecutionError({
    code,

    message:
      `Falha controlada ${code}.`,

    status_code:
      502,

    retryable,
  })
}

function clone(value) {
  return JSON.parse(
    JSON.stringify(value),
  )
}

test(
  'plano bloqueado retorna resultado determinístico sem tentativa',
  async () => {
    let attemptCalls = 0
    let providerCalls = 0

    const result =
      await executeStatefulCopilotPlan({
        plan:
          buildBlockedPlan(),

        provider:
          async () => {
            providerCalls += 1

            throw new Error(
              'O provedor não deveria ser chamado.',
            )
          },

        dependencies: {
          execute_attempt:
            async () => {
              attemptCalls += 1

              return buildAttemptResult()
            },
        },
      })

    assert.deepEqual(
      result,
      {
        mode:
          'blocked',

        output:
          null,

        limitations: [
          'conversation_context_insufficient',
        ],

        execution: {
          mode:
            'blocked',

          provider:
            'deterministic',

          model:
            null,

          request_id:
            null,

          usage:
            null,

          attempts:
            0,

          recovered_after_retry:
            false,
        },
      },
    )

    assert.equal(
      attemptCalls,
      0,
    )

    assert.equal(
      providerCalls,
      0,
    )
  },
)

test(
  'sucesso na primeira tentativa não repete execução',
  async () => {
    let attemptCalls = 0

    const result =
      await executeStatefulCopilotPlan({
        plan:
          buildModelPlan(),

        provider:
          async () => {
            throw new Error(
              'Provedor real não utilizado pelo teste isolado.',
            )
          },

        dependencies: {
          execute_attempt:
            async () => {
              attemptCalls += 1

              return buildAttemptResult()
            },
        },
      })

    assert.equal(
      attemptCalls,
      1,
    )

    assert.equal(
      result.mode,
      'model',
    )

    assert.equal(
      result.execution.attempts,
      1,
    )

    assert.equal(
      result
        .execution
        .recovered_after_retry,
      false,
    )
  },
)

test(
  'saída vazia repete uma vez e pode se recuperar',
  async () => {
    let attemptCalls = 0

    const result =
      await executeStatefulCopilotPlan({
        plan:
          buildModelPlan(),

        provider:
          async () => {
            throw new Error(
              'Provedor real não utilizado.',
            )
          },

        dependencies: {
          execute_attempt:
            async () => {
              attemptCalls += 1

              if (attemptCalls === 1) {
                throw executionError({
                  code:
                    'EMPTY_MODEL_OUTPUT',
                })
              }

              return buildAttemptResult({
                requestId:
                  'request-2',
              })
            },
        },
      })

    assert.equal(
      attemptCalls,
      2,
    )

    assert.equal(
      result.execution.attempts,
      2,
    )

    assert.equal(
      result
        .execution
        .recovered_after_retry,
      true,
    )

    assert.equal(
      result.execution.request_id,
      'request-2',
    )
  },
)

test(
  'JSON inválido é limitado a duas tentativas',
  async () => {
    let attemptCalls = 0

    await assert.rejects(
      () =>
        executeStatefulCopilotPlan({
          plan:
            buildModelPlan(),

          provider:
            async () => {
              throw new Error(
                'Provedor real não utilizado.',
              )
            },

          dependencies: {
            execute_attempt:
              async () => {
                attemptCalls += 1

                if (attemptCalls === 1) {
                  throw executionError({
                    code:
                      'INVALID_MODEL_JSON',
                  })
                }

                throw executionError({
                  code:
                    'INVALID_MODEL_OUTPUT',
                })
              },
          },
        }),
      (error) => {
        assert.ok(
          error instanceof
            StatefulCopilotExecutionError,
        )

        assert.equal(
          error.code,
          'INVALID_MODEL_OUTPUT',
        )

        return true
      },
    )

    assert.equal(
      attemptCalls,
      2,
    )
  },
)

test(
  'violação contratual pode se recuperar na segunda tentativa',
  async () => {
    let attemptCalls = 0

    const result =
      await executeStatefulCopilotPlan({
        plan:
          buildModelPlan(),

        provider:
          async () => {
            throw new Error(
              'Provedor real não utilizado.',
            )
          },

        dependencies: {
          execute_attempt:
            async () => {
              attemptCalls += 1

              if (attemptCalls === 1) {
                throw executionError({
                  code:
                    'INVALID_MODEL_OUTPUT',
                })
              }

              return buildAttemptResult()
            },
        },
      })

    assert.equal(
      attemptCalls,
      2,
    )

    assert.equal(
      result.execution.attempts,
      2,
    )
  },
)

test(
  'falha do provedor não é repetida mesmo marcada como retryable',
  async () => {
    let attemptCalls = 0

    await assert.rejects(
      () =>
        executeStatefulCopilotPlan({
          plan:
            buildModelPlan(),

          provider:
            async () => {
              throw new Error(
                'Provedor real não utilizado.',
              )
            },

          dependencies: {
            execute_attempt:
              async () => {
                attemptCalls += 1

                throw executionError({
                  code:
                    'PROVIDER_REQUEST_FAILED',

                  retryable:
                    true,
                })
              },
          },
        }),
      (error) => {
        assert.equal(
          error.code,
          'PROVIDER_REQUEST_FAILED',
        )

        return true
      },
    )

    assert.equal(
      attemptCalls,
      1,
    )
  },
)

test(
  'saída excessivamente grande não é repetida',
  async () => {
    let attemptCalls = 0

    await assert.rejects(
      () =>
        executeStatefulCopilotPlan({
          plan:
            buildModelPlan(),

          provider:
            async () => {
              throw new Error(
                'Provedor real não utilizado.',
              )
            },

          dependencies: {
            execute_attempt:
              async () => {
                attemptCalls += 1

                throw executionError({
                  code:
                    'MODEL_OUTPUT_TOO_LARGE',

                  retryable:
                    false,
                })
              },
          },
        }),
      (error) => {
        assert.equal(
          error.code,
          'MODEL_OUTPUT_TOO_LARGE',
        )

        return true
      },
    )

    assert.equal(
      attemptCalls,
      1,
    )
  },
)

test(
  'erro desconhecido não é convertido nem repetido',
  async () => {
    let attemptCalls = 0

    const originalError =
      new Error(
        'erro desconhecido controlado',
      )

    await assert.rejects(
      () =>
        executeStatefulCopilotPlan({
          plan:
            buildModelPlan(),

          provider:
            async () => {
              throw new Error(
                'Provedor real não utilizado.',
              )
            },

          dependencies: {
            execute_attempt:
              async () => {
                attemptCalls += 1

                throw originalError
              },
          },
        }),
      (error) =>
        error === originalError,
    )

    assert.equal(
      attemptCalls,
      1,
    )
  },
)

test(
  'orquestração não modifica o plano recebido',
  async () => {
    const plan =
      buildModelPlan()

    const originalPlan =
      clone(plan)

    await executeStatefulCopilotPlan({
      plan,

      provider:
        async () => {
          throw new Error(
            'Provedor real não utilizado.',
          )
        },

      dependencies: {
        execute_attempt:
          async () =>
            buildAttemptResult(),
      },
    })

    assert.deepEqual(
      plan,
      originalPlan,
    )
  },
)
