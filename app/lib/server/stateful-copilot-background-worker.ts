import 'server-only'

import {
  createClient,
} from '@supabase/supabase-js'

import {
  STATEFUL_COPILOT_BACKGROUND_CYCLE_DEADLINE_MS,
  STATEFUL_COPILOT_BACKGROUND_RUNNING_LEASE_MS,
  parseStatefulCopilotBackgroundJobMessage,
  resolveStatefulCopilotBackgroundFailureOutcome,
  shouldRetryStatefulCopilotBackgroundFailure,
} from './stateful-copilot-background-job'

import {
  createStatefulCopilotServerRuntimeOrchestrator,
} from './stateful-copilot-runtime-orchestrator'

class StatefulCopilotBackgroundRetryError
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
) {
  return {
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

  const job =
    parseStatefulCopilotBackgroundJobMessage(
      rawMessage,
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
      ),
    )

  const admin =
    createAdmin()

  const {
    data:
      currentJob,

    error:
      currentJobError,
  } =
    await admin
      .from(
        'companion_background_analysis_jobs',
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
        'companion_background_analysis_jobs',
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
          'companion_background_analysis_jobs',
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
    throw new StatefulCopilotBackgroundRetryError(
      'BACKGROUND_JOB_ALREADY_RUNNING',
    )
  }

  let claimQuery =
    admin
      .from(
        'companion_background_analysis_jobs',
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

  const {
    data:
      claimedJob,

    error:
      claimJobError,
  } =
    await claimQuery
      .select(
        'analysis_job_id',
      )
      .maybeSingle()

  if (
    claimJobError
      ?.code ===
      '23505'
  ) {
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
          'companion_background_analysis_jobs',
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
            'companion_background_analysis_jobs',
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

    if (
      statefulResult.mode ===
      'active'
    ) {
      const {
        error:
          successError,
      } =
        await admin
          .from(
            'companion_background_analysis_jobs',
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

          company_id:
            job.company_id,

          cycle_id:
            job.cycle_id,

          analysis_job_id:
            job.analysis_job_id,

          duration_ms:
            Math.max(
              0,
              Date.now() -
                runtimeStartedAt,
            ),

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
            'companion_background_analysis_jobs',
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

          engine_mode:
            execution?.engine_mode ??
            null,

          persistence_mode:
            execution?.persistence_mode ??
            null,

          delivery_count,
        }),
      )

      /*
       * Lançar erro faz o handleCallback não dar ack
       * e a Vercel Queue agenda nova entrega.
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
          'companion_background_analysis_jobs',
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

      throw new StatefulCopilotBackgroundRetryError(
        failureCode,
      )
    }

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
