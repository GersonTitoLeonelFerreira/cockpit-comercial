import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

function onlyDigits(v: string) {
  return (v || '').replace(/\D/g, '')
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
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {
              // Server Component: cannot set cookies from here
            }
          },
        },
      }
    )

    const { data: auth } = await supabase.auth.getUser()
    if (!auth?.user?.id) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, company_id')
      .eq('id', auth.user.id)
      .single()

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
    }

    const body = await req.json()
    const trade_name = String(body?.trade_name ?? '').trim()
    const legal_name = String(body?.legal_name ?? '').trim()
    const cnpj = onlyDigits(String(body?.cnpj ?? ''))
    const segment = String(body?.segment ?? '').trim() || null
    const email = String(body?.email ?? '').trim() || null
    const phone = onlyDigits(String(body?.phone ?? '')) || null
    const city = String(body?.city ?? '').trim() || null
    const state = String(body?.state ?? '').trim() || null
    const cep = onlyDigits(String(body?.cep ?? '')) || null
    const address = String(body?.address ?? '').trim() || null

    if (!trade_name || !legal_name) {
      return NextResponse.json(
        { error: 'Razão social e Nome fantasia são obrigatórios.' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('companies')
      .update({
        name: trade_name || legal_name,
        legal_name,
        trade_name,
        cnpj,
        segment,
        email,
        phone,
        city,
        state,
        cep,
        address,
      })
      .eq('id', profile.company_id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro inesperado' }, { status: 500 })
  }
}
