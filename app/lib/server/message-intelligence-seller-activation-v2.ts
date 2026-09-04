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

type SellerMessageGenerationV1 = {
  status: 'ready'
  message: string
  error: null
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

/**
 * Ativação seller-facing do MIE V2. Mesmo contrato de retorno e as mesmas
 * regras de ativação por empresa do V1 (MESSAGE_INTELLIGENCE_SELLER_MODE /
 * MESSAGE_INTELLIGENCE_SELLER_COMPANY_IDS, wildcard proibido) — a escolha
 * de motor (V1 x V2) é decidida antes, pela rota, via
 * MESSAGE_INTELLIGENCE_ENGINE_VERSION. Qualquer resultado que não seja uma
 * mensagem final segura para surfar retorna null, e o chamador cai para o
 * fallback legacy existente — nunca para o V1.
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
  SellerMessageGenerationV1 | null
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

    const telemetry =
      buildMessageIntelligenceActivePilotTelemetryV2({
        event_type:
          'active_execution_failed',

        company_id,
        seller_user_id,
        cycle_id,

        duration_ms: durationMs,

        run: null,
      })

    try {
      await persistTelemetry({
        admin,
        telemetry,
      })
    } catch {
      console.warn(
        'YOLEN_MESSAGE_INTELLIGENCE_ACTIVE_V2',
        JSON.stringify({
          event:
            'active_telemetry_persist_failed',
          source_event:
            'active_execution_failed',
          company_id,
          cycle_id,
        }),
      )
    }

    console.warn(
      'YOLEN_MESSAGE_INTELLIGENCE_ACTIVE_V2',
      JSON.stringify({
        event:
          'seller_message_execution_failed',
        engine_version: 'v2',
        company_id,
        cycle_id,
        duration_ms: durationMs,
        error:
          error instanceof Error
            ? error.name
            : 'unknown',
      }),
    )

    return null
  }

  const durationMs =
    now() - startedAt

  console.info(
    'YOLEN_MESSAGE_INTELLIGENCE_ACTIVE_V2',
    JSON.stringify({
      event: 'v2_run_completed',
      engine_version: 'v2',
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
      error_code:
        run.error?.code ?? null,
      duration_ms: durationMs,
    }),
  )

  const finalMessage =
    run.final_message?.trim() ?? ''

  const safeToSurface =
    run.status === 'generated' &&
    run.safety.automatic_send === false &&
    run.safety.automatic_crm_write === false &&
    run.safety.automatic_agenda_write === false &&
    run.safety.would_surface_message === true &&
    Boolean(finalMessage)

  if (!safeToSurface) {
    const telemetry =
      buildMessageIntelligenceActivePilotTelemetryV2({
        event_type:
          'active_fallback_no_message',

        company_id,
        seller_user_id,
        cycle_id,

        duration_ms: durationMs,

        run,
      })

    try {
      await persistTelemetry({
        admin,
        telemetry,
      })
    } catch {
      console.warn(
        'YOLEN_MESSAGE_INTELLIGENCE_ACTIVE_V2',
        JSON.stringify({
          event:
            'active_telemetry_persist_failed',
          source_event:
            'active_fallback_no_message',
          company_id,
          cycle_id,
        }),
      )
    }

    return null
  }

  const telemetry =
    buildMessageIntelligenceActivePilotTelemetryV2({
      event_type:
        'active_selected',

      company_id,
      seller_user_id,
      cycle_id,

      duration_ms: durationMs,

      run,
    })

  try {
    // Mesma regra do piloto V1: nenhuma exposição ativa sem trilha
    // durável confirmada.
    await persistTelemetry({
      admin,
      telemetry,
    })
  } catch {
    console.warn(
      'YOLEN_MESSAGE_INTELLIGENCE_ACTIVE_V2',
      JSON.stringify({
        event:
          'active_selected_telemetry_required_but_failed',
        company_id,
        cycle_id,
      }),
    )

    return null
  }

  return {
    status: 'ready',
    message: finalMessage,
    error: null,
  }
}
