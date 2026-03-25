// ==============================================================================
// Types: Vocação Operacional por Dia da Semana — Fase 6.2
// ==============================================================================

import type { WeekdayIndex } from './weekdayPerformance'

/** Tipos de vocação operacional */
export type VocationType = 'prospeccao' | 'followup' | 'negociacao' | 'fechamento'

/** Nível de confiança da classificação */
export type VocationConfidence = 'alta' | 'moderada' | 'baixa' | 'insuficiente'

/** Sinal de vocação para um tipo específico */
export interface VocationSignal {
  type: VocationType
  label: string                        // 'Prospecção', 'Follow-up', etc.
  count: number                        // contagem absoluta de eventos
  share: number                        // participação desse dia vs total da semana (0..1)
  strength: number                     // força normalizada (0..1) — share relativa ao dia mais forte
  confidence: VocationConfidence
  source_description: string           // ex: 'Baseado em first_worked_at de sales_cycles'
}

/** Linha de vocação por dia da semana */
export interface WeekdayVocationRow {
  weekday: WeekdayIndex
  weekday_label: string                // 'Segunda', 'Terça', etc.
  weekday_short: string                // 'Seg', 'Ter', etc.
  signals: VocationSignal[]            // 4 sinais (um por tipo de vocação)
  dominant_vocation: VocationType | null   // vocação com maior strength, ou null se insuficiente
  dominant_label: string               // 'Prospecção', ou 'Base insuficiente'
  dominant_confidence: VocationConfidence
  observation: string                  // texto diagnóstico do dia
}

/** Resumo geral da vocação */
export interface WeekdayVocationSummary {
  rows: WeekdayVocationRow[]           // sempre 7 linhas (Dom-Sáb)
  // Melhores dias por vocação
  melhor_dia_prospeccao: WeekdayVocationRow | null
  melhor_dia_followup: WeekdayVocationRow | null
  melhor_dia_negociacao: WeekdayVocationRow | null
  melhor_dia_fechamento: WeekdayVocationRow | null
  // Leitura resumida em português
  leitura_resumida: string[]           // array de frases diagnósticas
  // Metadata
  period_start: string
  period_end: string
  total_events_prospeccao: number
  total_events_followup: number
  total_events_negociacao: number
  total_events_fechamento: number
  has_cycle_events: boolean            // se cycle_events teve dados
}

/** Filtros (mesmos da Fase 6.1) */
export interface WeekdayVocationFilters {
  companyId: string
  ownerId?: string | null
  dateStart: string                    // YYYY-MM-DD
  dateEnd: string                      // YYYY-MM-DD
}
