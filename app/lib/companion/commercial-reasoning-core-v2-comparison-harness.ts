import type {
  CompanionDiagnosticInput,
} from './diagnostic-input'

import {
  buildStatefulCopilotInput,
} from './stateful-copilot-input'

import {
  runStatefulCopilotEngine,
  type StatefulCopilotEngineResult,
} from './stateful-copilot-engine'

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

type LegacyRunner =
  typeof runStatefulCopilotEngine

type CoreV2Runner =
  typeof runCommercialReasoningCoreV2

export type CommercialReasoningCoreV2ComparisonResult = {
  snapshot: {
    company_id: string
    cycle_id: string
    conversation_key: string
    active_message_count: number
    reference_time: string
  }

  legacy: {
    duration_ms: number
    mode: StatefulCopilotEngineResult['mode']
    diagnostic_attempts: number
    communication_attempts: number
    total_model_attempts: number
    result: StatefulCopilotEngineResult
  }

  v2: {
    duration_ms: number
    attempts: 1
    factual_guard_adjusted: boolean
    factual_guard_adjustment_codes: string[]
    result: CommercialReasoningCoreV2RunResult
  }

  delta: {
    model_attempts: number
    duration_ms: number
  }
}

export type RunCommercialReasoningCoreV2ComparisonArgs = {
  diagnostic_input: CompanionDiagnosticInput
  previous_state: unknown | null
  known_message_ids: unknown

  // Compatibilidade com os chamadores/testes existentes. Quando os providers
  // específicos abaixo não forem informados, ambos os motores usam este.
  provider: StatefulCopilotProvider

  // O replay real precisa preservar a arquitetura atual (diagnóstico +
  // comunicação) sem obrigar o novo Core V2 a usar o mesmo modelo.
  legacy_provider?: StatefulCopilotProvider
  v2_provider?: StatefulCopilotProvider

  create_memory_id: StatefulCommercialMemoryIdFactory
  durable_memory_seed?: DurableMemorySeed | null

  dependencies?: {
    run_legacy_engine?: LegacyRunner
    run_v2?: CoreV2Runner
    now?: () => number
  }
}

function getLegacyAttemptCounts(
  result: StatefulCopilotEngineResult,
) {
  if (result.mode !== 'model') {
    return {
      diagnostic_attempts: 0,
      communication_attempts: 0,
      total_model_attempts: 0,
    }
  }

  const diagnosticAttempts =
    result.execution.attempts

  const communicationAttempts =
    result.communication_execution.attempts

  return {
    diagnostic_attempts:
      diagnosticAttempts,
    communication_attempts:
      communicationAttempts,
    total_model_attempts:
      diagnosticAttempts +
      communicationAttempts,
  }
}

function elapsedMs(
  startedAt: number,
  finishedAt: number,
) {
  return Math.max(
    0,
    Math.round(
      finishedAt - startedAt,
    ),
  )
}

export async function runCommercialReasoningCoreV2Comparison({
  diagnostic_input,
  previous_state,
  known_message_ids,
  provider,
  legacy_provider = provider,
  v2_provider = provider,
  create_memory_id,
  durable_memory_seed = null,
  dependencies = {},
}: RunCommercialReasoningCoreV2ComparisonArgs): Promise<CommercialReasoningCoreV2ComparisonResult> {
  const runLegacyEngine =
    dependencies.run_legacy_engine ??
    runStatefulCopilotEngine

  const runV2 =
    dependencies.run_v2 ??
    runCommercialReasoningCoreV2

  const now =
    dependencies.now ??
    Date.now

  // O V2 recebe a mesma fotografia canônica de entrada do motor legado.
  // Construímos o input antes de executar qualquer motor para evitar que a
  // comparação dependa de estado candidato produzido pela execução anterior.
  const v2Input =
    buildStatefulCopilotInput({
      diagnostic_input,
      previous_state,
      known_message_ids,
    })

  const legacyStartedAt =
    now()

  const legacyResult =
    await runLegacyEngine({
      diagnostic_input,
      previous_state,
      known_message_ids,
      provider:
        legacy_provider,
      create_memory_id,
      durable_memory_seed,
    })

  const legacyFinishedAt =
    now()

  const v2StartedAt =
    now()

  const v2Result =
    await runV2({
      input: v2Input,
      provider:
        v2_provider,
    })

  const v2FinishedAt =
    now()

  const legacyDurationMs =
    elapsedMs(
      legacyStartedAt,
      legacyFinishedAt,
    )

  const v2DurationMs =
    elapsedMs(
      v2StartedAt,
      v2FinishedAt,
    )

  const legacyAttempts =
    getLegacyAttemptCounts(
      legacyResult,
    )

  return {
    snapshot: {
      company_id:
        diagnostic_input.company_id,
      cycle_id:
        diagnostic_input.cycle_id,
      conversation_key:
        diagnostic_input.conversation_key,
      active_message_count:
        diagnostic_input
          .conversation
          .messages
          .length,
      reference_time:
        diagnostic_input.reference_time,
    },

    legacy: {
      duration_ms:
        legacyDurationMs,
      mode:
        legacyResult.mode,
      ...legacyAttempts,
      result:
        legacyResult,
    },

    v2: {
      duration_ms:
        v2DurationMs,
      attempts:
        v2Result.execution.attempts,
      factual_guard_adjusted:
        v2Result
          .factual_guard
          .adjusted,
      factual_guard_adjustment_codes: [
        ...v2Result
          .factual_guard
          .adjustment_codes,
      ],
      result:
        v2Result,
    },

    delta: {
      model_attempts:
        v2Result.execution.attempts -
        legacyAttempts.total_model_attempts,
      duration_ms:
        v2DurationMs -
        legacyDurationMs,
    },
  }
}
