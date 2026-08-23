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
  STATEFUL_COPILOT_BACKGROUND_QUEUE_TOPIC,
} from './stateful-copilot-background-job'

import {
  CompanionAnalysisJobReadError,
  loadCompanionAnalysisJobStatus,
} from './companion-analysis-job-reader'

type QueuePublisher = (
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
  }
}

export async function retryCompanionAnalysisJob({
  admin,
  token,
  analysis_job_id,
  device_key,
  publish,
}: {
  admin: SupabaseClient
  token: CompanionTokenPayload
  analysis_job_id: unknown
  device_key: unknown
  publish: QueuePublisher
}): Promise<CompanionAnalysisJobRetryResult> {
  const deviceKey =
    normalizeDeviceKey(
      device_key,
    )

  /*
   * A leitura canônica faz toda a cadeia de autorização antes de qualquer
   * tentativa de mutação: token -> membership atual -> company -> ciclo ->
   * ownership atual. Um IDOR nunca chega ao CAS.
   */
  const authorized =
    await loadCompanionAnalysisJobStatus({
      admin,
      token,
      analysis_job_id,
    })

  if (
    authorized.status !== 'failed'
  ) {
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
        'companion_background_analysis_jobs',
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
        'failed',
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
    failedJob.status !== 'failed' ||
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

  const descriptor =
    buildStatefulCopilotBackgroundJobDescriptor({
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
    })

  if (
    descriptor.analysis_job_id !==
      authorized.analysis_job_id
  ) {
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
        'companion_background_analysis_jobs',
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
        'failed',
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
          'companion_background_analysis_jobs',
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
  }
}
