import 'server-only'

import {
  createClient,
} from '@supabase/supabase-js'

import {
  createStatefulCopilotComposition,
  type StatefulCopilotComposition,
  type StatefulCopilotCompositionFactoryDependencies,
  type StatefulCopilotSupabaseClient,
} from '../companion/stateful-copilot-composition'

import type {
  StatefulCopilotOpenAIReasoningEffort,
} from '../companion/stateful-copilot-openai-provider'

const STATEFUL_SUPABASE_CLIENT_OPTIONS = {
  auth: {
    persistSession:
      false,

    autoRefreshToken:
      false,

    detectSessionInUrl:
      false,
  },
} as const

export type StatefulCopilotSupabaseAdminClientFactory = (
  url: string,
  serviceRoleKey: string,
  options:
    typeof STATEFUL_SUPABASE_CLIENT_OPTIONS,
) => StatefulCopilotSupabaseClient

export type StatefulCopilotServerCompositionOptions = {
  supabase_url?:
    string | null

  supabase_service_role_key?:
    string | null

  openai_api_key?:
    string | null

  openai_model?:
    string | null

  openai_communication_model?:
    string | null

  openai_diagnostic_reasoning_effort?:
    StatefulCopilotOpenAIReasoningEffort | null

  openai_timeout_ms?:
    number

  openai_max_output_tokens?:
    number

  create_supabase_client?:
    StatefulCopilotSupabaseAdminClientFactory

  composition_dependencies?:
    StatefulCopilotCompositionFactoryDependencies
}

export class StatefulCopilotServerConfigurationError
  extends Error {
  readonly code: string
  readonly configuration_key: string

  constructor({
    code,
    configuration_key,
    message,
  }: {
    code: string
    configuration_key: string
    message: string
  }) {
    super(message)

    this.name =
      'StatefulCopilotServerConfigurationError'

    this.code =
      code

    this.configuration_key =
      configuration_key
  }
}

function fail({
  code,
  configurationKey,
  message,
}: {
  code: string
  configurationKey: string
  message: string
}): never {
  throw new StatefulCopilotServerConfigurationError({
    code,

    configuration_key:
      configurationKey,

    message,
  })
}

function resolveRequiredText({
  explicitValue,
  environmentValue,
  configurationKey,
}: {
  explicitValue:
    string | null | undefined

  environmentValue:
    string | undefined

  configurationKey:
    string
}): string {
  const rawValue =
    explicitValue === undefined
      ? environmentValue
      : explicitValue

  if (typeof rawValue !== 'string') {
    fail({
      code:
        'MISSING_STATEFUL_SERVER_CONFIGURATION',

      configurationKey,

      message:
        'A composição stateful não possui todas as configurações obrigatórias.',
    })
  }

  const normalized =
    rawValue.trim()

  if (!normalized) {
    fail({
      code:
        'MISSING_STATEFUL_SERVER_CONFIGURATION',

      configurationKey,

      message:
        'A composição stateful não possui todas as configurações obrigatórias.',
    })
  }

  return normalized
}

function normalizeOptionalText(
  value: string | null | undefined,
): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized =
    value.trim()

  return normalized || null
}

function requireSupabaseUrl(
  value: string,
): string {
  let parsed:
    URL

  try {
    parsed =
      new URL(
        value,
      )
  } catch {
    fail({
      code:
        'INVALID_STATEFUL_SUPABASE_URL',

      configurationKey:
        'NEXT_PUBLIC_SUPABASE_URL',

      message:
        'A URL configurada para o Supabase stateful é inválida.',
    })
  }

  if (
    parsed.protocol !== 'https:' &&
    parsed.protocol !== 'http:'
  ) {
    fail({
      code:
        'INVALID_STATEFUL_SUPABASE_URL',

      configurationKey:
        'NEXT_PUBLIC_SUPABASE_URL',

      message:
        'A URL configurada para o Supabase stateful é inválida.',
    })
  }

  return parsed.toString()
}

const createDefaultSupabaseClient:
  StatefulCopilotSupabaseAdminClientFactory =
    (
      url,
      serviceRoleKey,
      options,
    ) =>
      createClient(
        url,
        serviceRoleKey,
        options,
      ) as unknown as StatefulCopilotSupabaseClient

export function createStatefulCopilotServerComposition(
  options:
    StatefulCopilotServerCompositionOptions = {},
): StatefulCopilotComposition {
  const supabaseUrl =
    requireSupabaseUrl(
      resolveRequiredText({
        explicitValue:
          options.supabase_url,

        environmentValue:
          process.env
            .NEXT_PUBLIC_SUPABASE_URL,

        configurationKey:
          'NEXT_PUBLIC_SUPABASE_URL',
      }),
    )

  const serviceRoleKey =
    resolveRequiredText({
      explicitValue:
        options.supabase_service_role_key,

      environmentValue:
        process.env
          .SUPABASE_SERVICE_ROLE_KEY,

      configurationKey:
        'SUPABASE_SERVICE_ROLE_KEY',
    })

  const openAiApiKey =
    resolveRequiredText({
      explicitValue:
        options.openai_api_key,

      environmentValue:
        process.env
          .OPENAI_API_KEY,

      configurationKey:
        'OPENAI_API_KEY',
    })

  const isCompanionValidationPreview =
    process.env.VERCEL_ENV === 'preview' &&
    process.env.VERCEL_GIT_COMMIT_REF ===
      'feature/companion-v2-phase-5-2-shadow-validation'

  const previewDiagnosticModel =
    isCompanionValidationPreview
      ? 'gpt-5.6-terra'
      : null

  const previewCommunicationModel =
    isCompanionValidationPreview
      ? 'gpt-5.6'
      : null

  const createSupabaseClient =
    options.create_supabase_client ??
    createDefaultSupabaseClient

  const client =
    createSupabaseClient(
      supabaseUrl,
      serviceRoleKey,
      STATEFUL_SUPABASE_CLIENT_OPTIONS,
    )

  return createStatefulCopilotComposition({
    client,

    openai_options: {
      api_key:
        openAiApiKey,

      model:
        normalizeOptionalText(
          options.openai_model ??
          process.env
            .OPENAI_STATEFUL_COPILOT_MODEL ??
          previewDiagnosticModel,
        ),

      communication_model:
        normalizeOptionalText(
          options.openai_communication_model ??
          process.env
            .OPENAI_STATEFUL_COMMUNICATION_MODEL ??
          previewCommunicationModel,
        ),

      ...(options
        .openai_diagnostic_reasoning_effort !== undefined &&
      options
        .openai_diagnostic_reasoning_effort !== null
        ? {
            diagnostic_reasoning_effort:
              options
                .openai_diagnostic_reasoning_effort,
          }
        : {}),

      timeout_ms:
        options.openai_timeout_ms,

      max_output_tokens:
        options.openai_max_output_tokens,
    },

    dependencies:
      options.composition_dependencies,
  })
}
