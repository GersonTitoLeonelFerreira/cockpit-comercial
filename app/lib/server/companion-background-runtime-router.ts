import 'server-only'

import {
  resolveCommercialReasoningCoreV2RuntimeSelection,
  type CommercialReasoningCoreV2RuntimeSelection,
} from '../companion/commercial-reasoning-core-v2-runtime-selector'

import {
  createCommercialReasoningCoreV2ServerRuntime,
  type CommercialReasoningCoreV2ServerRuntime,
} from './commercial-reasoning-core-v2-server-runtime'

import {
  createStatefulCopilotServerRuntimeOrchestrator,
} from './stateful-copilot-runtime-orchestrator'

import {
  STATEFUL_COPILOT_BACKGROUND_CYCLE_DEADLINE_MS,
} from './stateful-copilot-background-job'

export const COMPANION_DEEP_ANALYSIS_RUNTIME_ENV =
  'COMPANION_DEEP_ANALYSIS_RUNTIME' as const

export type CompanionBackgroundRuntime =
  | ReturnType<
      typeof createStatefulCopilotServerRuntimeOrchestrator
    >
  | CommercialReasoningCoreV2ServerRuntime

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

    return {
      selection,

      run_runtime:
        createCoreRuntime({
          cycle_deadline_ms:
            STATEFUL_COPILOT_BACKGROUND_CYCLE_DEADLINE_MS,
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
