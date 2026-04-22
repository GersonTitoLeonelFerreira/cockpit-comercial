import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

async function getActor() {
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

  return { supabase, companyId: profile.company_id }
}

export async function PATCH(req: Request) {
  try {
    const { supabase, companyId } = await getActor()
    const body = await req.json().catch(() => ({}))

    const { data: company, error: loadError } = await supabase
      .from('companies')
      .select('settings')
      .eq('id', companyId)
      .single()

    if (loadError) return NextResponse.json({ error: loadError.message }, { status: 400 })

    const currentSettings =
      company?.settings && typeof company.settings === 'object' && !Array.isArray(company.settings)
        ? company.settings
        : {}

    const nextSettings = {
      ...currentSettings,
      goal_scope: body.goal_scope === 'company' ? 'company' : 'seller',
      goal_label_singular: String(body.goal_label_singular ?? 'Fechamento').trim() || 'Fechamento',
      goal_label_plural: String(body.goal_label_plural ?? 'Fechamentos').trim() || 'Fechamentos',
    }

    const { error } = await supabase
      .from('companies')
      .update({ settings: nextSettings })
      .eq('id', companyId)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro inesperado' }, { status: 500 })
  }
}