import assert from 'node:assert/strict'
import test from 'node:test'

import {
  runCommercialReasoningCoreV2Runtime,
} from './commercial-reasoning-core-v2-runtime.ts'

function buildInput({
  status = 'ready',
  limitations = [],
} = {}) {
  return {
    input_version:
      'phase-5.1-stateful-input-v1',

    output_contract_version:
      'phase-5.1-stateful-v3',

    diagnostic_input: {
      cycle_id:
        'cycle-a',

      reference_time:
        '2026-09-13T22:00:00-03:00',

      analysis_precondition: {
        status,
        limitations,
      },
    },

    state_context: {
      mode:
        'initial',

      previous_state_version:
        null,

      target_state_version:
        1,

      previous_state:
        null,
    },
  }
}

function buildDependencies({
  input =
    buildInput(),
  calls =
    [],
} = {}) {
  const output = {
    commercial_role:
      'buyer',

    commercial_relevance:
      'commercial',
  }

  const coreResult = {
    output,

    execution: {
      attempts:
        1,
    },

    factual_guard: {
      adjusted:
        false,

      adjustment_codes:
        [],
    },
  }

  const memoryReduction = {
    state: {
      cycle_id:
        'cycle-a',

      version:
        1,
    },

    applied_patch: {},

    durable_memory_seed_applied:
      false,
  }

  const commercialReading = {
    reading: {
      contract_version:
        'commercial-reading-v1',
    },

    report: {
      writes_new_customer_memory:
        false,
    },
  }

  const sellerProjection = {
    engine_source:
      'commercial_reasoning_core_v2',

    seller_actionable:
      true,
  }

  return {
    output,
    coreResult,
    memoryReduction,
    commercialReading,
    sellerProjection,

    dependencies: {
      build_input:
        args => {
          calls.push(
            'build_input',
          )

          assert.equal(
            args
              .diagnostic_input
              .marker,
            'diagnostic',
          )

          return input
        },

      run_core:
        async args => {
          calls.push(
            'run_core',
          )

          assert.equal(
            args.input,
            input,
          )

          assert.equal(
            args
              .durable_memory_seed
              .source_cycle_id,
            'cycle-prior',
          )

          return coreResult
        },

      reduce_memory:
        args => {
          calls.push(
            'reduce_memory',
          )

          assert.equal(
            args.output,
            output,
          )

          assert.equal(
            args.applied_at,
            '2026-09-13T22:00:00-03:00',
          )

          assert.equal(
            args
              .durable_memory_seed
              .source_cycle_id,
            'cycle-prior',
          )

          return memoryReduction
        },

      build_commercial_reading:
        args => {
          calls.push(
            'build_commercial_reading',
          )

          assert.equal(
            args.memory_reduction,
            memoryReduction,
          )

          return commercialReading
        },

      build_seller_projection:
        receivedOutput => {
          calls.push(
            'build_seller_projection',
          )

          assert.equal(
            receivedOutput,
            output,
          )

          return sellerProjection
        },
    },
  }
}

function runtimeArgs({
  dependencies,
} = {}) {
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
          'provider real não deve ser chamado pelos stubs deste teste',
        )
      },

    create_memory_id:
      () =>
        'memory-test',

    durable_memory_seed: {
      source_cycle_id:
        'cycle-prior',

      facts:
        [],

      objections:
        [],
    },

    dependencies,
  }
}

test(
  'runtime V2 executa uma única cadeia determinística após a chamada principal',
  async () => {
    const calls =
      []

    const fixture =
      buildDependencies({
        calls,
      })

    const result =
      await runCommercialReasoningCoreV2Runtime(
        runtimeArgs({
          dependencies:
            fixture
              .dependencies,
        }),
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
      result.persistence_mode,
      'not_executed',
    )

    assert.equal(
      result.automatic_crm_write,
      false,
    )

    assert.equal(
      result.automatic_agenda_write,
      false,
    )

    assert.equal(
      result.core_result,
      fixture.coreResult,
    )

    assert.equal(
      result.memory_reduction,
      fixture.memoryReduction,
    )

    assert.equal(
      result.commercial_reading,
      fixture.commercialReading,
    )

    assert.equal(
      result.seller_projection,
      fixture.sellerProjection,
    )

    assert.deepEqual(
      calls,
      [
        'build_input',
        'run_core',
        'reduce_memory',
        'build_commercial_reading',
        'build_seller_projection',
      ],
    )
  },
)

test(
  'runtime V2 bloqueado não chama modelo nem cria candidate state',
  async () => {
    const calls =
      []

    const input =
      buildInput({
        status:
          'blocked',

        limitations: [
          'Áudio pendente de transcrição.',
        ],
      })

    const result =
      await runCommercialReasoningCoreV2Runtime(
        runtimeArgs({
          dependencies: {
            build_input:
              () => {
                calls.push(
                  'build_input',
                )

                return input
              },

            run_core:
              async () => {
                calls.push(
                  'run_core',
                )

                throw new Error(
                  'run_core não deveria executar',
                )
              },
          },
        }),
      )

    assert.equal(
      result.mode,
      'blocked',
    )

    assert.equal(
      result.model_calls,
      0,
    )

    assert.equal(
      result.core_result,
      null,
    )

    assert.equal(
      result.memory_reduction,
      null,
    )

    assert.deepEqual(
      result.limitations,
      [
        'Áudio pendente de transcrição.',
      ],
    )

    assert.deepEqual(
      calls,
      [
        'build_input',
      ],
    )
  },
)

test(
  'runtime V2 limited continua executando a única análise principal',
  async () => {
    const calls =
      []

    const input =
      buildInput({
        status:
          'limited',

        limitations: [
          'Contexto comercial parcial.',
        ],
      })

    const fixture =
      buildDependencies({
        input,
        calls,
      })

    const result =
      await runCommercialReasoningCoreV2Runtime(
        runtimeArgs({
          dependencies:
            fixture
              .dependencies,
        }),
      )

    assert.equal(
      result.mode,
      'model',
    )

    assert.equal(
      result.model_calls,
      1,
    )

    assert.deepEqual(
      result.limitations,
      [
        'Contexto comercial parcial.',
      ],
    )

    assert.equal(
      calls.filter(
        item =>
          item ===
          'run_core',
      ).length,
      1,
    )
  },
)
