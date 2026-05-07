import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

async function getSupabaseFromCookies() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anon) {
    throw new Error('ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }

  const cookieStore = await cookies()

  return {
    supabase: createServerClient(url, anon, {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {},
      },
    }),
    activeCompanyId: cookieStore.get('cockpit_active_company_id')?.value ?? null,
  }
}

export async function GET() {
  try {
    const { supabase, activeCompanyId } = await getSupabaseFromCookies()

    const { data: auth, error: authErr } = await supabase.auth.getUser()

    if (authErr) {
      return NextResponse.json({ error: authErr.message }, { status: 401 })
    }

    if (!auth?.user?.id) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, job_title, birth_date, is_active_global')
      .eq('id', auth.user.id)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    if (!profile?.id) {
      return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 })
    }

    if (profile.is_active_global === false) {
      return NextResponse.json({ error: 'Usuário globalmente inativo.' }, { status: 403 })
    }

    let role: string | null = null

    if (activeCompanyId) {
      const { data: membership, error: membershipError } = await supabase
        .from('company_memberships')
        .select('role, is_active')
        .eq('company_id', activeCompanyId)
        .eq('user_id', auth.user.id)
        .eq('is_active', true)
        .maybeSingle()

      if (membershipError) {
        return NextResponse.json({ error: membershipError.message }, { status: 400 })
      }

      role = membership?.role ?? null
    }

    return NextResponse.json({
      ok: true,
      profile: {
        id: profile.id,
        full_name: profile.full_name ?? null,
        email: profile.email ?? auth.user.email ?? null,
        phone: profile.phone ?? null,
        job_title: profile.job_title ?? null,
        birth_date: profile.birth_date ?? null,
        role,
      },
    })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro inesperado' },
      { status: 500 },
    )
  }
}

export async function PATCH(req: Request) {
  try {
    const { supabase } = await getSupabaseFromCookies()

    const { data: auth, error: authErr } = await supabase.auth.getUser()

    if (authErr) {
      return NextResponse.json({ error: authErr.message }, { status: 401 })
    }

    if (!auth?.user?.id) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, is_active_global')
      .eq('id', auth.user.id)
      .maybeSingle()

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 })
    }

    if (!profile?.id) {
      return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 })
    }

    if (profile.is_active_global === false) {
      return NextResponse.json({ error: 'Usuário globalmente inativo.' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))

    const payload: Record<string, unknown> = {}

    if (body.full_name !== undefined) {
      payload.full_name = String(body.full_name ?? '').trim() || null
    }

    if (body.phone !== undefined) {
      payload.phone = String(body.phone ?? '').trim() || null
    }

    if (body.job_title !== undefined) {
      payload.job_title = String(body.job_title ?? '').trim() || null
    }

    if (body.birth_date !== undefined) {
      payload.birth_date = body.birth_date || null
    }

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ ok: true })
    }

    const { error } = await supabase.from('profiles').update(payload).eq('id', auth.user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro inesperado' },
      { status: 500 },
    )
  }
}