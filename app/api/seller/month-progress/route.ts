import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

function ymd(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function toNum(v: unknown) {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const s = v.trim().replace(',', '.')
    if (!s) return null
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }
  return null
}

async function getSellerActor() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anon) {
    throw new Error('ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }

  const cookieStore = await cookies()

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // ignore
        }
      },
    },
  })

  const { data: auth, error: authErr } = await supabase.auth.getUser()

  if (authErr) throw new Error(authErr.message)
  if (!auth?.user?.id) throw new Error('Não autenticado.')

  const activeCompanyId = cookieStore.get('cockpit_active_company_id')?.value ?? null

  if (!activeCompanyId) {
    throw new Error('Empresa ativa não selecionada.')
  }

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, is_active_global')
    .eq('id', auth.user.id)
    .single()

  if (profileErr) throw new Error(profileErr.message)
  if (!profile?.id) throw new Error('Perfil do usuário logado não encontrado.')
  if (profile.is_active_global === false) throw new Error('Usuário globalmente inativo.')

  const { data: membership, error: membershipErr } = await supabase
    .from('company_memberships')
    .select('company_id, role, is_active')
    .eq('company_id', activeCompanyId)
    .eq('user_id', auth.user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (membershipErr) throw new Error(membershipErr.message)
  if (!membership) throw new Error('Usuário sem vínculo ativo com a empresa.')

  return {
    supabase,
    userId: auth.user.id,
    companyId: membership.company_id,
  }
}

export async function GET() {
  try {
    const { supabase, userId, companyId } = await getSellerActor()

    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)

    const { data: companyRows, error: companyErr } = await supabase
      .from('companies')
      .select('settings')
      .eq('id', companyId)
      .limit(1)

    if (companyErr) {
      return NextResponse.json({ error: companyErr.message }, { status: 400 })
    }

    const settings = (companyRows?.[0]?.settings ?? {}) as Record<string, unknown>
    const goalScope = (settings?.goal_scope ?? 'seller') as 'group' | 'seller'

    const goals =
      settings?.goals && typeof settings.goals === 'object' && !Array.isArray(settings.goals)
        ? (settings.goals as Record<string, unknown>)
        : {}

    const defaults =
      goals?.defaults && typeof goals.defaults === 'object' && !Array.isArray(goals.defaults)
        ? (goals.defaults as Record<string, unknown>)
        : {}

    const overrides =
      goals?.seller_overrides &&
      typeof goals.seller_overrides === 'object' &&
      !Array.isArray(goals.seller_overrides)
        ? (goals.seller_overrides as Record<string, Record<string, unknown>>)
        : {}

    const mine = overrides?.[userId] ?? {}

    const meta_brl =
      goalScope === 'group'
        ? toNum(defaults?.meta_brl) ?? toNum(mine?.meta_brl) ?? null
        : toNum(mine?.meta_brl) ?? toNum(defaults?.meta_brl) ?? null

    const ticket_medio = toNum(defaults?.ticket_medio) ?? null
    const taxa_pct = toNum(defaults?.taxa_pct) ?? null

    const { data: r, error: rpcErr } = await supabase.rpc('get_goal_simulation_stats', {
      p_company_id: companyId,
      p_start_date: ymd(start),
      p_end_date: ymd(end),
      p_owner_id: userId,
    })

    if (rpcErr) {
      return NextResponse.json({ error: rpcErr.message }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      goal: {
        meta_brl,
        ticket_medio,
        taxa_pct,
        scope: goalScope,
        source:
          goalScope === 'group'
            ? 'company'
            : toNum(mine?.meta_brl) != null
              ? 'seller_override'
              : 'company',
      },
      stats: (r?.[0] ?? null) as unknown,
    })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro inesperado.' },
      { status: 500 },
    )
  }
}