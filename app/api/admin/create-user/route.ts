import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { email, password, full_name, role, company_id } = body || {}

    // 🔹 Normalização de role legado
    const normalizedRole =
      role === 'consultor' ? 'member' : role

    const allowedRoles = new Set(['admin', 'manager', 'member'])

    if (!email || !password || !normalizedRole || !company_id) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: email, password, role, company_id' },
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
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    if (!url || !serviceKey) {
      return NextResponse.json(
        { error: 'Env NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente' },
        { status: 500 }
      )
    }

    const admin = createClient(url, serviceKey)

    // 1️⃣ Criar usuário no Auth (bypass RLS)
    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
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
    const { error: profileErr } = await admin
      .from('profiles')
      .upsert({
        id: userId,
        company_id,
        role: normalizedRole,
        full_name: full_name || email,
      })

    if (profileErr) {
      // rollback se profile falhar
      await admin.auth.admin.deleteUser(userId)

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
