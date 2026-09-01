import { supabaseBrowser } from '@/app/lib/supabaseBrowser'

const PAGE_SIZE = 1000

export type OfficialRevenueDay = {
  date: string
  value: number
  sourceKind: 'seller' | 'extra'
  sourceId: string
}

type RevenueViewRow = {
  ref_date: string
  real_value: number | string | null
  seller_id?: string | null
  extra_id?: string | null
}

async function fetchRevenueView(params: {
  view: 'v_revenue_daily_seller' | 'v_revenue_daily_extra'
  companyId: string
  dateStart: string
  dateEnd: string
  ownerId?: string | null
}): Promise<RevenueViewRow[]> {
  const supabase = supabaseBrowser()
  const rows: RevenueViewRow[] = []
  let from = 0

  while (true) {
    let query = supabase
      .from(params.view)
      .select(params.view === 'v_revenue_daily_seller'
        ? 'ref_date, real_value, seller_id'
        : 'ref_date, real_value, extra_id')
      .eq('company_id', params.companyId)
      .gte('ref_date', params.dateStart)
      .lte('ref_date', params.dateEnd)
      .order('ref_date', { ascending: true })
      .order(params.view === 'v_revenue_daily_seller' ? 'seller_id' : 'extra_id', {
        ascending: true,
      })
      .range(from, from + PAGE_SIZE - 1)

    if (params.view === 'v_revenue_daily_seller' && params.ownerId) {
      query = query.eq('seller_id', params.ownerId)
    }

    const { data, error } = await query

    if (error) {
      throw new Error(`Erro ao buscar faturamento oficial: ${error.message}`)
    }

    const page = (data ?? []) as RevenueViewRow[]
    rows.push(...page)

    if (page.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return rows
}

export async function getOfficialRevenueDays(params: {
  companyId: string
  ownerId?: string | null
  dateStart: string
  dateEnd: string
  includeExtras?: boolean
}): Promise<OfficialRevenueDay[]> {
  const includeExtras = params.includeExtras ?? !params.ownerId
  const [sellerRows, extraRows] = await Promise.all([
    fetchRevenueView({
      view: 'v_revenue_daily_seller',
      companyId: params.companyId,
      dateStart: params.dateStart,
      dateEnd: params.dateEnd,
      ownerId: params.ownerId,
    }),
    includeExtras
      ? fetchRevenueView({
          view: 'v_revenue_daily_extra',
          companyId: params.companyId,
          dateStart: params.dateStart,
          dateEnd: params.dateEnd,
        })
      : Promise.resolve([]),
  ])

  return [
    ...sellerRows.map((row) => ({
      date: row.ref_date,
      value: Number(row.real_value || 0),
      sourceKind: 'seller' as const,
      sourceId: row.seller_id ?? '',
    })),
    ...extraRows.map((row) => ({
      date: row.ref_date,
      value: Number(row.real_value || 0),
      sourceKind: 'extra' as const,
      sourceId: row.extra_id ?? '',
    })),
  ]
}
