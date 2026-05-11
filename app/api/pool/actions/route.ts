import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type PoolActionBody = {
  action?: unknown
  cycle_ids?: unknown
  owner_user_id?: unknown
  owner_ids?: unknown
  group_id?: unknown
  name?: unknown
}

type MembershipRow = {
    company_id: string
    role: string | null
    is_active: boolean | null
  }
  
  type SupabaseAdminClient = SupabaseClient
  
  type CycleRow = {
  id: string
  owner_id: string | null
  group_id: string | null
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'details' in error &&
    typeof (error as { details?: unknown }).details === 'string'
  ) {
    return (error as { details: string }).details
  }

  return fallback
}

function jsonError(error: string, status = 400) {
  return NextResponse.json({ ok: false, success: false, error }, { status })
}

function normalizeUuid(value: unknown) {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

  return uuidRegex.test(trimmed) ? trimmed : null
}

function normalizeUuidArray(value: unknown) {
  if (!Array.isArray(value)) return []

  return Array.from(
    new Set(
      value
        .map((item) => normalizeUuid(item))
        .filter((item): item is string => Boolean(item)),
    ),
  )
}

function normalizeName(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.trim()
}

async function validateCycles(params: {
    admin: SupabaseAdminClient
  companyId: string
  cycleIds: string[]
}) {
  const { admin, companyId, cycleIds } = params

  if (cycleIds.length === 0) {
    throw new Error('Nenhum ciclo informado.')
  }

  if (cycleIds.length > 1000) {
    throw new Error('Limite máximo de 1000 ciclos por operação.')
  }

  const { data, error } = await admin
    .from('v_pipeline_items')
    .select('id, owner_id, group_id')
    .eq('company_id', companyId)
    .in('id', cycleIds)

  if (error) throw error

  const rows = (data ?? []) as CycleRow[]

  if (rows.length !== cycleIds.length) {
    throw new Error('A operação foi bloqueada porque um ou mais ciclos não pertencem à empresa ativa.')
  }

  return rows
}

async function validateActiveOwner(params: {
    admin: SupabaseAdminClient
  companyId: string
  ownerUserId: string
}) {
  const { admin, companyId, ownerUserId } = params

  const { data, error } = await admin
    .from('company_memberships')
    .select('user_id')
    .eq('company_id', companyId)
    .eq('user_id', ownerUserId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) throw error

  if (!data) {
    throw new Error('Vendedor sem vínculo ativo com a empresa.')
  }
}

async function validateActiveOwners(params: {
    admin: SupabaseAdminClient
  companyId: string
  ownerIds: string[]
}) {
  const { admin, companyId, ownerIds } = params

  if (ownerIds.length === 0) {
    throw new Error('Nenhum vendedor informado.')
  }

  const { data, error } = await admin
    .from('company_memberships')
    .select('user_id')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .in('user_id', ownerIds)

  if (error) throw error

  const validIds = new Set(((data ?? []) as Array<{ user_id: string }>).map((row) => row.user_id))

  if (validIds.size !== ownerIds.length) {
    throw new Error('A operação foi bloqueada porque um ou mais vendedores não pertencem à empresa ativa.')
  }
}

async function validateGroup(params: {
    admin: SupabaseAdminClient
  companyId: string
  groupId: string
}) {
  const { admin, companyId, groupId } = params

  const { data, error } = await admin
    .from('lead_groups')
    .select('id')
    .eq('company_id', companyId)
    .eq('id', groupId)
    .is('archived_at', null)
    .maybeSingle()

  if (error) throw error

  if (!data) {
    throw new Error('Grupo não encontrado na empresa ativa.')
  }
}

async function insertAssignmentEvents(params: {
    admin: SupabaseAdminClient
  companyId: string
  actorUserId: string
  cycleIds: string[]
  ownerByCycleId: Map<string, string>
  roundRobin?: boolean
}) {
  const { admin, companyId, actorUserId, cycleIds, ownerByCycleId, roundRobin } = params

  const now = new Date().toISOString()

  const events = cycleIds.map((cycleId) => ({
    cycle_id: cycleId,
    company_id: companyId,
    event_type: 'assigned',
    metadata: {
      to_owner: ownerByCycleId.get(cycleId) ?? null,
      round_robin: Boolean(roundRobin),
      source: 'pool_api',
    },
    created_by: actorUserId,
    occurred_at: now,
  }))

  const { error } = await admin.from('cycle_events').insert(events)

  if (error) throw error
}

export async function POST(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !anon || !serviceKey) {
      return jsonError(
        'ENV faltando: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY ou SUPABASE_SERVICE_ROLE_KEY.',
        500,
      )
    }

    const body = (await req.json().catch(() => ({}))) as PoolActionBody
    const action = typeof body.action === 'string' ? body.action : ''

    const cookieStore = await cookies()
    const activeCompanyId = cookieStore.get('cockpit_active_company_id')?.value ?? null

    if (!activeCompanyId) {
      return jsonError('Empresa ativa não selecionada.', 400)
    }

    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          // Rota administrativa sem escrita de cookies.
        },
      },
    })

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user?.id) {
      return jsonError('Usuário não autenticado.', 401)
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, is_active_global')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) return jsonError(profileError.message, 400)
    if (!profile?.id) return jsonError('Perfil do usuário logado não encontrado.', 403)
    if (profile.is_active_global === false) return jsonError('Usuário globalmente inativo.', 403)

    const { data: actorMembership, error: membershipError } = await supabase
      .from('company_memberships')
      .select('company_id, role, is_active')
      .eq('company_id', activeCompanyId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()

    if (membershipError) return jsonError(membershipError.message, 400)

    const membership = actorMembership as MembershipRow | null

    if (!membership?.company_id) {
      return jsonError('Usuário sem vínculo ativo com a empresa.', 403)
    }

    if (membership.role !== 'admin') {
      return jsonError('Apenas admin pode executar ações no Pool.', 403)
    }

    const admin = createClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

    if (action === 'assign_owner') {
      const cycleIds = normalizeUuidArray(body.cycle_ids)
      const ownerUserId = normalizeUuid(body.owner_user_id)

      if (!ownerUserId) return jsonError('Vendedor inválido.', 400)

      await validateActiveOwner({ admin, companyId: activeCompanyId, ownerUserId })
      await validateCycles({ admin, companyId: activeCompanyId, cycleIds })

      const now = new Date().toISOString()

      const { data: updated, error } = await admin
        .from('sales_cycles')
        .update({
          owner_user_id: ownerUserId,
          updated_at: now,
        })
        .eq('company_id', activeCompanyId)
        .in('id', cycleIds)
        .select('id')

      if (error) throw error

      const updatedCycleIds = ((updated ?? []) as Array<{ id: string }>).map((row) => row.id)
      const ownerByCycleId = new Map(updatedCycleIds.map((cycleId) => [cycleId, ownerUserId]))

      if (updatedCycleIds.length > 0) {
        await insertAssignmentEvents({
          admin,
          companyId: activeCompanyId,
          actorUserId: user.id,
          cycleIds: updatedCycleIds,
          ownerByCycleId,
        })
      }

      return NextResponse.json({
        ok: true,
        success: true,
        updated_count: updatedCycleIds.length,
      })
    }

    if (action === 'round_robin') {
      const cycleIds = normalizeUuidArray(body.cycle_ids)
      const ownerIds = normalizeUuidArray(body.owner_ids)

      await validateActiveOwners({ admin, companyId: activeCompanyId, ownerIds })
      await validateCycles({ admin, companyId: activeCompanyId, cycleIds })

      const now = new Date().toISOString()
      const updatedCycleIds: string[] = []
      const ownerByCycleId = new Map<string, string>()

      for (let index = 0; index < cycleIds.length; index += 1) {
        const cycleId = cycleIds[index]
        const ownerUserId = ownerIds[index % ownerIds.length]

        const { data: updated, error } = await admin
          .from('sales_cycles')
          .update({
            owner_user_id: ownerUserId,
            updated_at: now,
          })
          .eq('company_id', activeCompanyId)
          .eq('id', cycleId)
          .select('id')
          .maybeSingle()

        if (error) throw error

        if (updated?.id) {
          updatedCycleIds.push(updated.id)
          ownerByCycleId.set(updated.id, ownerUserId)
        }
      }

      if (updatedCycleIds.length > 0) {
        await insertAssignmentEvents({
          admin,
          companyId: activeCompanyId,
          actorUserId: user.id,
          cycleIds: updatedCycleIds,
          ownerByCycleId,
          roundRobin: true,
        })
      }

      return NextResponse.json({
        ok: true,
        success: true,
        updated_count: updatedCycleIds.length,
      })
    }

    if (action === 'round_robin_group_pool') {
      const groupId = normalizeUuid(body.group_id)
      const ownerIds = normalizeUuidArray(body.owner_ids)

      if (!groupId) return jsonError('Grupo inválido.', 400)

      await validateGroup({ admin, companyId: activeCompanyId, groupId })
      await validateActiveOwners({ admin, companyId: activeCompanyId, ownerIds })

      const { data: groupCycles, error: groupCyclesError } = await admin
        .from('v_pipeline_items')
        .select('id')
        .eq('company_id', activeCompanyId)
        .eq('group_id', groupId)
        .is('owner_id', null)

      if (groupCyclesError) throw groupCyclesError

      const cycleIds = ((groupCycles ?? []) as Array<{ id: string }>).map((cycle) => cycle.id)

      if (cycleIds.length === 0) {
        return NextResponse.json({
          ok: true,
          success: true,
          updated_count: 0,
        })
      }

      const now = new Date().toISOString()
      const updatedCycleIds: string[] = []
      const ownerByCycleId = new Map<string, string>()

      for (let index = 0; index < cycleIds.length; index += 1) {
        const cycleId = cycleIds[index]
        const ownerUserId = ownerIds[index % ownerIds.length]

        const { data: updated, error } = await admin
          .from('sales_cycles')
          .update({
            owner_user_id: ownerUserId,
            updated_at: now,
          })
          .eq('company_id', activeCompanyId)
          .eq('id', cycleId)
          .select('id')
          .maybeSingle()

        if (error) throw error

        if (updated?.id) {
          updatedCycleIds.push(updated.id)
          ownerByCycleId.set(updated.id, ownerUserId)
        }
      }

      if (updatedCycleIds.length > 0) {
        await insertAssignmentEvents({
          admin,
          companyId: activeCompanyId,
          actorUserId: user.id,
          cycleIds: updatedCycleIds,
          ownerByCycleId,
          roundRobin: true,
        })
      }

      return NextResponse.json({
        ok: true,
        success: true,
        updated_count: updatedCycleIds.length,
      })
    }

    if (action === 'set_group') {
      const cycleIds = normalizeUuidArray(body.cycle_ids)
      const groupId = body.group_id === null ? null : normalizeUuid(body.group_id)

      if (body.group_id !== null && !groupId) {
        return jsonError('Grupo inválido.', 400)
      }

      if (groupId) {
        await validateGroup({ admin, companyId: activeCompanyId, groupId })
      }

      await validateCycles({ admin, companyId: activeCompanyId, cycleIds })

      const { data: updated, error } = await admin
        .from('sales_cycles')
        .update({
          current_group_id: groupId,
          updated_at: new Date().toISOString(),
        })
        .eq('company_id', activeCompanyId)
        .in('id', cycleIds)
        .select('id')

      if (error) throw error

      return NextResponse.json({
        ok: true,
        success: true,
        updated_count: (updated ?? []).length,
      })
    }

    if (action === 'recall_group_to_pool') {
      const groupId = normalizeUuid(body.group_id)

      if (!groupId) return jsonError('Grupo inválido.', 400)

      await validateGroup({ admin, companyId: activeCompanyId, groupId })

      const operationalStatuses = ['novo', 'contato', 'respondeu', 'negociacao']

      const { data: updated, error } = await admin
        .from('sales_cycles')
        .update({
          owner_user_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq('company_id', activeCompanyId)
        .eq('current_group_id', groupId)
        .in('status', operationalStatuses)
        .select('id')

      if (error) throw error

      return NextResponse.json({
        ok: true,
        success: true,
        updated_count: (updated ?? []).length,
      })
    }

    if (action === 'archive_group') {
      const groupId = normalizeUuid(body.group_id)

      if (!groupId) return jsonError('Grupo inválido.', 400)

      await validateGroup({ admin, companyId: activeCompanyId, groupId })

      const { error: archiveError } = await admin
        .from('lead_groups')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', groupId)
        .eq('company_id', activeCompanyId)

      if (archiveError) throw archiveError

      return NextResponse.json({
        ok: true,
        success: true,
      })
    }

    if (action === 'create_group') {
      const name = normalizeName(body.name)

      if (!name) return jsonError('Nome do grupo é obrigatório.', 400)
      if (name.length > 120) return jsonError('Nome do grupo muito longo.', 400)

      const { data: existingGroups, error: existingError } = await admin
      .from('lead_groups')
      .select('id')
      .eq('company_id', activeCompanyId)
      .eq('name', name)
      .is('archived_at', null)
      .limit(1)
    
    if (existingError) throw existingError
    
    if ((existingGroups ?? []).length > 0) {
      return jsonError('Já existe um grupo com esse nome.', 409)
    }

    const { data: inserted, error: insertError } = await admin
    .from('lead_groups')
    .insert({
      company_id: activeCompanyId,
      name,
      created_by: user.id,
    })
    .select('id, name')
    .single()

      if (insertError) throw insertError

      return NextResponse.json({
        ok: true,
        success: true,
        id: inserted.id,
        name: inserted.name,
      })
    }

    return jsonError('Ação inválida.', 400)
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        error: getErrorMessage(error, 'Erro ao executar ação do Pool.'),
      },
      { status: 500 },
    )
  }
}