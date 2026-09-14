import assert from 'node:assert/strict'
import test from 'node:test'

import {
  runCommercialReasoningCoreV2PersistedRuntime,
} from './commercial-reasoning-core-v2-persisted-runtime.ts'

function buildRuntimeArgs() {
  return {
    diagnostic_input: {
      marker:
        'diagnostic',
    },

    previous_state:
      null,

    known_message_ids:
      [
        'm1',
      ],

    provider:
      async () => {
        throw new Error(
          'provider não deve ser chamado pelo stub do runtime',
        )
      },

    create_memory_id:
      () =>
        'memory-test',
  }
}

test(
  'persisted runtime encadeia runtime, plano e persistência sem criar segunda análise',
  async () => {
    const calls =
      []

    const runtimeResult = {
      mode:
        'model',

      model_calls:
        1,
    }

    const persistencePlan = {
      mode:
        'model',

      should_persist:
        true,
    }

    const persistenceResult = {
      mode:
        'persisted',

      persisted:
        true,

      operation_key:
        'operation-test',

      writer_calls:
        1,

      state_record_id:
        'state-test',

      audit_event_id:
        'audit-test',

      persisted_state_version:
        1,

      persisted_at:
        '2026-09-14T02:00:01.000Z',
    }

    const writer =
      async () => {
        throw new Error(
          'writer real não deve ser chamado pelo executor stub',
        )
      }

    const runtimeArgs =
      buildRuntimeArgs()

    const result =
      await runCommercialReasoningCoreV2PersistedRuntime({
        runtime_args:
          runtimeArgs,

        persistence_writer:
          writer,

        generated_at:
          '2026-09-14T02:00:00.000Z',

        dependencies: {
          run_runtime:
            async receivedArgs => {
              calls.push(
                'run_runtime',
              )

              assert.equal(
                receivedArgs,
                runtimeArgs,
              )

              return runtimeResult
            },

          build_persistence_plan:
            args => {
              calls.push(
                'build_persistence_plan',
              )

              assert.equal(
                args.runtime_result,
                runtimeResult,
              )

              assert.equal(
                args.generated_at,
                '2026-09-14T02:00:00.000Z',
              )

              return persistencePlan
            },

          execute_persistence:
            async args => {
              calls.push(
                'execute_persistence',
              )

              assert.equal(
                args.plan,
                persistencePlan,
              )

              assert.equal(
                args.writer,
                writer,
              )

              return persistenceResult
            },
        },
      })

    assert.equal(
      result.runtime_version,
      'commercial-reasoning-core-v2-persisted-runtime-v1',
    )

    assert.equal(
      result.engine_source,
      'commercial_reasoning_core_v2',
    )

    assert.equal(
      result.mode,
      'model',
    )

    assert.equal(
      result.model_calls,
      1,
    )

    assert.equal(
      result.runtime_result,
      runtimeResult,
    )

    assert.equal(
      result.persistence_plan,
      persistencePlan,
    )

    assert.equal(
      result.persistence_result,
      persistenceResult,
    )

    assert.equal(
      result.persistence_mode,
      'persisted',
    )

    assert.equal(
      result.persisted,
      true,
    )

    assert.equal(
      result.automatic_crm_write,
      false,
    )

    assert.equal(
      result.automatic_agenda_write,
      false,
    )

    assert.deepEqual(
      calls,
      [
        'run_runtime',
        'build_persistence_plan',
        'execute_persistence',
      ],
    )
  },
)

test(
  'persisted runtime bloqueado preserva zero model calls e não chama writer',
  async () => {
    const runtimeResult = {
      mode:
        'blocked',

      model_calls:
        0,
    }

    const persistencePlan = {
      plan_version:
        'commercial-reasoning-core-v2-persistence-plan-v1',

      mode:
        'blocked',

      should_persist:
        false,

      generated_at:
        '2026-09-14T02:00:00.000Z',

      company_id:
        'company-test',

      cycle_id:
        'cycle-test',

      conversation_key:
        'conversation-test',

      expected_previous_state_version:
        null,

      limitations: [
        'Áudio pendente de transcrição.',
      ],

      write_guard:
        null,

      state_snapshot:
        null,

      audit_event:
        null,
    }

    let writerCalls =
      0

    const result =
      await runCommercialReasoningCoreV2PersistedRuntime({
        runtime_args:
          buildRuntimeArgs(),

        persistence_writer:
          async () => {
            writerCalls += 1

            throw new Error(
              'writer não deveria executar para plano bloqueado',
            )
          },

        generated_at:
          '2026-09-14T02:00:00.000Z',

        dependencies: {
          run_runtime:
            async () =>
              runtimeResult,

          build_persistence_plan:
            () =>
              persistencePlan,
        },
      })

    assert.equal(
      result.mode,
      'blocked',
    )

    assert.equal(
      result.model_calls,
      0,
    )

    assert.equal(
      result.persistence_mode,
      'skipped',
    )

    assert.equal(
      result.persisted,
      false,
    )

    assert.equal(
      result.persistence_result.writer_calls,
      0,
    )

    assert.deepEqual(
      result.persistence_result.limitations,
      [
        'Áudio pendente de transcrição.',
      ],
    )

    assert.equal(
      writerCalls,
      0,
    )
  },
)
