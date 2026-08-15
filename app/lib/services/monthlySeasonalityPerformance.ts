// ==============================================================================
// Service: Sazonalidade Mensal
//
// Fonte oficial:
// - Ações comerciais: cycle_events classificados como activity
// - Avanços: cycle_events classificados como stage_move
// - Vendas: sales_cycles com status ganho
// - Faturamento: v_revenue_daily_seller + v_revenue_daily_extra
// - Data financeira oficial: ref_date
// - Perdas: sales_cycles.lost_at
//
// A leitura consolida o mesmo mês em anos diferentes.
// Exemplo: todos os meses de janeiro do período são analisados juntos.
// ==============================================================================

import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import { classifyEvent } from '@/app/config/eventClassification'
import { getOfficialRevenueDays } from '@/app/lib/services/reportingRevenue'
import type {
  MonthlySeasonalityFilters,
  MonthlySeasonalityRow,
  MonthlySeasonalitySummary,
  MonthIndex,
} from '@/app/types/monthlySeasonality'

const PAGE_SIZE = 1000
const BUSINESS_TIME_ZONE = 'America/Sao_Paulo'

const MONTH_LABELS: Record<MonthIndex, string> = {
  1: 'Janeiro',
  2: 'Fevereiro',
  3: 'Março',
  4: 'Abril',
  5: 'Maio',
  6: 'Junho',
  7: 'Julho',
  8: 'Agosto',
  9: 'Setembro',
  10: 'Outubro',
  11: 'Novembro',
  12: 'Dezembro',
}

const MONTH_SHORTS: Record<MonthIndex, string> = {
  1: 'Jan',
  2: 'Fev',
  3: 'Mar',
  4: 'Abr',
  5: 'Mai',
  6: 'Jun',
  7: 'Jul',
  8: 'Ago',
  9: 'Set',
  10: 'Out',
  11: 'Nov',
  12: 'Dez',
}

const SYSTEM_EVENT_TYPES = new Set([
  'cycle_created',
  'lead_created',
  'assigned',
  'reassigned',
  'owner_assigned',
  'owner_reassigned',
  'returned_to_pool',
  'group_attached',
  'group_changed',
  'group_assigned',
  'group_detached',
  'lead_reactivated_from_import',
  'lead_reactivated_from_manual_create',
  'lead_reactivated_by_admin',
  'ai_analysis_generated',
  'ai_suggestion_applied',
  'ai_suggestion_rejected',
])

type RawCycle = {
  id: string
  status: string
  owner_user_id: string | null
  won_owner_user_id: string | null
  lost_owner_user_id: string | null
  won_at: string | null
  closed_at: string | null
  lost_at: string | null
  revenue_seller_ref_date: string | null
}

type RawEvent = {
  id: string
  cycle_id: string | null
  event_type: string
  metadata: Record<string, unknown> | null
  occurred_at: string
  created_by: string | null
}

type MonthAccumulator = {
  acoes_comerciais: number
  avancos: number
  ganhos: number
  perdidos: number
  faturamento: number
  faturamento_vendas: number
  sample_years: Set<string>
}

function isDateKey(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))
}

function toDateKey(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }

  if (isDateKey(value)) {
    return value
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const values = new Map(parts.map((part) => [part.type, part.value]))

  const year = values.get('year')
  const month = values.get('month')
  const day = values.get('day')

  if (!year || !month || !day) {
    return null
  }

  return `${year}-${month}-${day}`
}

function addDays(dateKey: string, amount: number): string {
  const date = new Date(`${dateKey}T12:00:00Z`)

  date.setUTCDate(date.getUTCDate() + amount)

  return date.toISOString().slice(0, 10)
}

function getMonth(dateKey: string): MonthIndex {
  return Number(dateKey.slice(5, 7)) as MonthIndex
}

function getYear(dateKey: string): string {
  return dateKey.slice(0, 4)
}

function getRevenueReferenceDate(cycle: RawCycle): string | null {
  return (
    toDateKey(cycle.revenue_seller_ref_date) ??
    toDateKey(cycle.won_at) ??
    toDateKey(cycle.closed_at)
  )
}

function isInRange(
  dateKey: string | null,
  dateStart: string,
  dateEnd: string,
): boolean {
  return Boolean(dateKey && dateKey >= dateStart && dateKey <= dateEnd)
}

function countMonthsInRange(dateStart: string, dateEnd: string): number {
  const start = new Date(`${dateStart}T12:00:00Z`)
  const end = new Date(`${dateEnd}T12:00:00Z`)

  return Math.max(
    1,
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      (end.getUTCMonth() - start.getUTCMonth()) +
      1,
  )
}

function countYearsInRange(dateStart: string, dateEnd: string): number {
  const startYear = Number(dateStart.slice(0, 4))
  const endYear = Number(dateEnd.slice(0, 4))

  return Math.max(1, endYear - startYear + 1)
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function isCommercialActivity(event: RawEvent): boolean {
  if (SYSTEM_EVENT_TYPES.has(event.event_type.trim().toLowerCase())) {
    return false
  }

  return (
    classifyEvent({
      event_type: event.event_type,
      metadata: event.metadata ?? {},
    }) === 'activity'
  )
}

function isRealStageAdvance(event: RawEvent): boolean {
  if (SYSTEM_EVENT_TYPES.has(event.event_type.trim().toLowerCase())) {
    return false
  }

  return (
    classifyEvent({
      event_type: event.event_type,
      metadata: event.metadata ?? {},
    }) === 'stage_move'
  )
}

async function fetchAllCycles(companyId: string): Promise<RawCycle[]> {
  const supabase = supabaseBrowser()

  const rows: RawCycle[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('sales_cycles')
      .select(
        'id, status, owner_user_id, won_owner_user_id, lost_owner_user_id, won_at, closed_at, lost_at, revenue_seller_ref_date',
      )
      .eq('company_id', companyId)
      .in('status', ['ganho', 'perdido'])
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) {
      throw new Error(`Erro ao buscar ciclos encerrados: ${error.message}`)
    }

    const page = (data ?? []) as RawCycle[]

    rows.push(...page)

    if (page.length < PAGE_SIZE) {
      break
    }

    from += PAGE_SIZE
  }

  return rows
}

async function fetchAllEvents(
  companyId: string,
  dateStart: string,
  dateEnd: string,
  ownerId?: string | null,
): Promise<RawEvent[]> {
  const supabase = supabaseBrowser()

  const rows: RawEvent[] = []
  const nextDay = addDays(dateEnd, 1)

  let from = 0

  while (true) {
    let query = supabase
      .from('cycle_events')
      .select('id, cycle_id, event_type, metadata, occurred_at, created_by')
      .eq('company_id', companyId)
      .gte('occurred_at', `${dateStart}T00:00:00-03:00`)
      .lt('occurred_at', `${nextDay}T00:00:00-03:00`)
      .order('occurred_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (ownerId) {
      query = query.eq('created_by', ownerId)
    }

    const { data, error } = await query

    if (error) {
      throw new Error(`Erro ao buscar eventos comerciais: ${error.message}`)
    }

    const page = (data ?? []) as RawEvent[]

    rows.push(...page)

    if (page.length < PAGE_SIZE) {
      break
    }

    from += PAGE_SIZE
  }

  return rows
}

function buildDiagnostico(
  totalAcoes: number,
  totalGanhos: number,
  melhorAcoes: MonthlySeasonalityRow | null,
  melhorAvancos: MonthlySeasonalityRow | null,
  melhorFaturamento: MonthlySeasonalityRow | null,
  melhorTicket: MonthlySeasonalityRow | null,
  anosNoPeriodo: number,
): string {
  if (totalAcoes === 0 && totalGanhos === 0) {
    return 'Nenhuma ação comercial ou venda ganha foi encontrada no período selecionado.'
  }

  const parts: string[] = []

  if (melhorFaturamento && melhorFaturamento.faturamento > 0) {
    parts.push(
      `${melhorFaturamento.month_label} lidera o período em faturamento acumulado, com ${formatBRL(melhorFaturamento.faturamento)}.`,
    )
  }

  if (
    melhorAcoes &&
    melhorAcoes.acoes_comerciais > 0 &&
    melhorAcoes.month !== melhorFaturamento?.month
  ) {
    parts.push(
      `${melhorAcoes.month_label} concentra o maior volume de execução, com ${melhorAcoes.acoes_comerciais} ação(ões) registradas.`,
    )
  }

  if (
    melhorAvancos &&
    melhorAvancos.avancos > 0 &&
    melhorAvancos.month !== melhorFaturamento?.month
  ) {
    parts.push(
      `${melhorAvancos.month_label} lidera em avanços reais de etapa, com ${melhorAvancos.avancos} movimentação(ões).`,
    )
  }

  if (melhorTicket && melhorTicket.ganhos >= 3) {
    parts.push(
      `${melhorTicket.month_label} apresenta o maior ticket médio entre os meses com base mínima de três vendas.`,
    )
  }

  if (anosNoPeriodo <= 1) {
    parts.push(
      'A leitura ainda usa somente um ano de dados. Amplie o período para transformar o relatório em uma análise sazonal mais confiável.',
    )
  }

  if (parts.length === 0) {
    return 'Há atividade registrada no período, mas ainda sem volume suficiente de resultados para apontar um padrão sazonal consistente.'
  }

  return parts.join(' ')
}

function buildLeituraResumida(
  melhorAcoes: MonthlySeasonalityRow | null,
  melhorAvancos: MonthlySeasonalityRow | null,
  melhorFaturamento: MonthlySeasonalityRow | null,
  melhorGanhos: MonthlySeasonalityRow | null,
  melhorTicket: MonthlySeasonalityRow | null,
): string[] {
  const lines: string[] = []

  if (melhorFaturamento?.faturamento) {
    lines.push(
      `${melhorFaturamento.month_label} é o mês mais forte em faturamento acumulado.`,
    )
  }

  if (
    melhorGanhos &&
    melhorGanhos.month !== melhorFaturamento?.month &&
    melhorGanhos.ganhos > 0
  ) {
    lines.push(
      `${melhorGanhos.month_label} concentra o maior volume de vendas ganhas.`,
    )
  }

  if (
    melhorAcoes &&
    melhorAcoes.month !== melhorFaturamento?.month &&
    melhorAcoes.acoes_comerciais > 0
  ) {
    lines.push(
      `${melhorAcoes.month_label} é o mês com maior volume de execução comercial.`,
    )
  }

  if (
    melhorAvancos &&
    melhorAvancos.month !== melhorFaturamento?.month &&
    melhorAvancos.avancos > 0
  ) {
    lines.push(
      `${melhorAvancos.month_label} apresenta mais avanços reais de etapa.`,
    )
  }

  if (melhorTicket && melhorTicket.ganhos >= 3) {
    lines.push(
      `${melhorTicket.month_label} tem o maior ticket médio com base suficiente.`,
    )
  }

  if (lines.length === 0) {
    lines.push(
      'Período com volume insuficiente para gerar uma leitura comparativa por mês do ano.',
    )
  }

  return lines
}

export async function getMonthlySeasonalityPerformance(
  filters: MonthlySeasonalityFilters,
): Promise<MonthlySeasonalitySummary> {
  const [cycles, events, revenueDays] = await Promise.all([
    fetchAllCycles(filters.companyId),
    fetchAllEvents(
      filters.companyId,
      filters.dateStart,
      filters.dateEnd,
      filters.ownerId,
    ),
    getOfficialRevenueDays({
      companyId: filters.companyId,
      ownerId: filters.ownerId,
      dateStart: filters.dateStart,
      dateEnd: filters.dateEnd,
    }),
  ])

  const indexes: MonthIndex[] = [
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11,
    12,
  ]

  const accumulators = indexes.reduce(
    (result, month) => {
      result[month] = {
        acoes_comerciais: 0,
        avancos: 0,
        ganhos: 0,
        perdidos: 0,
        faturamento: 0,
        faturamento_vendas: 0,
        sample_years: new Set<string>(),
      }

      return result
    },
    {} as Record<MonthIndex, MonthAccumulator>,
  )

  for (const event of events) {
    const dateKey = toDateKey(event.occurred_at)

    if (!dateKey || !isInRange(dateKey, filters.dateStart, filters.dateEnd)) {
      continue
    }

    const activity = isCommercialActivity(event)
    const advance = isRealStageAdvance(event)

    if (!activity && !advance) {
      continue
    }

    const month = getMonth(dateKey)
    const accumulator = accumulators[month]

    accumulator.sample_years.add(getYear(dateKey))

    if (activity) {
      accumulator.acoes_comerciais += 1
    }

    if (advance) {
      accumulator.avancos += 1
    }
  }

  for (const cycle of cycles) {
    if (cycle.status === 'ganho') {
      const saleDate = getRevenueReferenceDate(cycle)
      const saleOwnerId = cycle.won_owner_user_id ?? cycle.owner_user_id

      if (
        saleDate &&
        isInRange(saleDate, filters.dateStart, filters.dateEnd) &&
        (!filters.ownerId || saleOwnerId === filters.ownerId)
      ) {
        const month = getMonth(saleDate)
        const accumulator = accumulators[month]

        accumulator.ganhos += 1
        accumulator.sample_years.add(getYear(saleDate))
      }
    }

    if (cycle.status === 'perdido') {
      const lossDate = toDateKey(cycle.lost_at)
      const lossOwnerId = cycle.lost_owner_user_id ?? cycle.owner_user_id

      if (
        lossDate &&
        isInRange(lossDate, filters.dateStart, filters.dateEnd) &&
        (!filters.ownerId || lossOwnerId === filters.ownerId)
      ) {
        const month = getMonth(lossDate)
        const accumulator = accumulators[month]

        accumulator.perdidos += 1
        accumulator.sample_years.add(getYear(lossDate))
      }
    }
  }

  for (const revenueDay of revenueDays) {
    const month = getMonth(revenueDay.date)
    const accumulator = accumulators[month]

    accumulator.faturamento += revenueDay.value
    if (revenueDay.sourceKind === 'seller') {
      accumulator.faturamento_vendas += revenueDay.value
    }
    accumulator.sample_years.add(getYear(revenueDay.date))
  }

  const rows: MonthlySeasonalityRow[] = indexes.map((month) => {
    const accumulator = accumulators[month]
    const ticketMedio =
      accumulator.ganhos > 0
        ? accumulator.faturamento_vendas / accumulator.ganhos
        : 0

    return {
      month,
      month_label: MONTH_LABELS[month],
      month_short: MONTH_SHORTS[month],

      acoes_comerciais: accumulator.acoes_comerciais,
      avancos: accumulator.avancos,

      ganhos: accumulator.ganhos,
      perdidos: accumulator.perdidos,
      faturamento: accumulator.faturamento,
      ticket_medio: ticketMedio,

      anos_com_dados: accumulator.sample_years.size,

      // Compatibilidade com a rota legada.
      leads_trabalhados: accumulator.acoes_comerciais,
      taxa_ganho: 0,
      base_suficiente_trabalho: false,
      base_suficiente_ganho: accumulator.ganhos >= 3,
    }
  })

  const totalAcoes = rows.reduce(
    (sum, row) => sum + row.acoes_comerciais,
    0,
  )

  const totalAvancos = rows.reduce((sum, row) => sum + row.avancos, 0)

  const totalGanhos = rows.reduce((sum, row) => sum + row.ganhos, 0)

  const totalPerdidos = rows.reduce((sum, row) => sum + row.perdidos, 0)

  const totalFaturamento = rows.reduce(
    (sum, row) => sum + row.faturamento,
    0,
  )

  const rowsComAcoes = rows.filter((row) => row.acoes_comerciais > 0)
  const rowsComAvancos = rows.filter((row) => row.avancos > 0)
  const rowsComGanhos = rows.filter((row) => row.ganhos > 0)
  const rowsComTicket = rows.filter((row) => row.ganhos >= 3)

  const melhorMesAcoes =
    rowsComAcoes.length > 0
      ? [...rowsComAcoes].sort(
          (a, b) => b.acoes_comerciais - a.acoes_comerciais,
        )[0]
      : null

  const melhorMesAvancos =
    rowsComAvancos.length > 0
      ? [...rowsComAvancos].sort((a, b) => b.avancos - a.avancos)[0]
      : null

  const melhorMesGanhos =
    rowsComGanhos.length > 0
      ? [...rowsComGanhos].sort((a, b) => b.ganhos - a.ganhos)[0]
      : null

  const rowsComFaturamento = rows.filter((row) => row.faturamento > 0)

  const melhorMesFaturamento =
    rowsComFaturamento.length > 0
      ? [...rowsComFaturamento].sort(
          (a, b) => b.faturamento - a.faturamento,
        )[0]
      : null

  const melhorMesTicket =
    rowsComTicket.length > 0
      ? [...rowsComTicket].sort(
          (a, b) => b.ticket_medio - a.ticket_medio,
        )[0]
      : null

  const anosNoPeriodo = countYearsInRange(filters.dateStart, filters.dateEnd)

  return {
    rows,

    melhor_mes_acoes: melhorMesAcoes,
    melhor_mes_avancos: melhorMesAvancos,
    melhor_mes_ganhos: melhorMesGanhos,
    melhor_mes_faturamento: melhorMesFaturamento,
    melhor_mes_ticket: melhorMesTicket,

    total_acoes_comerciais: totalAcoes,
    total_avancos: totalAvancos,
    total_ganhos: totalGanhos,
    total_perdidos: totalPerdidos,
    total_faturamento: totalFaturamento,
    ticket_medio_geral:
      totalGanhos > 0 ? totalFaturamento / totalGanhos : 0,

    diagnostico: buildDiagnostico(
      totalAcoes,
      totalGanhos,
      melhorMesAcoes,
      melhorMesAvancos,
      melhorMesFaturamento,
      melhorMesTicket,
      anosNoPeriodo,
    ),

    leitura_resumida: buildLeituraResumida(
      melhorMesAcoes,
      melhorMesAvancos,
      melhorMesFaturamento,
      melhorMesGanhos,
      melhorMesTicket,
    ),

    period_start: filters.dateStart,
    period_end: filters.dateEnd,
    meses_no_periodo: countMonthsInRange(filters.dateStart, filters.dateEnd),
    anos_no_periodo: anosNoPeriodo,

    // Compatibilidade com a rota legada.
    total_leads_trabalhados: totalAcoes,
    melhor_mes_trabalho: melhorMesAcoes,
  }
}
