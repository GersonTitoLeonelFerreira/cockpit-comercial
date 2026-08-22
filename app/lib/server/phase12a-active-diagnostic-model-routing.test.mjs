import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PHASE12A_ACTIVE_COMMUNICATION_MODEL,
  PHASE12A_ACTIVE_DIAGNOSTIC_MODEL,
  PHASE12A_ACTIVE_DIAGNOSTIC_REASONING_EFFORT,
  createStatefulCopilotServerRuntimeOrchestrator,
} from './stateful-copilot-runtime-orchestrator.ts'

const companyId =
  '10000000-0000-4000-8000-000000000001'

const cycleId =
  '20000000-0000-4000-8000-000000000001'

const deviceKey =
  '30000000-0000-4000-8000-000000000001'

const conversationKey =
  'whatsapp:+5547999990001'

const referenceTime =
  '2026-08-22T18:00:00.000Z'

function withEnvironment(
  values,
  callback,
) {
  const previous =
    new Map(
      Object.keys(values)
        .map(
          key => [
            key,
            process.env[key],
          ],
        ),
    )

  try {
    for (
      const [key, value]
      of Object.entries(values)
    ) {
      if (value === null) {
        delete process.env[key]
      } else {
        process.env[key] =
          value
      }
    }

    return callback()
  } finally {
    for (
      const [key, value]
      of previous
    ) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] =
          value
      }
    }
  }
}

function createRoutingHarness({
  mode,
  compositionOptions,
}) {
  let receivedCompositionOptions =
    Symbol('not-created')

  const orchestrator =
    createStatefulCopilotServerRuntimeOrchestrator({
      configured_mode:
        mode,

      configured_company_ids:
        companyId,

      configured_engine_version:
        'v2',

      composition_options:
        compositionOptions,

      dependencies: {
        create_context_loader() {
          return async () => {
            throw new Error(
              'stop-after-composition',
            )
          }
        },

        create_composition(options) {
          receivedCompositionOptions =
            options

          return {
            writer:
              async () => ({
                status:
                  'persisted',
              }),

            provider:
              async () => ({
                content:
                  '{}',
              }),

            create_memory_id:
              () =>
                'memory-test',
          }
        },

        async run_service() {
          throw new Error(
            'run_service não deveria executar.',
          )
        },
      },
    })

  return {
    orchestrator,

    getCompositionOptions() {
      return receivedCompositionOptions
    },
  }
}

async function runHarness(
  harness,
) {
  return harness.orchestrator({
    company_id:
      companyId,

    cycle_id:
      cycleId,

    conversation_key:
      conversationKey,

    device_key:
      deviceKey,

    reference_time:
      referenceTime,

    v1_response: {
      contract_version:
        'companion-v1',
    },
  })
}

test(
  '12A active usa modelo rápido somente no diagnóstico',
  async () => {
    await withEnvironment(
      {
        VERCEL_ENV:
          'production',

        OPENAI_STATEFUL_COPILOT_MODEL:
          'gpt-4.1-mini-2025-04-14',

        OPENAI_STATEFUL_COMMUNICATION_MODEL:
          null,
      },

      async () => {
        const harness =
          createRoutingHarness({
            mode:
              'active',
          })

        const result =
          await runHarness(
            harness,
          )

        assert.equal(
          result.mode,
          'active_fallback_v1',
        )

        const options =
          harness
            .getCompositionOptions()

        assert.equal(
          options.openai_model,
          PHASE12A_ACTIVE_DIAGNOSTIC_MODEL,
        )

        assert.equal(
          options
            .openai_communication_model,
          PHASE12A_ACTIVE_COMMUNICATION_MODEL,
        )
      },
    )
  },
)

test(
  '12A active preserva modelo de comunicação explicitamente configurado',
  async () => {
    await withEnvironment(
      {
        VERCEL_ENV:
          'production',

        OPENAI_STATEFUL_COPILOT_MODEL:
          'diagnostic-env-antigo',

        OPENAI_STATEFUL_COMMUNICATION_MODEL:
          'communication-env',
      },

      async () => {
        const harness =
          createRoutingHarness({
            mode:
              'active',
          })

        await runHarness(
          harness,
        )

        const options =
          harness
            .getCompositionOptions()

        assert.equal(
          options.openai_model,
          PHASE12A_ACTIVE_DIAGNOSTIC_MODEL,
        )

        assert.equal(
          options
            .openai_communication_model,
          'communication-env',
        )
      },
    )
  },
)

test(
  '12A opção explícita continua podendo sobrescrever o canário',
  async () => {
    await withEnvironment(
      {
        VERCEL_ENV:
          'production',

        OPENAI_STATEFUL_COPILOT_MODEL:
          'diagnostic-env',

        OPENAI_STATEFUL_COMMUNICATION_MODEL:
          'communication-env',
      },

      async () => {
        const harness =
          createRoutingHarness({
            mode:
              'active',

            compositionOptions: {
              openai_model:
                'diagnostic-explicit',

              openai_communication_model:
                'communication-explicit',
            },
          })

        await runHarness(
          harness,
        )

        const options =
          harness
            .getCompositionOptions()

        assert.equal(
          options.openai_model,
          'diagnostic-explicit',
        )

        assert.equal(
          options
            .openai_communication_model,
          'communication-explicit',
        )
      },
    )
  },
)

test(
  '12A shadow não recebe roteamento do canário active',
  async () => {
    await withEnvironment(
      {
        VERCEL_ENV:
          'production',

        OPENAI_STATEFUL_COPILOT_MODEL:
          'shadow-diagnostic-env',

        OPENAI_STATEFUL_COMMUNICATION_MODEL:
          'shadow-communication-env',
      },

      async () => {
        const harness =
          createRoutingHarness({
            mode:
              'shadow',
          })

        await runHarness(
          harness,
        )

        assert.equal(
          harness
            .getCompositionOptions(),
          undefined,
        )
      },
    )
  },
)

test(
  '12A preview preserva roteamento experimental próprio',
  async () => {
    await withEnvironment(
      {
        VERCEL_ENV:
          'preview',

        OPENAI_STATEFUL_COPILOT_MODEL:
          null,

        OPENAI_STATEFUL_COMMUNICATION_MODEL:
          null,
      },

      async () => {
        const harness =
          createRoutingHarness({
            mode:
              'active',
          })

        await runHarness(
          harness,
        )

        assert.equal(
          harness
            .getCompositionOptions(),
          undefined,
        )
      },
    )
  },
)
