import assert from 'node:assert/strict'
import test from 'node:test'

import {
  STATEFUL_COPILOT_PERSISTENCE_PLAN_VERSION,
} from './stateful-copilot-persistence-plan.ts'

import {
  StatefulCopilotPersistenceExecutionError,
  executeStatefulCopilotPersistence,
} from './stateful-copilot-persistence-executor.ts'

function buildState() {
  return {
    contract_version:
      'stateful-commercial-state-v1',

    cycle_id:
      'cycle-1',

    version:
      2,

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
      '2026-08-06T18:00:00-03:00',
  }
}

function buildOutput() {
  return {
    contract_version:
      'stateful-copilot-v2',

    previous_state_version:
      1,

    analyzed_message_ids: [
      'm2',
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
          'O cliente está avaliando a solução.',

        evidence_message_ids: [
          'm2',
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
      method_application:
        'Conduzir a conversa.',

      rationale:
        'A estratégia considera a conversa atual.',

      next_move:
        'Entender a necessidade.',

      recommended_question:
        null,

      suggested_message:
        null,

      evidence_message_ids: [
        'm2',
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
    ],

    memory_ids: [],
  }
}

function buildModelPlan() {
  const output =
    buildOutput()

  return {
    plan_version:
      STATEFUL_COPILOT_PERSISTENCE_PLAN_VERSION,

    mode:
      'model',

    should_persist:
      true,

    generated_at:
      '2026-08-06T18:00:01-03:00',

    company_id:
      'company-1',

    cycle_id:
      'cycle-1',

    conversation_key:
      'conversation-1',

    write_guard: {
      company_id:
        'company-1',

      cycle_id:
        'cycle-1',

      conversation_key:
        'conversation-1',

      expected_previous_state_version:
        1,

      expected_previous_state_updated_at:
        '2026-08-06T17:30:00-03:00',

      candidate_state_version:
        2,

      requires_compare_and_swap:
        true,

      requires_atomic_write:
        true,
    },

    state_snapshot:
      buildState(),

    audit_event: {
      event_type:
        'stateful_copilot_analysis_completed',

      generated_at:
        '2026-08-06T18:00:01-03:00',

      company_id:
        'company-1',

      cycle_id:
        'cycle-1',

      conversation_key:
        'conversation-1',

      previous_state_version:
        1,

      candidate_state_version:
        2,

      analyzed_message_ids: [
        'm2',
      ],

      evidence_message_ids: [
        'm2',
      ],

      memory_ids: [],

      normalized_output:
        output,

      execution: {
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

      automatic_crm_write:
        false,

      automatic_agenda_write:
        false,
    },
  }
}

function buildBlockedPlan() {
  return {
    plan_version:
      STATEFUL_COPILOT_PERSISTENCE_PLAN_VERSION,

    mode:
      'blocked',

    should_persist:
      false,

    generated_at:
      '2026-08-06T18:00:01-03:00',

    company_id:
      'company-1',

    cycle_id:
      'cycle-1',

    conversation_key:
      'conversation-1',

    expected_previous_state_version:
      1,

    limitations: [
      'conversation_context_insufficient',
    ],

    write_guard:
      null,

    state_snapshot:
      null,

    audit_event:
      null,
  }
}

function clone(value) {
  return JSON.parse(
    JSON.stringify(value),
  )
}

test(
  'plano bloqueado não chama a camada de gravação',
  async () => {
    let writerCalls = 0

    const result =
      await executeStatefulCopilotPersistence({
        plan:
          buildBlockedPlan(),

        writer:
          async () => {
            writerCalls += 1

            throw new Error(
              'Não deveria gravar.',
            )
          },
      })

    assert.equal(
      result.mode,
      'skipped',
    )

    assert.equal(
      result.persisted,
      false,
    )

    assert.equal(
      result.writer_calls,
      0,
    )

    assert.equal(
      writerCalls,
      0,
    )
  },
)

test(
  'executa uma gravação e confirma a versão persistida',
  async () => {
    const requests = []

    const result =
      await executeStatefulCopilotPersistence({
        plan:
          buildModelPlan(),

        writer:
          async (request) => {
            requests.push(
              request,
            )

            return {
              status:
                'persisted',

              state_record_id:
                'state-record-1',

              audit_event_id:
                'audit-event-1',

              persisted_state_version:
                2,

              persisted_at:
                '2026-08-06T18:00:02-03:00',
            }
          },
      })

    assert.equal(
      result.mode,
      'persisted',
    )

    assert.equal(
      result.persisted,
      true,
    )

    assert.equal(
      result.persisted_state_version,
      2,
    )

    assert.equal(
      result.writer_calls,
      1,
    )

    assert.equal(
      requests.length,
      1,
    )

    assert.match(
      result.operation_key,
      /company-1/,
    )

    assert.match(
      result.operation_key,
      /cycle-1/,
    )

    assert.match(
      result.operation_key,
      /v2/,
    )
  },
)

test(
  'o mesmo plano sempre gera a mesma chave de operação',
  async () => {
    const operationKeys = []

    const writer =
      async (request) => {
        operationKeys.push(
          request.operation_key,
        )

        return {
          status:
            'conflict',

          current_state_version:
            2,

          current_state_updated_at:
            '2026-08-06T18:00:02-03:00',
        }
      }

    await executeStatefulCopilotPersistence({
      plan:
        buildModelPlan(),

      writer,
    })

    await executeStatefulCopilotPersistence({
      plan:
        buildModelPlan(),

      writer,
    })

    assert.equal(
      operationKeys.length,
      2,
    )

    assert.equal(
      operationKeys[0],
      operationKeys[1],
    )
  },
)

test(
  'planos divergentes da mesma versão geram chaves de operação diferentes',
  async () => {
    const firstPlan =
      buildModelPlan()

    const secondPlan =
      buildModelPlan()

    secondPlan
      .state_snapshot
      .current_priority
      .summary =
        'Outra prioridade comercial.'

    secondPlan
      .audit_event
      .normalized_output
      .strategy
      .next_move =
        'Executar outro próximo movimento.'

    const operationKeys = []

    const writer =
      async (request) => {
        operationKeys.push(
          request.operation_key,
        )

        return {
          status:
            'conflict',

          current_state_version:
            2,

          current_state_updated_at:
            '2026-08-06T18:00:02-03:00',
        }
      }

    await executeStatefulCopilotPersistence({
      plan:
        firstPlan,

      writer,
    })

    await executeStatefulCopilotPersistence({
      plan:
        secondPlan,

      writer,
    })

    assert.equal(
      operationKeys.length,
      2,
    )

    assert.notEqual(
      operationKeys[0],
      operationKeys[1],
    )
  },
)

test(
  'conflito de versão não tenta gravar novamente',
  async () => {
    let writerCalls = 0

    const result =
      await executeStatefulCopilotPersistence({
        plan:
          buildModelPlan(),

        writer:
          async () => {
            writerCalls += 1

            return {
              status:
                'conflict',

              current_state_version:
                3,

              current_state_updated_at:
                '2026-08-06T18:00:03-03:00',
            }
          },
      })

    assert.equal(
      result.mode,
      'conflict',
    )

    assert.equal(
      result.persisted,
      false,
    )

    assert.equal(
      result.current_state_version,
      3,
    )

    assert.equal(
      writerCalls,
      1,
    )
  },
)

test(
  'rejeita confirmação de versão diferente da candidata',
  async () => {
    await assert.rejects(
      () =>
        executeStatefulCopilotPersistence({
          plan:
            buildModelPlan(),

          writer:
            async () => ({
              status:
                'persisted',

              state_record_id:
                'state-record-1',

              audit_event_id:
                'audit-event-1',

              persisted_state_version:
                3,

              persisted_at:
                '2026-08-06T18:00:02-03:00',
            }),
        }),
      (error) => {
        assert.ok(
          error instanceof
            StatefulCopilotPersistenceExecutionError,
        )

        assert.equal(
          error.code,
          'PERSISTED_VERSION_MISMATCH',
        )

        return true
      },
    )
  },
)

test(
  'falha interna da gravação não expõe detalhes e não repete',
  async () => {
    let writerCalls = 0

    await assert.rejects(
      () =>
        executeStatefulCopilotPersistence({
          plan:
            buildModelPlan(),

          writer:
            async () => {
              writerCalls += 1

              throw new Error(
                'senha interna do banco',
              )
            },
        }),
      (error) => {
        assert.ok(
          error instanceof
            StatefulCopilotPersistenceExecutionError,
        )

        assert.equal(
          error.code,
          'PERSISTENCE_WRITE_FAILED',
        )

        assert.equal(
          error.retryable,
          false,
        )

        assert.ok(
          !error.message.includes(
            'senha interna',
          ),
        )

        return true
      },
    )

    assert.equal(
      writerCalls,
      1,
    )
  },
)

test(
  'a camada de gravação não consegue modificar o plano original',
  async () => {
    const plan =
      buildModelPlan()

    const original =
      clone(
        plan,
      )

    await executeStatefulCopilotPersistence({
      plan,

      writer:
        async (request) => {
          request
            .plan
            .state_snapshot
            .current_moment
            .summary =
              'alterado pelo writer'

          return {
            status:
              'persisted',

            state_record_id:
              'state-record-1',

            audit_event_id:
              'audit-event-1',

            persisted_state_version:
              2,

            persisted_at:
              '2026-08-06T18:00:02-03:00',
          }
        },
    })

    assert.deepEqual(
      plan,
      original,
    )
  },
)

test(
  'rejeita plano sem trava de gravação atômica',
  async () => {
    const plan =
      buildModelPlan()

    plan
      .write_guard
      .requires_atomic_write =
        false

    await assert.rejects(
      () =>
        executeStatefulCopilotPersistence({
          plan,

          writer:
            async () => {
              throw new Error(
                'Não deveria ser chamado.',
              )
            },
        }),
      (error) => {
        assert.ok(
          error instanceof
            StatefulCopilotPersistenceExecutionError,
        )

        assert.equal(
          error.code,
          'UNSAFE_PERSISTENCE_PLAN',
        )

        return true
      },
    )
  },
)
