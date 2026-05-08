import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type GroupActionBody = {
  action?: unknown
  group_id?: unknown
  name?: unknown
  description?: unknown
}

type MembershipRow = {
  company_id: string
  role: string | null
  is_active: boolean | null
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

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.trim()
}

async function getRequestContext() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !anon || !serviceKey) {
    throw new Error(
      'ENV faltando: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY ou SUPABASE_SERVICE_ROLE_KEY.',
    )
  }

  const cookieStore = await cookies()
  const activeCompanyId = cookieStore.get('cockpit_active_company_id')?.value ?? null

  if (!activeCompanyId) {
    throw new Error('Empresa ativa não selecionada.')
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
    throw new Error('Usuário não autenticado.')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, is_active_global')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) throw profileError
  if (!profile?.id) throw new Error('Perfil do usuário logado não encontrado.')
  if (profile.is_active_global === false) throw new Error('Usuário globalmente inativo.')

  const { data: actorMembership, error: membershipError } = await supabase
    .from('company_memberships')
    .select('company_id, role, is_active')
    .eq('company_id', activeCompanyId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (membershipError) throw membershipError

  const membership = actorMembership as MembershipRow | null

  if (!membership?.company_id) {
    throw new Error('Usuário sem vínculo ativo com a empresa.')
  }

  if (membership.role !== 'admin') {
    throw new Error('Apenas admin pode executar ações em grupos.')
  }

  const admin = createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  return {
    admin,
    activeCompanyId,
    userId: user.id,
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
    .maybeSingle()

  if (error) throw error

  if (!data) {
    throw new Error('Grupo não encontrado na empresa ativa.')
  }
}

export async function GET() {
  try {
    const { admin, activeCompanyId } = await getRequestContext()

    const { data: groups, error } = await admin
      .from('lead_groups')
      .select('id, name, description, archived_at')
      .eq('company_id', activeCompanyId)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({
      ok: true,
      groups: groups ?? [],
    })
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: getErrorMessage(error, 'Erro ao carregar grupos.'),
      },
      { status: 500 },
    )
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as GroupActionBody
    const action = typeof body.action === 'string' ? body.action : ''
    const groupId = normalizeUuid(body.group_id)

    const { admin, activeCompanyId, userId } = await getRequestContext()

    if (action === 'create_group') {
      const name = normalizeText(body.name)
      const description = normalizeText(body.description)

      if (!name) {
        return jsonError('Nome do grupo é obrigatório.', 400)
      }

      if (name.length > 120) {
        return jsonError('Nome do grupo muito longo.', 400)
      }

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
          description: description || null,
          created_by: userId,
        })
        .select('id')
        .single()

      if (insertError) throw insertError

      return NextResponse.json({
        ok: true,
        success: true,
        id: inserted.id,
      })
    }

    if (!groupId) {
      return jsonError('Grupo inválido.', 400)
    }

    await validateGroup({
      admin,
      companyId: activeCompanyId,
      groupId,
    })

    if (action === 'archive_group') {
        const { error } = await admin
          .from('lead_groups')
          .update({
            archived_at: new Date().toISOString(),
          })
          .eq('company_id', activeCompanyId)
          .eq('id', groupId)
  
        if (error) throw error
  
        return NextResponse.json({
          ok: true,
          success: true,
        })
      }
  
      if (action === 'unarchive_group') {
        const { error } = await admin
          .from('lead_groups')
          .update({
            archived_at: null,
          })
          .eq('company_id', activeCompanyId)
          .eq('id', groupId)
  
        if (error) throw error
  
        return NextResponse.json({
          ok: true,
          success: true,
        })
      }

    if (action === 'detach_group_cycles') {
      const { data: updated, error: updateError } = await admin
        .from('sales_cycles')
        .update({
          current_group_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq('company_id', activeCompanyId)
        .eq('current_group_id', groupId)
        .select('id')

      if (updateError) throw updateError

      return NextResponse.json({
        ok: true,
        success: true,
        updated_count: (updated ?? []).length,
      })
    }

    if (action === 'recall_group_to_pool') {
      const { data: cycles, error: cyclesError } = await admin
        .from('sales_cycles')
        .select('id, owner_user_id')
        .eq('company_id', activeCompanyId)
        .eq('current_group_id', groupId)

      if (cyclesError) throw cyclesError

      const cycleRows = (cycles ?? []) as Array<{
        id: string
        owner_user_id: string | null
      }>

      const now = new Date().toISOString()

      const { data: updated, error: updateError } = await admin
        .from('sales_cycles')
        .update({
          owner_user_id: null,
          updated_at: now,
        })
        .eq('company_id', activeCompanyId)
        .eq('current_group_id', groupId)
        .select('id')

      if (updateError) throw updateError

      const updatedCycleIds = ((updated ?? []) as Array<{ id: string }>).map((row) => row.id)

      if (updatedCycleIds.length > 0) {
        const previousOwnerByCycle = new Map(
          cycleRows.map((cycle) => [cycle.id, cycle.owner_user_id]),
        )

        const { error: eventError } = await admin.from('cycle_events').insert(
          updatedCycleIds.map((cycleId) => ({
            cycle_id: cycleId,
            company_id: activeCompanyId,
            event_type: 'returned_to_pool',
            metadata: {
              previous_owner: previousOwnerByCycle.get(cycleId) ?? null,
              group_id: groupId,
              source: 'groups_admin_api',
            },
            created_by: userId,
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

    return jsonError('Ação inválida.', 400)
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        success: false,
        error: getErrorMessage(error, 'Erro ao executar ação do grupo.'),
      },
      { status: 500 },
    )
  }
}