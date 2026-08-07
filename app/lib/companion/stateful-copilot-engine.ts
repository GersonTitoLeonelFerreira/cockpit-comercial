import type {
  CompanionDiagnosticInput,
} from './diagnostic-input'

import type {
  StatefulCopilotOutput,
} from './stateful-copilot-contract'

import {
  buildStatefulCopilotInput,
  type StatefulCopilotInput,
} from './stateful-copilot-input'

import {
  buildStatefulCopilotExecutionPlan,
  type StatefulCopilotExecutionPlan,
} from './stateful-copilot-execution-plan'

import type {
  StatefulCopilotProvider,
} from './stateful-copilot-executor'

import {
  executeStatefulCopilotPlan,
  type StatefulCopilotBlockedResult,
  type StatefulCopilotModelResult,
} from './stateful-copilot-orchestrator'

import {
  reduceStatefulCommercialState,
  type StatefulCommercialMemoryIdFactory,
} from './stateful-commercial-state-reducer'

import type {
  StatefulCommercialState,
} from './stateful-commercial-state'

type StatefulCopilotBlockedPlan =
  Extract<
    StatefulCopilotExecutionPlan,
    {
      mode: 'blocked'
    }
  >

type StatefulCopilotModelPlan =
  Extract<
    StatefulCopilotExecutionPlan,
    {
      mode: 'model'
    }
  >

type StatefulCopilotInputBuilder =
  typeof buildStatefulCopilotInput

type StatefulCopilotPlanBuilder =
  typeof buildStatefulCopilotExecutionPlan

type StatefulCopilotPlanExecutor =
  typeof executeStatefulCopilotPlan

type StatefulCommercialStateReducer =
  typeof reduceStatefulCommercialState

export type StatefulCopilotEngineDependencies = {
  build_input?:
    StatefulCopilotInputBuilder

  build_plan?:
    StatefulCopilotPlanBuilder

  execute_plan?:
    StatefulCopilotPlanExecutor

  reduce_state?:
    StatefulCommercialStateReducer
}

export type RunStatefulCopilotEngineArgs = {
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

  dependencies?:
    StatefulCopilotEngineDependencies
}

type StatefulCopilotEngineBaseResult = {
  input:
    StatefulCopilotInput

  previous_state:
    StatefulCommercialState | null
}

export type StatefulCopilotEngineBlockedResult =
  StatefulCopilotEngineBaseResult & {
    mode: 'blocked'

    plan:
      StatefulCopilotBlockedPlan

    output: null

    candidate_state: null

    limitations:
      string[]

    execution:
      StatefulCopilotBlockedResult['execution']
  }

export type StatefulCopilotEngineModelResult =
  StatefulCopilotEngineBaseResult & {
    mode: 'model'

    plan:
      StatefulCopilotModelPlan

    output:
      StatefulCopilotOutput

    candidate_state:
      StatefulCommercialState

    execution:
      StatefulCopilotModelResult['execution']
  }

export type StatefulCopilotEngineResult =
  | StatefulCopilotEngineBlockedResult
  | StatefulCopilotEngineModelResult

export class StatefulCopilotEngineError
  extends Error {
  readonly code: string

  constructor(
    code: string,
    message: string,
  ) {
    super(message)

    this.name =
      'StatefulCopilotEngineError'

    this.code =
      code
  }
}

function fail(
  code: string,
  message: string,
): never {
  throw new StatefulCopilotEngineError(
    code,
    message,
  )
}

export async function runStatefulCopilotEngine({
  diagnostic_input,
  previous_state,
  known_message_ids,
  provider,
  create_memory_id,
  dependencies = {},
}: RunStatefulCopilotEngineArgs): Promise<StatefulCopilotEngineResult> {
  const buildInput =
    dependencies.build_input ??
    buildStatefulCopilotInput

  const buildPlan =
    dependencies.build_plan ??
    buildStatefulCopilotExecutionPlan

  const executePlan =
    dependencies.execute_plan ??
    executeStatefulCopilotPlan

  const reduceState =
    dependencies.reduce_state ??
    reduceStatefulCommercialState

  const input =
    buildInput({
      diagnostic_input,
      previous_state,
      known_message_ids,
    })

  const plan =
    buildPlan(
      input,
    )

  const orchestration =
    await executePlan({
      plan,
      provider,
    })

  if (
    orchestration.mode ===
    'blocked'
  ) {
    if (
      plan.mode !==
      'blocked'
    ) {
      fail(
        'ENGINE_PLAN_RESULT_MISMATCH',
        'O motor recebeu resultado bloqueado para um plano de modelo.',
      )
    }

    return {
      mode:
        'blocked',

      input,

      plan,

      output:
        null,

      previous_state:
        input
          .state_context
          .previous_state,

      candidate_state:
        null,

      limitations: [
        ...orchestration.limitations,
      ],

      execution:
        orchestration.execution,
    }
  }

  if (
    plan.mode !==
    'model'
  ) {
    fail(
      'ENGINE_PLAN_RESULT_MISMATCH',
      'O motor recebeu resultado de modelo para um plano bloqueado.',
    )
  }

  const candidateState =
    reduceState({
      previous_state:
        input
          .state_context
          .previous_state,

      output:
        orchestration.output,

      cycle_id:
        input
          .diagnostic_input
          .cycle_id,

      applied_at:
        input
          .diagnostic_input
          .reference_time,

      create_memory_id,
    })

  return {
    mode:
      'model',

    input,

    plan,

    output:
      orchestration.output,

    previous_state:
      input
        .state_context
        .previous_state,

    candidate_state:
      candidateState,

    execution:
      orchestration.execution,
  }
}
