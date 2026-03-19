import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { email, password, full_name, role } = body || {}

    // 🔹 Normalização de role legado
    const normalizedRole =
      role === 'consultor' ? 'member' : role

    const allowedRoles = new Set(['admin', 'manager', 'member'])

    if (!email || !password || !normalizedRole) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: email, password, role' },
        { status: 400 }
      )
    }

    if (!allowedRoles.has(normalizedRole)) {
      return NextResponse.json(
        { error: 'Role inválida. Use: admin | manager | member' },
        { status: 400 }
      )
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    if (!url || !serviceKey || !anonKey) {
      return NextResponse.json(
        { error: 'Variáveis de ambiente Supabase ausentes' },
        { status: 500 }
      )
    }

    // 🔒 Verificar sessão do chamador e obter company_id do perfil do admin
    const cookieStore = await cookies()
    const caller = createServerClient(url, anonKey, {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    })

    const { data: sessionData } = await caller.auth.getUser()
    if (!sessionData?.user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { data: callerProfile } = await caller
      .from('profiles')
      .select('role, company_id')
      .eq('id', sessionData.user.id)
      .single()

    if (!callerProfile || callerProfile.role !== 'admin') {
      return NextResponse.json({ error: 'Acesso negado: somente admin' }, { status: 403 })
    }

    const company_id = callerProfile.company_id

    const adminClient = createClient(url, serviceKey)

    // 1️⃣ Criar usuário no Auth (bypass RLS)
    const { data: created, error: createErr } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name,
          role: normalizedRole,
          company_id,
        },
      })

    if (createErr) {
      return NextResponse.json({ error: createErr.message }, { status: 400 })
    }

    const userId = created.user?.id
    if (!userId) {
      return NextResponse.json(
        { error: 'Usuário criado sem ID.' },
        { status: 500 }
      )
    }

    // 2️⃣ Criar profile (service role ignora RLS)
    const { error: profileErr } = await adminClient
      .from('profiles')
      .upsert({
        id: userId,
        company_id,
        role: normalizedRole,
        full_name: full_name || email,
      })

    if (profileErr) {
      // rollback se profile falhar
      await adminClient.auth.admin.deleteUser(userId)

      return NextResponse.json(
        { error: `Falha ao criar profile: ${profileErr.message}` },
        { status: 400 }
      )
    }

    return NextResponse.json({ ok: true, user_id: userId })

  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Erro inesperado' },
      { status: 500 }
    )
  }
}
