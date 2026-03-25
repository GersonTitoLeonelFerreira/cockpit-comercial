// ==============================================================================
// Types: Mix Comercial — Fase 5.5
// ==============================================================================

export interface ProductMixRow {
  product_id: string | null
  product_name: string
  product_category: string | null
  // Volume
  total_ganhos: number
  total_faturamento: number
  ticket_medio: number
  // Mix participation
  pct_faturamento: number        // 0..1 — share of total revenue
  pct_volume: number             // 0..1 — share of total won deals
  peso_mix: number               // 0..1 — weight in mix (= pct_faturamento, used for weighted ticket)
}

export interface ProductMixSummary {
  rows: ProductMixRow[]
  // Weighted ticket calculation
  ticket_medio_ponderado: number  // sum(ticket_medio_i * peso_mix_i)
  // Concentration
  top3_pct_faturamento: number   // sum of top 3 products' pct_faturamento (0..1)
  concentracao_label: string     // 'Alta' | 'Moderada' | 'Diversificada'
  // Leaders
  lider_faturamento: ProductMixRow | null
  lider_volume: ProductMixRow | null
  // Totals
  total_ganhos: number
  total_faturamento: number
  total_produtos_distintos: number
  // Diagnostic
  has_unlinked_sales: boolean
  diagnostico: string            // Natural language summary of the mix
}

export interface ProductMixFilters {
  companyId: string
  ownerId?: string | null
  dateStart: string
  dateEnd: string
}
