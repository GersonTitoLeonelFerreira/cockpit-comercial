import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

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
          setAll() {},
        },
      },
    )

    const { data: auth } = await supabase.auth.getUser()
    if (!auth?.user?.id) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { data: profile, error: profErr } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, job_title, username, birth_date, cpf, user_code')
      .eq('id', auth.user.id)
      .single()

    if (profErr) return NextResponse.json({ error: profErr.message }, { status: 400 })

    const { data: details, error: detErr } = await supabase
      .from('profile_details')
      .select('*')
      .eq('profile_id', auth.user.id)
      .single()

    if (detErr) {
      return NextResponse.json({ ok: true, profile, details: null })
    }

    return NextResponse.json({ ok: true, profile, details })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro inesperado' }, { status: 500 })
  }
}