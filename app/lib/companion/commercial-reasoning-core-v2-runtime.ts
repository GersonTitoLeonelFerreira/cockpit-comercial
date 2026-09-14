import type {
  CompanionDiagnosticInput,
} from './diagnostic-input'

import {
  buildStatefulCopilotInput,
  type StatefulCopilotInput,
} from './stateful-copilot-input'

import type {
  StatefulCopilotProvider,
} from './stateful-copilot-executor'

import type {
  StatefulCommercialMemoryIdFactory,
} from './stateful-commercial-state-reducer'

import type {
  DurableMemorySeed,
} from './durable-memory-seed'

import {
  runCommercialReasoningCoreV2,
  type CommercialReasoningCoreV2RunResult,
} from './commercial-reasoning-core-v2'

import {
  reduceCommercialReasoningCoreV2Memory,
  type CommercialReasoningCoreV2MemoryReductionResult,
} from './commercial-reasoning-core-v2-memory-reducer'

import {
  buildCommercialReasoningCoreV2CommercialReading,
  type CommercialReasoningCoreV2CommercialReadingAdapterResult,
} from './commercial-reasoning-core-v2-commercial-reading-adapter'

import {
  buildCommercialReasoningCoreV2SellerProjection,
  type CommercialReasoningCoreV2SellerProjection,
} from './commercial-reasoning-core-v2-seller-adapter'

export const COMMERCIAL_REASONING_CORE_V2_RUNTIME_VERSION =
  'commercial-reasoning-core-v2-runtime-v1' as const

type StatefulCopilotInputBuilder =
  typeof buildStatefulCopilotInput

type CommercialReasoningCoreV2Runner =
  typeof runCommercialReasoningCoreV2

type CommercialReasoningCoreV2MemoryReducer =
  typeof reduceCommercialReasoningCoreV2Memory

type CommercialReasoningCoreV2CommercialReadingBuilder =
  typeof buildCommercialReasoningCoreV2CommercialReading

type CommercialReasoningCoreV2SellerProjectionBuilder =
  typeof buildCommercialReasoningCoreV2SellerProjection

export type CommercialReasoningCoreV2RuntimeDependencies = {
  build_input?:
    StatefulCopilotInputBuilder

  run_core?:
    CommercialReasoningCoreV2Runner

  reduce_memory?:
    CommercialReasoningCoreV2MemoryReducer

  build_commercial_reading?:
    CommercialReasoningCoreV2CommercialReadingBuilder

  build_seller_projection?:
    CommercialReasoningCoreV2SellerProjectionBuilder
}

export type RunCommercialReasoningCoreV2RuntimeArgs = {
  diagnostic_input:
    CompanionDiagnosticInput

  previous_state:
    unknown | null

  known_message_ids:
    unknown

  provider:
    StatefulCopilotProvider

  create_memory_id:
    StatefulCommercialMemoryIdFactory

  durable_memory_seed?:
    DurableMemorySeed | null

  dependencies?:
    CommercialReasoningCoreV2RuntimeDependencies
}

type CommercialReasoningCoreV2RuntimeBaseResult = {
  runtime_version:
    typeof COMMERCIAL_REASONING_CORE_V2_RUNTIME_VERSION

  engine_source:
    'commercial_reasoning_core_v2'

  input:
    StatefulCopilotInput

  automatic_crm_write:
    false

  automatic_agenda_write:
    false

  persistence_mode:
    'not_executed'
}

export type CommercialReasoningCoreV2RuntimeBlockedResult =
  CommercialReasoningCoreV2RuntimeBaseResult & {
    mode:
      'blocked'

    model_calls:
      0

    limitations:
      string[]

    core_result:
      null

    memory_reduction:
      null

    commercial_reading:
      null

    seller_projection:
      null
  }

export type CommercialReasoningCoreV2RuntimeModelResult =
  CommercialReasoningCoreV2RuntimeBaseResult & {
    mode:
      'model'

    model_calls:
      1

    limitations:
      string[]

    core_result:
      CommercialReasoningCoreV2RunResult

    memory_reduction:
      CommercialReasoningCoreV2MemoryReductionResult

    commercial_reading:
      CommercialReasoningCoreV2CommercialReadingAdapterResult

    seller_projection:
      CommercialReasoningCoreV2SellerProjection
  }

export type CommercialReasoningCoreV2RuntimeResult =
  | CommercialReasoningCoreV2RuntimeBlockedResult
  | CommercialReasoningCoreV2RuntimeModelResult

function buildBaseResult(
  input:
    StatefulCopilotInput,
): CommercialReasoningCoreV2RuntimeBaseResult {
  return {
    runtime_version:
      COMMERCIAL_REASONING_CORE_V2_RUNTIME_VERSION,

    engine_source:
      'commercial_reasoning_core_v2',

    input,

    automatic_crm_write:
      false,

    automatic_agenda_write:
      false,

    persistence_mode:
      'not_executed',
  }
}

export async function runCommercialReasoningCoreV2Runtime({
  diagnostic_input,
  previous_state,
  known_message_ids,
  provider,
  create_memory_id,
  durable_memory_seed = null,
  dependencies = {},
}: RunCommercialReasoningCoreV2RuntimeArgs): Promise<
  CommercialReasoningCoreV2RuntimeResult
> {
  const buildInput =
    dependencies.build_input ??
    buildStatefulCopilotInput

  const runCore =
    dependencies.run_core ??
    runCommercialReasoningCoreV2

  const reduceMemory =
    dependencies.reduce_memory ??
    reduceCommercialReasoningCoreV2Memory

  const buildCommercialReading =
    dependencies.build_commercial_reading ??
    buildCommercialReasoningCoreV2CommercialReading

  const buildSellerProjection =
    dependencies.build_seller_projection ??
    buildCommercialReasoningCoreV2SellerProjection

  const input =
    buildInput({
      diagnostic_input,

      previous_state,

      known_message_ids,
    })

  const precondition =
    input
      .diagnostic_input
      .analysis_precondition

  if (
    precondition.status ===
    'blocked'
  ) {
    return {
      ...buildBaseResult(
        input,
      ),

      mode:
        'blocked',

      model_calls:
        0,

      limitations:
        precondition
          .limitations
          .length > 0
          ? [
              ...precondition
                .limitations,
            ]
          : [
              'A fotografia comercial está bloqueada para análise.',
            ],

      core_result:
        null,

      memory_reduction:
        null,

      commercial_reading:
        null,

      seller_projection:
        null,
    }
  }

  const coreResult =
    await runCore({
      input,

      provider,

      durable_memory_seed,
    })

  const memoryReduction =
    reduceMemory({
      input,

      output:
        coreResult.output,

      applied_at:
        input
          .diagnostic_input
          .reference_time,

      create_memory_id,

      durable_memory_seed,
    })

  const commercialReading =
    buildCommercialReading({
      input,

      output:
        coreResult.output,

      memory_reduction:
        memoryReduction,
    })

  const sellerProjection =
    buildSellerProjection(
      coreResult.output,
    )

  return {
    ...buildBaseResult(
      input,
    ),

    mode:
      'model',

    model_calls:
      1,

    limitations:
      [
        ...input
          .diagnostic_input
          .analysis_precondition
          .limitations,
      ],

    core_result:
      coreResult,

    memory_reduction:
      memoryReduction,

    commercial_reading:
      commercialReading,

    seller_projection:
      sellerProjection,
  }
}
