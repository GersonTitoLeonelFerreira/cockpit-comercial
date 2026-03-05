import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

function ymd(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

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

type Goal = {
  meta_brl: number | null
  ticket_medio: number | null
  taxa_pct: number | null
  scope: 'group' | 'seller'
  source: 'company' | 'seller_override'
}

export async function GET() {
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
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
            } catch {
              // ignore
            }
          },
        },
      }
    )

    const { data: auth, error: authErr } = await supabase.auth.getUser()
    if (authErr || !auth?.user?.id) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { data: profile, error: profErr } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', auth.user.id)
      .single()

    if (profErr || !profile?.company_id) return NextResponse.json({ error: 'company_id ausente.' }, { status: 400 })

    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)

    const { data: companyRows, error: companyErr } = await supabase
      .from('companies')
      .select('settings')
      .eq('id', profile.company_id)
      .limit(1)

    if (companyErr) return NextResponse.json({ error: companyErr.message }, { status: 400 })

    const settings = (companyRows?.[0]?.settings ?? {}) as any

    const goalScope = (settings?.goal_scope ?? 'seller') as 'group' | 'seller'

    const goals = (settings?.goals ?? {}) as any
    const defaults = (goals?.defaults ?? {}) as any

    const overrides = (goals?.seller_overrides ?? {}) as Record<string, any>
    const mine = overrides?.[auth.user.id] ?? {}

    const meta_brl =
      goalScope === 'group'
        ? toNum(defaults?.meta_brl) ?? toNum(mine?.meta_brl) ?? null
        : toNum(mine?.meta_brl) ?? toNum(defaults?.meta_brl) ?? null

    const ticket_medio = toNum(defaults?.ticket_medio) ?? null
    const taxa_pct = toNum(defaults?.taxa_pct) ?? null

    const { data: r, error: rpcErr } = await supabase.rpc('get_goal_simulation_stats', {
      p_company_id: profile.company_id,
      p_start_date: ymd(start),
      p_end_date: ymd(end),
      p_owner_id: auth.user.id,
    })

    if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 400 })

    return NextResponse.json({
      ok: true,
      month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      goal: {
        meta_brl,
        ticket_medio,
        taxa_pct,
        scope: goalScope,
        source: goalScope === 'group' ? 'company' : toNum(mine?.meta_brl) != null ? 'seller_override' : 'company',
      },
      stats: (r?.[0] ?? null) as any,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Erro inesperado.' }, { status: 500 })
  }
}