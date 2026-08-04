import type {
  SupabaseClient,
} from '@supabase/supabase-js'

import {
  buildCompanionDiagnosticExecutionPlan,
  type CompanionDiagnosticExecutionPlan,
} from '../companion/diagnostic-execution-plan'

import {
  executeCompanionDiagnosticPlan,
  type CompanionDiagnosticExecutionResult,
  type CompanionDiagnosticModelOptions,
} from '../companion/diagnostic-model'

import {
  loadCompanionDiagnosticSnapshot,
  type CompanionDiagnosticSnapshot,
} from './companion-diagnostic-snapshot'

export const COMPANION_DIAGNOSTIC_ENGINE_VERSION =
  'phase-5-engine-v1' as const

export type CompanionDiagnosticEngineResult = {
  engine_version:
    typeof COMPANION_DIAGNOSTIC_ENGINE_VERSION

  source:
    CompanionDiagnosticSnapshot['source']

  diagnostic:
    CompanionDiagnosticExecutionResult['diagnostic']

  execution:
    CompanionDiagnosticExecutionResult['execution']
}

type SnapshotLoader =
  typeof loadCompanionDiagnosticSnapshot

type PlanBuilder =
  typeof buildCompanionDiagnosticExecutionPlan

type PlanExecutor =
  typeof executeCompanionDiagnosticPlan

export type CompanionDiagnosticEngineDependencies = {
  load_snapshot?: SnapshotLoader
  build_plan?: PlanBuilder
  execute_plan?: PlanExecutor
}

export type RunCompanionDiagnosticEngineArgs = {
  admin: SupabaseClient
  company_id: unknown
  cycle_id: unknown
  conversation_key: unknown
  reference_time: unknown

  model_options?:
    CompanionDiagnosticModelOptions

  dependencies?:
    CompanionDiagnosticEngineDependencies
}

export class CompanionDiagnosticEngineError
  extends Error {
  readonly code: string
  readonly status_code: number
  readonly retryable: boolean

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
      'CompanionDiagnosticEngineError'

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
  status_code,
  retryable,
}: {
  code: string
  message: string
  status_code: number
  retryable: boolean
}): never {
  throw new CompanionDiagnosticEngineError({
    code,
    message,
    status_code,
    retryable,
  })
}

function validatePlanAgainstSnapshot({
  snapshot,
  plan,
}: {
  snapshot:
    CompanionDiagnosticSnapshot

  plan:
    CompanionDiagnosticExecutionPlan
}) {
  const inputStatus =
    snapshot.input
      .analysis_precondition
      .status

  if (
    inputStatus === 'blocked' &&
    plan.mode !== 'blocked'
  ) {
    fail({
      code:
        'DIAGNOSTIC_PLAN_MISMATCH',

      message:
        'A fotografia bloqueada gerou um plano incompatível.',

      status_code: 500,
      retryable: false,
    })
  }

  if (
    inputStatus !== 'blocked' &&
    plan.mode !== 'model'
  ) {
    fail({
      code:
        'DIAGNOSTIC_PLAN_MISMATCH',

      message:
        'A fotografia executável gerou um plano incompatível.',

      status_code: 500,
      retryable: false,
    })
  }
}

function validateExecutionAgainstPlan({
  plan,
  execution,
}: {
  plan:
    CompanionDiagnosticExecutionPlan

  execution:
    CompanionDiagnosticExecutionResult
}) {
  if (
    plan.mode === 'blocked' &&
    (
      execution.execution.mode !==
        'blocked' ||
      execution.execution.provider !==
        'deterministic'
    )
  ) {
    fail({
      code:
        'DIAGNOSTIC_EXECUTION_MISMATCH',

      message:
        'A execução bloqueada retornou uma origem incompatível.',

      status_code: 500,
      retryable: false,
    })
  }

  if (
    plan.mode === 'model' &&
    (
      execution.execution.mode !==
        'model' ||
      execution.execution.provider !==
        'openai'
    )
  ) {
    fail({
      code:
        'DIAGNOSTIC_EXECUTION_MISMATCH',

      message:
        'A execução pelo modelo retornou uma origem incompatível.',

      status_code: 500,
      retryable: false,
    })
  }
}

function validateResultScope({
  snapshot,
  result,
}: {
  snapshot:
    CompanionDiagnosticSnapshot

  result:
    CompanionDiagnosticExecutionResult
}) {
  const availableMessageIds =
    new Set(
      snapshot.input
        .conversation
        .active_message_ids,
    )

  for (
    const evidenceMessageId of
    result.diagnostic
      .evidence_message_ids
  ) {
    if (
      !availableMessageIds.has(
        evidenceMessageId,
      )
    ) {
      fail({
        code:
          'DIAGNOSTIC_SCOPE_VIOLATION',

        message:
          'O diagnóstico retornou evidência fora da fotografia canônica.',

        status_code: 500,
        retryable: false,
      })
    }
  }

  if (
    result.diagnostic
      .crm_suggestion
      .requires_human_confirmation !==
    true
  ) {
    fail({
      code:
        'DIAGNOSTIC_CONFIRMATION_REQUIRED',

      message:
        'O diagnóstico não preservou a confirmação humana obrigatória.',

      status_code: 500,
      retryable: false,
    })
  }
}

export async function runCompanionDiagnosticEngine({
  admin,
  company_id,
  cycle_id,
  conversation_key,
  reference_time,
  model_options = {},
  dependencies = {},
}: RunCompanionDiagnosticEngineArgs): Promise<
  CompanionDiagnosticEngineResult
> {
  const loadSnapshot =
    dependencies.load_snapshot ??
    loadCompanionDiagnosticSnapshot

  const buildPlan =
    dependencies.build_plan ??
    buildCompanionDiagnosticExecutionPlan

  const executePlan =
    dependencies.execute_plan ??
    executeCompanionDiagnosticPlan

  const snapshot =
    await loadSnapshot({
      admin,
      company_id,
      cycle_id,
      conversation_key,
      reference_time,
    })

  const plan =
    buildPlan(
      snapshot.input,
    )

  validatePlanAgainstSnapshot({
    snapshot,
    plan,
  })

  const execution =
    await executePlan({
      plan,
      input:
        snapshot.input,
      options:
        model_options,
    })

  validateExecutionAgainstPlan({
    plan,
    execution,
  })

  validateResultScope({
    snapshot,
    result:
      execution,
  })

  return {
    engine_version:
      COMPANION_DIAGNOSTIC_ENGINE_VERSION,

    source:
      snapshot.source,

    diagnostic:
      execution.diagnostic,

    execution:
      execution.execution,
  }
}
