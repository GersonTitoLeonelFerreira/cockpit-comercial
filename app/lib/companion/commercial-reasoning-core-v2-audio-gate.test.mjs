import assert from 'node:assert/strict'
import test from 'node:test'

import {
  runCommercialReasoningCoreV2Runtime,
} from './commercial-reasoning-core-v2-runtime.ts'

function inputWithAudio(
  audioTranscription,
) {
  return {
    input_version:
      'phase-5.1-stateful-input-v1',

    output_contract_version:
      'phase-5.1-stateful-v3',

    diagnostic_input: {
      cycle_id:
        'cycle-a',

      reference_time:
        '2026-09-14T03:30:00.000Z',

      analysis_precondition: {
        status:
          audioTranscription
            ? 'ready'
            : 'limited',

        limitations:
          audioTranscription
            ? []
            : [
                'audio_without_transcription',
              ],
      },

      conversation: {
        active_message_ids: [
          'audio-1',
        ],

        excluded_message_ids: [],

        messages: [
          {
            id:
              'audio-1',
            content_type:
              'audio',
            audio_transcription:
              audioTranscription,
          },
        ],

        excluded_messages: [],
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

function runtimeArgs(
  input,
  calls,
) {
  return {
    diagnostic_input: {
      marker:
        'diagnostic',
    },

    previous_state:
      null,

    known_message_ids: [],

    provider: {
      complete:
        async () => {
          throw new Error(
            'provider não deveria ser chamado diretamente pelo runtime',
          )
        },
    },

    create_memory_id:
      () =>
        'memory-test',

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

          return {
            output: {
              commercial_role:
                'buyer',
              commercial_relevance:
                'commercial',
            },
          }
        },

      reduce_memory:
        () => {
          calls.push(
            'reduce_memory',
          )

          return {
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
        },

      build_commercial_reading:
        () => {
          calls.push(
            'build_commercial_reading',
          )

          return {
            reading: {
              contract_version:
                'commercial-reading-v1',
            },
            report: {},
          }
        },

      build_seller_projection:
        () => {
          calls.push(
            'build_seller_projection',
          )

          return {
            engine_source:
              'commercial_reasoning_core_v2',
          }
        },
    },
  }
}

test(
  'áudio ativo sem transcrição bloqueia antes da única chamada principal',
  async () => {
    const calls = []

    const result =
      await runCommercialReasoningCoreV2Runtime(
        runtimeArgs(
          inputWithAudio(null),
          calls,
        ),
      )

    assert.equal(
      result.mode,
      'blocked',
    )

    assert.equal(
      result.model_calls,
      0,
    )

    assert.deepEqual(
      calls,
      [
        'build_input',
      ],
    )

    assert.ok(
      result.limitations.includes(
        'audio_without_transcription',
      ),
    )
  },
)

test(
  'mesmo áudio passa pelo Core quando a transcrição está disponível',
  async () => {
    const calls = []

    const result =
      await runCommercialReasoningCoreV2Runtime(
        runtimeArgs(
          inputWithAudio(
            'Quero confirmar o plano e o horário.',
          ),
          calls,
        ),
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
