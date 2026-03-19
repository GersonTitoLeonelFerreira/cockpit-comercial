import { supabaseBrowser } from '@/app/lib/supabaseBrowser'

export type AdminSellerStatsRow = {
  seller_id: string
  full_name: string | null
  email: string | null
  role: string | null
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

export async function adminListSellersStats(p_days: number) {
  const supabase = supabaseBrowser()
  const { data, error } = await supabase.rpc('rpc_admin_list_sellers_stats', { p_days })
  if (error) throw error
  return (data ?? []) as AdminSellerStatsRow[]
}

export async function adminUpdateSellerAccess(params: {
  sellerId: string
  role: string
  isActive: boolean
}) {
  const supabase = supabaseBrowser()
  const { error } = await supabase.rpc('rpc_admin_update_seller_access', {
    p_seller_id: params.sellerId,
    p_role: params.role,
    p_is_active: params.isActive,
  })
  if (error) throw error
}