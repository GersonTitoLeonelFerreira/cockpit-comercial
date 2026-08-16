import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createStatefulCopilotServerComposition,
} from './stateful-copilot-composition.ts'

const ENV_KEYS = [
  'VERCEL_ENV',
  'VERCEL_GIT_COMMIT_REF',
  'OPENAI_STATEFUL_COPILOT_MODEL',
  'OPENAI_STATEFUL_COMMUNICATION_MODEL',
]

async function withEnvironment(
  values,
  callback,
) {
  const previous = {}

  for (const key of ENV_KEYS) {
    previous[key] =
      process.env[key]

    const value =
      values[key]

    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] =
        value
    }
  }

  try {
    await callback()
  } finally {
    for (const key of ENV_KEYS) {
      if (
        previous[key] ===
        undefined
      ) {
        delete process.env[key]
      } else {
        process.env[key] =
          previous[key]
      }
    }
  }
}

function captureOpenAiOptions(
  options = {},
) {
  let captured = null

  createStatefulCopilotServerComposition({
    supabase_url:
      'https://example.supabase.co',

    supabase_service_role_key:
      'service-role-test',

    openai_api_key:
      'sk-test',

    create_supabase_client:
      () => ({}),

    composition_dependencies: {
      create_reader:
        () => async () => null,

      create_writer:
        () => async () => null,

      create_provider:
        (openAiOptions) => {
          captured =
            openAiOptions

          return async () => {
            throw new Error(
              'Provider não deve executar neste teste.'
            )
          }
        },

      run_service:
        async () => {
          throw new Error(
            'Serviço não deve executar neste teste.'
          )
        },
    },

    ...options,
  })

  assert.ok(captured)

  return captured
}

test(
  'preview da Fase 5.2 usa Terra no diagnóstico e Sol na comunicação',
  async () => {
    await withEnvironment(
      {
        VERCEL_ENV:
          'preview',

        VERCEL_GIT_COMMIT_REF:
          'feature/companion-v2-phase-5-2-shadow-validation',
      },

      async () => {
        const options =
          captureOpenAiOptions()

        assert.equal(
          options.model,
          'gpt-5.6-terra',
        )

        assert.equal(
          options.communication_model,
          'gpt-5.6',
        )
      },
    )
  },
)

test(
  'produção usa modelos configurados no ambiente e não herda fallback da preview',
  async () => {
    await withEnvironment(
      {
        VERCEL_ENV:
          'production',

        VERCEL_GIT_COMMIT_REF:
          'main',

        OPENAI_STATEFUL_COPILOT_MODEL:
          'production-diagnostic-model',

        OPENAI_STATEFUL_COMMUNICATION_MODEL:
          'production-communication-model',
      },

      async () => {
        const options =
          captureOpenAiOptions()

        assert.equal(
          options.model,
          'production-diagnostic-model',
        )

        assert.equal(
          options.communication_model,
          'production-communication-model',
        )
      },
    )
  },
)

test(
  'outra preview não recebe modelos experimentais da Fase 5.2',
  async () => {
    await withEnvironment(
      {
        VERCEL_ENV:
          'preview',

        VERCEL_GIT_COMMIT_REF:
          'feature/outra-branch',
      },

      async () => {
        const options =
          captureOpenAiOptions()

        assert.equal(
          options.model,
          null,
        )

        assert.equal(
          options.communication_model,
          null,
        )
      },
    )
  },
)

test(
  'variáveis de ambiente explícitas sobrescrevem fallback experimental da preview',
  async () => {
    await withEnvironment(
      {
        VERCEL_ENV:
          'preview',

        VERCEL_GIT_COMMIT_REF:
          'feature/companion-v2-phase-5-2-shadow-validation',

        OPENAI_STATEFUL_COPILOT_MODEL:
          'explicit-diagnostic-model',

        OPENAI_STATEFUL_COMMUNICATION_MODEL:
          'explicit-communication-model',
      },

      async () => {
        const options =
          captureOpenAiOptions()

        assert.equal(
          options.model,
          'explicit-diagnostic-model',
        )

        assert.equal(
          options.communication_model,
          'explicit-communication-model',
        )
      },
    )
  },
)

test(
  'opções explícitas têm prioridade sobre ambiente e fallback de preview',
  async () => {
    await withEnvironment(
      {
        VERCEL_ENV:
          'preview',

        VERCEL_GIT_COMMIT_REF:
          'feature/companion-v2-phase-5-2-shadow-validation',

        OPENAI_STATEFUL_COPILOT_MODEL:
          'environment-diagnostic-model',

        OPENAI_STATEFUL_COMMUNICATION_MODEL:
          'environment-communication-model',
      },

      async () => {
        const options =
          captureOpenAiOptions({
            openai_model:
              'option-diagnostic-model',

            openai_communication_model:
              'option-communication-model',
          })

        assert.equal(
          options.model,
          'option-diagnostic-model',
        )

        assert.equal(
          options.communication_model,
          'option-communication-model',
        )
      },
    )
  },
)
