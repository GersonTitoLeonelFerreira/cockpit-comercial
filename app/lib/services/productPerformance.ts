// ==============================================================================
// Service: Performance por Produto
//
// Fonte oficial:
// - sales_cycles.status = ganho
// - Receita por revenue_seller_ref_date -> won_at -> closed_at
// - Responsável da venda por won_owner_user_id
// - Produto por sales_cycles.product_id
//
// Não existe "conversão por produto" neste relatório.
// O produto normalmente só é registrado no fechamento, então não há base confiável
// de ciclos abertos e perdidos por produto.
// ==============================================================================

import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import type {
  ProductPerformanceFilters,
  ProductPerformanceRow,
  ProductPerformanceSummary,
} from '@/app/types/productPerformance'

type WonCycleRow = {
  id: string
  product_id: string | null
  won_total: number | string | null
  won_owner_user_id: string | null
  won_at: string | null
  closed_at: string | null
  revenue_seller_ref_date: string | null
}

type ProductRow = {
  id: string
  name: string
  category: string | null
}

const PAGE_SIZE = 1000
const REPORT_TIME_ZONE = 'America/Sao_Paulo'

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
    timeZone: REPORT_TIME_ZONE,
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

function getRevenueReferenceDate(cycle: WonCycleRow): string | null {
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

async function fetchAllWonCycles(companyId: string): Promise<WonCycleRow[]> {
  const supabase = supabaseBrowser()

  const rows: WonCycleRow[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('sales_cycles')
      .select(
        'id, product_id, won_total, won_owner_user_id, won_at, closed_at, revenue_seller_ref_date',
      )
      .eq('company_id', companyId)
      .eq('status', 'ganho')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)

    if (error) {
      throw new Error(`Erro ao buscar vendas ganhas: ${error.message}`)
    }

    const page = (data ?? []) as WonCycleRow[]

    rows.push(...page)

    if (page.length < PAGE_SIZE) {
      break
    }

    from += PAGE_SIZE
  }

  return rows
}

export async function getProductPerformance(
  filters: ProductPerformanceFilters,
): Promise<ProductPerformanceSummary> {
  const supabase = supabaseBrowser()

  const [wonCycles, productsResponse] = await Promise.all([
    fetchAllWonCycles(filters.companyId),
    supabase
      .from('products')
      .select('id, name, category')
      .eq('company_id', filters.companyId),
  ])

  if (productsResponse.error) {
    throw new Error(
      `Erro ao buscar produtos da empresa: ${productsResponse.error.message}`,
    )
  }

  const productsById = new Map(
    ((productsResponse.data ?? []) as ProductRow[]).map((product) => [
      product.id,
      product,
    ]),
  )

  const grouped = new Map<
    string,
    {
      productId: string | null
      totalGanhos: number
      totalFaturamento: number
    }
  >()

  for (const cycle of wonCycles) {
    const revenueDate = getRevenueReferenceDate(cycle)

    if (!isInRange(revenueDate, filters.dateStart, filters.dateEnd)) {
      continue
    }

    if (
      filters.ownerId &&
      cycle.won_owner_user_id !== filters.ownerId
    ) {
      continue
    }

    const key = cycle.product_id ?? '__unlinked__'

    const current = grouped.get(key) ?? {
      productId: cycle.product_id,
      totalGanhos: 0,
      totalFaturamento: 0,
    }

    current.totalGanhos += 1
    current.totalFaturamento += toNumber(cycle.won_total)

    grouped.set(key, current)
  }

  const totalGanhos = Array.from(grouped.values()).reduce(
    (sum, item) => sum + item.totalGanhos,
    0,
  )

  const totalFaturamento = Array.from(grouped.values()).reduce(
    (sum, item) => sum + item.totalFaturamento,
    0,
  )

  const rows: ProductPerformanceRow[] = Array.from(grouped.values())
    .map((item) => {
      const product = item.productId
        ? productsById.get(item.productId)
        : null

      const productName = item.productId
        ? product?.name ?? 'Produto removido'
        : 'Sem produto vinculado'

      return {
        product_id: item.productId,
        product_name: productName,
        product_category: product?.category ?? null,
        total_ganhos: item.totalGanhos,
        total_faturamento: item.totalFaturamento,
        ticket_medio:
          item.totalGanhos > 0
            ? item.totalFaturamento / item.totalGanhos
            : 0,
        pct_faturamento:
          totalFaturamento > 0
            ? item.totalFaturamento / totalFaturamento
            : 0,
        pct_volume:
          totalGanhos > 0
            ? item.totalGanhos / totalGanhos
            : 0,
      }
    })
    .sort((a, b) => b.total_faturamento - a.total_faturamento)

  const linkedRows = rows.filter((row) => row.product_id !== null)

  const melhorFaturamento = linkedRows[0] ?? null

  const melhorVolume =
    linkedRows.length > 0
      ? [...linkedRows].sort(
          (a, b) => b.total_ganhos - a.total_ganhos,
        )[0]
      : null

  const melhorTicket =
    linkedRows
      .filter((row) => row.total_ganhos >= 3)
      .sort((a, b) => b.ticket_medio - a.ticket_medio)[0] ?? null

  return {
    rows,
    totals: {
      total_ganhos: totalGanhos,
      total_faturamento: totalFaturamento,
      ticket_medio_geral:
        totalGanhos > 0
          ? totalFaturamento / totalGanhos
          : 0,
    },
    melhor_ticket: melhorTicket,
    melhor_faturamento: melhorFaturamento,
    melhor_volume: melhorVolume,
    has_unlinked_sales: rows.some((row) => row.product_id === null),
    filters_applied: filters,
  }
}