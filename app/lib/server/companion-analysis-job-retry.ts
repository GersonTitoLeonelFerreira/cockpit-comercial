import 'server-only'

import {
  createHash,
} from 'crypto'

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

import {
  recordCompanionRuntimePathDiagnostic,
} from './companion-runtime-path-diagnostics'

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

function buildManualRefreshWatermark({
  analysisJobId,
  messageWatermark,
  requestedAt,
}: {
  analysisJobId: string
  messageWatermark: string
  requestedAt: string
}) {
  return createHash(
    'sha256',
  )
    .update(
      JSON.stringify([
        'manual-refresh-v1',
        analysisJobId,
        messageWatermark,
        requestedAt,
      ]),
    )
    .digest(
      'hex',
    )
}

async function createFreshSupersededRefresh({
  admin,
  token,
  authorized,
  deviceKey,
  publish,
}: {
  admin: SupabaseClient
  token: CompanionTokenPayload
  authorized: Awaited<ReturnType<typeof loadCompanionAnalysisJobStatus>>
  deviceKey: string
  publish: QueuePublisher
}): Promise<CompanionAnalysisJobRetryResult> {
  const requestedAt =
    new Date()
      .toISOString()

  /*
   * Um job `superseded` não pode simplesmente voltar para queued com o
   * requested_at antigo: o worker usa requested_at como corte causal do
   * ledger. Reabrir a linha antiga faria uma ação explícita do vendedor
   * analisar novamente uma fotografia já obsoleta. O refresh manual cria
   * uma NOVA identidade de job, com novo watermark técnico e corte causal
   * atual, mantendo intacto o job superseded anterior para auditoria.
   *
   * O watermark abaixo é identidade de execução, não conteúdo comercial.
   * O runtime stateful continua lendo a verdade canônica pelo
   * company/cycle/conversation + requested_at.
   */
  const refreshedWatermark =
    buildManualRefreshWatermark({
      analysisJobId:
        authorized.analysis_job_id,
      messageWatermark:
        authorized.message_watermark,
      requestedAt,
    })

  const descriptor =
    buildStatefulCopilotBackgroundJobDescriptor({
      company_id:
        token.company_id,
      cycle_id:
        authorized.cycle_id,
      conversation_key:
        authorized.conversation_key,
      message_watermark:
        refreshedWatermark,
      requested_at:
        requestedAt,
    })

  const {
    data:
      insertedJob,
    error:
      insertError,
  } =
    await admin
      .from(
        'companion_background_analysis_jobs',
      )
      .insert({
        analysis_job_id:
          descriptor.analysis_job_id,
        company_id:
          descriptor.company_id,
        cycle_id:
          descriptor.cycle_id,
        conversation_key:
          descriptor.conversation_key,
        message_watermark:
          descriptor.message_watermark,
        status:
          'queued',
        requested_at:
          descriptor.requested_at,
        automatic_crm_write:
          false,
        automatic_agenda_write:
          false,
      })
      .select(
        'analysis_job_id, status, message_watermark',
      )
      .single()

  if (
    insertError ||
    !isRecord(
      insertedJob,
    )
  ) {
    fail({
      code:
        'ANALYSIS_JOB_REFRESH_CREATE_FAILED',
      message:
        'Não foi possível criar uma leitura atual para substituir o job obsoleto.',
      statusCode: 500,
      retryable: true,
    })
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
      token.company_id,
    cycle_id:
      authorized.cycle_id,
    analysis_job_id:
      descriptor.analysis_job_id,
    stage:
      'producer_refresh_superseded',
  })

  try {
    await publish(
      STATEFUL_COPILOT_BACKGROUND_QUEUE_TOPIC,
      queueMessage,
      {
        idempotencyKey:
          descriptor.analysis_job_id,
        retentionSeconds:
          24 * 60 * 60,
      },
    )
  } catch {
    const completedAt =
      new Date()
        .toISOString()

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
          descriptor.analysis_job_id,
        )
        .eq(
          'company_id',
          descriptor.company_id,
        )
        .eq(
          'cycle_id',
          descriptor.cycle_id,
        )
        .eq(
          'conversation_key',
          descriptor.conversation_key,
        )
        .eq(
          'message_watermark',
          descriptor.message_watermark,
        )
        .eq(
          'status',
          'queued',
        )

    if (compensationError) {
      fail({
        code:
          'ANALYSIS_JOB_REFRESH_COMPENSATION_FAILED',
        message:
          'A publicação da leitura atual falhou e não foi possível restaurar o estado com segurança.',
        statusCode: 500,
        retryable: true,
      })
    }

    return {
      analysis_job_id:
        descriptor.analysis_job_id,
      status:
        'failed',
      message_watermark:
        descriptor.message_watermark,
    }
  }

  return {
    analysis_job_id:
      descriptor.analysis_job_id,
    status:
      'queued',
    message_watermark:
      descriptor.message_watermark,
  }
}

export async function retryCompanionAnalysisJob({
  admin,
  token,
  analysis_job_id,
  device_key,
  allow_succeeded = false,
  publish,
}: {
  admin: SupabaseClient
  token: CompanionTokenPayload
  analysis_job_id: unknown
  device_key: unknown
  allow_succeeded?: boolean
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

  /*
   * `superseded` significa que o requested_at daquele job já foi vencido por
   * uma fotografia mais nova. Quando a ação é explicitamente autorizada
   * pelo vendedor (mesmo sinal já usado para refresh de succeeded), não
   * reabrimos essa fotografia antiga: criamos um job novo com corte causal
   * atual. Sem essa saída, o /analyze-conversation reaproveita para sempre o
   * mesmo job superseded por idempotência e o botão "Tentar novamente"
   * nunca consegue produzir uma nova leitura.
   */
  if (
    authorized.status ===
      'superseded' &&
    allow_succeeded
  ) {
    return createFreshSupersededRefresh({
      admin,
      token,
      authorized,
      deviceKey,
      publish,
    })
  }

  const requeueFromStatus =
    authorized.status === 'failed'
      ? 'failed'
      : (
          allow_succeeded &&
          authorized.status === 'succeeded'
        )
        ? 'succeeded'
        : null

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
       * failed/succeeded mantêm a identidade causal original. O caso
       * superseded é tratado acima por createFreshSupersededRefresh(),
       * justamente para nunca reaproveitar um corte causal obsoleto.
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
   * T28: só quem realmente fez terminal -> queued ganha o direito de
   * publicar. O perdedor do CAS apenas observa o estado real deixado pelo
   * vencedor.
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
