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
      setAll() {
        // API route de leitura da sessão.
      },
    },
  })

  const { data: auth, error: authErr } = await supabase.auth.getUser()

  if (authErr) throw new Error(authErr.message)
  if (!auth?.user?.id) throw new Error('Não autenticado')

  const activeCompanyId = cookieStore.get('cockpit_active_company_id')?.value ?? null

  if (!activeCompanyId) {
    throw new Error('Empresa ativa não selecionada.')
  }

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, is_active_global')
    .eq('id', auth.user.id)
    .single()

  if (profileErr) throw new Error(profileErr.message)
  if (!profile?.id) throw new Error('Perfil do usuário logado não encontrado.')
  if (profile.is_active_global === false) throw new Error('Usuário globalmente inativo.')

  const { data: membership, error: membershipErr } = await supabase
    .from('company_memberships')
    .select('company_id, role, is_active')
    .eq('company_id', activeCompanyId)
    .eq('user_id', auth.user.id)
    .eq('role', 'admin')
    .eq('is_active', true)
    .maybeSingle()

  if (membershipErr) throw new Error(membershipErr.message)
  if (!membership) throw new Error('Acesso negado: admin ativo da empresa obrigatório.')

  return {
    actorId: auth.user.id,
    companyId: membership.company_id,
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
    const body = (await req.json().catch(() => ({}))) as {
      role?: string
      is_active?: boolean
    }

    const nextRole: Role =
      body.role === 'admin' || body.role === 'manager' ? body.role : 'member'

    const nextActive = body.is_active === true

    const { data: targetMembership, error: targetErr } = await admin
      .from('company_memberships')
      .select('id, company_id, user_id, role, is_active')
      .eq('company_id', companyId)
      .eq('user_id', id)
      .maybeSingle()

    if (targetErr) {
      return NextResponse.json({ error: targetErr.message }, { status: 400 })
    }

    if (!targetMembership) {
      return NextResponse.json(
        { error: 'Usuário não possui vínculo com esta empresa.' },
        { status: 404 },
      )
    }

    if (id === actorId && (!nextActive || nextRole !== 'admin')) {
      return NextResponse.json(
        { error: 'Você não pode remover seu próprio acesso de admin por esta tela.' },
        { status: 400 },
      )
    }

    const { error } = await admin
      .from('company_memberships')
      .update({
        role: nextRole,
        is_active: nextActive,
        metadata: {
          ...(typeof targetMembership === 'object' && targetMembership && 'metadata' in targetMembership
            ? (targetMembership.metadata as Record<string, unknown>)
            : {}),
          last_access_update_source: 'platform_users_access_route',
          last_access_update_actor_id: actorId,
          last_access_update_at: new Date().toISOString(),
        },
      })
      .eq('company_id', companyId)
      .eq('user_id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    await admin.from('admin_events').insert({
      company_id: companyId,
      actor_user_id: actorId,
      target_user_id: id,
      event_type: 'user_access_updated',
      metadata: {
        role_new: nextRole,
        is_active_new: nextActive,
        source: 'platform_users_access_route',
      },
    })

    return NextResponse.json({
      ok: true,
      user_id: id,
      company_id: companyId,
      role: nextRole,
      is_active: nextActive,
    })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro inesperado' },
      { status: 500 },
    )
  }
}