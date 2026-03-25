// ==============================================================================
// Service: Performance por Produto — Fase 5.4
//
// NOTA SOBRE CONVERSÃO:
// O campo product_id em sales_cycles só é preenchido quando o ciclo é marcado
// como ganho (via WinDealModal). Ciclos em andamento ou perdidos normalmente
// NÃO têm product_id. Portanto, a "conversão por produto" calculada aqui é:
//   ganhos com produto X / total de ciclos que têm produto X registrado
// Isso mede distribuição de produtos nos ganhos, NÃO uma conversão real de
// funil completo. A métrica é marcada como não confiável quando base < 5.
// ==============================================================================

import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import type {
  ProductPerformanceFilters,
  ProductPerformanceRow,
  ProductPerformanceSummary,
} from '@/app/types/productPerformance'
import type { Product } from '@/app/types/product'

// Ciclo ganho com os campos necessários para a agregação
interface WonCycleRow {
  id: string
  product_id: string | null
  won_total: number | null
  won_owner_user_id: string | null
}

// Contagem de ciclos por product_id (qualquer status)
interface CycleCountRow {
  product_id: string
  count: number
}

export async function getProductPerformance(
  filters: ProductPerformanceFilters
): Promise<ProductPerformanceSummary> {
  const supabase = supabaseBrowser()

  const dateStartIso = filters.dateStart + 'T00:00:00.000Z'
  const dateEndIso = filters.dateEnd + 'T23:59:59.999Z'

  // 1) Buscar ciclos ganhos no período
  let wonQuery = supabase
    .from('sales_cycles')
    .select('id, product_id, won_total, won_owner_user_id')
    .eq('company_id', filters.companyId)
    .eq('status', 'ganho')
    .gte('won_at', dateStartIso)
    .lte('won_at', dateEndIso)

  if (filters.ownerId) {
    wonQuery = wonQuery.eq('won_owner_user_id', filters.ownerId)
  }

  const { data: wonData, error: wonError } = await wonQuery

  if (wonError) {
    throw new Error(`Erro ao buscar ciclos ganhos: ${wonError.message}`)
  }

  const wonCycles: WonCycleRow[] = (wonData ?? []).map((r: any) => ({
    id: String(r.id),
    product_id: r.product_id ?? null,
    won_total: r.won_total != null ? Number(r.won_total) : null,
    won_owner_user_id: r.won_owner_user_id ?? null,
  }))

  // 2) Buscar produtos ativos da empresa para resolver nomes
  const { data: productsData, error: productsError } = await supabase
    .from('products')
    .select('id, name, category')
    .eq('company_id', filters.companyId)
    .eq('active', true)

  if (productsError) {
    throw new Error(`Erro ao buscar produtos: ${productsError.message}`)
  }

  const productsMap = new Map<string, Pick<Product, 'name' | 'category'>>()
  for (const p of productsData ?? []) {
    productsMap.set(String(p.id), { name: p.name, category: p.category ?? null })
  }

  // 3) Buscar contagem de TODOS os ciclos com product_id definido no período
  //    (usado como denominador para a métrica de conversão)
  //    Filtramos por created_at para pegar o mesmo período.
  //    NOTA: Se ownerId estiver definido, aplicamos o mesmo filtro por owner_user_id
  //    para manter consistência da base.
  let countQuery = supabase
    .from('sales_cycles')
    .select('product_id')
    .eq('company_id', filters.companyId)
    .not('product_id', 'is', null)
    .gte('created_at', dateStartIso)
    .lte('created_at', dateEndIso)

  if (filters.ownerId) {
    countQuery = countQuery.eq('owner_user_id', filters.ownerId)
  }

  const { data: countData, error: countError } = await countQuery

  if (countError) {
    throw new Error(`Erro ao buscar contagem de ciclos por produto: ${countError.message}`)
  }

  // Agregar contagens por product_id
  const cycleCountByProduct = new Map<string, number>()
  for (const r of countData ?? []) {
    const pid = String(r.product_id)
    cycleCountByProduct.set(pid, (cycleCountByProduct.get(pid) ?? 0) + 1)
  }

  // 4) Agregar ciclos ganhos por product_id
  interface Agg {
    total_ganhos: number
    total_faturamento: number
  }

  const aggMap = new Map<string | null, Agg>()

  for (const cycle of wonCycles) {
    const key = cycle.product_id  // null for unlinked
    const existing = aggMap.get(key)
    const faturamento = cycle.won_total ?? 0

    if (existing) {
      existing.total_ganhos += 1
      existing.total_faturamento += faturamento
    } else {
      aggMap.set(key, { total_ganhos: 1, total_faturamento: faturamento })
    }
  }

  // 5) Calcular totais globais
  let grand_total_ganhos = 0
  let grand_total_faturamento = 0

  for (const agg of aggMap.values()) {
    grand_total_ganhos += agg.total_ganhos
    grand_total_faturamento += agg.total_faturamento
  }

  const ticket_medio_geral =
    grand_total_ganhos > 0 ? grand_total_faturamento / grand_total_ganhos : 0

  // 6) Construir linhas da tabela
  const rows: ProductPerformanceRow[] = []

  for (const [product_id, agg] of aggMap.entries()) {
    const product = product_id ? productsMap.get(product_id) : null
    const product_name = product_id
      ? (product?.name ?? 'Produto removido')
      : 'Sem produto vinculado'
    const product_category = product?.category ?? null

    const ticket_medio =
      agg.total_ganhos > 0 ? agg.total_faturamento / agg.total_ganhos : 0

    const pct_faturamento =
      grand_total_faturamento > 0 ? agg.total_faturamento / grand_total_faturamento : 0

    const pct_volume =
      grand_total_ganhos > 0 ? agg.total_ganhos / grand_total_ganhos : 0

    // Conversão: só calculável para product_id definido
    const total_ciclos_produto = product_id
      ? (cycleCountByProduct.get(product_id) ?? agg.total_ganhos)
      : agg.total_ganhos  // sem product_id, base = próprios ganhos

    const conversao_produto =
      total_ciclos_produto > 0 ? agg.total_ganhos / total_ciclos_produto : 0

    const conversao_confiavel = product_id !== null && total_ciclos_produto >= 5

    rows.push({
      product_id,
      product_name,
      product_category,
      total_ganhos: agg.total_ganhos,
      total_faturamento: agg.total_faturamento,
      ticket_medio,
      pct_faturamento,
      pct_volume,
      total_ciclos_produto,
      conversao_produto,
      conversao_confiavel,
    })
  }

  // Ordenar por faturamento desc (padrão)
  rows.sort((a, b) => b.total_faturamento - a.total_faturamento)

  // 7) KPIs de destaque (somente linhas com product_id definido para evitar
  //    que "Sem produto vinculado" apareça como destaque)
  const linkedRows = rows.filter((r) => r.product_id !== null)

  const melhor_ticket =
    linkedRows.length > 0
      ? linkedRows.reduce((best, r) =>
          r.ticket_medio > best.ticket_medio ? r : best
        )
      : null

  const melhor_faturamento =
    linkedRows.length > 0
      ? linkedRows.reduce((best, r) =>
          r.total_faturamento > best.total_faturamento ? r : best
        )
      : null

  const melhor_volume =
    linkedRows.length > 0
      ? linkedRows.reduce((best, r) =>
          r.total_ganhos > best.total_ganhos ? r : best
        )
      : null

  const confiavelRows = linkedRows.filter((r) => r.conversao_confiavel)
  const melhor_conversao =
    confiavelRows.length > 0
      ? confiavelRows.reduce((best, r) =>
          r.conversao_produto > best.conversao_produto ? r : best
        )
      : null

  const has_unlinked_sales = aggMap.has(null)

  return {
    rows,
    totals: {
      total_ganhos: grand_total_ganhos,
      total_faturamento: grand_total_faturamento,
      ticket_medio_geral,
    },
    melhor_ticket,
    melhor_faturamento,
    melhor_volume,
    melhor_conversao,
    has_unlinked_sales,
    filters_applied: filters,
  }
}
