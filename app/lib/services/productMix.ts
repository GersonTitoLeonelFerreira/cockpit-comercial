// ==============================================================================
// Service: Mix Comercial — Fase 5.5
//
// Calcula o mix real de produtos para um período/vendedor, incluindo:
//   - participação de cada produto no faturamento e volume
//   - ticket médio ponderado pelo mix (peso = pct_faturamento)
//   - concentração do mix (top 3)
//   - líderes de faturamento e volume
//   - diagnóstico em linguagem natural
//
// TICKET MÉDIO PONDERADO:
//   ticket_ponderado = Σ(ticket_medio_i * peso_mix_i)
//   onde peso_mix_i = pct_faturamento_i
//   Matematicamente equivale a total_faturamento / total_ganhos (ticket global),
//   mas calculado via fórmula ponderada para ser explícito e auditável, e para
//   preparar o simulador para trabalhar com pesos customizados no futuro.
// ==============================================================================

import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import type {
  ProductMixFilters,
  ProductMixRow,
  ProductMixSummary,
} from '@/app/types/productMix'

interface WonCycleRaw {
  product_id: string | null
  won_total: number | null
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function buildDiagnostico(
  rows: ProductMixRow[],
  top3Pct: number,
  concentracaoLabel: string,
  ticketPonderado: number,
  liderFaturamento: ProductMixRow | null,
  liderVolume: ProductMixRow | null,
  totalGanhos: number
): string {
  if (totalGanhos === 0) {
    return 'Nenhum ganho registrado no período. Não há mix comercial para analisar.'
  }

  const linkedRows = rows.filter((r) => r.product_id !== null)

  if (linkedRows.length === 0) {
    return `Foram registrados ${totalGanhos} ganho(s) no período, mas nenhum com produto vinculado. Para obter análise do mix comercial, vincule produtos ao registrar vendas ganhas.`
  }

  if (linkedRows.length === 1) {
    const p = linkedRows[0]
    return `O mix do período é composto exclusivamente por ${p.product_name}, com ${p.total_ganhos} ganho(s) e faturamento de ${formatBRL(p.total_faturamento)}. O ticket médio ponderado do período é ${formatBRL(ticketPonderado)}.`
  }

  const top3 = linkedRows.slice(0, 3)
  const top3Names = top3.map((r) => r.product_name).join(', ')
  const top3PctStr = (top3Pct * 100).toFixed(1) + '%'

  let text = `O mix atual é ${concentracaoLabel === 'Alta' ? 'concentrado' : concentracaoLabel === 'Moderada' ? 'moderadamente concentrado' : 'diversificado'} em ${top3Names}, que representam ${top3PctStr} do faturamento.`
  text += ` O ticket médio ponderado do período é ${formatBRL(ticketPonderado)}.`

  if (liderFaturamento && liderVolume) {
    if (liderFaturamento.product_id === liderVolume.product_id) {
      text += ` ${liderFaturamento.product_name} lidera tanto em faturamento quanto em volume de ganhos.`
    } else {
      text += ` ${liderFaturamento.product_name} lidera em faturamento, enquanto ${liderVolume.product_name} lidera em volume.`
    }
  } else if (liderFaturamento) {
    text += ` ${liderFaturamento.product_name} lidera em faturamento.`
  } else if (liderVolume) {
    text += ` ${liderVolume.product_name} lidera em volume.`
  }

  return text
}

export async function getProductMix(filters: ProductMixFilters): Promise<ProductMixSummary> {
  const supabase = supabaseBrowser()

  const dateStartIso = filters.dateStart + 'T00:00:00.000Z'
  const dateEndIso = filters.dateEnd + 'T23:59:59.999Z'

  // 1) Buscar ciclos ganhos com won_total > 0 no período
  let wonQuery = supabase
    .from('sales_cycles')
    .select('product_id, won_total')
    .eq('company_id', filters.companyId)
    .eq('status', 'ganho')
    .gt('won_total', 0)
    .gte('won_at', dateStartIso)
    .lte('won_at', dateEndIso)

  if (filters.ownerId) {
    wonQuery = wonQuery.eq('won_owner_user_id', filters.ownerId)
  }

  const { data: wonData, error: wonError } = await wonQuery

  if (wonError) {
    throw new Error(`Erro ao buscar ciclos ganhos: ${wonError.message}`)
  }

  const wonCycles: WonCycleRaw[] = (wonData ?? []).map((r: Record<string, unknown>) => ({
    product_id: r.product_id as string | null,
    won_total: r.won_total != null ? Number(r.won_total) : null,
  }))

  // 2) Buscar produtos da empresa (ativos ou não — dados históricos)
  const { data: productsData, error: productsError } = await supabase
    .from('products')
    .select('id, name, category')
    .eq('company_id', filters.companyId)

  if (productsError) {
    throw new Error(`Erro ao buscar produtos: ${productsError.message}`)
  }

  const productsMap = new Map<string, { name: string; category: string | null }>()
  for (const p of productsData ?? []) {
    productsMap.set(String(p.id), { name: p.name, category: p.category ?? null })
  }

  // 3) Agregar por product_id
  interface Agg {
    total_ganhos: number
    total_faturamento: number
  }

  const aggMap = new Map<string | null, Agg>()

  for (const cycle of wonCycles) {
    const key = cycle.product_id
    const faturamento = cycle.won_total ?? 0
    const existing = aggMap.get(key)

    if (existing) {
      existing.total_ganhos += 1
      existing.total_faturamento += faturamento
    } else {
      aggMap.set(key, { total_ganhos: 1, total_faturamento: faturamento })
    }
  }

  // 4) Calcular totais globais
  let grand_total_ganhos = 0
  let grand_total_faturamento = 0

  for (const agg of aggMap.values()) {
    grand_total_ganhos += agg.total_ganhos
    grand_total_faturamento += agg.total_faturamento
  }

  // 5) Construir linhas
  const rows: ProductMixRow[] = []

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

    const peso_mix = pct_faturamento  // revenue-weighted

    rows.push({
      product_id,
      product_name,
      product_category,
      total_ganhos: agg.total_ganhos,
      total_faturamento: agg.total_faturamento,
      ticket_medio,
      pct_faturamento,
      pct_volume,
      peso_mix,
    })
  }

  // Ordenar por peso_mix (pct_faturamento) desc
  rows.sort((a, b) => b.peso_mix - a.peso_mix)

  // 6) Ticket médio ponderado: Σ(ticket_medio_i * peso_mix_i)
  let ticket_medio_ponderado = 0
  for (const row of rows) {
    ticket_medio_ponderado += row.ticket_medio * row.peso_mix
  }

  // 7) Concentração: top 3 por pct_faturamento (somente linked)
  const linkedRows = rows.filter((r) => r.product_id !== null)
  const top3 = linkedRows.slice(0, 3)
  const top3_pct_faturamento = top3.reduce((sum, r) => sum + r.pct_faturamento, 0)

  let concentracao_label: string
  if (top3_pct_faturamento > 0.8) {
    concentracao_label = 'Alta'
  } else if (top3_pct_faturamento > 0.5) {
    concentracao_label = 'Moderada'
  } else {
    concentracao_label = 'Diversificada'
  }

  // 8) Líderes (somente linked)
  const lider_faturamento =
    linkedRows.length > 0
      ? linkedRows.reduce((best, r) =>
          r.total_faturamento > best.total_faturamento ? r : best
        )
      : null

  const lider_volume =
    linkedRows.length > 0
      ? linkedRows.reduce((best, r) =>
          r.total_ganhos > best.total_ganhos ? r : best
        )
      : null

  const total_produtos_distintos = linkedRows.length
  const has_unlinked_sales = aggMap.has(null)

  // 9) Diagnóstico
  const diagnostico = buildDiagnostico(
    rows,
    top3_pct_faturamento,
    concentracao_label,
    ticket_medio_ponderado,
    lider_faturamento,
    lider_volume,
    grand_total_ganhos
  )

  return {
    rows,
    ticket_medio_ponderado,
    top3_pct_faturamento,
    concentracao_label,
    lider_faturamento,
    lider_volume,
    total_ganhos: grand_total_ganhos,
    total_faturamento: grand_total_faturamento,
    total_produtos_distintos,
    has_unlinked_sales,
    diagnostico,
  }
}
