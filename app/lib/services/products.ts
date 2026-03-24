import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import type { Product, ProductCreateInput, ProductUpdateInput } from '@/app/types/product'

// ==============================================================================
// Service: Products (Catálogo Comercial)
// ==============================================================================

/**
 * Lista todos os produtos da empresa (ativos e inativos).
 * RLS garante que só vê da própria company.
 */
export async function listProducts(companyId: string): Promise<Product[]> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('company_id', companyId)
    .order('name', { ascending: true })

  if (error) throw new Error(`Erro ao listar produtos: ${error.message}`)

  return (data ?? []) as Product[]
}

/**
 * Lista apenas os produtos ativos da empresa.
 */
export async function listActiveProducts(companyId: string): Promise<Product[]> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('company_id', companyId)
    .eq('active', true)
    .order('name', { ascending: true })

  if (error) throw new Error(`Erro ao listar produtos ativos: ${error.message}`)

  return (data ?? []) as Product[]
}

/**
 * Cria um novo produto.
 * RLS garante que só admin pode inserir.
 */
export async function createProduct(input: ProductCreateInput): Promise<Product> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase
    .from('products')
    .insert({
      company_id: input.company_id,
      name: input.name.trim(),
      category: (input.category ?? '').trim(),
      base_price: input.base_price,
    })
    .select()
    .single()

  if (error) throw new Error(`Erro ao criar produto: ${error.message}`)

  return data as Product
}

/**
 * Atualiza um produto existente.
 * RLS garante que só admin pode atualizar.
 */
export async function updateProduct(productId: string, input: ProductUpdateInput): Promise<Product> {
  const supabase = supabaseBrowser()

  const updateData: Record<string, unknown> = {}
  if (input.name !== undefined) updateData.name = input.name.trim()
  if (input.category !== undefined) updateData.category = input.category.trim()
  if (input.base_price !== undefined) updateData.base_price = input.base_price
  if (input.active !== undefined) updateData.active = input.active

  const { data, error } = await supabase
    .from('products')
    .update(updateData)
    .eq('id', productId)
    .select()
    .single()

  if (error) throw new Error(`Erro ao atualizar produto: ${error.message}`)

  return data as Product
}

/**
 * Ativa ou desativa um produto.
 */
export async function toggleProductActive(productId: string, active: boolean): Promise<Product> {
  return updateProduct(productId, { active })
}
