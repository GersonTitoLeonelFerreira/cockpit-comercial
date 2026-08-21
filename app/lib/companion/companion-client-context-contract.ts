import type {
  LeadStatus,
} from '@/app/types/sales_cycles'

// ============================================================================
// Yolen Companion — Inteligência Operacional do Cliente
//
// Contrato de dados puramente operacional: histórico da relação, tempo de
// resposta, quem está aguardando quem, e risco por demora. Nenhum campo aqui
// depende de a IA interpretar personalidade, intenção ou relevância
// semântica — tudo é derivado deterministicamente de timestamps e eventos
// já registrados no banco. Deliberadamente separado de `CommercialReading`
// (que é interpretação semântica): aqui o banco prova o tempo e o
// histórico, a IA não participa.
// ============================================================================

export const COMPANION_CLIENT_CONTEXT_CONTRACT_VERSION =
  'companion-client-context-v1' as const

export const COMPANION_CLIENT_WAITING_STATES = [
  'customer_waiting_for_seller',
  'seller_waiting_for_customer',
  'no_pending_response',
  'unknown',
] as const

export type CompanionClientWaitingState =
  (typeof COMPANION_CLIENT_WAITING_STATES)[number]

export const COMPANION_CLIENT_SLA_RISK_LEVELS = [
  'low',
  'medium',
  'high',
] as const

export type CompanionClientSlaRiskLevel =
  (typeof COMPANION_CLIENT_SLA_RISK_LEVELS)[number]

export const COMPANION_CLIENT_TIMELINE_EVENT_KINDS = [
  'first_contact',
  'customer_message',
  'seller_message',
  'stage_changed',
  'next_action_set',
  'ai_suggestion_applied',
  'closed_won',
  'closed_lost',
  'suggestion_shown',
  'suggestion_copied',
  'suggestion_inserted',
  'suggestion_ignored',
  'suggestion_edited',
  'suggestion_sent',
  'crm_accepted',
  'crm_rejected',
  'agenda_accepted',
  'agenda_rejected',
] as const

export type CompanionClientTimelineEventKind =
  (typeof COMPANION_CLIENT_TIMELINE_EVENT_KINDS)[number]

export type CompanionClientIdentity = {
  company_id: string
  cycle_id: string
  conversation_key: string
  current_status: LeadStatus
}

export type CompanionClientRelationship = {
  first_known_interaction_at:
    string | null

  relationship_age_ms:
    number | null

  latest_customer_message_at:
    string | null

  latest_seller_message_at:
    string | null

  last_interaction_at:
    string | null

  known_interaction_count:
    number
}

export type CompanionClientWaiting = {
  state:
    CompanionClientWaitingState

  waiting_since:
    string | null

  waiting_duration_ms:
    number | null
}

export type CompanionClientTimelineEvent = {
  kind:
    CompanionClientTimelineEventKind

  occurred_at:
    string

  label:
    string

  detail:
    string | null
}

export type CompanionClientSlaAssessment = {
  configured:
    boolean

  applicable:
    boolean

  stage:
    LeadStatus | null

  stage_label:
    string | null

  target_minutes:
    number | null

  warning_minutes:
    number | null

  danger_minutes:
    number | null

  elapsed_minutes:
    number | null

  risk:
    CompanionClientSlaRiskLevel | null
}

export type CompanionClientContext = {
  contract_version:
    typeof COMPANION_CLIENT_CONTEXT_CONTRACT_VERSION

  generated_at:
    string

  identity:
    CompanionClientIdentity

  relationship:
    CompanionClientRelationship

  waiting:
    CompanionClientWaiting

  timeline:
    CompanionClientTimelineEvent[]

  sla:
    CompanionClientSlaAssessment
}
