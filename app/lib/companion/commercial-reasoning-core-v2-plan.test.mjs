import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCommercialReasoningCoreV2ExecutionPlan,
} from './commercial-reasoning-core-v2-execution-plan.ts'

function buildInput() {
  return {
    input_version:
      'phase-5.1-stateful-input-v1',
    output_contract_version:
      'phase-5.1-stateful-v3',
    diagnostic_input: {
      input_version:
        'phase-4-input-v3',
      diagnostic_contract_version:
        'phase-4-diagnostic-v3',
      company_id:
        'company-a',
      cycle_id:
        'cycle-a',
      conversation_key:
        'conversation-a',
      current_crm_status:
        'negociacao',
      reference_time:
        '2026-09-13T18:00:00-03:00',
      analysis_precondition: {
        status:
          'ready',
        limitations: [],
      },
      conversation: {
        active_message_ids: [
          'm1',
          'm2',
        ],
        excluded_message_ids: [],
        messages: [
          {
            id:
              'm1',
            direction:
              'incoming',
            occurred_at:
              '2026-09-13T17:50:00-03:00',
            observed_at:
              '2026-09-13T17:50:01-03:00',
            content_type:
              'text',
            text_content:
              'Quero agendar sexta às 18h para duas pessoas.',
            audio_transcription:
              null,
          },
          {
            id:
              'm2',
            direction:
              'outgoing',
            occurred_at:
              '2026-09-13T17:55:00-03:00',
            observed_at:
              '2026-09-13T17:55:01-03:00',
            content_type:
              'text',
            text_content:
              'Como posso ajudar?',
            audio_transcription:
              null,
          },
        ],
        excluded_messages: [],
      },
      commercial_context: {
        products: [],
        communication_tone:
          null,
        required_behaviors: [],
        prohibited_behaviors: [],
        sales_method: {
          configured:
            false,
          name:
            null,
          stages: [],
        },
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

test(
  'plano V2 envia a fotografia canônica completa em uma única tarefa de raciocínio',
  () => {
    const plan =
      buildCommercialReasoningCoreV2ExecutionPlan({
        input:
          buildInput(),
      })

    const payload =
      JSON.parse(
        plan.user_prompt,
      )

    assert.equal(
      payload.invariants
        .single_reasoning_pass,
      true,
    )

    assert.equal(
      payload.invariants
        .coaching_is_priority,
      true,
    )

    assert.equal(
      payload.invariants
        .compact_output,
      true,
    )

    assert.equal(
      payload.invariants
        .memory_continuity_same_reasoning_pass,
      true,
    )

    assert.deepEqual(
      payload.output_budget,
      {
        strengths_max:
          2,
        improvement_points_max:
          3,
        facts_used_max:
          5,
        memory_facts_to_add_max:
          6,
        memory_items_to_add_per_collection_max:
          4,
        memory_commitments_to_upsert_max:
          4,
        unknowns_max:
          5,
        do_not_do_max:
          4,
        suggested_message_max_characters:
          480,
        avoid_repeated_reasoning:
          true,
      },
    )

    assert.equal(
      plan.prompt_version,
      'commercial-reasoning-core-v2-prompt-v4',
    )

    assert.ok(
      plan.system_prompt.includes(
        'Não converta referências relativas como sexta-feira',
      ),
    )

    assert.equal(
      payload.canonical_snapshot
        .diagnostic_input
        .conversation
        .messages.length,
      2,
    )

    assert.equal(
      payload.canonical_snapshot
        .diagnostic_input
        .conversation
        .messages[1]
        .text_content,
      'Como posso ajudar?',
    )

    assert.equal(
      Object.prototype.hasOwnProperty.call(
        payload,
        'repair_context',
      ),
      false,
    )
  },
)
