// ==============================================================================
// Types: Radar do Período — Fase 6.5
//
// Classifica o cenário atual como favorável, neutro ou arriscado
// com base em sinais reais, auditáveis e explicáveis das Fases 6.1–6.4.
//
// Princípio crítico:
//   - Nenhuma classificação sem explicação
//   - Score interno apenas para ordenação (NÃO exibir ao usuário)
//   - Confiança baixa → forçar neutro, nunca inventar
//   - Cada sinal tem source identificável
// ==============================================================================

/** Status do radar do período */
export type PeriodRadarStatus = 'favoravel' | 'neutro' | 'arriscado'

/** Confiança da classificação */
export type PeriodRadarConfidence = 'alta' | 'moderada' | 'baixa'

/** Direção de um sinal individual */
export type SignalDirection = 'positivo' | 'neutro' | 'negativo'

/**
 * Um sinal individual que compõe o radar.
 * Cada sinal tem fonte identificável e pode estar indisponível.
 */
export interface PeriodRadarSignal {
  /** Identificador único do sinal (ex: 'weekday_vocation') */
  id: string
  /** Nome legível (ex: 'Vocação do dia da semana') */
  label: string
  /** Direção: positivo, neutro ou negativo */
  direction: SignalDirection
  /** Peso relativo (0..1) — impacto do sinal na classificação */
  weight: number
  /** Confiança desta leitura */
  confidence: PeriodRadarConfidence
  /** Explicação do motivo (ex: "Terça-feira tem histórico forte de fechamento") */
  description: string
  /** Fonte do dado (ex: "sales_cycles.won_at") */
  source: string
  /** Se o sinal está disponível (base suficiente) */
  available: boolean
  /** Motivo se indisponível (ex: "Menos de 10 leads no dia da semana atual") */
  fallback_reason?: string
}

/**
 * Motivo principal que puxou a classificação.
 * Top 3–5 fatores mais impactantes.
 */
export interface PeriodRadarReason {
  /** Texto explicativo (ex: "Semana do mês historicamente forte") */
  text: string
  /** Direção do fator */
  direction: SignalDirection
  /** Referência ao sinal que gerou este motivo */
  signal_id: string
}

/**
 * Resumo completo do radar do período.
 */
export interface PeriodRadarSummary {
  /** Status do período: favoravel | neutro | arriscado */
  status: PeriodRadarStatus
  /** Label legível: "Favorável" | "Neutro" | "Arriscado" */
  status_label: string
  /** Confiança da classificação */
  confidence: PeriodRadarConfidence
  /** Label legível: "Alta" | "Moderada" | "Baixa" */
  confidence_label: string

  /**
   * Score interno (0..100) — apenas para ordenação interna.
   * NÃO exibir ao usuário como "nota mágica".
   */
  score_interno: number

  /** Sinais individuais que compõem o radar */
  signals: PeriodRadarSignal[]

  /** Motivos principais (top 3–5 fatores) */
  reasons: PeriodRadarReason[]

  /** Síntese operacional — texto pronto para o gestor */
  sintese_operacional: string

  /** Diagnóstico completo explicando todos os sinais */
  diagnostico: string

  // Metadados
  period_start: string         // YYYY-MM-DD
  period_end: string           // YYYY-MM-DD
  reference_date: string       // data de referência (hoje)
  current_weekday: string      // ex: "Terça-feira"
  current_month: string        // ex: "Março"
  current_month_week: number   // semana do mês atual (1–5)

  // Contadores de sinais
  signals_available: number
  signals_unavailable: number
  signals_positive: number
  signals_negative: number
  signals_neutral: number
}

/**
 * Filtros do radar (mesmo padrão das Fases anteriores).
 */
export interface PeriodRadarFilters {
  companyId: string
  ownerId?: string | null
  /** Início do período histórico para comparação (YYYY-MM-DD) */
  dateStart: string
  /** Fim do período histórico (YYYY-MM-DD) */
  dateEnd: string
}
