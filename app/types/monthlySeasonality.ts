// ==============================================================================
// Types: Sazonalidade Mensal — Fase 6.4
//
// Analisa a operação comercial por mês do ano (janeiro a dezembro),
// permitindo identificar padrões sazonais históricos.
//
// Regras de confiança:
//   - base_suficiente_trabalho: leads_trabalhados >= 10
//   - base_suficiente_ganho: ganhos >= 5
//   - anos_com_dados: quantos anos distintos tiveram atividade neste mês
// ==============================================================================

/** Número do mês no ano (1 = Janeiro, 12 = Dezembro). */
export type MonthIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12

export interface MonthlySeasonalityRow {
  month: MonthIndex
  month_label: string              // 'Janeiro', 'Fevereiro', etc.
  month_short: string              // 'Jan', 'Fev', etc.
  // Leads trabalhados (fonte: sales_cycles.first_worked_at)
  leads_trabalhados: number
  // Ganhos (fonte: sales_cycles.won_at where status='ganho' and won_total > 0)
  ganhos: number
  // Perdidos (fonte: sales_cycles.lost_at ou updated_at como proxy)
  perdidos: number
  // Faturamento (fonte: sum of won_total onde won_at cai neste mês)
  faturamento: number
  // Ticket médio (faturamento / ganhos, 0 se sem ganhos)
  ticket_medio: number
  // Taxa de ganho (ganhos / leads_trabalhados, 0 se base insuficiente)
  taxa_ganho: number               // 0..1
  // Flags de confiança
  base_suficiente_trabalho: boolean  // leads_trabalhados >= 10
  base_suficiente_ganho: boolean     // ganhos >= 5
  // Quantos anos distintos tiveram dados neste mês
  anos_com_dados: number
}

export interface MonthlySeasonalitySummary {
  rows: MonthlySeasonalityRow[]    // sempre 12 linhas (meses 1–12)
  // Melhores meses por KPI
  melhor_mes_ganhos: MonthlySeasonalityRow | null
  melhor_mes_faturamento: MonthlySeasonalityRow | null
  melhor_mes_ticket: MonthlySeasonalityRow | null    // só entre base_suficiente_ganho
  melhor_mes_trabalho: MonthlySeasonalityRow | null
  // Totais do período
  total_leads_trabalhados: number
  total_ganhos: number
  total_perdidos: number
  total_faturamento: number
  // Diagnóstico textual em português
  diagnostico: string
  // Leitura resumida (array de frases)
  leitura_resumida: string[]
  // Metadados do período
  period_start: string             // YYYY-MM-DD
  period_end: string               // YYYY-MM-DD
  meses_no_periodo: number         // meses distintos no intervalo selecionado
}

// ==============================================================================
// Vocação Mensal
// ==============================================================================

export type MonthlyVocationType = 'prospeccao' | 'followup' | 'negociacao' | 'fechamento'
export type MonthlyVocationConfidence = 'alta' | 'moderada' | 'baixa' | 'insuficiente'

export interface MonthlyVocationSignal {
  type: MonthlyVocationType
  label: string                    // 'Prospecção', 'Follow-up', etc.
  count: number                    // contagem absoluta de eventos
  share: number                    // participação deste mês vs total do tipo (0..1)
  strength: number                 // força normalizada (0..1) — share relativa ao mês mais forte
  confidence: MonthlyVocationConfidence
  source_description: string
}

export interface MonthlyVocationalRow {
  month: MonthIndex
  month_label: string              // 'Janeiro', etc.
  month_short: string              // 'Jan', etc.
  signals: MonthlyVocationSignal[] // 4 sinais (um por tipo)
  dominant_vocation: MonthlyVocationType | null
  dominant_label: string
  dominant_confidence: MonthlyVocationConfidence
  observation: string
}

export interface MonthlyVocationalSummary {
  rows: MonthlyVocationalRow[]     // sempre 12 linhas
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

// ==============================================================================
// Filtros (mesmo padrão das Fases anteriores)
// ==============================================================================

export interface MonthlySeasonalityFilters {
  companyId: string
  ownerId?: string | null
  dateStart: string                // YYYY-MM-DD
  dateEnd: string                  // YYYY-MM-DD
}
