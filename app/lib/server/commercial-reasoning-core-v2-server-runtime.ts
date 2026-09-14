import 'server-only'

import {
  createClient,
} from '@supabase/supabase-js'

import type {
  CommercialReading,
} from '../companion/commercial-reading-contract'

import {
  createDeterministicStatefulCommercialMemoryId,
} from '../companion/stateful-copilot-composition'

import {
  createStatefulCopilotOpenAIProvider,
  type StatefulCopilotOpenAIProviderOptions,
} from '../companion/stateful-copilot-openai-provider'

import type {
  StatefulCopilotProvider,
} from '../companion/stateful-copilot-executor'

import type {
  StatefulCommercialMemoryIdFactory,
} from '../companion/stateful-commercial-state-reducer'

import {
  createCommercialReasoningCoreV2SupabaseWriter,
  type CommercialReasoningCoreV2SupabaseRpcClient,
} from '../companion/commercial-reasoning-core-v2-supabase-writer'

import type {
  CommercialReasoningCoreV2PersistenceWriter,
} from '../companion/commercial-reasoning-core-v2-persistence-executor'

import {
  runCommercialReasoningCoreV2PersistedRuntime,
  type CommercialReasoningCoreV2PersistedRuntimeResult,
} from '../companion/commercial-reasoning-core-v2-persisted-runtime'

import type {
  CommercialReasoningCoreV2SellerProjection,
} from '../companion/commercial-reasoning-core-v2-seller-adapter'

import {
  wrapStatefulCopilotProviderWithDeadline,
} from '../companion/stateful-copilot-cycle-deadline'

import {
  createStatefulCopilotServerRealContextLoader,
  type StatefulCopilotServerRealContextLoaderOptions,
} from './stateful-copilot-real-context-loader'

import type {
  StatefulCopilotRealContext,
  StatefulCopilotRealContextLoader,
} from '../companion/stateful-copilot-real-context-loader'

import {
  STATEFUL_COPILOT_BACKGROUND_CYCLE_DEADLINE_MS,
} from './stateful-copilot-background-job'

export const COMMERCIAL_REASONING_CORE_V2_SERVER_RUNTIME_VERSION =
  'commercial-reasoning-core-v2-server-runtime-v1' as const

export const COMMERCIAL_REASONING_CORE_V2_SERVER_DEFAULT_MODEL =
  'gpt-5.6' as const

export const COMMERCIAL_REASONING_CORE_V2_SERVER_DEFAULT_REASONING_EFFORT =
  'none' as const

const CORE_V2_SUPABASE_CLIENT_OPTIONS = {
  auth: {
    persistSession:
      false,

    autoRefreshToken:
      false,

    detectSessionInUrl:
      false,
  },
} as const

type CoreV2SupabaseClientFactory =
  (
    url: string,
    serviceRoleKey: string,
    options:
      typeof CORE_V2_SUPABASE_CLIENT_OPTIONS,
  ) => CommercialReasoningCoreV2SupabaseRpcClient

type CoreV2ProviderFactory =
  (
    options:
      StatefulCopilotOpenAIProviderOptions,
  ) => StatefulCopilotProvider

type CoreV2PersistenceWriterFactory =
  typeof createCommercialReasoningCoreV2SupabaseWriter

type CoreV2PersistedRuntimeRunner =
  typeof runCommercialReasoningCoreV2PersistedRuntime

type CoreV2ContextLoaderFactory =
  typeof createStatefulCopilotServerRealContextLoader

export type CommercialReasoningCoreV2ServerRuntimeExecution = {
  engine_mode:
    'model' | 'blocked'

  persistence_mode:
    CommercialReasoningCoreV2PersistedRuntimeResult[
      'persistence_mode'
    ]

  persisted:
    boolean

  candidate_state_version:
    number | null

  output_contract_version:
    string | null

  communication_contract_version:
    null

  communication_intervention_needed:
    boolean | null

  communication_message_present:
    boolean | null

  communication_attempts:
    1 | null

  communication_recovered_after_retry:
    false | null

  known_message_count:
    number

  active_message_count:
    number

  commercial_config_status:
    StatefulCopilotRealContext[
      'commercial_config_status'
    ]

  previous_state_found:
    boolean
}

export type CommercialReasoningCoreV2ServerRuntimeActiveResult = {
  runtime_version:
    typeof COMMERCIAL_REASONING_CORE_V2_SERVER_RUNTIME_VERSION

  mode:
    'core_v2_active'

  response_source:
    'commercial_reasoning_core_v2'

  stateful_executed:
    true

  response:
    CommercialReasoningCoreV2SellerProjection

  commercial_reading:
    CommercialReading

  stateful_execution:
    CommercialReasoningCoreV2ServerRuntimeExecution

  stateful_failure:
    null

  automatic_crm_write:
    false

  automatic_agenda_write:
    false
}

export type CommercialReasoningCoreV2ServerRuntimeFailedResult = {
  runtime_version:
    typeof COMMERCIAL_REASONING_CORE_V2_SERVER_RUNTIME_VERSION

  mode:
    'core_v2_failed'

  response_source:
    'commercial_reasoning_core_v2'

  stateful_executed:
    true

  response:
    null

  commercial_reading:
    null

  stateful_execution:
    CommercialReasoningCoreV2ServerRuntimeExecution

  stateful_failure:
    null

  automatic_crm_write:
    false

  automatic_agenda_write:
    false
}

export type CommercialReasoningCoreV2ServerRuntimeResult =
  | CommercialReasoningCoreV2ServerRuntimeActiveResult
  | CommercialReasoningCoreV2ServerRuntimeFailedResult

export type RunCommercialReasoningCoreV2ServerRuntimeArgs = {
  company_id:
    unknown

  cycle_id:
    unknown

  conversation_key:
    unknown

  device_key:
    unknown

  reference_time:
    unknown

  v1_response?:
    unknown
}

export type CommercialReasoningCoreV2ServerRuntime =
  (
    args:
      RunCommercialReasoningCoreV2ServerRuntimeArgs,
  ) => Promise<
    CommercialReasoningCoreV2ServerRuntimeResult
  >

export type CommercialReasoningCoreV2ServerRuntimeDependencies = {
  create_context_loader?:
    CoreV2ContextLoaderFactory

  create_supabase_client?:
    CoreV2SupabaseClientFactory

  create_provider?:
    CoreV2ProviderFactory

  create_persistence_writer?:
    CoreV2PersistenceWriterFactory

  run_persisted_runtime?:
    CoreV2PersistedRuntimeRunner

  create_memory_id?:
    StatefulCommercialMemoryIdFactory
}

export type CommercialReasoningCoreV2ServerRuntimeOptions = {
  supabase_url?:
    string | null

  supabase_service_role_key?:
    string | null

  openai_api_key?:
    string | null

  openai_model?:
    string | null

  openai_reasoning_effort?:
    StatefulCopilotOpenAIProviderOptions[
      'diagnostic_reasoning_effort'
    ]

  openai_timeout_ms?:
    number

  openai_max_output_tokens?:
    number

  cycle_deadline_ms?:
    number

  context_loader_options?:
    StatefulCopilotServerRealContextLoaderOptions

  dependencies?:
    CommercialReasoningCoreV2ServerRuntimeDependencies
}

export class CommercialReasoningCoreV2ServerRuntimeConfigurationError
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
    super(
      message,
    )

    this.name =
      'CommercialReasoningCoreV2ServerRuntimeConfigurationError'

    this.code =
      code

    this.configuration_key =
      configuration_key
  }
}

function failConfiguration(
  configurationKey:
    string,
): never {
  throw new CommercialReasoningCoreV2ServerRuntimeConfigurationError({
    code:
      'MISSING_CORE_V2_SERVER_CONFIGURATION',

    configuration_key:
      configurationKey,

    message:
      'O runtime servidor do Commercial Reasoning Core V2 não possui todas as configurações obrigatórias.',
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

  if (
    typeof rawValue !==
      'string' ||
    !rawValue.trim()
  ) {
    failConfiguration(
      configurationKey,
    )
  }

  return rawValue.trim()
}

function resolveOptionalText(
  value:
    string | null | undefined,
): string | null {
  if (
    typeof value !==
    'string'
  ) {
    return null
  }

  const normalized =
    value.trim()

  return normalized || null
}

function resolveCycleDeadlineMs(
  value:
    number | undefined,
): number {
  if (
    typeof value !==
      'number' ||
    !Number.isFinite(
      value,
    ) ||
    value < 5_000
  ) {
    return STATEFUL_COPILOT_BACKGROUND_CYCLE_DEADLINE_MS
  }

  return Math.floor(
    value,
  )
}

const createDefaultSupabaseClient:
  CoreV2SupabaseClientFactory =
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
        CommercialReasoningCoreV2SupabaseRpcClient

function buildExecution({
  context,
  result,
}: {
  context:
    StatefulCopilotRealContext

  result:
    CommercialReasoningCoreV2PersistedRuntimeResult
}): CommercialReasoningCoreV2ServerRuntimeExecution {
  const runtimeResult =
    result.runtime_result

  const modelMode =
    runtimeResult.mode ===
    'model'

  return {
    engine_mode:
      modelMode
        ? 'model'
        : 'blocked',

    persistence_mode:
      result.persistence_mode,

    persisted:
      result.persisted,

    candidate_state_version:
      modelMode
        ? runtimeResult
            .memory_reduction
            .state
            .version
        : null,

    output_contract_version:
      modelMode
        ? runtimeResult
            .core_result
            .output
            .contract_version
        : null,

    communication_contract_version:
      null,

    communication_intervention_needed:
      modelMode
        ? runtimeResult
            .seller_projection
            .intervention_needed
        : null,

    communication_message_present:
      modelMode
        ? runtimeResult
            .seller_projection
            .suggested_message !==
          null
        : null,

    communication_attempts:
      modelMode
        ? 1
        : null,

    communication_recovered_after_retry:
      modelMode
        ? false
        : null,

    known_message_count:
      context
        .known_message_ids
        .length,

    active_message_count:
      context
        .active_message_ids
        .length,

    commercial_config_status:
      context
        .commercial_config_status,

    previous_state_found:
      context
        .state_read
        .found,
  }
}

export function createCommercialReasoningCoreV2ServerRuntime(
  options:
    CommercialReasoningCoreV2ServerRuntimeOptions = {},
): CommercialReasoningCoreV2ServerRuntime {
  const dependencies =
    options.dependencies ??
    {}

  const supabaseUrl =
    resolveRequiredText({
      explicitValue:
        options.supabase_url,

      environmentValue:
        process.env
          .NEXT_PUBLIC_SUPABASE_URL,

      configurationKey:
        'NEXT_PUBLIC_SUPABASE_URL',
    })

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

  const model =
    resolveOptionalText(
      options.openai_model ??
      process.env
        .OPENAI_COMMERCIAL_REASONING_CORE_V2_MODEL,
    ) ??
    COMMERCIAL_REASONING_CORE_V2_SERVER_DEFAULT_MODEL

  const reasoningEffort =
    options.openai_reasoning_effort ??
    process.env
      .OPENAI_COMMERCIAL_REASONING_CORE_V2_REASONING_EFFORT ??
    COMMERCIAL_REASONING_CORE_V2_SERVER_DEFAULT_REASONING_EFFORT

  const createContextLoader =
    dependencies.create_context_loader ??
    createStatefulCopilotServerRealContextLoader

  const createSupabaseClient =
    dependencies.create_supabase_client ??
    createDefaultSupabaseClient

  const createProvider =
    dependencies.create_provider ??
    createStatefulCopilotOpenAIProvider

  const createPersistenceWriter =
    dependencies.create_persistence_writer ??
    createCommercialReasoningCoreV2SupabaseWriter

  const runPersistedRuntime =
    dependencies.run_persisted_runtime ??
    runCommercialReasoningCoreV2PersistedRuntime

  const createMemoryId =
    dependencies.create_memory_id ??
    createDeterministicStatefulCommercialMemoryId

  const contextLoader =
    createContextLoader({
      ...(options.context_loader_options ?? {}),

      supabase_url:
        supabaseUrl,

      supabase_service_role_key:
        serviceRoleKey,
    })

  const rpcClient =
    createSupabaseClient(
      supabaseUrl,
      serviceRoleKey,
      CORE_V2_SUPABASE_CLIENT_OPTIONS,
    )

  const persistenceWriter:
    CommercialReasoningCoreV2PersistenceWriter =
      createPersistenceWriter({
        client:
          rpcClient,
      })

  const provider =
    createProvider({
      api_key:
        openAiApiKey,

      model,

      diagnostic_reasoning_effort:
        reasoningEffort,

      timeout_ms:
        options.openai_timeout_ms,

      max_output_tokens:
        options.openai_max_output_tokens,
    })

  const cycleDeadlineMs =
    resolveCycleDeadlineMs(
      options.cycle_deadline_ms,
    )

  return async ({
    company_id,
    cycle_id,
    conversation_key,
    device_key,
    reference_time,
  }) => {
    const context =
      await contextLoader({
        company_id,
        cycle_id,
        conversation_key,
        device_key,
        reference_time,
      })

    const deadlineAt =
      Date.now() +
      cycleDeadlineMs

    const result =
      await runPersistedRuntime({
        runtime_args: {
          diagnostic_input:
            context.diagnostic_input,

          previous_state:
            context
              .state_read
              .found
              ? context
                  .state_read
                  .state
              : null,

          known_message_ids:
            context.known_message_ids,

          provider:
            wrapStatefulCopilotProviderWithDeadline({
              provider,

              deadline_at:
                deadlineAt,
            }),

          create_memory_id:
            createMemoryId,

          durable_memory_seed:
            context.durable_memory_seed,
        },

        persistence_writer:
          persistenceWriter,

        generated_at:
          context.loaded_at,
      })

    const execution =
      buildExecution({
        context,
        result,
      })

    if (
      result.mode ===
        'model' &&
      result.persistence_mode ===
        'persisted' &&
      result.persisted ===
        true
    ) {
      return {
        runtime_version:
          COMMERCIAL_REASONING_CORE_V2_SERVER_RUNTIME_VERSION,

        mode:
          'core_v2_active',

        response_source:
          'commercial_reasoning_core_v2',

        stateful_executed:
          true,

        response:
          result
            .runtime_result
            .seller_projection,

        commercial_reading:
          result
            .runtime_result
            .commercial_reading
            .reading,

        stateful_execution:
          execution,

        stateful_failure:
          null,

        automatic_crm_write:
          false,

        automatic_agenda_write:
          false,
      }
    }

    return {
      runtime_version:
        COMMERCIAL_REASONING_CORE_V2_SERVER_RUNTIME_VERSION,

      mode:
        'core_v2_failed',

      response_source:
        'commercial_reasoning_core_v2',

      stateful_executed:
        true,

      response:
        null,

      commercial_reading:
        null,

      stateful_execution:
        execution,

      stateful_failure:
        null,

      automatic_crm_write:
        false,

      automatic_agenda_write:
        false,
    }
  }
}
