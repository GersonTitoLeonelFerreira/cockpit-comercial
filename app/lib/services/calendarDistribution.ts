// ==============================================================================
// Service: Distribuição Inteligente da Meta no Calendário — Fase 6.6
//
// Utiliza sinais estatísticos das Fases 6.1–6.5 para distribuir metas de
// leads e ganhos de forma auditável e operacionalmente fundamentada nos dias
// do ciclo comercial.
//
// Lógica de pesos:
//   1. Peso-base: uniforme (1.0 por dia útil) — fallback conservador
//   2. Vocação do dia da semana (Fase 6.2): ajusta foco e leve variação de carga
//   3. Sazonalidade mensal (Fase 6.4): multiplica se mês forte / desconta se fraco
//   4. Radar do período (Fase 6.5): aplica fator global moderado
//
// HONESTIDADE:
//   - Base insuficiente em todos os sinais → distribuição uniforme (fallback)
//   - Nunca inventar vocação sem evidência
//   - Peso máximo ajustado: no máximo 2× a média por dia (evita concentração excessiva)
//   - Confiança geral rebaixada quando sinais são fracos
// ==============================================================================

import type {
  CalendarDistributionRow,
  DailyGoalDistribution,
  DistributionConfig,
  DistributionConfidence,
  DistributionInputSignals,
  DistributionSignal,
  DistributionSummary,
  OperationalFocusType,
} from '../../types/distribution'

// ==============================================================================
// Constants
// ==============================================================================

const WEEKDAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const WEEKDAY_SHORTS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const FOCUS_LABELS: Record<OperationalFocusType, string> = {
  prospeccao: 'Prospecção',
  followup: 'Follow-up',
  negociacao: 'Negociação',
  fechamento: 'Fechamento',
  neutro: 'Neutro',
}

// Máximo de variação de peso por dia (evita concentração excessiva)
const MAX_WEIGHT_MULTIPLIER = 1.8

// Multiplicador do radar sobre o peso base (moderado — não distorce muito)
const RADAR_BOOST = 0.15

// ==============================================================================
// Helpers
// ==============================================================================

function confidenceLabel(c: DistributionConfidence): string {
  const map: Record<DistributionConfidence, string> = {
    alta: 'Alta',
    moderada: 'Moderada',
    baixa: 'Baixa',
    insuficiente: 'Insuficiente',
  }
  return map[c]
}

function mapConfidence(raw: string): DistributionConfidence {
  if (raw === 'alta') return 'alta'
  if (raw === 'moderada') return 'moderada'
  if (raw === 'baixa') return 'baixa'
  return 'insuficiente'
}

function confidenceOrder(c: DistributionConfidence): number {
  const map: Record<DistributionConfidence, number> = { alta: 3, moderada: 2, baixa: 1, insuficiente: 0 }
  return map[c]
}

function lowerConfidence(a: DistributionConfidence, b: DistributionConfidence): DistributionConfidence {
  return confidenceOrder(a) <= confidenceOrder(b) ? a : b
}

function minConfidenceFrom(values: DistributionConfidence[]): DistributionConfidence {
  if (values.length === 0) return 'insuficiente'
  return values.reduce((acc, v) => lowerConfidence(acc, v))
}

/** Gera lista de datas entre start e end, inclusive, no formato YYYY-MM-DD */
function generateDateRange(start: string, end: string): string[] {
  const dates: string[] = []
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return dates
  const cur = new Date(s)
  while (cur <= e) {
    dates.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

/** Mapeia vocação dominante para OperationalFocusType */
function mapVocationToFocus(vocation: string | null | undefined): OperationalFocusType {
  if (vocation === 'prospeccao') return 'prospeccao'
  if (vocation === 'followup') return 'followup'
  if (vocation === 'negociacao') return 'negociacao'
  if (vocation === 'fechamento') return 'fechamento'
  return 'neutro'
}

/**
 * Distribui um total de unidades (inteiro) proporcionalmente a pesos fracionários.
 * Usa remainder-based distribution para garantir que a soma bate exato.
 */
function distributeProportional(weights: number[], total: number): number[] {
  if (weights.length === 0) return []
  const totalWeight = weights.reduce((a, b) => a + b, 0)
  if (totalWeight <= 0 || total <= 0) return weights.map(() => 0)

  // Calcular parte fracionária
  const exact = weights.map((w) => (w / totalWeight) * total)
  const floored = exact.map(Math.floor)
  const remainder = total - floored.reduce((a, b) => a + b, 0)

  // Distribuir o remainder para os índices com maior parte fracionária
  const fractions = exact.map((v, i) => ({ i, frac: v - floored[i] }))
  fractions.sort((a, b) => b.frac - a.frac)

  const result = [...floored]
  for (let k = 0; k < remainder; k++) {
    result[fractions[k].i]++
  }

  return result
}

// ==============================================================================
// Main function
// ==============================================================================

/**
 * Gera a distribuição inteligente da meta no calendário.
 *
 * @param config  - Configuração de período, dias úteis e metas
 * @param signals - Sinais opcionais das Fases 6.1–6.5
 */
export function buildCalendarDistribution(
  config: DistributionConfig,
  signals: DistributionInputSignals = {},
): DailyGoalDistribution {
  const { dateStart, dateEnd, workDays, totalLeads, totalWins, closeRate } = config

  const allDates = generateDateRange(dateStart, dateEnd)

  // ---- Evaluate available signals ----
  const signalsUsed: DistributionSignal[] = []

  // Signal 1: Weekday vocation (Fase 6.2)
  const hasWeekdayVocation =
    signals.weekdayVocation != null &&
    Object.keys(signals.weekdayVocation).length >= 5 // at least 5 weekdays

  signalsUsed.push({
    id: 'weekday_vocation',
    label: 'Vocação por Dia da Semana',
    source: 'Fase 6.2 — Vocação Operacional por Dia da Semana',
    weight: 0.5,
    confidence: hasWeekdayVocation ? 'moderada' : 'insuficiente',
    available: hasWeekdayVocation,
    description: hasWeekdayVocation
      ? 'Distribui mais carga aos dias com maior vocação histórica para o tipo de atividade.'
      : 'Dados de vocação por dia da semana não fornecidos.',
    fallback_reason: hasWeekdayVocation ? undefined : 'Sinal não disponível — usando distribuição uniforme.',
  })

  // Signal 2: Monthly seasonality (Fase 6.4)
  const hasMonthlySeasonality =
    signals.monthlySeasonality != null &&
    (signals.monthlySeasonality.base_suficiente_trabalho ||
      signals.monthlySeasonality.base_suficiente_ganho)

  const monthSeasonalityBoost = (() => {
    if (!hasMonthlySeasonality || !signals.monthlySeasonality) return 0
    const m = signals.monthlySeasonality
    // If taxa_ganho is 0 (no data), no boost
    if (m.ganhos < 3) return 0
    // Positive boost for strong months, slight negative for weak
    const taxaRef = 0.2 // referência: 20% taxa
    const ratio = m.taxa_ganho / taxaRef
    return Math.max(-0.15, Math.min(0.3, (ratio - 1) * 0.2))
  })()

  signalsUsed.push({
    id: 'monthly_seasonality',
    label: 'Sazonalidade do Mês',
    source: 'Fase 6.4 — Sazonalidade Mensal',
    weight: 0.2,
    confidence: hasMonthlySeasonality
      ? signals.monthlySeasonality!.base_suficiente_ganho
        ? 'moderada'
        : 'baixa'
      : 'insuficiente',
    available: hasMonthlySeasonality,
    description: hasMonthlySeasonality
      ? monthSeasonalityBoost >= 0
        ? `Mês historicamente forte — aplica leve aumento na distribuição diária.`
        : `Mês com taxa histórica abaixo da referência — mantém distribuição conservadora.`
      : 'Dados sazonais do mês não disponíveis.',
    fallback_reason: hasMonthlySeasonality ? undefined : 'Base mensal insuficiente.',
  })

  // Signal 3: Period radar (Fase 6.5)
  const hasPeriodRadar = signals.periodRadar != null

  const radarFactor = (() => {
    if (!hasPeriodRadar || !signals.periodRadar) return 0
    const r = signals.periodRadar
    if (r.confidence === 'baixa') return 0 // conservador: ignora radar fraco
    if (r.status === 'favoravel') return RADAR_BOOST
    if (r.status === 'arriscado') return -RADAR_BOOST * 0.5 // mais conservador no negativo
    return 0
  })()

  signalsUsed.push({
    id: 'period_radar',
    label: 'Radar do Período',
    source: 'Fase 6.5 — Radar do Período',
    weight: 0.3,
    confidence: hasPeriodRadar
      ? mapConfidence(signals.periodRadar!.confidence)
      : 'insuficiente',
    available: hasPeriodRadar,
    description: hasPeriodRadar
      ? signals.periodRadar!.status === 'favoravel'
        ? 'Período favorável — leve reforço na distribuição diária.'
        : signals.periodRadar!.status === 'arriscado'
        ? 'Período arriscado — distribuição conservadora mantida.'
        : 'Período neutro — sem ajuste no radar.'
      : 'Radar do período não disponível.',
    fallback_reason: hasPeriodRadar ? undefined : 'Dados do radar não fornecidos.',
  })

  // ---- Determine if full fallback is needed ----
  const availableSignals = signalsUsed.filter((s) => s.available).length
  const isFallback = availableSignals === 0

  // ---- Build rows ----
  const workingDates = allDates.filter((d) => {
    const wd = new Date(d + 'T00:00:00').getDay()
    return workDays[wd] === true
  })

  const nWorking = workingDates.length
  if (nWorking === 0) {
    // No working days — return empty distribution
    return buildEmptyDistribution(config, signalsUsed, dateStart, dateEnd)
  }

  // Compute per-day base weights (1.0 each), then apply signals
  const dayWeights: number[] = workingDates.map((d) => {
    const wd = new Date(d + 'T00:00:00').getDay()

    let weight = 1.0

    // Apply weekday vocation signal (mild boost: ±20%)
    if (hasWeekdayVocation && signals.weekdayVocation) {
      const voc = signals.weekdayVocation[wd]
      if (voc) {
        // Use combined strength of prospeccao + fechamento as productivity signal
        const activityStrength = (voc.prospeccao_strength + voc.fechamento_strength) / 2
        // Normalize: if activityStrength > 0.5 → boost, < 0.5 → slight reduction
        const boost = (activityStrength - 0.5) * 0.4
        weight *= 1 + boost
      }
    }

    // Apply monthly seasonality (global factor applied uniformly to all days)
    weight *= 1 + monthSeasonalityBoost

    // Apply radar factor (global modifier)
    weight *= 1 + radarFactor

    // Clamp weight to avoid extreme skew
    return Math.max(0.1, weight)
  })

  // Cap weights so no day exceeds MAX_WEIGHT_MULTIPLIER × average
  const avgWeight = dayWeights.reduce((a, b) => a + b, 0) / nWorking
  const cappedWeights = dayWeights.map((w) =>
    Math.min(w, avgWeight * MAX_WEIGHT_MULTIPLIER),
  )

  // Distribute leads and wins proportionally
  const leadsPerDay = distributeProportional(cappedWeights, Math.max(0, totalLeads))
  const winsPerDay = distributeProportional(cappedWeights, Math.max(0, totalWins))

  // Normalize final weights (0..1 sum = 1)
  const totalCappedWeight = cappedWeights.reduce((a, b) => a + b, 0)
  const normalizedWeights = cappedWeights.map((w) =>
    totalCappedWeight > 0 ? w / totalCappedWeight : 1 / nWorking,
  )

  // Build working-day rows
  const workingRows: CalendarDistributionRow[] = workingDates.map((d, idx) => {
    const wd = new Date(d + 'T00:00:00').getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6

    // Determine focus type
    let focusType: OperationalFocusType = 'neutro'
    let focusReason = 'Distribuição uniforme (sem dados de vocação suficientes).'
    let dayConfidence: DistributionConfidence = 'insuficiente'

    if (!isFallback && hasWeekdayVocation && signals.weekdayVocation) {
      const voc = signals.weekdayVocation[wd]
      if (voc && voc.dominant_vocation) {
        focusType = mapVocationToFocus(voc.dominant_vocation)
        dayConfidence = mapConfidence(voc.dominant_confidence)
        focusReason = `Vocação histórica do ${WEEKDAY_LABELS[wd]}: ${FOCUS_LABELS[focusType]}.`
        if (hasMonthlySeasonality && signals.monthlySeasonality) {
          const m = signals.monthlySeasonality
          if (m.base_suficiente_ganho && monthSeasonalityBoost > 0) {
            focusReason += ` Mês sazonalmente forte.`
          }
        }
        if (hasPeriodRadar && signals.periodRadar && signals.periodRadar.confidence !== 'baixa') {
          if (signals.periodRadar.status === 'favoravel') {
            focusReason += ` Radar do período favorável.`
          }
        }
      } else {
        focusType = 'neutro'
        dayConfidence = 'baixa'
        focusReason = `Sem vocação dominante clara para ${WEEKDAY_LABELS[wd]}.`
      }
    } else {
      focusType = 'neutro'
      dayConfidence = 'insuficiente'
      focusReason = 'Distribuição uniforme — dados de vocação insuficientes.'
    }

    return {
      date: d,
      weekday: wd,
      weekday_label: WEEKDAY_LABELS[wd],
      weekday_short: WEEKDAY_SHORTS[wd],
      is_working_day: true,
      focus_type: focusType,
      focus_label: FOCUS_LABELS[focusType],
      weight: normalizedWeights[idx],
      leads_goal: leadsPerDay[idx],
      wins_goal: winsPerDay[idx],
      reason: focusReason,
      confidence: dayConfidence,
    }
  })

  // Build non-working-day rows
  const workingDateSet = new Set(workingDates)
  const nonWorkingRows: CalendarDistributionRow[] = allDates
    .filter((d) => !workingDateSet.has(d))
    .map((d) => {
      const wd = new Date(d + 'T00:00:00').getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6
      return {
        date: d,
        weekday: wd,
        weekday_label: WEEKDAY_LABELS[wd],
        weekday_short: WEEKDAY_SHORTS[wd],
        is_working_day: false,
        focus_type: 'neutro' as OperationalFocusType,
        focus_label: 'Não operacional',
        weight: 0,
        leads_goal: 0,
        wins_goal: 0,
        reason: 'Dia não útil — sem meta atribuída.',
        confidence: 'insuficiente' as DistributionConfidence,
      }
    })

  // Merge and sort all rows by date
  const allRows = [...workingRows, ...nonWorkingRows].sort((a, b) =>
    a.date.localeCompare(b.date),
  )

  // ---- Build summary ----
  const peakRow = workingRows.length > 0
    ? workingRows.reduce((best, row) => (row.leads_goal > best.leads_goal ? row : best), workingRows[0])
    : null

  const focusDistribution: Record<OperationalFocusType, number> = {
    prospeccao: 0,
    followup: 0,
    negociacao: 0,
    fechamento: 0,
    neutro: 0,
  }
  for (const row of workingRows) {
    focusDistribution[row.focus_type]++
  }

  const overallConfidence: DistributionConfidence = isFallback
    ? 'insuficiente'
    : minConfidenceFrom(
        signalsUsed
          .filter((s) => s.available)
          .map((s) => s.confidence),
      )

  const summary: DistributionSummary = {
    total_working_days: nWorking,
    total_leads: leadsPerDay.reduce((a, b) => a + b, 0),
    total_wins: winsPerDay.reduce((a, b) => a + b, 0),
    avg_leads_per_day: nWorking > 0 ? Math.round((leadsPerDay.reduce((a, b) => a + b, 0) / nWorking) * 10) / 10 : 0,
    avg_wins_per_day: nWorking > 0 ? Math.round((winsPerDay.reduce((a, b) => a + b, 0) / nWorking) * 10) / 10 : 0,
    peak_day: peakRow,
    focus_distribution: focusDistribution,
    confidence: overallConfidence,
    confidence_label: confidenceLabel(overallConfidence),
  }

  // ---- Build observations ----
  const observations: string[] = buildObservations(
    config,
    signals,
    summary,
    isFallback,
    availableSignals,
    hasWeekdayVocation,
    hasMonthlySeasonality,
    hasPeriodRadar,
    closeRate,
  )

  return {
    rows: allRows,
    summary,
    signals_used: signalsUsed,
    observations,
    is_fallback: isFallback,
    fallback_reason: isFallback
      ? 'Nenhum sinal das Fases 6.1–6.5 disponível. Distribuição uniforme aplicada.'
      : null,
    period_start: dateStart,
    period_end: dateEnd,
  }
}

// ==============================================================================
// Helpers
// ==============================================================================

function buildEmptyDistribution(
  config: DistributionConfig,
  signalsUsed: DistributionSignal[],
  dateStart: string,
  dateEnd: string,
): DailyGoalDistribution {
  return {
    rows: [],
    summary: {
      total_working_days: 0,
      total_leads: 0,
      total_wins: 0,
      avg_leads_per_day: 0,
      avg_wins_per_day: 0,
      peak_day: null,
      focus_distribution: {
        prospeccao: 0,
        followup: 0,
        negociacao: 0,
        fechamento: 0,
        neutro: 0,
      },
      confidence: 'insuficiente',
      confidence_label: 'Insuficiente',
    },
    signals_used: signalsUsed,
    observations: ['Nenhum dia útil encontrado no período configurado.'],
    is_fallback: true,
    fallback_reason: 'Sem dias úteis no período.',
    period_start: dateStart,
    period_end: dateEnd,
  }
}

function buildObservations(
  config: DistributionConfig,
  signals: DistributionInputSignals,
  summary: DistributionSummary,
  isFallback: boolean,
  availableSignals: number,
  hasWeekdayVocation: boolean,
  hasMonthlySeasonality: boolean,
  hasPeriodRadar: boolean,
  closeRate: number,
): string[] {
  const obs: string[] = []

  if (isFallback) {
    obs.push(
      '⚠️ Distribuição uniforme aplicada: nenhum sinal estatístico das fases anteriores foi fornecido. ' +
        'Configure os filtros de período e vendedor para ativar a distribuição inteligente.',
    )
  } else {
    if (availableSignals < 2) {
      obs.push(
        '⚠️ Poucos sinais disponíveis (' +
          availableSignals +
          '/3). A distribuição é conservadora e próxima do uniforme.',
      )
    } else {
      obs.push(
        `✅ Distribuição baseada em ${availableSignals} sinal(is) estatístico(s) das Fases 6.1–6.5.`,
      )
    }
  }

  if (!hasWeekdayVocation) {
    obs.push(
      'ℹ️ Vocação por dia da semana não disponível — distribuição não diferencia dias por tipo de atividade.',
    )
  }

  if (!hasMonthlySeasonality) {
    obs.push(
      'ℹ️ Sazonalidade mensal não disponível — sem ajuste sazonal na carga diária.',
    )
  }

  if (!hasPeriodRadar) {
    obs.push('ℹ️ Radar do período não disponível — sem ajuste de cenário global.')
  }

  if (summary.total_working_days > 0) {
    const conversionCheck = closeRate > 0 ? Math.round(summary.total_leads * closeRate) : null
    if (
      conversionCheck !== null &&
      Math.abs(conversionCheck - summary.total_wins) > 2
    ) {
      obs.push(
        `ℹ️ Os ${summary.total_wins} ganhos distribuídos representam ${(summary.total_wins / Math.max(1, summary.total_leads) * 100).toFixed(1)}% dos ${summary.total_leads} leads — ` +
          `revise a taxa de conversão ou a meta de ganhos se houver inconsistência.`,
      )
    }
  }

  if (hasPeriodRadar && signals.periodRadar?.status === 'arriscado') {
    obs.push(
      '⚠️ Radar indica período arriscado. Revise a meta ou reforce a operação antes do ciclo.',
    )
  }

  if (summary.confidence === 'insuficiente' || summary.confidence === 'baixa') {
    obs.push(
      '⚠️ Confiança da distribuição baixa ou insuficiente. Considere ampliar o período histórico para obter sinais mais sólidos.',
    )
  }

  return obs
}
