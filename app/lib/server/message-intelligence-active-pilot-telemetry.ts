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

// A migration 20260904014500_create_message_intelligence_active_pilot_events.sql
// foi escrita para o vocabulário do V1 (message_intelligence_active_pilot_final_status_check
// só aceita 'selected' | 'no_acceptable_message' | 'no_eligible_candidates' |
// 'blocked' | 'approval_required' | 'inconsistent_input') e para o
// cross-field message_intelligence_active_pilot_event_payload_check:
//   active_selected            -> final_status='selected' AND would_surface_message=true
//   active_fallback_no_message -> final_status IS NOT NULL
//   active_execution_failed    -> final_status IS NULL AND would_surface_message IS NULL
// V2 tem seu próprio vocabulário de status (generated/no_message/
// config_not_ready/provider_error/invalid_output) — nenhum desses é aceito
// literalmente pela constraint. Este mapeamento traduz explicitamente para
// o domínio já existente em vez de alterar a migration:
//   generated                            -> event_type=active_selected,            final_status='selected'
//   no_message (silêncio válido)         -> event_type=active_fallback_no_message, final_status='no_acceptable_message'
//   config_not_ready/provider_error/
//   invalid_output (falha técnica)       -> event_type=active_execution_failed,    final_status=null
// O event_type continua sendo decidido pelo chamador (seller-activation-v2.ts,
// que já sabe qual desses três casos está tratando); aqui só garantimos que
// final_status/would_surface_message fiquem sempre coerentes com o
// event_type escolhido, mesmo que o chamador passe um `run` inesperado.
const V2_STATUS_TO_LEGACY_FINAL_STATUS: Partial<
  Record<
    MessageIntelligenceRunResultV2['status'],
    string
  >
> = {
  generated: 'selected',
  no_message: 'no_acceptable_message',
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
  // active_execution_failed exige final_status/would_surface_message NULL
  // pela constraint — isso vale tanto para uma exceção real (run=null)
  // quanto para um run V2 concluído com status de falha técnica
  // (config_not_ready/provider_error/invalid_output); nunca deixamos o
  // status bruto do V2 vazar para essas colunas nesse caso.
  const finalStatus =
    event_type === 'active_execution_failed'
      ? null
      : run
        ? (
            V2_STATUS_TO_LEGACY_FINAL_STATUS[
              run.status
            ] ?? 'no_acceptable_message'
          )
        : null

  const wouldSurfaceMessage =
    event_type === 'active_execution_failed'
      ? null
      : event_type === 'active_selected'
        // active_selected exige literalmente true pela constraint —
        // este event_type só é usado pelo chamador quando o run já
        // provou would_surface_message=true, mas fixamos aqui também
        // como segunda barreira determinística.
        ? true
        : (
            run?.safety
              .would_surface_message ??
            false
          )

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
      finalStatus,

    would_surface_message:
      wouldSurfaceMessage,

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
