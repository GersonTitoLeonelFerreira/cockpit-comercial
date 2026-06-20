// ==============================================================================
// Types: Relatório por Semana do Mês
// ==============================================================================

/**
 * Semana 1 = dias 1–7
 * Semana 2 = dias 8–14
 * Semana 3 = dias 15–21
 * Semana 4 = dias 22–28
 * Semana 5 = dias 29–31
 */
export type MonthWeekIndex = 1 | 2 | 3 | 4 | 5

export interface MonthWeekPerformanceRow {
  week: MonthWeekIndex
  week_label: string
  week_short: string
  week_description: string

  acoes_comerciais: number
  avancos: number

  ganhos: number
  perdidos: number
  faturamento: number
  ticket_medio: number

  meses_com_dados: number
}

export interface MonthWeekPerformanceSummary {
  rows: MonthWeekPerformanceRow[]

  melhor_semana_acoes: MonthWeekPerformanceRow | null
  melhor_semana_avancos: MonthWeekPerformanceRow | null
  melhor_semana_ganhos: MonthWeekPerformanceRow | null
  melhor_semana_faturamento: MonthWeekPerformanceRow | null
  melhor_semana_ticket: MonthWeekPerformanceRow | null

  total_acoes_comerciais: number
  total_avancos: number
  total_ganhos: number
  total_perdidos: number
  total_faturamento: number
  ticket_medio_geral: number

  diagnostico: string
  leitura_resumida: string[]

  period_start: string
  period_end: string
  meses_no_periodo: number
}

// ==============================================================================
// Tipos preservados para compatibilidade com monthWeekVocation.ts
// ==============================================================================

export type MonthWeekVocationType =
  | 'prospeccao'
  | 'followup'
  | 'negociacao'
  | 'fechamento'

export type MonthWeekVocationConfidence =
  | 'alta'
  | 'moderada'
  | 'baixa'
  | 'insuficiente'

export interface MonthWeekVocationSignal {
  type: MonthWeekVocationType
  label: string
  count: number
  share: number
  strength: number
  confidence: MonthWeekVocationConfidence
  source_description: string
}

export interface MonthWeekVocationalRow {
  week: MonthWeekIndex
  week_label: string
  week_short: string
  week_description: string
  signals: MonthWeekVocationSignal[]
  dominant_vocation: MonthWeekVocationType | null
  dominant_label: string
  dominant_confidence: MonthWeekVocationConfidence
  observation: string
}

export interface MonthWeekVocationalSummary {
  rows: MonthWeekVocationalRow[]
  melhor_semana_prospeccao: MonthWeekVocationalRow | null
  melhor_semana_followup: MonthWeekVocationalRow | null
  melhor_semana_negociacao: MonthWeekVocationalRow | null
  melhor_semana_fechamento: MonthWeekVocationalRow | null
  leitura_resumida: string[]
  period_start: string
  period_end: string
  total_events_prospeccao: number
  total_events_followup: number
  total_events_negociacao: number
  total_events_fechamento: number
  has_cycle_events: boolean
}

export interface MonthWeekFilters {
  companyId: string
  ownerId?: string | null
  dateStart: string
  dateEnd: string
}