import 'server-only'

import type {
  SupabaseClient,
} from '@supabase/supabase-js'

import type {
  MessageIntelligenceRunResultV1,
} from '@/app/lib/companion/message-intelligence/message-intelligence-runner'

import type {
  MessageIntelligenceRunResultV2,
} from '@/app/lib/companion/message-intelligence/v2/runner'

const ACTIVE_PILOT_TABLE =
  'message_intelligence_active_pilot_events'

export type MessageIntelligenceActivePilotEventV1 =
  | 'active_selected'
  | 'active_fallback_no_message'
  | 'active_execution_failed'

export type MessageIntelligenceActivePilotTelemetryV1 = {
  event_type:
    MessageIntelligenceActivePilotEventV1

  company_id:
    string

  seller_user_id:
    string

  cycle_id:
    string

  duration_ms:
    number

  final_status:
    string | null

  would_surface_message:
    boolean | null

  selected_overall_score:
    number | null

  hard_gate_status:
    string | null

  selected_critic_status:
    string | null

  automatic_send:
    boolean

  automatic_crm_write:
    boolean

  automatic_agenda_write:
    boolean
}

export class MessageIntelligenceActivePilotTelemetryPersistenceError
  extends Error {
  readonly code =
    'MESSAGE_INTELLIGENCE_ACTIVE_PILOT_TELEMETRY_PERSISTENCE_FAILED'

  constructor() {
    super(
      'Falha ao persistir telemetria do piloto ativo do MIE.',
    )

    this.name =
      'MessageIntelligenceActivePilotTelemetryPersistenceError'
  }
}

function normalizeDuration(
  value: number,
): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.max(
    0,
    Math.trunc(value),
  )
}

export function buildMessageIntelligenceActivePilotTelemetryV1({
  event_type,
  company_id,
  seller_user_id,
  cycle_id,
  duration_ms,
  run,
}: {
  event_type:
    MessageIntelligenceActivePilotEventV1

  company_id:
    string

  seller_user_id:
    string

  cycle_id:
    string

  duration_ms:
    number

  run:
    MessageIntelligenceRunResultV1 | null
}): MessageIntelligenceActivePilotTelemetryV1 {
  const evaluation =
    run?.shadow_evaluation

  return {
    event_type,

    company_id,

    seller_user_id,

    cycle_id,

    duration_ms:
      normalizeDuration(
        duration_ms,
      ),

    final_status:
      evaluation?.final_status ??
      null,

    would_surface_message:
      evaluation?.would_surface_message ??
      null,

    selected_overall_score:
      typeof evaluation
        ?.selected_overall_score ===
        'number'
        ? evaluation
            .selected_overall_score
        : null,

    hard_gate_status:
      run?.hard_gate_result
        ?.status ??
      null,

    selected_critic_status:
      evaluation
        ?.selected_critic_status ??
      null,

    automatic_send:
      evaluation
        ?.automatic_send ??
      false,

    automatic_crm_write:
      evaluation
        ?.automatic_crm_write ??
      false,

    automatic_agenda_write:
      evaluation
        ?.automatic_agenda_write ??
      false,
  }
}

/**
 * Mesma tabela/contrato de telemetria do V1 — engine_version=v2 não exige
 * migration. A persistência (persistMessageIntelligenceActivePilotTelemetryV1)
 * é reaproveitada sem alteração. Score e critic status do V2 não existem
 * neste primeiro corte (não há reranking multi-candidate nem critic
 * separado); os campos ficam null aqui e a distinção de motor fica nos
 * logs estruturados (console), nunca no conteúdo persistido.
 */
export function buildMessageIntelligenceActivePilotTelemetryV2({
  event_type,
  company_id,
  seller_user_id,
  cycle_id,
  duration_ms,
  run,
}: {
  event_type:
    MessageIntelligenceActivePilotEventV1

  company_id:
    string

  seller_user_id:
    string

  cycle_id:
    string

  duration_ms:
    number

  run:
    MessageIntelligenceRunResultV2 | null
}): MessageIntelligenceActivePilotTelemetryV1 {
  return {
    event_type,

    company_id,

    seller_user_id,

    cycle_id,

    duration_ms:
      normalizeDuration(
        duration_ms,
      ),

    final_status:
      run?.status ??
      null,

    would_surface_message:
      run?.safety
        .would_surface_message ??
      null,

    selected_overall_score:
      null,

    hard_gate_status:
      null,

    selected_critic_status:
      null,

    automatic_send:
      run?.safety.automatic_send ??
      false,

    automatic_crm_write:
      run?.safety
        .automatic_crm_write ??
      false,

    automatic_agenda_write:
      run?.safety
        .automatic_agenda_write ??
      false,
  }
}

export async function persistMessageIntelligenceActivePilotTelemetryV1({
  admin,
  telemetry,
}: {
  admin:
    SupabaseClient

  telemetry:
    MessageIntelligenceActivePilotTelemetryV1
}): Promise<void> {
  const {
    error,
  } =
    await admin
      .from(
        ACTIVE_PILOT_TABLE,
      )
      .insert({
        company_id:
          telemetry.company_id,

        seller_user_id:
          telemetry.seller_user_id,

        cycle_id:
          telemetry.cycle_id,

        event_type:
          telemetry.event_type,

        duration_ms:
          telemetry.duration_ms,

        final_status:
          telemetry.final_status,

        would_surface_message:
          telemetry.would_surface_message,

        selected_overall_score:
          telemetry
            .selected_overall_score,

        hard_gate_status:
          telemetry.hard_gate_status,

        selected_critic_status:
          telemetry
            .selected_critic_status,

        automatic_send:
          telemetry.automatic_send,

        automatic_crm_write:
          telemetry
            .automatic_crm_write,

        automatic_agenda_write:
          telemetry
            .automatic_agenda_write,
      })

  if (error) {
    throw new MessageIntelligenceActivePilotTelemetryPersistenceError()
  }
}
