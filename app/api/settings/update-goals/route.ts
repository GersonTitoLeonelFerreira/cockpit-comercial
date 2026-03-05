import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

function toNum(v: any) {
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

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll() {
            // não precisa escrever cookies aqui
          },
        },
      }
    )

    const { data: auth, error: authErr } = await supabase.auth.getUser()
    if (authErr || !auth?.user?.id) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { data: profile, error: profErr } = await supabase
      .from('profiles')
      .select('company_id, role')
      .eq('id', auth.user.id)
      .single()

    if (profErr || !profile?.company_id) return NextResponse.json({ error: 'company_id ausente.' }, { status: 400 })
    if (profile.role !== 'admin') return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

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
      meta_brl: toNum((defaultsIn as any).meta_brl),
      ticket_medio: toNum((defaultsIn as any).ticket_medio),
      taxa_pct: toNum((defaultsIn as any).taxa_pct),
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

    const { data: companies, error: companyErr } = await supabase
      .from('companies')
      .select('settings')
      .eq('id', profile.company_id)
      .limit(1)

    if (companyErr) return NextResponse.json({ error: companyErr.message }, { status: 400 })

    const settings = (companies?.[0]?.settings ?? {}) as any

    const nextSettings = {
      ...settings,
      goal_scope, // top-level no seu projeto
      goals: {
        ...(settings.goals ?? {}),
        updated_at: new Date().toISOString(),
        updated_by: auth.user.id,
        defaults,
        ...(seller_overrides ? { seller_overrides } : {}),
      },
    }

    const { error: updErr } = await supabase
      .from('companies')
      .update({ settings: nextSettings })
      .eq('id', profile.company_id)

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Erro inesperado' }, { status: 500 })
  }
}
