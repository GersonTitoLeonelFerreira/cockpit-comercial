import 'server-only'

import {
  resolveCommercialReasoningCoreV2RuntimeSelection,
  type CommercialReasoningCoreV2RuntimeSelection,
} from '../companion/commercial-reasoning-core-v2-runtime-selector'

import {
  createCommercialReasoningCoreV2LegacyV4BridgeWriter,
} from '../companion/commercial-reasoning-core-v2-v4-storage-bridge'

import type {
  StatefulCopilotOutput,
} from '../companion/stateful-copilot-contract'

import {
  createCommercialReasoningCoreV2ServerRuntime,
  type CommercialReasoningCoreV2ServerRuntime,
} from './commercial-reasoning-core-v2-server-runtime'

import {
  STATEFUL_COPILOT_PROJECT_PHASE,
  STATEFUL_COPILOT_PROJECT_SUBPHASE,
  STATEFUL_COPILOT_RUNTIME_STAGE,
  createStatefulCopilotServerRuntimeOrchestrator,
  type StatefulCopilotRuntimeExecutionSummary,
} from './stateful-copilot-runtime-orchestrator'

import {
  STATEFUL_COPILOT_BACKGROUND_CYCLE_DEADLINE_MS,
} from './stateful-copilot-background-job'

export const COMPANION_DEEP_ANALYSIS_RUNTIME_ENV =
  'COMPANION_DEEP_ANALYSIS_RUNTIME' as const

export type CompanionBackgroundRuntime =
  ReturnType<
    typeof createStatefulCopilotServerRuntimeOrchestrator
  >

export type CompanionBackgroundRuntimeRouterDependencies = {
  create_legacy_runtime?:
    typeof createStatefulCopilotServerRuntimeOrchestrator

  create_core_v2_runtime?:
    typeof createCommercialReasoningCoreV2ServerRuntime
}

export type CompanionBackgroundRuntimeResolution = {
  selection:
    CommercialReasoningCoreV2RuntimeSelection

  run_runtime:
    CompanionBackgroundRuntime
}

export function buildLegacyStatefulBackgroundRuntimeOptions(
  companyId:
    string,
) {
  return {
    configured_mode:
      'active' as const,

    configured_company_ids:
      companyId,

    configured_engine_version:
      'v2' as const,

    cycle_deadline_ms:
      STATEFUL_COPILOT_BACKGROUND_CYCLE_DEADLINE_MS,
  }
}

function buildCoreV2WorkerActivation(
  companyId:
    string,
) {
  return {
    mode:
      'active' as const,

    company_id:
      companyId,

    allowed_company_ids: [
      companyId,
    ],

    engine_version:
      'v2' as const,

    enabled:
      true,

    should_execute_stateful:
      true,

    should_persist_stateful_state:
      true,

    should_expose_stateful_result:
      true,

    preserve_v1_response:
      false,

    automatic_crm_write:
      false as const,

    automatic_agenda_write:
      false as const,

    reason:
      'active_enabled' as const,
  }
}

function adaptCoreV2Execution(
  execution:
    Awaited<
      ReturnType<
        CommercialReasoningCoreV2ServerRuntime
      >
    >['stateful_execution'],
): StatefulCopilotRuntimeExecutionSummary {
  return {
    engine_mode:
      execution.engine_mode,

    persistence_mode:
      execution.persistence_mode,

    persisted:
      execution.persisted,

    candidate_state_version:
      execution.candidate_state_version,

    output_contract_version:
      execution.output_contract_version,

    communication_contract_version:
      execution.communication_contract_version,

    communication_intervention_needed:
      execution.communication_intervention_needed,

    communication_message_present:
      execution.communication_message_present,

    communication_attempts:
      execution.communication_attempts,

    communication_recovered_after_retry:
      execution.communication_recovered_after_retry,

    known_message_count:
      execution.known_message_count,

    active_message_count:
      execution.active_message_count,

    commercial_config_status:
      execution.commercial_config_status,

    previous_state_found:
      execution.previous_state_found,
  }
}

function adaptCoreV2RuntimeForWorker({
  coreRuntime,
  companyId,
}: {
  coreRuntime:
    CommercialReasoningCoreV2ServerRuntime

  companyId:
    string
}): CompanionBackgroundRuntime {
  return async args => {
    const result =
      await coreRuntime(
        args,
      )

    const activation =
      buildCoreV2WorkerActivation(
        companyId,
      )

    const execution =
      adaptCoreV2Execution(
        result.stateful_execution,
      )

    const common = {
      project_phase:
        STATEFUL_COPILOT_PROJECT_PHASE,

      project_subphase:
        STATEFUL_COPILOT_PROJECT_SUBPHASE,

      runtime_stage:
        STATEFUL_COPILOT_RUNTIME_STAGE,

      activation,

      automatic_crm_write:
        false as const,

      automatic_agenda_write:
        false as const,
    }

    if (
      result.mode ===
      'core_v2_active'
    ) {
      return {
        ...common,

        mode:
          'active' as const,

        response_source:
          'stateful' as const,

        stateful_executed:
          true as const,

        response:
          result.response as unknown as
            StatefulCopilotOutput,

        commercial_reading:
          result.commercial_reading,

        stateful_execution:
          execution,

        stateful_failure:
          null,
      }
    }

    return {
      ...common,

      mode:
        'active_fallback_v1' as const,

      response_source:
        'v1' as const,

      stateful_executed:
        true as const,

      response:
        args.v1_response,

      stateful_execution:
        execution,

      stateful_failure:
        null,

      fallback_reason:
        execution.engine_mode ===
          'blocked'
          ? 'stateful_output_unavailable' as const
          : 'stateful_state_not_persisted' as const,
    }
  }
}

export function resolveCompanionBackgroundRuntime({
  company_id,
  configured_value =
    process.env[
      COMPANION_DEEP_ANALYSIS_RUNTIME_ENV
    ],
  dependencies = {},
}: {
  company_id:
    string

  configured_value?:
    unknown

  dependencies?:
    CompanionBackgroundRuntimeRouterDependencies
}): CompanionBackgroundRuntimeResolution {
  const selection =
    resolveCommercialReasoningCoreV2RuntimeSelection({
      configured_value,
    })

  if (
    selection
      .uses_commercial_reasoning_core_v2
  ) {
    const createCoreRuntime =
      dependencies
        .create_core_v2_runtime ??
      createCommercialReasoningCoreV2ServerRuntime

    const coreRuntime =
      createCoreRuntime({
        cycle_deadline_ms:
          STATEFUL_COPILOT_BACKGROUND_CYCLE_DEADLINE_MS,

        dependencies: {
          create_persistence_writer:
            createCommercialReasoningCoreV2LegacyV4BridgeWriter,
        },
      })

    return {
      selection,

      run_runtime:
        adaptCoreV2RuntimeForWorker({
          coreRuntime,
          companyId:
            company_id,
        }),
    }
  }

  const createLegacyRuntime =
    dependencies
      .create_legacy_runtime ??
    createStatefulCopilotServerRuntimeOrchestrator

  return {
    selection,

    run_runtime:
      createLegacyRuntime(
        buildLegacyStatefulBackgroundRuntimeOptions(
          company_id,
        ),
      ),
  }
}
