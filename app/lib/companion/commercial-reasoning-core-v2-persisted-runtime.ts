import {
  runCommercialReasoningCoreV2Runtime,
  type CommercialReasoningCoreV2RuntimeResult,
  type RunCommercialReasoningCoreV2RuntimeArgs,
} from './commercial-reasoning-core-v2-runtime'

import {
  buildCommercialReasoningCoreV2PersistencePlan,
  type CommercialReasoningCoreV2PersistencePlan,
} from './commercial-reasoning-core-v2-persistence-plan'

import {
  executeCommercialReasoningCoreV2Persistence,
  type CommercialReasoningCoreV2PersistenceExecutionResult,
  type CommercialReasoningCoreV2PersistenceWriter,
} from './commercial-reasoning-core-v2-persistence-executor'

export const COMMERCIAL_REASONING_CORE_V2_PERSISTED_RUNTIME_VERSION =
  'commercial-reasoning-core-v2-persisted-runtime-v1' as const

type CommercialReasoningCoreV2RuntimeRunner =
  typeof runCommercialReasoningCoreV2Runtime

type CommercialReasoningCoreV2PersistencePlanBuilder =
  typeof buildCommercialReasoningCoreV2PersistencePlan

type CommercialReasoningCoreV2PersistenceExecutor =
  typeof executeCommercialReasoningCoreV2Persistence

export type CommercialReasoningCoreV2PersistedRuntimeDependencies = {
  run_runtime?:
    CommercialReasoningCoreV2RuntimeRunner

  build_persistence_plan?:
    CommercialReasoningCoreV2PersistencePlanBuilder

  execute_persistence?:
    CommercialReasoningCoreV2PersistenceExecutor
}

export type RunCommercialReasoningCoreV2PersistedRuntimeArgs = {
  runtime_args:
    RunCommercialReasoningCoreV2RuntimeArgs

  persistence_writer:
    CommercialReasoningCoreV2PersistenceWriter

  generated_at:
    string

  dependencies?:
    CommercialReasoningCoreV2PersistedRuntimeDependencies
}

export type CommercialReasoningCoreV2PersistedRuntimeResult = {
  runtime_version:
    typeof COMMERCIAL_REASONING_CORE_V2_PERSISTED_RUNTIME_VERSION

  engine_source:
    'commercial_reasoning_core_v2'

  mode:
    CommercialReasoningCoreV2RuntimeResult['mode']

  model_calls:
    CommercialReasoningCoreV2RuntimeResult['model_calls']

  runtime_result:
    CommercialReasoningCoreV2RuntimeResult

  persistence_plan:
    CommercialReasoningCoreV2PersistencePlan

  persistence_result:
    CommercialReasoningCoreV2PersistenceExecutionResult

  persistence_mode:
    CommercialReasoningCoreV2PersistenceExecutionResult['mode']

  persisted:
    boolean

  automatic_crm_write:
    false

  automatic_agenda_write:
    false
}

export async function runCommercialReasoningCoreV2PersistedRuntime({
  runtime_args,
  persistence_writer,
  generated_at,
  dependencies = {},
}: RunCommercialReasoningCoreV2PersistedRuntimeArgs): Promise<
  CommercialReasoningCoreV2PersistedRuntimeResult
> {
  const runRuntime =
    dependencies.run_runtime ??
    runCommercialReasoningCoreV2Runtime

  const buildPersistencePlan =
    dependencies.build_persistence_plan ??
    buildCommercialReasoningCoreV2PersistencePlan

  const executePersistence =
    dependencies.execute_persistence ??
    executeCommercialReasoningCoreV2Persistence

  const runtimeResult =
    await runRuntime(
      runtime_args,
    )

  const persistencePlan =
    buildPersistencePlan({
      runtime_result:
        runtimeResult,

      generated_at,
    })

  const persistenceResult =
    await executePersistence({
      plan:
        persistencePlan,

      writer:
        persistence_writer,
    })

  return {
    runtime_version:
      COMMERCIAL_REASONING_CORE_V2_PERSISTED_RUNTIME_VERSION,

    engine_source:
      'commercial_reasoning_core_v2',

    mode:
      runtimeResult.mode,

    model_calls:
      runtimeResult.model_calls,

    runtime_result:
      runtimeResult,

    persistence_plan:
      persistencePlan,

    persistence_result:
      persistenceResult,

    persistence_mode:
      persistenceResult.mode,

    persisted:
      persistenceResult.persisted,

    automatic_crm_write:
      false,

    automatic_agenda_write:
      false,
  }
}
