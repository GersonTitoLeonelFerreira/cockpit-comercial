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
 * Retorna análise de motivos de perda
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

export interface MarkDealWonOptions {
  revenueDateRef?: string
  wonNote?: string
  productId?: string | null
  wonUnitPrice?: number | null
  paymentMethod?: string | null
  paymentType?: string | null
  entryAmount?: number | null
  installmentsCount?: number | null
  installmentAmount?: number | null
  paymentNotes?: string | null
}

/**
 * Marca um deal como ganho usando a RPC formal de fechamento.
 */
export async function markDealWonWithRevenue(
  dealId: string,
  wonValue: number,
  revenueDateRef?: string,
  wonNote?: string,
  options?: MarkDealWonOptions
): Promise<any> {
  const supabase = supabaseBrowser()

  const revDate = options?.revenueDateRef ?? revenueDateRef ?? null
  const note = options?.wonNote ?? wonNote ?? null

  const { data, error } = await supabase.rpc('rpc_close_cycle_won', {
    p_cycle_id: dealId,
    p_won_value: wonValue,
    p_revenue_date_ref: revDate,
    p_won_note: note,
    p_product_id: options?.productId ?? null,
    p_won_unit_price: options?.wonUnitPrice ?? null,
    p_payment_method: options?.paymentMethod ?? null,
    p_payment_type: options?.paymentType ?? null,
    p_entry_amount: options?.entryAmount ?? null,
    p_installments_count: options?.installmentsCount ?? null,
    p_installment_amount: options?.installmentAmount ?? null,
    p_payment_notes: options?.paymentNotes ?? null,
  })

  if (error) {
    throw new Error(`Erro ao marcar ganho: ${error.message}`)
  }

  const result = Array.isArray(data) ? data[0] : data

  if (!result?.success) {
    throw new Error(result?.error_message || result?.error || 'Operação não confirmada')
  }

  return result
}