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

    const body = await req.json()
    const full_name = String(body?.full_name ?? '').trim()

    if (!full_name) {
      return NextResponse.json({ error: 'Nome não pode ser vazio.' }, { status: 400 })
    }

    const { error } = await supabase
      .from('profiles')
      .update({ full_name })
      .eq('id', auth.user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro inesperado' }, { status: 500 })
  }
}
