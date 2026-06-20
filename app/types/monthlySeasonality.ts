// ==============================================================================
// Types: Sazonalidade Mensal
// ==============================================================================

/** Número do mês no ano. */
export type MonthIndex =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12

export interface MonthlySeasonalityRow {
  month: MonthIndex
  month_label: string
  month_short: string

  acoes_comerciais: number
  avancos: number

  ganhos: number
  perdidos: number
  faturamento: number
  ticket_medio: number

  anos_com_dados: number

  // Compatibilidade com a rota legada /dashboard/relatorios/mes.
  // Não utilizar para novos relatórios.
  leads_trabalhados: number
  taxa_ganho: number
  base_suficiente_trabalho: boolean
  base_suficiente_ganho: boolean
}

export interface MonthlySeasonalitySummary {
  rows: MonthlySeasonalityRow[]

  melhor_mes_acoes: MonthlySeasonalityRow | null
  melhor_mes_avancos: MonthlySeasonalityRow | null
  melhor_mes_ganhos: MonthlySeasonalityRow | null
  melhor_mes_faturamento: MonthlySeasonalityRow | null
  melhor_mes_ticket: MonthlySeasonalityRow | null

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
  anos_no_periodo: number

  // Compatibilidade com a rota legada /dashboard/relatorios/mes.
  total_leads_trabalhados: number
  melhor_mes_trabalho: MonthlySeasonalityRow | null
}

// ==============================================================================
// Tipos preservados para monthlySeasonalityVocation.ts
// ==============================================================================

export type MonthlyVocationType =
  | 'prospeccao'
  | 'followup'
  | 'negociacao'
  | 'fechamento'

export type MonthlyVocationConfidence =
  | 'alta'
  | 'moderada'
  | 'baixa'
  | 'insuficiente'

export interface MonthlyVocationSignal {
  type: MonthlyVocationType
  label: string
  count: number
  share: number
  strength: number
  confidence: MonthlyVocationConfidence
  source_description: string
}

export interface MonthlyVocationalRow {
  month: MonthIndex
  month_label: string
  month_short: string
  signals: MonthlyVocationSignal[]
  dominant_vocation: MonthlyVocationType | null
  dominant_label: string
  dominant_confidence: MonthlyVocationConfidence
  observation: string
}

export interface MonthlyVocationalSummary {
  rows: MonthlyVocationalRow[]
  melhor_mes_prospeccao: MonthlyVocationalRow | null
  melhor_mes_followup: MonthlyVocationalRow | null
  melhor_mes_negociacao: MonthlyVocationalRow | null
  melhor_mes_fechamento: MonthlyVocationalRow | null
  leitura_resumida: string[]
  period_start: string
  period_end: string
  total_events_prospeccao: number
  total_events_followup: number
  total_events_negociacao: number
  total_events_fechamento: number
  has_cycle_events: boolean
}

export interface MonthlySeasonalityFilters {
  companyId: string
  ownerId?: string | null
  dateStart: string
  dateEnd: string
}