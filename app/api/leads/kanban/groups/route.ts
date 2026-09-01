import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type KanbanScope = 'mine' | 'seller' | 'company'

type MembershipRow = {
  company_id: string
  role: string | null
  is_active: boolean | null
}

type LeadGroupRow = {
  id: string
  name: string
}

type SupabaseAdminClient = SupabaseClient

function normalizeOptionalUuid(value: string | null) {
  if (!value) return null

  const trimmed = value.trim()

  if (!trimmed) return null

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

  return uuidRegex.test(trimmed) ? trimmed : null
}

function normalizeKanbanScope(value: string | null): KanbanScope | null {
  if (value === 'mine' || value === 'seller' || value === 'company') {
    return value
  }

  return null
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

export async function GET(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !anon || !serviceKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'ENV faltando: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY ou SUPABASE_SERVICE_ROLE_KEY.',
        },
        { status: 500 },
      )
    }

    const requestUrl = new URL(req.url)
    const ownerIdParam = normalizeOptionalUuid(requestUrl.searchParams.get('owner_id'))
    const requestedScope = normalizeKanbanScope(requestUrl.searchParams.get('scope'))

    const cookieStore = await cookies()
    const activeCompanyId = cookieStore.get('cockpit_active_company_id')?.value ?? null

    if (!activeCompanyId) {
      return NextResponse.json(
        { ok: false, error: 'Empresa ativa não selecionada.' },
        { status: 400 },
      )
    }

    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          // Rota de leitura sem escrita de cookies.
        },
      },
    })

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user?.id) {
      return NextResponse.json(
        { ok: false, error: 'Usuário não autenticado.' },
        { status: 401 },
      )
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, is_active_global')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      return NextResponse.json(
        { ok: false, error: profileError.message },
        { status: 400 },
      )
    }

    if (!profile?.id) {
      return NextResponse.json(
        { ok: false, error: 'Perfil do usuário logado não encontrado.' },
        { status: 403 },
      )
    }

    if (profile.is_active_global === false) {
      return NextResponse.json(
        { ok: false, error: 'Usuário globalmente inativo.' },
        { status: 403 },
      )
    }

    const { data: actorMembership, error: membershipError } = await supabase
      .from('company_memberships')
      .select('company_id, role, is_active')
      .eq('company_id', activeCompanyId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()

    if (membershipError) {
      return NextResponse.json(
        { ok: false, error: membershipError.message },
        { status: 400 },
      )
    }

    const membership = actorMembership as MembershipRow | null

    if (!membership?.company_id) {
      return NextResponse.json(
        { ok: false, error: 'Usuário sem vínculo ativo com a empresa.' },
        { status: 403 },
      )
    }

    const canViewTeam = membership.role === 'admin' || membership.role === 'manager'

    const scope: KanbanScope =
      requestedScope ?? (canViewTeam ? (ownerIdParam ? 'seller' : 'company') : 'mine')

    if (!canViewTeam && scope !== 'mine') {
      return NextResponse.json(
        { ok: false, error: 'Usuário sem permissão para visualizar grupos desse escopo.' },
        { status: 403 },
      )
    }

    const effectiveOwnerId =
      scope === 'mine'
        ? user.id
        : scope === 'seller'
          ? ownerIdParam
          : null

    if (scope === 'seller' && !effectiveOwnerId) {
      return NextResponse.json(
        { ok: false, error: 'Vendedor não informado para carregar grupos.' },
        { status: 400 },
      )
    }

    const admin = createClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

    let companyScopeOwnerIds: string[] | null = null

    if (scope === 'seller' && effectiveOwnerId) {
      await validateActiveOwner({
        admin,
        companyId: activeCompanyId,
        ownerUserId: effectiveOwnerId,
      })
    }

    if (scope === 'company') {
      const { data: activeOwners, error: activeOwnersError } = await admin
        .from('company_memberships')
        .select('user_id')
        .eq('company_id', activeCompanyId)
        .eq('is_active', true)

      if (activeOwnersError) {
        return NextResponse.json(
          { ok: false, error: activeOwnersError.message },
          { status: 400 },
        )
      }

      companyScopeOwnerIds = ((activeOwners ?? []) as Array<{ user_id: string }>)
        .map((owner) => owner.user_id)
        .filter(Boolean)

      if (companyScopeOwnerIds.length === 0) {
        return NextResponse.json({
          ok: true,
          groups: [],
        })
      }
    }

    if (scope !== 'company' && !effectiveOwnerId) {
      return NextResponse.json({
        ok: true,
        groups: [],
      })
    }

    const groupIdRows: Array<{ group_id: string | null }> = []

    for (let from = 0; ; from += 1000) {
      let groupIdQuery = admin
        .from('v_pipeline_items')
        .select('id, group_id')
        .eq('company_id', activeCompanyId)
        .not('group_id', 'is', null)
        .order('id', { ascending: true })
        .range(from, from + 999)

      if (scope === 'company') {
        groupIdQuery = groupIdQuery
          .not('owner_id', 'is', null)
          .in('owner_id', companyScopeOwnerIds ?? [])
      } else {
        groupIdQuery = groupIdQuery.eq('owner_id', effectiveOwnerId)
      }

      const { data, error: groupIdError } = await groupIdQuery

      if (groupIdError) {
        return NextResponse.json(
          { ok: false, error: groupIdError.message },
          { status: 400 },
        )
      }

      const page = (data ?? []) as Array<{ group_id: string | null }>
      groupIdRows.push(...page)

      if (page.length < 1000) break
    }

    const groupIds = Array.from(
      new Set(
        groupIdRows
          .map((row) => row.group_id)
          .filter((id): id is string => Boolean(id)),
      ),
    )

    if (groupIds.length === 0) {
      return NextResponse.json({
        ok: true,
        groups: [],
      })
    }

    const { data: groups, error: groupsError } = await admin
      .from('lead_groups')
      .select('id, name')
      .eq('company_id', activeCompanyId)
      .is('archived_at', null)
      .in('id', groupIds)
      .order('name', { ascending: true })

    if (groupsError) {
      return NextResponse.json(
        { ok: false, error: groupsError.message },
        { status: 400 },
      )
    }

    return NextResponse.json({
      ok: true,
      groups: (groups ?? []) as LeadGroupRow[],
    })
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Erro ao carregar grupos do Kanban.',
      },
      { status: 500 },
    )
  }
}
