// ==============================================================================
// Service: Sazonalidade por Dia da Semana — Fase 6.1
//
// Analisa a operação comercial REAL por dia da semana, com base em:
//   - leads_trabalhados: sales_cycles.first_worked_at (trigger write-once,
//     exclui ações administrativas)
//   - ganhos: sales_cycles.won_at + won_total > 0 + status='ganho'
//   - perdidos: sales_cycles.lost_at (se existir) ou updated_at como proxy
//     (limitação: updated_at pode refletir outras atualizações, não só o encerramento)
//   - faturamento: sum(won_total) por weekday de won_at
//
// NOTA SOBRE lost_at:
//   A coluna lost_at não está garantidamente presente em todas as instalações.
//   O serviço tenta buscar lost_at; se não existir na resposta (coluna ausente ou
//   null em todos os registros), usa updated_at como fallback.
//
// HONESTIDADE DAS MÉTRICAS:
//   - taxa_ganho não é calculada quando leads_trabalhados < 10
//   - ticket_medio não é exibido quando ganhos < 5 (flag base_suficiente_ganho)
//   - semanas_com_dados fornece contexto do tamanho da amostra
// ==============================================================================

import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import type {
  WeekdayPerformanceFilters,
  WeekdayPerformanceRow,
  WeekdayPerformanceSummary,
  WeekdayIndex,
} from '@/app/types/weekdayPerformance'

const WEEKDAY_LABELS: string[] = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
]

const WEEKDAY_SHORTS: string[] = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

/** Returns the ISO week number for a given date (Mon-based, ISO 8601). */
function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  // Set to nearest Thursday (ISO week is defined by Thursday)
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

/** Count distinct ISO weeks in a set of date strings. */
function countDistinctWeeks(dates: string[]): number {
  const weeks = new Set<string>()
  for (const d of dates) {
    if (d) weeks.add(isoWeek(new Date(d)))
  }
  return weeks.size
}

/** Total weeks spanned by a date range. Minimum 1. */
function weeksInRange(dateStart: string, dateEnd: string): number {
  const start = new Date(dateStart)
  const end = new Date(dateEnd)
  const diffMs = end.getTime() - start.getTime()
  if (diffMs < 0) return 1
  return Math.max(1, Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000)))
}

function buildDiagnostico(
  rows: WeekdayPerformanceRow[],
  totalGanhos: number,
  totalTrabalhados: number,
  totalFaturamento: number,
  melhorFaturamento: WeekdayPerformanceRow | null,
  melhorTrabalho: WeekdayPerformanceRow | null,
  melhorTicket: WeekdayPerformanceRow | null,
  melhorGanhos: WeekdayPerformanceRow | null
): string {
  if (totalTrabalhados === 0 && totalGanhos === 0) {
    return 'Dados insuficientes no período selecionado. Nenhum lead trabalhado ou ganho encontrado.'
  }

  const parts: string[] = []

  if (melhorFaturamento && melhorFaturamento.faturamento > 0) {
    parts.push(
      `${melhorFaturamento.weekday_label} lidera em faturamento com ${formatBRL(melhorFaturamento.faturamento)}.`
    )
  }

  if (melhorTrabalho && melhorTrabalho.leads_trabalhados > 0) {
    parts.push(
      `${melhorTrabalho.weekday_label} concentra o maior volume de trabalho (${melhorTrabalho.leads_trabalhados} leads trabalhados).`
    )
  }

  if (melhorTicket && melhorTicket.base_suficiente_ganho) {
    parts.push(
      `${melhorTicket.weekday_label} apresenta o maior ticket médio entre dias com base suficiente: ${formatBRL(melhorTicket.ticket_medio)}.`
    )
  }

  if (melhorGanhos && melhorGanhos.ganhos > 0) {
    if (!melhorFaturamento || melhorGanhos.weekday !== melhorFaturamento.weekday) {
      parts.push(
        `${melhorGanhos.weekday_label} lidera em volume de ganhos (${melhorGanhos.ganhos} ganhos).`
      )
    }
  }

  const insufficientDays = rows.filter(
    (r) => r.leads_trabalhados > 0 && !r.base_suficiente_trabalho
  )
  if (insufficientDays.length > 0) {
    const names = insufficientDays.map((r) => r.weekday_short).join(', ')
    parts.push(
      `Os dias ${names} têm dados insuficientes para calcular taxa de ganho com confiança (menos de 10 leads trabalhados).`
    )
  }

  if (parts.length === 0) {
    return 'Período com baixo volume de dados. Amplie o intervalo de datas para análise mais precisa.'
  }

  return parts.join(' ')
}

export async function getWeekdayPerformance(
  filters: WeekdayPerformanceFilters
): Promise<WeekdayPerformanceSummary> {
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
  //
  // LIMITAÇÃO CONHECIDA: updated_at é o melhor proxy disponível quando lost_at
  // não existe ou não está preenchido. Pode incluir ciclos atualizados por outros
  // motivos. A leitura deve ser entendida como uma aproximação.
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

  // Determine which date field to use for perdidos
  // Prefer lost_at if at least one non-null value exists, otherwise fallback to updated_at
  const lostDataAll = (lostDataRaw ?? []) as Array<Record<string, unknown>>
  const hasLostAt = lostDataAll.some((r) => r.lost_at != null)

  // Parse boundaries once to avoid repeated object creation in the filter
  const dateStartMs = new Date(dateStartIso).getTime()
  const dateEndMs = new Date(dateEndIso).getTime()

  // Filter by date range on the chosen field, client-side since we may not know which column exists
  const lostData = lostDataAll.filter((r) => {
    const raw = hasLostAt ? (r.lost_at as string | null) : (r.updated_at as string | null)
    if (!raw) return false
    const ts = new Date(raw).getTime()
    return ts >= dateStartMs && ts <= dateEndMs
  })

  // ============================================================================
  // 4. Aggregate by weekday (client-side)
  // ============================================================================

  interface WeekdayAgg {
    leads_trabalhados: number
    ganhos: number
    perdidos: number
    faturamento: number
    worked_dates: string[]
    won_dates: string[]
    lost_dates: string[]
  }

  const agg: WeekdayAgg[] = Array.from({ length: 7 }, () => ({
    leads_trabalhados: 0,
    ganhos: 0,
    perdidos: 0,
    faturamento: 0,
    worked_dates: [],
    won_dates: [],
    lost_dates: [],
  }))

  for (const row of workedData ?? []) {
    const r = row as Record<string, unknown>
    const ts = r.first_worked_at as string | null
    if (!ts) continue
    const d = new Date(ts)
    const wd = d.getUTCDay() as WeekdayIndex
    agg[wd].leads_trabalhados += 1
    agg[wd].worked_dates.push(ts)
  }

  for (const row of wonData ?? []) {
    const r = row as Record<string, unknown>
    const ts = r.won_at as string | null
    const total = r.won_total != null ? Number(r.won_total) : 0
    if (!ts) continue
    const d = new Date(ts)
    const wd = d.getUTCDay() as WeekdayIndex
    agg[wd].ganhos += 1
    agg[wd].faturamento += total
    agg[wd].won_dates.push(ts)
  }

  for (const row of lostData) {
    const ts = hasLostAt
      ? (row.lost_at as string | null)
      : (row.updated_at as string | null)
    if (!ts) continue
    const d = new Date(ts)
    const wd = d.getUTCDay() as WeekdayIndex
    agg[wd].perdidos += 1
    agg[wd].lost_dates.push(ts)
  }

  // ============================================================================
  // 5. Build WeekdayPerformanceRow[]
  // ============================================================================

  const rows: WeekdayPerformanceRow[] = agg.map((a, i) => {
    const weekday = i as WeekdayIndex
    const ticket_medio = a.ganhos > 0 ? a.faturamento / a.ganhos : 0
    const taxa_ganho = a.leads_trabalhados > 0 ? a.ganhos / a.leads_trabalhados : 0
    const base_suficiente_trabalho = a.leads_trabalhados >= 10
    const base_suficiente_ganho = a.ganhos >= 5

    // semanas_com_dados: distinct ISO weeks across all activity on this weekday
    const allDates = [...a.worked_dates, ...a.won_dates, ...a.lost_dates]
    const semanas_com_dados = countDistinctWeeks(allDates)

    return {
      weekday,
      weekday_label: WEEKDAY_LABELS[i],
      weekday_short: WEEKDAY_SHORTS[i],
      leads_trabalhados: a.leads_trabalhados,
      ganhos: a.ganhos,
      perdidos: a.perdidos,
      faturamento: a.faturamento,
      ticket_medio,
      taxa_ganho,
      base_suficiente_trabalho,
      base_suficiente_ganho,
      semanas_com_dados,
    }
  })

  // ============================================================================
  // 6. Best day KPIs
  // ============================================================================

  const nonZeroGanhos = rows.filter((r) => r.ganhos > 0)
  const nonZeroFaturamento = rows.filter((r) => r.faturamento > 0)
  const nonZeroTrabalho = rows.filter((r) => r.leads_trabalhados > 0)
  const suficienteGanho = rows.filter((r) => r.base_suficiente_ganho)

  const melhor_dia_ganhos =
    nonZeroGanhos.length > 0
      ? nonZeroGanhos.reduce((best, r) => (r.ganhos > best.ganhos ? r : best))
      : null

  const melhor_dia_faturamento =
    nonZeroFaturamento.length > 0
      ? nonZeroFaturamento.reduce((best, r) => (r.faturamento > best.faturamento ? r : best))
      : null

  const melhor_dia_ticket =
    suficienteGanho.length > 0
      ? suficienteGanho.reduce((best, r) => (r.ticket_medio > best.ticket_medio ? r : best))
      : null

  const melhor_dia_trabalho =
    nonZeroTrabalho.length > 0
      ? nonZeroTrabalho.reduce((best, r) =>
          r.leads_trabalhados > best.leads_trabalhados ? r : best
        )
      : null

  // ============================================================================
  // 7. Totals
  // ============================================================================

  const total_leads_trabalhados = agg.reduce((s, a) => s + a.leads_trabalhados, 0)
  const total_ganhos = agg.reduce((s, a) => s + a.ganhos, 0)
  const total_perdidos = agg.reduce((s, a) => s + a.perdidos, 0)
  const total_faturamento = agg.reduce((s, a) => s + a.faturamento, 0)

  // ============================================================================
  // 8. Period info
  // ============================================================================

  const semanas_no_periodo = weeksInRange(filters.dateStart, filters.dateEnd)

  // ============================================================================
  // 9. Diagnostic
  // ============================================================================

  const diagnostico = buildDiagnostico(
    rows,
    total_ganhos,
    total_leads_trabalhados,
    total_faturamento,
    melhor_dia_faturamento,
    melhor_dia_trabalho,
    melhor_dia_ticket,
    melhor_dia_ganhos
  )

  return {
    rows,
    melhor_dia_ganhos,
    melhor_dia_faturamento,
    melhor_dia_ticket,
    melhor_dia_trabalho,
    total_leads_trabalhados,
    total_ganhos,
    total_perdidos,
    total_faturamento,
    diagnostico,
    period_start: filters.dateStart,
    period_end: filters.dateEnd,
    semanas_no_periodo,
  }
}
