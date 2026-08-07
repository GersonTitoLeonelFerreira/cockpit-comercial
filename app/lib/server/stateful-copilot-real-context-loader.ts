import 'server-only'

import {
  createClient,
} from '@supabase/supabase-js'

import {
  createStatefulCopilotRealContextLoader,
  type StatefulCopilotRealContextLoader,
  type StatefulCopilotRealContextLoaderDependencies,
  type StatefulCopilotRealContextSupabaseClient,
} from '../companion/stateful-copilot-real-context-loader'

const STATEFUL_CONTEXT_SUPABASE_OPTIONS = {
  auth: {
    persistSession:
      false,

    autoRefreshToken:
      false,

    detectSessionInUrl:
      false,
  },
} as const

export type StatefulCopilotRealContextAdminClientFactory =
  (
    url: string,
    serviceRoleKey: string,
    options:
      typeof STATEFUL_CONTEXT_SUPABASE_OPTIONS,
  ) => StatefulCopilotRealContextSupabaseClient

export type StatefulCopilotServerRealContextLoaderOptions = {
  supabase_url?:
    string | null

  supabase_service_role_key?:
    string | null

  create_supabase_client?:
    StatefulCopilotRealContextAdminClientFactory

  loader_dependencies?:
    StatefulCopilotRealContextLoaderDependencies
}

export class StatefulCopilotRealContextServerConfigurationError
  extends Error {
  readonly code:
    string

  readonly configuration_key:
    string

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
      'StatefulCopilotRealContextServerConfigurationError'

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
  throw new StatefulCopilotRealContextServerConfigurationError({
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
        'MISSING_STATEFUL_CONTEXT_CONFIGURATION',

      configurationKey,

      message:
        'O carregador stateful não possui todas as configurações obrigatórias.',
    })
  }

  const normalized =
    rawValue.trim()

  if (!normalized) {
    fail({
      code:
        'MISSING_STATEFUL_CONTEXT_CONFIGURATION',

      configurationKey,

      message:
        'O carregador stateful não possui todas as configurações obrigatórias.',
    })
  }

  return normalized
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
        'INVALID_STATEFUL_CONTEXT_SUPABASE_URL',

      configurationKey:
        'NEXT_PUBLIC_SUPABASE_URL',

      message:
        'A URL do Supabase configurada para o carregador stateful é inválida.',
    })
  }

  if (
    parsed.protocol !== 'https:' &&
    parsed.protocol !== 'http:'
  ) {
    fail({
      code:
        'INVALID_STATEFUL_CONTEXT_SUPABASE_URL',

      configurationKey:
        'NEXT_PUBLIC_SUPABASE_URL',

      message:
        'A URL do Supabase configurada para o carregador stateful é inválida.',
    })
  }

  return parsed.toString()
}

const createDefaultSupabaseClient:
  StatefulCopilotRealContextAdminClientFactory =
    (
      url,
      serviceRoleKey,
      options,
    ) =>
      createClient(
        url,
        serviceRoleKey,
        options,
      ) as unknown as
        StatefulCopilotRealContextSupabaseClient

export function createStatefulCopilotServerRealContextLoader(
  options:
    StatefulCopilotServerRealContextLoaderOptions = {},
): StatefulCopilotRealContextLoader {
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

  const createSupabaseClient =
    options.create_supabase_client ??
    createDefaultSupabaseClient

  const client =
    createSupabaseClient(
      supabaseUrl,
      serviceRoleKey,
      STATEFUL_CONTEXT_SUPABASE_OPTIONS,
    )

  return createStatefulCopilotRealContextLoader(
    client,
    options.loader_dependencies,
  )
}
