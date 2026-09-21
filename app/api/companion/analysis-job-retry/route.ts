import {
  createClient,
} from '@supabase/supabase-js'

import {
  NextResponse,
} from 'next/server'

import {
  send,
} from '@vercel/queue'

import {
  processStatefulCopilotBackgroundMessage,
} from '@/app/lib/server/stateful-copilot-background-worker'

import {
  STATEFUL_COPILOT_BACKGROUND_CYCLE_DEADLINE_MS,
  STATEFUL_COPILOT_BACKGROUND_MAX_DELIVERY_ATTEMPTS,
} from '@/app/lib/server/stateful-copilot-background-job'

import {
  CompanionAnalysisJobReadError,
} from '@/app/lib/server/companion-analysis-job-reader'

import {
  retryCompanionAnalysisJob,
} from '@/app/lib/server/companion-analysis-job-retry'

import {
  verifyCompanionRequestToken,
} from '@/app/lib/server/companion-token'

type RetryAnalysisJobBody = {
  analysis_job_id?: unknown
  device_key?: unknown
  allow_succeeded?: unknown
}

const LOCAL_INLINE_BUSY_INITIAL_DELAY_MS =
  1_000

const LOCAL_INLINE_BUSY_MAX_DELAY_MS =
  5_000

function getLocalInlineWorkerErrorCode(
  error: unknown,
) {
  return error instanceof Error
    ? error.message
    : null
}

function isLocalInlineConversationBusy(
  error: unknown,
) {
  const code =
    getLocalInlineWorkerErrorCode(
      error,
    )

  return (
    code ===
      'BACKGROUND_CONVERSATION_BUSY' ||
    code ===
      'BACKGROUND_JOB_ALREADY_RUNNING'
  )
}

function sleepLocalInlineWorker(
  delayMs: number,
) {
  return new Promise<void>(
    (resolve) => {
      setTimeout(
        resolve,
        delayMs,
      )
    },
  )
}

function getLocalInlineAnalysisJobId(
  message: unknown,
) {
  if (
    !message ||
    typeof message !== 'object' ||
    Array.isArray(message)
  ) {
    return null
  }

  const analysisJobId =
    (message as {
      analysis_job_id?: unknown
    }).analysis_job_id

  return typeof analysisJobId === 'string' &&
    analysisJobId.trim()
    ? analysisJobId.trim()
    : null
}

function getCorsHeaders(
  request: Request,
) {
  const origin =
    request.headers.get(
      'origin',
    ) ?? ''

  const allowedOrigins = [
    'https://web.whatsapp.com',
    'https://cockpit-comercial-vocn.vercel.app',
    'http://localhost:3000',
  ]

  const isExtensionOrigin =
    origin.startsWith(
      'chrome-extension://',
    ) ||
    origin.startsWith(
      'moz-extension://',
    )

  const allowOrigin =
    allowedOrigins.includes(
      origin,
    ) ||
    isExtensionOrigin
      ? origin
      : 'https://cockpit-comercial-vocn.vercel.app'

  return {
    'Access-Control-Allow-Origin':
      allowOrigin,
    'Access-Control-Allow-Credentials':
      'true',
    'Access-Control-Allow-Methods':
      'POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization',
    Vary:
      'Origin',
  }
}

export async function OPTIONS(
  request: Request,
) {
  return new NextResponse(
    null,
    {
      status: 204,
      headers:
        getCorsHeaders(
          request,
        ),
    },
  )
}

/*
 * Este endpoint NÃO executa IA. Ele apenas reabre, mediante ação posterior
 * do vendedor, um job terminal `failed` do mesmo snapshot e o republica no
 * mesmo Queue/worker durable. `succeeded` e `superseded` nunca são reabertos.
 */
export async function POST(
  request: Request,
) {
  const corsHeaders =
    getCorsHeaders(
      request,
    )

  const token =
    verifyCompanionRequestToken(
      request,
    )

  if (!token) {
    return NextResponse.json(
      {
        ok: false,
        code:
          'INVALID_COMPANION_SESSION',
        error:
          'Sessão do Companion inválida ou expirada.',
      },
      {
        status: 401,
        headers:
          corsHeaders,
      },
    )
  }

  const body = (
    await request
      .json()
      .catch(
        () => ({}),
      )
  ) as RetryAnalysisJobBody

  const supabaseUrl =
    process.env
      .NEXT_PUBLIC_SUPABASE_URL

  const serviceRoleKey =
    process.env
      .SUPABASE_SERVICE_ROLE_KEY

  if (
    !supabaseUrl ||
    !serviceRoleKey
  ) {
    return NextResponse.json(
      {
        ok: false,
        code:
          'ANALYSIS_JOB_SERVER_NOT_CONFIGURED',
        error:
          'O servidor da análise profunda do Companion não está configurado.',
      },
      {
        status: 500,
        headers:
          corsHeaders,
      },
    )
  }

  const admin =
    createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession:
            false,
          autoRefreshToken:
            false,
        },
      },
    )

  try {
    const useLocalInlineWorker =
      process.env.NODE_ENV === 'development' &&
      process.env.COMPANION_LOCAL_INLINE_QUEUE === '1'

    const result =
      await retryCompanionAnalysisJob({
        admin,
        token,
        analysis_job_id:
          body.analysis_job_id,
        device_key:
          body.device_key,
        allow_succeeded:
          body.allow_succeeded === true,
        publish:
          useLocalInlineWorker
            ? async (
                _topic,
                message,
                _options,
              ) => {
                const localAnalysisJobId =
                  getLocalInlineAnalysisJobId(
                    message,
                  )

                console.info(
                  'YOLEN_COMPANION_BACKGROUND_JOB',
                  JSON.stringify({
                    event:
                      'local_inline_retry_worker_started',
                    analysis_job_id:
                      localAnalysisJobId,
                  }),
                )

                void (async () => {
                  let deliveryCount = 1
                  let lastError: unknown = null
                  let busyDelayMs =
                    LOCAL_INLINE_BUSY_INITIAL_DELAY_MS
                  const busyDeadlineMs =
                    Date.now() +
                    STATEFUL_COPILOT_BACKGROUND_CYCLE_DEADLINE_MS

                  while (
                    deliveryCount <=
                    STATEFUL_COPILOT_BACKGROUND_MAX_DELIVERY_ATTEMPTS
                  ) {
                    try {
                      await processStatefulCopilotBackgroundMessage(
                        message,
                        {
                          delivery_count:
                            deliveryCount,
                        },
                      )

                      return
                    } catch (error) {
                      lastError = error

                      console.warn(
                        'YOLEN_COMPANION_BACKGROUND_JOB',
                        JSON.stringify({
                          event:
                            'local_inline_retry_worker_failed',
                          analysis_job_id:
                            localAnalysisJobId,
                          delivery_count:
                            deliveryCount,
                          error:
                            getLocalInlineWorkerErrorCode(
                              error,
                            ) ||
                            'unknown_error',
                        }),
                      )

                      /*
                       * No Queue real, BACKGROUND_CONVERSATION_BUSY não
                       * consome cinco entregas em poucos milissegundos: a
                       * redelivery acontece depois que o job anterior tem
                       * chance de liberar o lock por conversa. O harness
                       * local fazia exatamente o oposto e deixava o job
                       * novo preso em queued para sempre. Enquanto a única
                       * causa for contenção com outro worker da mesma
                       * conversa, espera com backoff SEM consumir o budget
                       * de delivery. Falhas reais do worker continuam
                       * consumindo o limite durable normalmente.
                       */
                      if (
                        isLocalInlineConversationBusy(
                          error,
                        ) &&
                        Date.now() <
                          busyDeadlineMs
                      ) {
                        await sleepLocalInlineWorker(
                          busyDelayMs,
                        )

                        busyDelayMs =
                          Math.min(
                            busyDelayMs * 2,
                            LOCAL_INLINE_BUSY_MAX_DELAY_MS,
                          )

                        continue
                      }

                      if (
                        deliveryCount >=
                        STATEFUL_COPILOT_BACKGROUND_MAX_DELIVERY_ATTEMPTS
                      ) {
                        break
                      }

                      deliveryCount += 1
                    }
                  }

                  /*
                   * Se o harness local realmente esgotar a janela/budget,
                   * nunca deixa o job órfão em queued. Produção continua
                   * sem passar por este bloco — é apenas equivalência de
                   * estado terminal para o smoke local.
                   */
                  if (localAnalysisJobId) {
                    const completedAt =
                      new Date()
                        .toISOString()

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
                          'LOCAL_INLINE_WORKER_FAILED',
                        automatic_crm_write:
                          false,
                        automatic_agenda_write:
                          false,
                      })
                      .eq(
                        'analysis_job_id',
                        localAnalysisJobId,
                      )
                      .eq(
                        'company_id',
                        token.company_id,
                      )
                      .eq(
                        'status',
                        'queued',
                      )
                  }

                  console.warn(
                    'YOLEN_COMPANION_BACKGROUND_JOB',
                    JSON.stringify({
                      event:
                        'local_inline_retry_worker_exhausted',
                      analysis_job_id:
                        localAnalysisJobId,
                      error:
                        getLocalInlineWorkerErrorCode(
                          lastError,
                        ) ||
                        'unknown_error',
                    }),
                  )
                })()

                return null
              }
            : send,
      })

    return NextResponse.json(
      {
        ok: true,
        data: result,
      },
      {
        status: 200,
        headers:
          corsHeaders,
      },
    )
  } catch (error) {
    if (
      error instanceof
      CompanionAnalysisJobReadError
    ) {
      return NextResponse.json(
        {
          ok: false,
          code:
            error.code,
          error:
            error.message,
          retryable:
            error.retryable,
        },
        {
          status:
            error.status_code,
          headers:
            corsHeaders,
        },
      )
    }

    return NextResponse.json(
      {
        ok: false,
        code:
          'ANALYSIS_JOB_RETRY_UNEXPECTED_ERROR',
        error:
          'Não foi possível iniciar uma nova tentativa da análise profunda.',
      },
      {
        status: 500,
        headers:
          corsHeaders,
      },
    )
  }
}
