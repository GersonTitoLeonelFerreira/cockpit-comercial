import { supabaseBrowser } from '../supabaseBrowser'
import type {
  ActiveCompetency,
  GroupConversionRow,
  HistoricalTicketResponse,
  RevenueSummaryResponse,
  SimulatorConfig,
  SimulatorMetrics,
  SimulatorResult,
  Theory10020Config,
  Theory10020Result,
} from '../../types/simulator'

export async function getActiveCompetency(): Promise<ActiveCompetency> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase.rpc('rpc_get_active_competency')

  if (error) throw error
  if (!data || data.error) {
    throw new Error(data?.error ?? 'active_competency_not_found')
  }

  return {
    month: data.month,
    month_start: data.month_start,
    month_end: data.month_end,
  }
}

export async function getSalesCycleMetrics(
  ownerUserId?: string | null,
  month?: string | null,
): Promise<SimulatorMetrics> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase.rpc('rpc_get_sales_cycle_metrics_v1', {
    p_owner_user_id: ownerUserId ?? null,
    p_month: month ?? null,
  })

  if (error) throw error

  return data as SimulatorMetrics
}

export type SimulatorPeriodMetricsResponse = {
  success: boolean
  company_id: string
  month: string
  month_start: string
  month_end: string
  owner_user_id: string | null
  current_wins: number
  worked_count: number
  lost_count: number
  total_real: number
  total_open: number
  total_pool: number
  counts_by_status: {
    novo: number
    contato: number
    respondeu: number
    negociacao: number
    ganho: number
    perdido: number
  }
}

export async function getSimulatorPeriodMetrics(
  ownerUserId?: string | null,
): Promise<SimulatorPeriodMetricsResponse> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase.rpc('rpc_get_simulator_period_metrics', {
    p_owner_user_id: ownerUserId ?? null,
  })

  if (error) throw error
  return data as SimulatorPeriodMetricsResponse
}

export type RevenuePeriodSummaryResponse = {
  success: boolean
  competency_id: string
  competency_name: string
  start_date: string
  end_date: string
  owner_user_id: string | null
  worked_count: number
  won_count: number
  lost_count: number
  revenue_total: number
  ticket_medio: number
}

export async function getRevenuePeriodSummary(
  ownerUserId?: string | null,
): Promise<RevenuePeriodSummaryResponse> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase.rpc('rpc_get_revenue_period_summary', {
    p_owner_user_id: ownerUserId ?? null,
  })

  if (error) throw error
  return data as RevenuePeriodSummaryResponse
}

export async function getGroupConversion(params: {
  companyId: string
  ownerId: string | null
  dateStart: string
  dateEnd: string
}): Promise<GroupConversionRow[]> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase.rpc('rpc_simulator_group_conversion', {
    p_company_id: params.companyId,
    p_owner_id: params.ownerId ?? null,
    p_date_start: params.dateStart,
    p_date_end: params.dateEnd,
  })

  if (error) throw error

  return (data ?? []) as GroupConversionRow[]
}

/**
 * Resume faturamento (ou recebimento no futuro) usando a RPC:
 * public.rpc_revenue_summary(p_company_id, p_owner_id, p_start_date, p_end_date, p_metric)
 *
 * - ownerId = null => Empresa (sellers + extras)
 * - ownerId != null => Vendedor (somente seller)
 */
export async function getRevenueSummary(params: {
  companyId: string
  ownerId: string | null
  startDate: string
  endDate: string
  metric: 'faturamento' | 'recebimento'
}): Promise<RevenueSummaryResponse> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase.rpc('rpc_revenue_summary', {
    p_company_id: params.companyId,
    p_owner_id: params.ownerId,
    p_start_date: params.startDate,
    p_end_date: params.endDate,
    p_metric: params.metric,
  })

  if (error) throw error
  return data as RevenueSummaryResponse
}

// ============================================================================
// Metas (goal) - admin define, vendedor só visualiza (RLS controla escrita)
// ============================================================================

export type RevenueGoalResponse = {
  success: boolean
  goal_value: number
  ticket_medio: number
  close_rate_percent: number
  rate_source: 'planejada' | 'real'
}

export async function getRevenueGoal(params: {
  companyId: string
  ownerId: string | null
  startDate: string
  endDate: string
}): Promise<RevenueGoalResponse> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase.rpc('rpc_get_revenue_goal', {
    p_company_id: params.companyId,
    p_owner_id: params.ownerId,
    p_date_start: params.startDate,
    p_date_end: params.endDate,
  })

  if (error) throw error
  return data as RevenueGoalResponse
}

export async function upsertRevenueGoal(params: {
  companyId: string
  ownerId: string | null
  startDate: string
  endDate: string
  goalValue: number
  ticketMedio?: number
  closeRatePercent?: number
  rateSource?: 'planejada' | 'real'
}): Promise<{ success: boolean }> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase.rpc('rpc_upsert_revenue_goal', {
    p_company_id: params.companyId,
    p_owner_id: params.ownerId,
    p_date_start: params.startDate,
    p_date_end: params.endDate,
    p_goal_value: params.goalValue,
    p_ticket_medio: params.ticketMedio ?? 0,
    p_close_rate_percent: params.closeRatePercent ?? 20,
    p_rate_source: params.rateSource ?? 'planejada',
  })

  if (error) throw error
  return data as { success: boolean }
}

export function calculateSimulatorResult(
  metrics: SimulatorMetrics,
  config: SimulatorConfig,
): SimulatorResult {
  const { target_wins, close_rate, remaining_business_days } = config

  const { current_wins, worked_count } = metrics

  const remaining_wins = Math.max(0, target_wins - current_wins)
  const needed_worked_cycles = Math.ceil(target_wins / (close_rate || 0.01))
  const remaining_worked_cycles = Math.ceil(remaining_wins / (close_rate || 0.01))

  const BUSINESS_DAYS_IN_MONTH = 22
  const daily_worked_needed = Math.ceil(needed_worked_cycles / BUSINESS_DAYS_IN_MONTH)
  const daily_worked_remaining = Math.ceil(
    remaining_worked_cycles / Math.max(1, remaining_business_days),
  )

  const simulation_15pct = Math.ceil(target_wins / 0.15)
  const simulation_25pct = Math.ceil(target_wins / 0.25)

  const progress_pct = target_wins > 0 ? current_wins / target_wins : 0
  const current_rate = worked_count > 0 ? current_wins / worked_count : 0
  const on_track = current_rate >= close_rate

  return {
    needed_wins: target_wins,
    remaining_wins,
    needed_worked_cycles,
    remaining_worked_cycles,
    daily_worked_needed,
    daily_worked_remaining,
    simulation_15pct,
    simulation_25pct,
    progress_pct,
    on_track,
  }
}

// ==============================================================================
// Teoria 100/20 — Cálculo para modo faturamento
// ==============================================================================

export function calculateTheory10020(config: Theory10020Config): Theory10020Result {
  const {
    meta_total,
    ticket_medio,
    close_rate,
    remaining_business_days,
    total_real,
  } = config

  const safeMeta = Math.max(0, meta_total || 0)
  const safeTicket = Math.max(0, ticket_medio || 0)
  const safeRate = Math.min(1, Math.max(0, close_rate || 0))
  const safeDays = Math.max(0, remaining_business_days || 0)
  const safeReal = Math.max(0, total_real || 0)

  const multiplicador = safeRate > 0 ? 1 / safeRate : 0
  const esforco_bruto = safeMeta * multiplicador
  const garantia_minima = safeMeta * 0.2

  const leads_para_contatar = safeTicket > 0 ? Math.ceil(esforco_bruto / safeTicket) : 0
  const ganhos_esperados = Math.ceil(leads_para_contatar * safeRate)

  const leads_por_dia = safeDays > 0 ? Math.ceil(leads_para_contatar / safeDays) : leads_para_contatar
  const ganhos_por_dia = safeDays > 0 ? Math.ceil(ganhos_esperados / safeDays) : ganhos_esperados

  const gap = Math.max(0, safeMeta - safeReal)
  const meta_atingida = safeReal >= safeMeta && safeMeta > 0

  const esforco_bruto_restante = gap * multiplicador
  const leads_restantes = safeTicket > 0 ? Math.ceil(esforco_bruto_restante / safeTicket) : 0
  const ganhos_restantes = Math.ceil(leads_restantes * safeRate)

  const leads_restantes_por_dia = safeDays > 0 ? Math.ceil(leads_restantes / safeDays) : leads_restantes
  const ganhos_restantes_por_dia = safeDays > 0 ? Math.ceil(ganhos_restantes / safeDays) : ganhos_restantes

  const progress_pct = safeMeta > 0 ? safeReal / safeMeta : 0

  const vendas_necessarias = safeTicket > 0 ? Math.ceil(safeMeta / safeTicket) : 0
  const ciclos_trabalhados_necessarios = safeRate > 0 ? Math.ceil(vendas_necessarias / safeRate) : 0
  const ciclos_por_dia = safeDays > 0
    ? Math.ceil(ciclos_trabalhados_necessarios / safeDays)
    : ciclos_trabalhados_necessarios

  const vendas_restantes = safeTicket > 0 ? Math.ceil(gap / safeTicket) : 0
  const ciclos_restantes = safeRate > 0 ? Math.ceil(vendas_restantes / safeRate) : 0
  const ciclos_restantes_por_dia = safeDays > 0 ? Math.ceil(ciclos_restantes / safeDays) : ciclos_restantes

  return {
    meta_total: safeMeta,
    multiplicador,
    esforco_bruto,
    garantia_minima,
    ticket_medio: safeTicket,
    close_rate: safeRate,
    leads_para_contatar,
    ganhos_esperados,
    leads_por_dia,
    ganhos_por_dia,
    remaining_business_days: safeDays,
    total_real: safeReal,
    gap,
    leads_restantes,
    ganhos_restantes,
    leads_restantes_por_dia,
    ganhos_restantes_por_dia,
    meta_atingida,
    progress_pct,
    vendas_necessarias,
    ciclos_trabalhados_necessarios,
    ciclos_por_dia,
    vendas_restantes,
    ciclos_restantes,
    ciclos_restantes_por_dia,
  }
}

// ==============================================================================
// Ticket Médio Histórico — query direta em sales_cycles
// ==============================================================================

const MIN_SAMPLE_SIZE = 5

export async function getHistoricalTicket(params: {
  companyId: string
  ownerId: string | null
  dateStart: string
  dateEnd: string
}): Promise<HistoricalTicketResponse> {
  const supabase = supabaseBrowser()

  const periodResult = await queryTicket(
    supabase,
    params.companyId,
    params.ownerId,
    params.dateStart,
    params.dateEnd,
  )

  if (periodResult.sample_size >= MIN_SAMPLE_SIZE) {
    return {
      ...periodResult,
      source_window: 'period',
      fallback_level: 'period',
      is_sufficient: true,
      owner_id: params.ownerId,
      date_start: params.dateStart,
      date_end: params.dateEnd,
    }
  }

  const today = new Date()
  const d90ago = new Date(today)
  d90ago.setDate(d90ago.getDate() - 90)
  const fallbackStart = d90ago.toISOString().split('T')[0]
  const fallbackEnd = today.toISOString().split('T')[0]

  const fallbackResult = await queryTicket(
    supabase,
    params.companyId,
    params.ownerId,
    fallbackStart,
    fallbackEnd,
  )

  if (fallbackResult.sample_size >= MIN_SAMPLE_SIZE) {
    return {
      ...fallbackResult,
      source_window: 'last_90_days',
      fallback_level: 'last_90_days',
      is_sufficient: true,
      owner_id: params.ownerId,
      date_start: fallbackStart,
      date_end: fallbackEnd,
    }
  }

  if (params.ownerId) {
    const companyFallback = await queryTicket(
      supabase,
      params.companyId,
      null,
      fallbackStart,
      fallbackEnd,
    )

    if (companyFallback.sample_size >= MIN_SAMPLE_SIZE) {
      return {
        ...companyFallback,
        source_window: 'last_90_days',
        fallback_level: 'last_90_days',
        is_sufficient: true,
        owner_id: null,
        date_start: fallbackStart,
        date_end: fallbackEnd,
      }
    }
  }

  return {
    ticket_medio: 0,
    sample_size: 0,
    total_won: 0,
    source_window: 'last_90_days',
    fallback_level: 'insufficient',
    is_sufficient: false,
    owner_id: params.ownerId,
    date_start: fallbackStart,
    date_end: fallbackEnd,
  }
}

async function queryTicket(
  supabase: ReturnType<typeof supabaseBrowser>,
  companyId: string,
  ownerId: string | null,
  dateStart: string,
  dateEnd: string,
): Promise<{ ticket_medio: number; sample_size: number; total_won: number }> {
  let query = supabase
    .from('sales_cycles')
    .select('won_total')
    .eq('company_id', companyId)
    .eq('status', 'ganho')
    .gt('won_total', 0)
    .gte('won_at', dateStart)
    .lte('won_at', `${dateEnd}T23:59:59`)

  if (ownerId) {
    query = query.eq('owner_user_id', ownerId)
  }

  const { data, error } = await query

  if (error) {
    console.warn('Erro ao buscar ticket histórico:', error.message)
    return { ticket_medio: 0, sample_size: 0, total_won: 0 }
  }

  const rows = (data ?? []) as Array<{ won_total: number }>
  const validRows = rows.filter((r) => r.won_total > 0)
  const sample_size = validRows.length
  const total_won = validRows.reduce((acc, r) => acc + Number(r.won_total), 0)
  const ticket_medio = sample_size > 0 ? Math.round(total_won / sample_size) : 0

  return { ticket_medio, sample_size, total_won }
}