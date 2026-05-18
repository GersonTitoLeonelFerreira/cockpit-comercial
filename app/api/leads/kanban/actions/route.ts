import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type KanbanActionBody = {
    action?: unknown
    cycle_id?: unknown
    cycle_ids?: unknown
    group_id?: unknown
    name?: unknown
    owner_user_id?: unknown
    owner_ids?: unknown
    reason?: unknown
    details?: unknown
  }

type MembershipRow = {
  company_id: string
  role: string | null
  is_active: boolean | null
}

type CycleRow = {
  id: string
  company_id: string
  owner_user_id: string | null
  current_group_id: string | null
}

type SupabaseAdminClient = SupabaseClient

function jsonError(error: string, status = 400) {
  return NextResponse.json({ ok: false, success: false, error }, { status })
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

async function getCycleForAction(params: {
  admin: SupabaseAdminClient
  companyId: string
  cycleId: string
}) {
  const { admin, companyId, cycleId } = params

  const { data, error } = await admin
    .from('sales_cycles')
    .select('id, company_id, owner_user_id, current_group_id')
    .eq('company_id', companyId)
    .eq('id', cycleId)
    .maybeSingle()

  if (error) throw error

  if (!data) {
    throw new Error('Ciclo não encontrado na empresa ativa.')
  }

  return data as CycleRow
}

async function getCyclesForBulkAction(params: {
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
      .from('sales_cycles')
      .select('id, company_id, owner_user_id, current_group_id')
      .eq('company_id', companyId)
      .in('id', cycleIds)
  
    if (error) throw error
  
    const rows = (data ?? []) as CycleRow[]
  
    if (rows.length !== cycleIds.length) {
      throw new Error('A operação foi bloqueada porque um ou mais ciclos não pertencem à empresa ativa.')
    }
  
    return rows
  }

function canOperateCycle(params: {
  cycle: CycleRow
  userId: string
  role: string | null
}) {
  const { cycle, userId, role } = params

  if (role === 'admin') return true

  return cycle.owner_user_id === userId
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

    const body = (await req.json().catch(() => ({}))) as KanbanActionBody
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
          // Rota operacional sem escrita de cookies.
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

    const admin = createClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

    if (action === 'return_to_pool_with_reason') {
        const cycleId = normalizeUuid(body.cycle_id)
        const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
        const details = typeof body.details === 'string' ? body.details.trim() : ''
  
        if (!cycleId) return jsonError('Ciclo inválido.', 400)
        if (!reason) return jsonError('Motivo obrigatório.', 400)
        if (details.length < 15) return jsonError('Detalhes devem ter pelo menos 15 caracteres.', 400)
  
        const cycle = await getCycleForAction({
          admin,
          companyId: activeCompanyId,
          cycleId,
        })
  
        if (
          !canOperateCycle({
            cycle,
            userId: user.id,
            role: membership.role,
          })
        ) {
          return jsonError('Usuário sem permissão para devolver este ciclo ao Pool.', 403)
        }
  
        const now = new Date().toISOString()
  
        const { data: updated, error: updateError } = await admin
          .from('sales_cycles')
          .update({
            owner_user_id: null,
            updated_at: now,
          })
          .eq('company_id', activeCompanyId)
          .eq('id', cycleId)
          .select('id')
          .maybeSingle()
  
        if (updateError) throw updateError
  
        if (!updated?.id) {
          return jsonError('Ciclo não encontrado ou não atualizado.', 404)
        }
  
        const { error: eventError } = await admin.from('cycle_events').insert({
          cycle_id: cycleId,
          company_id: activeCompanyId,
          event_type: 'returned_to_pool',
          metadata: {
            reason,
            details,
            previous_owner: cycle.owner_user_id,
            source: 'kanban_api',
          },
          created_by: user.id,
          occurred_at: now,
        })
  
        if (eventError) throw eventError
  
        return NextResponse.json({
          ok: true,
          success: true,
          id: updated.id,
        })
      }
  
      if (action === 'reassign_owner') {
        if (membership.role !== 'admin') {
          return jsonError('Apenas admin pode redistribuir ciclos.', 403)
        }
  
        const cycleId = normalizeUuid(body.cycle_id)
        const ownerUserId = normalizeUuid(body.owner_user_id)
  
        if (!cycleId) return jsonError('Ciclo inválido.', 400)
        if (!ownerUserId) return jsonError('Vendedor inválido.', 400)
  
        await validateActiveOwner({
          admin,
          companyId: activeCompanyId,
          ownerUserId,
        })
  
        const cycle = await getCycleForAction({
          admin,
          companyId: activeCompanyId,
          cycleId,
        })
  
        const now = new Date().toISOString()
  
        const { data: updated, error: updateError } = await admin
          .from('sales_cycles')
          .update({
            owner_user_id: ownerUserId,
            updated_at: now,
          })
          .eq('company_id', activeCompanyId)
          .eq('id', cycleId)
          .select('id')
          .maybeSingle()
  
        if (updateError) throw updateError
  
        if (!updated?.id) {
          return jsonError('Ciclo não encontrado ou não atualizado.', 404)
        }
  
        const { error: eventError } = await admin.from('cycle_events').insert({
          cycle_id: cycleId,
          company_id: activeCompanyId,
          event_type: 'reassigned',
          metadata: {
            from_owner: cycle.owner_user_id,
            to_owner: ownerUserId,
            source: 'kanban_api',
          },
          created_by: user.id,
          occurred_at: now,
        })
  
        if (eventError) throw eventError
  
        return NextResponse.json({
          ok: true,
          success: true,
          id: updated.id,
        })
      }

      if (action === 'bulk_return_to_pool') {
        const cycleIds = normalizeUuidArray(body.cycle_ids)
        const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
        const details = typeof body.details === 'string' ? body.details.trim() : ''
  
        if (!reason) {
          return jsonError('Motivo obrigatório.', 400)
        }
  
        if (details.length < 15) {
          return jsonError('Detalhes devem ter pelo menos 15 caracteres.', 400)
        }
  
        const cycles = await getCyclesForBulkAction({
          admin,
          companyId: activeCompanyId,
          cycleIds,
        })
  
        const allowedCycles =
          membership.role === 'admin'
            ? cycles
            : cycles.filter((cycle) => cycle.owner_user_id === user.id)
  
        if (allowedCycles.length === 0) {
          return jsonError('Nenhum ciclo permitido para devolver ao Pool.', 403)
        }
  
        const now = new Date().toISOString()
        const allowedCycleIds = allowedCycles.map((cycle) => cycle.id)
  
        const { data: updated, error: updateError } = await admin
          .from('sales_cycles')
          .update({
            owner_user_id: null,
            updated_at: now,
          })
          .eq('company_id', activeCompanyId)
          .in('id', allowedCycleIds)
          .select('id')
  
        if (updateError) throw updateError
  
        const updatedCycleIds = ((updated ?? []) as Array<{ id: string }>).map((row) => row.id)
  
        if (updatedCycleIds.length > 0) {
          const previousOwnerByCycle = new Map(
            allowedCycles.map((cycle) => [cycle.id, cycle.owner_user_id])
          )
  
          const { error: eventError } = await admin.from('cycle_events').insert(
            updatedCycleIds.map((cycleId) => ({
              cycle_id: cycleId,
              company_id: activeCompanyId,
              event_type: 'returned_to_pool',
              metadata: {
                reason,
                details,
                previous_owner: previousOwnerByCycle.get(cycleId) ?? null,
                source: 'kanban_bulk_api',
              },
              created_by: user.id,
              occurred_at: now,
            })),
          )
  
          if (eventError) throw eventError
        }
  
        return NextResponse.json({
          ok: true,
          success: true,
          updated_count: updatedCycleIds.length,
          skipped_count: cycleIds.length - updatedCycleIds.length,
        })
      }
  
      if (action === 'bulk_reassign_owner') {
        if (membership.role !== 'admin') {
          return jsonError('Apenas admin pode redistribuir ciclos.', 403)
        }
  
        const cycleIds = normalizeUuidArray(body.cycle_ids)
        const ownerUserId = normalizeUuid(body.owner_user_id)
  
        if (!ownerUserId) return jsonError('Vendedor inválido.', 400)
  
        await validateActiveOwner({
          admin,
          companyId: activeCompanyId,
          ownerUserId,
        })
  
        const cycles = await getCyclesForBulkAction({
          admin,
          companyId: activeCompanyId,
          cycleIds,
        })
  
        const now = new Date().toISOString()
  
        const { data: updated, error: updateError } = await admin
          .from('sales_cycles')
          .update({
            owner_user_id: ownerUserId,
            updated_at: now,
          })
          .eq('company_id', activeCompanyId)
          .in('id', cycleIds)
          .select('id')
  
        if (updateError) throw updateError
  
        const updatedCycleIds = ((updated ?? []) as Array<{ id: string }>).map((row) => row.id)
  
        if (updatedCycleIds.length > 0) {
          const previousOwnerByCycle = new Map(
            cycles.map((cycle) => [cycle.id, cycle.owner_user_id])
          )
  
          const { error: eventError } = await admin.from('cycle_events').insert(
            updatedCycleIds.map((cycleId) => ({
              cycle_id: cycleId,
              company_id: activeCompanyId,
              event_type: 'reassigned',
              metadata: {
                from_owner: previousOwnerByCycle.get(cycleId) ?? null,
                to_owner: ownerUserId,
                source: 'kanban_bulk_api',
              },
              created_by: user.id,
              occurred_at: now,
            })),
          )
  
          if (eventError) throw eventError
        }
  
        return NextResponse.json({
          ok: true,
          success: true,
          updated_count: updatedCycleIds.length,
        })
      }
  
      if (action === 'bulk_set_group') {
        const cycleIds = normalizeUuidArray(body.cycle_ids)
        const groupId = body.group_id === null ? null : normalizeUuid(body.group_id)
  
        if (body.group_id !== null && !groupId) {
          return jsonError('Grupo inválido.', 400)
        }
  
        if (groupId) {
          await validateGroup({
            admin,
            companyId: activeCompanyId,
            groupId,
          })
        }
  
        const cycles = await getCyclesForBulkAction({
          admin,
          companyId: activeCompanyId,
          cycleIds,
        })
  
        const allowedCycles =
          membership.role === 'admin'
            ? cycles
            : cycles.filter((cycle) => cycle.owner_user_id === user.id)
  
        if (allowedCycles.length === 0) {
          return jsonError('Nenhum ciclo permitido para vincular grupo.', 403)
        }
  
        const allowedCycleIds = allowedCycles.map((cycle) => cycle.id)
        const now = new Date().toISOString()

        const previousGroupByCycle = new Map(
          allowedCycles.map((cycle) => [cycle.id, cycle.current_group_id]),
        )
  
        const { data: updated, error: updateError } = await admin
          .from('sales_cycles')
          .update({
            current_group_id: groupId,
            updated_at: now,
          })
          .eq('company_id', activeCompanyId)
          .in('id', allowedCycleIds)
          .select('id')
  
        if (updateError) throw updateError

        const updatedCycleIds = ((updated ?? []) as Array<{ id: string }>).map((row) => row.id)

        if (updatedCycleIds.length > 0) {
          const { error: eventError } = await admin.from('cycle_events').insert(
            updatedCycleIds.map((cycleId) => ({
              cycle_id: cycleId,
              company_id: activeCompanyId,
              event_type: 'group_changed',
              metadata: {
                from_group_id: previousGroupByCycle.get(cycleId) ?? null,
                to_group_id: groupId,
                source: 'kanban_bulk_api',
              },
              created_by: user.id,
              occurred_at: now,
            })),
          )

          if (eventError) throw eventError
        }
  
        return NextResponse.json({
          ok: true,
          success: true,
          updated_count: updatedCycleIds.length,
        })
      }
  
      if (action === 'bulk_round_robin') {
        if (membership.role !== 'admin') {
          return jsonError('Apenas admin pode distribuir ciclos automaticamente.', 403)
        }
  
        const cycleIds = normalizeUuidArray(body.cycle_ids)
        const ownerIds = normalizeUuidArray(body.owner_ids)
  
        if (ownerIds.length === 0) {
          return jsonError('Nenhum vendedor informado.', 400)
        }
  
        const { data: validOwners, error: ownersError } = await admin
          .from('company_memberships')
          .select('user_id')
          .eq('company_id', activeCompanyId)
          .eq('is_active', true)
          .in('user_id', ownerIds)
  
        if (ownersError) throw ownersError
  
        const validOwnerIds = new Set(
          ((validOwners ?? []) as Array<{ user_id: string }>).map((row) => row.user_id)
        )
  
        if (validOwnerIds.size !== ownerIds.length) {
          return jsonError('Um ou mais vendedores não pertencem à empresa ativa.', 403)
        }
  
        const cycles = await getCyclesForBulkAction({
          admin,
          companyId: activeCompanyId,
          cycleIds,
        })
  
        const now = new Date().toISOString()
        const updatedCycleIds: string[] = []
        const ownerByCycleId = new Map<string, string>()
        const previousOwnerByCycle = new Map(
          cycles.map((cycle) => [cycle.id, cycle.owner_user_id])
        )
  
        for (let index = 0; index < cycleIds.length; index += 1) {
          const cycleId = cycleIds[index]
          const ownerUserId = ownerIds[index % ownerIds.length]
  
          const { data: updated, error: updateError } = await admin
            .from('sales_cycles')
            .update({
              owner_user_id: ownerUserId,
              updated_at: now,
            })
            .eq('company_id', activeCompanyId)
            .eq('id', cycleId)
            .select('id')
            .maybeSingle()
  
          if (updateError) throw updateError
  
          if (updated?.id) {
            updatedCycleIds.push(updated.id)
            ownerByCycleId.set(updated.id, ownerUserId)
          }
        }
  
        if (updatedCycleIds.length > 0) {
          const { error: eventError } = await admin.from('cycle_events').insert(
            updatedCycleIds.map((cycleId) => ({
              cycle_id: cycleId,
              company_id: activeCompanyId,
              event_type: 'assigned',
              metadata: {
                from_owner: previousOwnerByCycle.get(cycleId) ?? null,
                to_owner: ownerByCycleId.get(cycleId) ?? null,
                round_robin: true,
                source: 'kanban_bulk_api',
              },
              created_by: user.id,
              occurred_at: now,
            })),
          )
  
          if (eventError) throw eventError
        }
  
        return NextResponse.json({
          ok: true,
          success: true,
          updated_count: updatedCycleIds.length,
        })
      }

    if (action === 'set_group') {
      const cycleId = normalizeUuid(body.cycle_id)
      const groupId = body.group_id === null ? null : normalizeUuid(body.group_id)

      if (!cycleId) return jsonError('Ciclo inválido.', 400)

      if (body.group_id !== null && !groupId) {
        return jsonError('Grupo inválido.', 400)
      }

      const cycle = await getCycleForAction({
        admin,
        companyId: activeCompanyId,
        cycleId,
      })

      if (
        !canOperateCycle({
          cycle,
          userId: user.id,
          role: membership.role,
        })
      ) {
        return jsonError('Usuário sem permissão para alterar este ciclo.', 403)
      }

      if (groupId) {
        await validateGroup({
          admin,
          companyId: activeCompanyId,
          groupId,
        })
      }

      const now = new Date().toISOString()

      const { data: updated, error: updateError } = await admin
        .from('sales_cycles')
        .update({
          current_group_id: groupId,
          updated_at: now,
        })
        .eq('company_id', activeCompanyId)
        .eq('id', cycleId)
        .select('id')
        .maybeSingle()

      if (updateError) throw updateError

      if (!updated?.id) {
        return jsonError('Ciclo não encontrado ou não atualizado.', 404)
      }

      const { error: eventError } = await admin.from('cycle_events').insert({
        cycle_id: cycleId,
        company_id: activeCompanyId,
        event_type: 'group_changed',
        metadata: {
          from_group_id: cycle.current_group_id,
          to_group_id: groupId,
          source: 'kanban_api',
        },
        created_by: user.id,
        occurred_at: now,
      })

      if (eventError) throw eventError

      return NextResponse.json({
        ok: true,
        success: true,
        id: updated.id,
      })
    }

    if (action === 'create_group') {
      if (membership.role !== 'admin') {
        return jsonError('Apenas admin pode criar grupos.', 403)
      }

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
        error: getErrorMessage(error, 'Erro ao executar ação do Kanban.'),
      },
      { status: 500 },
    )
  }
}