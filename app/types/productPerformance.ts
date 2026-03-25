// ==============================================================================
// Types: Performance por Produto — Fase 5.4
// ==============================================================================

export interface ProductPerformanceFilters {
  companyId: string
  ownerId?: string | null       // null = empresa toda
  dateStart: string             // YYYY-MM-DD
  dateEnd: string               // YYYY-MM-DD
}

export interface ProductPerformanceRow {
  product_id: string | null        // null = "Sem produto vinculado"
  product_name: string             // nome do produto ou "Sem produto vinculado"
  product_category: string | null
  // Volumes
  total_ganhos: number             // qtd de ciclos ganhos com esse produto
  total_faturamento: number        // soma de won_total
  // Derivados
  ticket_medio: number             // total_faturamento / total_ganhos
  pct_faturamento: number          // participação % no faturamento total (0..1)
  pct_volume: number               // participação % no volume de ganhos (0..1)
  // Conversão (métrica limitada — ver nota no service)
  total_ciclos_produto: number     // total de ciclos (qualquer status) com este product_id
  conversao_produto: number        // total_ganhos / total_ciclos_produto (0..1)
  conversao_confiavel: boolean     // true se total_ciclos_produto >= 5 (base mínima)
}

export interface ProductPerformanceSummary {
  rows: ProductPerformanceRow[]
  totals: {
    total_ganhos: number
    total_faturamento: number
    ticket_medio_geral: number
  }
  // KPIs de destaque
  melhor_ticket: ProductPerformanceRow | null
  melhor_faturamento: ProductPerformanceRow | null
  melhor_volume: ProductPerformanceRow | null
  melhor_conversao: ProductPerformanceRow | null  // null se nenhuma conversão confiável
  // Metadados
  has_unlinked_sales: boolean      // existem ganhos sem product_id?
  filters_applied: ProductPerformanceFilters
}
