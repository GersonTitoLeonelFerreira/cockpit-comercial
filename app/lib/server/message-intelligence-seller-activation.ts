import 'server-only'

import { randomUUID } from 'crypto'

import type {
  SupabaseClient,
} from '@supabase/supabase-js'

import {
  MESSAGE_INTELLIGENCE_REQUEST_CONTRACT_VERSION,
} from '@/app/lib/companion/message-intelligence/contracts'

import {
  runMessageIntelligenceV1,
} from '@/app/lib/companion/message-intelligence/message-intelligence-runner'

import {
  createMessageIntelligenceSourceLoaderV1,
} from './message-intelligence-source-loader'

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

export type MessageIntelligenceSellerActivationDependencies = {
  env?: SellerActivationEnvironment

  create_source_loader?:
    typeof createMessageIntelligenceSourceLoaderV1

  run_message_intelligence?:
    typeof runMessageIntelligenceV1

  create_request_id?:
    () => string
}

function normalizeCompanyIds(
  value: string | undefined,
): string[] {
  if (!value) {
    return []
  }

  return value
    .split(',')
    .map((item) =>
      item
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean)
}

export function isMessageIntelligenceSellerActiveForCompanyV1({
  company_id,
  env = process.env,
}: {
  company_id: string
  env?: SellerActivationEnvironment
}): boolean {
  const mode =
    env.MESSAGE_INTELLIGENCE_SELLER_MODE
      ?.trim()
      .toLowerCase()

  if (mode !== 'active') {
    return false
  }

  const allowedCompanyIds =
    normalizeCompanyIds(
      env.MESSAGE_INTELLIGENCE_SELLER_COMPANY_IDS,
    )

  // Ativação global acidental é proibida.
  if (
    allowedCompanyIds.includes('*')
  ) {
    return false
  }

  return allowedCompanyIds.includes(
    company_id
      .trim()
      .toLowerCase(),
  )
}

export async function tryGenerateActivatedMessageIntelligenceSellerMessageV1({
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
    MessageIntelligenceSellerActivationDependencies
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

  const runMessageIntelligence =
    dependencies.run_message_intelligence ??
    runMessageIntelligenceV1

  const createRequestId =
    dependencies.create_request_id ??
    randomUUID

  try {
    const run =
      await runMessageIntelligence({
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
      })

    const evaluation =
      run.shadow_evaluation

    const finalMessage =
      run.final_message_result
        .final_message
        ?.text
        ?.trim() ??
      ''

    const safeToSurface =
      evaluation.automatic_send === false &&
      evaluation.automatic_crm_write === false &&
      evaluation.automatic_agenda_write === false &&
      evaluation.would_surface_message === true &&
      run.final_message_result.status ===
        'selected' &&
      Boolean(finalMessage)

    if (!safeToSurface) {
      console.info(
        'YOLEN_MESSAGE_INTELLIGENCE_ACTIVE',
        JSON.stringify({
          event:
            'seller_message_fallback',
          company_id,
          cycle_id,
          final_status:
            run.final_message_result
              .status,
          would_surface_message:
            evaluation
              .would_surface_message,
        }),
      )

      return null
    }

    console.info(
      'YOLEN_MESSAGE_INTELLIGENCE_ACTIVE',
      JSON.stringify({
        event:
          'seller_message_selected',
        company_id,
        cycle_id,
      }),
    )

    return {
      status: 'ready',
      message: finalMessage,
      error: null,
    }
  } catch (error) {
    console.warn(
      'YOLEN_MESSAGE_INTELLIGENCE_ACTIVE',
      JSON.stringify({
        event:
          'seller_message_execution_failed',
        company_id,
        cycle_id,
        error:
          error instanceof Error
            ? error.name
            : 'unknown',
      }),
    )

    // Ativação controlada é fail-open:
    // qualquer problema do MIE volta para
    // o gerador seller-facing atual.
    return null
  }
}
