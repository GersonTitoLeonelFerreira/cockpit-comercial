import assert from 'node:assert/strict'
import test from 'node:test'

import {
  STATEFUL_COPILOT_CONTRACT_VERSION,
} from './stateful-copilot-contract.ts'

import {
  STATEFUL_COPILOT_PROMPT_VERSION,
} from './stateful-copilot-execution-plan.ts'

import {
  STATEFUL_COPILOT_DIAGNOSTIC_STRUCTURED_OUTPUT_FORMAT,
} from './stateful-copilot-json-schema.ts'

import {
  StatefulCopilotExecutionError,
  executeStatefulCopilotModelAttempt,
} from './stateful-copilot-executor.ts'

function buildNormalizationContext() {
  return {
    available_message_ids: [
      'm2',
      'm3',
    ],

    customer_message_ids: [
      'm2',
      'm3',
    ],

    available_products: [],

    previous_communication_observations: [],

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
      '2026-08-06T00:30:00-03:00',
  }
}

function buildPlan() {
  return {
    mode:
      'model',

    request: {
      prompt_version:
        STATEFUL_COPILOT_PROMPT_VERSION,

      output_contract_version:
        STATEFUL_COPILOT_CONTRACT_VERSION,

      system_prompt:
        'SYSTEM PROMPT STATEFUL',

      user_prompt:
        'USER PROMPT STATEFUL',

      normalization_context:
        buildNormalizationContext(),
    },
  }
}

function emptyPatch() {
  return {
    facts_to_add: [],
    fact_ids_to_supersede: [],

    needs_to_add: [],
    need_ids_to_resolve: [],

    open_loops_to_add: [],
    open_loop_ids_to_resolve: [],

    objections_to_add: [],
    objection_ids_to_resolve: [],
    objection_ids_to_supersede: [],

    commitments_to_upsert: [],

    signals_to_add: [],
    signal_ids_to_resolve: [],

    uncertainties_to_add: [],
    uncertainty_ids_to_resolve: [],
  }
}

function buildValidOutput() {
  return {
    contract_version:
      STATEFUL_COPILOT_CONTRACT_VERSION,

    previous_state_version:
      null,

    analyzed_message_ids: [
      'm2',
      'm3',
    ],

    commercial_role:
      'buyer',

    commercial_relevance:
      'commercial',

    interpretation: {
      what_changed: {
        summary:
          'O cliente perguntou sobre o investimento.',

        evidence_message_ids: [
          'm3',
        ],
      },

      what_remains_valid: [],

      current_moment: {
        summary:
          'O cliente mantém interesse e quer entender o investimento.',

        evidence_message_ids: [
          'm2',
          'm3',
        ],

        memory_ids: [],
      },

      customer_need: {
        summary:
          'Compreender o investimento antes de avançar.',

        evidence_message_ids: [
          'm3',
        ],

        memory_ids: [],
      },

      uncertainties: [],
    },

    state_patch:
      emptyPatch(),

    strategy: {
      method_application:
        'Responder a pergunta antes de pressionar por avanço.',

      rationale:
        'Existe uma pergunta comercial objetiva ainda sem resposta.',

      next_move:
        'Esclarecer o investimento de forma contextualizada.',

      recommended_question:
        null,

      suggested_message:
        'Entendi. Vou te explicar como funciona o investimento e o que está incluído.',

      evidence_message_ids: [
        'm2',
        'm3',
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
      'm2',
      'm3',
    ],

    memory_ids: [],
  }
}

function buildProviderResponse(
  content =
    JSON.stringify(
      buildValidOutput(),
    ),
) {
  return {
    content,

    provider:
      'test-provider',

    model:
      'test-model-2026-08-06',

    request_id:
      'request-1',

    usage: {
      input_tokens:
        100,

      output_tokens:
        200,

      total_tokens:
        300,
    },
  }
}

function clone(value) {
  return JSON.parse(
    JSON.stringify(value),
  )
}

async function expectExecutionError(
  callback,
  expectedCode,
) {
  await assert.rejects(
    callback,
    (error) => {
      assert.ok(
        error instanceof
          StatefulCopilotExecutionError,
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
  'normaliza uma saída válida retornada pelo provedor',
  async () => {
    const result =
      await executeStatefulCopilotModelAttempt({
        plan:
          buildPlan(),

        provider:
          async () =>
            buildProviderResponse(),
      })

    assert.deepEqual(
      result.output,
      buildValidOutput(),
    )

    assert.deepEqual(
      result.execution,
      {
        mode:
          'model',

        provider:
          'test-provider',

        model:
          'test-model-2026-08-06',

        request_id:
          'request-1',

        usage: {
          input_tokens:
            100,

          output_tokens:
            200,

          total_tokens:
            300,
        },
      },
    )
  },
)

test(
  'encaminha prompts versões e formato estruturado ao provedor',
  async () => {
    let receivedRequest =
      null

    await executeStatefulCopilotModelAttempt({
      plan:
        buildPlan(),

      provider:
        async (request) => {
          receivedRequest =
            request

          return buildProviderResponse()
        },
    })

    assert.deepEqual(
      Object.keys(
        receivedRequest,
      ).sort(),
      [
        'output_contract_version',
        'prompt_version',
        'structured_output_format',
        'system_prompt',
        'user_prompt',
      ],
    )

    assert.deepEqual(
      receivedRequest
        .structured_output_format,
      STATEFUL_COPILOT_DIAGNOSTIC_STRUCTURED_OUTPUT_FORMAT,
    )

    assert.equal(
      Object.isFrozen(
        receivedRequest,
      ),
      true,
    )

    assert.ok(
      !Object.hasOwn(
        receivedRequest,
        'normalization_context',
      ),
    )
  },
)

test(
  'plano bloqueado não pode executar tentativa de modelo',
  async () => {
    let providerCalls = 0

    await expectExecutionError(
      () =>
        executeStatefulCopilotModelAttempt({
          plan: {
            mode:
              'blocked',

            reason:
              'analysis_precondition_blocked',

            limitations: [
              'conversation_context_insufficient',
            ],

            normalization_context:
              buildNormalizationContext(),
          },

          provider:
            async () => {
              providerCalls += 1

              return buildProviderResponse()
            },
        }),
      'EXECUTION_PLAN_NOT_MODEL',
    )

    assert.equal(
      providerCalls,
      0,
    )
  },
)

test(
  'rejeita saída vazia do modelo',
  async () => {
    await expectExecutionError(
      () =>
        executeStatefulCopilotModelAttempt({
          plan:
            buildPlan(),

          provider:
            async () =>
              buildProviderResponse(
                '   ',
              ),
        }),
      'EMPTY_MODEL_OUTPUT',
    )
  },
)

test(
  'rejeita conteúdo que não seja JSON',
  async () => {
    await expectExecutionError(
      () =>
        executeStatefulCopilotModelAttempt({
          plan:
            buildPlan(),

          provider:
            async () =>
              buildProviderResponse(
                'resposta sem json',
              ),
        }),
      'INVALID_MODEL_JSON',
    )
  },
)

test(
  'rejeita JSON que não seja um objeto',
  async () => {
    await expectExecutionError(
      () =>
        executeStatefulCopilotModelAttempt({
          plan:
            buildPlan(),

          provider:
            async () =>
              buildProviderResponse(
                '[]',
              ),
        }),
      'INVALID_MODEL_JSON',
    )
  },
)

test(
  'expõe somente código e caminho seguros da violação contratual',
  async () => {
    const invalidOutput =
      buildValidOutput()

    invalidOutput
      .analyzed_message_ids = [
        'm2',
      ]

    await assert.rejects(
      () =>
        executeStatefulCopilotModelAttempt({
          plan:
            buildPlan(),

          provider:
            async () =>
              buildProviderResponse(
                JSON.stringify(
                  invalidOutput,
                ),
              ),
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

        assert.equal(
          error.retryable,
          true,
        )

        assert.deepEqual(
          error.details,
          {
            contract_error_code:
              'ANALYZED_MESSAGE_SET_MISMATCH',

            contract_error_path:
              'output.analyzed_message_ids',
          },
        )

        return true
      },
    )
  },
)

test(
  'não expõe detalhes internos da falha do provedor',
  async () => {
    const secret =
      'segredo-interno-do-provedor'

    await assert.rejects(
      () =>
        executeStatefulCopilotModelAttempt({
          plan:
            buildPlan(),

          provider:
            async () => {
              throw new Error(
                secret,
              )
            },
        }),
      (error) => {
        assert.ok(
          error instanceof
            StatefulCopilotExecutionError,
        )

        assert.equal(
          error.code,
          'PROVIDER_REQUEST_FAILED',
        )

        assert.equal(
          error.retryable,
          true,
        )

        assert.ok(
          !error.message.includes(
            secret,
          ),
        )

        assert.equal(
          error.details,
          null,
        )

        return true
      },
    )
  },
)

test(
  'rejeita saída acima do limite permitido',
  async () => {
    await expectExecutionError(
      () =>
        executeStatefulCopilotModelAttempt({
          plan:
            buildPlan(),

          provider:
            async () =>
              buildProviderResponse(
                'x'.repeat(
                  1_000_001,
                ),
              ),
        }),
      'MODEL_OUTPUT_TOO_LARGE',
    )
  },
)

test(
  'execução é determinística e não modifica o plano',
  async () => {
    const plan =
      buildPlan()

    const originalPlan =
      clone(plan)

    const provider =
      async () =>
        buildProviderResponse()

    const firstResult =
      await executeStatefulCopilotModelAttempt({
        plan,
        provider,
      })

    const secondResult =
      await executeStatefulCopilotModelAttempt({
        plan,
        provider,
      })

    assert.deepEqual(
      firstResult,
      secondResult,
    )

    assert.deepEqual(
      plan,
      originalPlan,
    )
  },
)
