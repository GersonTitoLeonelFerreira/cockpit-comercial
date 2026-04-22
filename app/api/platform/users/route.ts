import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

async function getAdminActor() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anon) {
    throw new Error('ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY')
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
  if (authErr) throw new Error(authErr.message)
  if (!auth?.user?.id) throw new Error('Não autenticado')

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('company_id, role')
    .eq('id', auth.user.id)
    .single()

  if (profileErr) throw new Error(profileErr.message)
  if (!profile?.company_id) throw new Error('company_id não encontrado')
  if (profile.role !== 'admin') throw new Error('Acesso negado (admin only)')

  return {
    actorId: auth.user.id,
    companyId: profile.company_id,
  }
}

export async function GET() {
  try {
    const { companyId } = await getAdminActor()

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
      return NextResponse.json(
        { error: 'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY' },
        { status: 500 },
      )
    }

    const admin = createClient(url, serviceKey)

    const { data, error } = await admin
      .from('profiles')
      .select('id, full_name, email, phone, job_title, role, is_active, created_at')
      .eq('company_id', companyId)
      .order('full_name', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({
      ok: true,
      users: (data ?? []).map((row) => ({
        ...row,
        is_active: !!row.is_active,
      })),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro inesperado' }, { status: 500 })
  }
}