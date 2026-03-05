// Types for the Sales Cycles feature

export type CycleStatus =
  | 'novo'
  | 'contato'
  | 'respondeu'
  | 'negociacao'
  | 'ganho'
  | 'perdido'

export type CycleEventType =
  | 'cycle_created'
  | 'stage_changed'
  | 'owner_assigned'
  | 'closed_won'
  | 'closed_lost'
  | 'next_action_set'
  | string

export type SalesCycle = {
  id: string
  company_id: string
  lead_id: string
  owner_user_id: string | null
  status: CycleStatus
  next_action: string | null
  next_action_date: string | null
  stage_entered_at: string | null
  deal_value: number | null
  loss_reason: string | null
  closed_at: string | null
  created_at: string
  updated_at: string | null
  // joined from leads
  lead?: SalesCycleLead | null
  // joined from profiles
  owner?: SalesCycleOwner | null
}

export type SalesCycleLead = {
  id: string
  name: string
  phone: string | null
  email: string | null
}

export type SalesCycleOwner = {
  id: string
  full_name: string | null
  email: string | null
}

export type CycleEvent = {
  id: string
  cycle_id: string
  company_id: string
  user_id: string | null
  event_type: CycleEventType
  from_stage: string | null
  to_stage: string | null
  metadata: Record<string, any> | null
  created_at: string
}

export type PoolCycle = {
  id: string
  company_id: string
  lead_id: string
  owner_user_id: string | null
  status: CycleStatus
  next_action: string | null
  next_action_date: string | null
  stage_entered_at: string | null
  created_at: string
  lead_name: string | null
  lead_phone: string | null
}
