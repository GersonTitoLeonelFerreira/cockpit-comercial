import 'server-only'

import {
  resolveStatefulCopilotActivationGate,
  type ResolveStatefulCopilotActivationGateArgs,
  type StatefulCopilotActivationDecision,
} from '../companion/stateful-copilot-activation-gate'

import type {
  StatefulCopilotOutput,
} from '../companion/stateful-copilot-contract'

import type {
  CommercialReading,
} from '../companion/commercial-reading-contract'

import type {
  StatefulCopilotComposition,
} from '../companion/stateful-copilot-composition'

import {
  runStatefulCopilotIntegratedService,
  type StatefulCopilotIntegratedServiceResult,
} from '../companion/stateful-copilot-integrated-service'

import type {
  StatefulCopilotStateReader,
  StatefulCopilotStateReadRequest,
} from '../companion/stateful-copilot-supabase-reader'

import {
  createStatefulCopilotServerComposition,
  type StatefulCopilotServerCompositionOptions,
} from './stateful-copilot-composition'

import type {
  StatefulCopilotRealContext,
  StatefulCopilotRealContextLoader,
} from '../companion/stateful-copilot-real-context-loader'

import {
  createStatefulCopilotServerRealContextLoader,
  type StatefulCopilotServerRealContextLoaderOptions,
} from './stateful-copilot-real-context-loader'

import {
  resolveStatefulCopilotCycleDeadlineMs,
  wrapStatefulCopilotPersistenceWriterWithDeadline,
  wrapStatefulCopilotProviderWithDeadline,
} from '../companion/stateful-copilot-cycle-deadline'

export const STATEFUL_COPILOT_PROJECT_PHASE =
  'phase-5' as const

export const STATEFUL_COPILOT_PROJECT_SUBPHASE =
  'phase-5.4' as const

export const STATEFUL_COPILOT_RUNTIME_STAGE =
  'server-only-orchestrator' as const

export const PHASE12A_ACTIVE_DIAGNOSTIC_MODEL =
  'gpt-4o-mini-2024-07-18' as const

export const PHASE12A_ACTIVE_COMMUNICATION_MODEL =
  'gpt-4.1-mini-2025-04-14' as const

type JsonRecord =
  Record<string, unknown>

type StatefulCopilotGateResolver =
  typeof resolveStatefulCopilotActivationGate

type StatefulCopilotContextLoaderFactory =
  typeof createStatefulCopilotServerRealContextLoader

type StatefulCopilotCompositionFactory =
  typeof createStatefulCopilotServerComposition

type StatefulCopilotIntegratedServiceRunner =
  typeof runStatefulCopilotIntegratedService

export type StatefulCopilotRuntimeFailure = {
  code: string
  status_code: number
  retryable: boolean

  communication_failure_path?:
    string

  communication_failure_invariant?:
    string

  communication_attempts?:
    1 | 2
}

export type StatefulCopilotRuntimeExecutionSummary = {
  engine_mode:
    StatefulCopilotIntegratedServiceResult[
      'engine_result'
    ]['mode']

  persistence_mode:
    StatefulCopilotIntegratedServiceResult[
      'persistence_result'
    ]['mode']

  persisted:
    boolean

  candidate_state_version:
    number | null

  output_contract_version:
    string | null

  communication_contract_version:
    string | null

  communication_intervention_needed:
    boolean | null

  communication_message_present:
    boolean | null

  communication_attempts:
    1 | 2 | null

  communication_recovered_after_retry:
    boolean | null

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

export type StatefulCopilotRuntimeCommonResult = {
  project_phase:
    typeof STATEFUL_COPILOT_PROJECT_PHASE

  project_subphase:
    typeof STATEFUL_COPILOT_PROJECT_SUBPHASE

  runtime_stage:
    typeof STATEFUL_COPILOT_RUNTIME_STAGE

  activation:
    StatefulCopilotActivationDecision

  automatic_crm_write:
    false

  automatic_agenda_write:
    false
}

export type StatefulCopilotRuntimeV1Result<
  TV1Response,
> =
  StatefulCopilotRuntimeCommonResult & {
    mode:
      'v1'

    response_source:
      'v1'

    stateful_executed:
      false

    response:
      TV1Response

    stateful_execution:
      null

    stateful_failure:
      null
  }

export type StatefulCopilotRuntimeShadowResult<
  TV1Response,
> =
  StatefulCopilotRuntimeCommonResult & {
    mode:
      'shadow'

    response_source:
      'v1'

    stateful_executed:
      true

    response:
      TV1Response

    stateful_execution:
      StatefulCopilotRuntimeExecutionSummary

    stateful_failure:
      null
  }

export type StatefulCopilotRuntimeActiveResult =
  StatefulCopilotRuntimeCommonResult & {
    mode:
      'active'

    response_source:
      'stateful'

    stateful_executed:
      true

    response:
      StatefulCopilotOutput

    commercial_reading:
      CommercialReading

    stateful_execution:
      StatefulCopilotRuntimeExecutionSummary

    stateful_failure:
      null
  }

export type StatefulCopilotRuntimeFallbackResult<
  TV1Response,
> =
  StatefulCopilotRuntimeCommonResult & {
    mode:
      'active_fallback_v1'

    response_source:
      'v1'

    stateful_executed:
      true

    response:
      TV1Response

    stateful_execution:
      StatefulCopilotRuntimeExecutionSummary | null

    stateful_failure:
      StatefulCopilotRuntimeFailure | null

    fallback_reason:
      | 'stateful_output_unavailable'
      | 'stateful_state_not_persisted'
      | 'stateful_runtime_failed'
  }

export type StatefulCopilotServerRuntimeResult<
  TV1Response,
> =
  | StatefulCopilotRuntimeV1Result<TV1Response>
  | StatefulCopilotRuntimeShadowResult<TV1Response>
  | StatefulCopilotRuntimeActiveResult
  | StatefulCopilotRuntimeFallbackResult<TV1Response>

export type RunStatefulCopilotServerRuntimeArgs<
  TV1Response,
> = {
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

  v1_response:
    TV1Response
}

export type StatefulCopilotServerRuntimeOrchestrator =
  <TV1Response>(
    args:
      RunStatefulCopilotServerRuntimeArgs<TV1Response>,
  ) => Promise<
    StatefulCopilotServerRuntimeResult<TV1Response>
  >

export type StatefulCopilotServerRuntimeDependencies = {
  resolve_gate?:
    StatefulCopilotGateResolver

  create_context_loader?:
    StatefulCopilotContextLoaderFactory

  create_composition?:
    StatefulCopilotCompositionFactory

  run_service?:
    StatefulCopilotIntegratedServiceRunner
}

export type StatefulCopilotServerRuntimeOptions = {
  configured_mode?:
    ResolveStatefulCopilotActivationGateArgs[
      'configured_mode'
    ]

  configured_company_ids?:
    ResolveStatefulCopilotActivationGateArgs[
      'configured_company_ids'
    ]

  configured_engine_version?:
    ResolveStatefulCopilotActivationGateArgs[
      'configured_engine_version'
    ]

  context_loader_options?:
    StatefulCopilotServerRealContextLoaderOptions

  composition_options?:
    StatefulCopilotServerCompositionOptions

  cycle_deadline_ms?:
    number

  dependencies?:
    StatefulCopilotServerRuntimeDependencies
}

export class StatefulCopilotServerRuntimeError
  extends Error {
  readonly code:
    string

  readonly status_code:
    number

  readonly retryable:
    boolean

  constructor({
    code,
    message,
    status_code,
    retryable,
  }: {
    code: string
    message: string
    status_code: number
    retryable: boolean
  }) {
    super(message)

    this.name =
      'StatefulCopilotServerRuntimeError'

    this.code =
      code

    this.status_code =
      status_code

    this.retryable =
      retryable
  }
}

function fail({
  code,
  message,
  statusCode,
  retryable,
}: {
  code: string
  message: string
  statusCode: number
  retryable: boolean
}): never {
  throw new StatefulCopilotServerRuntimeError({
    code,

    message,

    status_code:
      statusCode,

    retryable,
  })
}

function isRecord(
  value: unknown,
): value is JsonRecord {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value)
  )
}

function normalizeFailure(
  error: unknown,
): StatefulCopilotRuntimeFailure {
  if (!isRecord(error)) {
    return {
      code:
        'STATEFUL_RUNTIME_FAILED',

      status_code:
        500,

      retryable:
        false,
    }
  }

  const code =
    typeof error.code === 'string' &&
    error.code.trim()
      ? error.code.trim()
      : 'STATEFUL_RUNTIME_FAILED'

  const statusCode =
    typeof error.status_code === 'number' &&
    Number.isSafeInteger(
      error.status_code,
    ) &&
    error.status_code >= 400 &&
    error.status_code <= 599
      ? error.status_code
      : 500

  const details =
    isRecord(
      error.details,
    )
      ? error.details
      : null

  const failurePath =
    typeof details
      ?.communication_failure_path ===
      'string' &&
    details
      .communication_failure_path
      .length <= 300 &&
    /^[a-zA-Z0-9_.\[\]-]+$/.test(
      details
        .communication_failure_path,
    )
      ? details
          .communication_failure_path
      : null

  const failureInvariant =
    typeof details
      ?.communication_failure_invariant ===
      'string' &&
    details
      .communication_failure_invariant
      .length <= 120 &&
    /^[A-Z0-9_]+$/.test(
      details
        .communication_failure_invariant,
    )
      ? details
          .communication_failure_invariant
      : null

  const communicationAttempts =
    details
      ?.communication_attempts === 1 ||
    details
      ?.communication_attempts === 2
      ? details
          .communication_attempts
      : null

  return {
    code,

    status_code:
      statusCode,

    retryable:
      error.retryable === true,

    ...(failurePath
      ? {
          communication_failure_path:
            failurePath,
        }
      : {}),

    ...(failureInvariant
      ? {
          communication_failure_invariant:
            failureInvariant,
        }
      : {}),

    ...(communicationAttempts
      ? {
          communication_attempts:
            communicationAttempts,
        }
      : {}),
  }
}

function equalTextArrays(
  left: string[],
  right: string[],
): boolean {
  if (
    left.length !==
    right.length
  ) {
    return false
  }

  for (
    let index = 0;
    index < left.length;
    index += 1
  ) {
    if (
      left[index] !==
      right[index]
    ) {
      return false
    }
  }

  return true
}

function createLoadedStateReader(
  context:
    StatefulCopilotRealContext,
): StatefulCopilotStateReader {
  return async (
    request:
      StatefulCopilotStateReadRequest,
  ) => {
    if (
      request.company_id !==
        context.scope.company.id ||
      request.cycle_id !==
        context.scope.cycle.id ||
      request.conversation_key !==
        context.scope.conversation_key
    ) {
      fail({
        code:
          'STATEFUL_RUNTIME_SCOPE_MISMATCH',

        message:
          'O leitor carregado recebeu um escopo diferente do contexto real.',

        statusCode:
          500,

        retryable:
          false,
      })
    }

    if (
      !equalTextArrays(
        request.known_message_ids,
        context.known_message_ids,
      )
    ) {
      fail({
        code:
          'STATEFUL_RUNTIME_LEDGER_MISMATCH',

        message:
          'O leitor carregado recebeu um ledger diferente do contexto real.',

        statusCode:
          500,

        retryable:
          false,
      })
    }

    if (
      !equalTextArrays(
        request.active_message_ids,
        context.active_message_ids,
      )
    ) {
      fail({
        code:
          'STATEFUL_RUNTIME_ACTIVE_MESSAGE_MISMATCH',

        message:
          'O leitor carregado recebeu mensagens ativas diferentes do contexto real.',

        statusCode:
          500,

        retryable:
          false,
      })
    }

    return context.state_read
  }
}

function buildExecutionSummary({
  context,
  result,
}: {
  context:
    StatefulCopilotRealContext

  result:
    StatefulCopilotIntegratedServiceResult
}): StatefulCopilotRuntimeExecutionSummary {
  const engineResult =
    result.engine_result

  return {
    engine_mode:
      engineResult.mode,

    persistence_mode:
      result.persistence_result.mode,

    persisted:
      result.persistence_result.persisted,

    candidate_state_version:
      engineResult.mode === 'model'
        ? engineResult
            .candidate_state
            .version
        : null,

    output_contract_version:
      engineResult.mode === 'model'
        ? engineResult
            .output
            .contract_version
        : null,

    communication_contract_version:
      engineResult.mode === 'model'
        ? engineResult
            .communication_output
            .contract_version
        : null,

    communication_intervention_needed:
      engineResult.mode === 'model'
        ? engineResult
            .communication_output
            .intervention_needed
        : null,

    communication_message_present:
      engineResult.mode === 'model'
        ? engineResult
            .communication_output
            .suggested_message !== null
        : null,

    communication_attempts:
      engineResult.mode === 'model'
        ? engineResult
            .communication_execution
            .attempts
        : null,

    communication_recovered_after_retry:
      engineResult.mode === 'model'
        ? engineResult
            .communication_execution
            .recovered_after_retry ===
          true
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

function buildCommonResult(
  activation:
    StatefulCopilotActivationDecision,
): StatefulCopilotRuntimeCommonResult {
  return {
    project_phase:
      STATEFUL_COPILOT_PROJECT_PHASE,

    project_subphase:
      STATEFUL_COPILOT_PROJECT_SUBPHASE,

    runtime_stage:
      STATEFUL_COPILOT_RUNTIME_STAGE,

    activation,

    automatic_crm_write:
      false,

    automatic_agenda_write:
      false,
  }
}

function normalizeOptionalRuntimeText(
  value: unknown,
): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized =
    value.trim()

  return normalized || null
}

function buildCompositionOptionsForActivation({
  activation,
  compositionOptions,
}: {
  activation:
    StatefulCopilotActivationDecision

  compositionOptions:
    StatefulCopilotServerCompositionOptions | undefined
}): StatefulCopilotServerCompositionOptions | undefined {
  if (
    activation.mode !== 'active' ||
    process.env.VERCEL_ENV === 'preview'
  ) {
    return compositionOptions
  }

  const explicitDiagnosticModel =
    normalizeOptionalRuntimeText(
      compositionOptions
        ?.openai_model,
    )

  const explicitCommunicationModel =
    normalizeOptionalRuntimeText(
      compositionOptions
        ?.openai_communication_model,
    )

  const configuredCommunicationModel =
    normalizeOptionalRuntimeText(
      process.env
        .OPENAI_STATEFUL_COMMUNICATION_MODEL,
    )

  return {
    ...(compositionOptions ?? {}),

    openai_model:
      explicitDiagnosticModel ??
      PHASE12A_ACTIVE_DIAGNOSTIC_MODEL,

    openai_communication_model:
      explicitCommunicationModel ??
      configuredCommunicationModel ??
      PHASE12A_ACTIVE_COMMUNICATION_MODEL,
  }
}

function ensureExecutableDecision(
  activation:
    StatefulCopilotActivationDecision,
): void {
  if (
    activation.should_execute_stateful !==
      true ||
    activation.should_persist_stateful_state !==
      true ||
    activation.automatic_crm_write !==
      false ||
    activation.automatic_agenda_write !==
      false
  ) {
    fail({
      code:
        'INVALID_STATEFUL_RUNTIME_ACTIVATION',

      message:
        'A decisao de ativacao nao permite uma execucao stateful segura.',

      statusCode:
        500,

      retryable:
        false,
    })
  }
}

function buildV1Result<
  TV1Response,
>({
  activation,
  response,
}: {
  activation:
    StatefulCopilotActivationDecision

  response:
    TV1Response
}): StatefulCopilotRuntimeV1Result<TV1Response> {
  return {
    ...buildCommonResult(
      activation,
    ),

    mode:
      'v1',

    response_source:
      'v1',

    stateful_executed:
      false,

    response,

    stateful_execution:
      null,

    stateful_failure:
      null,
  }
}

function buildShadowResult<
  TV1Response,
>({
  activation,
  response,
  context,
  result,
}: {
  activation:
    StatefulCopilotActivationDecision

  response:
    TV1Response

  context:
    StatefulCopilotRealContext

  result:
    StatefulCopilotIntegratedServiceResult
}): StatefulCopilotRuntimeShadowResult<TV1Response> {
  return {
    ...buildCommonResult(
      activation,
    ),

    mode:
      'shadow',

    response_source:
      'v1',

    stateful_executed:
      true,

    response,

    stateful_execution:
      buildExecutionSummary({
        context,
        result,
      }),

    stateful_failure:
      null,
  }
}

function buildActiveResult({
  activation,
  context,
  result,
}: {
  activation:
    StatefulCopilotActivationDecision

  context:
    StatefulCopilotRealContext

  result:
    StatefulCopilotIntegratedServiceResult
}): StatefulCopilotRuntimeActiveResult {
  if (
    result.engine_result.mode !==
    'model'
  ) {
    fail({
      code:
        'STATEFUL_RUNTIME_OUTPUT_UNAVAILABLE',

      message:
        'O resultado stateful ativo nao possui uma saida de modelo.',

      statusCode:
        500,

      retryable:
        false,
    })
  }

  return {
    ...buildCommonResult(
      activation,
    ),

    mode:
      'active',

    response_source:
      'stateful',

    stateful_executed:
      true,

    response:
      result
        .engine_result
        .output,

    commercial_reading:
      result
        .engine_result
        .communication_output
        .commercial_reading,

    stateful_execution:
      buildExecutionSummary({
        context,
        result,
      }),

    stateful_failure:
      null,
  }
}

function buildFallbackResult<
  TV1Response,
>({
  activation,
  response,
  context,
  result,
  failure,
  reason,
}: {
  activation:
    StatefulCopilotActivationDecision

  response:
    TV1Response

  context:
    StatefulCopilotRealContext | null

  result:
    StatefulCopilotIntegratedServiceResult | null

  failure:
    StatefulCopilotRuntimeFailure | null

  reason:
    StatefulCopilotRuntimeFallbackResult<
      TV1Response
    >['fallback_reason']
}): StatefulCopilotRuntimeFallbackResult<TV1Response> {
  return {
    ...buildCommonResult(
      activation,
    ),

    mode:
      'active_fallback_v1',

    response_source:
      'v1',

    stateful_executed:
      true,

    response,

    stateful_execution:
      context && result
        ? buildExecutionSummary({
            context,
            result,
          })
        : null,

    stateful_failure:
      failure,

    fallback_reason:
      reason,
  }
}

export function createStatefulCopilotServerRuntimeOrchestrator(
  options:
    StatefulCopilotServerRuntimeOptions = {},
): StatefulCopilotServerRuntimeOrchestrator {
  const dependencies =
    options.dependencies ??
    {}

  const resolveGate =
    dependencies.resolve_gate ??
    resolveStatefulCopilotActivationGate

  const createContextLoader =
    dependencies.create_context_loader ??
    createStatefulCopilotServerRealContextLoader

  const createComposition =
    dependencies.create_composition ??
    createStatefulCopilotServerComposition

  const runService =
    dependencies.run_service ??
    runStatefulCopilotIntegratedService

  const cycleDeadlineMs =
    resolveStatefulCopilotCycleDeadlineMs({
      configured_value:
        options.cycle_deadline_ms,
    })

  let runtime:
    {
      context_loader:
        StatefulCopilotRealContextLoader

      composition:
        StatefulCopilotComposition
    }
    | null =
      null

  function getRuntime(
    activation:
      StatefulCopilotActivationDecision,
  ) {
    if (runtime) {
      return runtime
    }

    const contextLoader =
      createContextLoader(
        options.context_loader_options,
      )

    const composition =
      createComposition(
        buildCompositionOptionsForActivation({
          activation,

          compositionOptions:
            options.composition_options,
        }),
      )

    runtime = {
      context_loader:
        contextLoader,

      composition,
    }

    return runtime
  }

  return async <
    TV1Response,
  >({
    company_id,
    cycle_id,
    conversation_key,
    device_key,
    reference_time,
    v1_response,
  }: RunStatefulCopilotServerRuntimeArgs<TV1Response>): Promise<
    StatefulCopilotServerRuntimeResult<TV1Response>
  > => {
    let activation:
      StatefulCopilotActivationDecision

    try {
      activation =
        resolveGate({
          company_id,

          configured_mode:
            options.configured_mode,

          configured_company_ids:
            options.configured_company_ids,

          configured_engine_version:
            options.configured_engine_version,
        })
    } catch {
      activation = {
        mode:
          'disabled',

        company_id:
          typeof company_id ===
          'string'
            ? company_id
                .trim()
                .toLowerCase()
            : '',

        allowed_company_ids:
          [],

        engine_version:
          null,

        enabled:
          false,

        should_execute_stateful:
          false,

        should_persist_stateful_state:
          false,

        should_expose_stateful_result:
          false,

        preserve_v1_response:
          true,

        automatic_crm_write:
          false,

        automatic_agenda_write:
          false,

        reason:
          'globally_disabled',
      }

      return buildV1Result({
        activation,

        response:
          v1_response,
      })
    }

    if (
      activation.should_execute_stateful !==
      true
    ) {
      return buildV1Result({
        activation,

        response:
          v1_response,
      })
    }

    let context:
      StatefulCopilotRealContext

    let integratedResult:
      StatefulCopilotIntegratedServiceResult

    try {
      ensureExecutableDecision(
        activation,
      )

      const {
        context_loader,
        composition,
      } =
        getRuntime(
          activation,
        )

      const deadlineAt =
        Date.now() +
        cycleDeadlineMs

      context =
        await context_loader({
          company_id,
          cycle_id,
          conversation_key,
          device_key,
          reference_time,
        })

      integratedResult =
        await runService({
          diagnostic_input:
            context.diagnostic_input,

          known_message_ids:
            context.known_message_ids,

          generated_at:
            context.loaded_at,

          reader:
            createLoadedStateReader(
              context,
            ),

          writer:
            wrapStatefulCopilotPersistenceWriterWithDeadline({
              writer:
                composition.writer,

              deadline_at:
                deadlineAt,
            }),

          provider:
            wrapStatefulCopilotProviderWithDeadline({
              provider:
                composition.provider,

              deadline_at:
                deadlineAt,
            }),

          create_memory_id:
            composition.create_memory_id,
        })
    } catch (error) {
      return buildFallbackResult({
        activation,

        response:
          v1_response,

        context:
          null,

        result:
          null,

        failure:
          normalizeFailure(
            error,
          ),

        reason:
          'stateful_runtime_failed',
      })
    }

    if (
      activation.mode ===
      'shadow'
    ) {
      return buildShadowResult({
        activation,

        response:
          v1_response,

        context,

        result:
          integratedResult,
      })
    }

    if (
      integratedResult
        .engine_result
        .mode !==
      'model'
    ) {
      return buildFallbackResult({
        activation,

        response:
          v1_response,

        context,

        result:
          integratedResult,

        failure:
          null,

        reason:
          'stateful_output_unavailable',
      })
    }

    if (
      integratedResult
        .persistence_result
        .mode !==
        'persisted' ||
      integratedResult
        .persistence_result
        .persisted !==
        true
    ) {
      return buildFallbackResult({
        activation,

        response:
          v1_response,

        context,

        result:
          integratedResult,

        failure:
          null,

        reason:
          'stateful_state_not_persisted',
      })
    }

    return buildActiveResult({
      activation,

      context,

      result:
        integratedResult,
    })
  }
}
