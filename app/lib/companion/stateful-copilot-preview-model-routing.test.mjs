import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createStatefulCopilotServerComposition,
} from '../server/stateful-copilot-composition.ts'

const COMPANION_VALIDATION_BRANCH =
  'feature/companion-v2-phase-5-2-shadow-validation'

function withEnvironment(values, callback) {
  const keys = Object.keys(values)
  const previous = new Map(
    keys.map((key) => [
      key,
      process.env[key],
    ]),
  )

  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === null) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }

    return callback()
  } finally {
    for (const key of keys) {
      const value = previous.get(key)

      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

function captureProviderOptions() {
  let providerOptions = null

  createStatefulCopilotServerComposition({
    supabase_url:
      'https://example.supabase.co',

    supabase_service_role_key:
      'service-role-test-key',

    openai_api_key:
      'openai-test-key',

    create_supabase_client:
      () => ({
        from() {
          throw new Error(
            'Supabase não deveria ser consultado neste teste.',
          )
        },

        async rpc() {
          throw new Error(
            'Supabase não deveria ser alterado neste teste.',
          )
        },
      }),

    composition_dependencies: {
      create_reader:
        () =>
          async () => ({
            mode:
              'missing',
          }),

      create_writer:
        () =>
          async () => ({
            status:
              'persisted',
          }),

      create_provider(options) {
        providerOptions = options

        return async () => ({
          content:
            '{}',
        })
      },

      async run_service() {
        throw new Error(
          'O serviço não deveria executar durante a composição.',
        )
      },
    },
  })

  return providerOptions
}

test(
  'preview da branch Companion usa Terra no diagnóstico e gpt-5.6 na comunicação',
  () =>
    withEnvironment(
      {
        VERCEL_ENV:
          'preview',

        VERCEL_GIT_COMMIT_REF:
          COMPANION_VALIDATION_BRANCH,

        OPENAI_STATEFUL_COPILOT_MODEL:
          null,

        OPENAI_STATEFUL_COMMUNICATION_MODEL:
          null,
      },
      () => {
        const options =
          captureProviderOptions()

        assert.equal(
          options.model,
          'gpt-5.6-terra',
        )

        assert.equal(
          options.communication_model,
          'gpt-5.6',
        )
      },
    ),
)

test(
  'production não herda o fallback gpt-5.6 da branch Companion',
  () =>
    withEnvironment(
      {
        VERCEL_ENV:
          'production',

        VERCEL_GIT_COMMIT_REF:
          COMPANION_VALIDATION_BRANCH,

        OPENAI_STATEFUL_COPILOT_MODEL:
          null,

        OPENAI_STATEFUL_COMMUNICATION_MODEL:
          null,
      },
      () => {
        const options =
          captureProviderOptions()

        assert.equal(
          options.model,
          null,
        )

        assert.equal(
          options.communication_model,
          null,
        )
      },
    ),
)

test(
  'preview da branch Companion respeita modelo global configurado antes do fallback',
  () =>
    withEnvironment(
      {
        VERCEL_ENV:
          'preview',

        VERCEL_GIT_COMMIT_REF:
          COMPANION_VALIDATION_BRANCH,

        OPENAI_STATEFUL_COPILOT_MODEL:
          'diagnostic-model-global',

        OPENAI_STATEFUL_COMMUNICATION_MODEL:
          'communication-model-configured',
      },
      () => {
        const options =
          captureProviderOptions()

        assert.equal(
          options.model,
          'diagnostic-model-global',
        )

        assert.equal(
          options.communication_model,
          'communication-model-configured',
        )
      },
    ),
)
