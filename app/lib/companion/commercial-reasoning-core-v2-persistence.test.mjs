import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCommercialReasoningCoreV2PersistencePlan,
} from './commercial-reasoning-core-v2-persistence-plan.ts'

import {
  CommercialReasoningCoreV2PersistenceExecutionError,
  executeCommercialReasoningCoreV2Persistence,
} from './commercial-reasoning-core-v2-persistence-executor.ts'

function buildState({
  version = 1,
} = {}) {
  return {
    contract_version:
      'phase-5.1-commercial-state-v1',

    cycle_id:
      'cycle-a',

    version,

    commercial_role:
      'buyer',

    current_moment: {
      summary:
        'Cliente deseja avançar.',

      evidence_message_ids: [
        'm2',
      ],
    },

    current_priority: {
      summary:
        'Concluir o próximo passo.',

      evidence_message_ids: [
        'm2',
      ],
    },

    last_analyzed_message_ids: [
      'm1',
      'm2',
    ],

    last_evidence_message_ids: [
      'm2',
    ],

    facts: [
      {
        id:
          'memory-1',

        kind:
          'client.preference',

        value:
          null,

        summary:
          'Prefere respostas objetivas.',

        confidence:
          'high',

        evidence_message_ids: [
          'm2',
        ],

        memory_status:
          'active',

        created_in_state_version:
          version,

        updated_in_state_version:
          version,

        closed_in_state_version:
          null,
      },
    ],

    needs: [],
    open_loops: [],
    objections: [],
    commitments: [],
    signals: [],
    uncertainties: [],

    created_at:
      '2026-09-13T22:00:00-03:00',

    updated_at:
      '2026-09-13T22:00:00-03:00',
  }
}

function buildInput({
  previousState = null,
  targetVersion = 1,
} = {}) {
  return {
    diagnostic_input: {
      company_id:
        '11111111-1111-4111-8111-111111111111',

      cycle_id:
        'cycle-a',

      conversation_key:
        'conversation-a',

      reference_time:
        '2026-09-13T22:00:00-03:00',
    },

    state_context: {
      previous_state_version:
        previousState
          ?.version ??
        null,

      target_state_version:
        targetVersion,

      previous_state:
        previousState,
    },
  }
}

function buildModelRuntime({
  previousState = null,
  state = buildState(),
} = {}) {
  return {
    runtime_version:
      'commercial-reasoning-core-v2-runtime-v1',

    engine_source:
      'commercial_reasoning_core_v2',

    mode:
      'model',

    model_calls:
      1,

    input:
      buildInput({
        previousState,

        targetVersion:
          state.version,
      }),

    automatic_crm_write:
      false,

    automatic_agenda_write:
      false,

    persistence_mode:
      'not_executed',

    limitations:
      [],

    core_result: {
      output: {
        contract_version:
          'commercial-reasoning-core-v2',
      },

      execution: {
        mode:
          'model',

        provider:
          'openai',

        model:
          'test-model',

        request_id:
          'request-a',

        usage: {
          input_tokens:
            100,

          output_tokens:
            50,

          total_tokens:
            150,
        },

        attempts:
          1,

        recovered_after_retry:
          false,

        duration_ms:
          1000,
      },

      factual_guard: {
        adjusted:
          false,

        adjustment_codes:
          [],
      },
    },

    memory_reduction: {
      state,
    },

    commercial_reading: {
      reading: {
        contract_version:
          'commercial-reading-v1',
      },

      report: {
        writes_new_customer_memory:
          true,
      },
    },

    seller_projection: {
      engine_source:
        'commercial_reasoning_core_v2',

      seller_actionable:
        true,
    },
  }
}

function buildBlockedRuntime() {
  return {
    runtime_version:
      'commercial-reasoning-core-v2-runtime-v1',

    engine_source:
      'commercial_reasoning_core_v2',

    mode:
      'blocked',

    model_calls:
      0,

    input:
      buildInput(),

    automatic_crm_write:
      false,

    automatic_agenda_write:
      false,

    persistence_mode:
      'not_executed',

    limitations: [
      'Áudio pendente.',
    ],

    core_result:
      null,

    memory_reduction:
      null,

    commercial_reading:
      null,

    seller_projection:
      null,
  }
}

test(
  'plano V2 cria CAS atômico sem fabricar StatefulCopilotOutput',
  () => {
    const plan =
      buildCommercialReasoningCoreV2PersistencePlan({
        runtime_result:
          buildModelRuntime(),

        generated_at:
          '2026-09-13T22:00:01-03:00',
      })

    assert.equal(
      plan.mode,
      'model',
    )

    assert.equal(
      plan.should_persist,
      true,
    )

    assert.equal(
      plan
        .write_guard
        .requires_compare_and_swap,
      true,
    )

    assert.equal(
      plan
        .write_guard
        .requires_atomic_write,
      true,
    )

    assert.equal(
      plan
        .write_guard
        .expected_previous_state_version,
      null,
    )

    assert.equal(
      plan
        .write_guard
        .candidate_state_version,
      1,
    )

    assert.equal(
      plan
        .audit_event
        .normalized_output
        .contract_version,
      'commercial-reasoning-core-v2',
    )

    assert.equal(
      Object.prototype.hasOwnProperty.call(
        plan
          .audit_event
          .normalized_output,
        'previous_state_version',
      ),
      false,
    )

    assert.deepEqual(
      plan
        .audit_event
        .analyzed_message_ids,
      [
        'm1',
        'm2',
      ],
    )

    assert.deepEqual(
      plan
        .audit_event
        .evidence_message_ids,
      [
        'm2',
      ],
    )

    assert.deepEqual(
      plan
        .audit_event
        .memory_ids,
      [
        'memory-1',
      ],
    )

    assert.equal(
      plan
        .audit_event
        .execution
        .model_calls,
      1,
    )
  },
)

test(
  'plano V2 de continuação usa versão e horário anteriores no CAS',
  () => {
    const previousState =
      buildState({
        version:
          1,
      })

    previousState.updated_at =
      '2026-09-13T21:50:00-03:00'

    const candidateState =
      buildState({
        version:
          2,
      })

    const runtime =
      buildModelRuntime({
        previousState,

        state:
          candidateState,
      })

    const plan =
      buildCommercialReasoningCoreV2PersistencePlan({
        runtime_result:
          runtime,

        generated_at:
          '2026-09-13T22:00:01-03:00',
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
      '2026-09-13T21:50:00-03:00',
    )

    assert.equal(
      plan
        .write_guard
        .candidate_state_version,
      2,
    )
  },
)

test(
  'plano bloqueado não autoriza persistência',
  () => {
    const plan =
      buildCommercialReasoningCoreV2PersistencePlan({
        runtime_result:
          buildBlockedRuntime(),

        generated_at:
          '2026-09-13T22:00:01-03:00',
      })

    assert.equal(
      plan.mode,
      'blocked',
    )

    assert.equal(
      plan.should_persist,
      false,
    )

    assert.equal(
      plan.write_guard,
      null,
    )

    assert.deepEqual(
      plan.limitations,
      [
        'Áudio pendente.',
      ],
    )
  },
)

test(
  'plano V2 rejeita generated_at anterior à análise',
  () => {
    assert.throws(
      () =>
        buildCommercialReasoningCoreV2PersistencePlan({
          runtime_result:
            buildModelRuntime(),

          generated_at:
            '2026-09-13T21:59:59-03:00',
        }),

      error => {
        assert.equal(
          error.code,
          'PLAN_TIME_BEFORE_ANALYSIS',
        )

        return true
      },
    )
  },
)

test(
  'executor V2 pula plano bloqueado sem chamar writer',
  async () => {
    const plan =
      buildCommercialReasoningCoreV2PersistencePlan({
        runtime_result:
          buildBlockedRuntime(),

        generated_at:
          '2026-09-13T22:00:01-03:00',
      })

    let writerCalls =
      0

    const result =
      await executeCommercialReasoningCoreV2Persistence({
        plan,

        writer:
          async () => {
            writerCalls += 1

            throw new Error(
              'writer não deveria executar',
            )
          },
      })

    assert.equal(
      result.mode,
      'skipped',
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
  'executor V2 persiste em uma única chamada com operation key própria',
  async () => {
    const plan =
      buildCommercialReasoningCoreV2PersistencePlan({
        runtime_result:
          buildModelRuntime(),

        generated_at:
          '2026-09-13T22:00:01-03:00',
      })

    let receivedRequest =
      null

    const result =
      await executeCommercialReasoningCoreV2Persistence({
        plan,

        writer:
          async request => {
            receivedRequest =
              request

            return {
              status:
                'persisted',

              state_record_id:
                'state-record-a',

              audit_event_id:
                'audit-event-a',

              persisted_state_version:
                1,

              persisted_at:
                '2026-09-13T22:00:02-03:00',
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
      result.writer_calls,
      1,
    )

    assert.ok(
      result.operation_key.startsWith(
        'commercial-reasoning-core-v2:',
      ),
    )

    assert.equal(
      receivedRequest
        .plan
        .audit_event
        .normalized_output
        .contract_version,
      'commercial-reasoning-core-v2',
    )
  },
)

test(
  'executor V2 devolve conflito CAS sem transformar em persistência',
  async () => {
    const plan =
      buildCommercialReasoningCoreV2PersistencePlan({
        runtime_result:
          buildModelRuntime(),

        generated_at:
          '2026-09-13T22:00:01-03:00',
      })

    const result =
      await executeCommercialReasoningCoreV2Persistence({
        plan,

        writer:
          async () => ({
            status:
              'conflict',

            current_state_version:
              2,

            current_state_updated_at:
              '2026-09-13T22:00:03-03:00',
          }),
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
      2,
    )
  },
)

test(
  'executor V2 rejeita confirmação de versão diferente do candidate state',
  async () => {
    const plan =
      buildCommercialReasoningCoreV2PersistencePlan({
        runtime_result:
          buildModelRuntime(),

        generated_at:
          '2026-09-13T22:00:01-03:00',
      })

    await assert.rejects(
      () =>
        executeCommercialReasoningCoreV2Persistence({
          plan,

          writer:
            async () => ({
              status:
                'persisted',

              state_record_id:
                'state-record-a',

              audit_event_id:
                'audit-event-a',

              persisted_state_version:
                2,

              persisted_at:
                '2026-09-13T22:00:02-03:00',
            }),
        }),

      error => {
        assert.ok(
          error instanceof
          CommercialReasoningCoreV2PersistenceExecutionError,
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
