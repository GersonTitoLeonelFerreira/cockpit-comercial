// ==============================================================================
// Types: Relatório por Dia da Semana
// ==============================================================================

/** 0=Domingo, 1=Segunda, 2=Terça, 3=Quarta, 4=Quinta, 5=Sexta, 6=Sábado */
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface WeekdayPerformanceRow {
  weekday: WeekdayIndex
  weekday_label: string
  weekday_short: string

  acoes_comerciais: number
  avancos: number

  ganhos: number
  perdidos: number
  faturamento: number
  ticket_medio: number

  semanas_com_dados: number
}

export interface WeekdayPerformanceSummary {
  rows: WeekdayPerformanceRow[]

  melhor_dia_acoes: WeekdayPerformanceRow | null
  melhor_dia_avancos: WeekdayPerformanceRow | null
  melhor_dia_ganhos: WeekdayPerformanceRow | null
  melhor_dia_faturamento: WeekdayPerformanceRow | null
  melhor_dia_ticket: WeekdayPerformanceRow | null

  total_acoes_comerciais: number
  total_avancos: number
  total_ganhos: number
  total_perdidos: number
  total_faturamento: number
  ticket_medio_geral: number

  diagnostico: string

  period_start: string
  period_end: string
  semanas_no_periodo: number
}

export interface WeekdayPerformanceFilters {
  companyId: string
  ownerId?: string | null
  dateStart: string
  dateEnd: string
}