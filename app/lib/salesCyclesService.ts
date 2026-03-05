import { supabaseBrowser } from './supabaseBrowser'
import type { SalesCycle, CycleEvent, PoolCycle, CycleStatus } from '../types/sales_cycles'

// ──────────────────────────────────────────────
// Fetch cycles for the current user (seller view)
// ──────────────────────────────────────────────
export async function getUserSalesCycles(
  userId: string,
  companyId: string
): Promise<SalesCycle[]> {
  const sb = supabaseBrowser()

  const { data, error } = await sb
    .from('sales_cycles')
    .select(
      `id, company_id, lead_id, owner_user_id, status,
       next_action, next_action_date, stage_entered_at,
       deal_value, loss_reason, closed_at, created_at, updated_at,
       lead:leads(id, name, phone, email)`
    )
    .eq('company_id', companyId)
    .eq('owner_user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as SalesCycle[]
}

// ──────────────────────────────────────────────
// Fetch events for a single cycle
// ──────────────────────────────────────────────
export async function getCycleEvents(cycleId: string): Promise<CycleEvent[]> {
  const sb = supabaseBrowser()

  const { data, error } = await sb
    .from('cycle_events')
    .select('id, cycle_id, company_id, user_id, event_type, from_stage, to_stage, metadata, created_at')
    .eq('cycle_id', cycleId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as CycleEvent[]
}

// ──────────────────────────────────────────────
// Pool: cycles without an owner (admin view)
// Falls back to direct query if RPC is unavailable
// ──────────────────────────────────────────────
export async function getPoolCycles(companyId: string): Promise<PoolCycle[]> {
  const sb = supabaseBrowser()

  // Try RPC first. We cast through unknown because the supabase-js client
  // is not typed for our custom database functions.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpcResult = await (sb.rpc as any)('rpc_get_pool_cycles', { p_company_id: companyId }) as {
    data: PoolCycle[] | null
    error: { message: string } | null
  }

  if (!rpcResult.error && rpcResult.data) {
    return rpcResult.data
  }

  // Fallback: direct join query
  const { data, error } = await sb
    .from('sales_cycles')
    .select(
      `id, company_id, lead_id, owner_user_id, status,
       next_action, next_action_date, stage_entered_at, created_at,
       lead:leads(id, name, phone)`
    )
    .eq('company_id', companyId)
    .is('owner_user_id', null)
    .order('created_at', { ascending: false })

  if (error) throw error

  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    company_id: row.company_id,
    lead_id: row.lead_id,
    owner_user_id: row.owner_user_id,
    status: row.status,
    next_action: row.next_action,
    next_action_date: row.next_action_date,
    stage_entered_at: row.stage_entered_at,
    created_at: row.created_at,
    lead_name: row.lead?.name ?? null,
    lead_phone: row.lead?.phone ?? null,
  })) as PoolCycle[]
}

// ──────────────────────────────────────────────
// Move a cycle to a new stage
// ──────────────────────────────────────────────
export async function moveCycleStage(
  cycleId: string,
  companyId: string,
  fromStatus: CycleStatus,
  toStatus: CycleStatus,
  userId: string,
  opts?: { dealValue?: number | null; lossReason?: string | null }
): Promise<void> {
  const sb = supabaseBrowser()

  const updatePayload: Record<string, any> = {
    status: toStatus,
    stage_entered_at: new Date().toISOString(),
  }

  if (toStatus === 'ganho') {
    updatePayload.closed_at = new Date().toISOString()
    if (opts?.dealValue != null) updatePayload.deal_value = opts.dealValue
  } else if (toStatus === 'perdido') {
    updatePayload.closed_at = new Date().toISOString()
    if (opts?.lossReason) updatePayload.loss_reason = opts.lossReason
  }

  const { error: updateErr } = await sb
    .from('sales_cycles')
    .update(updatePayload)
    .eq('id', cycleId)
    .eq('company_id', companyId)

  if (updateErr) throw updateErr

  // Log event
  await sb.from('cycle_events').insert({
    cycle_id: cycleId,
    company_id: companyId,
    user_id: userId,
    event_type: toStatus === 'ganho' ? 'closed_won' : toStatus === 'perdido' ? 'closed_lost' : 'stage_changed',
    from_stage: fromStatus,
    to_stage: toStatus,
    metadata:
      toStatus === 'ganho'
        ? { deal_value: opts?.dealValue }
        : toStatus === 'perdido'
          ? { loss_reason: opts?.lossReason }
          : {},
  })
}

// ──────────────────────────────────────────────
// Assign an owner to a cycle (pool → seller)
// ──────────────────────────────────────────────
export async function assignCycleOwner(
  cycleId: string,
  companyId: string,
  newOwnerId: string,
  userId: string
): Promise<void> {
  const sb = supabaseBrowser()

  const { error } = await sb
    .from('sales_cycles')
    .update({ owner_user_id: newOwnerId, status: 'contato' })
    .eq('id', cycleId)
    .eq('company_id', companyId)

  if (error) throw error

  await sb.from('cycle_events').insert({
    cycle_id: cycleId,
    company_id: companyId,
    user_id: userId,
    event_type: 'owner_assigned',
    from_stage: null,
    to_stage: null,
    metadata: { new_owner_id: newOwnerId },
  })
}

// ──────────────────────────────────────────────
// Set next action on a cycle
// ──────────────────────────────────────────────
export async function setCycleNextAction(
  cycleId: string,
  companyId: string,
  userId: string,
  nextAction: string | null,
  nextActionDate: string | null
): Promise<void> {
  const sb = supabaseBrowser()

  const { error } = await sb
    .from('sales_cycles')
    .update({ next_action: nextAction, next_action_date: nextActionDate })
    .eq('id', cycleId)
    .eq('company_id', companyId)

  if (error) throw error

  await sb.from('cycle_events').insert({
    cycle_id: cycleId,
    company_id: companyId,
    user_id: userId,
    event_type: 'next_action_set',
    from_stage: null,
    to_stage: null,
    metadata: { next_action: nextAction, next_action_date: nextActionDate },
  })
}
