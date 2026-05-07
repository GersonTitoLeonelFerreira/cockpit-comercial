import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

type SelectCompanyBody = {
  company_id?: string
}

export async function POST(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || !anon) {
      return NextResponse.json(
        { error: 'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY' },
        { status: 500 },
      )
    }

    const cookieStore = await cookies()

    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          // O cookie da empresa ativa é controlado pela própria resposta desta API.
        },
      },
    })

    const { data: auth, error: authError } = await supabase.auth.getUser()

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 401 })
    }

    if (!auth.user?.id) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const body = (await req.json().catch(() => ({}))) as SelectCompanyBody
    const companyId = String(body.company_id ?? '').trim()

    if (!companyId) {
      return NextResponse.json({ error: 'company_id obrigatório.' }, { status: 400 })
    }

    const { data: membership, error: membershipError } = await supabase
      .from('company_memberships')
      .select('company_id, role, is_active')
      .eq('company_id', companyId)
      .eq('user_id', auth.user.id)
      .eq('is_active', true)
      .maybeSingle()

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 400 })
    }

    if (!membership) {
      return NextResponse.json(
        { error: 'Você não possui vínculo ativo com esta empresa.' },
        { status: 403 },
      )
    }

    const response = NextResponse.json({
      ok: true,
      active_company_id: membership.company_id,
      active_role: membership.role,
    })

    response.cookies.set('cockpit_active_company_id', membership.company_id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    })

    return response
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message
            ? error.message
            : 'Erro inesperado ao selecionar empresa.',
      },
      { status: 500 },
    )
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true })

  response.cookies.set('cockpit_active_company_id', '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })

  return response
}