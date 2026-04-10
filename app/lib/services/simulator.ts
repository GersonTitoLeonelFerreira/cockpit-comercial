import { supabaseBrowser } from '../supabaseBrowser'
import type {
  ActiveCompetency,
  GroupConversionRow,
  HistoricalTicketResponse,
  RevenueSummaryResponse,
  SimulatorConfig,
  SimulatorMetrics,
  SimulatorResult,
  TicketFallbackLevel,
  Theory10020Config,
  Theory10020Result,
} from '../../types/simulator'

export async function getActiveCompetency(): Promise<ActiveCompetency> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase.rpc('rpc_get_active_competency')

  if (error) throw error

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
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
  metric: 'faturamento' | 'recebimento'
}): Promise<RevenueSummaryResponse> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase.rpc('rpc_revenue_summary', {
    p_company_id: params.companyId,
    p_owner_id: params.ownerId, // ✅ nome certo da RPC (p_owner_id)
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
}

export async function getRevenueGoal(params: {
  companyId: string
  ownerId: string | null
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
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
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
  goalValue: number
  ticketMedio?: number
}): Promise<{ success: boolean }> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase.rpc('rpc_upsert_revenue_goal', {
    p_company_id: params.companyId,
    p_owner_id: params.ownerId,
    p_date_start: params.startDate,
    p_date_end: params.endDate,
    p_goal_value: params.goalValue,
    p_ticket_medio: params.ticketMedio ?? 0,
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
  const daily_worked_remaining = Math.ceil(remaining_worked_cycles / Math.max(1, remaining_business_days))

  const simulation_15pct = Math.ceil(target_wins / 0.15)
  const simulation_25pct = Math.ceil(target_wins / 0.25)

  // pct: você usa na UI como (v * 100)
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

  // TEORIA 100/20 — CORRECT LADDER
  // Dynamic multiplier: 1 / taxa_decimal (e.g. 20% → ×5, 15% → ×6.67, 25% → ×4)
  // When safeRate is 0 (invalid input), multiplicador is 0 and all downstream values are 0.
  // The UI enforces rate >= 1% (min="1"), so this only occurs in edge cases.
  const multiplicador = safeRate > 0 ? (1 / safeRate) : 0

  // Step 1: Gross effort = meta × multiplicador
  const esforco_bruto = safeMeta * multiplicador

  // Step 2: Minimum guarantee (20% of meta) — informational
  const garantia_minima = safeMeta * 0.20

  // Step 3: Leads to contact = gross effort / average ticket
  const leads_para_contatar = safeTicket > 0
    ? Math.ceil(esforco_bruto / safeTicket)
    : 0

  // Step 4: Expected wins = leads × conversion rate (MULTIPLY, not divide!)
  const ganhos_esperados = Math.ceil(leads_para_contatar * safeRate)

  // Step 5: Per business day
  const leads_por_dia = safeDays > 0
    ? Math.ceil(leads_para_contatar / safeDays)
    : leads_para_contatar

  const ganhos_por_dia = safeDays > 0
    ? Math.ceil(ganhos_esperados / safeDays)
    : ganhos_esperados

  // Gap and remaining (against the ORIGINAL META)
  const gap = Math.max(0, safeMeta - safeReal)
  const meta_atingida = safeReal >= safeMeta && safeMeta > 0

  // Remaining: same ladder logic applied to gap
  // esforco_bruto_restante = gap × multiplicador
  // leads_restantes = esforco_bruto_restante / ticket_medio
  // ganhos_restantes = leads_restantes × close_rate
  const esforco_bruto_restante = gap * multiplicador
  const leads_restantes = safeTicket > 0
    ? Math.ceil(esforco_bruto_restante / safeTicket)
    : 0

  const ganhos_restantes = Math.ceil(leads_restantes * safeRate)

  const leads_restantes_por_dia = safeDays > 0
    ? Math.ceil(leads_restantes / safeDays)
    : leads_restantes

  const ganhos_restantes_por_dia = safeDays > 0
    ? Math.ceil(ganhos_restantes / safeDays)
    : ganhos_restantes

  const progress_pct = safeMeta > 0 ? safeReal / safeMeta : 0

  // ---- Campos nomenclatura Teoria 100/20 (spec-compliant) ----
  // vendas_necessarias: quantas vendas (fechamentos) são necessárias para atingir a meta
  const vendas_necessarias = safeTicket > 0
    ? Math.ceil(safeMeta / safeTicket)
    : 0

  // ciclos_trabalhados_necessarios: quantos ciclos de trabalho (contatos) são necessários
  const ciclos_trabalhados_necessarios = safeRate > 0
    ? Math.ceil(vendas_necessarias / safeRate)
    : 0

  // ciclos_por_dia: ciclos de trabalho por dia útil restante
  const ciclos_por_dia = safeDays > 0
    ? Math.ceil(ciclos_trabalhados_necessarios / safeDays)
    : ciclos_trabalhados_necessarios

  // vendas_restantes: quantas vendas ainda faltam para fechar o gap
  const vendas_restantes = safeTicket > 0
    ? Math.ceil(gap / safeTicket)
    : 0

  // ciclos_restantes: ciclos de trabalho necessários para fechar o gap
  const ciclos_restantes = safeRate > 0
    ? Math.ceil(vendas_restantes / safeRate)
    : 0

  // ciclos_restantes_por_dia: ciclos restantes por dia útil restante
  const ciclos_restantes_por_dia = safeDays > 0
    ? Math.ceil(ciclos_restantes / safeDays)
    : ciclos_restantes

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
  ownerId: string | null       // null = empresa toda
  dateStart: string            // YYYY-MM-DD (início da competência)
  dateEnd: string              // YYYY-MM-DD (fim da competência)
}): Promise<HistoricalTicketResponse> {
  const supabase = supabaseBrowser()

  // ---- Attempt 1: within the competency period ----
  const periodResult = await queryTicket(supabase, params.companyId, params.ownerId, params.dateStart, params.dateEnd)

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

  // ---- Attempt 2: last 90 days from today ----
  const today = new Date()
  const d90ago = new Date(today)
  d90ago.setDate(d90ago.getDate() - 90)
  const fallbackStart = d90ago.toISOString().split('T')[0]
  const fallbackEnd = today.toISOString().split('T')[0]

  const fallbackResult = await queryTicket(supabase, params.companyId, params.ownerId, fallbackStart, fallbackEnd)

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

  // ---- Attempt 3: last 90 days, company-wide (if ownerId was set) ----
  if (params.ownerId) {
    const companyFallback = await queryTicket(supabase, params.companyId, null, fallbackStart, fallbackEnd)

    if (companyFallback.sample_size >= MIN_SAMPLE_SIZE) {
      return {
        ...companyFallback,
        source_window: 'last_90_days',
        fallback_level: 'last_90_days',
        is_sufficient: true,
        owner_id: null, // fell back to company
        date_start: fallbackStart,
        date_end: fallbackEnd,
      }
    }
  }

  // ---- Insufficient ----
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
  supabase: any,
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
    .lte('won_at', dateEnd + 'T23:59:59')

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