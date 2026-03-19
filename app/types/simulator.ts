// ==============================================================================
// Types: Simulator / Meta
// ==============================================================================

export interface SimulatorConfig {
  target_wins: number
  close_rate: number
  ticket_medio: number
  remaining_business_days: number
}

export interface SimulatorMetrics {
  company_id: string
  month_start: string
  month_end: string
  owner_user_id: string | null
  is_admin: boolean
  current_wins: number
  worked_count: number
  total_open: number
  total_pool: number
  counts_by_status: {
    novo: number
    contato: number
    respondeu: number
    negociacao: number
    ganho: number
    perdido: number
  }
}

export interface SimulatorResult {
  needed_wins: number
  remaining_wins: number
  needed_worked_cycles: number
  remaining_worked_cycles: number
  daily_worked_needed: number
  daily_worked_remaining: number
  simulation_15pct: number
  simulation_25pct: number
  progress_pct: number // ratio (0..1)
  on_track: boolean
}

export interface ActiveCompetency {
  month: string
  month_start: string
  month_end: string
}

export type SimulatorMode = 'ganhos' | 'faturamento' | 'recebimento'

export interface RevenueDayPoint {
  date: string // YYYY-MM-DD
  value: number
}

export interface RevenueSummaryResponse {
  success: boolean
  total_real: number
  days: RevenueDayPoint[]
}

export interface RevenueKpis {
  goal: number
  total_real: number
  gap: number
  required_per_business_day: number
  projection: number
  pacing_ratio: number
  status: 'no_ritmo' | 'atencao' | 'acelerar'
}

export interface GroupConversionRow {
  group_id: string | null
  group_name: string
  novo: number
  contato: number
  respondeu: number
  negociacao: number
  ganho: number
  perdido: number
  trabalhados: number
  pct_grupo: number
  pct_participacao: number
}