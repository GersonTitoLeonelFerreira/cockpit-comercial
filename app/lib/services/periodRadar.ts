// ==============================================================================
// Service: Radar do Período — Fase 6.5
//
// Classifica o cenário atual como favorável, neutro ou arriscado com base em
// sinais reais, auditáveis e explicáveis coletados das Fases 6.1–6.4.
//
// Sinais coletados:
//   1. Vocação do dia da semana atual   (sales_cycles.first_worked_at / won_at)
//   2. Semana do mês atual              (sales_cycles.first_worked_at / won_at)
//   3. Sazonalidade do mês atual        (sales_cycles.won_at)
//   4. Ritmo recente de trabalho (7d)   (sales_cycles.first_worked_at)
//   5. Ritmo recente de ganhos (14d)    (sales_cycles.won_at)
//   6. Pipeline ativo                   (sales_cycles.status)
//
// HONESTIDADE:
//   - Confiança baixa (<2 sinais disponíveis) → status forçado para neutro
//   - Sinais sem base suficiente: available=false, não inventar valor
//   - Score interno apenas para ordenação — NÃO exibir ao usuário
// ==============================================================================

import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import type {
  PeriodRadarFilters,
  PeriodRadarSummary,
  PeriodRadarSignal,
  PeriodRadarReason,
  PeriodRadarStatus,
  PeriodRadarConfidence,
  SignalDirection,
} from '@/app/types/periodRadar'

// ==============================================================================
// Constants
// ==============================================================================

const WEEKDAY_LABELS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']

const MONTH_LABELS = [
  '',
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const WEEK_LABELS = ['', '1ª semana', '2ª semana', '3ª semana', '4ª semana', '5ª semana']

// ==============================================================================
// Helpers
// ==============================================================================

const BUSINESS_TZ = 'America/Sao_Paulo'

function getBusinessDateParts(ts: string | Date): {
  weekday: number
  month: number
  day: number
  dateKey: string
} {
  const d = ts instanceof Date ? ts : new Date(ts)

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(d)

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }

  const year = get('year')
  const month = get('month')
  const day = get('day')
  const weekday = weekdayMap[get('weekday')] ?? 0

  return {
    weekday,
    month: Number(month) || 1,
    day: Number(day) || 1,
    dateKey: `${year}-${month}-${day}`,
  }
}

function weekdayInBusinessTZ(ts: string | Date): number {
  return getBusinessDateParts(ts).weekday
}

function monthInBusinessTZ(ts: string | Date): number {
  return getBusinessDateParts(ts).month
}

function dayOfMonthInBusinessTZ(ts: string | Date): number {
  return getBusinessDateParts(ts).day
}

function dateKeyInBusinessTZ(ts: string | Date): string {
  return getBusinessDateParts(ts).dateKey
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function getMonthWeek(dayOfMonth: number): number {
  return Math.min(5, Math.ceil(dayOfMonth / 7))
}

/** Determina direção com base em ratio: acima da média = positivo, abaixo = negativo */
function directionFromRatio(ratio: number, threshold = 0.1): SignalDirection {
  if (ratio >= 1 + threshold) return 'positivo'
  if (ratio <= 1 - threshold) return 'negativo'
  return 'neutro'
}

/** Converte direção para valor numérico: positivo=1, neutro=0, negativo=-1 */
function directionValue(direction: SignalDirection): number {
  if (direction === 'positivo') return 1
  if (direction === 'negativo') return -1
  return 0
}

/** Converte confiança para multiplicador de peso */
function confidenceMultiplier(confidence: PeriodRadarConfidence): number {
  if (confidence === 'alta') return 1.0
  if (confidence === 'moderada') return 0.7
  return 0.4
}

// ==============================================================================
// Main service
// ==============================================================================

export async function getPeriodRadar(
  filters: PeriodRadarFilters
): Promise<PeriodRadarSummary> {
  const supabase = supabaseBrowser()

  const dateStartIso = filters.dateStart + 'T00:00:00.000Z'
  const dateEndIso = filters.dateEnd + 'T23:59:59.999Z'

  // Reference date: today in business timezone
  const today = new Date()
  const referenceDate = dateKeyInBusinessTZ(today)
  const currentWeekday = weekdayInBusinessTZ(today) // 0=Sunday, 6=Saturday
  const currentMonthNum = monthInBusinessTZ(today) // 1–12
  const currentDayOfMonth = dayOfMonthInBusinessTZ(today)
  const currentMonthWeek = getMonthWeek(currentDayOfMonth)

  const signals: PeriodRadarSignal[] = []

  // ============================================================================
  // Signal 1: Vocação do dia da semana atual
  // Fonte: sales_cycles.first_worked_at (prospecção) + won_at (fechamento)
  // ============================================================================
  {
    let prospecQuery = supabase
      .from('sales_cycles')
      .select('first_worked_at')
      .eq('company_id', filters.companyId)
      .not('first_worked_at', 'is', null)
      .gte('first_worked_at', dateStartIso)
      .lte('first_worked_at', dateEndIso)

    if (filters.ownerId) prospecQuery = prospecQuery.eq('owner_user_id', filters.ownerId)

    let wonWdQuery = supabase
      .from('sales_cycles')
      .select('won_at')
      .eq('company_id', filters.companyId)
      .eq('status', 'ganho')
      .not('won_at', 'is', null)
      .gt('won_total', 0)
      .gte('won_at', dateStartIso)
      .lte('won_at', dateEndIso)

    if (filters.ownerId) wonWdQuery = wonWdQuery.eq('won_owner_user_id', filters.ownerId)

    const [{ data: prospecData }, { data: wonWdData }] = await Promise.all([
      prospecQuery,
      wonWdQuery,
    ])

    // Count per weekday
    const countPerDay: number[] = Array(7).fill(0)
    const wonPerDay: number[] = Array(7).fill(0)

    for (const row of prospecData ?? []) {
      const r = row as Record<string, unknown>
      const ts = r.first_worked_at as string | null
      if (!ts) continue
      countPerDay[weekdayInBusinessTZ(ts)] += 1
    }
    for (const row of wonWdData ?? []) {
      const r = row as Record<string, unknown>
      const ts = r.won_at as string | null
      if (!ts) continue
      wonPerDay[weekdayInBusinessTZ(ts)] += 1
    }

    const totalWorked = countPerDay.reduce((s, c) => s + c, 0)
    const totalWon = wonPerDay.reduce((s, c) => s + c, 0)

    const MIN_EVENTS = 10
    const currentDayWorked = countPerDay[currentWeekday]
    const currentDayWon = wonPerDay[currentWeekday]
    const avgWorked = totalWorked > 0 ? totalWorked / 7 : 0
    const avgWon = totalWon > 0 ? totalWon / 7 : 0

    const hasSufficientBase = totalWorked >= MIN_EVENTS || totalWon >= MIN_EVENTS

    if (!hasSufficientBase) {
      signals.push({
        id: 'weekday_vocation',
        label: 'Vocação do dia da semana',
        direction: 'neutro',
        weight: 0.25,
        confidence: 'baixa',
        description: `Dados insuficientes para classificar ${WEEKDAY_LABELS[currentWeekday]}.`,
        source: 'sales_cycles.first_worked_at, sales_cycles.won_at',
        available: false,
        fallback_reason: `Menos de ${MIN_EVENTS} eventos históricos no período selecionado.`,
      })
    } else {
      // Sinal combinado: prospecção + fechamento no dia atual vs média
      const workedRatio = avgWorked > 0 ? currentDayWorked / avgWorked : 1
      const wonRatio = avgWon > 0 ? currentDayWon / avgWon : 1
      const combinedRatio = (workedRatio + wonRatio) / 2

      const direction = directionFromRatio(combinedRatio)
      const confidence: PeriodRadarConfidence =
        totalWorked >= 30 || totalWon >= 15 ? 'alta'
        : totalWorked >= 15 || totalWon >= 8 ? 'moderada'
        : 'baixa'

      let desc = `${WEEKDAY_LABELS[currentWeekday]}: `
      if (direction === 'positivo') {
        desc += `historicamente acima da média em prospecção (${currentDayWorked} vs média ${avgWorked.toFixed(1)}) e fechamento (${currentDayWon} vs média ${avgWon.toFixed(1)}).`
      } else if (direction === 'negativo') {
        desc += `historicamente abaixo da média em prospecção (${currentDayWorked} vs média ${avgWorked.toFixed(1)}) e fechamento (${currentDayWon} vs média ${avgWon.toFixed(1)}).`
      } else {
        desc += `performance próxima da média histórica (prospecção: ${currentDayWorked}, fechamento: ${currentDayWon}).`
      }

      signals.push({
        id: 'weekday_vocation',
        label: 'Vocação do dia da semana',
        direction,
        weight: 0.25,
        confidence,
        description: desc,
        source: 'sales_cycles.first_worked_at, sales_cycles.won_at',
        available: true,
      })
    }
  }

  // ============================================================================
  // Signal 2: Semana do mês atual
  // Fonte: sales_cycles.first_worked_at + won_at
  // ============================================================================
  {
    let workedWkQuery = supabase
      .from('sales_cycles')
      .select('first_worked_at')
      .eq('company_id', filters.companyId)
      .not('first_worked_at', 'is', null)
      .gte('first_worked_at', dateStartIso)
      .lte('first_worked_at', dateEndIso)

    if (filters.ownerId) workedWkQuery = workedWkQuery.eq('owner_user_id', filters.ownerId)

    let wonWkQuery = supabase
      .from('sales_cycles')
      .select('won_at, won_total')
      .eq('company_id', filters.companyId)
      .eq('status', 'ganho')
      .not('won_at', 'is', null)
      .gt('won_total', 0)
      .gte('won_at', dateStartIso)
      .lte('won_at', dateEndIso)

    if (filters.ownerId) wonWkQuery = wonWkQuery.eq('won_owner_user_id', filters.ownerId)

    const [{ data: workedWkData }, { data: wonWkData }] = await Promise.all([
      workedWkQuery,
      wonWkQuery,
    ])

    // Aggregate by week-of-month (1–5)
    const workedPerWk: number[] = [0, 0, 0, 0, 0, 0] // index 0 unused
    const wonPerWk: number[] = [0, 0, 0, 0, 0, 0]
    const fatPerWk: number[] = [0, 0, 0, 0, 0, 0]

    for (const row of workedWkData ?? []) {
      const r = row as Record<string, unknown>
      const ts = r.first_worked_at as string | null
      if (!ts) continue
      const wk = getMonthWeek(dayOfMonthInBusinessTZ(ts))
      workedPerWk[wk] += 1
    }
    for (const row of wonWkData ?? []) {
      const r = row as Record<string, unknown>
      const ts = r.won_at as string | null
      const total = r.won_total != null ? Number(r.won_total) : 0
      if (!ts) continue
      const wk = getMonthWeek(dayOfMonthInBusinessTZ(ts))
      wonPerWk[wk] += 1
      fatPerWk[wk] += total
    }

    const totalWorkedWk = workedPerWk.slice(1).reduce((s, c) => s + c, 0)
    const totalWonWk = wonPerWk.slice(1).reduce((s, c) => s + c, 0)

    const MIN_WK = 10
    const hasSufficientBase = totalWorkedWk >= MIN_WK || totalWonWk >= MIN_WK

    if (!hasSufficientBase) {
      signals.push({
        id: 'month_week',
        label: 'Semana do mês atual',
        direction: 'neutro',
        weight: 0.20,
        confidence: 'baixa',
        description: `Dados insuficientes para classificar a ${WEEK_LABELS[currentMonthWeek]}.`,
        source: 'sales_cycles.first_worked_at, sales_cycles.won_at',
        available: false,
        fallback_reason: `Menos de ${MIN_WK} eventos no período selecionado.`,
      })
    } else {
      // Comparar semana atual vs média das outras semanas
      const avgWorkedOther =
        workedPerWk.slice(1).filter((_, i) => i + 1 !== currentMonthWeek).reduce((s, c) => s + c, 0) /
        4 // 4 outras semanas
      const avgWonOther =
        wonPerWk.slice(1).filter((_, i) => i + 1 !== currentMonthWeek).reduce((s, c) => s + c, 0) /
        4

      const curWorked = workedPerWk[currentMonthWeek]
      const curWon = wonPerWk[currentMonthWeek]
      const curFat = fatPerWk[currentMonthWeek]

      const workedRatio = avgWorkedOther > 0 ? curWorked / avgWorkedOther : 1
      const wonRatio = avgWonOther > 0 ? curWon / avgWonOther : 1
      const combinedRatio = (workedRatio + wonRatio) / 2

      const direction = directionFromRatio(combinedRatio)
      const confidence: PeriodRadarConfidence =
        totalWorkedWk >= 40 || totalWonWk >= 20 ? 'alta'
        : totalWorkedWk >= 20 || totalWonWk >= 10 ? 'moderada'
        : 'baixa'

      let desc = `${WEEK_LABELS[currentMonthWeek]} (dias ${(currentMonthWeek - 1) * 7 + 1}–${Math.min(currentMonthWeek * 7, 31)}): `
      if (direction === 'positivo') {
        desc += `historicamente forte em trabalho (${curWorked} leads) e ganhos (${curWon} ganhos${curFat > 0 ? ', ' + formatBRL(curFat) : ''}).`
      } else if (direction === 'negativo') {
        desc += `historicamente fraca em trabalho (${curWorked} leads) e ganhos (${curWon} ganhos).`
      } else {
        desc += `performance próxima da média das outras semanas (${curWorked} leads, ${curWon} ganhos).`
      }

      signals.push({
        id: 'month_week',
        label: 'Semana do mês atual',
        direction,
        weight: 0.20,
        confidence,
        description: desc,
        source: 'sales_cycles.first_worked_at, sales_cycles.won_at',
        available: true,
      })
    }
  }

  // ============================================================================
  // Signal 3: Sazonalidade do mês atual
  // Fonte: sales_cycles.won_at + first_worked_at
  // ============================================================================
  {
    let workedMonthQuery = supabase
      .from('sales_cycles')
      .select('first_worked_at')
      .eq('company_id', filters.companyId)
      .not('first_worked_at', 'is', null)
      .gte('first_worked_at', dateStartIso)
      .lte('first_worked_at', dateEndIso)

    if (filters.ownerId) workedMonthQuery = workedMonthQuery.eq('owner_user_id', filters.ownerId)

    let wonMonthQuery = supabase
      .from('sales_cycles')
      .select('won_at, won_total')
      .eq('company_id', filters.companyId)
      .eq('status', 'ganho')
      .not('won_at', 'is', null)
      .gt('won_total', 0)
      .gte('won_at', dateStartIso)
      .lte('won_at', dateEndIso)

    if (filters.ownerId) wonMonthQuery = wonMonthQuery.eq('won_owner_user_id', filters.ownerId)

    const [{ data: workedMonthData }, { data: wonMonthData }] = await Promise.all([
      workedMonthQuery,
      wonMonthQuery,
    ])

    // Aggregate by month (1–12)
    const workedPerMonth: number[] = Array(13).fill(0) // index 0 unused
    const wonPerMonth: number[] = Array(13).fill(0)
    const fatPerMonth: number[] = Array(13).fill(0)

    for (const row of workedMonthData ?? []) {
      const r = row as Record<string, unknown>
      const ts = r.first_worked_at as string | null
      if (!ts) continue
      const mo = monthInBusinessTZ(ts)
      workedPerMonth[mo] += 1
    }
    for (const row of wonMonthData ?? []) {
      const r = row as Record<string, unknown>
      const ts = r.won_at as string | null
      const total = r.won_total != null ? Number(r.won_total) : 0
      if (!ts) continue
      const mo = monthInBusinessTZ(ts)
      wonPerMonth[mo] += 1
      fatPerMonth[mo] += total
    }

    const totalWorkedMo = workedPerMonth.slice(1).reduce((s, c) => s + c, 0)
    const totalWonMo = wonPerMonth.slice(1).reduce((s, c) => s + c, 0)

    // Need at least 3 months with data for seasonality to be meaningful
    const monthsWithData = workedPerMonth.slice(1).filter((c) => c > 0).length
    const hasSufficientBase = monthsWithData >= 3 && (totalWorkedMo >= 15 || totalWonMo >= 6)

    if (!hasSufficientBase) {
      signals.push({
        id: 'month_seasonality',
        label: 'Sazonalidade do mês atual',
        direction: 'neutro',
        weight: 0.20,
        confidence: 'baixa',
        description: `Dados insuficientes para classificar ${MONTH_LABELS[currentMonthNum]}.`,
        source: 'sales_cycles.won_at, sales_cycles.first_worked_at',
        available: false,
        fallback_reason: `Menos de 3 meses distintos com dados no período (encontrados: ${monthsWithData}).`,
      })
    } else {
      const avgWorkedMo = totalWorkedMo / 12
      const avgWonMo = totalWonMo / 12

      const curWorkedMo = workedPerMonth[currentMonthNum]
      const curWonMo = wonPerMonth[currentMonthNum]
      const curFatMo = fatPerMonth[currentMonthNum]

      const workedRatio = avgWorkedMo > 0 ? curWorkedMo / avgWorkedMo : 1
      const wonRatio = avgWonMo > 0 ? curWonMo / avgWonMo : 1
      const combinedRatio = (workedRatio + wonRatio) / 2

      const direction = directionFromRatio(combinedRatio)
      const confidence: PeriodRadarConfidence =
        monthsWithData >= 10 ? 'alta'
        : monthsWithData >= 6 ? 'moderada'
        : 'baixa'

      let desc = `${MONTH_LABELS[currentMonthNum]}: `
      if (direction === 'positivo') {
        desc += `historicamente forte (${curWorkedMo} leads trabalhados, ${curWonMo} ganhos${curFatMo > 0 ? ', ' + formatBRL(curFatMo) : ''} vs médias ${avgWorkedMo.toFixed(0)}/${avgWonMo.toFixed(0)}).`
      } else if (direction === 'negativo') {
        desc += `historicamente fraco (${curWorkedMo} leads trabalhados, ${curWonMo} ganhos vs médias ${avgWorkedMo.toFixed(0)}/${avgWonMo.toFixed(0)}).`
      } else {
        desc += `sazonalidade neutra (${curWorkedMo} leads, ${curWonMo} ganhos próximos das médias históricas).`
      }

      signals.push({
        id: 'month_seasonality',
        label: 'Sazonalidade do mês atual',
        direction,
        weight: 0.20,
        confidence,
        description: desc,
        source: 'sales_cycles.won_at, sales_cycles.first_worked_at',
        available: true,
      })
    }
  }

  // ============================================================================
  // Signal 4: Ritmo recente de trabalho (últimos 7 dias vs média diária histórica)
  // Fonte: sales_cycles.first_worked_at
  // ============================================================================
  {
    const sevenDaysAgo = new Date(today)
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7)
    const sevenDaysAgoIso = sevenDaysAgo.toISOString().slice(0, 10) + 'T00:00:00.000Z'
    const todayIso = today.toISOString().slice(0, 10) + 'T23:59:59.999Z'

    let recentWorkedQuery = supabase
      .from('sales_cycles')
      .select('first_worked_at')
      .eq('company_id', filters.companyId)
      .not('first_worked_at', 'is', null)
      .gte('first_worked_at', sevenDaysAgoIso)
      .lte('first_worked_at', todayIso)

    if (filters.ownerId) recentWorkedQuery = recentWorkedQuery.eq('owner_user_id', filters.ownerId)

    let historicalWorkedQuery = supabase
      .from('sales_cycles')
      .select('first_worked_at')
      .eq('company_id', filters.companyId)
      .not('first_worked_at', 'is', null)
      .gte('first_worked_at', dateStartIso)
      .lte('first_worked_at', dateEndIso)

    if (filters.ownerId) historicalWorkedQuery = historicalWorkedQuery.eq('owner_user_id', filters.ownerId)

    const [{ data: recentWorkedData }, { data: historicalWorkedData }] = await Promise.all([
      recentWorkedQuery,
      historicalWorkedQuery,
    ])

    const recentCount = (recentWorkedData ?? []).length
    const historicalTotal = (historicalWorkedData ?? []).length

    // Dias históricos no período
    const startMs = new Date(dateStartIso).getTime()
    const endMs = new Date(dateEndIso).getTime()
    const historicalDays = Math.max(1, Math.ceil((endMs - startMs) / (1000 * 60 * 60 * 24)))

    const avgDailyHistorical = historicalTotal / historicalDays
    const avgDailyRecent = recentCount / 7

    const hasSufficientBase = historicalTotal >= 20

    if (!hasSufficientBase) {
      signals.push({
        id: 'recent_work_rhythm',
        label: 'Ritmo recente de trabalho',
        direction: 'neutro',
        weight: 0.15,
        confidence: 'baixa',
        description: 'Base histórica insuficiente para comparar ritmo de trabalho.',
        source: 'sales_cycles.first_worked_at',
        available: false,
        fallback_reason: `Menos de 20 leads trabalhados no período histórico (encontrados: ${historicalTotal}).`,
      })
    } else {
      const ratio = avgDailyHistorical > 0 ? avgDailyRecent / avgDailyHistorical : 1
      const direction = directionFromRatio(ratio, 0.15)
      const confidence: PeriodRadarConfidence =
        historicalTotal >= 60 ? 'alta'
        : historicalTotal >= 30 ? 'moderada'
        : 'baixa'

      let desc = `Últimos 7 dias: ${recentCount} leads trabalhados (média ${avgDailyRecent.toFixed(1)}/dia). `
      if (direction === 'positivo') {
        desc += `Acima da média histórica de ${avgDailyHistorical.toFixed(1)}/dia — ritmo de prospecção acelerado.`
      } else if (direction === 'negativo') {
        desc += `Abaixo da média histórica de ${avgDailyHistorical.toFixed(1)}/dia — ritmo de trabalho reduzido.`
      } else {
        desc += `Dentro da faixa normal (média histórica: ${avgDailyHistorical.toFixed(1)}/dia).`
      }

      signals.push({
        id: 'recent_work_rhythm',
        label: 'Ritmo recente de trabalho (7d)',
        direction,
        weight: 0.15,
        confidence,
        description: desc,
        source: 'sales_cycles.first_worked_at',
        available: true,
      })
    }
  }

  // ============================================================================
  // Signal 5: Ritmo recente de ganhos (últimos 14 dias vs média bisemanal histórica)
  // Fonte: sales_cycles.won_at
  // ============================================================================
  {
    const fourteenDaysAgo = new Date(today)
    fourteenDaysAgo.setUTCDate(fourteenDaysAgo.getUTCDate() - 14)
    const fourteenDaysAgoIso = fourteenDaysAgo.toISOString().slice(0, 10) + 'T00:00:00.000Z'
    const todayIso = today.toISOString().slice(0, 10) + 'T23:59:59.999Z'

    let recentWonQuery = supabase
      .from('sales_cycles')
      .select('won_at, won_total')
      .eq('company_id', filters.companyId)
      .eq('status', 'ganho')
      .not('won_at', 'is', null)
      .gt('won_total', 0)
      .gte('won_at', fourteenDaysAgoIso)
      .lte('won_at', todayIso)

    if (filters.ownerId) recentWonQuery = recentWonQuery.eq('won_owner_user_id', filters.ownerId)

    let historicalWonQuery = supabase
      .from('sales_cycles')
      .select('won_at')
      .eq('company_id', filters.companyId)
      .eq('status', 'ganho')
      .not('won_at', 'is', null)
      .gt('won_total', 0)
      .gte('won_at', dateStartIso)
      .lte('won_at', dateEndIso)

    if (filters.ownerId) historicalWonQuery = historicalWonQuery.eq('won_owner_user_id', filters.ownerId)

    const [{ data: recentWonData }, { data: historicalWonData }] = await Promise.all([
      recentWonQuery,
      historicalWonQuery,
    ])

    const recentWonCount = (recentWonData ?? []).length
    const recentWonFat = (recentWonData ?? []).reduce(
      (s: number, r: Record<string, unknown>) => s + (r.won_total != null ? Number(r.won_total) : 0),
      0
    )
    const historicalWonTotal = (historicalWonData ?? []).length

    const startMs = new Date(dateStartIso).getTime()
    const endMs = new Date(dateEndIso).getTime()
    const historicalDays = Math.max(1, Math.ceil((endMs - startMs) / (1000 * 60 * 60 * 24)))

    // Médias bissemanais (14 dias)
    const biweeksInPeriod = Math.max(1, historicalDays / 14)
    const avgBiweeklyWon = historicalWonTotal / biweeksInPeriod

    const hasSufficientBase = historicalWonTotal >= 5

    if (!hasSufficientBase) {
      signals.push({
        id: 'recent_win_rhythm',
        label: 'Ritmo recente de ganhos',
        direction: 'neutro',
        weight: 0.15,
        confidence: 'baixa',
        description: 'Base histórica insuficiente para comparar ritmo de ganhos.',
        source: 'sales_cycles.won_at',
        available: false,
        fallback_reason: `Menos de 5 ganhos no período histórico (encontrados: ${historicalWonTotal}).`,
      })
    } else {
      const ratio = avgBiweeklyWon > 0 ? recentWonCount / avgBiweeklyWon : 1
      const direction = directionFromRatio(ratio, 0.15)
      const confidence: PeriodRadarConfidence =
        historicalWonTotal >= 20 ? 'alta'
        : historicalWonTotal >= 10 ? 'moderada'
        : 'baixa'

      let desc = `Últimos 14 dias: ${recentWonCount} ganho(s)${recentWonFat > 0 ? ' (' + formatBRL(recentWonFat) + ')' : ''}. `
      if (direction === 'positivo') {
        desc += `Acima da média bisemanal histórica de ${avgBiweeklyWon.toFixed(1)} ganho(s) — ritmo de fechamento acelerado.`
      } else if (direction === 'negativo') {
        desc += `Abaixo da média bisemanal histórica de ${avgBiweeklyWon.toFixed(1)} ganho(s) — ritmo de fechamento reduzido.`
      } else {
        desc += `Dentro da faixa normal (média bisemanal histórica: ${avgBiweeklyWon.toFixed(1)} ganho(s)).`
      }

      signals.push({
        id: 'recent_win_rhythm',
        label: 'Ritmo recente de ganhos (14d)',
        direction,
        weight: 0.15,
        confidence,
        description: desc,
        source: 'sales_cycles.won_at',
        available: true,
      })
    }
  }

  // ============================================================================
  // Signal 6: Pipeline ativo
  // Fonte: sales_cycles.status (em andamento = não ganho e não perdido)
  // ============================================================================
  {
    let pipelineQuery = supabase
      .from('sales_cycles')
      .select('status')
      .eq('company_id', filters.companyId)
      .neq('status', 'ganho')
      .neq('status', 'perdido')

    if (filters.ownerId) pipelineQuery = pipelineQuery.eq('owner_user_id', filters.ownerId)

    // Historical average: total cycles in period / months
    let historicalAllQuery = supabase
      .from('sales_cycles')
      .select('first_worked_at')
      .eq('company_id', filters.companyId)
      .not('first_worked_at', 'is', null)
      .gte('first_worked_at', dateStartIso)
      .lte('first_worked_at', dateEndIso)

    if (filters.ownerId) historicalAllQuery = historicalAllQuery.eq('owner_user_id', filters.ownerId)

    const [{ data: pipelineData, error: pipelineError }, { data: historicalAllData }] =
      await Promise.all([pipelineQuery, historicalAllQuery])

    if (pipelineError) {
      signals.push({
        id: 'active_pipeline',
        label: 'Pipeline ativo',
        direction: 'neutro',
        weight: 0.05,
        confidence: 'baixa',
        description: 'Não foi possível consultar o pipeline ativo.',
        source: 'sales_cycles.status',
        available: false,
        fallback_reason: `Erro ao consultar: ${pipelineError.message}`,
      })
    } else {
      const pipelineCount = (pipelineData ?? []).length
      const historicalTotal = (historicalAllData ?? []).length

      // Precisamos de pelo menos 10 histórico para ter uma referência
      const hasSufficientBase = historicalTotal >= 10

      if (!hasSufficientBase) {
        signals.push({
          id: 'active_pipeline',
          label: 'Pipeline ativo',
          direction: 'neutro',
          weight: 0.05,
          confidence: 'baixa',
          description: `Pipeline ativo: ${pipelineCount} lead(s) em andamento.`,
          source: 'sales_cycles.status',
          available: false,
          fallback_reason: 'Base histórica insuficiente para comparar volume do pipeline.',
        })
      } else {
        const startMs = new Date(dateStartIso).getTime()
        const endMs = new Date(dateEndIso).getTime()
        const monthsInPeriod = Math.max(1, (endMs - startMs) / (1000 * 60 * 60 * 24 * 30))
        const avgMonthlyPipeline = historicalTotal / monthsInPeriod

        const ratio = avgMonthlyPipeline > 0 ? pipelineCount / avgMonthlyPipeline : 1
        const direction = directionFromRatio(ratio, 0.20)
        const confidence: PeriodRadarConfidence =
          historicalTotal >= 50 ? 'moderada' : 'baixa'

        let desc = `Pipeline ativo: ${pipelineCount} lead(s) em andamento. `
        if (direction === 'positivo') {
          desc += `Acima da média histórica mensal de ${avgMonthlyPipeline.toFixed(0)} — pipeline saudável.`
        } else if (direction === 'negativo') {
          desc += `Abaixo da média histórica mensal de ${avgMonthlyPipeline.toFixed(0)} — pipeline reduzido.`
        } else {
          desc += `Volume dentro da faixa normal (referência: ${avgMonthlyPipeline.toFixed(0)}/mês histórico).`
        }

        signals.push({
          id: 'active_pipeline',
          label: 'Pipeline ativo',
          direction,
          weight: 0.05,
          confidence,
          description: desc,
          source: 'sales_cycles.status',
          available: true,
        })
      }
    }
  }

  // ============================================================================
  // Classification
  // ============================================================================

  const availableSignals = signals.filter((s) => s.available)
  const unavailableSignals = signals.filter((s) => !s.available)

  // Score ponderado por peso e confiança
  const totalWeightAvailable = availableSignals.reduce(
    (s, sig) => s + sig.weight * confidenceMultiplier(sig.confidence),
    0
  )

  const scoreRaw =
    totalWeightAvailable > 0
      ? availableSignals.reduce(
          (s, sig) =>
            s + directionValue(sig.direction) * sig.weight * confidenceMultiplier(sig.confidence),
          0
        ) / totalWeightAvailable
      : 0

  // Normalizar de [-1..1] para [0..100]
  const scoreInterno = Math.round(((scoreRaw + 1) / 2) * 100)

  // Confiança geral baseada na disponibilidade e qualidade dos sinais
  const highConfidenceSignals = availableSignals.filter(
    (s) => s.confidence === 'alta' || s.confidence === 'moderada'
  ).length

  let confidence: PeriodRadarConfidence
  if (highConfidenceSignals >= 4) confidence = 'alta'
  else if (highConfidenceSignals >= 2) confidence = 'moderada'
  else confidence = 'baixa'

  // Status (com override para neutro se confiança baixa)
  let status: PeriodRadarStatus
  if (confidence === 'baixa') {
    status = 'neutro'
  } else if (scoreInterno >= 60) {
    status = 'favoravel'
  } else if (scoreInterno >= 40) {
    status = 'neutro'
  } else {
    status = 'arriscado'
  }

  const statusLabel =
    status === 'favoravel' ? 'Favorável' : status === 'neutro' ? 'Neutro' : 'Arriscado'
  const confidenceLabel =
    confidence === 'alta' ? 'Alta' : confidence === 'moderada' ? 'Moderada' : 'Baixa'

  // ============================================================================
  // Reasons: top 3–5 sinais mais impactantes
  // ============================================================================

  const sortedSignals = [...availableSignals].sort(
    (a, b) =>
      Math.abs(directionValue(b.direction) * b.weight * confidenceMultiplier(b.confidence)) -
      Math.abs(directionValue(a.direction) * a.weight * confidenceMultiplier(a.confidence))
  )

  const reasons: PeriodRadarReason[] = sortedSignals.slice(0, 5).map((sig) => ({
    text: sig.description,
    direction: sig.direction,
    signal_id: sig.id,
  }))

  // ============================================================================
  // Síntese operacional
  // ============================================================================

  const positiveSignals = availableSignals.filter((s) => s.direction === 'positivo')
  const negativeSignals = availableSignals.filter((s) => s.direction === 'negativo')

  let sintese: string
  if (status === 'favoravel') {
    const factors = positiveSignals.map((s) => s.label.toLowerCase()).join(', ')
    sintese = `O período atual favorece fechamento e prospecção${factors ? ' — especialmente por: ' + factors : ''}. Aproveite o momento com foco em leads quentes e negociações em aberto.`
  } else if (status === 'arriscado') {
    const factors = negativeSignals.map((s) => s.label.toLowerCase()).join(', ')
    sintese = `O cenário está pressionado${factors ? ' por: ' + factors : ''}. Este é um momento para aumentar volume de trabalho, rever abordagem com leads em negociação e fortalecer o pipeline.`
  } else {
    if (confidence === 'baixa') {
      sintese = `O período está com sinais mistos e base histórica insuficiente para classificação confiável. Mantenha o ritmo regular e amplie o período de análise para melhorar a precisão do radar.`
    } else if (positiveSignals.length > 0 && negativeSignals.length > 0) {
      sintese = `O cenário está misto — há fatores favoráveis e desfavoráveis. Não há vantagem ou risco claro: mantenha ritmo regular, priorize leads em estágio avançado e abastecimento de pipeline.`
    } else {
      sintese = `O cenário atual não favorece nem prejudica fortemente as operações comerciais. Mantenha o ritmo regular e foque em consistência.`
    }
  }

  // ============================================================================
  // Diagnóstico completo
  // ============================================================================

  const diagParts: string[] = [
    `Radar do Período — ${WEEKDAY_LABELS[currentWeekday]}, ${WEEK_LABELS[currentMonthWeek]} de ${MONTH_LABELS[currentMonthNum]}.`,
    `Período histórico analisado: ${filters.dateStart} a ${filters.dateEnd}.`,
    ``,
    `STATUS: ${statusLabel} (confiança ${confidenceLabel.toLowerCase()}).`,
    ``,
    `SINAIS AVALIADOS (${availableSignals.length} disponíveis, ${unavailableSignals.length} indisponíveis):`,
  ]

  for (const sig of signals) {
    const dirLabel = sig.direction === 'positivo' ? '↑' : sig.direction === 'negativo' ? '↓' : '→'
    if (sig.available) {
      diagParts.push(`  ${dirLabel} ${sig.label}: ${sig.description} [fonte: ${sig.source}]`)
    } else {
      diagParts.push(`  — ${sig.label}: indisponível — ${sig.fallback_reason} [fonte: ${sig.source}]`)
    }
  }

  if (confidence === 'baixa') {
    diagParts.push(``)
    diagParts.push(`NOTA: Confiança baixa — menos de 2 sinais com base suficiente. Status forçado para Neutro para evitar classificação artificial.`)
  }

  diagParts.push(``)
  diagParts.push(`SÍNTESE: ${sintese}`)

  const diagnostico = diagParts.join('\n')

  // ============================================================================
  // Counters
  // ============================================================================

  const signalsPositive = signals.filter((s) => s.available && s.direction === 'positivo').length
  const signalsNegative = signals.filter((s) => s.available && s.direction === 'negativo').length
  const signalsNeutral = signals.filter((s) => s.available && s.direction === 'neutro').length

  return {
    status,
    status_label: statusLabel,
    confidence,
    confidence_label: confidenceLabel,
    score_interno: scoreInterno,
    signals,
    reasons,
    sintese_operacional: sintese,
    diagnostico,
    period_start: filters.dateStart,
    period_end: filters.dateEnd,
    reference_date: referenceDate,
    current_weekday: WEEKDAY_LABELS[currentWeekday],
    current_month: MONTH_LABELS[currentMonthNum],
    current_month_week: currentMonthWeek,
    signals_available: availableSignals.length,
    signals_unavailable: unavailableSignals.length,
    signals_positive: signalsPositive,
    signals_negative: signalsNegative,
    signals_neutral: signalsNeutral,
  }
}
