import { SupabaseClient } from '@supabase/supabase-js'

// ============================================================================
// TIPOS
// ============================================================================

export type SellerStats = {
  seller_id: string
  full_name: string | null
  email: string | null
  role: string
  is_active: boolean
  active_cycles_count: number
  novo_count: number
  contato_count: number
  respondeu_count: number
  negociacao_count: number
  ganho_count_period: number
  perdido_count_period: number
  last_activity_at: string | null
}

export type AdminEvent = {
  id: string
  company_id: string
  actor_user_id: string
  target_user_id: string | null
  event_type: string
  metadata: Record<string, unknown>
  occurred_at: string
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Lista vendedores com métricas operacionais via RPC admin
 */
export async function listSellersStats(supabase: SupabaseClient, pDays = 30) {
  const { data, error } = await supabase.rpc('rpc_admin_list_sellers_stats', {
    p_days: pDays,
  })
  if (error) throw error
  return (data ?? []) as SellerStats[]
}

/**
 * Atualiza role e is_active de um vendedor via RPC admin
 */
export async function updateSellerAccess(
  supabase: SupabaseClient,
  sellerId: string,
  role: string,
  isActive: boolean
) {
  const { data, error } = await supabase.rpc(
    'rpc_admin_update_seller_access',
    {
      p_seller_id: sellerId,
      p_role: role,
      p_is_active: isActive,
    }
  )
  if (error) throw error
  return data
}

/**
 * Retorna os últimos eventos de auditoria de um vendedor
 */
export async function getSellerEvents(
  supabase: SupabaseClient,
  sellerId: string,
  limit = 20
) {
  const { data, error } = await supabase
    .from('admin_events')
    .select('*')
    .eq('target_user_id', sellerId)
    .order('occurred_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as AdminEvent[]
}

/**
 * Convida/cadastra um vendedor via API route server-side
 */
export async function inviteSeller(body: {
  email: string
  full_name: string
  role: string
}) {
  const res = await fetch('/api/admin/sellers/invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error || 'Erro ao convidar vendedor')
  return json as { ok: boolean; user_id: string }
}
