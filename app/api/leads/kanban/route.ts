import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

type Status = 'novo' | 'contato' | 'respondeu' | 'negociacao' | 'ganho' | 'perdido'
type KanbanScope = 'mine' | 'seller' | 'company'

type MembershipRow = {
  company_id: string
  role: string | null
  is_active: boolean | null
}

type KanbanRow = {
  id: string
  lead_id: string
  owner_id: string | null
  group_id: string | null
  status: Status
  stage_entered_at: string
  name: string
  phone: string | null
  email: string | null
  cpf: string | null
  document: string | null
  phone_digits: string | null
  document_digits: string | null
  next_action: string | null
  next_action_date: string | null
  created_at: string
  updated_at: string | null
  terminal_closed_on: string | null
  terminal_won_total: number | null
  terminal_lost_reason: string | null
  terminal_product_name: string | null
}

const STATUSES: Status[] = ['novo', 'contato', 'respondeu', 'negociacao', 'ganho', 'perdido']

const ACTIVE_STATUSES: Status[] = ['novo', 'contato', 'respondeu', 'negociacao']

type CompetencyMonthRange = {
  start: string
  endExclusive: string
}

function toDateKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}-01`
}

function getCurrentCompetencyMonthInSaoPaulo(): CompetencyMonthRange {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date())

  const year = Number(parts.find((part) => part.type === 'year')?.value)
  const month = Number(parts.find((part) => part.type === 'month')?.value)

  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    throw new Error('Não foi possível identificar a competência atual do Kanban.')
  }

  const nextMonth = new Date(Date.UTC(year, month, 1))

  return {
    start: toDateKey(year, month),
    endExclusive: toDateKey(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth() + 1),
  }
}

function emptyItemsByStatus(): Record<Status, KanbanRow[]> {
  return {
    novo: [],
    contato: [],
    respondeu: [],
    negociacao: [],
    ganho: [],
    perdido: [],
  }
}

function emptyTotals(): Record<Status, number> {
  return {
    novo: 0,
    contato: 0,
    respondeu: 0,
    negociacao: 0,
    ganho: 0,
    perdido: 0,
  }
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

function normalizeKanbanScope(value: string | null): KanbanScope | null {
  if (value === 'mine' || value === 'seller' || value === 'company') {
    return value
  }

  return null
}

function normalizeSearch(value: string | null) {
  return (value ?? '')
    .trim()
    .replace(/[,%()]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 120)
}

function detectSearchType(term: string): 'email' | 'numeric' | 'name' | 'empty' {
  const clean = term.trim()

  if (!clean) return 'empty'
  if (clean.includes('@')) return 'email'

  const digits = clean.replace(/\D/g, '')

  if (digits.length >= 6) return 'numeric'

  return 'name'
}

function applySearchParams(params: {
  searchType: 'email' | 'numeric' | 'name' | 'empty'
  searchTerm: string
  searchDigits: string
}) {
  const { searchType, searchTerm, searchDigits } = params

  if (searchType === 'email') {
    return `email.ilike.%${searchTerm}%,name.ilike.%${searchTerm}%`
  }

  if (searchType === 'numeric') {
    return `phone_digits.ilike.%${searchDigits}%,document_digits.ilike.%${searchDigits}%`
  }

  if (searchType === 'name') {
    return `name.ilike.%${searchTerm}%`
  }

  return null
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
    const groupId = normalizeOptionalUuid(requestUrl.searchParams.get('group_id'))
    const searchTerm = normalizeSearch(requestUrl.searchParams.get('search'))
    const limit = parsePositiveInt(requestUrl.searchParams.get('limit'), 50, 200)

    const searchType = detectSearchType(searchTerm)
    const searchDigits = searchTerm.replace(/\D/g, '')
    const orSearch = applySearchParams({ searchType, searchTerm, searchDigits })

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
        { ok: false, error: 'Usuário sem permissão para visualizar esse escopo do Kanban.' },
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
        { ok: false, error: 'Vendedor não informado para o escopo selecionado.' },
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
      const { data: ownerMembership, error: ownerMembershipError } = await admin
        .from('company_memberships')
        .select('user_id')
        .eq('company_id', activeCompanyId)
        .eq('user_id', effectiveOwnerId)
        .eq('is_active', true)
        .maybeSingle()

      if (ownerMembershipError) {
        return NextResponse.json(
          { ok: false, error: ownerMembershipError.message },
          { status: 400 },
        )
      }

      if (!ownerMembership) {
        return NextResponse.json(
          { ok: false, error: 'Vendedor não pertence à empresa ativa.' },
          { status: 403 },
        )
      }
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
          itemsByStatus: emptyItemsByStatus(),
          totals: emptyTotals(),
          exactCount: 0,
        })
      }
    }

    const competencyMonth = getCurrentCompetencyMonthInSaoPaulo()

    let activeCountQuery = admin
      .from('v_kanban_items')
      .select('status')
      .eq('company_id', activeCompanyId)
      .in('status', ACTIVE_STATUSES)

    let wonCountQuery = admin
      .from('v_kanban_items')
      .select('status')
      .eq('company_id', activeCompanyId)
      .eq('status', 'ganho')
      .gte('terminal_closed_on', competencyMonth.start)
      .lt('terminal_closed_on', competencyMonth.endExclusive)

    let lostCountQuery = admin
      .from('v_kanban_items')
      .select('status')
      .eq('company_id', activeCompanyId)
      .eq('status', 'perdido')
      .gte('terminal_closed_on', competencyMonth.start)
      .lt('terminal_closed_on', competencyMonth.endExclusive)

    if (scope === 'company') {
      activeCountQuery = activeCountQuery
        .not('owner_id', 'is', null)
        .in('owner_id', companyScopeOwnerIds ?? [])

      wonCountQuery = wonCountQuery
        .not('owner_id', 'is', null)
        .in('owner_id', companyScopeOwnerIds ?? [])

      lostCountQuery = lostCountQuery
        .not('owner_id', 'is', null)
        .in('owner_id', companyScopeOwnerIds ?? [])
    } else {
      activeCountQuery = activeCountQuery.eq('owner_id', effectiveOwnerId)
      wonCountQuery = wonCountQuery.eq('owner_id', effectiveOwnerId)
      lostCountQuery = lostCountQuery.eq('owner_id', effectiveOwnerId)
    }

    if (groupId) {
      activeCountQuery = activeCountQuery.eq('group_id', groupId)
      wonCountQuery = wonCountQuery.eq('group_id', groupId)
      lostCountQuery = lostCountQuery.eq('group_id', groupId)
    }

    if (orSearch) {
      activeCountQuery = activeCountQuery.or(orSearch)
      wonCountQuery = wonCountQuery.or(orSearch)
      lostCountQuery = lostCountQuery.or(orSearch)
    }

    const [activeCountResult, wonCountResult, lostCountResult] = await Promise.all([
      activeCountQuery,
      wonCountQuery,
      lostCountQuery,
    ])

    const countError =
      activeCountResult.error ??
      wonCountResult.error ??
      lostCountResult.error

    if (countError) {
      return NextResponse.json(
        { ok: false, error: countError.message },
        { status: 400 },
      )
    }

    const countRows = [
      ...((activeCountResult.data ?? []) as Array<{ status: Status }>),
      ...((wonCountResult.data ?? []) as Array<{ status: Status }>),
      ...((lostCountResult.data ?? []) as Array<{ status: Status }>),
    ]

    const totals = emptyTotals()

    for (const row of countRows) {
      if (row.status in totals) {
        totals[row.status] += 1
      }
    }

    const itemsByStatus = emptyItemsByStatus()
    const groupIds = new Set<string>()

    for (const status of STATUSES) {
      let itemQuery = admin
  .from('v_kanban_items')
  .select(
    'id, lead_id, owner_id, group_id, status, stage_entered_at, name, phone, email, cpf, document, phone_digits, document_digits, next_action, next_action_date, created_at, updated_at, terminal_closed_on, terminal_won_total, terminal_lost_reason, terminal_product_name',
  )
  .eq('company_id', activeCompanyId)
  .eq('status', status)
  .order(
    status === 'ganho' || status === 'perdido'
      ? 'terminal_closed_on'
      : 'stage_entered_at',
    { ascending: false, nullsFirst: false },
  )
  .limit(limit)

      if (scope === 'company') {
        itemQuery = itemQuery
          .not('owner_id', 'is', null)
          .in('owner_id', companyScopeOwnerIds ?? [])
      } else {
        itemQuery = itemQuery.eq('owner_id', effectiveOwnerId)
      }

      if (groupId) {
        itemQuery = itemQuery.eq('group_id', groupId)
      }

      if (orSearch) {
        itemQuery = itemQuery.or(orSearch)
      }

      if (status === 'ganho' || status === 'perdido') {
        itemQuery = itemQuery
          .gte('terminal_closed_on', competencyMonth.start)
          .lt('terminal_closed_on', competencyMonth.endExclusive)
      }

      const { data: rows, error: rowsError } = await itemQuery

      if (rowsError) {
        return NextResponse.json(
          { ok: false, error: rowsError.message },
          { status: 400 },
        )
      }

      const normalizedRows = (rows ?? []) as KanbanRow[]

      for (const row of normalizedRows) {
        if (row.group_id) {
          groupIds.add(row.group_id)
        }
      }

      itemsByStatus[status] = normalizedRows
    }

    const groupNameById = new Map<string, string>()

    if (groupIds.size > 0) {
      const { data: groups, error: groupsError } = await admin
        .from('lead_groups')
        .select('id, name')
        .eq('company_id', activeCompanyId)
        .in('id', Array.from(groupIds))

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

    for (const status of STATUSES) {
      itemsByStatus[status] = itemsByStatus[status].map((item) => ({
        ...item,
        lead_groups: item.group_id
          ? {
              name: groupNameById.get(item.group_id) ?? '',
            }
          : null,
      }))
    }

    const exactCount = Object.values(totals).reduce((sum, value) => sum + value, 0)

    return NextResponse.json({
      ok: true,
      itemsByStatus,
      totals,
      exactCount,
    })
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Erro ao carregar Kanban.',
      },
      { status: 500 },
    )
  }
}