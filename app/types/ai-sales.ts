import type { LeadStatus } from '@/app/types/sales_cycles'

export type ConversationSource = 'whatsapp' | 'phone_summary' | 'notes'

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