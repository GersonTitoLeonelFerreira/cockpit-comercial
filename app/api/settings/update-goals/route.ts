import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

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

async function getAdminActor() {
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
      setAll() {
        // API route de leitura.
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
    .eq('role', 'admin')
    .eq('is_active', true)
    .maybeSingle()

  if (membershipErr) throw new Error(membershipErr.message)
  if (!membership) throw new Error('Acesso negado.')

  return {
    actorId: auth.user.id,
    companyId: membership.company_id,
  }
}

export async function POST(req: Request) {
  try {
    const { actorId, companyId } = await getAdminActor()

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
      return NextResponse.json(
        { error: 'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY' },
        { status: 500 },
      )
    }

    const admin = createClient(url, serviceKey)
    const body = await req.json()

    const goal_scope = (body?.goal_scope ?? null) as 'group' | 'seller' | null
    const defaultsIn = body?.defaults ?? null
    const seller_overrides = body?.seller_overrides ?? null

    if (goal_scope !== 'group' && goal_scope !== 'seller') {
      return NextResponse.json({ error: 'goal_scope inválido. Use: group | seller' }, { status: 400 })
    }

    if (!defaultsIn || typeof defaultsIn !== 'object') {
      return NextResponse.json({ error: 'defaults inválido.' }, { status: 400 })
    }

    const defaults = {
      meta_brl: toNum((defaultsIn as Record<string, unknown>).meta_brl),
      ticket_medio: toNum((defaultsIn as Record<string, unknown>).ticket_medio),
      taxa_pct: toNum((defaultsIn as Record<string, unknown>).taxa_pct),
    }

    if (!defaults.meta_brl || defaults.meta_brl <= 0) {
      return NextResponse.json({ error: 'defaults.meta_brl inválido.' }, { status: 400 })
    }

    if (!defaults.ticket_medio || defaults.ticket_medio <= 0) {
      return NextResponse.json({ error: 'defaults.ticket_medio inválido.' }, { status: 400 })
    }

    if (!defaults.taxa_pct || defaults.taxa_pct <= 0 || defaults.taxa_pct > 100) {
      return NextResponse.json({ error: 'defaults.taxa_pct inválido (1..100).' }, { status: 400 })
    }

    if (goal_scope === 'seller') {
      if (!seller_overrides || typeof seller_overrides !== 'object' || Array.isArray(seller_overrides)) {
        return NextResponse.json({ error: 'seller_overrides inválido.' }, { status: 400 })
      }
    }

    const { data: company, error: companyErr } = await admin
      .from('companies')
      .select('settings')
      .eq('id', companyId)
      .single()

    if (companyErr) {
      return NextResponse.json({ error: companyErr.message }, { status: 400 })
    }

    const settings =
      company?.settings && typeof company.settings === 'object' && !Array.isArray(company.settings)
        ? (company.settings as Record<string, unknown>)
        : {}

    const currentGoals =
      settings.goals && typeof settings.goals === 'object' && !Array.isArray(settings.goals)
        ? (settings.goals as Record<string, unknown>)
        : {}

    const nextSettings = {
      ...settings,
      goal_scope,
      goals: {
        ...currentGoals,
        updated_at: new Date().toISOString(),
        updated_by: actorId,
        defaults,
        ...(seller_overrides ? { seller_overrides } : {}),
      },
    }

    const { error: updErr } = await admin
      .from('companies')
      .update({ settings: nextSettings })
      .eq('id', companyId)

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 400 })
    }

    await admin.from('admin_events').insert({
      company_id: companyId,
      actor_user_id: actorId,
      target_user_id: null,
      event_type: 'company_goals_updated',
      metadata: {
        source: 'settings_update_goals_route',
        goal_scope,
      },
    })

    return NextResponse.json({ ok: true, company_id: companyId })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro inesperado' },
      { status: 500 },
    )
  }
}