import 'server-only'

import { randomUUID } from 'crypto'

import {
  createClient,
  type SupabaseClient,
} from '@supabase/supabase-js'

import {
  parseMessageIntelligenceShadowJobV1,
  type MessageIntelligenceShadowJobV1,
} from './message-intelligence-shadow-job'

import {
  createMessageIntelligenceSourceLoaderV1,
} from './message-intelligence-source-loader'

import {
  runMessageIntelligenceV1,
  type MessageIntelligenceRunResultV1,
} from '@/app/lib/companion/message-intelligence/message-intelligence-runner'

import {
  MESSAGE_INTELLIGENCE_REQUEST_CONTRACT_VERSION,
} from '@/app/lib/companion/message-intelligence/contracts'

const SHADOW_RUNS_TABLE =
  'message_intelligence_shadow_runs'

const SHADOW_CLAIM_STALE_MS =
  180 * 1000

type ShadowExecutionStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'

type ShadowRunRead = {
  shadow_run_id: string
  execution_status: ShadowExecutionStatus
  claim_token: string | null
  claimed_at: string | null
}

class MessageIntelligenceShadowWorkerRetryError
  extends Error {
  readonly code: string

  constructor(code: string) {
    super(code)

    this.name =
      'MessageIntelligenceShadowWorkerRetryError'

    this.code =
      code
  }
}

function createAdminClient(): SupabaseClient {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new MessageIntelligenceShadowWorkerRetryError(
      'MESSAGE_INTELLIGENCE_SHADOW_CONFIGURATION_UNAVAILABLE',
    )
  }

  return createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  )
}

function safeFailureCode(
  value: unknown,
  fallback: string,
): string {
  if (
    typeof value === 'string' &&
    /^[A-Z0-9_]+$/.test(value) &&
    value.length <= 120
  ) {
    return value
  }

  return fallback
}

function safeFailureDetail(
  error: unknown,
): string | null {
  if (error instanceof Error) {
    return error.message.slice(0, 2000)
  }

  return null
}

function assertShadowSafety(
  run: MessageIntelligenceRunResultV1,
): void {
  const evaluation =
    run.shadow_evaluation

  if (
    evaluation.automatic_send !== false ||
    evaluation.automatic_crm_write !== false ||
    evaluation.automatic_agenda_write !== false
  ) {
    throw new Error(
      'SAFETY_VIOLATION: shadow evaluation carregou ação automática diferente de false.',
    )
  }
}

function asShadowRunRead(
  value: unknown,
): ShadowRunRead | null {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return null
  }

  const row =
    value as Record<string, unknown>

  if (
    typeof row.shadow_run_id !== 'string' ||
    ![
      'queued',
      'running',
      'succeeded',
      'failed',
    ].includes(
      String(row.execution_status),
    )
  ) {
    return null
  }

  return {
    shadow_run_id:
      row.shadow_run_id,
    execution_status:
      row.execution_status as
        ShadowExecutionStatus,
    claim_token:
      typeof row.claim_token === 'string'
        ? row.claim_token
        : null,
    claimed_at:
      typeof row.claimed_at === 'string'
        ? row.claimed_at
        : null,
  }
}

async function readShadowRun(
  admin: SupabaseClient,
  shadowRunId: string,
): Promise<ShadowRunRead | null> {
  let result:
    {
      data: unknown
      error: unknown
    }

  try {
    result =
      await admin
        .from(SHADOW_RUNS_TABLE)
        .select(
          'shadow_run_id, execution_status, claim_token, claimed_at',
        )
        .eq(
          'shadow_run_id',
          shadowRunId,
        )
        .maybeSingle()
  } catch {
    throw new MessageIntelligenceShadowWorkerRetryError(
      'MESSAGE_INTELLIGENCE_SHADOW_RUN_READ_FAILED',
    )
  }

  if (result.error) {
    throw new MessageIntelligenceShadowWorkerRetryError(
      'MESSAGE_INTELLIGENCE_SHADOW_RUN_READ_FAILED',
    )
  }

  if (!result.data) {
    return null
  }

  const normalized =
    asShadowRunRead(
      result.data,
    )

  if (!normalized) {
    throw new MessageIntelligenceShadowWorkerRetryError(
      'MESSAGE_INTELLIGENCE_SHADOW_RUN_READ_INVALID',
    )
  }

  return normalized
}

async function claimShadowRun({
  admin,
  existingRun,
  claimToken,
  now,
}: {
  admin: SupabaseClient
  existingRun: ShadowRunRead
  claimToken: string
  now: Date
}): Promise<boolean> {
  if (
    existingRun.execution_status ===
      'succeeded' ||
    existingRun.execution_status ===
      'failed'
  ) {
    return false
  }

  let query =
    admin
      .from(SHADOW_RUNS_TABLE)
      .update({
        execution_status:
          'running',
        claim_token:
          claimToken,
        claimed_at:
          now.toISOString(),
        completed_at:
          null,
      })
      .eq(
        'shadow_run_id',
        existingRun.shadow_run_id,
      )

  if (
    existingRun.execution_status ===
      'queued'
  ) {
    query =
      query.eq(
        'execution_status',
        'queued',
      )
  } else {
    if (
      !existingRun.claim_token ||
      !existingRun.claimed_at
    ) {
      throw new MessageIntelligenceShadowWorkerRetryError(
        'MESSAGE_INTELLIGENCE_SHADOW_RUNNING_CLAIM_INVALID',
      )
    }

    const claimedAt =
      Date.parse(
        existingRun.claimed_at,
      )

    if (
      !Number.isFinite(claimedAt)
    ) {
      throw new MessageIntelligenceShadowWorkerRetryError(
        'MESSAGE_INTELLIGENCE_SHADOW_RUNNING_CLAIM_INVALID',
      )
    }

    if (
      now.getTime() -
        claimedAt <
      SHADOW_CLAIM_STALE_MS
    ) {
      throw new MessageIntelligenceShadowWorkerRetryError(
        'MESSAGE_INTELLIGENCE_SHADOW_RUN_ALREADY_CLAIMED',
      )
    }

    query =
      query
        .eq(
          'execution_status',
          'running',
        )
        .eq(
          'claim_token',
          existingRun.claim_token,
        )
        .lte(
          'claimed_at',
          new Date(
            now.getTime() -
              SHADOW_CLAIM_STALE_MS,
          ).toISOString(),
        )
  }

  let result:
    {
      data: unknown
      error: unknown
    }

  try {
    result =
      await query
        .select(
          'shadow_run_id, execution_status, claim_token, claimed_at',
        )
        .maybeSingle()
  } catch {
    throw new MessageIntelligenceShadowWorkerRetryError(
      'MESSAGE_INTELLIGENCE_SHADOW_CLAIM_UPDATE_FAILED',
    )
  }

  if (result.error) {
    throw new MessageIntelligenceShadowWorkerRetryError(
      'MESSAGE_INTELLIGENCE_SHADOW_CLAIM_UPDATE_FAILED',
    )
  }

  if (!result.data) {
    // Outro worker venceu o compare-and-set. Este callback não executa
    // o pipeline e deixa a execução para o dono real do claim.
    return false
  }

  const claimed =
    asShadowRunRead(
      result.data,
    )

  if (
    !claimed ||
    claimed.execution_status !==
      'running' ||
    claimed.claim_token !==
      claimToken
  ) {
    throw new MessageIntelligenceShadowWorkerRetryError(
      'MESSAGE_INTELLIGENCE_SHADOW_CLAIM_CONFIRMATION_FAILED',
    )
  }

  return true
}

async function persistOwnedTerminalState({
  admin,
  shadowRunId,
  claimToken,
  patch,
  targetStatus,
  errorCode,
}: {
  admin: SupabaseClient
  shadowRunId: string
  claimToken: string
  patch: Record<string, unknown>
  targetStatus:
    | 'succeeded'
    | 'failed'
  errorCode: string
}): Promise<void> {
  let result:
    {
      data: unknown
      error: unknown
    }

  try {
    result =
      await admin
        .from(SHADOW_RUNS_TABLE)
        .update({
          ...patch,
          execution_status:
            targetStatus,
          claim_token:
            null,
          claimed_at:
            null,
        })
        .eq(
          'shadow_run_id',
          shadowRunId,
        )
        .eq(
          'execution_status',
          'running',
        )
        .eq(
          'claim_token',
          claimToken,
        )
        .select(
          'shadow_run_id, execution_status, claim_token, claimed_at',
        )
        .maybeSingle()
  } catch {
    throw new MessageIntelligenceShadowWorkerRetryError(
      errorCode,
    )
  }

  if (result.error) {
    throw new MessageIntelligenceShadowWorkerRetryError(
      errorCode,
    )
  }

  const persisted =
    asShadowRunRead(
      result.data,
    )

  if (
    !persisted ||
    persisted.execution_status !==
      targetStatus ||
    persisted.claim_token !== null ||
    persisted.claimed_at !== null
  ) {
    throw new MessageIntelligenceShadowWorkerRetryError(
      `${errorCode}_CLAIM_LOST`,
    )
  }
}

export type MessageIntelligenceShadowWorkerDependencies = {
  create_admin_client?:
    typeof createAdminClient

  run_message_intelligence?:
    typeof runMessageIntelligenceV1

  now?:
    () => Date

  create_claim_token?:
    () => string
}

export async function processMessageIntelligenceShadowMessage(
  rawMessage: unknown,
  dependencies: MessageIntelligenceShadowWorkerDependencies = {},
): Promise<void> {
  const createAdmin =
    dependencies.create_admin_client ??
    createAdminClient

  const now =
    dependencies.now ??
    (() => new Date())

  const createClaimToken =
    dependencies.create_claim_token ??
    randomUUID

  const job: MessageIntelligenceShadowJobV1 =
    parseMessageIntelligenceShadowJobV1(
      rawMessage,
    )

  const admin =
    createAdmin()

  const existingRun =
    await readShadowRun(
      admin,
      job.shadow_run_id,
    )

  if (!existingRun) {
    console.warn(
      'YOLEN_MESSAGE_INTELLIGENCE_SHADOW',
      JSON.stringify({
        event:
          'shadow_run_not_found',
        shadow_run_id:
          job.shadow_run_id,
      }),
    )

    return
  }

  if (
    existingRun.execution_status ===
      'succeeded' ||
    existingRun.execution_status ===
      'failed'
  ) {
    return
  }

  const claimToken =
    createClaimToken()

  const claimed =
    await claimShadowRun({
      admin,
      existingRun,
      claimToken,
      now: now(),
    })

  if (!claimed) {
    return
  }

  const runMessageIntelligence =
    dependencies.run_message_intelligence ??
    runMessageIntelligenceV1

  try {
    const sourceLoader =
      createMessageIntelligenceSourceLoaderV1({
        admin,
      })

    const run =
      await runMessageIntelligence({
        request: {
          contract_version:
            MESSAGE_INTELLIGENCE_REQUEST_CONTRACT_VERSION,
          request_id:
            job.shadow_run_id,
          company_id:
            job.company_id,
          seller_user_id:
            job.seller_user_id,
          cycle_id:
            job.cycle_id,
          conversation_key:
            job.conversation_key,
          seller_intent:
            job.seller_intent,
          reference_time:
            job.reference_time,
        },
        load_sources:
          sourceLoader,
      })

    assertShadowSafety(run)

    const evaluation =
      run.shadow_evaluation

    await persistOwnedTerminalState({
      admin,
      shadowRunId:
        job.shadow_run_id,
      claimToken,
      targetStatus:
        'succeeded',
      errorCode:
        'MESSAGE_INTELLIGENCE_SHADOW_SUCCESS_UPDATE_FAILED',
      patch: {
        mie_final_status:
          evaluation.final_status,
        mie_selected_candidate_id:
          evaluation.selected_candidate_id,
        mie_message:
          run.final_message_result
            .final_message?.text ?? null,

        hard_gate_status:
          run.hard_gate_result.status,
        candidate_count:
          evaluation.candidate_count,
        hard_gate_pass_count:
          evaluation.hard_gate_pass_count,

        critic_evaluated_count:
          evaluation.critic_evaluated_count,
        selected_critic_status:
          evaluation.selected_critic_status,
        selected_overall_score:
          evaluation.selected_overall_score,

        would_surface_message:
          evaluation.would_surface_message,

        automatic_send:
          false,
        automatic_crm_write:
          false,
        automatic_agenda_write:
          false,

        shadow_evaluation:
          evaluation,
        contract_versions: {
          request:
            MESSAGE_INTELLIGENCE_REQUEST_CONTRACT_VERSION,
          snapshot:
            run.snapshot.contract_version,
          strategy:
            run.strategy.contract_version,
          plan:
            run.plan.contract_version,
          generation_result:
            run.generation_result
              .contract_version,
          hard_gate_result:
            run.hard_gate_result
              .contract_version,
          critic_result:
            run.critic_result
              .contract_version,
          final_message_result:
            run.final_message_result
              .contract_version,
          shadow_evaluation:
            evaluation.contract_version,
        },

        completed_at:
          now().toISOString(),
      },
    })

    console.info(
      'YOLEN_MESSAGE_INTELLIGENCE_SHADOW',
      JSON.stringify({
        event:
          'shadow_run_succeeded',
        shadow_run_id:
          job.shadow_run_id,
        mie_final_status:
          evaluation.final_status,
        would_surface_message:
          evaluation.would_surface_message,
      }),
    )
  } catch (error) {
    if (
      error instanceof
        MessageIntelligenceShadowWorkerRetryError
    ) {
      throw error
    }

    const failureCode =
      error instanceof Error &&
      error.message.startsWith(
        'SAFETY_VIOLATION',
      )
        ? 'SAFETY_VIOLATION'
        : safeFailureCode(
            (
              error as
                | { code?: unknown }
                | null
            )?.code,
            'MESSAGE_INTELLIGENCE_SHADOW_RUN_FAILED',
          )

    await persistOwnedTerminalState({
      admin,
      shadowRunId:
        job.shadow_run_id,
      claimToken,
      targetStatus:
        'failed',
      errorCode:
        'MESSAGE_INTELLIGENCE_SHADOW_FAILURE_UPDATE_FAILED',
      patch: {
        failure_code:
          failureCode,
        failure_detail:
          safeFailureDetail(error),
        automatic_send:
          false,
        automatic_crm_write:
          false,
        automatic_agenda_write:
          false,
        completed_at:
          now().toISOString(),
      },
    })

    console.error(
      'YOLEN_MESSAGE_INTELLIGENCE_SHADOW',
      JSON.stringify({
        event:
          'shadow_run_failed',
        shadow_run_id:
          job.shadow_run_id,
        failure_code:
          failureCode,
      }),
    )
  }
}
