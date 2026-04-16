// ==============================================================================
// Types: Sales Cycles
// ==============================================================================

export type LeadStatus =
  | 'novo'
  | 'contato'
  | 'respondeu'
  | 'negociacao'
  | 'pausado'
  | 'cancelado'
  | 'ganho'
  | 'perdido'

export const OPEN_STATUSES: LeadStatus[] = ['novo', 'contato', 'respondeu', 'negociacao', 'pausado']
export const COMMERCIAL_CLOSE_STATUSES: LeadStatus[] = ['ganho', 'perdido']
export const TERMINAL_STATUSES: LeadStatus[] = ['ganho', 'perdido', 'cancelado']

export type CycleEventType =
  | 'cycle_created'
  | 'owner_assigned'
  | 'owner_reassigned'
  | 'group_changed'
  | 'returned_to_pool'
  | 'stage_changed'
  | 'contacted'
  | 'replied'
  | 'note_added'
  | 'next_action_set'
  | 'closed_won'
  | 'closed_lost'
  | 'ai_analysis_generated'
  | 'ai_suggestion_applied'
  | 'ai_suggestion_rejected'

export interface SalesCycle {
  id: string
  company_id: string
  lead_id: string
  owner_user_id: string | null
  status: LeadStatus
  previous_status: LeadStatus | null
  stage_entered_at: string
  next_action: string | null
  next_action_date: string | null
  current_group_id: string | null
  created_at: string
  updated_at: string
  closed_at: string | null
  won_at: string | null
  lost_at: string | null
  won_owner_user_id: string | null
  lost_owner_user_id: string | null
  lost_reason: string | null
  won_total: number | null
  paused_at: string | null
  paused_reason: string | null
  canceled_at: string | null
  canceled_reason: string | null
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
  month: string
  is_active: boolean
  created_at: string
}

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

export interface RpcCycleResponse {
  id: string
  company_id: string
  lead_id: string
  owner_user_id: string | null
  status: LeadStatus
  previous_status?: LeadStatus | null
  stage_entered_at: string
  next_action: string | null
  next_action_date: string | null
  current_group_id: string | null
  created_at: string
  updated_at: string
  closed_at: string | null
  won_at?: string | null
  lost_at?: string | null
  won_total?: number | null
  won_owner_user_id?: string | null
  lost_reason?: string | null
  error_message?: string | null
  error?: string | null
}

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

export type PaymentMethod =
  | 'credito'
  | 'debito'
  | 'pix'
  | 'dinheiro'
  | 'boleto'
  | 'transferencia'
  | 'misto'
  | 'outro'

export type PaymentType =
  | 'avista'
  | 'entrada_parcelas'
  | 'parcelado_sem_entrada'
  | 'recorrente'
  | 'outro'

export interface CloseCycleWonRequest {
  cycle_id: string
  won_value?: number
  revenue_date_ref?: string | null
  won_note?: string | null
  product_id?: string | null
  won_unit_price?: number | null
  payment_method?: PaymentMethod | null
  payment_type?: PaymentType | null
  entry_amount?: number | null
  installments_count?: number | null
  installment_amount?: number | null
  payment_notes?: string | null
}

export interface CloseCycleLostRequest {
  cycle_id: string
  lost_reason?: string
  note?: string | null
  action_channel?: string | null
}