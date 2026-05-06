import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function GET() {
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
          // Server route de leitura.
        },
      },
    })

    const { data: auth, error: authErr } = await supabase.auth.getUser()

    if (authErr) {
      return NextResponse.json({ error: authErr.message }, { status: 401 })
    }

    if (!auth.user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, company_id, is_active, is_platform_admin')
      .eq('id', auth.user.id)
      .single()

    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 400 })
    }

    if (!profile) {
      return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 })
    }

    if (profile.is_active === false) {
      return NextResponse.json({ error: 'Usuário inativo.' }, { status: 403 })
    }

    return NextResponse.json({
      ok: true,
      user_id: auth.user.id,
      profile_id: profile.id,
      full_name: profile.full_name ?? null,
      email: profile.email ?? auth.user.email ?? null,
      role: profile.role ?? null,
      company_id: profile.company_id ?? null,
      is_active: profile.is_active !== false,
      is_platform_admin: profile.is_platform_admin === true,
    })
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message
            ? error.message
            : 'Erro inesperado',
      },
      { status: 500 },
    )
  }
}