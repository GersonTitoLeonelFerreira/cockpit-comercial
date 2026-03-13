// ==============================================================================
// Types: Sales Cycles
// Gerados a partir do schema Supabase Phase 1 + Phase 2
// ==============================================================================

export type LeadStatus = 'novo' | 'contato' | 'respondeu' | 'negociacao' | 'ganho' | 'perdido'

export type CycleEventType =
  | 'cycle_created'
  | 'owner_assigned'
  | 'stage_changed'
  | 'contacted'
  | 'replied'
  | 'note_added'
  | 'next_action_set'
  | 'closed_won'
  | 'closed_lost'

// ============================================================================
// Database Models
// ============================================================================

export interface SalesCycle {
  id: string
  company_id: string
  lead_id: string
  owner_user_id: string | null
  status: LeadStatus
  stage_entered_at: string
  next_action: string | null
  next_action_date: string | null
  current_group_id: string | null
  created_at: string
  updated_at: string
  closed_at: string | null
}

export interface CycleEvent {
  id: string
  company_id: string
  cycle_id: string
  event_type: CycleEventType
  created_by: string
  metadata: Record<string, any>
  occurred_at: string
}

export interface LeadGroup {
  id: string
  company_id: string
  name: string
  created_by: string
  created_at: string
  archived_at: string | null
}

export interface LeadGroupCycle {
  id: string
  company_id: string
  group_id: string
  cycle_id: string
  attached_by: string
  detached_by: string | null
  attached_at: string
  detached_at: string | null
}

export interface Competency {
  id: string
  company_id: string
  month: string // ISO date
  is_active: boolean
  created_at: string
}

// ============================================================================
// DTOs (Data Transfer Objects)
// ============================================================================

export interface SalesCycleWithLead extends SalesCycle {
  lead?: {
    name: string
    phone: string | null
    email: string | null
  }
}

export interface PoolCycle {
  cycle_id: string
  cycle_status: LeadStatus
  stage_entered_at: string
  next_action: string | null
  next_action_date: string | null
  owner_user_id: string | null
  lead_id: string
  lead_name: string
  lead_phone: string | null
  lead_email: string | null
  created_at: string
  updated_at: string
  closed_at: string | null
}

export interface UserCycle {
  cycle_id: string
  cycle_status: LeadStatus
  stage_entered_at: string
  next_action: string | null
  next_action_date: string | null
  owner_user_id: string | null
  lead_id: string
  lead_name: string
  lead_phone: string | null
  lead_email: string | null
  created_at: string
  updated_at: string
  closed_at: string | null
}

// ============================================================================
// RPC Return Types
// ============================================================================

export interface RpcCycleResponse {
  id: string
  company_id: string
  lead_id: string
  owner_user_id: string | null
  status: LeadStatus
  stage_entered_at: string
  next_action: string | null
  next_action_date: string | null
  current_group_id: string | null
  created_at: string
  updated_at: string
  closed_at: string | null
  error_message?: string | null
}

// ============================================================================
// Service Request/Response
// ============================================================================

export interface MoveCycleStageRequest {
  cycle_id: string
  to_status: LeadStatus
  metadata?: Record<string, any>
}

export interface AssignCycleOwnerRequest {
  cycle_id: string
  owner_user_id: string
}

export interface SetNextActionRequest {
  cycle_id: string
  next_action: string
  next_action_date: string | Date
}

export interface CloseCycleWonRequest {
  cycle_id: string
  won_value?: number
}

export interface CloseCycleLostRequest {
  cycle_id: string
  loss_reason?: string
}