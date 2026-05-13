import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

type Body = {
  email?: string
  full_name?: string
  role?: string
  password?: string
  details?: {
    tipo_pessoa?: 'fisica' | 'juridica' | 'estrangeiro'
    legal_name?: string
    birth_date?: string
    cpf?: string
    phone?: string | null
  }
}

type MembershipRow = {
  company_id: string
  role: 'admin' | 'manager' | 'member' | null
  is_active: boolean | null
}

function normalizeRole(role: string | undefined) {
  const normalizedRole = (role ?? 'member').trim()

  if (normalizedRole === 'consultor') return 'member'

  return normalizedRole
}

function onlyDigits(value: string) {
  return (value ?? '').replace(/\D/g, '')
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  return fallback
}

export async function POST(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !anon) {
      return NextResponse.json(
        { error: 'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY' },
        { status: 500 },
      )
    }

    if (!serviceKey) {
      return NextResponse.json(
        {
          error:
            'ENV faltando: SUPABASE_SERVICE_ROLE_KEY (reinicie o npm run dev após editar .env.local)',
        },
        { status: 500 },
      )
    }

    const body = (await req.json().catch(() => ({}))) as Body
    const email = (body.email ?? '').trim().toLowerCase()
    const fullName = (body.full_name ?? '').trim()
    const role = normalizeRole(body.role)
    const password = (body.password ?? '').trim()

    const details = body.details ?? {}
    const tipoPessoa = (details.tipo_pessoa ?? '').trim()
    const legalName = (details.legal_name ?? '').trim()
    const birthDate = (details.birth_date ?? '').trim()
    const cpf = onlyDigits(details.cpf ?? '')
    const phone = (details.phone ?? null)?.toString().trim() || null

    const allowedRoles = new Set(['admin', 'manager', 'member'])
    const allowedTipo = new Set(['fisica', 'juridica', 'estrangeiro'])

    if (!email) return NextResponse.json({ error: 'Campo obrigatório: email' }, { status: 400 })

    if (!fullName) {
      return NextResponse.json(
        { error: 'Campo obrigatório: full_name (Nome)' },
        { status: 400 },
      )
    }

    if (!allowedRoles.has(role)) {
      return NextResponse.json(
        { error: 'Role inválida. Use: admin | manager | member' },
        { status: 400 },
      )
    }

    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: 'Senha temporária deve ter no mínimo 6 caracteres' },
        { status: 400 },
      )
    }

    if (!allowedTipo.has(tipoPessoa)) {
      return NextResponse.json(
        { error: 'Campo obrigatório: tipo_pessoa (fisica|juridica|estrangeiro)' },
        { status: 400 },
      )
    }

    if (!legalName) {
      return NextResponse.json(
        { error: 'Campo obrigatório: legal_name (Nome Registro)' },
        { status: 400 },
      )
    }

    if (!birthDate) {
      return NextResponse.json({ error: 'Campo obrigatório: birth_date' }, { status: 400 })
    }

    if (!cpf) {
      return NextResponse.json({ error: 'Campo obrigatório: cpf' }, { status: 400 })
    }

    const cookieStore = await cookies()
    const activeCompanyId = cookieStore.get('cockpit_active_company_id')?.value ?? null

    if (!activeCompanyId) {
      return NextResponse.json(
        { error: 'Empresa ativa não selecionada.' },
        { status: 400 },
      )
    }

    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {}
        },
      },
    })

    const { data: userData, error: userErr } = await supabase.auth.getUser()

    if (userErr) {
      return NextResponse.json({ error: userErr.message }, { status: 401 })
    }

    const actor = userData?.user

    if (!actor?.id) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { data: actorProfile, error: actorProfileErr } = await supabase
      .from('profiles')
      .select('id, is_active_global')
      .eq('id', actor.id)
      .maybeSingle()

    if (actorProfileErr) {
      return NextResponse.json({ error: actorProfileErr.message }, { status: 400 })
    }

    if (!actorProfile?.id) {
      return NextResponse.json(
        { error: 'Perfil do usuário logado não encontrado.' },
        { status: 403 },
      )
    }

    if (actorProfile.is_active_global === false) {
      return NextResponse.json(
        { error: 'Usuário globalmente inativo.' },
        { status: 403 },
      )
    }

    const { data: actorMembership, error: actorMembershipErr } = await supabase
      .from('company_memberships')
      .select('company_id, role, is_active')
      .eq('company_id', activeCompanyId)
      .eq('user_id', actor.id)
      .eq('is_active', true)
      .maybeSingle()

    if (actorMembershipErr) {
      return NextResponse.json({ error: actorMembershipErr.message }, { status: 400 })
    }

    const membership = actorMembership as MembershipRow | null

    if (!membership?.company_id) {
      return NextResponse.json(
        { error: 'Usuário sem vínculo ativo com a empresa.' },
        { status: 403 },
      )
    }

    if (membership.role !== 'admin') {
      return NextResponse.json({ error: 'Acesso negado (admin only)' }, { status: 403 })
    }

    const companyId = membership.company_id

    const admin = createClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName || email,
        role,
        company_id: companyId,
      },
    })

    if (createErr) {
      return NextResponse.json({ error: createErr.message }, { status: 400 })
    }

    const userId = created.user?.id

    if (!userId) {
      return NextResponse.json({ error: 'Usuário criado sem ID.' }, { status: 500 })
    }

    const { error: profileErr } = await admin.from('profiles').upsert({
      id: userId,
      email,
      full_name: fullName || email,
      phone,
      cpf,
      birth_date: birthDate,
      is_active_global: true,
      is_platform_admin: false,
    })

    if (profileErr) {
      await admin.auth.admin.deleteUser(userId)
      return NextResponse.json({ error: `Falha ao criar profile: ${profileErr.message}` }, { status: 400 })
    }

    const { error: membershipErr } = await admin.from('company_memberships').upsert(
      {
        user_id: userId,
        company_id: companyId,
        role,
        is_active: true,
        metadata: {
          created_by: actor.id,
          source: 'admin_seller_invite',
        },
      },
      { onConflict: 'company_id,user_id' },
    )

    if (membershipErr) {
      await admin.from('profiles').delete().eq('id', userId)
      await admin.auth.admin.deleteUser(userId)

      return NextResponse.json(
        { error: `Falha ao criar vínculo com a empresa: ${membershipErr.message}` },
        { status: 400 },
      )
    }

    const { error: detailsErr } = await admin.from('profile_details').upsert({
      profile_id: userId,
      tipo_pessoa: tipoPessoa,
      legal_name: legalName,
      birth_date: birthDate,
      cpf,
      web_page: null,
      pais: null,
      estado: null,
      cidade: null,
      logradouro: null,
      numero: null,
      telefone_emergencia: null,
      contato_emergencia: null,
    })

    if (detailsErr) {
      await admin
        .from('company_memberships')
        .delete()
        .eq('user_id', userId)
        .eq('company_id', companyId)

      await admin.from('profiles').delete().eq('id', userId)
      await admin.auth.admin.deleteUser(userId)

      return NextResponse.json(
        { error: `Falha ao criar profile_details: ${detailsErr.message}` },
        { status: 400 },
      )
    }

    const { error: auditErr } = await admin.from('admin_events').insert({
      company_id: companyId,
      actor_user_id: actor.id,
      target_user_id: userId,
      event_type: 'seller_created',
      metadata: { email, role },
    })

    if (auditErr) {
      return NextResponse.json(
        {
          ok: true,
          user_id: userId,
          warning: `Usuário criado, mas falhou auditoria: ${auditErr.message}`,
        },
        { status: 200 },
      )
    }

    return NextResponse.json({ ok: true, user_id: userId })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, 'Erro inesperado') },
      { status: 500 },
    )
  }
}