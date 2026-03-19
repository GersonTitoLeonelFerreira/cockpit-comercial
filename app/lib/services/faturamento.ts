import { SupabaseClient } from '@supabase/supabase-js'

// ============================================================================
// TIPOS
// ============================================================================
export type RevenueExtraSource = {
  id: string
  company_id: string
  name: string
  created_by: string
  created_at: string
  archived_at: string | null
}

export type RevenueDailySeller = {
  company_id: string
  seller_id: string
  ref_date: string // date YYYY-MM-DD
  cockpit_value: number
  real_value: number
  adjustment_value: number
}

export type RevenueDailyExtra = {
  company_id: string
  extra_id: string
  ref_date: string
  cockpit_value: number
  real_value: number
  adjustment_value: number
}

export type RevenueOverride = {
  id: string
  company_id: string
  source_kind: 'seller' | 'extra'
  source_id: string
  ref_date: string
  real_value: number
  reason: string
  notes: string | null
  edited_by: string
  edited_at: string
}

export type Seller = {
  id: string
  company_id: string
  full_name: string | null
  email: string | null
  role: string
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Lista todas as fontes extra de faturamento ativas
 * Nota: filtragem por company_id é garantida pelo RLS do Supabase
 */
export async function getRevenueExtraSources(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('revenue_extra_sources')
    .select('*')
    .is('archived_at', null)
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []) as RevenueExtraSource[]
}

/**
 * Lista vendedores ativos para seletor
 * Nota: filtragem por company_id é garantida pelo RLS do Supabase
 */
export async function getSellers(supabase: SupabaseClient) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, company_id, full_name, email, role')
      .in('role', ['member', 'seller', 'consultor', 'admin'])
      .neq('status', 'archived')
      .eq('is_active', true)
      .order('full_name', { ascending: true })
  
    if (error) throw error
    return (data ?? []) as Seller[]
  }

/**
 * Busca faturamento diário de vendedores para o mês
 * Filtra por seller_id se fornecido
 */
export async function getRevenueDailySellers(
  supabase: SupabaseClient,
  sellerId?: string
) {
  let query = supabase
    .from('v_revenue_daily_seller')
    .select('*')

  if (sellerId) {
    query = query.eq('seller_id', sellerId)
  }

  const { data, error } = await query.order('ref_date', { ascending: false })

  if (error) throw error
  return (data ?? []) as RevenueDailySeller[]
}

/**
 * Busca faturamento diário de fontes extras para o mês
 * Filtra por extra_id se fornecido
 */
export async function getRevenueDailyExtras(
  supabase: SupabaseClient,
  extraId?: string
) {
  let query = supabase
    .from('v_revenue_daily_extra')
    .select('*')

  if (extraId) {
    query = query.eq('extra_id', extraId)
  }

  const { data, error } = await query.order('ref_date', { ascending: false })

  if (error) throw error
  return (data ?? []) as RevenueDailyExtra[]
}

/**
 * Busca overrides de um dia específico (para preencher modal de edição)
 */
export async function getRevenueOverridesForDay(
  supabase: SupabaseClient,
  sourceKind: 'seller' | 'extra',
  sourceId: string,
  refDate: string
) {
  const { data, error } = await supabase
    .from('revenue_overrides_daily')
    .select('*')
    .eq('source_kind', sourceKind)
    .eq('source_id', sourceId)
    .eq('ref_date', refDate)
    .single()

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = no rows
    throw error
  }

  return (data ?? null) as RevenueOverride | null
}

// ============================================================================
// MUTATIONS (via RPC)
// ============================================================================

/**
 * Criar fonte extra de faturamento
 */
export async function createRevenueExtraSource(
  supabase: SupabaseClient,
  name: string
): Promise<string> {
  const { data, error } = await supabase.rpc(
    'rpc_create_revenue_extra_source',
    { p_name: name }
  )

  if (error) throw error
  return data as string
}

/**
 * Upsert override de faturamento diário
 */
export async function upsertRevenueOverride(
  supabase: SupabaseClient,
  sourceKind: 'seller' | 'extra',
  sourceId: string,
  refDate: string,
  realValue: number,
  reason: string,
  notes?: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc(
    'rpc_upsert_revenue_daily_override',
    {
      p_source_kind: sourceKind,
      p_source_id: sourceId,
      p_ref_date: refDate,
      p_real_value: realValue,
      p_reason: reason,
      p_notes: notes || null,
    }
  )

  if (error) throw error
  return data?.success === true
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Formata valor em moeda brasileira
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

/**
 * Formata data para exibição
 */
export function formatDate(dateStr: string): string {
    // ✅ Sem o Z - trata como local
    const [year, month, day] = dateStr.split('-')
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
    return date.toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'short',
      weekday: 'short',
    })
  }

/**
 * Retorna array de datas do mês (YYYY-MM-DD)
 */
export function getDatesOfMonth(year: number, month: number): string[] {
    const firstDay = new Date(year, month - 1, 1)
    const lastDay = new Date(year, month, 0)
    const dates: string[] = []
  
    // ✅ Cria uma cópia para não modificar firstDay
    let currentDay = new Date(firstDay)
    
    while (currentDay <= lastDay) {
      dates.push(currentDay.toISOString().split('T')[0])
      currentDay.setDate(currentDay.getDate() + 1)
    }
  
    return dates
  }

/**
 * Retorna mês/ano anterior
 */
export function getPreviousMonth(
  year: number,
  month: number
): { year: number; month: number } {
  if (month === 1) {
    return { year: year - 1, month: 12 }
  }
  return { year, month: month - 1 }
}

/**
 * Retorna mês/ano próximo
 */
export function getNextMonth(
  year: number,
  month: number
): { year: number; month: number } {
  if (month === 12) {
    return { year: year + 1, month: 1 }
  }
  return { year, month: month + 1 }
}

/**
 * Formata mês para exibição (ex: "Março/2026")
 */
export function formatMonthYear(year: number, month: number): string {
  const date = new Date(year, month - 1)
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

// ============================================================================
// MUTATIONS (Revenue increment)
// ============================================================================

/**
 * Soma valor ao faturamento do vendedor em um dia (UPSERT + incremento).
 * Requer RPC: rpc_increment_revenue_daily_seller
 */
export async function incrementRevenueDailySeller(
  supabase: SupabaseClient,
  sellerId: string,
  refDate: string,
  deltaValue: number
): Promise<boolean> {
  const { data, error } = await supabase.rpc('rpc_increment_revenue_daily_seller', {
    p_seller_id: sellerId,
    p_ref_date: refDate,
    p_delta_value: deltaValue,
  })

  if (error) throw error
  return data?.success === true || data === true
}