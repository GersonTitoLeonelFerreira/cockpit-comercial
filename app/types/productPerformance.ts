// ==============================================================================
// Types: Performance por Produto
// ==============================================================================

export interface ProductPerformanceFilters {
  companyId: string
  ownerId?: string | null
  dateStart: string
  dateEnd: string
}

export interface ProductPerformanceRow {
  product_id: string | null
  product_name: string
  product_category: string | null

  total_ganhos: number
  total_faturamento: number

  ticket_medio: number
  pct_faturamento: number
  pct_volume: number
}

export interface ProductPerformanceSummary {
  rows: ProductPerformanceRow[]

  totals: {
    total_ganhos: number
    total_faturamento: number
    ticket_medio_geral: number
  }

  melhor_ticket: ProductPerformanceRow | null
  melhor_faturamento: ProductPerformanceRow | null
  melhor_volume: ProductPerformanceRow | null

  has_unlinked_sales: boolean

  filters_applied: ProductPerformanceFilters
}