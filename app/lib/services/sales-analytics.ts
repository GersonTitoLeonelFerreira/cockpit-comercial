// ==============================================================================
// Service: Sales Analytics
// Funções para KPIs e relatórios
// ==============================================================================

import { RpcCycleResponse } from '@/app/types/sales_cycles'
import { supabaseBrowser } from '../supabaseBrowser'

export interface SalesFunnelRow {
  status: string
  total_deals: number
  deals_ganhos: number
  deals_perdidos: number
  taxa_conversao_pct: number
  valor_medio_ganho: number
  valor_total_ganho: number
}

export interface PerformanceByOwnerRow {
  owner_id: string
  owner_email: string
  total_deals: number
  deals_ganhos: number
  deals_perdidos: number
  deals_ativos: number
  taxa_conversao_pct: number
  valor_total_ganho: number
  dias_medio_ciclo: number
}

export interface MonthlySalesAnalysisRow {
  mes: string
  total_deals_criados: number
  deals_ganhos: number
  deals_perdidos: number
  taxa_conversao_pct: number
  receita_total: number
  receita_media_por_deal: number
}

export interface LostAnalysisRow {
  lost_reason: string
  total_deals_perdidos: number
  percentual_pct: number
  dias_ate_perda: number
}

export interface SalesCycleCompleteRow {
  [key: string]: unknown
  id: string
}

export interface CycleAuditHistoryRow {
  audit_id: string
  sales_cycle_id: string
  operation: string
  changed_at: string
  changed_by_email: string
  changes_summary: string
  old_data: unknown
  new_data: unknown
}

export interface UpcomingDealRow {
  [key: string]: unknown
  id: string
  status: string
  next_action_date: string | null
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

type ApiCycleResponse<T> = {
  ok?: boolean
  data?: T
  error?: string
}

async function parseCycleApiResponse<T>(
  response: Response,
  fallbackMessage: string
): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as ApiCycleResponse<T>

  if (!response.ok || payload.error) {
    throw new Error(payload.error ?? fallbackMessage)
  }

  if (!payload.data) {
    throw new Error('Operação não confirmada')
  }

  return payload.data
}

/**
 * Retorna KPIs principais do funil.
 */
export async function getSalesFunnel(): Promise<SalesFunnelRow[]> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase.from('vw_sales_funnel').select('*')

  if (error) throw new Error(`Erro ao buscar funil: ${error.message}`)

  return (data || []) as SalesFunnelRow[]
}

/**
 * Retorna performance por vendedor.
 */
export async function getPerformanceByOwner(): Promise<PerformanceByOwnerRow[]> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase
    .from('vw_sales_performance_by_owner')
    .select('*')
    .order('valor_total_ganho', { ascending: false })

  if (error) throw new Error(`Erro ao buscar performance: ${error.message}`)

  return (data || []) as PerformanceByOwnerRow[]
}

/**
 * Retorna análise mensal.
 */
export async function getMonthlySalesAnalysis(): Promise<MonthlySalesAnalysisRow[]> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase
    .from('vw_sales_monthly_analysis')
    .select('*')
    .order('mes', { ascending: false })

  if (error) throw new Error(`Erro ao buscar análise mensal: ${error.message}`)

  return (data || []) as MonthlySalesAnalysisRow[]
}

/**
 * Retorna análise de motivos de perda.
 */
export async function getLostAnalysis(): Promise<LostAnalysisRow[]> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase
    .from('vw_sales_lost_analysis')
    .select('*')
    .order('total_deals_perdidos', { ascending: false })

  if (error) {
    console.warn('Aviso: vw_sales_lost_analysis pode estar vazia', error.message)
    return []
  }

  return (data || []) as LostAnalysisRow[]
}

/**
 * Retorna ciclo completo com todas as informações.
 */
export async function getSalesCycleComplete(cycleId: string): Promise<SalesCycleCompleteRow> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase
    .from('vw_sales_cycles_complete')
    .select('*')
    .eq('id', cycleId)
    .single()

  if (error) throw new Error(`Erro ao buscar ciclo completo: ${error.message}`)

  return data as SalesCycleCompleteRow
}

/**
 * Retorna histórico de auditoria de um ciclo.
 */
export async function getCycleAuditHistory(cycleId: string): Promise<CycleAuditHistoryRow[]> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase
    .from('vw_audit_sales_cycles_history')
    .select('*')
    .eq('sales_cycle_id', cycleId)
    .order('changed_at', { ascending: false })

  if (error) throw new Error(`Erro ao buscar auditoria: ${error.message}`)

  return (data || []) as CycleAuditHistoryRow[]
}

/**
 * Retorna deals que vencem nos próximos N dias.
 */
export async function getUpcomingDeals(daysAhead: number = 7): Promise<UpcomingDealRow[]> {
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

  return (data || []) as UpcomingDealRow[]
}

/**
 * Marca um deal como ganho usando a API formal de fechamento.
 */
export async function markDealWonWithRevenue(
  dealId: string,
  wonValue: number,
  revenueDateRef?: string,
  wonNote?: string,
  options?: MarkDealWonOptions
): Promise<RpcCycleResponse> {
  const revDate = options?.revenueDateRef ?? revenueDateRef ?? null
  const note = options?.wonNote ?? wonNote ?? null

  const response = await fetch('/api/sales-cycles/close?action=won', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({
      cycle_id: dealId,
      won_value: wonValue,
      revenue_date_ref: revDate,
      won_note: note,
      product_id: options?.productId ?? null,
      won_unit_price: options?.wonUnitPrice ?? null,
      payment_method: options?.paymentMethod ?? null,
      payment_type: options?.paymentType ?? null,
      entry_amount: options?.entryAmount ?? null,
      installments_count: options?.installmentsCount ?? null,
      installment_amount: options?.installmentAmount ?? null,
      payment_notes: options?.paymentNotes ?? null,
    }),
  })

  return parseCycleApiResponse<RpcCycleResponse>(
    response,
    'Erro ao marcar ganho'
  )
}