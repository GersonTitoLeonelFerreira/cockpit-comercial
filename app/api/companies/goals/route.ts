import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

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
      .select('company_id, role')
      .eq('id', auth.user.id)
      .single()

    if (profErr) return NextResponse.json({ error: profErr.message }, { status: 400 })
    if (!profile?.company_id) return NextResponse.json({ error: 'company_id ausente.' }, { status: 400 })
    if (profile.role !== 'admin') return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

    const body = await req.json()
    const seller_overrides = body?.seller_overrides ?? null

    if (!seller_overrides || typeof seller_overrides !== 'object' || Array.isArray(seller_overrides)) {
      return NextResponse.json({ error: 'seller_overrides inválido.' }, { status: 400 })
    }

    const { data: company, error: companyErr } = await supabase
      .from('companies')
      .select('settings')
      .eq('id', profile.company_id)
      .single()

    if (companyErr) return NextResponse.json({ error: companyErr.message }, { status: 400 })

    const settings = (company?.settings ?? {}) as any

    const nextSettings = {
      ...settings,
      goals: {
        ...(settings.goals ?? {}),
        updated_at: new Date().toISOString(),
        updated_by: auth.user.id,
        seller_overrides,
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
