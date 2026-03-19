// ==============================================================================
// Service: Sales Analytics
// Funções para KPIs e relatórios
// ==============================================================================

import { supabaseBrowser } from '../supabaseBrowser'

/**
 * Retorna KPIs principais do funil
 */
export async function getSalesFunnel(): Promise<any[]> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase.from('vw_sales_funnel').select('*')

  if (error) throw new Error(`Erro ao buscar funil: ${error.message}`)

  return data || []
}

/**
 * Retorna performance por vendedor
 */
export async function getPerformanceByOwner(): Promise<any[]> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase
    .from('vw_sales_performance_by_owner')
    .select('*')
    .order('valor_total_ganho', { ascending: false })

  if (error) throw new Error(`Erro ao buscar performance: ${error.message}`)

  return data || []
}

/**
 * Retorna análise mensal
 */
export async function getMonthlySalesAnalysis(): Promise<any[]> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase
    .from('vw_sales_monthly_analysis')
    .select('*')
    .order('mes', { ascending: false })

  if (error) throw new Error(`Erro ao buscar análise mensal: ${error.message}`)

  return data || []
}

/**
 * Retorna análise de motivos de perda (agora com dados corretos)
 */
export async function getLostAnalysis(): Promise<any[]> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase
    .from('vw_sales_lost_analysis')
    .select('*')
    .order('total_deals_perdidos', { ascending: false })

  if (error) {
    console.warn('Aviso: vw_sales_lost_analysis pode estar vazia', error.message)
    return []
  }

  return data || []
}

/**
 * Retorna ciclo completo com todas as informações
 */
export async function getSalesCycleComplete(cycleId: string): Promise<any> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase
    .from('vw_sales_cycles_complete')
    .select('*')
    .eq('id', cycleId)
    .single()

  if (error) throw new Error(`Erro ao buscar ciclo completo: ${error.message}`)

  return data
}

/**
 * Retorna histórico de auditoria de um ciclo
 */
export async function getCycleAuditHistory(cycleId: string): Promise<any[]> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase
    .from('vw_audit_sales_cycles_history')
    .select('*')
    .eq('sales_cycle_id', cycleId)
    .order('changed_at', { ascending: false })

  if (error) throw new Error(`Erro ao buscar auditoria: ${error.message}`)

  return data || []
}

/**
 * Retorna deals que vencem nos próximos N dias
 */
export async function getUpcomingDeals(daysAhead: number = 7): Promise<any[]> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase
    .from('vw_sales_cycles_complete')
    .select('*')
    .in('status', ['novo', 'contato', 'respondeu', 'negociacao'])
    .not('next_action_date', 'is', null)
    .gte('next_action_date', new Date().toISOString())
    .lte(
      'next_action_date',
      new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString()
    )
    .order('next_action_date', { ascending: true })

  if (error) throw new Error(`Erro ao buscar deals próximos: ${error.message}`)

  return data || []
}

/**
 * Marca um deal como GANHO.
 *
 * Se revenueDateRef vier preenchida (YYYY-MM-DD), ela define a data usada no faturamento diário
 * (via view v_revenue_daily_seller).
 *
 * IMPORTANTE:
 * - Não somamos faturamento via RPC aqui.
 * - O faturamento é calculado pelas views a partir de sales_cycles/leads (+ overrides).
 */
export async function markDealWonWithRevenue(
  dealId: string,
  wonValue: number,
  revenueDateRef?: string, // YYYY-MM-DD (opcional)
  wonNote?: string
): Promise<any> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase
    .from('sales_cycles')
    .update({
      status: 'ganho',
      won_at: new Date().toISOString(),
      won_total: wonValue,
      revenue_seller_ref_date: revenueDateRef || null,
      won_value_source: revenueDateRef ? 'revenue' : 'manual',
      won_note: wonNote || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', dealId)
    .select()

  if (error) {
    throw new Error(`Erro ao marcar ganho: ${error.message}`)
  }

  return data?.[0]
}