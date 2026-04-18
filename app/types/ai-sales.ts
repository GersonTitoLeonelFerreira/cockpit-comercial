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