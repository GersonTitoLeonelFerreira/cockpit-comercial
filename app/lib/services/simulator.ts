import { supabaseBrowser } from '../supabaseBrowser'
import {
  SimulatorMetrics,
  SimulatorResult,
  ActiveCompetency,
  SimulatorConfig,
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
  month?: string | null
): Promise<SimulatorMetrics> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase.rpc('rpc_get_sales_cycle_metrics_v1', {
    p_owner_user_id: ownerUserId ?? null,
    p_month: month ?? null,
  })

  if (error) throw error

  return data as SimulatorMetrics
}

export function calculateSimulatorResult(
  metrics: SimulatorMetrics,
  config: SimulatorConfig
): SimulatorResult {
  const { target_wins, close_rate, remaining_business_days } = config

  const { current_wins, worked_count } = metrics

  const remaining_wins = Math.max(0, target_wins - current_wins)
  const needed_worked_cycles = Math.ceil(target_wins / (close_rate || 0.01))
  const remaining_worked_cycles = Math.ceil(remaining_wins / (close_rate || 0.01))

  const BUSINESS_DAYS_IN_MONTH = 22
  const daily_worked_needed = Math.ceil(needed_worked_cycles / BUSINESS_DAYS_IN_MONTH)
  const daily_worked_remaining = Math.ceil(
    remaining_worked_cycles / Math.max(1, remaining_business_days)
  )

  const simulation_15pct = Math.ceil(target_wins / 0.15)
  const simulation_25pct = Math.ceil(target_wins / 0.25)

  const progress_pct = target_wins > 0 ? (current_wins / target_wins) * 100 : 0
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
    progress_pct: Math.round(progress_pct * 100) / 100,
    on_track,
  }
}
