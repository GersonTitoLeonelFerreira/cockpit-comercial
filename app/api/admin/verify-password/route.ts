import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function POST(req: Request) {
  try {
    const { password } = await req.json()

    if (!password || typeof password !== 'string') {
      return NextResponse.json({ ok: false, error: 'Senha obrigatória.' }, { status: 400 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || !anon) {
      return NextResponse.json(
        { ok: false, error: 'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY' },
        { status: 500 }
      )
    }

    const cookieStore = await cookies()

    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          // esta rota não precisa escrever cookies
        },
      },
    })

    const { data: auth, error: authErr } = await supabase.auth.getUser()

    if (authErr || !auth.user?.id || !auth.user.email) {
      return NextResponse.json({ ok: false, error: 'Usuário não autenticado.' }, { status: 401 })
    }

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', auth.user.id)
      .single()

    if (profileErr || !profile) {
      return NextResponse.json({ ok: false, error: 'Perfil não encontrado.' }, { status: 403 })
    }

    if (profile.role !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Apenas admin pode validar esta ação.' }, { status: 403 })
    }

    const verifyRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: anon,
        Authorization: `Bearer ${anon}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: auth.user.email,
        password,
      }),
    })

    if (!verifyRes.ok) {
      return NextResponse.json({ ok: false, error: 'Senha incorreta.' }, { status: 401 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'Erro ao validar senha.' },
      { status: 500 }
    )
  }
}