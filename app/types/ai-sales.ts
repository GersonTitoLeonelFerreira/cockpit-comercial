import type { LeadStatus } from '@/app/types/sales_cycles'

export type ConversationSource = 'whatsapp' | 'phone_summary' | 'notes'

export interface AISalesRecentEvent {
  event_type: string
  occurred_at: string
  from_status?: LeadStatus | null
  to_status?: LeadStatus | null
  action_channel?: string | null
  action_result?: string | null
  result_detail?: string | null
  next_action?: string | null
  next_action_date?: string | null
  lost_reason?: string | null
  source?: string | null
}

export interface AISalesContext {
  cycle_id: string
  current_status: LeadStatus
  lead_name?: string | null
  lead_phone?: string | null
  lead_email?: string | null
  owner_user_id?: string | null
  current_next_action?: string | null
  current_next_action_date?: string | null
  current_group_id?: string | null
  current_group_name?: string | null
  recent_events?: AISalesRecentEvent[]
}

export interface AIAuditProviderInfo {
  attempted: boolean
  model: string | null
  success: boolean
  failure_reason: string | null
}

// ---------------------------------------------------------------------------
// Fase 5D — Diagnóstico de segmentação da conversa
// ---------------------------------------------------------------------------

/**
 * Conjunto de sinais detectados dentro de UM segmento da conversa
 * (texto inteiro, trecho final, fala final do cliente, fala final do vendedor).
 */
export interface AIAuditSegmentSignalSet {
  final_commitment: string[]
  final_schedule: string[]
  commercial: string[]
  no_response: string[]
  lost: string[]
  won: string[]
}

/**
 * Previews dos segmentos usados pela decisão em camadas.
 * Serve para auditoria — a decisão em si consome os sinais, não os previews.
 */
export interface AIAuditSegmentPreviews {
  full: string
  tail: string
  client_tail: string
  seller_tail: string
  has_speaker_markers: boolean
  turn_count: number
}

/**
 * Sinais detectados por segmento.
 */
export interface AIAuditSegmentSignals {
  full: AIAuditSegmentSignalSet
  tail: AIAuditSegmentSignalSet
  client_tail: AIAuditSegmentSignalSet
  seller_tail: AIAuditSegmentSignalSet
}

/**
 * Resolução final detectada pela camada de decisão por desfecho.
 */
export interface AIAuditFinalResolution {
  /** houve compromisso concreto detectado no bloco final */
  final_commitment_detected: boolean
  /** houve agendamento detectado no bloco final */
  final_schedule_detected: boolean
  /**
   * havia negociação intermediária (objeção, preço, desconto) mas o desfecho
   * final superou isso — importante para auditar o caso "conversa longa com
   * objeção no meio e agendamento no final".
   */
  overrode_negotiation: boolean
  /** motivo textual da regra vencedora (usado na exibição) */
  reason: string
}

// ---------------------------------------------------------------------------

export interface AIAuditDiagnostics {
  engine: 'fallback' | 'ai'
  selected_rule: string
  fallback_rule?: string | null

  /**
   * Mantido por compatibilidade com a auditoria antiga. A partir da Fase 5D,
   * o fallback NÃO decide mais por histórico — então para decisões do fallback
   * este campo é sempre `false`. O histórico continua sendo exibido em
   * `history_signals` só para leitura auditável.
   */
  used_history: boolean

  multiple_text_signals: boolean
  text_preview: string

  text_signals: {
    lost: string[]
    won: string[]
    negotiation: string[]
    no_response: string[]
    agenda: string[]
  }

  history_signals: {
    negotiation: string[]
    agenda: string[]
  }

  provider: AIAuditProviderInfo
  notes: string[]

  // -------------------------------------------------------------------------
  // Fase 5D — novos campos (opcionais, não quebram o contrato anterior)
  // -------------------------------------------------------------------------

  /** previews dos segmentos que foram efetivamente usados na decisão */
  segment_previews?: AIAuditSegmentPreviews

  /** sinais encontrados em cada segmento */
  segment_signals?: AIAuditSegmentSignals

  /** resolução final (desfecho) detectada pela decisão em camadas */
  final_resolution?: AIAuditFinalResolution

  /** atalhos booleanos para o painel */
  final_commitment_detected?: boolean
  final_schedule_detected?: boolean
}

export interface AnalyzeConversationRequest {
  cycle_id: string
  conversation_text: string
  source?: ConversationSource
}

export interface AISalesSuggestion {
  recommended_status: LeadStatus
  confidence: number
  action_channel: string | null
  action_result: string | null
  result_detail: string | null
  next_action: string | null
  next_action_date: string | null
  summary: string
  tags: string[]
  should_close_won: boolean
  should_close_lost: boolean
  close_reason: string | null
  reason_for_recommendation: string
  source: 'ai' | 'fallback'
}

export interface AnalyzeConversationResponse {
  ok: boolean
  data?: {
    context: AISalesContext
    suggestion: AISalesSuggestion
    diagnostics?: AIAuditDiagnostics
  }
  error?: string
}

export interface ApplyAISuggestionRequest {
  cycle_id: string
  applied_status: LeadStatus
  next_action?: string | null
  next_action_date?: string | null
  edited_summary?: string | null
  suggestion: AISalesSuggestion
  source?: 'ai_copilot_detail' | 'ai_copilot_kanban'
}

export interface ApplyAISuggestionResponse {
  ok: boolean
  data?: {
    id: string
    status: LeadStatus
    previous_status?: LeadStatus | null
    next_action?: string | null
    next_action_date?: string | null
  }
  error?: string
}