// ==============================================================================
// Types: Sazonalidade por Dia da Semana — Fase 6.1
// ==============================================================================

/** 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb */
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface WeekdayPerformanceRow {
  weekday: WeekdayIndex
  weekday_label: string               // 'Domingo', 'Segunda', etc.
  weekday_short: string               // 'Dom', 'Seg', etc.
  // Leads trabalhados (fonte: sales_cycles.first_worked_at)
  leads_trabalhados: number
  // Ganhos (fonte: sales_cycles.won_at where status='ganho')
  ganhos: number
  // Perdidos (fonte: sales_cycles.lost_at or updated_at where status='perdido')
  perdidos: number
  // Faturamento (fonte: sum of won_total where won_at on this weekday)
  faturamento: number
  // Ticket médio (faturamento / ganhos, 0 if no ganhos)
  ticket_medio: number
  // Taxa de ganho (ganhos / leads_trabalhados, 0 if insufficient base)
  taxa_ganho: number                   // 0..1
  // Confidence flags
  base_suficiente_trabalho: boolean    // leads_trabalhados >= 10
  base_suficiente_ganho: boolean       // ganhos >= 5
  // Sample sizes
  semanas_com_dados: number            // how many distinct weeks had data for this weekday
}

export interface WeekdayPerformanceSummary {
  rows: WeekdayPerformanceRow[]        // always 7 rows (Dom-Sáb), even if 0
  // Best day KPIs
  melhor_dia_ganhos: WeekdayPerformanceRow | null
  melhor_dia_faturamento: WeekdayPerformanceRow | null
  melhor_dia_ticket: WeekdayPerformanceRow | null       // only among base_suficiente_ganho
  melhor_dia_trabalho: WeekdayPerformanceRow | null
  // Totals
  total_leads_trabalhados: number
  total_ganhos: number
  total_perdidos: number
  total_faturamento: number
  // Diagnostic text in Portuguese
  diagnostico: string
  // Period info
  period_start: string
  period_end: string
  semanas_no_periodo: number           // total weeks in the selected period
}

export interface WeekdayPerformanceFilters {
  companyId: string
  ownerId?: string | null
  dateStart: string                    // YYYY-MM-DD
  dateEnd: string                      // YYYY-MM-DD
}
