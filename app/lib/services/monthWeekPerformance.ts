// ==============================================================================
// Service: Relatório por Semana do Mês
//
// Fonte oficial:
// - Ações comerciais: cycle_events classificados como activity
// - Avanços: cycle_events classificados como stage_move
// - Vendas: sales_cycles com status ganho
// - Faturamento: v_revenue_daily_seller + v_revenue_daily_extra
// - Data financeira oficial: ref_date
// - Perdas: sales_cycles.lost_at
//
// Não existe taxa de ganho.
// Uma ação e uma venda podem acontecer em dias ou semanas diferentes.
// ==============================================================================

import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import { classifyEvent } from '@/app/config/eventClassification'
import { getOfficialRevenueDays } from '@/app/lib/services/reportingRevenue'
import type {
  MonthWeekFilters,
  MonthWeekIndex,
  MonthWeekPerformanceRow,
  MonthWeekPerformanceSummary,
} from '@/app/types/monthWeekPerformance'

const PAGE_SIZE = 1000
const BUSINESS_TIME_ZONE = 'America/Sao_Paulo'

const WEEK_LABELS: Record<MonthWeekIndex, string> = {
  1: '1ª semana',
  2: '2ª semana',
  3: '3ª semana',
  4: '4ª semana',
  5: '5ª semana',
}

const WEEK_SHORTS: Record<MonthWeekIndex, string> = {
  1: 'Sem 1',
  2: 'Sem 2',
  3: 'Sem 3',
  4: 'Sem 4',
  5: 'Sem 5',
}

const WEEK_DESCRIPTIONS: Record<MonthWeekIndex, string> = {
  1: 'Dias 1–7',
  2: 'Dias 8–14',
  3: 'Dias 15–21',
  4: 'Dias 22–28',
  5: 'Dias 29–31',
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

type WeekAccumulator = {
  acoes_comerciais: number
  avancos: number
  ganhos: number
  perdidos: number
  faturamento: number
  faturamento_vendas: number
  sample_months: Set<string>
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

function getMonthWeek(dateKey: string): MonthWeekIndex {
  const day = Number(dateKey.slice(8, 10))

  return Math.min(5, Math.max(1, Math.ceil(day / 7))) as MonthWeekIndex
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

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
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
  melhorAcoes: MonthWeekPerformanceRow | null,
  melhorAvancos: MonthWeekPerformanceRow | null,
  melhorFaturamento: MonthWeekPerformanceRow | null,
  melhorTicket: MonthWeekPerformanceRow | null,
): string {
  if (totalAcoes === 0 && totalGanhos === 0) {
    return 'Nenhuma ação comercial ou venda ganha foi encontrada no período selecionado.'
  }

  const parts: string[] = []

  if (melhorFaturamento && melhorFaturamento.faturamento > 0) {
    parts.push(
      `${melhorFaturamento.week_label} lidera em faturamento com ${formatBRL(melhorFaturamento.faturamento)}.`,
    )
  }

  if (
    melhorAcoes &&
    melhorAcoes.acoes_comerciais > 0 &&
    melhorAcoes.week !== melhorFaturamento?.week
  ) {
    parts.push(
      `${melhorAcoes.week_label} concentra o maior volume de execução, com ${melhorAcoes.acoes_comerciais} ação(ões) registradas.`,
    )
  }

  if (
    melhorAvancos &&
    melhorAvancos.avancos > 0 &&
    melhorAvancos.week !== melhorFaturamento?.week
  ) {
    parts.push(
      `${melhorAvancos.week_label} lidera em avanços reais de etapa, com ${melhorAvancos.avancos} movimentação(ões).`,
    )
  }

  if (melhorTicket && melhorTicket.ganhos >= 3) {
    parts.push(
      `${melhorTicket.week_label} apresenta o maior ticket médio entre as semanas com base mínima de três vendas.`,
    )
  }

  if (parts.length === 0) {
    return 'Há atividade registrada no período, mas ainda sem volume suficiente de resultados para apontar um padrão consistente.'
  }

  return parts.join(' ')
}

function buildLeituraResumida(
  melhorAcoes: MonthWeekPerformanceRow | null,
  melhorAvancos: MonthWeekPerformanceRow | null,
  melhorFaturamento: MonthWeekPerformanceRow | null,
  melhorGanhos: MonthWeekPerformanceRow | null,
  melhorTicket: MonthWeekPerformanceRow | null,
): string[] {
  const lines: string[] = []

  if (melhorFaturamento?.faturamento) {
    lines.push(
      `${melhorFaturamento.week_label} é a faixa mais forte em faturamento.`,
    )
  }

  if (
    melhorGanhos &&
    melhorGanhos.week !== melhorFaturamento?.week &&
    melhorGanhos.ganhos > 0
  ) {
    lines.push(
      `${melhorGanhos.week_label} concentra o maior volume de vendas ganhas.`,
    )
  }

  if (
    melhorAcoes &&
    melhorAcoes.week !== melhorFaturamento?.week &&
    melhorAcoes.acoes_comerciais > 0
  ) {
    lines.push(
      `${melhorAcoes.week_label} é a faixa com maior volume de execução comercial.`,
    )
  }

  if (
    melhorAvancos &&
    melhorAvancos.week !== melhorFaturamento?.week &&
    melhorAvancos.avancos > 0
  ) {
    lines.push(
      `${melhorAvancos.week_label} apresenta mais avanços reais de etapa.`,
    )
  }

  if (melhorTicket && melhorTicket.ganhos >= 3) {
    lines.push(
      `${melhorTicket.week_label} tem o maior ticket médio com base suficiente.`,
    )
  }

  if (lines.length === 0) {
    lines.push(
      'Período com volume insuficiente para gerar uma leitura comparativa por semana do mês.',
    )
  }

  return lines
}

export async function getMonthWeekPerformance(
  filters: MonthWeekFilters,
): Promise<MonthWeekPerformanceSummary> {
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

  const accumulators: Record<MonthWeekIndex, WeekAccumulator> = {
    1: {
      acoes_comerciais: 0,
      avancos: 0,
      ganhos: 0,
      perdidos: 0,
      faturamento: 0,
      faturamento_vendas: 0,
      sample_months: new Set<string>(),
    },
    2: {
      acoes_comerciais: 0,
      avancos: 0,
      ganhos: 0,
      perdidos: 0,
      faturamento: 0,
      faturamento_vendas: 0,
      sample_months: new Set<string>(),
    },
    3: {
      acoes_comerciais: 0,
      avancos: 0,
      ganhos: 0,
      perdidos: 0,
      faturamento: 0,
      faturamento_vendas: 0,
      sample_months: new Set<string>(),
    },
    4: {
      acoes_comerciais: 0,
      avancos: 0,
      ganhos: 0,
      perdidos: 0,
      faturamento: 0,
      faturamento_vendas: 0,
      sample_months: new Set<string>(),
    },
    5: {
      acoes_comerciais: 0,
      avancos: 0,
      ganhos: 0,
      perdidos: 0,
      faturamento: 0,
      faturamento_vendas: 0,
      sample_months: new Set<string>(),
    },
  }

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

    const week = getMonthWeek(dateKey)
    const accumulator = accumulators[week]

    accumulator.sample_months.add(dateKey.slice(0, 7))

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
        const week = getMonthWeek(saleDate)
        const accumulator = accumulators[week]

        accumulator.ganhos += 1
        accumulator.sample_months.add(saleDate.slice(0, 7))
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
        const week = getMonthWeek(lossDate)
        const accumulator = accumulators[week]

        accumulator.perdidos += 1
        accumulator.sample_months.add(lossDate.slice(0, 7))
      }
    }
  }

  for (const revenueDay of revenueDays) {
    const week = getMonthWeek(revenueDay.date)
    const accumulator = accumulators[week]

    accumulator.faturamento += revenueDay.value
    if (revenueDay.sourceKind === 'seller') {
      accumulator.faturamento_vendas += revenueDay.value
    }
    accumulator.sample_months.add(revenueDay.date.slice(0, 7))
  }

  const indexes: MonthWeekIndex[] = [1, 2, 3, 4, 5]

  const rows: MonthWeekPerformanceRow[] = indexes.map((week) => {
    const accumulator = accumulators[week]

    return {
      week,
      week_label: WEEK_LABELS[week],
      week_short: WEEK_SHORTS[week],
      week_description: WEEK_DESCRIPTIONS[week],
      acoes_comerciais: accumulator.acoes_comerciais,
      avancos: accumulator.avancos,
      ganhos: accumulator.ganhos,
      perdidos: accumulator.perdidos,
      faturamento: accumulator.faturamento,
      ticket_medio:
        accumulator.ganhos > 0
          ? accumulator.faturamento_vendas / accumulator.ganhos
          : 0,
      meses_com_dados: accumulator.sample_months.size,
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

  const melhorSemanaAcoes =
    rowsComAcoes.length > 0
      ? [...rowsComAcoes].sort(
          (a, b) => b.acoes_comerciais - a.acoes_comerciais,
        )[0]
      : null

  const melhorSemanaAvancos =
    rowsComAvancos.length > 0
      ? [...rowsComAvancos].sort((a, b) => b.avancos - a.avancos)[0]
      : null

  const melhorSemanaGanhos =
    rowsComGanhos.length > 0
      ? [...rowsComGanhos].sort((a, b) => b.ganhos - a.ganhos)[0]
      : null

  const rowsComFaturamento = rows.filter((row) => row.faturamento > 0)

  const melhorSemanaFaturamento =
    rowsComFaturamento.length > 0
      ? [...rowsComFaturamento].sort(
          (a, b) => b.faturamento - a.faturamento,
        )[0]
      : null

  const melhorSemanaTicket =
    rowsComTicket.length > 0
      ? [...rowsComTicket].sort(
          (a, b) => b.ticket_medio - a.ticket_medio,
        )[0]
      : null

  return {
    rows,

    melhor_semana_acoes: melhorSemanaAcoes,
    melhor_semana_avancos: melhorSemanaAvancos,
    melhor_semana_ganhos: melhorSemanaGanhos,
    melhor_semana_faturamento: melhorSemanaFaturamento,
    melhor_semana_ticket: melhorSemanaTicket,

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
      melhorSemanaAcoes,
      melhorSemanaAvancos,
      melhorSemanaFaturamento,
      melhorSemanaTicket,
    ),

    leitura_resumida: buildLeituraResumida(
      melhorSemanaAcoes,
      melhorSemanaAvancos,
      melhorSemanaFaturamento,
      melhorSemanaGanhos,
      melhorSemanaTicket,
    ),

    period_start: filters.dateStart,
    period_end: filters.dateEnd,
    meses_no_periodo: countMonthsInRange(
      filters.dateStart,
      filters.dateEnd,
    ),
  }
}
