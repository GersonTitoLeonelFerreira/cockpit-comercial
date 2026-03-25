// ==============================================================================
// Types: Sazonalidade por Semana do Mês — Fase 6.3
//
// CRITÉRIO DE CLASSIFICAÇÃO DA SEMANA DO MÊS (baseado no dia do mês):
//   semana 1 = dias  1–7
//   semana 2 = dias  8–14
//   semana 3 = dias 15–21
//   semana 4 = dias 22–28
//   semana 5 = dias 29–31
//
// Regra explicável: o número da semana é calculado como Math.ceil(dia / 7),
// o que garante consistência entre meses e não depende de calendário ISO.
// A 5ª semana existe apenas em meses com 29+ dias; quando presente, têm no
// máximo 3 dias (29, 30, 31) — isso deve ser sinalizado como base insuficiente
// na maioria dos casos.
// ==============================================================================

/** Número da semana dentro do mês (1 a 5). */
export type MonthWeekIndex = 1 | 2 | 3 | 4 | 5

export interface MonthWeekPerformanceRow {
  week: MonthWeekIndex
  week_label: string               // '1ª semana', '2ª semana', etc.
  week_short: string               // 'Sem 1', 'Sem 2', etc.
  week_description: string         // 'Dias 1–7', 'Dias 8–14', etc.
  // Leads trabalhados (fonte: sales_cycles.first_worked_at)
  leads_trabalhados: number
  // Ganhos (fonte: sales_cycles.won_at where status='ganho' and won_total > 0)
  ganhos: number
  // Perdidos (fonte: sales_cycles.lost_at ou updated_at como proxy)
  perdidos: number
  // Faturamento (fonte: sum of won_total onde won_at cai nesta semana)
  faturamento: number
  // Ticket médio (faturamento / ganhos, 0 se sem ganhos)
  ticket_medio: number
  // Taxa de ganho (ganhos / leads_trabalhados, 0 se base insuficiente)
  taxa_ganho: number               // 0..1
  // Flags de confiança
  base_suficiente_trabalho: boolean  // leads_trabalhados >= 10
  base_suficiente_ganho: boolean     // ganhos >= 5
  // Quantos meses distintos tiveram dados nesta semana
  meses_com_dados: number
}

export interface MonthWeekPerformanceSummary {
  rows: MonthWeekPerformanceRow[]  // sempre 5 linhas (semanas 1–5)
  // Melhores semanas por KPI
  melhor_semana_ganhos: MonthWeekPerformanceRow | null
  melhor_semana_faturamento: MonthWeekPerformanceRow | null
  melhor_semana_ticket: MonthWeekPerformanceRow | null    // só entre base_suficiente_ganho
  melhor_semana_trabalho: MonthWeekPerformanceRow | null
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
// Vocação por Semana do Mês — mesmos tipos de vocação da Fase 6.2
// ==============================================================================

export type MonthWeekVocationType = 'prospeccao' | 'followup' | 'negociacao' | 'fechamento'
export type MonthWeekVocationConfidence = 'alta' | 'moderada' | 'baixa' | 'insuficiente'

export interface MonthWeekVocationSignal {
  type: MonthWeekVocationType
  label: string                    // 'Prospecção', 'Follow-up', etc.
  count: number                    // contagem absoluta de eventos
  share: number                    // participação desta semana vs total do tipo (0..1)
  strength: number                 // força normalizada (0..1) — share relativa à semana mais forte
  confidence: MonthWeekVocationConfidence
  source_description: string
}

export interface MonthWeekVocationalRow {
  week: MonthWeekIndex
  week_label: string               // '1ª semana', etc.
  week_short: string               // 'Sem 1', etc.
  week_description: string         // 'Dias 1–7', etc.
  signals: MonthWeekVocationSignal[]   // 4 sinais (um por tipo)
  dominant_vocation: MonthWeekVocationType | null
  dominant_label: string
  dominant_confidence: MonthWeekVocationConfidence
  observation: string
}

export interface MonthWeekVocationalSummary {
  rows: MonthWeekVocationalRow[]   // sempre 5 linhas
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

// ==============================================================================
// Filtros (mesmos da Fase 6.1 / 6.2)
// ==============================================================================

export interface MonthWeekFilters {
  companyId: string
  ownerId?: string | null
  dateStart: string                // YYYY-MM-DD
  dateEnd: string                  // YYYY-MM-DD
}
