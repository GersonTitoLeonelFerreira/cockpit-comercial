import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type CreatePlatformAdminBody = {
  email?: unknown
  password?: unknown
  full_name?: unknown
}

type ExistingAuthUser = {
  id: string
  email?: string
}

function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

async function findAuthUserByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<ExistingAuthUser | null> {
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })

  if (error) {
    throw new Error(`Falha ao consultar usuários existentes: ${error.message}`)
  }

  const found = data.users.find((user) => normalizeEmail(user.email) === email)

  if (!found?.id) return null

  return {
    id: found.id,
    email: found.email ?? email,
  }
}

export async function POST(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !anon || !serviceKey) {
      return NextResponse.json(
        {
          error:
            'ENV ausente: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY ou SUPABASE_SERVICE_ROLE_KEY.',
        },
        { status: 500 },
      )
    }

    const cookieStore = await cookies()

    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          // API route de validação de sessão.
        },
      },
    })

    const { data: auth, error: authError } = await supabase.auth.getUser()

    if (authError || !auth?.user?.id) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const { data: requesterProfile, error: requesterError } = await supabase
      .from('profiles')
      .select('id, is_active_global, is_platform_admin')
      .eq('id', auth.user.id)
      .maybeSingle()

    if (requesterError || !requesterProfile) {
      return NextResponse.json({ error: 'Perfil solicitante não encontrado.' }, { status: 403 })
    }

    if (requesterProfile.is_active_global === false) {
      return NextResponse.json({ error: 'Usuário globalmente inativo.' }, { status: 403 })
    }

    if (requesterProfile.is_platform_admin !== true) {
      return NextResponse.json({ error: 'Acesso restrito ao admin da plataforma.' }, { status: 403 })
    }

    const body = (await req.json().catch(() => null)) as CreatePlatformAdminBody | null

    if (!body) {
      return NextResponse.json({ error: 'Payload inválido.' }, { status: 400 })
    }

    const email = normalizeEmail(body.email)
    const password = normalizeText(body.password)
    const fullName = normalizeText(body.full_name)

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'E-mail inválido.' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Senha deve ter no mínimo 6 caracteres.' },
        { status: 400 },
      )
    }

    const admin = createClient(url, serviceKey)

    const existingAuthUser = await findAuthUserByEmail(admin, email)

    if (existingAuthUser) {
      return NextResponse.json(
        {
          error:
            'Este e-mail já existe como usuário do sistema. Admin da plataforma deve ser criado como usuário global próprio, não promovido a partir de usuário de empresa.',
        },
        { status: 400 },
      )
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName || email,
        source: 'platform_admin_create',
      },
    })

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 400 })
    }

    const userId = created.user?.id

    if (!userId) {
      return NextResponse.json({ error: 'Usuário criado sem ID.' }, { status: 500 })
    }

    const { data: savedProfile, error: profileError } = await admin
      .from('profiles')
      .upsert({
        id: userId,
        email,
        full_name: fullName || email,
        is_active_global: true,
        is_platform_admin: true,
      })
      .select('id, full_name, email, is_platform_admin, is_active_global, created_at')
      .single()

    if (profileError || !savedProfile) {
      await admin.auth.admin.deleteUser(userId)

      return NextResponse.json(
        { error: `Falha ao salvar profile global: ${profileError?.message ?? 'erro desconhecido'}` },
        { status: 400 },
      )
    }

    return NextResponse.json({
      ok: true,
      admin: savedProfile,
    })
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Erro inesperado.',
      },
      { status: 500 },
    )
  }
}