// ==============================================================================
// Service: Sazonalidade Mensal — Performance — Fase 6.4
//
// Analisa a operação comercial por mês do ano (janeiro a dezembro),
// identificando padrões sazonais históricos de volume, faturamento e ticket.
//
// Fontes:
//   - leads_trabalhados: sales_cycles.first_worked_at
//   - ganhos/faturamento: sales_cycles.won_at + won_total + status='ganho'
//   - perdidos: sales_cycles.lost_at (proxy: stage_entered_at quando indisponível)
//
// HONESTIDADE:
//   - taxa_ganho não é calculada quando leads_trabalhados < 10
//   - ticket_medio não é exibido quando ganhos < 5
//   - anos_com_dados contextualiza o tamanho da amostra por mês
//   - meses sem atividade são incluídos (12 linhas sempre) com zeros
// ==============================================================================

import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import type {
  MonthlySeasonalityFilters,
  MonthlySeasonalityRow,
  MonthlySeasonalitySummary,
  MonthIndex,
} from '@/app/types/monthlySeasonality'

const MONTH_LABELS: string[] = [
  '',           // índice 0 não usado
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

const MONTH_SHORTS: string[] = [
  '',
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
]

/**
 * Extrai o número do mês (1–12) de um timestamp ISO.
 */
function getMonth(ts: string): MonthIndex {
  const d = new Date(ts)
  return (d.getUTCMonth() + 1) as MonthIndex
}

/**
 * Extrai o ano ("YYYY") de um timestamp ISO para contar anos distintos.
 */
function toYear(ts: string): string {
  return ts.slice(0, 4)
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
  rows: MonthlySeasonalityRow[],
  totalGanhos: number,
  totalTrabalhados: number,
  melhorFaturamento: MonthlySeasonalityRow | null,
  melhorTrabalho: MonthlySeasonalityRow | null,
  melhorTicket: MonthlySeasonalityRow | null,
  melhorGanhos: MonthlySeasonalityRow | null
): string {
  if (totalTrabalhados === 0 && totalGanhos === 0) {
    return 'Dados insuficientes no período selecionado. Nenhum lead trabalhado ou ganho encontrado.'
  }

  const parts: string[] = []

  if (melhorFaturamento && melhorFaturamento.faturamento > 0) {
    parts.push(
      `${melhorFaturamento.month_label} lidera historicamente em faturamento com ${formatBRL(melhorFaturamento.faturamento)}.`
    )
  }

  if (melhorTrabalho && melhorTrabalho.leads_trabalhados > 0) {
    parts.push(
      `${melhorTrabalho.month_label} concentra o maior volume de trabalho comercial (${melhorTrabalho.leads_trabalhados} leads trabalhados).`
    )
  }

  if (melhorTicket && melhorTicket.base_suficiente_ganho) {
    parts.push(
      `${melhorTicket.month_label} apresenta o maior ticket médio entre meses com base suficiente: ${formatBRL(melhorTicket.ticket_medio)}.`
    )
  }

  if (melhorGanhos && melhorGanhos.ganhos > 0) {
    if (!melhorFaturamento || melhorGanhos.month !== melhorFaturamento.month) {
      parts.push(
        `${melhorGanhos.month_label} lidera em volume de ganhos (${melhorGanhos.ganhos} ganho(s)).`
      )
    }
  }

  const insufficientMonths = rows.filter(
    (r) => r.leads_trabalhados > 0 && !r.base_suficiente_trabalho
  )
  if (insufficientMonths.length > 0) {
    const names = insufficientMonths.map((r) => r.month_short).join(', ')
    parts.push(
      `Os meses ${names} têm dados insuficientes para calcular taxa de ganho com confiança (menos de 10 leads trabalhados).`
    )
  }

  // Nota sobre sazonalidade com poucos anos
  const maxAnos = Math.max(...rows.map((r) => r.anos_com_dados))
  if (maxAnos === 1) {
    parts.push(
      'Atenção: todos os dados vêm de apenas 1 ano. Amplie o período para uma leitura sazonal mais confiável.'
    )
  }

  if (parts.length === 0) {
    return 'Período com baixo volume de dados. Amplie o intervalo de datas para análise mais precisa.'
  }

  return parts.join(' ')
}

function buildLeituraResumida(
  rows: MonthlySeasonalityRow[],
  melhorFaturamento: MonthlySeasonalityRow | null,
  melhorGanhos: MonthlySeasonalityRow | null,
  melhorTicket: MonthlySeasonalityRow | null,
  melhorTrabalho: MonthlySeasonalityRow | null
): string[] {
  const frases: string[] = []

  if (melhorFaturamento && melhorFaturamento.faturamento > 0) {
    frases.push(`${melhorFaturamento.month_label} historicamente lidera em faturamento.`)
  }

  if (melhorGanhos && melhorGanhos.ganhos > 0) {
    frases.push(
      `${melhorGanhos.month_label} concentra o maior volume de ganhos (${melhorGanhos.ganhos} ganho(s)).`
    )
  }

  if (melhorTicket && melhorTicket.base_suficiente_ganho) {
    frases.push(
      `${melhorTicket.month_label} apresenta o melhor ticket médio: ${formatBRL(melhorTicket.ticket_medio)}.`
    )
  }

  if (melhorTrabalho && melhorTrabalho.leads_trabalhados > 0) {
    frases.push(
      `${melhorTrabalho.month_label} mostra forte ritmo de trabalho comercial (${melhorTrabalho.leads_trabalhados} leads trabalhados).`
    )
  }

  // Sinaliza meses com base insuficiente que têm algum dado
  const insuficientes = rows.filter(
    (r) => r.leads_trabalhados > 0 && !r.base_suficiente_trabalho
  )
  if (insuficientes.length > 0) {
    const nomes = insuficientes.map((r) => r.month_short).join(', ')
    frases.push(
      `${nomes} com volume insuficiente — amplie o período para leituras mais confiáveis.`
    )
  }

  // Nota sobre meses completamente sem atividade
  const semAtividade = rows.filter((r) => r.leads_trabalhados === 0 && r.ganhos === 0)
  if (semAtividade.length > 0 && semAtividade.length <= 6) {
    const nomes = semAtividade.map((r) => r.month_short).join(', ')
    frases.push(`${nomes} sem atividade registrada no período.`)
  }

  if (frases.length === 0) {
    frases.push('Período com volume insuficiente para gerar leitura de sazonalidade mensal.')
  }

  return frases
}

export async function getMonthlySeasonalityPerformance(
  filters: MonthlySeasonalityFilters
): Promise<MonthlySeasonalitySummary> {
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
  // 3. Perdidos — usa lost_at quando existe, caindo em stage_entered_at.
  //    updated_at não serve como proxy porque muda em qualquer edição posterior.
  // ============================================================================
  let lostQuery = supabase
    .from('sales_cycles')
    .select('lost_at, stage_entered_at')
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

  const dateStartMs = new Date(dateStartIso).getTime()
  const dateEndMs = new Date(dateEndIso).getTime()

  const lostData = lostDataAll.filter((r) => {
    const raw = (r.lost_at as string | null) ?? (r.stage_entered_at as string | null)
    if (!raw) return false
    const ts = new Date(raw).getTime()
    return ts >= dateStartMs && ts <= dateEndMs
  })

  // ============================================================================
  // 4. Aggregate by month (client-side)
  // ============================================================================

  interface MonthAgg {
    leads_trabalhados: number
    ganhos: number
    perdidos: number
    faturamento: number
    worked_years: Set<string>
    won_years: Set<string>
    lost_years: Set<string>
  }

  // índice 0 não usado; meses 1–12 em posições 1–12
  const agg: MonthAgg[] = Array.from({ length: 13 }, () => ({
    leads_trabalhados: 0,
    ganhos: 0,
    perdidos: 0,
    faturamento: 0,
    worked_years: new Set<string>(),
    won_years: new Set<string>(),
    lost_years: new Set<string>(),
  }))

  for (const row of workedData ?? []) {
    const r = row as Record<string, unknown>
    const ts = r.first_worked_at as string | null
    if (!ts) continue
    const mo = getMonth(ts)
    agg[mo].leads_trabalhados += 1
    agg[mo].worked_years.add(toYear(ts))
  }

  for (const row of wonData ?? []) {
    const r = row as Record<string, unknown>
    const ts = r.won_at as string | null
    const total = r.won_total != null ? Number(r.won_total) : 0
    if (!ts) continue
    const mo = getMonth(ts)
    agg[mo].ganhos += 1
    agg[mo].faturamento += total
    agg[mo].won_years.add(toYear(ts))
  }

  for (const row of lostData) {
    const ts = (row.lost_at as string | null) ?? (row.stage_entered_at as string | null)
    if (!ts) continue
    const mo = getMonth(ts)
    agg[mo].perdidos += 1
    agg[mo].lost_years.add(toYear(ts))
  }

  // ============================================================================
  // 5. Build MonthlySeasonalityRow[]
  // ============================================================================

  const rows: MonthlySeasonalityRow[] = []

  for (let i = 1; i <= 12; i++) {
    const month = i as MonthIndex
    const a = agg[i]
    const ticket_medio = a.ganhos > 0 ? a.faturamento / a.ganhos : 0
    const taxa_ganho = a.leads_trabalhados > 0 ? a.ganhos / a.leads_trabalhados : 0
    const base_suficiente_trabalho = a.leads_trabalhados >= 10
    const base_suficiente_ganho = a.ganhos >= 5

    const allYears = new Set([
      ...a.worked_years,
      ...a.won_years,
      ...a.lost_years,
    ])
    const anos_com_dados = allYears.size

    rows.push({
      month,
      month_label: MONTH_LABELS[i],
      month_short: MONTH_SHORTS[i],
      leads_trabalhados: a.leads_trabalhados,
      ganhos: a.ganhos,
      perdidos: a.perdidos,
      faturamento: a.faturamento,
      ticket_medio,
      taxa_ganho,
      base_suficiente_trabalho,
      base_suficiente_ganho,
      anos_com_dados,
    })
  }

  // ============================================================================
  // 6. Best month KPIs
  // ============================================================================

  const nonZeroGanhos = rows.filter((r) => r.ganhos > 0)
  const nonZeroFaturamento = rows.filter((r) => r.faturamento > 0)
  const nonZeroTrabalho = rows.filter((r) => r.leads_trabalhados > 0)
  const suficienteGanho = rows.filter((r) => r.base_suficiente_ganho)

  const melhor_mes_ganhos =
    nonZeroGanhos.length > 0
      ? nonZeroGanhos.reduce((best, r) => (r.ganhos > best.ganhos ? r : best))
      : null

  const melhor_mes_faturamento =
    nonZeroFaturamento.length > 0
      ? nonZeroFaturamento.reduce((best, r) => (r.faturamento > best.faturamento ? r : best))
      : null

  const melhor_mes_ticket =
    suficienteGanho.length > 0
      ? suficienteGanho.reduce((best, r) => (r.ticket_medio > best.ticket_medio ? r : best))
      : null

  const melhor_mes_trabalho =
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
    melhor_mes_faturamento,
    melhor_mes_trabalho,
    melhor_mes_ticket,
    melhor_mes_ganhos
  )

  const leitura_resumida = buildLeituraResumida(
    rows,
    melhor_mes_faturamento,
    melhor_mes_ganhos,
    melhor_mes_ticket,
    melhor_mes_trabalho
  )

  return {
    rows,
    melhor_mes_ganhos,
    melhor_mes_faturamento,
    melhor_mes_ticket,
    melhor_mes_trabalho,
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
