import 'server-only'

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

// ============================================================================
// Message Intelligence Engine V1 — Shadow Validation
// Worker
//
// Roda o pipeline completo do MIE V1 inteiramente fora do request
// seller-facing e persiste o resultado em message_intelligence_shadow_runs
// para comparação futura. NUNCA envia WhatsApp, NUNCA escreve CRM,
// NUNCA escreve Agenda, e NUNCA retorna nada a nenhum caller seller-facing
// — este worker só é acionado pela fila.
// ============================================================================

const SHADOW_RUNS_TABLE =
  'message_intelligence_shadow_runs'

class MessageIntelligenceShadowWorkerRetryError
  extends Error {
  constructor(code: string) {
    super(code)

    this.name =
      'MessageIntelligenceShadowWorkerRetryError'
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

/**
 * Garante, em runtime, que nenhuma run de shadow carrega intenção de
 * ação automática. O tipo ShadowEvaluationV1 já fixa os três campos em
 * `false` — esta é uma segunda barreira defensiva antes de persistir.
 */
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

export type MessageIntelligenceShadowWorkerDependencies = {
  create_admin_client?:
    typeof createAdminClient

  run_message_intelligence?:
    typeof runMessageIntelligenceV1
}

export async function processMessageIntelligenceShadowMessage(
  rawMessage: unknown,
  dependencies: MessageIntelligenceShadowWorkerDependencies = {},
): Promise<void> {
  const createAdmin =
    dependencies.create_admin_client ??
    createAdminClient

  const job: MessageIntelligenceShadowJobV1 =
    parseMessageIntelligenceShadowJobV1(
      rawMessage,
    )

  const admin =
    createAdmin()

  const {
    data: existingRun,
    error: existingRunError,
  } =
    await admin
      .from(SHADOW_RUNS_TABLE)
      .select('shadow_run_id, execution_status')
      .eq('shadow_run_id', job.shadow_run_id)
      .maybeSingle()

  if (existingRunError) {
    throw new MessageIntelligenceShadowWorkerRetryError(
      'MESSAGE_INTELLIGENCE_SHADOW_RUN_READ_FAILED',
    )
  }

  // A fila sozinha não autoriza execução: a linha precisa ter sido
  // persistida pelo enqueue no request seller-facing.
  if (!existingRun) {
    console.warn(
      'YOLEN_MESSAGE_INTELLIGENCE_SHADOW',
      JSON.stringify({
        event: 'shadow_run_not_found',
        shadow_run_id: job.shadow_run_id,
      }),
    )

    return
  }

  // Idempotência: retry da mesma mensagem nunca re-executa uma run já
  // concluída (sucesso ou falha), e nunca cria uma segunda run.
  if (
    existingRun.execution_status === 'succeeded' ||
    existingRun.execution_status === 'failed'
  ) {
    return
  }

  await admin
    .from(SHADOW_RUNS_TABLE)
    .update({
      execution_status: 'running',
    })
    .eq('shadow_run_id', job.shadow_run_id)
    .eq('execution_status', existingRun.execution_status)

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
          request_id: job.shadow_run_id,
          company_id: job.company_id,
          seller_user_id: job.seller_user_id,
          cycle_id: job.cycle_id,
          conversation_key: job.conversation_key,
          seller_intent: job.seller_intent,
          reference_time: job.reference_time,
        },
        load_sources: sourceLoader,
      })

    assertShadowSafety(run)

    const evaluation =
      run.shadow_evaluation

    await admin
      .from(SHADOW_RUNS_TABLE)
      .update({
        execution_status: 'succeeded',

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

        automatic_send: false,
        automatic_crm_write: false,
        automatic_agenda_write: false,

        shadow_evaluation: evaluation,
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
          new Date().toISOString(),
      })
      .eq('shadow_run_id', job.shadow_run_id)

    console.info(
      'YOLEN_MESSAGE_INTELLIGENCE_SHADOW',
      JSON.stringify({
        event: 'shadow_run_succeeded',
        shadow_run_id: job.shadow_run_id,
        mie_final_status:
          evaluation.final_status,
        would_surface_message:
          evaluation.would_surface_message,
      }),
    )
  } catch (error) {
    const failureCode =
      error instanceof Error &&
      error.message.startsWith('SAFETY_VIOLATION')
        ? 'SAFETY_VIOLATION'
        : safeFailureCode(
            (error as { code?: unknown } | null)
              ?.code,
            'MESSAGE_INTELLIGENCE_SHADOW_RUN_FAILED',
          )

    await admin
      .from(SHADOW_RUNS_TABLE)
      .update({
        execution_status: 'failed',
        failure_code: failureCode,
        failure_detail:
          safeFailureDetail(error),
        automatic_send: false,
        automatic_crm_write: false,
        automatic_agenda_write: false,
        completed_at:
          new Date().toISOString(),
      })
      .eq('shadow_run_id', job.shadow_run_id)

    console.error(
      'YOLEN_MESSAGE_INTELLIGENCE_SHADOW',
      JSON.stringify({
        event: 'shadow_run_failed',
        shadow_run_id: job.shadow_run_id,
        failure_code: failureCode,
      }),
    )
  }
}
