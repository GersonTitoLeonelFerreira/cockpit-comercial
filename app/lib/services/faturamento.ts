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

type SellerMembershipRow = {
  company_id: string
  user_id: string
  role: string
  is_active: boolean
}

type SellerProfileRow = {
  id: string
  full_name: string | null
  email: string | null
}

export type RevenueSaleDetail = {
  cycle_id: string
  lead_id: string | null
  lead_name: string | null
  seller_id: string | null
  seller_name: string | null
  seller_email: string | null
  product_id: string | null
  product_name: string | null
  product_category: string | null
  won_total: number
  won_unit_price: number | null
  payment_method: string | null
  payment_type: string | null
  won_at: string | null
  revenue_seller_ref_date: string | null
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Lista todas as fontes extra de faturamento ativas
 * Nota: filtragem por company_id é garantida pelo RLS do Supabase
 */
export async function getRevenueExtraSources(
  supabase: SupabaseClient,
  companyId: string,
) {
  const { data, error } = await supabase
    .from('revenue_extra_sources')
    .select('*')
    .eq('company_id', companyId)
    .is('archived_at', null)
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []) as RevenueExtraSource[]
}

/**
 * Lista vendedores ativos para seletor
 * Nota: filtragem por company_id é garantida pelo RLS do Supabase
 */
export async function getSellers(
  supabase: SupabaseClient,
  companyId: string,
) {
  const { data: memberships, error: membershipsError } = await supabase
    .from('company_memberships')
    .select('company_id, user_id, role, is_active')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .in('role', ['admin', 'manager', 'member', 'seller', 'consultor'])

  if (membershipsError) throw membershipsError

  const membershipRows = (memberships ?? []) as SellerMembershipRow[]
  const userIds = Array.from(new Set(membershipRows.map((row) => row.user_id)))

  if (userIds.length === 0) return []

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', userIds)

  if (profilesError) throw profilesError

  const profilesById = new Map(
    ((profiles ?? []) as SellerProfileRow[]).map((profile) => [profile.id, profile]),
  )

  return membershipRows
    .map((membership) => {
      const profile = profilesById.get(membership.user_id)

      return {
        id: membership.user_id,
        company_id: membership.company_id,
        full_name: profile?.full_name ?? null,
        email: profile?.email ?? null,
        role: membership.role,
      }
    })
    .sort((a, b) => {
      const nameA = a.full_name || a.email || ''
      const nameB = b.full_name || b.email || ''
      return nameA.localeCompare(nameB, 'pt-BR')
    }) as Seller[]
}

/**
 * Busca faturamento diário de vendedores para o mês
 * Filtra por seller_id se fornecido
 */
export async function getRevenueDailySellers(
  supabase: SupabaseClient,
  companyId: string,
  sellerId?: string,
) {
  let query = supabase
    .from('v_revenue_daily_seller')
    .select('*')
    .eq('company_id', companyId)

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
  companyId: string,
  extraId?: string,
) {
  let query = supabase
    .from('v_revenue_daily_extra')
    .select('*')
    .eq('company_id', companyId)

  if (extraId) {
    query = query.eq('extra_id', extraId)
  }

  const { data, error } = await query.order('ref_date', { ascending: false })

  if (error) throw error
  return (data ?? []) as RevenueDailyExtra[]
}

/**
 * Busca as vendas ganhas registradas em um dia financeiro específico.
 * Usa a mesma regra de data da Gestão de Faturamento:
 * revenue_seller_ref_date -> won_at -> closed_at.
 */
export async function getRevenueSalesDetailsByDay(
  supabase: SupabaseClient,
  companyId: string,
  refDate: string,
  ownerId?: string | null
) {
  const { data, error } = await supabase.rpc(
    'rpc_revenue_sales_details_by_day_for_company',
    {
      p_company_id: companyId,
      p_ref_date: refDate,
      p_owner_id: ownerId ?? null,
    }
  )

  if (error) throw error

  return (data ?? []) as RevenueSaleDetail[]
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
  companyId: string,
  name: string
): Promise<string> {
  const { data, error } = await supabase.rpc(
    'rpc_create_revenue_extra_source_for_company',
    {
      p_company_id: companyId,
      p_name: name,
    }
  )

  if (error) throw error
  return data as string
}

/**
 * Upsert override de faturamento diário
 */
export async function upsertRevenueOverride(
  supabase: SupabaseClient,
  companyId: string,
  sourceKind: 'seller' | 'extra',
  sourceId: string,
  refDate: string,
  realValue: number,
  reason: string,
  notes?: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc(
    'rpc_upsert_revenue_daily_override_for_company',
    {
      p_company_id: companyId,
      p_source_kind: sourceKind,
      p_source_id: sourceId,
      p_ref_date: refDate,
      p_real_value: realValue,
      p_reason: reason,
      p_notes: notes || null,
    }
  )

  if (error) throw error

  if (data?.success !== true) {
    throw new Error('O banco não confirmou a atualização do faturamento.')
  }

  return true
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
    const currentDay = new Date(firstDay)
    
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