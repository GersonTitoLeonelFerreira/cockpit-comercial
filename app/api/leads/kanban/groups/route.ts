import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

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

    const isAdmin = membership.role === 'admin'
    const effectiveOwnerId = isAdmin ? (ownerIdParam ?? user.id) : user.id

    const admin = createClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

    await validateActiveOwner({
      admin,
      companyId: activeCompanyId,
      ownerUserId: effectiveOwnerId,
    })

    const { data: ownerCycles, error: ownerCyclesError } = await admin
      .from('sales_cycles')
      .select('current_group_id')
      .eq('company_id', activeCompanyId)
      .eq('owner_user_id', effectiveOwnerId)
      .not('current_group_id', 'is', null)

    if (ownerCyclesError) {
      return NextResponse.json(
        { ok: false, error: ownerCyclesError.message },
        { status: 400 },
      )
    }

    const groupIdsFromCycles = Array.from(
      new Set(
        ((ownerCycles ?? []) as Array<{ current_group_id: string | null }>)
          .map((cycle) => cycle.current_group_id)
          .filter((id): id is string => Boolean(id)),
      ),
    )

    const groupMap = new Map<string, LeadGroupRow>()

    const creatorIds = Array.from(
        new Set([effectiveOwnerId, ...(isAdmin ? [user.id] : [])]),
      )
  
      const { data: createdGroups, error: createdGroupsError } = await admin
        .from('lead_groups')
        .select('id, name')
        .eq('company_id', activeCompanyId)
        .in('created_by', creatorIds)
        .is('archived_at', null)
        .order('name', { ascending: true })
  
      if (createdGroupsError) {
        return NextResponse.json(
          { ok: false, error: createdGroupsError.message },
          { status: 400 },
        )
      }
  
      for (const group of (createdGroups ?? []) as LeadGroupRow[]) {
        groupMap.set(group.id, group)
      }

    if (groupIdsFromCycles.length > 0) {
      const { data: cycleGroups, error: cycleGroupsError } = await admin
        .from('lead_groups')
        .select('id, name')
        .eq('company_id', activeCompanyId)
        .is('archived_at', null)
        .in('id', groupIdsFromCycles)
        .order('name', { ascending: true })

      if (cycleGroupsError) {
        return NextResponse.json(
          { ok: false, error: cycleGroupsError.message },
          { status: 400 },
        )
      }

      for (const group of (cycleGroups ?? []) as LeadGroupRow[]) {
        groupMap.set(group.id, group)
      }
    }

    const groups = Array.from(groupMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR'),
    )

    return NextResponse.json({
      ok: true,
      groups,
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