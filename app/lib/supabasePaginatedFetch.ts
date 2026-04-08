import { SupabaseClient } from '@supabase/supabase-js'

const PAGE_SIZE = 1000

/**
 * Fetches all rows from `cycle_events` for a given company and date range,
 * paginating automatically in batches of 1000 to bypass Supabase's default
 * row-limit cap. Returns the full combined array without silent truncation.
 */
export async function fetchAllCycleEvents(
  supabase: SupabaseClient,
  params: {
    companyId: string
    dateStart: string  // YYYY-MM-DD
    dateEnd: string    // YYYY-MM-DD
    sellerId?: string | null
    columns?: string
    orderBy?: string
    ascending?: boolean
  },
): Promise<any[]> {
  const {
    companyId,
    dateStart,
    dateEnd,
    sellerId,
    columns = 'id, event_type, metadata, created_by, occurred_at',
    orderBy = 'occurred_at',
    ascending = true,
  } = params

  const all: any[] = []
  let from = 0

  while (true) {
    let query = supabase
      .from('cycle_events')
      .select(columns)
      .eq('company_id', companyId)
      .gte('occurred_at', `${dateStart}T00:00:00`)
      .lte('occurred_at', `${dateEnd}T23:59:59`)
      .order(orderBy, { ascending })
      .range(from, from + PAGE_SIZE - 1)

    if (sellerId) {
      query = query.eq('created_by', sellerId)
    }

    const { data, error } = await query

    if (error) throw error

    const rows = data ?? []
    all.push(...rows)

    if (rows.length < PAGE_SIZE) break

    from += PAGE_SIZE
  }

  return all
}
