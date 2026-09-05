import 'server-only'

import { randomUUID } from 'crypto'

import type {
  SupabaseClient,
} from '@supabase/supabase-js'

import {
  MESSAGE_INTELLIGENCE_REQUEST_CONTRACT_VERSION,
} from '@/app/lib/companion/message-intelligence/contracts'

import {
  runMessageIntelligenceV2,
  type MessageIntelligenceRunResultV2,
} from '@/app/lib/companion/message-intelligence/v2/runner'

import {
  createMessageIntelligenceSourceLoaderV1,
} from './message-intelligence-source-loader'

import {
  buildMessageIntelligenceActivePilotTelemetryV2,
  persistMessageIntelligenceActivePilotTelemetryV1,
} from './message-intelligence-active-pilot-telemetry'

import {
  isMessageIntelligenceSellerActiveForCompanyV1,
} from './message-intelligence-seller-activation'

type SellerActivationEnvironment =
  Readonly<
    Record<
      string,
      string | undefined
    >
  >

// Silêncio válido (o modelo concluiu, sem erro, que nada deveria ser
// dito agora) NÃO é a mesma coisa que "V2 não rodou/falhou tecnicamente".
// Um outcome discriminado evita que os dois colapsem no mesmo `null` e
// sejam ambos tratados como "cair para o fallback legacy":
//   outcome='message'  -> mensagem V2 segura, pronta para surfar.
//   outcome='silence'  -> V2 decidiu corretamente não intervir; o
//                         chamador NÃO deve gerar uma mensagem legacy
//                         para preencher o espaço.
//   null                -> V2 não está ativo para a empresa, ou falhou
//                         tecnicamente (config/provider/output inválido);
//                         o chamador cai para o fallback legacy existente,
//                         exatamente como o V1 já faz hoje.
export type MessageIntelligenceSellerActivationV2Result =
  | {
      outcome: 'message'
      status: 'ready'
      message: string
      error: null
    }
  | {
      outcome: 'silence'
    }

export type MessageIntelligenceSellerActivationV2Dependencies = {
  env?: SellerActivationEnvironment

  create_source_loader?:
    typeof createMessageIntelligenceSourceLoaderV1

  run_message_intelligence_v2?:
    typeof runMessageIntelligenceV2

  create_request_id?:
    () => string

  persist_telemetry?:
    typeof persistMessageIntelligenceActivePilotTelemetryV1

  now?:
    () => number
}

function logInfo(
  event: string,
  fields: Record<string, unknown>,
) {
  console.info(
    'YOLEN_MESSAGE_INTELLIGENCE_ACTIVE_V2',
    JSON.stringify({
      event,
      engine_version: 'v2',
      ...fields,
    }),
  )
}

function logWarn(
  event: string,
  fields: Record<string, unknown>,
) {
  console.warn(
    'YOLEN_MESSAGE_INTELLIGENCE_ACTIVE_V2',
    JSON.stringify({
      event,
      engine_version: 'v2',
      ...fields,
    }),
  )
}

async function persistBestEffort({
  admin,
  persistTelemetry,
  telemetry,
  sourceEvent,
  company_id,
  cycle_id,
}: {
  admin: SupabaseClient
  persistTelemetry:
    typeof persistMessageIntelligenceActivePilotTelemetryV1
  telemetry: Parameters<
    typeof persistMessageIntelligenceActivePilotTelemetryV1
  >[0]['telemetry']
  sourceEvent: string
  company_id: string
  cycle_id: string
}): Promise<boolean> {
  try {
    await persistTelemetry({
      admin,
      telemetry,
    })

    return true
  } catch {
    logWarn(
      'active_telemetry_persist_failed',
      {
        source_event: sourceEvent,
        company_id,
        cycle_id,
      },
    )

    return false
  }
}

/**
 * Ativação seller-facing do MIE V2. Mesmas regras de ativação por empresa
 * do V1 (MESSAGE_INTELLIGENCE_SELLER_MODE / MESSAGE_INTELLIGENCE_SELLER_COMPANY_IDS,
 * wildcard proibido) — a escolha de motor (V1 x V2) é decidida antes, pela
 * rota, via MESSAGE_INTELLIGENCE_ENGINE_VERSION.
 */
export async function tryGenerateActivatedMessageIntelligenceSellerMessageV2({
  admin,
  company_id,
  seller_user_id,
  cycle_id,
  conversation_key,
  seller_intent,
  reference_time,
  dependencies = {},
}: {
  admin: SupabaseClient
  company_id: string
  seller_user_id: string
  cycle_id: string
  conversation_key: string
  seller_intent: string
  reference_time: string
  dependencies?:
    MessageIntelligenceSellerActivationV2Dependencies
}): Promise<
  MessageIntelligenceSellerActivationV2Result | null
> {
  const env =
    dependencies.env ??
    process.env

  if (
    !isMessageIntelligenceSellerActiveForCompanyV1({
      company_id,
      env,
    })
  ) {
    return null
  }

  const createSourceLoader =
    dependencies.create_source_loader ??
    createMessageIntelligenceSourceLoaderV1

  const runV2 =
    dependencies.run_message_intelligence_v2 ??
    runMessageIntelligenceV2

  const createRequestId =
    dependencies.create_request_id ??
    randomUUID

  const persistTelemetry =
    dependencies.persist_telemetry ??
    persistMessageIntelligenceActivePilotTelemetryV1

  const now =
    dependencies.now ??
    Date.now

  const startedAt =
    now()

  let run:
    MessageIntelligenceRunResultV2

  try {
    run =
      await runV2({
        request: {
          contract_version:
            MESSAGE_INTELLIGENCE_REQUEST_CONTRACT_VERSION,

          request_id:
            createRequestId(),

          company_id,
          seller_user_id,
          cycle_id,
          conversation_key,
          seller_intent,
          reference_time,
        },

        load_sources:
          createSourceLoader({
            admin,
          }),

        env,
      })
  } catch (error) {
    const durationMs =
      now() - startedAt

    await persistBestEffort({
      admin,
      persistTelemetry,
      telemetry:
        buildMessageIntelligenceActivePilotTelemetryV2({
          event_type:
            'active_execution_failed',
          company_id,
          seller_user_id,
          cycle_id,
          duration_ms: durationMs,
          run: null,
        }),
      sourceEvent:
        'active_execution_failed',
      company_id,
      cycle_id,
    })

    logWarn(
      'seller_message_execution_failed',
      {
        company_id,
        cycle_id,
        duration_ms: durationMs,
        error:
          error instanceof Error
            ? error.name
            : 'unknown',
      },
    )

    return null
  }

  const durationMs =
    now() - startedAt

  logInfo('v2_run_completed', {
    company_id,
    cycle_id,
    status: run.status,
    would_surface_message:
      run.safety.would_surface_message,
    provider:
      run.execution?.provider ?? null,
    model:
      run.execution?.model ??
      (run.model_config.status === 'ready'
        ? run.model_config.model
        : null),
    model_source:
      run.model_config.status === 'ready'
        ? run.model_config.source
        : null,
    request_id:
      run.execution?.request_id ?? null,
    usage:
      run.execution?.usage ?? null,
    attempts:
      run.execution?.attempts ?? null,
    repaired:
      run.execution
        ?.recovered_after_retry ??
      false,
    repair_reason:
      run.execution?.repair_reason ?? null,
    error_code:
      run.error?.code ?? null,
    duration_ms: durationMs,

    // Custo/latência por fase (nunca conteúdo) — primary, critic
    // primeira/segunda avaliação e a regeneração de repair, quando
    // houver.
    phase_durations_ms:
      run.phase_durations_ms,

    critic_first_verdict:
      run.critic?.first.verdict ?? null,
    critic_first_usage:
      run.critic?.first.execution.usage ??
      null,
    critic_second_verdict:
      run.critic?.second?.verdict ?? null,
    critic_second_usage:
      run.critic?.second?.execution
        .usage ?? null,
  })

  const finalMessage =
    run.final_message?.trim() ?? ''

  const safeToSurface =
    run.status === 'generated' &&
    run.safety.automatic_send === false &&
    run.safety.automatic_crm_write === false &&
    run.safety.automatic_agenda_write === false &&
    run.safety.would_surface_message === true &&
    Boolean(finalMessage)

  if (safeToSurface) {
    const persisted =
      await persistBestEffort({
        admin,
        persistTelemetry,
        telemetry:
          buildMessageIntelligenceActivePilotTelemetryV2({
            event_type: 'active_selected',
            company_id,
            seller_user_id,
            cycle_id,
            duration_ms: durationMs,
            run,
          }),
        sourceEvent: 'active_selected',
        company_id,
        cycle_id,
      })

    if (!persisted) {
      // Mesma regra do piloto V1: nenhuma exposição active_selected sem
      // trilha durável confirmada. Cai para o fallback legacy.
      logWarn(
        'active_selected_telemetry_required_but_failed',
        {
          company_id,
          cycle_id,
        },
      )

      return null
    }

    return {
      outcome: 'message',
      status: 'ready',
      message: finalMessage,
      error: null,
    }
  }

  if (run.status === 'no_message') {
    // Silêncio válido: o modelo concluiu, sem erro, que nada deveria ser
    // dito agora. Isso NÃO é uma falha nem gera exposição de conteúdo —
    // por isso a persistência é best-effort (não bloqueia o outcome) e o
    // chamador nunca deve substituir esta decisão por uma mensagem legacy.
    await persistBestEffort({
      admin,
      persistTelemetry,
      telemetry:
        buildMessageIntelligenceActivePilotTelemetryV2({
          event_type:
            'active_fallback_no_message',
          company_id,
          seller_user_id,
          cycle_id,
          duration_ms: durationMs,
          run,
        }),
      sourceEvent:
        'active_fallback_no_message',
      company_id,
      cycle_id,
    })

    return { outcome: 'silence' }
  }

  // run.status ∈ {config_not_ready, provider_error, invalid_output}, ou
  // 'generated' que falhou nas checagens de segurança redundantes acima —
  // falha técnica real, não uma decisão válida. Fallback legacy.
  await persistBestEffort({
    admin,
    persistTelemetry,
    telemetry:
      buildMessageIntelligenceActivePilotTelemetryV2({
        event_type:
          'active_execution_failed',
        company_id,
        seller_user_id,
        cycle_id,
        duration_ms: durationMs,
        run,
      }),
    sourceEvent: 'active_execution_failed',
    company_id,
    cycle_id,
  })

  return null
}
