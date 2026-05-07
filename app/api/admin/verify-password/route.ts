import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

type MembershipRow = {
  company_id: string
  role: string | null
  is_active: boolean | null
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  return fallback
}

export async function POST(req: Request) {
  try {
    const { password } = await req.json().catch(() => ({ password: null }))

    if (!password || typeof password !== 'string') {
      return NextResponse.json({ ok: false, error: 'Senha obrigatória.' }, { status: 400 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || !anon) {
      return NextResponse.json(
        {
          ok: false,
          error: 'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY',
        },
        { status: 500 },
      )
    }

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
          // Esta rota não precisa escrever cookies.
        },
      },
    })

    const { data: auth, error: authErr } = await supabase.auth.getUser()

    if (authErr || !auth.user?.id || !auth.user.email) {
      return NextResponse.json({ ok: false, error: 'Usuário não autenticado.' }, { status: 401 })
    }

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, is_active_global')
      .eq('id', auth.user.id)
      .maybeSingle()

    if (profileErr) {
      return NextResponse.json({ ok: false, error: profileErr.message }, { status: 400 })
    }

    if (!profile?.id) {
      return NextResponse.json({ ok: false, error: 'Perfil não encontrado.' }, { status: 403 })
    }

    if (profile.is_active_global === false) {
      return NextResponse.json(
        { ok: false, error: 'Usuário globalmente inativo.' },
        { status: 403 },
      )
    }

    const { data: actorMembership, error: membershipErr } = await supabase
      .from('company_memberships')
      .select('company_id, role, is_active')
      .eq('company_id', activeCompanyId)
      .eq('user_id', auth.user.id)
      .eq('is_active', true)
      .maybeSingle()

    if (membershipErr) {
      return NextResponse.json({ ok: false, error: membershipErr.message }, { status: 400 })
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
        { ok: false, error: 'Apenas admin pode validar esta ação.' },
        { status: 403 },
      )
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
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: getErrorMessage(error, 'Erro ao validar senha.'),
      },
      { status: 500 },
    )
  }
}