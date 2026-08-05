import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CompanionDiagnosticEngineError,
  COMPANION_DIAGNOSTIC_ENGINE_VERSION,
  runCompanionDiagnosticEngine,
} from '../server/companion-diagnostic-engine.ts'

import {
  CompanionDiagnosticModelError,
} from './diagnostic-model.ts'

const COMPANY_ID =
  '40fb91ee-f998-4d98-acdf-7d0794369ccf'

const CYCLE_ID =
  '123e4567-e89b-42d3-a456-426614174000'

function buildInput(
  overrides = {},
) {
  return {
    input_version:
      'phase-5-input-v1',

    diagnostic_contract_version:
      'phase-1-v1',

    company_id:
      COMPANY_ID,

    cycle_id:
      CYCLE_ID,

    conversation_key:
      'whatsapp:5511999999999',

    current_crm_status:
      'respondeu',

    reference_time:
      '2026-08-04T20:00:00.000Z',

    analysis_precondition: {
      status: 'ready',
      limitations: [],
    },

    conversation: {
      active_message_ids: [
        '11',
      ],

      excluded_message_ids: [],

      messages: [
        {
          id: '11',
          message_key:
            'message-001',
          version: 1,
          sequence: 1,
          direction: 'incoming',
          occurred_at:
            '2026-08-04T18:00:00.000Z',
          observed_at:
            '2026-08-04T18:00:02.000Z',
          content_type: 'text',
          text_content:
            'Quero conhecer os planos.',
          audio_transcription: null,
        },
      ],

      excluded_messages: [],
    },

    commercial_context: {
      configured: true,

      config_version_id:
        '223e4567-e89b-42d3-a456-426614174000',

      config_version_number: 1,

      config_contract_version:
        'phase-2-v1',

      business_description:
        'Academia com atendimento consultivo.',

      target_audience:
        'Pessoas interessadas em atividade física.',

      value_proposition:
        'Estrutura e acompanhamento.',

      communication_tone:
        'Direto e acolhedor.',

      required_behaviors: [],
      prohibited_behaviors: [],

      sales_method: {
        configured: true,
        name: 'Método Consultivo',
        description:
          'Entender antes de apresentar.',
        steps: [],
      },

      products: [],
      facts: [],
      objection_guides: [],
    },

    ...overrides,
  }
}

function buildSnapshot(
  inputOverrides = {},
) {
  const input =
    buildInput(
      inputOverrides,
    )

  return {
    input,

    source: {
      company_id:
        COMPANY_ID,

      cycle_id:
        CYCLE_ID,

      conversation_key:
        'whatsapp:5511999999999',

      canonical_message_count:
        input.conversation
          .active_message_ids
          .length,

      excluded_message_count:
        input.conversation
          .excluded_message_ids
          .length,

      commercial_config_version_id:
        input.commercial_context
          .config_version_id,

      commercial_config_version_number:
        input.commercial_context
          .config_version_number,
    },
  }
}

function buildDiagnostic(
  overrides = {},
) {
  return {
    contract_version:
      'phase-1-v1',

    analysis_status:
      'complete',

    analysis_limitations: [],

    commercial_relevance:
      'commercial',

    confidence:
      'high',

    customer_intent: {
      summary:
        'O cliente quer conhecer os planos.',

      evidence_message_ids: [
        '11',
      ],
    },

    needs: [],
    missing_information: [],
    unanswered_questions: [],
    active_objections: [],

    seller_assessment: {
      strengths: [],
      risks: [],
    },

    sales_method: {
      configured: true,
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

    guidance: {
      intervention_required: false,
      next_move: null,
      recommended_question: null,
      suggested_message: null,
    },

    crm_suggestion: {
      should_change_crm_stage: false,
      recommended_status: null,
      next_action_required: false,
      expected_next_action_at: null,
      prohibited_statuses: [
        'ganho',
        'perdido',
      ],
      requires_human_confirmation:
        true,
    },

    evidence_message_ids: [
      '11',
    ],

    ...overrides,
  }
}

function createDependencies({
  snapshot =
    buildSnapshot(),

  plan = {
    mode: 'model',

    request: {
      prompt_version:
        'phase-5-prompt-v3',

      diagnostic_contract_version:
        'phase-1-v1',

      system_prompt:
        'prompt do sistema',

      user_prompt:
        'prompt do usuário',
    },
  },

  execution = {
    diagnostic:
      buildDiagnostic(),

    execution: {
      mode: 'model',
      provider: 'openai',
      model: 'test-model',
      request_id: 'req-test',
      usage: {
        input_tokens: 100,
        output_tokens: 200,
        total_tokens: 300,
      },
    },
  },
} = {}) {
  const calls = []

  return {
    calls,

    dependencies: {
      async load_snapshot(args) {
        calls.push({
          stage:
            'snapshot',
          args,
        })

        return snapshot
      },

      build_plan(input) {
        calls.push({
          stage:
            'plan',
          input,
        })

        return plan
      },

      async execute_plan(args) {
        calls.push({
          stage:
            'execution',
          args,
        })

        return execution
      },
    },
  }
}

function runWithDependencies(
  dependencies,
) {
  return runCompanionDiagnosticEngine({
    admin: {},
    company_id:
      COMPANY_ID,
    cycle_id:
      CYCLE_ID,
    conversation_key:
      'whatsapp:5511999999999',
    reference_time:
      '2026-08-04T20:00:00.000Z',

    model_options: {
      api_key:
        'test-key',
      model:
        'test-model',
    },

    dependencies,
  })
}

function assertEngineError(
  callback,
  expectedCode,
) {
  return assert.rejects(
    callback,
    (error) => {
      assert.ok(
        error instanceof
          CompanionDiagnosticEngineError,
      )

      assert.equal(
        error.code,
        expectedCode,
      )

      return true
    },
  )
}

function buildControlledModelError({
  code =
    'INVALID_MODEL_OUTPUT',

  retryable =
    false,
} = {}) {
  return new CompanionDiagnosticModelError({
    code,

    message:
      'Erro controlado do modelo.',

    status_code:
      502,

    retryable,

    details: {
      contract_error_code:
        'INVARIANT_VIOLATION',

      contract_error_path:
        'guidance',
    },
  })
}

test(
  'repete uma vez quando a primeira saída do modelo viola o contrato',
  async () => {
    const {
      dependencies,
    } = createDependencies()

    const originalExecutePlan =
      dependencies.execute_plan

    const executionInputs = []

    let attempts = 0

    dependencies.execute_plan =
      async (args) => {
        attempts += 1

        executionInputs.push(
          args.input,
        )

        if (attempts === 1) {
          throw buildControlledModelError()
        }

        return originalExecutePlan(
          args,
        )
      }

    const result =
      await runWithDependencies(
        dependencies,
      )

    assert.equal(
      attempts,
      2,
    )

    assert.equal(
      executionInputs[0],
      executionInputs[1],
    )

    assert.equal(
      result.execution.provider,
      'openai',
    )
  },
)

test(
  'limita a recuperação de saída inválida a duas tentativas',
  async () => {
    const {
      dependencies,
    } = createDependencies()

    const controlledError =
      buildControlledModelError()

    let attempts = 0

    dependencies.execute_plan =
      async () => {
        attempts += 1

        throw controlledError
      }

    await assert.rejects(
      () =>
        runWithDependencies(
          dependencies,
        ),
      (error) => {
        assert.equal(
          error,
          controlledError,
        )

        return true
      },
    )

    assert.equal(
      attempts,
      2,
    )
  },
)

test(
  'não repete falhas de rede do modelo',
  async () => {
    const {
      dependencies,
    } = createDependencies()

    const networkError =
      buildControlledModelError({
        code:
          'MODEL_NETWORK_ERROR',

        retryable:
          true,
      })

    let attempts = 0

    dependencies.execute_plan =
      async () => {
        attempts += 1

        throw networkError
      }

    await assert.rejects(
      () =>
        runWithDependencies(
          dependencies,
        ),
      (error) => {
        assert.equal(
          error,
          networkError,
        )

        return true
      },
    )

    assert.equal(
      attempts,
      1,
    )
  },
)

test(
  'executa o pipeline completo na ordem correta',
  async () => {
    const {
      dependencies,
      calls,
    } = createDependencies()

    const result =
      await runWithDependencies(
        dependencies,
      )

    assert.equal(
      result.engine_version,
      COMPANION_DIAGNOSTIC_ENGINE_VERSION,
    )

    assert.deepEqual(
      calls.map(
        (call) =>
          call.stage,
      ),
      [
        'snapshot',
        'plan',
        'execution',
      ],
    )

    assert.equal(
      result.source.company_id,
      COMPANY_ID,
    )

    assert.equal(
      result.execution.provider,
      'openai',
    )

    assert.equal(
      result.diagnostic
        .customer_intent
        .summary,
      'O cliente quer conhecer os planos.',
    )
  },
)

test(
  'encaminha a mesma entrada canônica do snapshot para plano e execução',
  async () => {
    const snapshot =
      buildSnapshot()

    const {
      dependencies,
      calls,
    } = createDependencies({
      snapshot,
    })

    await runWithDependencies(
      dependencies,
    )

    const planCall =
      calls.find(
        (call) =>
          call.stage ===
          'plan',
      )

    const executionCall =
      calls.find(
        (call) =>
          call.stage ===
          'execution',
      )

    assert.equal(
      planCall.input,
      snapshot.input,
    )

    assert.equal(
      executionCall.args.input,
      snapshot.input,
    )
  },
)

test(
  'entrada bloqueada produz execução determinística',
  async () => {
    const snapshot =
      buildSnapshot({
        analysis_precondition: {
          status: 'blocked',

          limitations: [
            'conversation_context_insufficient',
          ],
        },

        conversation: {
          active_message_ids: [],
          excluded_message_ids: [],
          messages: [],
          excluded_messages: [],
        },
      })

    const blockedDiagnostic =
      buildDiagnostic({
        analysis_status:
          'blocked',

        analysis_limitations: [
          'conversation_context_insufficient',
        ],

        commercial_relevance:
          'uncertain',

        confidence:
          'low',

        customer_intent:
          null,

        sales_method: {
          configured: true,
          current_step: null,
          completed_steps: [],
          skipped_steps: [],
          evidence_message_ids: [],
        },

        guidance: {
          intervention_required: false,
          next_move: null,
          recommended_question: null,
          suggested_message: null,
        },

        crm_suggestion: {
          should_change_crm_stage: false,
          recommended_status: null,
          next_action_required: false,
          expected_next_action_at: null,
          prohibited_statuses: [
            'ganho',
            'perdido',
          ],
          requires_human_confirmation:
            true,
        },

        evidence_message_ids: [],
      })

    const {
      dependencies,
    } = createDependencies({
      snapshot,

      plan: {
        mode: 'blocked',

        diagnostic:
          blockedDiagnostic,
      },

      execution: {
        diagnostic:
          blockedDiagnostic,

        execution: {
          mode: 'blocked',
          provider:
            'deterministic',
          model: null,
          request_id: null,
          usage: null,
        },
      },
    })

    const result =
      await runWithDependencies(
        dependencies,
      )

    assert.equal(
      result.execution.mode,
      'blocked',
    )

    assert.equal(
      result.execution.provider,
      'deterministic',
    )

    assert.equal(
      result.diagnostic
        .analysis_status,
      'blocked',
    )
  },
)

test(
  'rejeita plano de modelo para fotografia bloqueada',
  async () => {
    const snapshot =
      buildSnapshot({
        analysis_precondition: {
          status: 'blocked',

          limitations: [
            'conversation_context_insufficient',
          ],
        },
      })

    const {
      dependencies,
    } = createDependencies({
      snapshot,
    })

    await assertEngineError(
      () =>
        runWithDependencies(
          dependencies,
        ),

      'DIAGNOSTIC_PLAN_MISMATCH',
    )
  },
)

test(
  'rejeita plano bloqueado para fotografia executável',
  async () => {
    const {
      dependencies,
    } = createDependencies({
      plan: {
        mode: 'blocked',

        diagnostic:
          buildDiagnostic({
            analysis_status:
              'blocked',

            analysis_limitations: [
              'conversation_context_insufficient',
            ],

            confidence:
              'low',

            customer_intent:
              null,
          }),
      },
    })

    await assertEngineError(
      () =>
        runWithDependencies(
          dependencies,
        ),

      'DIAGNOSTIC_PLAN_MISMATCH',
    )
  },
)

test(
  'rejeita execução determinística para plano de modelo',
  async () => {
    const {
      dependencies,
    } = createDependencies({
      execution: {
        diagnostic:
          buildDiagnostic(),

        execution: {
          mode: 'blocked',
          provider:
            'deterministic',
          model: null,
          request_id: null,
          usage: null,
        },
      },
    })

    await assertEngineError(
      () =>
        runWithDependencies(
          dependencies,
        ),

      'DIAGNOSTIC_EXECUTION_MISMATCH',
    )
  },
)

test(
  'rejeita evidência global fora da fotografia canônica',
  async () => {
    const {
      dependencies,
    } = createDependencies({
      execution: {
        diagnostic:
          buildDiagnostic({
            evidence_message_ids: [
              '999',
            ],
          }),

        execution: {
          mode: 'model',
          provider: 'openai',
          model: 'test-model',
          request_id: null,
          usage: null,
        },
      },
    })

    await assertEngineError(
      () =>
        runWithDependencies(
          dependencies,
        ),

      'DIAGNOSTIC_SCOPE_VIOLATION',
    )
  },
)

test(
  'rejeita diagnóstico sem confirmação humana obrigatória',
  async () => {
    const {
      dependencies,
    } = createDependencies({
      execution: {
        diagnostic:
          buildDiagnostic({
            crm_suggestion: {
              should_change_crm_stage: false,
              recommended_status: null,
              next_action_required: false,
              expected_next_action_at: null,
              prohibited_statuses: [],
              requires_human_confirmation:
                false,
            },
          }),

        execution: {
          mode: 'model',
          provider: 'openai',
          model: 'test-model',
          request_id: null,
          usage: null,
        },
      },
    })

    await assertEngineError(
      () =>
        runWithDependencies(
          dependencies,
        ),

      'DIAGNOSTIC_CONFIRMATION_REQUIRED',
    )
  },
)

test(
  'encaminha as opções do modelo sem expor ou modificar a chave',
  async () => {
    const {
      dependencies,
      calls,
    } = createDependencies()

    const modelOptions = {
      api_key:
        'segredo-de-teste',
      model:
        'modelo-de-teste',
      timeout_ms: 30000,
    }

    await runCompanionDiagnosticEngine({
      admin: {},
      company_id:
        COMPANY_ID,
      cycle_id:
        CYCLE_ID,
      conversation_key:
        'whatsapp:5511999999999',
      reference_time:
        '2026-08-04T20:00:00.000Z',
      model_options:
        modelOptions,
      dependencies,
    })

    const executionCall =
      calls.find(
        (call) =>
          call.stage ===
          'execution',
      )

    assert.equal(
      executionCall.args.options,
      modelOptions,
    )

    assert.equal(
      executionCall.args.options
        .api_key,
      'segredo-de-teste',
    )

    assert.equal(
      JSON.stringify(
        executionCall.args.plan,
      ).includes(
        'segredo-de-teste',
      ),
      false,
    )
  },
)

test(
  'não modifica a fotografia retornada pelo carregador',
  async () => {
    const snapshot =
      buildSnapshot()

    const originalSnapshot =
      structuredClone(
        snapshot,
      )

    const {
      dependencies,
    } = createDependencies({
      snapshot,
    })

    await runWithDependencies(
      dependencies,
    )

    assert.deepEqual(
      snapshot,
      originalSnapshot,
    )
  },
)
