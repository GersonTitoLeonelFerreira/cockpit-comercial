import type { LeadStatus } from '@/app/types/sales_cycles'

export type SalesPulseState = 'forte' | 'ativo' | 'fraco' | 'critico' | 'sem_pulso'

export type SalesPulseSeverity = 'positive' | 'neutral' | 'warning' | 'danger' | 'dead'

export interface SalesPulseLeadSummary {
  id?: string | null
  name?: string | null
  phone?: string | null
  email?: string | null
}

export interface SalesPulseCycleRow {
  id: string
  company_id: string
  lead_id: string
  owner_user_id: string | null
  status: LeadStatus
  previous_status?: LeadStatus | null
  stage_entered_at: string | null
  next_action: string | null
  next_action_date: string | null
  current_group_id?: string | null
  created_at: string
  updated_at: string
  closed_at?: string | null
  won_at?: string | null
  lost_at?: string | null
  lost_reason?: string | null
  leads?: SalesPulseLeadSummary | null
}

export interface SalesPulseSignal {
  label: string
  detail: string
  severity: SalesPulseSeverity
}

export interface SalesPulseCyclePulse {
  cycleId: string
  companyId: string
  leadId: string
  ownerUserId: string | null
  leadName: string
  leadPhone: string | null
  leadEmail: string | null
  status: LeadStatus
  score: number
  state: SalesPulseState
  stateLabel: string
  severity: SalesPulseSeverity
  daysInStage: number | null
  daysSinceUpdate: number | null
  nextAction: string | null
  nextActionDate: string | null
  isNextActionOverdue: boolean
  mainReason: string
  recommendedAction: string
  signals: SalesPulseSignal[]
}

export interface SalesPulseSummary {
  totalOpenCycles: number
  strongCycles: number
  activeCycles: number
  weakCycles: number
  criticalCycles: number
  deadCycles: number
  overdueNextActions: number
  cyclesWithoutNextAction: number
  averageScore: number
}

export interface SalesPulsePageData {
  summary: SalesPulseSummary
  cycles: SalesPulseCyclePulse[]
  criticalCycles: SalesPulseCyclePulse[]
  recommendedActions: SalesPulseSignal[]
  generatedAt: string
}
