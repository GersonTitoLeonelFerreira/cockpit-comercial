import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

type Role = 'member' | 'manager' | 'admin'

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

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { actorId, companyId } = await getAdminActor()

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
      return NextResponse.json(
        { error: 'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY' },
        { status: 500 },
      )
    }

    const admin = createClient(url, serviceKey)
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({}))

    const nextRole: Role = body.role === 'admin' || body.role === 'manager' ? body.role : 'member'
    const nextActive = !!body.is_active

    const { data: target, error: targetErr } = await admin
      .from('profiles')
      .select('id, company_id, role, is_active')
      .eq('id', id)
      .single()

    if (targetErr) return NextResponse.json({ error: targetErr.message }, { status: 400 })
    if (!target) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 })
    if (target.company_id !== companyId) {
      return NextResponse.json({ error: 'Acesso negado (empresa diferente).' }, { status: 403 })
    }

    if (id === actorId && (!nextActive || nextRole !== 'admin')) {
      return NextResponse.json(
        { error: 'Você não pode remover seu próprio acesso de admin por esta tela.' },
        { status: 400 },
      )
    }

    const { error } = await admin
      .from('profiles')
      .update({
        role: nextRole,
        is_active: nextActive,
      })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro inesperado' }, { status: 500 })
  }
}