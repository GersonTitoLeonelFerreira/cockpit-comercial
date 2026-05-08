import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

type MembershipRow = {
  company_id: string
  role: string | null
  is_active: boolean | null
}

type PipelineRow = {
  id: string
  lead_id: string
  name: string
  phone: string | null
  email: string | null
  status: string
  owner_id: string | null
  group_id: string | null
  created_at: string
}

type CycleEventRow = {
  cycle_id: string
  metadata: {
    reason?: string | null
    details?: string | null
  } | null
  occurred_at: string | null
  created_by: string | null
}

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback
  }

  return Math.min(parsed, max)
}

function normalizeOptionalUuid(value: string | null) {
  if (!value) return null

  const trimmed = value.trim()

  if (!trimmed) return null

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

  return uuidRegex.test(trimmed) ? trimmed : null
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
    const selectedGroupId = normalizeOptionalUuid(requestUrl.searchParams.get('group_id'))
    const page = parsePositiveInt(requestUrl.searchParams.get('page'), 1, 10000)
    const pageSize = parsePositiveInt(requestUrl.searchParams.get('page_size'), 50, 200)
    const offset = (page - 1) * pageSize

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

    if (membership.role !== 'admin') {
      return NextResponse.json(
        { ok: false, error: 'Apenas admin pode acessar o Pool.' },
        { status: 403 },
      )
    }

    const admin = createClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

    let countQuery = admin
      .from('v_pipeline_items')
      .select('id', { head: true, count: 'exact' })
      .eq('company_id', activeCompanyId)
      .is('owner_id', null)

    if (selectedGroupId) {
      countQuery = countQuery.eq('group_id', selectedGroupId)
    }

    const { count, error: countError } = await countQuery

    if (countError) {
      return NextResponse.json(
        { ok: false, error: countError.message },
        { status: 400 },
      )
    }

    let poolQuery = admin
      .from('v_pipeline_items')
      .select('id, lead_id, name, phone, email, status, owner_id, group_id, created_at')
      .eq('company_id', activeCompanyId)
      .is('owner_id', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1)

    if (selectedGroupId) {
      poolQuery = poolQuery.eq('group_id', selectedGroupId)
    }

    const { data: poolRows, error: poolError } = await poolQuery

    if (poolError) {
      return NextResponse.json(
        { ok: false, error: poolError.message },
        { status: 400 },
      )
    }

    const rows = (poolRows ?? []) as PipelineRow[]
    const cycleIds = rows.map((row) => row.id)
    const groupIds = Array.from(
      new Set(rows.map((row) => row.group_id).filter((id): id is string => Boolean(id))),
    )

    const groupNameById = new Map<string, string>()

    if (groupIds.length > 0) {
      const { data: groups, error: groupsError } = await admin
        .from('lead_groups')
        .select('id, name')
        .eq('company_id', activeCompanyId)
        .in('id', groupIds)

      if (groupsError) {
        return NextResponse.json(
          { ok: false, error: groupsError.message },
          { status: 400 },
        )
      }

      for (const group of (groups ?? []) as Array<{ id: string; name: string }>) {
        groupNameById.set(group.id, group.name)
      }
    }

    const latestReturnByCycle = new Map<string, CycleEventRow>()

    if (cycleIds.length > 0) {
      const { data: events, error: eventsError } = await admin
        .from('cycle_events')
        .select('cycle_id, metadata, occurred_at, created_by')
        .eq('company_id', activeCompanyId)
        .eq('event_type', 'returned_to_pool')
        .in('cycle_id', cycleIds)
        .order('occurred_at', { ascending: false })

      if (eventsError) {
        return NextResponse.json(
          { ok: false, error: eventsError.message },
          { status: 400 },
        )
      }

      for (const event of (events ?? []) as CycleEventRow[]) {
        if (!latestReturnByCycle.has(event.cycle_id)) {
          latestReturnByCycle.set(event.cycle_id, event)
        }
      }
    }

    const items = rows.map((row) => {
      const event = latestReturnByCycle.get(row.id)

      return {
        ...row,
        lead_groups: row.group_id
          ? {
              name: groupNameById.get(row.group_id) ?? null,
            }
          : null,
        last_return_reason: event?.metadata?.reason ?? null,
        last_return_details: event?.metadata?.details ?? null,
        last_return_at: event?.occurred_at ?? null,
        last_return_by: event?.created_by ?? null,
      }
    })

    const total = count ?? 0

    return NextResponse.json({
      ok: true,
      items,
      total,
      hasMore: offset + pageSize < total,
    })
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Erro ao carregar Pool.',
      },
      { status: 500 },
    )
  }
}