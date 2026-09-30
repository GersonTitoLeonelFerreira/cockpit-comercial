import 'server-only'

import {
  createClient,
} from '@supabase/supabase-js'

import {
  STATEFUL_COPILOT_BACKGROUND_CYCLE_DEADLINE_MS,
  STATEFUL_COPILOT_BACKGROUND_MAX_DELIVERY_ATTEMPTS,
  STATEFUL_COPILOT_BACKGROUND_RUNNING_LEASE_MS,
  parseStatefulCopilotBackgroundJobMessage,
  resolveStatefulCopilotBackgroundFailureOutcome,
  shouldRetryStatefulCopilotBackgroundFailure,
} from './stateful-copilot-background-job'

import {
  createStatefulCopilotServerRuntimeOrchestrator,
} from './stateful-copilot-runtime-orchestrator'

import {
  recordCompanionRuntimePathDiagnostic,
} from './companion-runtime-path-diagnostics'

import {
  companionDerivedTable,
  resolveCompanionExecutionScope,
  type CompanionExecutionScope,
} from '@/app/lib/companion/companion-execution-scope'

export class StatefulCopilotBackgroundRetryError
  extends Error {
  constructor(
    code:
      string,
  ) {
    super(
      code,
    )

    this.name =
      'StatefulCopilotBackgroundRetryError'
  }
}

// Mensagem da fila que não é um job válido: nenhuma nova entrega a torna
// processável (a fila deve dar ack, não reentregar).
export class StatefulCopilotBackgroundInvalidMessageError
  extends Error {
  constructor(
    message:
      string,
  ) {
    super(
      message,
    )

    this.name =
      'StatefulCopilotBackgroundInvalidMessageError'
  }
}

function isRecord(
  value:
    unknown,
): value is Record<string, unknown> {
  return (
    Boolean(value) &&
    typeof value ===
      'object' &&
    !Array.isArray(
      value,
    )
  )
}

function safeFailureCode(
  value:
    unknown,
  fallback:
    string,
): string {
  if (
    typeof value ===
      'string' &&
    /^[A-Z0-9_]+$/.test(
      value,
    ) &&
    value.length <=
      120
  ) {
    return value
  }

  return fallback
}

function shouldUseLocalInlineRedelivery() {
  return (
    process.env.NODE_ENV ===
      'development' &&
    process.env
      .COMPANION_LOCAL_INLINE_QUEUE ===
      '1'
  )
}

function createAdminClient() {
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
    throw new StatefulCopilotBackgroundRetryError(
      'BACKGROUND_CONFIGURATION_UNAVAILABLE',
    )
  }

  return createClient(
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
}

export function buildStatefulCopilotBackgroundRuntimeOptions(
  companyId:
    string,
  executionScope:
    CompanionExecutionScope =
      resolveCompanionExecutionScope(),
) {
  return {
    execution_scope:
      executionScope,

    configured_mode:
      'active' as const,

    configured_company_ids:
      companyId,

    configured_engine_version:
      'v2' as const,

    cycle_deadline_ms:
      STATEFUL_COPILOT_BACKGROUND_CYCLE_DEADLINE_MS,
  }
}

export type StatefulCopilotBackgroundWorkerDependencies = {
  create_admin_client?:
    typeof createAdminClient

  run_runtime?:
    ReturnType<
      typeof createStatefulCopilotServerRuntimeOrchestrator
    >

  // Escopo do deployment que consome a fila (padrão: VERCEL_ENV). Teste
  // injeta para exercitar produção e homolog no mesmo processo.
  execution_scope?:
    CompanionExecutionScope
}

// Encerra (failed) jobs `running` da mesma conversa cujo lease venceu: o
// worker tem maxDuration menor que o lease, então o dono já morreu. CAS em
// started_at: um reclaim concorrente nunca é derrubado por engano.
async function releaseExpiredRunningJobs({
  admin,
  jobs_table,
  job,
}: {
  admin: ReturnType<typeof createAdminClient>
  // Tabela de jobs do escopo do job: o lease só é liberado dentro dele.
  jobs_table: string
  job: {
    analysis_job_id: string
    company_id: string
    cycle_id: string
    conversation_key: string
  }
}): Promise<boolean> {
  const {
    data,
    error,
  } =
    await admin
      .from(
        jobs_table,
      )
      .select(
        'analysis_job_id, started_at',
      )
      .eq(
        'company_id',
        job.company_id,
      )
      .eq(
        'cycle_id',
        job.cycle_id,
      )
      .eq(
        'conversation_key',
        job.conversation_key,
      )
      .eq(
        'status',
        'running',
      )
      .neq(
        'analysis_job_id',
        job.analysis_job_id,
      )
      .limit(5)

  if (error || !Array.isArray(data)) {
    return false
  }

  let released = false
  const now = Date.now()

  for (const row of data) {
    const startedAt =
      typeof row?.started_at === 'string'
        ? Date.parse(row.started_at)
        : Number.NaN

    if (
      !Number.isFinite(startedAt) ||
      now - startedAt <
        STATEFUL_COPILOT_BACKGROUND_RUNNING_LEASE_MS
    ) {
      continue
    }

    const releasedAt =
      new Date(now)
        .toISOString()

    const {
      data: releasedRow,
      error: releaseError,
    } =
      await admin
        .from(
          jobs_table,
        )
        .update({
          status:
            'failed',
          completed_at:
            releasedAt,
          updated_at:
            releasedAt,
          failure_code:
            'BACKGROUND_WORKER_LEASE_EXPIRED',
          automatic_crm_write:
            false,
          automatic_agenda_write:
            false,
        })
        .eq(
          'analysis_job_id',
          row.analysis_job_id,
        )
        .eq(
          'company_id',
          job.company_id,
        )
        .eq(
          'status',
          'running',
        )
        .eq(
          'started_at',
          row.started_at,
        )
        .select(
          'analysis_job_id',
        )
        .maybeSingle()

    if (!releaseError && releasedRow) {
      released = true

      console.warn(
        'YOLEN_COMPANION_STATEFUL_BACKGROUND',
        JSON.stringify({
          event:
            'background_expired_running_job_released',
          company_id:
            job.company_id,
          cycle_id:
            job.cycle_id,
          released_analysis_job_id:
            row.analysis_job_id,
          blocked_analysis_job_id:
            job.analysis_job_id,
        }),
      )
    }
  }

  return released
}

export async function processStatefulCopilotBackgroundMessage(
  rawMessage:
    unknown,
  {
    delivery_count,
  }: {
    delivery_count:
      number
  },
  // Injeção só usada por teste (ver stateful-copilot-background-worker.test.mjs)
  // para exercitar o ciclo real running -> conflict -> queued -> nova
  // entrega -> succeeded sem depender de um Supabase de verdade. Em
  // produção, ambas seguem sendo sempre as implementações reais.
  dependencies:
    StatefulCopilotBackgroundWorkerDependencies = {},
): Promise<void> {
  const createAdmin =
    dependencies.create_admin_client ??
    createAdminClient

  let job:
    ReturnType<
      typeof parseStatefulCopilotBackgroundJobMessage
    >

  try {
    job =
      parseStatefulCopilotBackgroundJobMessage(
        rawMessage,
      )
  } catch (error) {
    throw new StatefulCopilotBackgroundInvalidMessageError(
      error instanceof Error
        ? error.message
        : 'Mensagem do job background inválida.',
    )
  }

  // R10: um deployment só executa job do próprio escopo. A fila já é por
  // deployment; isto garante que nem uma mensagem republicada/forjada de
  // outro ambiente seja processada aqui (ack, nunca reentregue).
  const deploymentScope =
    dependencies.execution_scope ??
    resolveCompanionExecutionScope()

  if (
    job.execution_scope !==
    deploymentScope
  ) {
    console.warn(
      'YOLEN_COMPANION_STATEFUL_BACKGROUND',
      JSON.stringify({
        event:
          'background_job_scope_mismatch',
        company_id:
          job.company_id,
        analysis_job_id:
          job.analysis_job_id,
        job_execution_scope:
          job.execution_scope,
        deployment_execution_scope:
          deploymentScope,
      }),
    )

    throw new StatefulCopilotBackgroundInvalidMessageError(
      'BACKGROUND_EXECUTION_SCOPE_MISMATCH',
    )
  }

  const jobsTable =
    companionDerivedTable(
      'analysis_jobs',
      job.execution_scope,
    )

  /*
   * O endpoint /api/companion/analyze-conversation é V2-only. Portanto o
   * worker que consome esses jobs também precisa ser V2-only por construção,
   * sem depender de COMPANION_STATEFUL_MODE / allowlist / engine version da
   * implantação. A empresa autorizada é exatamente a empresa persistida no
   * próprio job; o worker ainda exige a linha canônica do banco antes de
   * executar qualquer IA.
   */
  const runRuntime =
    dependencies.run_runtime ??
    createStatefulCopilotServerRuntimeOrchestrator(
      buildStatefulCopilotBackgroundRuntimeOptions(
        job.company_id,
        job.execution_scope,
      ),
    )

  const admin =
    createAdmin()

  await recordCompanionRuntimePathDiagnostic({
    admin,
    company_id:
      job.company_id,
    cycle_id:
      job.cycle_id,
    analysis_job_id:
      job.analysis_job_id,
    stage:
      'consumer_start',
  })

  const {
    data:
      currentJob,

    error:
      currentJobError,
  } =
    await admin
      .from(
        jobsTable,
      )
      .select(
        'analysis_job_id, status, started_at',
      )
      .eq(
        'analysis_job_id',
        job.analysis_job_id,
      )
      .eq(
        'company_id',
        job.company_id,
      )
      .eq(
        'cycle_id',
        job.cycle_id,
      )
      .eq(
        'conversation_key',
        job.conversation_key,
      )
      .eq(
        'message_watermark',
        job.message_watermark,
      )
      .maybeSingle()

  if (
    currentJobError
  ) {
    throw new StatefulCopilotBackgroundRetryError(
      'BACKGROUND_JOB_READ_FAILED',
    )
  }

  /*
   * A queue sozinha não autoriza execução.
   * A linha persistida no banco prova o job.
   */
  if (
    !currentJob
  ) {
    console.warn(
      'YOLEN_COMPANION_STATEFUL_BACKGROUND',
      JSON.stringify({
        event:
          'background_job_not_found',

        company_id:
          job.company_id,

        cycle_id:
          job.cycle_id,

        analysis_job_id:
          job.analysis_job_id,
      }),
    )

    return
  }

  if (
    currentJob.status ===
      'succeeded' ||
    currentJob.status ===
      'failed' ||
    currentJob.status ===
      'superseded'
  ) {
    return
  }

  /*
   * Se já existe fotografia mais nova da mesma conversa,
   * não vale gastar IA nem persistir interpretação antiga.
   */
  const {
    data:
      newerJob,

    error:
      newerJobError,
  } =
    await admin
      .from(
        jobsTable,
      )
      .select(
        'analysis_job_id',
      )
      .eq(
        'company_id',
        job.company_id,
      )
      .eq(
        'cycle_id',
        job.cycle_id,
      )
      .eq(
        'conversation_key',
        job.conversation_key,
      )
      .gt(
        'requested_at',
        job.requested_at,
      )
      .order(
        'requested_at',
        {
          ascending:
            true,
        },
      )
      .limit(
        1,
      )
      .maybeSingle()

  if (
    newerJobError
  ) {
    throw new StatefulCopilotBackgroundRetryError(
      'BACKGROUND_NEWER_JOB_CHECK_FAILED',
    )
  }

  const startedAt =
    new Date()
      .toISOString()

  if (
    newerJob
  ) {
    const {
      error:
        supersededError,
    } =
      await admin
        .from(
          jobsTable,
        )
        .update({
          status:
            'superseded',

          started_at:
            currentJob
              .started_at ??
            startedAt,

          completed_at:
            startedAt,

          updated_at:
            startedAt,

          attempt_count:
            delivery_count,

          automatic_crm_write:
            false,

          automatic_agenda_write:
            false,
        })
        .eq(
          'analysis_job_id',
          job.analysis_job_id,
        )
        .eq(
          'company_id',
          job.company_id,
        )
        .eq(
          'cycle_id',
          job.cycle_id,
        )
        .eq(
          'conversation_key',
          job.conversation_key,
        )
        .eq(
          'message_watermark',
          job.message_watermark,
        )

    if (
      supersededError
    ) {
      throw new StatefulCopilotBackgroundRetryError(
        'BACKGROUND_SUPERSEDE_WRITE_FAILED',
      )
    }

    console.info(
      'YOLEN_COMPANION_STATEFUL_BACKGROUND',
      JSON.stringify({
        event:
          'background_analysis_superseded',

        company_id:
          job.company_id,

        cycle_id:
          job.cycle_id,

        analysis_job_id:
          job.analysis_job_id,
      }),
    )

    return
  }

  const previousStartedAt =
    typeof currentJob
      .started_at ===
      'string'
      ? currentJob
          .started_at
      : null

  const previousStartedAtMs =
    previousStartedAt
      ? Date.parse(
          previousStartedAt,
        )
      : Number.NaN

  const runningLeaseExpired =
    currentJob.status ===
      'running' &&
    Number.isFinite(
      previousStartedAtMs,
    ) &&
    Date.now() -
      previousStartedAtMs >=
      STATEFUL_COPILOT_BACKGROUND_RUNNING_LEASE_MS

  if (
    currentJob.status ===
      'running' &&
    !runningLeaseExpired
  ) {
    // A entrega dona está viva (lease válido). Na última entrega não há
    // o que reagendar: ela conclui o job ou, se morrer, o lease vence e a
    // recuperação do produtor reabre o job.
    if (
      delivery_count >=
      STATEFUL_COPILOT_BACKGROUND_MAX_DELIVERY_ATTEMPTS
    ) {
      return
    }

    throw new StatefulCopilotBackgroundRetryError(
      'BACKGROUND_JOB_ALREADY_RUNNING',
    )
  }

  const buildClaimQuery = () => {
  let claimQuery =
    admin
      .from(
        jobsTable,
      )
      .update({
        status:
          'running',

        started_at:
          startedAt,

        completed_at:
          null,

        updated_at:
          startedAt,

        attempt_count:
          delivery_count,

        failure_code:
          null,

        failure_path:
          null,

        failure_invariant:
          null,

        automatic_crm_write:
          false,

        automatic_agenda_write:
          false,
      })
      .eq(
        'analysis_job_id',
        job.analysis_job_id,
      )
      .eq(
        'company_id',
        job.company_id,
      )
      .eq(
        'cycle_id',
        job.cycle_id,
      )
      .eq(
        'conversation_key',
        job.conversation_key,
      )
      .eq(
        'message_watermark',
        job.message_watermark,
      )

  if (
    currentJob.status ===
      'running'
  ) {
    claimQuery =
      claimQuery
        .eq(
          'status',
          'running',
        )
        .eq(
          'started_at',
          previousStartedAt,
        )
  } else {
    claimQuery =
      claimQuery
        .eq(
          'status',
          'queued',
        )
  }

  return claimQuery
  }

  let {
    data:
      claimedJob,

    error:
      claimJobError,
  } =
    await buildClaimQuery()
      .select(
        'analysis_job_id',
      )
      .maybeSingle()

  // Outro job da MESMA conversa está `running` (índice
  // one_running_per_conversation). Se o dono dele morreu (lease vencido),
  // ele é encerrado de forma determinística e o claim é refeito uma vez;
  // sem isso, um único worker morto bloqueava a conversa para sempre.
  if (
    claimJobError
      ?.code ===
      '23505' &&
    await releaseExpiredRunningJobs({
      admin,
      jobs_table:
        jobsTable,
      job,
    })
  ) {
    const retried =
      await buildClaimQuery()
        .select(
          'analysis_job_id',
        )
        .maybeSingle()

    claimedJob =
      retried.data

    claimJobError =
      retried.error
  }

  if (
    claimJobError
      ?.code ===
      '23505'
  ) {
    // Última entrega ainda disputando com um job vivo: estado terminal
    // recuperável (o vendedor pode tentar de novo), nunca queued eterno.
    if (
      delivery_count >=
      STATEFUL_COPILOT_BACKGROUND_MAX_DELIVERY_ATTEMPTS
    ) {
      const exhaustedAt =
        new Date()
          .toISOString()

      await admin
        .from(
          jobsTable,
        )
        .update({
          status:
            'failed',
          completed_at:
            exhaustedAt,
          updated_at:
            exhaustedAt,
          attempt_count:
            delivery_count,
          failure_code:
            'BACKGROUND_CONVERSATION_BUSY',
          automatic_crm_write:
            false,
          automatic_agenda_write:
            false,
        })
        .eq(
          'analysis_job_id',
          job.analysis_job_id,
        )
        .eq(
          'company_id',
          job.company_id,
        )
        .eq(
          'status',
          'queued',
        )

      return
    }

    throw new StatefulCopilotBackgroundRetryError(
      'BACKGROUND_CONVERSATION_BUSY',
    )
  }

  if (
    claimJobError
  ) {
    throw new StatefulCopilotBackgroundRetryError(
      'BACKGROUND_JOB_START_FAILED',
    )
  }

  if (
    !claimedJob
  ) {
    throw new StatefulCopilotBackgroundRetryError(
      'BACKGROUND_JOB_CLAIM_LOST',
    )
  }

  const runtimeStartedAt =
    Date.now()

  const requestedAtMs =
    Date.parse(
      job.requested_at,
    )

  const queueWaitMs =
    Number.isFinite(
      requestedAtMs,
    )
      ? Math.max(
          0,
          runtimeStartedAt -
            requestedAtMs,
        )
      : null

  console.info(
    'YOLEN_COMPANION_STATEFUL_BACKGROUND',
    JSON.stringify({
      event:
        'background_analysis_started',
      company_id:
        job.company_id,
      cycle_id:
        job.cycle_id,
      analysis_job_id:
        job.analysis_job_id,
      delivery_count,
      queue_wait_ms:
        queueWaitMs,
    }),
  )

  try {
    const statefulResult =
      await runRuntime({
        company_id:
          job.company_id,

        cycle_id:
          job.cycle_id,

        conversation_key:
          job.conversation_key,

        device_key:
          job.device_key,

        /*
         * Este timestamp é também o corte máximo
         * permitido no ledger pelo context loader.
         */
        reference_time:
          job.requested_at,

        force_reanalysis:
          job.force_reanalysis === true,

        v1_response:
          undefined,
      })

    const completedAt =
      new Date()
        .toISOString()

    /*
     * Segunda barreira de safety.
     * O V2 background jamais pode realizar essas escritas.
     */
    if (
      statefulResult
        .automatic_crm_write !==
        false ||
      statefulResult
        .automatic_agenda_write !==
        false
    ) {
      const {
        error:
          safetyError,
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
              'AUTOMATIC_WRITE_SAFETY_VIOLATION',

            automatic_crm_write:
              false,

            automatic_agenda_write:
              false,
          })
          .eq(
            'analysis_job_id',
            job.analysis_job_id,
          )
          .eq(
            'company_id',
            job.company_id,
          )
          .eq(
            'cycle_id',
            job.cycle_id,
          )
          .eq(
            'conversation_key',
            job.conversation_key,
          )
          .eq(
            'message_watermark',
            job.message_watermark,
          )
          .eq(
            'status',
            'running',
          )
          .eq(
            'started_at',
            startedAt,
          )

      if (
        safetyError
      ) {
        throw new StatefulCopilotBackgroundRetryError(
          'BACKGROUND_SAFETY_WRITE_FAILED',
        )
      }

      return
    }

    /*
     * Terceira barreira de safety: entre o início da execução (checagem
     * de "newer job" antes de chamar o modelo, acima) e a escrita de
     * sucesso, uma janela real de corrida existe — a chamada ao modelo
     * pode levar até o cycle deadline. Se uma análise mais nova para a
     * mesma conversa foi enfileirada nesse intervalo, esta execução
     * (agora obsoleta) nunca pode gravar `succeeded`: isso avançaria
     * candidate_state_version com uma interpretação já ultrapassada,
     * mesmo que o cliente final ainda descarte o resultado pelo
     * watermark. Revalida e, se houver job mais novo, marca esta
     * execução como superseded em vez de succeeded.
     */
    const {
      data:
        newerJobBeforeSuccess,

      error:
        newerJobBeforeSuccessError,
    } =
      await admin
        .from(
          jobsTable,
        )
        .select(
          'analysis_job_id',
        )
        .eq(
          'company_id',
          job.company_id,
        )
        .eq(
          'cycle_id',
          job.cycle_id,
        )
        .eq(
          'conversation_key',
          job.conversation_key,
        )
        .gt(
          'requested_at',
          job.requested_at,
        )
        .order(
          'requested_at',
          {
            ascending:
              true,
          },
        )
        .limit(
          1,
        )
        .maybeSingle()

    if (
      newerJobBeforeSuccessError
    ) {
      throw new StatefulCopilotBackgroundRetryError(
        'BACKGROUND_NEWER_JOB_CHECK_FAILED',
      )
    }

    if (
      newerJobBeforeSuccess
    ) {
      const completedAt =
        new Date()
          .toISOString()

      const {
        error:
          lateSupersededError,
      } =
        await admin
          .from(
            jobsTable,
          )
          .update({
            status:
              'superseded',

            completed_at:
              completedAt,

            updated_at:
              completedAt,

            automatic_crm_write:
              false,

            automatic_agenda_write:
              false,
          })
          .eq(
            'analysis_job_id',
            job.analysis_job_id,
          )
          .eq(
            'company_id',
            job.company_id,
          )
          .eq(
            'cycle_id',
            job.cycle_id,
          )
          .eq(
            'conversation_key',
            job.conversation_key,
          )
          .eq(
            'message_watermark',
            job.message_watermark,
          )
          .eq(
            'status',
            'running',
          )
          .eq(
            'started_at',
            startedAt,
          )

      if (
        lateSupersededError
      ) {
        throw new StatefulCopilotBackgroundRetryError(
          'BACKGROUND_SUPERSEDE_WRITE_FAILED',
        )
      }

      console.info(
        'YOLEN_COMPANION_STATEFUL_BACKGROUND',
        JSON.stringify({
          event:
            'background_analysis_superseded_late',

          company_id:
            job.company_id,

          cycle_id:
            job.cycle_id,

          analysis_job_id:
            job.analysis_job_id,
        }),
      )

      return
    }

    // 'active_unchanged': reanálise sem mensagem nova. O job termina como
    // succeeded apontando para a versão atual do estado, que continua sendo
    // a leitura exibida; nada novo foi gravado.
    if (
      statefulResult.mode ===
        'active' ||
      statefulResult.mode ===
        'active_unchanged'
    ) {
      const {
        error:
          successError,
      } =
        await admin
          .from(
            jobsTable,
          )
          .update({
            status:
              'succeeded',

            completed_at:
              completedAt,

            updated_at:
              completedAt,

            runtime_mode:
              statefulResult
                .mode,

            response_source:
              statefulResult
                .response_source,

            candidate_state_version:
              statefulResult
                .stateful_execution
                .candidate_state_version,

            failure_code:
              null,

            failure_path:
              null,

            failure_invariant:
              null,

            communication_attempts:
              statefulResult
                .stateful_execution
                .communication_attempts,

            automatic_crm_write:
              false,

            automatic_agenda_write:
              false,
          })
          .eq(
            'analysis_job_id',
            job.analysis_job_id,
          )
          .eq(
            'company_id',
            job.company_id,
          )
          .eq(
            'cycle_id',
            job.cycle_id,
          )
          .eq(
            'conversation_key',
            job.conversation_key,
          )
          .eq(
            'message_watermark',
            job.message_watermark,
          )
          .eq(
            'status',
            'running',
          )
          .eq(
            'started_at',
            startedAt,
          )

      if (
        successError
      ) {
        throw new StatefulCopilotBackgroundRetryError(
          'BACKGROUND_SUCCESS_WRITE_FAILED',
        )
      }

      console.info(
        'YOLEN_COMPANION_STATEFUL_BACKGROUND',
        JSON.stringify({
          event:
            'background_analysis_succeeded',

          unchanged_reason:
            statefulResult.mode ===
              'active_unchanged'
              ? statefulResult
                  .unchanged_reason
              : null,

          candidate_state_version:
            statefulResult
              .stateful_execution
              .candidate_state_version,

          company_id:
            job.company_id,

          cycle_id:
            job.cycle_id,

          analysis_job_id:
            job.analysis_job_id,

          // Compatibilidade: duration_ms era a métrica histórica do
          // worker. FNC-02 mantém o campo e adiciona nomes explícitos para
          // separar fila, processamento e total.
          duration_ms:
            Math.max(
              0,
              Date.now() -
                runtimeStartedAt,
            ),

          processing_ms:
            Math.max(
              0,
              Date.now() -
                runtimeStartedAt,
            ),

          queue_wait_ms:
            queueWaitMs,

          total_ms:
            Number.isFinite(
              requestedAtMs,
            )
              ? Math.max(
                  0,
                  Date.now() -
                    requestedAtMs,
                )
              : null,

          communication_attempts:
            statefulResult
              .stateful_execution
              .communication_attempts,

          automatic_crm_write:
            false,

          automatic_agenda_write:
            false,
        }),
      )

      return
    }

    const failure =
      statefulResult
        .stateful_failure

    const execution =
      statefulResult
        .stateful_execution

    const v2OnlyActivationViolation =
      statefulResult.mode ===
        'v1' ||
      statefulResult.mode ===
        'shadow'

    if (
      v2OnlyActivationViolation
    ) {
      const {
        error:
          activationViolationWriteError,
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

            runtime_mode:
              statefulResult
                .mode,

            response_source:
              statefulResult
                .response_source,

            candidate_state_version:
              null,

            failure_code:
              'V2_ONLY_ACTIVATION_BYPASSED',

            failure_path:
              'activation',

            failure_invariant:
              'V2_ONLY_ACTIVE_REQUIRED',

            communication_attempts:
              null,

            automatic_crm_write:
              false,

            automatic_agenda_write:
              false,
          })
          .eq(
            'analysis_job_id',
            job.analysis_job_id,
          )
          .eq(
            'company_id',
            job.company_id,
          )
          .eq(
            'cycle_id',
            job.cycle_id,
          )
          .eq(
            'conversation_key',
            job.conversation_key,
          )
          .eq(
            'message_watermark',
            job.message_watermark,
          )
          .eq(
            'status',
            'running',
          )
          .eq(
            'started_at',
            startedAt,
          )

      if (
        activationViolationWriteError
      ) {
        throw new StatefulCopilotBackgroundRetryError(
          'BACKGROUND_V2_ONLY_ACTIVATION_WRITE_FAILED',
        )
      }

      console.warn(
        'YOLEN_COMPANION_STATEFUL_BACKGROUND',
        JSON.stringify({
          event:
            'background_v2_only_activation_bypassed',

          company_id:
            job.company_id,

          cycle_id:
            job.cycle_id,

          analysis_job_id:
            job.analysis_job_id,

          runtime_mode:
            statefulResult
              .mode,

          activation_reason:
            statefulResult
              .activation
              ?.reason ??
            null,
        }),
      )

      return
    }

    // `failure` vem null tanto quando o motor não produziu saída de
    // modelo (execution.engine_mode === 'blocked') quanto quando a
    // persistência recusou por conflito de versão
    // (execution.persistence_mode === 'conflict') — nenhum dos dois é
    // "sem causa conhecida", e o segundo é transitório/retryable. Ver
    // resolveStatefulCopilotBackgroundFailureOutcome.
    const failureOutcome =
      resolveStatefulCopilotBackgroundFailureOutcome({
        failure,
        execution,
      })

    const failureCode =
      failureOutcome
        .failure_code

    const failurePath =
      failureOutcome
        .failure_path

    const failureInvariant =
      failureOutcome
        .failure_invariant

    const communicationAttempts =
      failureOutcome
        .communication_attempts

    if (
      shouldRetryStatefulCopilotBackgroundFailure({
        retryable:
          failureOutcome
            .retryable,

        delivery_count,
      })
    ) {
      const {
        error:
          retryWriteError,
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
              completedAt,

            runtime_mode:
              statefulResult
                .mode,

            response_source:
              statefulResult
                .response_source,

            failure_code:
              failureCode,

            failure_path:
              failurePath,

            failure_invariant:
              failureInvariant,

            communication_attempts:
              communicationAttempts,

            automatic_crm_write:
              false,

            automatic_agenda_write:
              false,
          })
          .eq(
            'analysis_job_id',
            job.analysis_job_id,
          )
          .eq(
            'company_id',
            job.company_id,
          )
          .eq(
            'cycle_id',
            job.cycle_id,
          )
          .eq(
            'conversation_key',
            job.conversation_key,
          )
          .eq(
            'message_watermark',
            job.message_watermark,
          )
          .eq(
            'status',
            'running',
          )
          .eq(
            'started_at',
            startedAt,
          )

      if (
        retryWriteError
      ) {
        throw new StatefulCopilotBackgroundRetryError(
          'BACKGROUND_RETRY_WRITE_FAILED',
        )
      }

      console.info(
        'YOLEN_COMPANION_STATEFUL_BACKGROUND',
        JSON.stringify({
          event:
            'background_analysis_requeued',

          company_id:
            job.company_id,

          cycle_id:
            job.cycle_id,

          analysis_job_id:
            job.analysis_job_id,

          failure_code:
            failureCode,

          failure_path:
            failurePath,

          failure_invariant:
            failureInvariant,

          engine_mode:
            execution?.engine_mode ??
            null,

          persistence_mode:
            execution?.persistence_mode ??
            null,

          delivery_count,
        }),
      )

      if (
        shouldUseLocalInlineRedelivery()
      ) {
        console.info(
          'YOLEN_COMPANION_STATEFUL_BACKGROUND',
          JSON.stringify({
            event:
              'local_inline_background_redelivery',
            company_id:
              job.company_id,
            cycle_id:
              job.cycle_id,
            analysis_job_id:
              job.analysis_job_id,
            delivery_count:
              delivery_count + 1,
          }),
        )

        return processStatefulCopilotBackgroundMessage(
          rawMessage,
          {
            delivery_count:
              delivery_count + 1,
          },
          dependencies,
        )
      }

      /*
       * Em produção, lançar erro faz o handleCallback não dar ack e a
       * Vercel Queue agenda nova entrega. No modo local-inline, a nova
       * entrega já foi executada acima com o mesmo contador da Queue.
       */
      throw new StatefulCopilotBackgroundRetryError(
        failureCode,
      )
    }

    const {
      error:
        failureWriteError,
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

          runtime_mode:
            statefulResult
              .mode,

          response_source:
            statefulResult
              .response_source,

          candidate_state_version:
            execution
              ?.candidate_state_version ??
            null,

          failure_code:
            failureCode,

          failure_path:
            failurePath,

          failure_invariant:
            failureInvariant,

          communication_attempts:
            communicationAttempts,

          automatic_crm_write:
            false,

          automatic_agenda_write:
            false,
        })
        .eq(
          'analysis_job_id',
          job.analysis_job_id,
        )
        .eq(
          'company_id',
          job.company_id,
        )
        .eq(
          'cycle_id',
          job.cycle_id,
        )
        .eq(
          'conversation_key',
          job.conversation_key,
        )
        .eq(
          'message_watermark',
          job.message_watermark,
        )
        .eq(
          'status',
          'running',
        )
        .eq(
          'started_at',
          startedAt,
        )

    if (
      failureWriteError
    ) {
      throw new StatefulCopilotBackgroundRetryError(
        'BACKGROUND_FAILURE_WRITE_FAILED',
      )
    }

    console.warn(
      'YOLEN_COMPANION_STATEFUL_BACKGROUND',
      JSON.stringify({
        event:
          'background_analysis_failed',

        company_id:
          job.company_id,

        cycle_id:
          job.cycle_id,

        analysis_job_id:
          job.analysis_job_id,

        failure_code:
          failureCode,

        failure_path:
          failurePath,

        failure_invariant:
          failureInvariant,

        communication_attempts:
          communicationAttempts,

        engine_mode:
          execution?.engine_mode ??
          null,

        persistence_mode:
          execution?.persistence_mode ??
          null,

        automatic_crm_write:
          false,

        automatic_agenda_write:
          false,
      }),
    )
  } catch (
    error
  ) {
    if (
      error instanceof
        StatefulCopilotBackgroundRetryError
    ) {
      throw error
    }

    const completedAt =
      new Date()
        .toISOString()

    const errorRecord =
      isRecord(
        error,
      )
        ? error
        : null

    const failureCode =
      safeFailureCode(
        errorRecord
          ?.code,
        'BACKGROUND_RUNTIME_FAILED',
      )

    const retryable =
      errorRecord
        ?.retryable !==
      false

    if (
      shouldRetryStatefulCopilotBackgroundFailure({
        retryable,

        delivery_count,
      })
    ) {
      const {
        error:
          retryWriteError,
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
              completedAt,

            failure_code:
              failureCode,

            automatic_crm_write:
              false,

            automatic_agenda_write:
              false,
          })
          .eq(
            'analysis_job_id',
            job.analysis_job_id,
          )
          .eq(
            'company_id',
            job.company_id,
          )
          .eq(
            'cycle_id',
            job.cycle_id,
          )
          .eq(
            'conversation_key',
            job.conversation_key,
          )
          .eq(
            'message_watermark',
            job.message_watermark,
          )
          .eq(
            'status',
            'running',
          )
          .eq(
            'started_at',
            startedAt,
          )

      if (
        retryWriteError
      ) {
        throw new StatefulCopilotBackgroundRetryError(
          'BACKGROUND_RETRY_WRITE_FAILED',
        )
      }

      if (
        shouldUseLocalInlineRedelivery()
      ) {
        return processStatefulCopilotBackgroundMessage(
          rawMessage,
          {
            delivery_count:
              delivery_count + 1,
          },
          dependencies,
        )
      }

      throw new StatefulCopilotBackgroundRetryError(
        failureCode,
      )
    }

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
          failureCode,

        automatic_crm_write:
          false,

        automatic_agenda_write:
          false,
      })
      .eq(
        'analysis_job_id',
        job.analysis_job_id,
      )
      .eq(
        'company_id',
        job.company_id,
      )
      .eq(
        'cycle_id',
        job.cycle_id,
      )
      .eq(
        'conversation_key',
        job.conversation_key,
      )
      .eq(
        'message_watermark',
        job.message_watermark,
      )
      .eq(
        'status',
        'running',
      )
      .eq(
        'started_at',
        startedAt,
      )
  }
}
