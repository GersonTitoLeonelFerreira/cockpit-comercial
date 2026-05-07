import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'

type CreateUserBody = {
  email?: string
  password?: string
  full_name?: string
  role?: string
}

type ExistingAuthUser = {
  id: string
  email?: string
}

type ActorContext =
  | {
      ok: true
      actorId: string
      companyId: string
    }
  | {
      ok: false
      error: string
      status: number
    }

// Roles permitidas por este endpoint.
// ATENÇÃO: 'admin' NÃO é permitido aqui — primeiro admin nasce pelo onboarding da empresa.
// Admins adicionais devem ser tratados em fluxo específico de governança.
const CREATABLE_ROLES = new Set<'manager' | 'member'>(['manager', 'member'])

function normalizeEmail(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase()
}

function normalizeRole(value: string | null | undefined) {
  const role = (value ?? '').trim().toLowerCase()

  if (role === 'consultor' || role === 'seller' || role === 'user') {
    return 'member'
  }

  return role
}

async function findAuthUserByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<ExistingAuthUser | null> {
  const normalizedEmail = normalizeEmail(email)

  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })

  if (error) {
    throw new Error(`Falha ao consultar usuários existentes: ${error.message}`)
  }

  const found = data.users.find(
    (user) => normalizeEmail(user.email) === normalizedEmail,
  )

  if (!found?.id) return null

  return {
    id: found.id,
    email: found.email ?? normalizedEmail,
  }
}

async function getActorContext(): Promise<ActorContext> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anon) {
    return {
      ok: false,
      error: 'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY.',
      status: 500,
    }
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

  const { data: auth, error: authError } = await supabase.auth.getUser()

  if (authError) {
    return { ok: false, error: authError.message, status: 401 }
  }

  if (!auth.user?.id) {
    return { ok: false, error: 'Não autenticado.', status: 401 }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, is_active_global')
    .eq('id', auth.user.id)
    .single()

  if (profileError) {
    return { ok: false, error: profileError.message, status: 400 }
  }

  if (!profile) {
    return { ok: false, error: 'Perfil do usuário logado não encontrado.', status: 403 }
  }

  if (profile.is_active_global === false) {
    return { ok: false, error: 'Usuário globalmente inativo.', status: 403 }
  }

  const activeCompanyId = cookieStore.get('cockpit_active_company_id')?.value ?? null

  if (!activeCompanyId) {
    return {
      ok: false,
      error: 'Empresa ativa não selecionada.',
      status: 400,
    }
  }

  const { data: membership, error: membershipError } = await supabase
    .from('company_memberships')
    .select('company_id, role, is_active')
    .eq('company_id', activeCompanyId)
    .eq('user_id', auth.user.id)
    .eq('role', 'admin')
    .eq('is_active', true)
    .maybeSingle()

  if (membershipError) {
    return { ok: false, error: membershipError.message, status: 400 }
  }

  if (!membership) {
    return {
      ok: false,
      error: 'Acesso negado: admin ativo da empresa obrigatório.',
      status: 403,
    }
  }

  return {
    ok: true,
    actorId: auth.user.id,
    companyId: membership.company_id,
  }
}

export async function POST(req: Request) {
  try {
    const actor = await getActorContext()

    if (!actor.ok) {
      return NextResponse.json({ error: actor.error }, { status: actor.status })
    }

    const actorId = actor.actorId
    const actorCompanyId = actor.companyId

    const body = (await req.json().catch(() => ({}))) as CreateUserBody

    const email = normalizeEmail(body.email)
    const password = String(body.password ?? '')
    const fullName = String(body.full_name ?? '').trim()
    const normalizedRole = normalizeRole(body.role)

    if (!email || !password || !normalizedRole) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: email, password, role.' },
        { status: 400 },
      )
    }

    if (!email.includes('@')) {
      return NextResponse.json({ error: 'E-mail inválido.' }, { status: 400 })
    }

    if (!CREATABLE_ROLES.has(normalizedRole as 'manager' | 'member')) {
      return NextResponse.json(
        {
          error: 'Role inválida para este endpoint. Permitidas: manager | member.',
        },
        { status: 400 },
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Senha deve ter no mínimo 6 caracteres.' },
        { status: 400 },
      )
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
      return NextResponse.json(
        {
          error:
            'Env NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente.',
        },
        { status: 500 },
      )
    }

    const admin = createClient(url, serviceKey)

    const existingAuthUser = await findAuthUserByEmail(admin, email)

    let userId = existingAuthUser?.id ?? null
    let createdNewAuthUser = false

    if (!userId) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName || email,
        },
      })

      if (createErr) {
        return NextResponse.json({ error: createErr.message }, { status: 400 })
      }

      userId = created.user?.id ?? null
      createdNewAuthUser = true

      if (!userId) {
        return NextResponse.json(
          { error: 'Usuário criado sem ID.' },
          { status: 500 },
        )
      }
    } else {
      const { error: updateErr } = await admin.auth.admin.updateUserById(userId, {
        password,
        user_metadata: {
          full_name: fullName || email,
        },
      })

      if (updateErr) {
        return NextResponse.json(
          { error: `Falha ao atualizar usuário existente: ${updateErr.message}` },
          { status: 400 },
        )
      }
    }

    async function rollbackCreatedUser() {
      if (!createdNewAuthUser || !userId) return

      await admin
        .from('company_memberships')
        .delete()
        .eq('company_id', actorCompanyId)
        .eq('user_id', userId)

      await admin.from('profile_details').delete().eq('profile_id', userId)
      await admin.from('profiles').delete().eq('id', userId)
      await admin.auth.admin.deleteUser(userId)
    }

    const { data: existingMembership, error: existingMembershipError } = await admin
      .from('company_memberships')
      .select('id, is_active, role')
      .eq('company_id', actorCompanyId)
      .eq('user_id', userId)
      .maybeSingle()

    if (existingMembershipError) {
      await rollbackCreatedUser()
      return NextResponse.json({ error: existingMembershipError.message }, { status: 400 })
    }

    if (existingMembership?.is_active) {
      await rollbackCreatedUser()
      return NextResponse.json(
        { error: 'Este usuário já possui vínculo ativo com esta empresa.' },
        { status: 400 },
      )
    }

    const { error: profileErr } = await admin.from('profiles').upsert({
      id: userId,
      email,
      full_name: fullName || email,
      is_active_global: true,
      is_platform_admin: false,
    })

    if (profileErr) {
      await rollbackCreatedUser()
      return NextResponse.json(
        { error: `Falha ao salvar profile global: ${profileErr.message}` },
        { status: 400 },
      )
    }

    const { error: membershipErr } = await admin
      .from('company_memberships')
      .upsert(
        {
          company_id: actorCompanyId,
          user_id: userId,
          role: normalizedRole,
          is_active: true,
          metadata: {
            source: 'admin_create_user',
            actor_user_id: actorId,
            reused_existing_auth_user: !createdNewAuthUser,
          },
        },
        {
          onConflict: 'company_id,user_id',
        },
      )

    if (membershipErr) {
      await rollbackCreatedUser()
      return NextResponse.json(
        { error: `Falha ao criar vínculo com a empresa: ${membershipErr.message}` },
        { status: 400 },
      )
    }

    await admin.from('admin_events').insert({
      company_id: actorCompanyId,
      actor_user_id: actorId,
      target_user_id: userId,
      event_type: 'user_created',
      metadata: {
        email,
        role: normalizedRole,
        source: 'admin_create_user',
        reused_existing_auth_user: !createdNewAuthUser,
      },
    })

    return NextResponse.json({
      ok: true,
      user_id: userId,
      company_id: actorCompanyId,
      role: normalizedRole,
      reused_existing_auth_user: !createdNewAuthUser,
    })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro inesperado' },
      { status: 500 },
    )
  }
}