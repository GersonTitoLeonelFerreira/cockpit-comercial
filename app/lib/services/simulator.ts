import { supabaseBrowser } from '../supabaseBrowser'
import type {
  ActiveCompetency,
  GroupConversionRow,
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
}): Promise<{ success: boolean }> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase.rpc('rpc_upsert_revenue_goal', {
    p_company_id: params.companyId,
    p_owner_id: params.ownerId,
    p_date_start: params.startDate,
    p_date_end: params.endDate,
    p_goal_value: params.goalValue,
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

  // Safe defaults
  const safeMeta = Math.max(0, meta_total || 0)
  const safeTicket = Math.max(0, ticket_medio || 0)
  const safeRate = Math.min(1, Math.max(0, close_rate || 0))
  const safeDays = Math.max(0, remaining_business_days || 0)
  const safeReal = Math.max(0, total_real || 0)

  const garantia_minima = safeMeta * 0.20

  // Vendas necessarias (total)
  const vendas_necessarias = safeTicket > 0
    ? Math.ceil(safeMeta / safeTicket)
    : 0

  // Ciclos trabalhados necessarios (total)
  const ciclos_trabalhados_necessarios = safeRate > 0
    ? Math.ceil(vendas_necessarias / safeRate)
    : 0

  // Ciclos por dia (total)
  const ciclos_por_dia = safeDays > 0
    ? Math.ceil(ciclos_trabalhados_necessarios / safeDays)
    : ciclos_trabalhados_necessarios

  // Gap e restantes
  const gap = Math.max(0, safeMeta - safeReal)
  const meta_atingida = safeReal >= safeMeta && safeMeta > 0

  const vendas_restantes = safeTicket > 0
    ? Math.ceil(gap / safeTicket)
    : 0

  const ciclos_restantes = safeRate > 0
    ? Math.ceil(vendas_restantes / safeRate)
    : 0

  const ciclos_restantes_por_dia = safeDays > 0
    ? Math.ceil(ciclos_restantes / safeDays)
    : ciclos_restantes

  const progress_pct = safeMeta > 0 ? safeReal / safeMeta : 0

  return {
    meta_total: safeMeta,
    garantia_minima,
    ticket_medio: safeTicket,
    close_rate: safeRate,
    vendas_necessarias,
    ciclos_trabalhados_necessarios,
    ciclos_por_dia,
    remaining_business_days: safeDays,
    total_real: safeReal,
    gap,
    vendas_restantes,
    ciclos_restantes,
    ciclos_restantes_por_dia,
    meta_atingida,
    progress_pct,
  }
}