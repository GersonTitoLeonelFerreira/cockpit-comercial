import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

import { getAuthedSupabase } from '@/app/lib/supabase/server'

type MembershipRow = {
  company_id: string
  role: string | null
  is_active: boolean | null
}

type EventRow = {
  id: string
  cycle_id: string | null
  event_type: string
  metadata: Record<string, unknown> | null
  occurred_at: string
  created_by: string | null
}

type CycleRow = {
  id: string
  owner_user_id: string | null
  status: string | null
  updated_at: string | null
  next_action_date: string | null
}

const CLOSED_STATUSES = new Set(['ganho', 'perdido', 'cancelado'])

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

const PAGE_SIZE = 1000
const MAX_EVENTS = 20000
const MAX_CYCLES = 20000

function jsonError(error: string, status = 400) {
  return NextResponse.json(
    {
      ok: false,
      error,
    },
    {
      status,
    },
  )
}

function normalizeUuid(value: string | null) {
  const text = value?.trim() ?? ''

  return UUID_REGEX.test(text) ? text : null
}

function normalizeDate(value: string | null) {
  const text = value?.trim() ?? ''

  if (!DATE_REGEX.test(text)) {
    return null
  }

  const date = new Date(`${text}T00:00:00.000Z`)

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== text
  ) {
    return null
  }

  return text
}

function getNextDateKey(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00.000Z`)

  date.setUTCDate(date.getUTCDate() + 1)

  return date.toISOString().slice(0, 10)
}

export async function GET(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonError(
        'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.',
        500,
      )
    }

    const { supabase, user } = await getAuthedSupabase()

    const cookieStore = await cookies()
    const activeCompanyId =
      cookieStore.get('cockpit_active_company_id')?.value ?? null

    if (!activeCompanyId) {
      return jsonError('Empresa ativa não selecionada.')
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, is_active_global')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      return jsonError(profileError.message)
    }

    if (!profile?.id) {
      return jsonError('Perfil do usuário logado não encontrado.', 403)
    }

    if (profile.is_active_global === false) {
      return jsonError('Usuário globalmente inativo.', 403)
    }

    const { data: membershipData, error: membershipError } = await supabase
      .from('company_memberships')
      .select('company_id, role, is_active')
      .eq('company_id', activeCompanyId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()

    if (membershipError) {
      return jsonError(membershipError.message)
    }

    const membership = membershipData as MembershipRow | null

    if (!membership?.company_id) {
      return jsonError(
        'Usuário sem vínculo ativo com a empresa.',
        403,
      )
    }

    const requestUrl = new URL(request.url)

    const dateStart = normalizeDate(
      requestUrl.searchParams.get('date_start'),
    )

    const dateEnd = normalizeDate(
      requestUrl.searchParams.get('date_end'),
    )

    const requestedSellerId = normalizeUuid(
      requestUrl.searchParams.get('seller_id'),
    )

    if (!dateStart || !dateEnd) {
      return jsonError('Período inválido.')
    }

    if (dateEnd < dateStart) {
      return jsonError('A data final não pode ser anterior à data inicial.')
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

    const canViewTeam =
      membership.role === 'admin' || membership.role === 'manager'

    let effectiveSellerId: string | null = null

    if (canViewTeam) {
      effectiveSellerId = requestedSellerId

      if (effectiveSellerId) {
        const { data: sellerMembership, error: sellerError } = await admin
          .from('company_memberships')
          .select('user_id')
          .eq('company_id', activeCompanyId)
          .eq('user_id', effectiveSellerId)
          .eq('is_active', true)
          .maybeSingle()

        if (sellerError) {
          return jsonError(sellerError.message)
        }

        if (!sellerMembership?.user_id) {
          return jsonError(
            'O consultor selecionado não pertence à empresa ativa.',
          )
        }
      }
    } else {
      effectiveSellerId = user.id
    }

    const events: EventRow[] = []
    let eventFrom = 0

    while (true) {
      let query = admin
        .from('cycle_events')
        .select(
          'id, cycle_id, event_type, metadata, occurred_at, created_by',
        )
        .eq('company_id', activeCompanyId)
        .gte('occurred_at', `${dateStart}T00:00:00`)
        .lt('occurred_at', `${getNextDateKey(dateEnd)}T00:00:00`)
        .order('occurred_at', { ascending: true })
        .range(eventFrom, eventFrom + PAGE_SIZE - 1)

      if (effectiveSellerId) {
        query = query.eq('created_by', effectiveSellerId)
      }

      const { data, error } = await query

      if (error) {
        return jsonError(error.message)
      }

      const page = (data ?? []) as EventRow[]

      events.push(...page)

      if (page.length < PAGE_SIZE) {
        break
      }

      eventFrom += PAGE_SIZE

      if (eventFrom >= MAX_EVENTS) {
        return jsonError(
          'O período retornou eventos demais. Reduza o intervalo de datas ou filtre por consultor.',
          422,
        )
      }
    }

    const cycles: CycleRow[] = []
    let cycleFrom = 0

    while (true) {
      let query = admin
        .from('sales_cycles')
        .select(
          'id, owner_user_id, status, updated_at, next_action_date',
        )
        .eq('company_id', activeCompanyId)
        .order('id', { ascending: true })
        .range(cycleFrom, cycleFrom + PAGE_SIZE - 1)

      if (effectiveSellerId) {
        query = query.eq('owner_user_id', effectiveSellerId)
      }

      const { data, error } = await query

      if (error) {
        return jsonError(error.message)
      }

      const page = (data ?? []) as CycleRow[]

      cycles.push(...page)

      if (page.length < PAGE_SIZE) {
        break
      }

      cycleFrom += PAGE_SIZE

      if (cycleFrom >= MAX_CYCLES) {
        return jsonError(
          'A empresa possui ciclos demais para calcular o score de uma vez. Filtre por consultor.',
          422,
        )
      }
    }

    const openCycles = cycles.filter(
      (cycle) =>
        !CLOSED_STATUSES.has(String(cycle.status ?? '').toLowerCase()),
    )

    return NextResponse.json({
      ok: true,
      events,
      open_cycles: openCycles,
    })
  } catch (error: unknown) {
    return jsonError(
      error instanceof Error
        ? error.message
        : 'Erro ao carregar o Score de Aderência.',
      500,
    )
  }
}
