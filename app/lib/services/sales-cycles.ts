import { supabaseBrowser } from '../supabaseBrowser'
import {
  LeadStatus,
  SalesCycle,
  RpcCycleResponse,
  UserCycle,
  PoolCycle,
  CycleEvent,
  MoveCycleStageRequest,
  AssignCycleOwnerRequest,
  SetNextActionRequest,
  CloseCycleWonRequest,
  CloseCycleLostRequest,
} from '@/app/types/sales_cycles'

type ApiCycleResponse<T> = {
  ok?: boolean
  data?: T
  error?: string
}

type JsonPayload = object

type SalesCycleWithLeadRow = SalesCycle & {
  leads: {
    id: string
    name: string
    phone: string | null
    email: string | null
  } | null
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

export async function moveCycleStage(req: MoveCycleStageRequest): Promise<RpcCycleResponse> {
  const response = await fetch('/api/sales-cycles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify(req),
  })

  return parseCycleApiResponse<RpcCycleResponse>(response, 'Erro ao mover ciclo')
}

export async function assignCycleOwner(req: AssignCycleOwnerRequest): Promise<RpcCycleResponse> {
  const response = await fetch('/api/sales-cycles', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify(req),
  })

  return parseCycleApiResponse<RpcCycleResponse>(response, 'Erro ao atribuir ciclo')
}

export async function setNextAction(req: SetNextActionRequest): Promise<RpcCycleResponse> {
  const nextActionDate =
    typeof req.next_action_date === 'string'
      ? new Date(req.next_action_date).toISOString()
      : req.next_action_date.toISOString()

  const response = await fetch('/api/sales-cycles', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({
      ...req,
      next_action_date: nextActionDate,
    }),
  })

  return parseCycleApiResponse<RpcCycleResponse>(response, 'Erro ao atualizar ação')
}

export async function closeCycleWon(req: CloseCycleWonRequest): Promise<RpcCycleResponse> {
  const response = await fetch('/api/sales-cycles/close?action=won', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify(req),
  })

  return parseCycleApiResponse<RpcCycleResponse>(
    response,
    'Erro ao fechar ciclo como ganho'
  )
}

export async function closeCycleLost(req: CloseCycleLostRequest): Promise<RpcCycleResponse> {
  const response = await fetch('/api/sales-cycles/close?action=lost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify(req),
  })

  return parseCycleApiResponse<RpcCycleResponse>(
    response,
    'Erro ao fechar ciclo como perdido'
  )
}

export async function logAIAnalysis(
  cycleId: string,
  suggestion: JsonPayload,
  conversationExcerpt?: string
): Promise<void> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase.rpc('rpc_log_ai_analysis', {
    p_cycle_id: cycleId,
    p_suggestion: suggestion,
    p_conversation_excerpt: conversationExcerpt ?? null,
  })

  if (error) throw new Error(`Erro ao registrar análise da IA: ${error.message}`)

  const result = Array.isArray(data) ? data[0] : data
  if (result?.error || result?.error_message) {
    throw new Error(result.error ?? result.error_message)
  }
}

export async function logAISuggestionApplied(
  cycleId: string,
  payload: JsonPayload
): Promise<void> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase.rpc('rpc_log_ai_suggestion_applied', {
    p_cycle_id: cycleId,
    p_payload: payload,
  })

  if (error) throw new Error(`Erro ao registrar aplicação da IA: ${error.message}`)

  const result = Array.isArray(data) ? data[0] : data
  if (result?.error || result?.error_message) {
    throw new Error(result.error ?? result.error_message)
  }
}

export async function logAISuggestionRejected(
  cycleId: string,
  payload: JsonPayload
): Promise<void> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase.rpc('rpc_log_ai_suggestion_rejected', {
    p_cycle_id: cycleId,
    p_payload: payload,
  })

  if (error) throw new Error(`Erro ao registrar rejeição da IA: ${error.message}`)

  const result = Array.isArray(data) ? data[0] : data
  if (result?.error || result?.error_message) {
    throw new Error(result.error ?? result.error_message)
  }
}

export async function getUserSalesCycles(
  ownerUserId?: string,
  status?: LeadStatus,
  limit: number = 100,
  offset: number = 0
): Promise<UserCycle[]> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase.rpc('rpc_get_user_sales_cycles', {
    p_owner_user_id: ownerUserId || null,
    p_status: status || null,
    p_limit: limit,
    p_offset: offset,
  })

  if (error) throw new Error(`Erro ao buscar ciclos: ${error.message}`)

  return (data || []) as UserCycle[]
}

export async function getPoolCycles(
  limit: number = 100,
  offset: number = 0
): Promise<PoolCycle[]> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase.rpc('rpc_get_pool_cycles', {
    p_limit: limit,
    p_offset: offset,
  })

  if (error) throw new Error(`Erro ao buscar pool: ${error.message}`)

  return (data || []) as PoolCycle[]
}

export async function getCycleEvents(cycleId: string): Promise<CycleEvent[]> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase
    .from('cycle_events')
    .select('*')
    .eq('cycle_id', cycleId)
    .order('occurred_at', { ascending: false })

  if (error) throw new Error(`Erro ao buscar eventos: ${error.message}`)

  return (data || []) as CycleEvent[]
}

export async function getSalesCycleWithLead(
  cycleId: string
): Promise<SalesCycleWithLeadRow> {
  const supabase = supabaseBrowser()

  const { data, error } = await supabase
    .from('sales_cycles')
    .select(`
      *,
      leads:lead_id (id, name, phone, email)
    `)
    .eq('id', cycleId)
    .single()

  if (error) throw new Error(`Erro ao buscar ciclo: ${error.message}`)

  return data as SalesCycleWithLeadRow
}