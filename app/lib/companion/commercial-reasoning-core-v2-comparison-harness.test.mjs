import assert from 'node:assert/strict'
import test from 'node:test'

import {
  runCommercialReasoningCoreV2Comparison,
} from './commercial-reasoning-core-v2-comparison-harness.ts'

function buildDiagnosticInput() {
  return {
    input_version:
      'phase-5-input-v1',
    diagnostic_contract_version:
      'phase-4-diagnostic-v3',
    company_id:
      'company-a',
    cycle_id:
      'cycle-a',
    conversation_key:
      'conversation-a',
    current_crm_status:
      null,
    reference_time:
      '2026-09-13T19:30:00-03:00',
    analysis_precondition: {
      status:
        'ready',
      limitations: [],
    },
    conversation: {
      active_message_ids: [
        'm1',
      ],
      excluded_message_ids: [],
      messages: [
        {
          id:
            'm1',
          message_key:
            'message-1',
          version:
            1,
          sequence:
            1,
          direction:
            'incoming',
          occurred_at:
            '2026-09-13T19:29:00-03:00',
          observed_at:
            '2026-09-13T19:29:01-03:00',
          content_type:
            'text',
          text_content:
            'Quero agendar para sexta às 18h.',
          audio_transcription:
            null,
        },
      ],
      excluded_messages: [],
    },
    commercial_context: {
      configured:
        false,
      config_version_id:
        null,
      config_version_number:
        null,
      config_contract_version:
        null,
      business_description:
        null,
      target_audience:
        null,
      value_proposition:
        null,
      communication_tone:
        null,
      required_behaviors: [],
      prohibited_behaviors: [],
      sales_method: {
        configured:
          false,
        contract_version:
          null,
        name:
          null,
        description:
          null,
        principles: [],
        definition:
          null,
        steps: [],
      },
      products: [],
      facts: [],
      objection_guides: [],
    },
  }
}

test(
  'harness compara motor legado e Core V2 sobre a mesma fotografia sem persistência',
  async () => {
    const times = [
      100,
      260,
      300,
      340,
    ]

    const legacyResult = {
      mode:
        'model',
      execution: {
        attempts:
          1,
      },
      communication_execution: {
        attempts:
          2,
      },
    }

    const v2Result = {
      execution: {
        attempts:
          1,
      },
      factual_guard: {
        adjusted:
          true,
        adjustment_codes: [
          'METHOD_NOT_CONFIGURED',
        ],
      },
    }

    let legacyCalls = 0
    let v2Calls = 0

    const result =
      await runCommercialReasoningCoreV2Comparison({
        diagnostic_input:
          buildDiagnosticInput(),
        previous_state:
          null,
        known_message_ids: [
          'm1',
        ],
        provider:
          async () => {
            throw new Error(
              'provider não deve ser chamado pelos mocks do teste',
            )
          },
        create_memory_id:
          () => 'memory-a',
        dependencies: {
          now:
            () => times.shift(),
          run_legacy_engine:
            async ({ diagnostic_input }) => {
              legacyCalls += 1
              assert.equal(
                diagnostic_input
                  .conversation_key,
                'conversation-a',
              )
              return legacyResult
            },
          run_v2:
            async ({ input }) => {
              v2Calls += 1
              assert.equal(
                input
                  .diagnostic_input
                  .conversation_key,
                'conversation-a',
              )
              assert.equal(
                input
                  .diagnostic_input
                  .conversation
                  .messages[0]
                  .id,
                'm1',
              )
              return v2Result
            },
        },
      })

    assert.equal(
      legacyCalls,
      1,
    )
    assert.equal(
      v2Calls,
      1,
    )
    assert.equal(
      result.legacy.duration_ms,
      160,
    )
    assert.equal(
      result.v2.duration_ms,
      40,
    )
    assert.equal(
      result.legacy.total_model_attempts,
      3,
    )
    assert.equal(
      result.v2.attempts,
      1,
    )
    assert.equal(
      result.delta.model_attempts,
      -2,
    )
    assert.equal(
      result.delta.duration_ms,
      -120,
    )
    assert.deepEqual(
      result.v2
        .factual_guard_adjustment_codes,
      [
        'METHOD_NOT_CONFIGURED',
      ],
    )
  },
)
