import assert from 'node:assert/strict'
import test from 'node:test'

import {
  STATEFUL_COPILOT_CONTRACT_VERSION,
} from './stateful-copilot-contract.ts'

import {
  STATEFUL_COPILOT_INPUT_VERSION,
} from './stateful-copilot-input.ts'

import {
  STATEFUL_COPILOT_PROMPT_VERSION,
} from './stateful-copilot-execution-plan.ts'

import {
  STATEFUL_COMMUNICATION_CONTRACT_VERSION,
} from './stateful-communication-contract.ts'

import {
  STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION,
} from './stateful-commercial-state.ts'

import {
  StatefulCopilotPersistencePlanError,
  buildStatefulCopilotPersistencePlan,
} from './stateful-copilot-persistence-plan.ts'

function buildInput({
  previousState = null,
} = {}) {
  const previousVersion =
    previousState?.version ?? null

  return {
    input_version:
      STATEFUL_COPILOT_INPUT_VERSION,

    output_contract_version:
      STATEFUL_COPILOT_CONTRACT_VERSION,

    diagnostic_input: {
      company_id:
        'company-1',

      cycle_id:
        'cycle-1',

      conversation_key:
        'conversation-1',

      reference_time:
        '2026-08-06T18:00:00-03:00',
    },

    state_context: {
      mode:
        previousState
          ? 'continuation'
          : 'initial',

      previous_state_version:
        previousVersion,

      target_state_version:
        previousVersion === null
          ? 1
          : previousVersion + 1,

      previous_state:
        previousState,
    },
  }
}

function buildOutput({
  previousStateVersion = null,
} = {}) {
  return {
    contract_version:
      STATEFUL_COPILOT_CONTRACT_VERSION,

    previous_state_version:
      previousStateVersion,

    analyzed_message_ids: [
      'm2',
    ],

    commercial_role:
      'buyer',

    commercial_relevance:
      'commercial',

    interpretation: {
      what_changed: {
        summary:
          'O cliente confirmou interesse.',

        evidence_message_ids: [
          'm2',
        ],
      },

      what_remains_valid: [],

      current_moment: {
        summary:
          'O cliente está avaliando a solução.',

        evidence_message_ids: [
          'm2',
        ],

        memory_ids: [
          'fact-1',
        ],
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
      objection_ids_to_supersede: [],

      commitments_to_upsert: [],

      signals_to_add: [],
      signal_ids_to_resolve: [],

      uncertainties_to_add: [],
      uncertainty_ids_to_resolve: [],
    },

    strategy: {
      method_application:
        'Conduzir a conversa de forma consultiva.',

      rationale:
        'A estratégia considera a mensagem atual e a memória anterior.',

      next_move:
        'Entender a necessidade principal.',

      recommended_question:
        'Qual é sua principal necessidade?',

      suggested_message:
        'Qual é sua principal necessidade neste momento?',

      evidence_message_ids: [
        'm2',
      ],

      memory_ids: [
        'fact-1',
      ],
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
    ],

    memory_ids: [
      'fact-1',
    ],
  }
}

function buildState({
  version = 1,
  updatedAt =
    '2026-08-06T18:00:00-03:00',
} = {}) {
  return {
    contract_version:
      STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION,

    cycle_id:
      'cycle-1',

    version,

    commercial_role:
      'buyer',

    current_moment: {
      summary:
        'O cliente está avaliando a solução.',

      evidence_message_ids: [
        'm2',
      ],
    },

    current_priority: {
      summary:
        'Entender a necessidade principal.',

      evidence_message_ids: [
        'm2',
      ],
    },

    last_analyzed_message_ids: [
      'm2',
    ],

    last_evidence_message_ids: [
      'm2',
    ],

    facts: [],
    needs: [],
    open_loops: [],
    objections: [],
    commitments: [],
    signals: [],
    uncertainties: [],

    created_at:
      '2026-08-06T17:00:00-03:00',

    updated_at:
      updatedAt,
  }
}

function buildModelResult() {
  const input =
    buildInput()

  const output =
    buildOutput()

  return {
    mode:
      'model',

    input,

    previous_state:
      null,

    plan: {
      mode:
        'model',

      request: {
        prompt_version:
          STATEFUL_COPILOT_PROMPT_VERSION,

        output_contract_version:
          STATEFUL_COPILOT_CONTRACT_VERSION,

        system_prompt:
          'system',

        user_prompt:
          'user',

        normalization_context: {
          available_message_ids: [
            'm2',
          ],

          available_memory_ids: [
            'fact-1',
          ],

          active_memory_ids: [
            'fact-1',
          ],

          expected_previous_state_version:
            null,

          current_crm_status:
            'respondeu',

          prohibited_statuses: [
            'ganho',
            'perdido',
          ],

          reference_time:
            '2026-08-06T18:00:00-03:00',
        },
      },
    },

    output,

    communication_output: {
      contract_version:
        STATEFUL_COMMUNICATION_CONTRACT_VERSION,

      intervention_needed:
        true,

      method_application:
        'Aplicar o método de forma consultiva.',

      guidance:
        'Entender a necessidade principal.',

      recommended_question:
        'Qual é sua principal necessidade?',

      suggested_message:
        'Qual é sua principal necessidade neste momento?',
    },

    communication_execution: {
      mode:
        'model',

      provider:
        'openai',

      model:
        'test-model',

      request_id:
        'request-2',

      usage: {
        input_tokens:
          40,

        output_tokens:
          50,

        total_tokens:
          90,
      },

      attempts:
        1,

      recovered_after_retry:
        false,
    },

    candidate_state:
      buildState(),

    execution: {
      mode:
        'model',

      provider:
        'openai',

      model:
        'test-model',

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

      attempts:
        1,

      recovered_after_retry:
        false,
    },
  }
}

function buildPreservedModelResult() {
  const previousState =
    buildState({
      version:
        1,

      updatedAt:
        '2026-08-06T17:00:00-03:00',
    })

  previousState
    .current_moment
    .evidence_message_ids = [
      'm1',
    ]

  previousState
    .current_priority
    .evidence_message_ids = [
      'm1',
    ]

  previousState
    .last_analyzed_message_ids = [
      'm1',
    ]

  previousState
    .last_evidence_message_ids = [
      'm1',
    ]

  const result =
    buildModelResult()

  result.input =
    buildInput({
      previousState,
    })

  result.previous_state =
    clone(
      previousState,
    )

  result.output =
    buildOutput({
      previousStateVersion:
        1,
    })

  result.output
    .commercial_relevance =
      'non_commercial'

  result.candidate_state =
    buildState({
      version:
        2,
    })

  result.candidate_state
    .current_moment =
      clone(
        previousState
          .current_moment,
      )

  result.candidate_state
    .current_priority =
      clone(
        previousState
          .current_priority,
      )

  result.candidate_state
    .last_analyzed_message_ids = [
      'm1',
      'm2',
    ]

  result.candidate_state
    .last_evidence_message_ids = [
      'm1',
    ]

  return result
}

function buildBlockedResult() {
  const input =
    buildInput()

  return {
    mode:
      'blocked',

    input,

    previous_state:
      null,

    plan: {
      mode:
        'blocked',

      reason:
        'analysis_precondition_blocked',

      limitations: [
        'conversation_context_insufficient',
      ],

      normalization_context: {
        available_message_ids: [],
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
          '2026-08-06T18:00:00-03:00',
      },
    },

    output:
      null,

    communication_output:
      null,

    communication_execution:
      null,

    candidate_state:
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
  }
}

function clone(value) {
  return JSON.parse(
    JSON.stringify(value),
  )
}

function expectPlanError(
  callback,
  expectedCode,
) {
  assert.throws(
    callback,
    (error) => {
      assert.ok(
        error instanceof
          StatefulCopilotPersistencePlanError,
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
  'prepara gravação com trava de versão e auditoria completa',
  () => {
    const result =
      buildStatefulCopilotPersistencePlan({
        engine_result:
          buildModelResult(),

        company_id:
          'company-1',

        conversation_key:
          'conversation-1',

        generated_at:
          '2026-08-06T18:00:01-03:00',
      })

    assert.equal(
      result.mode,
      'model',
    )

    assert.equal(
      result.should_persist,
      true,
    )

    assert.equal(
      result
        .write_guard
        .expected_previous_state_version,
      null,
    )

    assert.equal(
      result
        .write_guard
        .candidate_state_version,
      1,
    )

    assert.equal(
      result
        .write_guard
        .requires_compare_and_swap,
      true,
    )

    assert.equal(
      result
        .write_guard
        .requires_atomic_write,
      true,
    )

    assert.deepEqual(
      result
        .audit_event
        .memory_ids,
      [
        'fact-1',
      ],
    )

    assert.equal(
      result
        .audit_event
        .automatic_crm_write,
      false,
    )

    assert.equal(
      result
        .audit_event
        .normalized_output
        .communication
        .contract_version,
      STATEFUL_COMMUNICATION_CONTRACT_VERSION,
    )

    assert.equal(
      result
        .audit_event
        .execution
        .diagnostic
        .request_id,
      'request-1',
    )

    assert.equal(
      result
        .audit_event
        .execution
        .communication
        .request_id,
      'request-2',
    )

    assert.equal(
      result
        .audit_event
        .automatic_agenda_write,
      false,
    )
  },
)

test(
  'estado preservado separa evidência histórica da auditoria da análise atual',
  () => {
    const result =
      buildStatefulCopilotPersistencePlan({
        engine_result:
          buildPreservedModelResult(),

        company_id:
          'company-1',

        conversation_key:
          'conversation-1',

        generated_at:
          '2026-08-06T18:00:01-03:00',
      })

    assert.equal(
      result.mode,
      'model',
    )

    assert.deepEqual(
      result
        .state_snapshot
        .last_analyzed_message_ids,
      [
        'm1',
        'm2',
      ],
    )

    assert.deepEqual(
      result
        .state_snapshot
        .last_evidence_message_ids,
      [
        'm1',
      ],
    )

    assert.deepEqual(
      result
        .audit_event
        .analyzed_message_ids,
      [
        'm2',
      ],
    )

    assert.deepEqual(
      result
        .audit_event
        .evidence_message_ids,
      [
        'm2',
      ],
    )
  },
)

test(
  'estado preservado continua rejeitando bookkeeping histórico adulterado',
  () => {
    const engineResult =
      buildPreservedModelResult()

    engineResult
      .candidate_state
      .last_analyzed_message_ids = [
        'm2',
      ]

    expectPlanError(
      () =>
        buildStatefulCopilotPersistencePlan({
          engine_result:
            engineResult,

          company_id:
            'company-1',

          conversation_key:
            'conversation-1',

          generated_at:
            '2026-08-06T18:00:01-03:00',
        }),
      'VALUE_SET_MISMATCH',
    )
  },
)

test(
  'resultado bloqueado não prepara gravação',
  () => {
    const result =
      buildStatefulCopilotPersistencePlan({
        engine_result:
          buildBlockedResult(),

        company_id:
          'company-1',

        conversation_key:
          'conversation-1',

        generated_at:
          '2026-08-06T18:00:01-03:00',
      })

    assert.equal(
      result.mode,
      'blocked',
    )

    assert.equal(
      result.should_persist,
      false,
    )

    assert.equal(
      result.write_guard,
      null,
    )

    assert.equal(
      result.state_snapshot,
      null,
    )

    assert.equal(
      result.audit_event,
      null,
    )
  },
)

test(
  'rejeita empresa diferente da análise',
  () => {
    expectPlanError(
      () =>
        buildStatefulCopilotPersistencePlan({
          engine_result:
            buildModelResult(),

          company_id:
            'company-2',

          conversation_key:
            'conversation-1',

          generated_at:
            '2026-08-06T18:00:01-03:00',
        }),
      'COMPANY_MISMATCH',
    )
  },
)

test(
  'rejeita versão incorreta do estado candidato',
  () => {
    const engineResult =
      buildModelResult()

    engineResult
      .candidate_state
      .version = 2

    expectPlanError(
      () =>
        buildStatefulCopilotPersistencePlan({
          engine_result:
            engineResult,

          company_id:
            'company-1',

          conversation_key:
            'conversation-1',

          generated_at:
            '2026-08-06T18:00:01-03:00',
        }),
      'CANDIDATE_VERSION_MISMATCH',
    )
  },
)

test(
  'rejeita plano criado antes da análise',
  () => {
    expectPlanError(
      () =>
        buildStatefulCopilotPersistencePlan({
          engine_result:
            buildModelResult(),

          company_id:
            'company-1',

          conversation_key:
            'conversation-1',

          generated_at:
            '2026-08-06T17:59:59-03:00',
        }),
      'PLAN_TIME_BEFORE_ANALYSIS',
    )
  },
)

test(
  'plano não modifica nem compartilha os objetos do motor',
  () => {
    const engineResult =
      buildModelResult()

    const original =
      clone(
        engineResult,
      )

    const plan =
      buildStatefulCopilotPersistencePlan({
        engine_result:
          engineResult,

        company_id:
          'company-1',

        conversation_key:
          'conversation-1',

        generated_at:
          '2026-08-06T18:00:01-03:00',
      })

    plan
      .state_snapshot
      .current_moment
      .summary =
        'alterado depois'

    plan
      .audit_event
      .normalized_output
      .strategy
      .next_move =
        'alterado depois'

    assert.deepEqual(
      engineResult,
      original,
    )
  },
)

test(
  'continuação guarda a versão e o horário anteriores para evitar conflito',
  () => {
    const previousState =
      buildState({
        version:
          1,

        updatedAt:
          '2026-08-06T17:30:00-03:00',
      })

    const input =
      buildInput({
        previousState,
      })

    const engineResult =
      buildModelResult()

    engineResult.input =
      input

    engineResult.previous_state =
      previousState

    engineResult.output =
      buildOutput({
        previousStateVersion:
          1,
      })

    engineResult
      .candidate_state
      .version = 2

    const plan =
      buildStatefulCopilotPersistencePlan({
        engine_result:
          engineResult,

        company_id:
          'company-1',

        conversation_key:
          'conversation-1',

        generated_at:
          '2026-08-06T18:00:01-03:00',
      })

    assert.equal(
      plan
        .write_guard
        .expected_previous_state_version,
      1,
    )

    assert.equal(
      plan
        .write_guard
        .expected_previous_state_updated_at,
      '2026-08-06T17:30:00-03:00',
    )

    assert.equal(
      plan
        .write_guard
        .candidate_state_version,
      2,
    )
  },
)
