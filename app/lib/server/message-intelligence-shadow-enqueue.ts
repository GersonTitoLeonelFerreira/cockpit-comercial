import 'server-only'

import { randomUUID } from 'crypto'

import { send } from '@vercel/queue'

import type {
  SupabaseClient,
} from '@supabase/supabase-js'

import {
  MESSAGE_INTELLIGENCE_SHADOW_QUEUE_TOPIC,
  buildMessageIntelligenceShadowJobV1,
  type MessageIntelligenceLegacyGenerationStatus,
} from './message-intelligence-shadow-job'

const SHADOW_RUNS_TABLE =
  'message_intelligence_shadow_runs'

const SHADOW_JOB_RETENTION_SECONDS =
  24 * 60 * 60

export type MessageIntelligenceShadowEnqueueResult =
  | { enqueued: true; shadow_run_id: string }
  | { enqueued: false; reason: string }

/**
 * Dispara o job shadow do Message Intelligence Engine V1 a partir do
 * request seller-facing de generate_message.
 *
 * REGRA ABSOLUTA: esta função NUNCA lança. Qualquer falha (insert,
 * publish na fila) é logada e resulta em `{ enqueued: false }` — o
 * gerador atual (composeSellerMessage) continua sendo a única resposta
 * seller-facing, sempre, independente do resultado aqui.
 *
 * NUNCA roda o pipeline do MIE de forma síncrona: só publica o job.
 */
export async function enqueueMessageIntelligenceShadowRunV1({
  admin,
  company_id,
  seller_user_id,
  cycle_id,
  conversation_key,
  seller_intent,
  reference_time,
  legacy_generation_status,
  legacy_message,
}: {
  admin: SupabaseClient
  company_id: string
  seller_user_id: string
  cycle_id: string
  conversation_key: string
  seller_intent: string
  reference_time: string
  legacy_generation_status:
    MessageIntelligenceLegacyGenerationStatus
  legacy_message: string | null
}): Promise<MessageIntelligenceShadowEnqueueResult> {
  const shadowRunId =
    randomUUID()

  const enqueuedAt =
    new Date().toISOString()

  let job

  try {
    job =
      buildMessageIntelligenceShadowJobV1({
        shadow_run_id: shadowRunId,
        company_id,
        seller_user_id,
        cycle_id,
        conversation_key,
        seller_intent,
        reference_time,
        legacy_generation_status,
        legacy_message,
        enqueued_at: enqueuedAt,
      })
  } catch (error) {
    console.warn(
      'YOLEN_MESSAGE_INTELLIGENCE_SHADOW',
      JSON.stringify({
        event: 'shadow_job_build_failed',
        company_id,
        cycle_id,
        error:
          error instanceof Error
            ? error.message
            : 'unknown',
      }),
    )

    return {
      enqueued: false,
      reason: 'JOB_BUILD_FAILED',
    }
  }

  try {
    const { error: insertError } =
      await admin
        .from(SHADOW_RUNS_TABLE)
        .insert({
          shadow_run_id: job.shadow_run_id,
          company_id: job.company_id,
          seller_user_id: job.seller_user_id,
          cycle_id: job.cycle_id,
          conversation_key: job.conversation_key,
          reference_time: job.reference_time,
          seller_intent: job.seller_intent,
          legacy_generation_status:
            job.legacy_generation_status,
          legacy_message: job.legacy_message,
          execution_status: 'queued',
        })

    if (insertError) {
      console.warn(
        'YOLEN_MESSAGE_INTELLIGENCE_SHADOW',
        JSON.stringify({
          event: 'shadow_run_insert_failed',
          shadow_run_id: job.shadow_run_id,
          company_id,
          cycle_id,
          database_code:
            insertError.code ?? null,
        }),
      )

      return {
        enqueued: false,
        reason: 'RUN_INSERT_FAILED',
      }
    }
  } catch (error) {
    console.warn(
      'YOLEN_MESSAGE_INTELLIGENCE_SHADOW',
      JSON.stringify({
        event: 'shadow_run_insert_threw',
        shadow_run_id: job.shadow_run_id,
        company_id,
        cycle_id,
        error:
          error instanceof Error
            ? error.message
            : 'unknown',
      }),
    )

    return {
      enqueued: false,
      reason: 'RUN_INSERT_THREW',
    }
  }

  try {
    await send(
      MESSAGE_INTELLIGENCE_SHADOW_QUEUE_TOPIC,
      job,
      {
        idempotencyKey: job.shadow_run_id,
        retentionSeconds:
          SHADOW_JOB_RETENTION_SECONDS,
      },
    )

    console.info(
      'YOLEN_MESSAGE_INTELLIGENCE_SHADOW',
      JSON.stringify({
        event: 'shadow_run_published',
        shadow_run_id: job.shadow_run_id,
        company_id,
        cycle_id,
      }),
    )

    return {
      enqueued: true,
      shadow_run_id: job.shadow_run_id,
    }
  } catch (error) {
    console.warn(
      'YOLEN_MESSAGE_INTELLIGENCE_SHADOW',
      JSON.stringify({
        event: 'shadow_run_publish_failed',
        shadow_run_id: job.shadow_run_id,
        company_id,
        cycle_id,
        error:
          error instanceof Error
            ? error.message
            : 'unknown',
      }),
    )

    try {
      await admin
        .from(SHADOW_RUNS_TABLE)
        .update({
          execution_status: 'failed',
          failure_code: 'QUEUE_PUBLISH_FAILED',
          completed_at:
            new Date().toISOString(),
        })
        .eq('shadow_run_id', job.shadow_run_id)
        .eq('execution_status', 'queued')
    } catch {
      // Best-effort: se nem a atualização de falha for possível, a
      // resposta seller-facing ainda assim segue intocada.
    }

    return {
      enqueued: false,
      reason: 'QUEUE_PUBLISH_FAILED',
    }
  }
}
