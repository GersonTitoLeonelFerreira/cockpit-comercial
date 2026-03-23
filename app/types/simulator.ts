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

// ==============================================================================
// Types: Teoria 100/20 — Faturamento
// ==============================================================================

export interface Theory10020Config {
  meta_total: number           // Meta total desejada em R$
  ticket_medio: number         // Ticket médio manual em R$
  close_rate: number           // Taxa de conversão (0..1)
  remaining_business_days: number // Dias úteis restantes
  total_real: number           // Faturamento real acumulado no período
}

export interface Theory10020Result {
  meta_total: number
  esforco_bruto: number              // meta_total × 5
  garantia_minima: number            // meta_total × 0.20 (informational)
  ticket_medio: number
  close_rate: number                 // 0..1
  leads_para_contatar: number        // esforco_bruto / ticket_medio
  ganhos_esperados: number           // leads_para_contatar × close_rate
  leads_por_dia: number              // leads_para_contatar / dias_uteis
  ganhos_por_dia: number             // ganhos_esperados / dias_uteis
  remaining_business_days: number
  total_real: number
  gap: number                        // meta_total - total_real
  ganhos_restantes: number           // gap / ticket_medio
  leads_restantes_por_dia: number    // (gap_leads) / dias_uteis
  ganhos_restantes_por_dia: number   // ganhos_restantes / dias_uteis
  meta_atingida: boolean
  progress_pct: number               // 0..1
}