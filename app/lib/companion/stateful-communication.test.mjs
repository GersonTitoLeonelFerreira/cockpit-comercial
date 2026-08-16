import assert from 'node:assert/strict'
import test from 'node:test'

import {
  STATEFUL_COPILOT_CONTRACT_VERSION,
} from './stateful-copilot-contract.ts'

import {
  STATEFUL_COMMUNICATION_CONTRACT_VERSION,
} from './stateful-communication-contract.ts'

import {
  STATEFUL_COMMUNICATION_PROMPT_VERSION,
  buildStatefulCommunicationExecutionPlan,
} from './stateful-communication-execution-plan.ts'

import {
  StatefulCommunicationExecutionError,
  executeStatefulCommunicationPlan,
} from './stateful-communication-executor.ts'

import {
  STATEFUL_COMMUNICATION_STRUCTURED_OUTPUT_FORMAT,
} from './stateful-communication-json-schema.ts'

function buildDiagnosticOutput({
  commercialRole = 'buyer',
} = {}) {
  return {
    contract_version:
      STATEFUL_COPILOT_CONTRACT_VERSION,

    previous_state_version:
      null,

    analyzed_message_ids: [
      'm2',
    ],

    commercial_role:
      commercialRole,

    interpretation: {
      what_changed: {
        summary:
          'O cliente pediu para saber quem deveria retomar o contato.',

        evidence_message_ids: [
          'm2',
        ],
      },

      what_remains_valid: [],

      current_moment: {
        summary:
          'A conversa precisa esclarecer a responsabilidade pela retomada.',

        evidence_message_ids: [
          'm2',
        ],

        memory_ids: [],
      },

      customer_need:
        null,

      uncertainties: [],
    },

    state_patch: {},

    strategy: {
      method_application:
        'Estratégia antiga que não deve alimentar a camada de comunicação.',

      rationale:
        'Racional antigo.',

      next_move:
        'Perguntar funcionalidades.',

      recommended_question:
        'Quais funcionalidades você procura?',

      suggested_message:
        'Quais funcionalidades você procura?',

      evidence_message_ids: [
        'm2',
      ],

      memory_ids: [],
    },

    operational_suggestions: {
      crm: {
        should_change_crm_stage:
          false,
      },

      agenda: {
        should_change_agenda:
          false,
      },
    },

    evidence_message_ids: [
      'm2',
    ],

    memory_ids: [],
  }
}

function buildInput() {
  return {
    diagnostic_input: {
      conversation: {
        messages: [
          {
            id:
              'm1',

            direction:
              'outgoing',

            occurred_at:
              '2026-08-06T14:00:00-03:00',

            observed_at:
              '2026-08-06T14:00:01-03:00',

            content_type:
              'text',

            text_content:
              'Posso retomar com você amanhã.',

            audio_transcription:
              null,
          },
          {
            id:
              'm2',

            direction:
              'incoming',

            occurred_at:
              '2026-08-06T15:00:00-03:00',

            observed_at:
              '2026-08-06T15:00:01-03:00',

            content_type:
              'text',

            text_content:
              'Saber quem deveria retomar',

            audio_transcription:
              null,
          },
        ],
      },

      commercial_context: {
        communication_tone:
          'natural e objetivo',

        sales_method: {
          configured:
            true,

          name:
            'SPIN',
        },

        products: [],
      },
    },
  }
}

function buildPlan({
  commercialRole = 'buyer',
} = {}) {
  return buildStatefulCommunicationExecutionPlan({
    input:
      buildInput(),

    diagnostic_output:
      buildDiagnosticOutput({
        commercialRole,
      }),
  })
}

function buildCommunicationOutput({
  interventionNeeded = true,
  recommendedQuestion =
    'Você prefere que eu retome o contato ou que outra pessoa fale com você?',
  suggestedMessage =
    'Claro. Você prefere que eu retome o contato ou que outra pessoa fale com você?',
} = {}) {
  return {
    contract_version:
      STATEFUL_COMMUNICATION_CONTRACT_VERSION,

    intervention_needed:
      interventionNeeded,

    method_application:
      'Usei o contexto para esclarecer o próximo passo sem abrir uma investigação nova.',

    guidance:
      'Responda diretamente à dúvida sobre a retomada e deixe a responsabilidade clara.',

    recommended_question:
      recommendedQuestion,

    suggested_message:
      suggestedMessage,
  }
}

function createProvider(
  outputs,
  calls = [],
) {
  const queue = [
    ...outputs,
  ]

  return {
    calls,

    provider:
      async request => {
        calls.push(
          structuredClone(
            request,
          ),
        )

        const output =
          queue.shift()

        return {
          content:
            typeof output === 'string'
              ? output
              : JSON.stringify(output),

          provider:
            'test-provider',

          model:
            'test-model',

          request_id:
            `request-${calls.length}`,

          usage: {
            input_tokens: 30,
            output_tokens: 20,
            total_tokens: 50,
          },
        }
      },
  }
}

test(
  'plano usa diagnóstico validado e não encaminha a estratégia antiga',
  () => {
    const plan =
      buildPlan()

    const payload =
      JSON.parse(
        plan.user_prompt,
      )

    assert.equal(
      plan.prompt_version,
      STATEFUL_COMMUNICATION_PROMPT_VERSION,
    )

    assert.equal(
      STATEFUL_COMMUNICATION_PROMPT_VERSION,
      'phase-5.2-communication-prompt-v2',
    )

    assert.match(
      plan.system_prompt,
      /revise silenciosamente o texto em português do Brasil/,
    )

    assert.equal(
      payload
        .diagnostic_context
        .commercial_role,
      'buyer',
    )

    assert.equal(
      payload
        .diagnostic_context
        .strategy,
      undefined,
    )

    assert.equal(
      payload
        .conversation
        .current_messages[0]
        .id,
      'm2',
    )

    assert.equal(
      payload
        .conversation
        .context_bridge_messages[0]
        .id,
      undefined,
    )

    assert.equal(
      payload
        .commercial_context
        .sales_method
        .name,
      'SPIN',
    )
  },
)

test(
  'executor normaliza uma intervenção e envia o schema próprio',
  async () => {
    const provider =
      createProvider([
        buildCommunicationOutput(),
      ])

    const result =
      await executeStatefulCommunicationPlan({
        plan:
          buildPlan(),

        provider:
          provider.provider,
      })

    assert.equal(
      result
        .output
        .suggested_message,
      'Claro. Você prefere que eu retome o contato ou que outra pessoa fale com você?',
    )

    assert.equal(
      result
        .execution
        .attempts,
      1,
    )

    assert.deepEqual(
      provider
        .calls[0]
        .structured_output_format,
      STATEFUL_COMMUNICATION_STRUCTURED_OUTPUT_FORMAT,
    )
  },
)

test(
  'executor aceita silêncio explícito sem pergunta nem mensagem',
  async () => {
    const provider =
      createProvider([
        buildCommunicationOutput({
          interventionNeeded:
            false,

          recommendedQuestion:
            null,

          suggestedMessage:
            null,
        }),
      ])

    const result =
      await executeStatefulCommunicationPlan({
        plan:
          buildPlan(),

        provider:
          provider.provider,
      })

    assert.equal(
      result
        .output
        .intervention_needed,
      false,
    )

    assert.equal(
      result
        .output
        .suggested_message,
      null,
    )
  },
)

test(
  'executor repete uma vez quando a primeira saída é inválida',
  async () => {
    const provider =
      createProvider([
        'não é json',
        buildCommunicationOutput(),
      ])

    const result =
      await executeStatefulCommunicationPlan({
        plan:
          buildPlan(),

        provider:
          provider.provider,
      })

    assert.equal(
      result
        .execution
        .attempts,
      2,
    )

    assert.equal(
      result
        .execution
        .recovered_after_retry,
      true,
    )
  },
)

test(
  'executor bloqueia intervenção de venda para papel não comprador',
  async () => {
    const provider =
      createProvider([
        buildCommunicationOutput(),
        buildCommunicationOutput(),
      ])

    await assert.rejects(
      () =>
        executeStatefulCommunicationPlan({
          plan:
            buildPlan({
              commercialRole:
                'supplier',
            }),

          provider:
            provider.provider,
        }),
      error => {
        assert.ok(
          error instanceof
            StatefulCommunicationExecutionError,
        )

        assert.equal(
          error.code,
          'INVALID_COMMUNICATION_OUTPUT',
        )

        return true
      },
    )

    assert.equal(
      provider.calls.length,
      2,
    )
  },
)
