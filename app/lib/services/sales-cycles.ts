import { supabaseBrowser } from '../supabaseBrowser'
import {
  LeadStatus,
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

export async function moveCycleStage(req: MoveCycleStageRequest): Promise<RpcCycleResponse> {
  const supabase = supabaseBrowser()
  const { data, error } = await supabase.rpc('rpc_move_cycle_stage', {
    p_cycle_id: req.cycle_id,
    p_to_status: req.to_status,
    p_metadata: req.metadata || {},
  })
  if (error) throw new Error(`Erro ao mover ciclo: ${error.message}`)
  const result = Array.isArray(data) ? data[0] : data
  if (result?.error_message) throw new Error(result.error_message)
  return result as RpcCycleResponse
}

export async function assignCycleOwner(req: AssignCycleOwnerRequest): Promise<RpcCycleResponse> {
  const supabase = supabaseBrowser()
  const { data, error } = await supabase.rpc('rpc_assign_cycle_owner', {
    p_cycle_id: req.cycle_id,
    p_owner_user_id: req.owner_user_id,
  })
  if (error) throw new Error(`Erro ao atribuir ciclo: ${error.message}`)
  const result = Array.isArray(data) ? data[0] : data
  if (result?.error_message) throw new Error(result.error_message)
  return result as RpcCycleResponse
}

export async function setNextAction(req: SetNextActionRequest): Promise<RpcCycleResponse> {
  const supabase = supabaseBrowser()
  const nextActionDate = typeof req.next_action_date === 'string'
    ? new Date(req.next_action_date).toISOString()
    : req.next_action_date.toISOString()
  const { data, error } = await supabase.rpc('rpc_set_next_action', {
    p_cycle_id: req.cycle_id,
    p_next_action: req.next_action,
    p_next_action_date: nextActionDate,
  })
  if (error) throw new Error(`Erro ao atualizar ação: ${error.message}`)
  const result = Array.isArray(data) ? data[0] : data
  if (result?.error_message) throw new Error(result.error_message)
  return result as RpcCycleResponse
}

// TODO: consolidar lógica de close cycle no service layer
export async function closeCycleWon(req: CloseCycleWonRequest): Promise<RpcCycleResponse> {
  const supabase = supabaseBrowser()
  const { data, error } = await supabase.rpc('rpc_close_cycle_won', {
    p_cycle_id: req.cycle_id,
    p_won_value: req.won_value ?? null,
  })
  if (error) throw new Error(`Erro ao fechar ciclo como ganho: ${error.message}`)
  const result = Array.isArray(data) ? data[0] : data
  if (result?.error_message) throw new Error(result.error_message)
  return result as RpcCycleResponse
}

export async function closeCycleLost(req: CloseCycleLostRequest): Promise<RpcCycleResponse> {
  const supabase = supabaseBrowser()
  const { data, error } = await supabase.rpc('rpc_close_cycle_lost', {
    p_cycle_id: req.cycle_id,
    p_loss_reason: req.loss_reason ?? null,
  })
  if (error) throw new Error(`Erro ao fechar ciclo como perdido: ${error.message}`)
  const result = Array.isArray(data) ? data[0] : data
  if (result?.error_message) throw new Error(result.error_message)
  return result as RpcCycleResponse
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

export async function getSalesCycleWithLead(cycleId: string): Promise<any> {
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
  return data
}
