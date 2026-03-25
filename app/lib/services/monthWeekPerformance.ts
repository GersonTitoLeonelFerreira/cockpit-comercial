// ==============================================================================
// Service: Sazonalidade por Semana do Mês — Fase 6.3
//
// Analisa a operação comercial por bloco semanal do mês:
//   semana 1 = dias  1–7   (Math.ceil(day / 7) = 1)
//   semana 2 = dias  8–14  (Math.ceil(day / 7) = 2)
//   semana 3 = dias 15–21  (Math.ceil(day / 7) = 3)
//   semana 4 = dias 22–28  (Math.ceil(day / 7) = 4)
//   semana 5 = dias 29–31  (Math.ceil(day / 7) = 5)
//
// Fontes:
//   - leads_trabalhados: sales_cycles.first_worked_at
//   - ganhos/faturamento: sales_cycles.won_at + won_total + status='ganho'
//   - perdidos: sales_cycles.lost_at (proxy: updated_at quando lost_at indisponível)
//
// HONESTIDADE:
//   - taxa_ganho não é calculada quando leads_trabalhados < 10
//   - ticket_medio não é exibido quando ganhos < 5
//   - 5ª semana tem janela de apenas 3 dias — quase sempre base insuficiente
//   - meses_com_dados contextualiza o tamanho da amostra por semana
// ==============================================================================

import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import type {
  MonthWeekFilters,
  MonthWeekPerformanceRow,
  MonthWeekPerformanceSummary,
  MonthWeekIndex,
} from '@/app/types/monthWeekPerformance'

const WEEK_LABELS: string[] = [
  '',          // índice 0 não usado
  '1ª semana',
  '2ª semana',
  '3ª semana',
  '4ª semana',
  '5ª semana',
]

const WEEK_SHORTS: string[] = [
  '',
  'Sem 1',
  'Sem 2',
  'Sem 3',
  'Sem 4',
  'Sem 5',
]

const WEEK_DESCRIPTIONS: string[] = [
  '',
  'Dias 1–7',
  'Dias 8–14',
  'Dias 15–21',
  'Dias 22–28',
  'Dias 29–31',
]

/**
 * Retorna o número da semana do mês (1–5) para um dado timestamp.
 * Regra: Math.ceil(dayOfMonth / 7), clamped to [1, 5].
 */
function getMonthWeek(ts: string): MonthWeekIndex {
  const d = new Date(ts)
  const dayOfMonth = d.getUTCDate()
  return Math.min(5, Math.ceil(dayOfMonth / 7)) as MonthWeekIndex
}

/**
 * Extrai "YYYY-MM" de um timestamp ISO para identificar meses distintos.
 */
function toYearMonth(ts: string): string {
  return ts.slice(0, 7)
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

/** Conta o número de meses distintos em um intervalo de datas. Mínimo 1. */
function monthsInRange(dateStart: string, dateEnd: string): number {
  const start = new Date(dateStart)
  const end = new Date(dateEnd)
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth()) +
    1
  return Math.max(1, months)
}

function buildDiagnostico(
  rows: MonthWeekPerformanceRow[],
  totalGanhos: number,
  totalTrabalhados: number,
  melhorFaturamento: MonthWeekPerformanceRow | null,
  melhorTrabalho: MonthWeekPerformanceRow | null,
  melhorTicket: MonthWeekPerformanceRow | null,
  melhorGanhos: MonthWeekPerformanceRow | null
): string {
  if (totalTrabalhados === 0 && totalGanhos === 0) {
    return 'Dados insuficientes no período selecionado. Nenhum lead trabalhado ou ganho encontrado.'
  }

  const parts: string[] = []

  if (melhorFaturamento && melhorFaturamento.faturamento > 0) {
    parts.push(
      `A ${melhorFaturamento.week_label} lidera em faturamento com ${formatBRL(melhorFaturamento.faturamento)}.`
    )
  }

  if (melhorTrabalho && melhorTrabalho.leads_trabalhados > 0) {
    parts.push(
      `A ${melhorTrabalho.week_label} concentra o maior volume de trabalho (${melhorTrabalho.leads_trabalhados} leads trabalhados).`
    )
  }

  if (melhorTicket && melhorTicket.base_suficiente_ganho) {
    parts.push(
      `A ${melhorTicket.week_label} apresenta o maior ticket médio entre semanas com base suficiente: ${formatBRL(melhorTicket.ticket_medio)}.`
    )
  }

  if (melhorGanhos && melhorGanhos.ganhos > 0) {
    if (!melhorFaturamento || melhorGanhos.week !== melhorFaturamento.week) {
      parts.push(
        `A ${melhorGanhos.week_label} lidera em volume de ganhos (${melhorGanhos.ganhos} ganho(s)).`
      )
    }
  }

  const insufficientWeeks = rows.filter(
    (r) => r.leads_trabalhados > 0 && !r.base_suficiente_trabalho
  )
  if (insufficientWeeks.length > 0) {
    const names = insufficientWeeks.map((r) => r.week_short).join(', ')
    parts.push(
      `As semanas ${names} têm dados insuficientes para calcular taxa de ganho com confiança (menos de 10 leads trabalhados).`
    )
  }

  if (parts.length === 0) {
    return 'Período com baixo volume de dados. Amplie o intervalo de datas para análise mais precisa.'
  }

  return parts.join(' ')
}

function buildLeituraResumida(
  rows: MonthWeekPerformanceRow[],
  melhorFaturamento: MonthWeekPerformanceRow | null,
  melhorGanhos: MonthWeekPerformanceRow | null,
  melhorTicket: MonthWeekPerformanceRow | null,
  melhorTrabalho: MonthWeekPerformanceRow | null
): string[] {
  const frases: string[] = []

  if (melhorFaturamento && melhorFaturamento.faturamento > 0) {
    frases.push(`A ${melhorFaturamento.week_label} lidera em faturamento.`)
  }

  if (melhorGanhos && melhorGanhos.ganhos > 0) {
    frases.push(
      `A ${melhorGanhos.week_label} concentra o maior volume de ganhos (${melhorGanhos.ganhos} ganho(s)).`
    )
  }

  if (melhorTicket && melhorTicket.base_suficiente_ganho) {
    frases.push(
      `A ${melhorTicket.week_label} apresenta o melhor ticket médio: ${formatBRL(melhorTicket.ticket_medio)}.`
    )
  }

  if (melhorTrabalho && melhorTrabalho.leads_trabalhados > 0) {
    frases.push(
      `A ${melhorTrabalho.week_label} é a mais forte em volume de trabalho comercial (${melhorTrabalho.leads_trabalhados} leads trabalhados).`
    )
  }

  // Sinaliza semanas com base insuficiente que têm algum dado
  const insuficientes = rows.filter(
    (r) => r.leads_trabalhados > 0 && !r.base_suficiente_trabalho
  )
  if (insuficientes.length > 0) {
    const nomes = insuficientes.map((r) => r.week_short).join(', ')
    frases.push(
      `${nomes} com volume insuficiente — amplie o período para leituras mais confiáveis.`
    )
  }

  // Nota sobre 5ª semana (estruturalmente menor)
  const sem5 = rows.find((r) => r.week === 5)
  if (sem5 && sem5.leads_trabalhados === 0 && sem5.ganhos === 0) {
    frases.push(
      'A 5ª semana (dias 29–31) não apresentou atividade no período. Isso é comum em meses de 28 dias.'
    )
  }

  if (frases.length === 0) {
    frases.push('Período com volume insuficiente para gerar leitura por semana do mês.')
  }

  return frases
}

export async function getMonthWeekPerformance(
  filters: MonthWeekFilters
): Promise<MonthWeekPerformanceSummary> {
  const supabase = supabaseBrowser()

  const dateStartIso = filters.dateStart + 'T00:00:00.000Z'
  const dateEndIso = filters.dateEnd + 'T23:59:59.999Z'

  // ============================================================================
  // 1. Leads trabalhados — sales_cycles.first_worked_at
  // ============================================================================
  let workedQuery = supabase
    .from('sales_cycles')
    .select('first_worked_at')
    .eq('company_id', filters.companyId)
    .not('first_worked_at', 'is', null)
    .gte('first_worked_at', dateStartIso)
    .lte('first_worked_at', dateEndIso)

  if (filters.ownerId) {
    workedQuery = workedQuery.eq('owner_user_id', filters.ownerId)
  }

  const { data: workedData, error: workedError } = await workedQuery

  if (workedError) {
    throw new Error(`Erro ao buscar leads trabalhados: ${workedError.message}`)
  }

  // ============================================================================
  // 2. Ganhos — sales_cycles.won_at + won_total > 0 + status='ganho'
  // ============================================================================
  let wonQuery = supabase
    .from('sales_cycles')
    .select('won_at, won_total')
    .eq('company_id', filters.companyId)
    .eq('status', 'ganho')
    .not('won_at', 'is', null)
    .gt('won_total', 0)
    .gte('won_at', dateStartIso)
    .lte('won_at', dateEndIso)

  if (filters.ownerId) {
    wonQuery = wonQuery.eq('won_owner_user_id', filters.ownerId)
  }

  const { data: wonData, error: wonError } = await wonQuery

  if (wonError) {
    throw new Error(`Erro ao buscar ganhos: ${wonError.message}`)
  }

  // ============================================================================
  // 3. Perdidos — tenta lost_at, cai em updated_at como proxy
  // ============================================================================
  let lostQuery = supabase
    .from('sales_cycles')
    .select('lost_at, updated_at')
    .eq('company_id', filters.companyId)
    .eq('status', 'perdido')

  if (filters.ownerId) {
    lostQuery = lostQuery.eq('owner_user_id', filters.ownerId)
  }

  const { data: lostDataRaw, error: lostError } = await lostQuery

  if (lostError) {
    throw new Error(`Erro ao buscar perdidos: ${lostError.message}`)
  }

  const lostDataAll = (lostDataRaw ?? []) as Array<Record<string, unknown>>
  const hasLostAtColumn = lostDataAll.some((r) => r.lost_at != null)

  const dateStartMs = new Date(dateStartIso).getTime()
  const dateEndMs = new Date(dateEndIso).getTime()

  const lostData = lostDataAll.filter((r) => {
    const raw = hasLostAtColumn ? (r.lost_at as string | null) : (r.updated_at as string | null)
    if (!raw) return false
    const ts = new Date(raw).getTime()
    return ts >= dateStartMs && ts <= dateEndMs
  })

  // ============================================================================
  // 4. Aggregate by week-of-month (client-side)
  // ============================================================================

  interface WeekAgg {
    leads_trabalhados: number
    ganhos: number
    perdidos: number
    faturamento: number
    worked_year_months: Set<string>
    won_year_months: Set<string>
    lost_year_months: Set<string>
  }

  // índice 0 não usado; semanas 1–5 em posições 1–5
  const agg: WeekAgg[] = Array.from({ length: 6 }, () => ({
    leads_trabalhados: 0,
    ganhos: 0,
    perdidos: 0,
    faturamento: 0,
    worked_year_months: new Set<string>(),
    won_year_months: new Set<string>(),
    lost_year_months: new Set<string>(),
  }))

  for (const row of workedData ?? []) {
    const r = row as Record<string, unknown>
    const ts = r.first_worked_at as string | null
    if (!ts) continue
    const wk = getMonthWeek(ts)
    agg[wk].leads_trabalhados += 1
    agg[wk].worked_year_months.add(toYearMonth(ts))
  }

  for (const row of wonData ?? []) {
    const r = row as Record<string, unknown>
    const ts = r.won_at as string | null
    const total = r.won_total != null ? Number(r.won_total) : 0
    if (!ts) continue
    const wk = getMonthWeek(ts)
    agg[wk].ganhos += 1
    agg[wk].faturamento += total
    agg[wk].won_year_months.add(toYearMonth(ts))
  }

  for (const row of lostData) {
    const ts = hasLostAtColumn
      ? (row.lost_at as string | null)
      : (row.updated_at as string | null)
    if (!ts) continue
    const wk = getMonthWeek(ts)
    agg[wk].perdidos += 1
    agg[wk].lost_year_months.add(toYearMonth(ts))
  }

  // ============================================================================
  // 5. Build MonthWeekPerformanceRow[]
  // ============================================================================

  const rows: MonthWeekPerformanceRow[] = []

  for (let i = 1; i <= 5; i++) {
    const week = i as MonthWeekIndex
    const a = agg[i]
    const ticket_medio = a.ganhos > 0 ? a.faturamento / a.ganhos : 0
    const taxa_ganho = a.leads_trabalhados > 0 ? a.ganhos / a.leads_trabalhados : 0
    const base_suficiente_trabalho = a.leads_trabalhados >= 10
    const base_suficiente_ganho = a.ganhos >= 5

    const allMonths = new Set([
      ...a.worked_year_months,
      ...a.won_year_months,
      ...a.lost_year_months,
    ])
    const meses_com_dados = allMonths.size

    rows.push({
      week,
      week_label: WEEK_LABELS[i],
      week_short: WEEK_SHORTS[i],
      week_description: WEEK_DESCRIPTIONS[i],
      leads_trabalhados: a.leads_trabalhados,
      ganhos: a.ganhos,
      perdidos: a.perdidos,
      faturamento: a.faturamento,
      ticket_medio,
      taxa_ganho,
      base_suficiente_trabalho,
      base_suficiente_ganho,
      meses_com_dados,
    })
  }

  // ============================================================================
  // 6. Best week KPIs
  // ============================================================================

  const nonZeroGanhos = rows.filter((r) => r.ganhos > 0)
  const nonZeroFaturamento = rows.filter((r) => r.faturamento > 0)
  const nonZeroTrabalho = rows.filter((r) => r.leads_trabalhados > 0)
  const suficienteGanho = rows.filter((r) => r.base_suficiente_ganho)

  const melhor_semana_ganhos =
    nonZeroGanhos.length > 0
      ? nonZeroGanhos.reduce((best, r) => (r.ganhos > best.ganhos ? r : best))
      : null

  const melhor_semana_faturamento =
    nonZeroFaturamento.length > 0
      ? nonZeroFaturamento.reduce((best, r) => (r.faturamento > best.faturamento ? r : best))
      : null

  const melhor_semana_ticket =
    suficienteGanho.length > 0
      ? suficienteGanho.reduce((best, r) => (r.ticket_medio > best.ticket_medio ? r : best))
      : null

  const melhor_semana_trabalho =
    nonZeroTrabalho.length > 0
      ? nonZeroTrabalho.reduce((best, r) =>
          r.leads_trabalhados > best.leads_trabalhados ? r : best
        )
      : null

  // ============================================================================
  // 7. Totals
  // ============================================================================

  const total_leads_trabalhados = agg.slice(1).reduce((s, a) => s + a.leads_trabalhados, 0)
  const total_ganhos = agg.slice(1).reduce((s, a) => s + a.ganhos, 0)
  const total_perdidos = agg.slice(1).reduce((s, a) => s + a.perdidos, 0)
  const total_faturamento = agg.slice(1).reduce((s, a) => s + a.faturamento, 0)

  // ============================================================================
  // 8. Period info
  // ============================================================================

  const meses_no_periodo = monthsInRange(filters.dateStart, filters.dateEnd)

  // ============================================================================
  // 9. Diagnostic + leitura resumida
  // ============================================================================

  const diagnostico = buildDiagnostico(
    rows,
    total_ganhos,
    total_leads_trabalhados,
    melhor_semana_faturamento,
    melhor_semana_trabalho,
    melhor_semana_ticket,
    melhor_semana_ganhos
  )

  const leitura_resumida = buildLeituraResumida(
    rows,
    melhor_semana_faturamento,
    melhor_semana_ganhos,
    melhor_semana_ticket,
    melhor_semana_trabalho
  )

  return {
    rows,
    melhor_semana_ganhos,
    melhor_semana_faturamento,
    melhor_semana_ticket,
    melhor_semana_trabalho,
    total_leads_trabalhados,
    total_ganhos,
    total_perdidos,
    total_faturamento,
    diagnostico,
    leitura_resumida,
    period_start: filters.dateStart,
    period_end: filters.dateEnd,
    meses_no_periodo,
  }
}
