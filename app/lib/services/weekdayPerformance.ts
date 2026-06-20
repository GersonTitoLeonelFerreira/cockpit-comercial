// ==============================================================================
// Service: Relatório por Dia da Semana
//
// Fonte oficial:
// - Ações comerciais: cycle_events classificados como activity
// - Avanços: cycle_events classificados como stage_move
// - Vendas e faturamento: sales_cycles.status = ganho
// - Data financeira: revenue_seller_ref_date -> won_at -> closed_at
// - Perdas: sales_cycles.lost_at
//
// Não existe taxa de ganho nesta página.
// Uma ação registrada e uma venda fechada podem ocorrer em dias diferentes.
// Comparar os dois diretamente criaria uma conversão artificial.
// ==============================================================================

import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import { classifyEvent } from '@/app/config/eventClassification'
import type {
  WeekdayIndex,
  WeekdayPerformanceFilters,
  WeekdayPerformanceRow,
  WeekdayPerformanceSummary,
} from '@/app/types/weekdayPerformance'

const PAGE_SIZE = 1000
const BUSINESS_TIME_ZONE = 'America/Sao_Paulo'

const WEEKDAY_LABELS = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
]

const WEEKDAY_SHORTS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

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
  won_total: number | string | null
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

type WeekdayAccumulator = {
  acoes_comerciais: number
  avancos: number
  ganhos: number
  perdidos: number
  faturamento: number
  sample_dates: Set<string>
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0)

  return Number.isFinite(parsed) ? parsed : 0
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

function weekdayFromDateKey(dateKey: string): WeekdayIndex {
  const date = new Date(`${dateKey}T12:00:00Z`)

  return date.getUTCDay() as WeekdayIndex
}

function isoWeekKey(dateKey: string): string {
  const date = new Date(`${dateKey}T12:00:00Z`)

  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7))

  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  )

  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

function countWeeksInRange(dateStart: string, dateEnd: string): number {
  const weeks = new Set<string>()
  let current = dateStart

  while (current <= dateEnd) {
    weeks.add(isoWeekKey(current))
    current = addDays(current, 1)
  }

  return Math.max(weeks.size, 1)
}

function isInRange(
  dateKey: string | null,
  dateStart: string,
  dateEnd: string,
): boolean {
  return Boolean(dateKey && dateKey >= dateStart && dateKey <= dateEnd)
}

function getRevenueReferenceDate(cycle: RawCycle): string | null {
  return (
    toDateKey(cycle.revenue_seller_ref_date) ??
    toDateKey(cycle.won_at) ??
    toDateKey(cycle.closed_at)
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

async function fetchAllCycles(companyId: string): Promise<RawCycle[]> {
  const supabase = supabaseBrowser()

  const rows: RawCycle[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('sales_cycles')
      .select(
        'id, status, owner_user_id, won_owner_user_id, lost_owner_user_id, won_total, won_at, closed_at, lost_at, revenue_seller_ref_date',
      )
      .eq('company_id', companyId)
      .in('status', ['ganho', 'perdido'])
      .order('created_at', { ascending: false })
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
  rows: WeekdayPerformanceRow[],
  totalAcoes: number,
  totalGanhos: number,
  totalFaturamento: number,
  melhorAcoes: WeekdayPerformanceRow | null,
  melhorAvancos: WeekdayPerformanceRow | null,
  melhorFaturamento: WeekdayPerformanceRow | null,
  melhorTicket: WeekdayPerformanceRow | null,
): string {
  if (totalAcoes === 0 && totalGanhos === 0) {
    return 'Nenhuma ação comercial ou venda ganha foi encontrada no período selecionado.'
  }

  const parts: string[] = []

  if (melhorFaturamento && melhorFaturamento.faturamento > 0) {
    parts.push(
      `${melhorFaturamento.weekday_label} lidera em faturamento com ${new Intl.NumberFormat(
        'pt-BR',
        {
          style: 'currency',
          currency: 'BRL',
        },
      ).format(melhorFaturamento.faturamento)}.`,
    )
  }

  if (
    melhorAcoes &&
    melhorAcoes.acoes_comerciais > 0 &&
    melhorAcoes.weekday !== melhorFaturamento?.weekday
  ) {
    parts.push(
      `${melhorAcoes.weekday_label} concentra o maior volume de execução, com ${melhorAcoes.acoes_comerciais} ação(ões) comerciais registradas.`,
    )
  }

  if (
    melhorAvancos &&
    melhorAvancos.avancos > 0 &&
    melhorAvancos.weekday !== melhorFaturamento?.weekday
  ) {
    parts.push(
      `${melhorAvancos.weekday_label} lidera em avanços reais de etapa, com ${melhorAvancos.avancos} movimentação(ões).`,
    )
  }

  if (melhorTicket && melhorTicket.ganhos >= 3) {
    parts.push(
      `${melhorTicket.weekday_label} apresenta o maior ticket médio entre dias com base mínima de três vendas.`,
    )
  }

  if (parts.length === 0 && totalFaturamento > 0) {
    return 'Há faturamento no período, mas a distribuição por dia ainda não tem volume suficiente para uma leitura comparativa mais profunda.'
  }

  if (parts.length === 0) {
    return 'Há atividade registrada no período, mas ainda sem volume suficiente de resultados para destacar um padrão consistente.'
  }

  return parts.join(' ')
}

export async function getWeekdayPerformance(
  filters: WeekdayPerformanceFilters,
): Promise<WeekdayPerformanceSummary> {
  const [cycles, events] = await Promise.all([
    fetchAllCycles(filters.companyId),
    fetchAllEvents(
      filters.companyId,
      filters.dateStart,
      filters.dateEnd,
      filters.ownerId,
    ),
  ])

  const accumulators: WeekdayAccumulator[] = Array.from(
    {
      length: 7,
    },
    () => ({
      acoes_comerciais: 0,
      avancos: 0,
      ganhos: 0,
      perdidos: 0,
      faturamento: 0,
      sample_dates: new Set<string>(),
    }),
  )

  for (const event of events) {
    const dateKey = toDateKey(event.occurred_at)

    if (!isInRange(dateKey, filters.dateStart, filters.dateEnd) || !dateKey) {
      continue
    }

    const weekday = weekdayFromDateKey(dateKey)
    const accumulator = accumulators[weekday]

    accumulator.sample_dates.add(dateKey)

    if (isCommercialActivity(event)) {
      accumulator.acoes_comerciais += 1
    }

    if (isRealStageAdvance(event)) {
      accumulator.avancos += 1
    }
  }

  for (const cycle of cycles) {
    if (cycle.status === 'ganho') {
      const saleDate = getRevenueReferenceDate(cycle)
      const saleOwnerId = cycle.won_owner_user_id ?? cycle.owner_user_id

      if (
        isInRange(saleDate, filters.dateStart, filters.dateEnd) &&
        saleDate &&
        (!filters.ownerId || saleOwnerId === filters.ownerId)
      ) {
        const weekday = weekdayFromDateKey(saleDate)
        const accumulator = accumulators[weekday]

        accumulator.ganhos += 1
        accumulator.faturamento += toNumber(cycle.won_total)
        accumulator.sample_dates.add(saleDate)
      }
    }

    if (cycle.status === 'perdido') {
      const lossDate = toDateKey(cycle.lost_at)
      const lossOwnerId = cycle.lost_owner_user_id ?? cycle.owner_user_id

      if (
        isInRange(lossDate, filters.dateStart, filters.dateEnd) &&
        lossDate &&
        (!filters.ownerId || lossOwnerId === filters.ownerId)
      ) {
        const weekday = weekdayFromDateKey(lossDate)
        const accumulator = accumulators[weekday]

        accumulator.perdidos += 1
        accumulator.sample_dates.add(lossDate)
      }
    }
  }

  const rows: WeekdayPerformanceRow[] = accumulators.map(
    (accumulator, index) => {
      const weekday = index as WeekdayIndex

      return {
        weekday,
        weekday_label: WEEKDAY_LABELS[index],
        weekday_short: WEEKDAY_SHORTS[index],
        acoes_comerciais: accumulator.acoes_comerciais,
        avancos: accumulator.avancos,
        ganhos: accumulator.ganhos,
        perdidos: accumulator.perdidos,
        faturamento: accumulator.faturamento,
        ticket_medio:
          accumulator.ganhos > 0
            ? accumulator.faturamento / accumulator.ganhos
            : 0,
        semanas_com_dados: new Set(
          Array.from(accumulator.sample_dates).map((dateKey) =>
            isoWeekKey(dateKey),
          ),
        ).size,
      }
    },
  )

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
  const rowsComTicketConfiavel = rows.filter((row) => row.ganhos >= 3)

  const melhorDiaAcoes =
    rowsComAcoes.length > 0
      ? [...rowsComAcoes].sort(
          (a, b) => b.acoes_comerciais - a.acoes_comerciais,
        )[0]
      : null

  const melhorDiaAvancos =
    rowsComAvancos.length > 0
      ? [...rowsComAvancos].sort((a, b) => b.avancos - a.avancos)[0]
      : null

  const melhorDiaGanhos =
    rowsComGanhos.length > 0
      ? [...rowsComGanhos].sort((a, b) => b.ganhos - a.ganhos)[0]
      : null

  const melhorDiaFaturamento =
    rowsComGanhos.length > 0
      ? [...rowsComGanhos].sort(
          (a, b) => b.faturamento - a.faturamento,
        )[0]
      : null

  const melhorDiaTicket =
    rowsComTicketConfiavel.length > 0
      ? [...rowsComTicketConfiavel].sort(
          (a, b) => b.ticket_medio - a.ticket_medio,
        )[0]
      : null

  return {
    rows,
    melhor_dia_acoes: melhorDiaAcoes,
    melhor_dia_avancos: melhorDiaAvancos,
    melhor_dia_ganhos: melhorDiaGanhos,
    melhor_dia_faturamento: melhorDiaFaturamento,
    melhor_dia_ticket: melhorDiaTicket,

    total_acoes_comerciais: totalAcoes,
    total_avancos: totalAvancos,
    total_ganhos: totalGanhos,
    total_perdidos: totalPerdidos,
    total_faturamento: totalFaturamento,
    ticket_medio_geral:
      totalGanhos > 0 ? totalFaturamento / totalGanhos : 0,

    diagnostico: buildDiagnostico(
      rows,
      totalAcoes,
      totalGanhos,
      totalFaturamento,
      melhorDiaAcoes,
      melhorDiaAvancos,
      melhorDiaFaturamento,
      melhorDiaTicket,
    ),

    period_start: filters.dateStart,
    period_end: filters.dateEnd,
    semanas_no_periodo: countWeeksInRange(
      filters.dateStart,
      filters.dateEnd,
    ),
  }
}