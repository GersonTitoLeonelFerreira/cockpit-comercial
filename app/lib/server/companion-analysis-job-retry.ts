import 'server-only'

import type {
  SupabaseClient,
} from '@supabase/supabase-js'

import type {
  CompanionTokenPayload,
} from './companion-token'

import {
  buildStatefulCopilotBackgroundJobDescriptor,
  buildStatefulCopilotBackgroundJobMessage,
  classifyStatefulCopilotBackgroundJobStaleness,
  STATEFUL_COPILOT_BACKGROUND_QUEUE_TOPIC,
} from './stateful-copilot-background-job'

import {
  CompanionAnalysisJobReadError,
  loadCompanionAnalysisJobStatus,
} from './companion-analysis-job-reader'

import {
  recordCompanionRuntimePathDiagnostic,
} from './companion-runtime-path-diagnostics'

import {
  companionDerivedTable,
  resolveCompanionExecutionScope,
  type CompanionExecutionScope,
} from '@/app/lib/companion/companion-execution-scope'

export type QueuePublisher = (
  topic: string,
  message: unknown,
  options: {
    idempotencyKey: string
    retentionSeconds: number
  },
) => Promise<unknown>

export type CompanionAnalysisJobRetryResult = {
  analysis_job_id: string
  status:
    'queued' | 'running' | 'succeeded' | 'failed' | 'superseded'
  message_watermark: string
  execution_scope: CompanionExecutionScope
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value)
  )
}

function fail({
  code,
  message,
  statusCode,
  retryable,
}: {
  code: string
  message: string
  statusCode: number
  retryable: boolean
}): never {
  throw new CompanionAnalysisJobReadError({
    code,
    message,
    status_code:
      statusCode,
    retryable,
  })
}

function normalizeDeviceKey(
  value: unknown,
): string {
  if (
    typeof value !== 'string'
  ) {
    fail({
      code:
        'INVALID_ANALYSIS_JOB_ARGUMENT',
      message:
        'device_key precisa ser um texto.',
      statusCode: 400,
      retryable: false,
    })
  }

  const normalized =
    value.trim()

  if (
    !normalized ||
    normalized.length > 100
  ) {
    fail({
      code:
        'INVALID_ANALYSIS_JOB_ARGUMENT',
      message:
        'device_key possui um valor inválido.',
      statusCode: 400,
      retryable: false,
    })
  }

  return normalized
}

function publicStatus(
  value: Awaited<ReturnType<typeof loadCompanionAnalysisJobStatus>>,
): CompanionAnalysisJobRetryResult {
  return {
    analysis_job_id:
      value.analysis_job_id,
    status:
      value.status,
    message_watermark:
      value.message_watermark,
    execution_scope:
      value.execution_scope,
  }
}

export type StaleAnalysisJobRow = {
  analysis_job_id: string
  company_id: string
  cycle_id: string
  conversation_key: string
  message_watermark: string
  status: string
  requested_at: string
  updated_at: string
  started_at: string | null
}

// R9 — recuperação determinística de job órfão. Um job `queued` sem sinal
// de execução além do limite, ou `running` com lease vencido, não é
// reaproveitado para sempre: um único produtor vence o CAS (status +
// updated_at), reabre o job (mesma identidade, mesmo requested_at) e
// publica uma entrega nova. Dois workers nunca rodam o mesmo job: o claim
// do worker é CAS em status='queued' e só existe um `running` por conversa.
// R10: só dentro do escopo — a tabela é a do escopo e a identidade do job
// precisa ser do escopo (homolog nunca reabre job de produção/legado).
export async function recoverStaleCompanionAnalysisJob({
  admin,
  job,
  device_key,
  publish,
  now_ms = Date.now(),
  execution_scope = resolveCompanionExecutionScope(),
}: {
  admin: SupabaseClient
  job: StaleAnalysisJobRow
  device_key: string
  publish: QueuePublisher
  now_ms?: number
  execution_scope?: CompanionExecutionScope
}): Promise<{ recovered: boolean; status: string }> {
  const staleness =
    classifyStatefulCopilotBackgroundJobStaleness({
      status: job.status,
      updated_at: job.updated_at,
      started_at: job.started_at,
      now_ms,
    })

  if (staleness === 'fresh') {
    return { recovered: false, status: job.status }
  }

  let descriptor:
    ReturnType<typeof buildStatefulCopilotBackgroundJobDescriptor>

  try {
    descriptor =
      buildStatefulCopilotBackgroundJobDescriptor({
        execution_scope,
        company_id: job.company_id,
        cycle_id: job.cycle_id,
        conversation_key: job.conversation_key,
        message_watermark: job.message_watermark,
        requested_at: job.requested_at,
        analysis_job_id: job.analysis_job_id,
      })
  } catch {
    return { recovered: false, status: job.status }
  }

  const jobsTable =
    companionDerivedTable('analysis_jobs', execution_scope)

  const recoveredAt =
    new Date(now_ms).toISOString()

  let casQuery =
    admin
      .from(jobsTable)
      .update({
        status: 'queued',
        started_at: null,
        completed_at: null,
        updated_at: recoveredAt,
        attempt_count: 0,
        failure_code: null,
        failure_path: null,
        failure_invariant: null,
        automatic_crm_write: false,
        automatic_agenda_write: false,
      })
      .eq('analysis_job_id', job.analysis_job_id)
      .eq('company_id', job.company_id)
      .eq('cycle_id', job.cycle_id)
      .eq('conversation_key', job.conversation_key)
      .eq('message_watermark', job.message_watermark)
      .eq('status', job.status)
      .eq('updated_at', job.updated_at)

  if (job.status === 'running' && job.started_at) {
    casQuery = casQuery.eq('started_at', job.started_at)
  }

  const { data: reopened, error: reopenError } =
    await casQuery
      .select('analysis_job_id')
      .maybeSingle()

  // Outro produtor venceu o CAS (ou o worker avançou o job): nada a fazer.
  if (reopenError || !isRecord(reopened)) {
    return { recovered: false, status: job.status }
  }

  await recordCompanionRuntimePathDiagnostic({
    admin,
    company_id: job.company_id,
    cycle_id: job.cycle_id,
    analysis_job_id: job.analysis_job_id,
    stage: 'producer_retry',
  })

  try {
    await publish(
      STATEFUL_COPILOT_BACKGROUND_QUEUE_TOPIC,
      buildStatefulCopilotBackgroundJobMessage({
        descriptor,
        device_key,
      }),
      {
        idempotencyKey:
          `${job.analysis_job_id}:recover:${now_ms}`,
        retentionSeconds:
          24 * 60 * 60,
      },
    )
  } catch {
    const failedAt =
      new Date().toISOString()

    await admin
      .from(jobsTable)
      .update({
        status: 'failed',
        completed_at: failedAt,
        updated_at: failedAt,
        failure_code: 'QUEUE_PUBLISH_FAILED',
        automatic_crm_write: false,
        automatic_agenda_write: false,
      })
      .eq('analysis_job_id', job.analysis_job_id)
      .eq('company_id', job.company_id)
      .eq('status', 'queued')
      .eq('updated_at', recoveredAt)

    return { recovered: false, status: 'failed' }
  }

  console.warn(
    'YOLEN_COMPANION_BACKGROUND_JOB',
    JSON.stringify({
      event: 'background_job_stale_recovered',
      execution_scope,
      company_id: job.company_id,
      cycle_id: job.cycle_id,
      analysis_job_id: job.analysis_job_id,
      staleness,
    }),
  )

  return { recovered: true, status: 'queued' }
}

export async function retryCompanionAnalysisJob({
  admin,
  token,
  analysis_job_id,
  device_key,
  allow_succeeded = false,
  publish,
  execution_scope = resolveCompanionExecutionScope(),
}: {
  admin: SupabaseClient
  token: CompanionTokenPayload
  analysis_job_id: unknown
  device_key: unknown
  allow_succeeded?: boolean
  publish: QueuePublisher
  // R10: só reabre/republica job do próprio escopo (tabela do escopo).
  execution_scope?: CompanionExecutionScope
}): Promise<CompanionAnalysisJobRetryResult> {
  const deviceKey =
    normalizeDeviceKey(
      device_key,
    )

  const jobsTable =
    companionDerivedTable('analysis_jobs', execution_scope)

  /*
   * A leitura canônica faz toda a cadeia de autorização antes de qualquer
   * tentativa de mutação: token -> membership atual -> company -> ciclo ->
   * ownership atual. Um IDOR nunca chega ao CAS.
   */
  const authorized =
    await loadCompanionAnalysisJobStatus({
      admin,
      token,
      execution_scope,
      analysis_job_id,
    })

  const requeueFromStatus =
    authorized.status === 'failed'
      ? 'failed'
      : (
          allow_succeeded &&
          authorized.status === 'succeeded'
        )
        ? 'succeeded'
        : null

  // "Tentar novamente" num job `queued`/`running` órfão: recuperação real
  // (republica), nunca devolver o mesmo job parado.
  if (
    !requeueFromStatus &&
    (
      authorized.status === 'queued' ||
      authorized.status === 'running'
    )
  ) {
    const { data: liveJob } =
      await admin
        .from(jobsTable)
        .select(
          'analysis_job_id, company_id, cycle_id, conversation_key, message_watermark, status, requested_at, updated_at, started_at',
        )
        .eq('analysis_job_id', authorized.analysis_job_id)
        .eq('company_id', token.company_id)
        .eq('cycle_id', authorized.cycle_id)
        .eq('conversation_key', authorized.conversation_key)
        .eq('message_watermark', authorized.message_watermark)
        .maybeSingle()

    if (
      isRecord(liveJob) &&
      typeof liveJob.requested_at === 'string' &&
      typeof liveJob.updated_at === 'string'
    ) {
      const recovery =
        await recoverStaleCompanionAnalysisJob({
          admin,
          job: {
            analysis_job_id: String(liveJob.analysis_job_id),
            company_id: String(liveJob.company_id),
            cycle_id: String(liveJob.cycle_id),
            conversation_key: String(liveJob.conversation_key),
            message_watermark: String(liveJob.message_watermark),
            status: String(liveJob.status),
            requested_at: liveJob.requested_at,
            updated_at: liveJob.updated_at,
            started_at:
              typeof liveJob.started_at === 'string'
                ? liveJob.started_at
                : null,
          },
          device_key: deviceKey,
          publish,
          execution_scope,
        })

      if (recovery.recovered) {
        return {
          analysis_job_id: authorized.analysis_job_id,
          status: 'queued',
          message_watermark: authorized.message_watermark,
          execution_scope,
        }
      }
    }
  }

  if (!requeueFromStatus) {
    return publicStatus(
      authorized,
    )
  }

  const companyId =
    token.company_id

  const {
    data:
      failedJob,
    error:
      failedJobError,
  } =
    await admin
      .from(
        jobsTable,
      )
      .select(
        'analysis_job_id, company_id, cycle_id, conversation_key, message_watermark, status, requested_at, updated_at',
      )
      .eq(
        'analysis_job_id',
        authorized.analysis_job_id,
      )
      .eq(
        'company_id',
        companyId,
      )
      .eq(
        'cycle_id',
        authorized.cycle_id,
      )
      .eq(
        'conversation_key',
        authorized.conversation_key,
      )
      .eq(
        'message_watermark',
        authorized.message_watermark,
      )
      .eq(
        'status',
        requeueFromStatus,
      )
      .maybeSingle()

  if (failedJobError) {
    fail({
      code:
        'ANALYSIS_JOB_RETRY_QUERY_FAILED',
      message:
        'Não foi possível preparar uma nova tentativa da análise profunda.',
      statusCode: 500,
      retryable: true,
    })
  }

  /*
   * Outra requisição pode ter vencido o CAS entre a autorização e esta
   * leitura. Nesse caso não publicamos nada; apenas devolvemos o estado real.
   */
  if (!isRecord(failedJob)) {
    return publicStatus(
      await loadCompanionAnalysisJobStatus({
        admin,
        token,
        execution_scope,
        analysis_job_id:
          authorized.analysis_job_id,
      }),
    )
  }

  if (
    failedJob.analysis_job_id !==
      authorized.analysis_job_id ||
    failedJob.company_id !== companyId ||
    failedJob.cycle_id !==
      authorized.cycle_id ||
    failedJob.conversation_key !==
      authorized.conversation_key ||
    failedJob.message_watermark !==
      authorized.message_watermark ||
    failedJob.status !== requeueFromStatus ||
    typeof failedJob.requested_at !== 'string' ||
    typeof failedJob.updated_at !== 'string'
  ) {
    fail({
      code:
        'DEEP_RESULT_INTEGRITY_ERROR',
      message:
        'O job profundo está inconsistente para nova tentativa.',
      statusCode: 500,
      retryable: false,
    })
  }

  // A identidade persistida precisa ser a do escopo (ou, só em produção, o
  // id legado anterior ao escopo).
  let descriptor:
    ReturnType<typeof buildStatefulCopilotBackgroundJobDescriptor> |
      null =
      null

  try {
    descriptor =
      buildStatefulCopilotBackgroundJobDescriptor({
        execution_scope,
        company_id:
          companyId,
        cycle_id:
          authorized.cycle_id,
        conversation_key:
          authorized.conversation_key,
        message_watermark:
          authorized.message_watermark,
        /*
         * O requested_at original é o corte causal do ledger. Alterá-lo com o
         * mesmo analysis_job_id faria a identidade do snapshot mentir.
         */
        requested_at:
          failedJob.requested_at,
        analysis_job_id:
          authorized.analysis_job_id,
      })
  } catch {
    descriptor = null
  }

  if (!descriptor) {
    fail({
      code:
        'DEEP_RESULT_INTEGRITY_ERROR',
      message:
        'A identidade do job profundo não corresponde ao snapshot persistido.',
      statusCode: 500,
      retryable: false,
    })
  }

  const retryQueuedAt =
    new Date()
      .toISOString()

  const {
    data:
      requeuedJob,
    error:
      requeueError,
  } =
    await admin
      .from(
        jobsTable,
      )
      .update({
        status:
          'queued',
        started_at:
          null,
        completed_at:
          null,
        updated_at:
          retryQueuedAt,
        runtime_mode:
          null,
        response_source:
          null,
        candidate_state_version:
          null,
        failure_code:
          null,
        failure_path:
          null,
        failure_invariant:
          null,
        communication_attempts:
          null,
        attempt_count:
          0,
        automatic_crm_write:
          false,
        automatic_agenda_write:
          false,
      })
      .eq(
        'analysis_job_id',
        authorized.analysis_job_id,
      )
      .eq(
        'company_id',
        companyId,
      )
      .eq(
        'cycle_id',
        authorized.cycle_id,
      )
      .eq(
        'conversation_key',
        authorized.conversation_key,
      )
      .eq(
        'message_watermark',
        authorized.message_watermark,
      )
      .eq(
        'status',
        requeueFromStatus,
      )
      .eq(
        'updated_at',
        failedJob.updated_at,
      )
      .select(
        'analysis_job_id, status, message_watermark, updated_at',
      )
      .maybeSingle()

  if (requeueError) {
    fail({
      code:
        'ANALYSIS_JOB_RETRY_WRITE_FAILED',
      message:
        'Não foi possível reabrir a análise profunda para nova tentativa.',
      statusCode: 500,
      retryable: true,
    })
  }

  /*
   * T28: só quem realmente fez failed -> queued ganha o direito de publicar.
   * O perdedor do CAS apenas observa o estado que o vencedor deixou.
   */
  if (!isRecord(requeuedJob)) {
    return publicStatus(
      await loadCompanionAnalysisJobStatus({
        admin,
        token,
        execution_scope,
        analysis_job_id:
          authorized.analysis_job_id,
      }),
    )
  }

  const queueMessage =
    buildStatefulCopilotBackgroundJobMessage({
      descriptor,
      device_key:
        deviceKey,
    })

  await recordCompanionRuntimePathDiagnostic({
    admin,
    company_id:
      companyId,
    cycle_id:
      authorized.cycle_id,
    analysis_job_id:
      authorized.analysis_job_id,
    stage:
      'producer_retry',
  })

  try {
    await publish(
      STATEFUL_COPILOT_BACKGROUND_QUEUE_TOPIC,
      queueMessage,
      {
        /*
         * Não reutiliza a key da publicação original. A identidade lógica do
         * job continua igual; a identidade da entrega manual é nova.
         */
        idempotencyKey:
          `${authorized.analysis_job_id}:retry:${Date.parse(retryQueuedAt)}`,
        retentionSeconds:
          24 * 60 * 60,
      },
    )
  } catch {
    const completedAt =
      new Date()
        .toISOString()

    /*
     * T27/T29: compensação compare-and-set. Ela só pode derrubar exatamente
     * o queued criado por ESTA tentativa; uma tentativa posterior já terá
     * outro updated_at e permanece intacta.
     */
    const {
      error:
        compensationError,
    } =
      await admin
        .from(
        jobsTable,
      )
        .update({
          status:
            'failed',
          completed_at:
            completedAt,
          updated_at:
            completedAt,
          failure_code:
            'QUEUE_PUBLISH_FAILED',
          automatic_crm_write:
            false,
          automatic_agenda_write:
            false,
        })
        .eq(
          'analysis_job_id',
          authorized.analysis_job_id,
        )
        .eq(
          'company_id',
          companyId,
        )
        .eq(
          'cycle_id',
          authorized.cycle_id,
        )
        .eq(
          'conversation_key',
          authorized.conversation_key,
        )
        .eq(
          'message_watermark',
          authorized.message_watermark,
        )
        .eq(
          'status',
          'queued',
        )
        .eq(
          'updated_at',
          retryQueuedAt,
        )

    if (compensationError) {
      fail({
        code:
          'ANALYSIS_JOB_RETRY_COMPENSATION_FAILED',
        message:
          'A publicação da nova tentativa falhou e não foi possível restaurar o estado com segurança.',
        statusCode: 500,
        retryable: true,
      })
    }

    return publicStatus(
      await loadCompanionAnalysisJobStatus({
        admin,
        token,
        execution_scope,
        analysis_job_id:
          authorized.analysis_job_id,
      }),
    )
  }

  return {
    analysis_job_id:
      authorized.analysis_job_id,
    status:
      'queued',
    message_watermark:
      authorized.message_watermark,
    execution_scope,
  }
}
