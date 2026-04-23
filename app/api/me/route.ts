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
        setAll() {},
      },
    })

    const { data: auth, error: authErr } = await supabase.auth.getUser()
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 401 })
    if (!auth.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email, role, is_platform_admin')
      .eq('id', auth.user.id)
      .single()

    return NextResponse.json({
      ok: true,
      full_name: profile?.full_name ?? null,
      email: profile?.email ?? auth.user.email ?? null,
      role: profile?.role ?? null,
      is_platform_admin: profile?.is_platform_admin === true,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro inesperado' }, { status: 500 })
  }
}