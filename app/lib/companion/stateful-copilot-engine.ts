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
  type StatefulCopilotGuardExhaustedResult,
  type StatefulCopilotModelResult,
} from './stateful-copilot-orchestrator'

import {
  reduceStatefulCommercialState,
  type StatefulCommercialMemoryIdFactory,
} from './stateful-commercial-state-reducer'

import type {
  StatefulCommercialState,
} from './stateful-commercial-state'

import {
  applyDurableMemorySeedToFreshState,
  type DurableMemorySeed,
} from './durable-memory-seed'

import {
  buildStatefulCommunicationExecutionPlan,
} from './stateful-communication-execution-plan'

import {
  executeStatefulCommunicationPlan,
  type StatefulCommunicationExecution,
} from './stateful-communication-executor'

import type {
  StatefulCommunicationOutput,
} from './stateful-communication-contract'

import {
  isCommerciallyActionable,
} from './commercial-relevance'

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

type StatefulCommunicationPlanBuilder =
  typeof buildStatefulCommunicationExecutionPlan

type StatefulCommunicationPlanExecutor =
  typeof executeStatefulCommunicationPlan

export type StatefulCopilotEngineDependencies = {
  build_input?:
    StatefulCopilotInputBuilder

  build_plan?:
    StatefulCopilotPlanBuilder

  execute_plan?:
    StatefulCopilotPlanExecutor

  build_communication_plan?:
    StatefulCommunicationPlanBuilder

  execute_communication?:
    StatefulCommunicationPlanExecutor

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

  // Fase 12A, Frente 2B — Blocker 4: memória durável do cliente extraída
  // de um ciclo ANTERIOR do mesmo lead. Só produz efeito quando este é,
  // de fato, o primeiro estado real do ciclo atual (previous_state
  // null) — ver applyDurableMemorySeedToFreshState.
  durable_memory_seed?:
    DurableMemorySeed | null

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

    communication_output: null

    communication_execution: null

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

    communication_output:
      StatefulCommunicationOutput

    communication_execution:
      StatefulCommunicationExecution

    candidate_state:
      StatefulCommercialState

    execution:
      StatefulCopilotModelResult['execution']
  }

// R1.2 (recuperação de regressão introduzida por 2aee87a7): espelha
// StatefulCopilotEngineBlockedResult, mas parte de um plano de MODELO
// (o Commercial Truth Guard foi violado de novo na segunda tentativa,
// já depois do reparo) — nunca de um plano bloqueado. output/
// communication_output/candidate_state permanecem null pelo mesmo
// motivo do bloqueio determinístico: nenhuma saída rejeitada pelo guard
// pode virar estado novo, e previous_state (herdado de
// StatefulCopilotEngineBaseResult) continua sendo o único estado
// comercial válido desta rodada.
export type StatefulCopilotEngineGuardExhaustedResult =
  StatefulCopilotEngineBaseResult & {
    mode: 'guard_exhausted'

    plan:
      StatefulCopilotModelPlan

    output: null

    communication_output: null

    communication_execution: null

    candidate_state: null

    limitations:
      string[]

    execution:
      StatefulCopilotGuardExhaustedResult['execution']
  }

export type StatefulCopilotEngineResult =
  | StatefulCopilotEngineBlockedResult
  | StatefulCopilotEngineModelResult
  | StatefulCopilotEngineGuardExhaustedResult

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

export function preservePreviousCommercialStateWhenClosed({
  candidateState,
  previousState,
  output,
}: {
  candidateState:
    StatefulCommercialState

  previousState:
    StatefulCommercialState | null

  output:
    StatefulCopilotOutput
}): StatefulCommercialState {
  const commercialStateCanChange =
    output.commercial_role ===
      'buyer' &&
    isCommerciallyActionable(
      output.commercial_relevance,
    )

  if (
    commercialStateCanChange ||
    previousState === null
  ) {
    return candidateState
  }

  const preservedEvidenceMessageIds = [
    ...previousState
      .last_evidence_message_ids,
  ]

  const carriedAnalyzedMessageIds = [
    ...new Set([
      ...preservedEvidenceMessageIds,
      ...candidateState
        .last_analyzed_message_ids,
    ]),
  ]

  return {
    ...candidateState,

    commercial_role:
      previousState.commercial_role,

    current_moment: {
      summary:
        previousState
          .current_moment
          .summary,

      evidence_message_ids: [
        ...previousState
          .current_moment
          .evidence_message_ids,
      ],
    },

    current_priority: {
      summary:
        previousState
          .current_priority
          .summary,

      evidence_message_ids: [
        ...previousState
          .current_priority
          .evidence_message_ids,
      ],
    },

    last_analyzed_message_ids:
      carriedAnalyzedMessageIds,

    last_evidence_message_ids:
      preservedEvidenceMessageIds,

    facts: [
      ...previousState.facts,
    ],

    needs: [
      ...previousState.needs,
    ],

    open_loops: [
      ...previousState.open_loops,
    ],

    objections: [
      ...previousState.objections,
    ],

    commitments: [
      ...previousState.commitments,
    ],

    signals: [
      ...previousState.signals,
    ],

    uncertainties: [
      ...previousState.uncertainties,
    ],
  }
}

export async function runStatefulCopilotEngine({
  diagnostic_input,
  previous_state,
  known_message_ids,
  provider,
  create_memory_id,
  durable_memory_seed = null,
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

  const buildCommunicationPlan =
    dependencies.build_communication_plan ??
    buildStatefulCommunicationExecutionPlan

  const executeCommunication =
    dependencies.execute_communication ??
    executeStatefulCommunicationPlan

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

      communication_output:
        null,

      communication_execution:
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

  // R1.2: guard esgotado só pode acontecer depois de um plano de
  // MODELO (a segunda tentativa, já reparada, violou o Commercial Truth
  // Guard de novo) — nunca depois de um plano bloqueado, que nem chega
  // a chamar o modelo.
  if (
    orchestration.mode ===
    'guard_exhausted'
  ) {
    if (
      plan.mode !==
      'model'
    ) {
      fail(
        'ENGINE_PLAN_RESULT_MISMATCH',
        'O motor recebeu um resultado de guard esgotado para um plano bloqueado.',
      )
    }

    return {
      mode:
        'guard_exhausted',

      input,

      plan,

      output:
        null,

      communication_output:
        null,

      communication_execution:
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

  const preservedCandidateState =
    preservePreviousCommercialStateWhenClosed({
      candidateState:
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
        }),

      previousState:
        input
          .state_context
          .previous_state,

      output:
        orchestration.output,
    })

  // Blocker 4: só produz efeito quando input.state_context.previous_state
  // é null, ou seja, este é o primeiro estado real deste ciclo — nunca em
  // uma rodada seguinte, onde o ciclo já tem vida própria.
  const diagnosticCandidateState =
    applyDurableMemorySeedToFreshState({
      candidateState:
        preservedCandidateState,

      previousState:
        input
          .state_context
          .previous_state,

      seed:
        durable_memory_seed,

      create_memory_id,
    })

  const communicationPlan =
    buildCommunicationPlan({
      input,

      diagnostic_output:
        orchestration.output,

      candidate_state:
        diagnosticCandidateState,
    })

  const communication =
    await executeCommunication({
      plan:
        communicationPlan,

      provider,
    })

  const output:
    StatefulCopilotOutput = {
      ...orchestration.output,

      strategy: {
        ...orchestration
          .output
          .strategy,

        method_application:
          communication
            .output
            .method_application,

        rationale:
          communication
            .output
            .guidance,

        next_move:
          communication
            .output
            .guidance,

        recommended_question:
          communication
            .output
            .recommended_question,

        suggested_message:
          communication
            .output
            .suggested_message,
      },
    }

  const commercialStateCanChange =
    output.commercial_role ===
      'buyer' &&
    isCommerciallyActionable(
      output.commercial_relevance,
    )

  const candidateState =
    commercialStateCanChange
      ? {
          ...diagnosticCandidateState,

          current_priority: {
            summary:
              output
                .strategy
                .next_move,

            evidence_message_ids: [
              ...output
                .strategy
                .evidence_message_ids,
            ],
          },
        }
      : diagnosticCandidateState

  return {
    mode:
      'model',

    input,

    plan,

    output:
      output,

    communication_output:
      communication.output,

    communication_execution:
      communication.execution,

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
