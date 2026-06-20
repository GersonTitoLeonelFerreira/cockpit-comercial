// ==============================================================================
// Service: Mix Comercial
//
// Usa a mesma base oficial de Performance por Produto.
// Isso impede que Performance e Mix mostrem números divergentes.
// ==============================================================================

import {
  getProductPerformance,
} from '@/app/lib/services/productPerformance'
import type {
  ProductPerformanceSummary,
} from '@/app/types/productPerformance'
import type {
  ProductMixFilters,
  ProductMixRow,
  ProductMixSummary,
} from '@/app/types/productMix'

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

function buildDiagnostico(
  rows: ProductMixRow[],
  top3Pct: number,
  concentracaoLabel: string,
  ticketPonderado: number,
  liderFaturamento: ProductMixRow | null,
  liderVolume: ProductMixRow | null,
  totalGanhos: number,
): string {
  if (totalGanhos === 0) {
    return 'Nenhuma venda ganha foi registrada no período selecionado.'
  }

  const linkedRows = rows.filter((row) => row.product_id !== null)

  if (linkedRows.length === 0) {
    return `Foram registradas ${totalGanhos} venda(s) ganha(s), mas nenhuma possui produto vinculado. Vincule o produto no fechamento para gerar uma análise comercial completa.`
  }

  const topProducts = linkedRows
    .slice(0, 3)
    .map((row) => row.product_name)
    .join(', ')

  let text = `O mix comercial está ${concentracaoLabel === 'Alta' ? 'concentrado' : concentracaoLabel === 'Moderada' ? 'moderadamente concentrado' : 'diversificado'} em ${topProducts}. Os três principais produtos representam ${(top3Pct * 100).toFixed(1)}% do faturamento.`

  text += ` O ticket médio das vendas ganhas no período é ${formatBRL(ticketPonderado)}.`

  if (liderFaturamento && liderVolume) {
    if (liderFaturamento.product_id === liderVolume.product_id) {
      text += ` ${liderFaturamento.product_name} lidera em faturamento e em volume.`
    } else {
      text += ` ${liderFaturamento.product_name} lidera em faturamento, enquanto ${liderVolume.product_name} lidera em volume.`
    }
  }

  return text
}

export function buildProductMixFromPerformance(
  performance: ProductPerformanceSummary,
): ProductMixSummary {
  const rows: ProductMixRow[] = performance.rows.map((row) => ({
    product_id: row.product_id,
    product_name: row.product_name,
    product_category: row.product_category,
    total_ganhos: row.total_ganhos,
    total_faturamento: row.total_faturamento,
    ticket_medio: row.ticket_medio,
    pct_faturamento: row.pct_faturamento,
    pct_volume: row.pct_volume,
    peso_mix: row.pct_faturamento,
  }))

  const linkedRows = rows.filter((row) => row.product_id !== null)

  const top3Pct = linkedRows
    .slice(0, 3)
    .reduce((sum, row) => sum + row.pct_faturamento, 0)

  const concentracaoLabel =
    top3Pct > 0.8
      ? 'Alta'
      : top3Pct > 0.5
        ? 'Moderada'
        : 'Diversificada'

  const liderFaturamento = linkedRows[0] ?? null

  const liderVolume =
    linkedRows.length > 0
      ? [...linkedRows].sort(
          (a, b) => b.total_ganhos - a.total_ganhos,
        )[0]
      : null

  const ticketPonderado = performance.totals.ticket_medio_geral

  return {
    rows,
    ticket_medio_ponderado: ticketPonderado,
    top3_pct_faturamento: top3Pct,
    concentracao_label: concentracaoLabel,
    lider_faturamento: liderFaturamento,
    lider_volume: liderVolume,
    total_ganhos: performance.totals.total_ganhos,
    total_faturamento: performance.totals.total_faturamento,
    total_produtos_distintos: linkedRows.length,
    has_unlinked_sales: performance.has_unlinked_sales,
    diagnostico: buildDiagnostico(
      rows,
      top3Pct,
      concentracaoLabel,
      ticketPonderado,
      liderFaturamento,
      liderVolume,
      performance.totals.total_ganhos,
    ),
  }
}

export async function getProductMix(
  filters: ProductMixFilters,
): Promise<ProductMixSummary> {
  const performance = await getProductPerformance(filters)

  return buildProductMixFromPerformance(performance)
}