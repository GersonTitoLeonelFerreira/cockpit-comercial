import type {
    AISalesSuggestion,
    ConversationSource,
  } from '@/app/types/ai-sales'
  
  export interface AICoaching {
    conversation_summary: string
    customer_interests: string[]
    objections: string[]
    what_went_well: string[]
    what_to_improve: string[]
    recommended_next_approach: string | null
    suggested_message: string | null
  }
  
  export interface AICoachingHistoryItem {
    id: string
    created_at: string
    source: string
    coaching: AICoaching
    yolen_decision: Record<string, unknown>
  }
  
  export interface GenerateAICoachingRequest {
    cycle_id: string
    conversation_text: string
    source: ConversationSource
    suggestion: AISalesSuggestion
  }
  
  export interface GenerateAICoachingResponse {
    ok: boolean
    data?: {
      coaching: AICoaching
    }
    error?: string
  }
  
  export interface SaveAICoachingRequest {
    cycle_id: string
    coaching: AICoaching
    suggestion: AISalesSuggestion
    source?: 'ai_copilot_detail' | 'ai_copilot_kanban'
  }
  
  export interface SaveAICoachingResponse {
    ok: boolean
    data?: {
      id: string
      occurred_at: string
    }
    error?: string
  }
  
  export interface AICoachingHistoryResponse {
    ok: boolean
    data?: {
      items: AICoachingHistoryItem[]
    }
    error?: string
  }