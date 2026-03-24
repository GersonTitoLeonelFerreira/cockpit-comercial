// ==============================================================================
// Types: Catálogo Comercial — Produtos
// ==============================================================================

export interface Product {
  id: string
  company_id: string
  name: string
  category: string
  base_price: number
  active: boolean
  created_at: string
  updated_at: string
}

export interface ProductCreateInput {
  company_id: string
  name: string
  category?: string
  base_price: number
}

export interface ProductUpdateInput {
  name?: string
  category?: string
  base_price?: number
  active?: boolean
}
