// ==============================================================================
// Types: Distribuição Inteligente da Meta no Calendário — Fase 6.6
//
// Distribui metas de leads e ganhos de modo inteligente e operacionalmente
// fundamentado nos dias do ciclo comercial, aproveitando sinais estatísticos
// das Fases 6.1–6.5.
//
// Princípios:
//   - Distribuição explicável e auditável
//   - Conservadorismo: base insuficiente → fallback neutro
//   - Cada dia recebe peso proporcional à sua vocação e sazonalidade
//   - Não aplica forecasts avançados, IA ou estimativas fora do escopo
// ==============================================================================

/** Tipo de foco operacional do dia */
export type OperationalFocusType =
  | 'prospeccao'
  | 'followup'
  | 'negociacao'
  | 'fechamento'
  | 'neutro'

/** Nível de confiança da distribuição */
export type DistributionConfidence = 'alta' | 'moderada' | 'baixa' | 'insuficiente'

/**
 * Sinal individual usado na distribuição.
 * Cada sinal tem fonte identificável (Fase 6.x).
 */
export interface DistributionSignal {
  /** Identificador único (ex: 'weekday_vocation', 'monthly_seasonality') */
  id: string
  /** Nome legível */
  label: string
  /** Fonte do dado (ex: 'Fase 6.2 — Vocação por Dia da Semana') */
  source: string
  /** Peso do sinal na composição (0..1) */
  weight: number
  /** Confiança desta leitura */
  confidence: DistributionConfidence
  /** Se o sinal está disponível (base suficiente) */
  available: boolean
  /** Explicação resumida */
  description: string
  /** Motivo se indisponível */
  fallback_reason?: string
}

/**
 * Uma linha do calendário de distribuição — um dia do ciclo comercial.
 */
export interface CalendarDistributionRow {
  /** Data no formato YYYY-MM-DD */
  date: string
  /** Dia da semana (0=Dom, 6=Sáb) */
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6
  /** Label do dia da semana ('Segunda', 'Terça', etc.) */
  weekday_label: string
  /** Label curto ('Seg', 'Ter', etc.) */
  weekday_short: string
  /** Se é dia útil conforme configuração do usuário */
  is_working_day: boolean
  /** Foco operacional recomendado para o dia */
  focus_type: OperationalFocusType
  /** Label do foco ('Prospecção', 'Fechamento', etc.) */
  focus_label: string
  /** Peso relativo do dia para distribuição (0..1, soma dos dias úteis = 1) */
  weight: number
  /** Meta de leads para este dia */
  leads_goal: number
  /** Meta de ganhos para este dia */
  wins_goal: number
  /** Explicação/motivo da distribuição para este dia */
  reason: string
  /** Confiança da distribuição para este dia */
  confidence: DistributionConfidence
}

/**
 * Resumo da distribuição de metas no calendário.
 */
export interface DistributionSummary {
  /** Total de dias úteis no período */
  total_working_days: number
  /** Total de leads distribuídos (deve igualar total configurado) */
  total_leads: number
  /** Total de ganhos distribuídos */
  total_wins: number
  /** Média de leads por dia útil */
  avg_leads_per_day: number
  /** Média de ganhos por dia útil */
  avg_wins_per_day: number
  /** Dia com maior carga de leads (pico) */
  peak_day: CalendarDistributionRow | null
  /** Contagem de dias por tipo de foco */
  focus_distribution: Record<OperationalFocusType, number>
  /** Confiança geral da distribuição */
  confidence: DistributionConfidence
  /** Label legível da confiança */
  confidence_label: string
}

/**
 * Resultado completo da distribuição inteligente de metas.
 */
export interface DailyGoalDistribution {
  /** Todas as linhas do calendário (dias úteis e não úteis) */
  rows: CalendarDistributionRow[]
  /** Resumo agregado */
  summary: DistributionSummary
  /** Sinais utilizados na distribuição */
  signals_used: DistributionSignal[]
  /** Observações gerenciais */
  observations: string[]
  /** Se o fallback (distribuição uniforme) foi utilizado */
  is_fallback: boolean
  /** Motivo do fallback, se aplicável */
  fallback_reason: string | null
  /** Início do período */
  period_start: string
  /** Fim do período */
  period_end: string
}

/**
 * Configuração para geração da distribuição.
 */
export interface DistributionConfig {
  /** Data de início do período (YYYY-MM-DD) */
  dateStart: string
  /** Data de fim do período (YYYY-MM-DD) */
  dateEnd: string
  /** Dias da semana trabalhados (0=Dom..6=Sáb) */
  workDays: Record<number, boolean>
  /** Meta total de leads a contatar */
  totalLeads: number
  /** Meta total de ganhos */
  totalWins: number
  /** Taxa de conversão (0..1) — usada para validação */
  closeRate: number
}

/**
 * Sinais de entrada das fases anteriores.
 * Todos opcionais — ausência ativa fallback conservador.
 */
export interface DistributionInputSignals {
  /** Vocação por dia da semana (Fase 6.2) — map weekday 0..6 → vocation */
  weekdayVocation?: Record<
    number,
    {
      dominant_vocation: string | null
      dominant_confidence: string
      prospeccao_strength: number
      fechamento_strength: number
      followup_strength: number
      negociacao_strength: number
    }
  >
  /** Sazonalidade do mês atual (Fase 6.4) */
  monthlySeasonality?: {
    month: number
    leads_trabalhados: number
    ganhos: number
    base_suficiente_trabalho: boolean
    base_suficiente_ganho: boolean
    taxa_ganho: number
  } | null
  /** Radar do período (Fase 6.5) */
  periodRadar?: {
    status: 'favoravel' | 'neutro' | 'arriscado'
    confidence: 'alta' | 'moderada' | 'baixa'
    score_interno: number
  } | null
  /** Semana do mês — vocação da semana atual (Fase 6.3) */
  monthWeekSignal?: {
    week_of_month: number
    dominant_vocation: string | null
    confidence: string
  } | null
}
