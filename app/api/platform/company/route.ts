import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

function normalizeText(value: unknown) {
  const text = String(value ?? '').trim()
  return text || null
}

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

export async function PATCH(req: Request) {
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
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

    const payload = {
      name: normalizeText(body.name),
      legal_name: normalizeText(body.legal_name),
      trade_name: normalizeText(body.trade_name),
      cnpj: normalizeText(body.cnpj),
      segment: normalizeText(body.segment),
      email: normalizeText(body.email),
      phone: normalizeText(body.phone),
      city: normalizeText(body.city),
      state: normalizeText(body.state),
      cep: normalizeText(body.cep),
      address: normalizeText(body.address),
    }

    const { error } = await admin
      .from('companies')
      .update(payload)
      .eq('id', companyId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    await admin.from('admin_events').insert({
      company_id: companyId,
      actor_user_id: actorId,
      target_user_id: null,
      event_type: 'company_profile_updated',
      metadata: {
        source: 'platform_company_route',
      },
    })

    return NextResponse.json({ ok: true, company_id: companyId })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro inesperado' },
      { status: 500 },
    )
  }
}