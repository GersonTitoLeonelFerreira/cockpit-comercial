import type {
  StatefulCopilotOutput,
} from './stateful-copilot-contract'

import type {
  StatefulCopilotExecutionPlan,
} from './stateful-copilot-execution-plan'

import {
  StatefulCopilotExecutionError,
  executeStatefulCopilotModelAttempt,
  type StatefulCopilotExecutionAttemptResult,
  type StatefulCopilotProvider,
} from './stateful-copilot-executor'

const RETRYABLE_MODEL_OUTPUT_CODES =
  new Set([
    'EMPTY_MODEL_OUTPUT',
    'INVALID_MODEL_JSON',
    'INVALID_MODEL_OUTPUT',
  ])

type StatefulCopilotAttemptExecutor =
  typeof executeStatefulCopilotModelAttempt

export type StatefulCopilotOrchestratorDependencies = {
  execute_attempt?:
    StatefulCopilotAttemptExecutor
}

export type StatefulCopilotBlockedResult = {
  mode: 'blocked'

  output: null

  limitations: string[]

  execution: {
    mode: 'blocked'
    provider: 'deterministic'
    model: null
    request_id: null
    usage: null
    attempts: 0
    recovered_after_retry: false
  }
}

export type StatefulCopilotModelResult = {
  mode: 'model'

  output:
    StatefulCopilotOutput

  execution:
    StatefulCopilotExecutionAttemptResult[
      'execution'
    ] & {
      attempts: 1 | 2

      recovered_after_retry:
        boolean
    }
}

export type StatefulCopilotOrchestrationResult =
  | StatefulCopilotBlockedResult
  | StatefulCopilotModelResult

function shouldRetryModelOutput(
  error: unknown,
): boolean {
  return (
    error instanceof
      StatefulCopilotExecutionError &&
    RETRYABLE_MODEL_OUTPUT_CODES.has(
      error.code,
    )
  )
}

function buildModelResult({
  result,
  attempts,
}: {
  result:
    StatefulCopilotExecutionAttemptResult

  attempts:
    1 | 2
}): StatefulCopilotModelResult {
  return {
    mode:
      'model',

    output:
      result.output,

    execution: {
      ...result.execution,

      attempts,

      recovered_after_retry:
        attempts === 2,
    },
  }
}

export async function executeStatefulCopilotPlan({
  plan,
  provider,
  dependencies = {},
}: {
  plan:
    StatefulCopilotExecutionPlan

  provider:
    StatefulCopilotProvider

  dependencies?:
    StatefulCopilotOrchestratorDependencies
}): Promise<StatefulCopilotOrchestrationResult> {
  if (plan.mode === 'blocked') {
    return {
      mode:
        'blocked',

      output:
        null,

      limitations: [
        ...plan.limitations,
      ],

      execution: {
        mode:
          'blocked',

        provider:
          'deterministic',

        model:
          null,

        request_id:
          null,

        usage:
          null,

        attempts:
          0,

        recovered_after_retry:
          false,
      },
    }
  }

  const executeAttempt =
    dependencies.execute_attempt ??
    executeStatefulCopilotModelAttempt

  try {
    const firstResult =
      await executeAttempt({
        plan,
        provider,
      })

    return buildModelResult({
      result:
        firstResult,

      attempts:
        1,
    })
  } catch (error) {
    if (
      !shouldRetryModelOutput(
        error,
      )
    ) {
      throw error
    }
  }

  const secondResult =
    await executeAttempt({
      plan,
      provider,
    })

  return buildModelResult({
    result:
      secondResult,

    attempts:
      2,
  })
}
