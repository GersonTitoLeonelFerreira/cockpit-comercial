import { supabaseBrowser } from '../supabaseBrowser'
import { CloseRateRealResponse } from '../../types/simulatorRateReal'

export async function getCloseRateReal(
  ownerUserId: string | null = null,
  daysWindow: number = 90
): Promise<CloseRateRealResponse> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase.rpc('rpc_get_close_rate_real', {
    p_owner_user_id: ownerUserId,
    p_days_window: daysWindow,
  })

  if (error) {
    console.warn('getCloseRateReal error:', error)
    throw error
  }

  return data as CloseRateRealResponse
}

/**
 * Converte decimal rate (0.2) para percent (20)
 */
export function rateToPercent(rate: number | null): number | null {
  if (rate === null || rate === undefined) return null
  if (rate <= 1) return rate * 100
  return rate // já em percent
}

/**
 * Converte percent (20) para decimal (0.2)
 */
export function percentToRate(percent: number): number {
  if (percent <= 0) return 0.01
  if (percent > 100) return 1
  return percent / 100
}