import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COMPANION_DIAGNOSTIC_CONTRACT_VERSION,
} from './diagnostic-contract.ts'

import {
  STATEFUL_COPILOT_CONTRACT_VERSION,
} from './stateful-copilot-contract.ts'

import {
  STATEFUL_COPILOT_INPUT_VERSION,
} from './stateful-copilot-input.ts'

import {
  buildStatefulCopilotExecutionPlan,
} from './stateful-copilot-execution-plan.ts'

import {
  STATEFUL_COPILOT_JSON_SCHEMA,
  STATEFUL_COPILOT_DIAGNOSTIC_JSON_SCHEMA,
} from './stateful-copilot-json-schema.ts'

test(
  '12A contrato final preserva strategy completa',
  () => {
    const strategy =
      STATEFUL_COPILOT_JSON_SCHEMA
        .properties
        .strategy
        .properties

    assert.equal(
      strategy
        .method_application
        .type,
      'string',
    )

    assert.equal(
      strategy
        .recommended_question
        .anyOf
        .some(
          item =>
            item.type ===
            'string',
        ),
      true,
    )
  },
)

test(
  '12A chamada diagnóstica adia conteúdo textual de strategy',
  () => {
    const strategy =
      STATEFUL_COPILOT_DIAGNOSTIC_JSON_SCHEMA
        .properties
        .strategy
        .properties

    assert.deepEqual(
      strategy
        .method_application
        .enum,
      [
        'deferred_to_communication',
      ],
    )

    assert.deepEqual(
      strategy.rationale.enum,
      [
        'deferred_to_communication',
      ],
    )

    assert.deepEqual(
      strategy.next_move.enum,
      [
        'deferred_to_communication',
      ],
    )

    assert.equal(
      strategy
        .recommended_question
        .type,
      'null',
    )

    assert.equal(
      strategy
        .suggested_message
        .type,
      'null',
    )
  },
)

test(
  '12A strategy diagnóstica exige evidência atual e aceita memória complementar',
  () => {
    const strategy =
      STATEFUL_COPILOT_DIAGNOSTIC_JSON_SCHEMA
        .properties
        .strategy
        .properties

    assert.equal(
      strategy
        .evidence_message_ids
        .minItems,
      1,
    )

    assert.equal(
      strategy
        .memory_ids
        .minItems,
      undefined,
    )
  },
)

test(
  '12A diagnóstico não recebe método tom ou coaching redundantes',
  () => {
    const input = {
      input_version:
        STATEFUL_COPILOT_INPUT_VERSION,

      output_contract_version:
        STATEFUL_COPILOT_CONTRACT_VERSION,

      diagnostic_input: {
        input_version:
          'phase-5-input-v1',

        diagnostic_contract_version:
          COMPANION_DIAGNOSTIC_CONTRACT_VERSION,

        company_id:
          'company-1',

        cycle_id:
          'cycle-1',

        conversation_key:
          'conversation-1',

        current_crm_status:
          'respondeu',

        reference_time:
          '2026-08-22T15:00:00-03:00',

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
                '2026-08-22T14:59:00-03:00',

              observed_at:
                '2026-08-22T14:59:01-03:00',

              content_type:
                'text',

              text_content:
                'Minha dúvida é se isso ajuda a equipe a fazer mais follow-up.',

              audio_transcription:
                null,
            },
          ],

          excluded_messages: [],
        },

        commercial_context: {
          configured:
            true,

          config_version_id:
            'config-1',

          config_version_number:
            1,

          config_contract_version:
            'commercial-config-v1',

          business_description:
            'Software comercial.',

          target_audience:
            'Empresas com equipes comerciais.',

          value_proposition:
            'Melhorar execução comercial.',

          communication_tone:
            'Consultivo.',

          required_behaviors: [
            'Responder com clareza.',
          ],

          prohibited_behaviors: [
            'Pressionar.',
          ],

          sales_method: {
            configured:
              true,

            contract_version:
              null,

            name:
              'Venda consultiva',

            description:
              'Compreender antes de recomendar.',

            principles: [],

            definition:
              null,

            steps: [],
          },

          products: [],
          facts: [],
          objection_guides: [],
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

    const plan =
      buildStatefulCopilotExecutionPlan(
        input,
      )

    assert.equal(
      plan.mode,
      'model',
    )

    const payload =
      JSON.parse(
        plan.request.user_prompt,
      )

    const context =
      payload
        .input
        .diagnostic_input
        .commercial_context

    assert.equal(
      context.sales_method,
      undefined,
    )

    assert.equal(
      context.communication_tone,
      undefined,
    )

    assert.equal(
      context.required_behaviors,
      undefined,
    )

    assert.equal(
      context.prohibited_behaviors,
      undefined,
    )

    assert.equal(
      context.business_description,
      'Software comercial.',
    )

    assert.deepEqual(
      context.products,
      [],
    )
  },
)
