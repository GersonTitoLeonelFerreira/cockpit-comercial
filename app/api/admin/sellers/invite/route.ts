import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(req: Request) {
  try {
    // 1. Validar sessão admin via cookie-based server client
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {}
          },
        },
      }
    )

    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('role, company_id')
      .eq('id', userData.user.id)
      .single()

    if (!adminProfile || adminProfile.role !== 'admin') {
      return NextResponse.json(
        { error: 'Acesso negado: somente admin' },
        { status: 403 }
      )
    }

    // company_id derivado do perfil do admin — não do body
    const companyId = adminProfile.company_id

    // 2. Parse body
    const body = await req.json()
    const { email, full_name, role } = body || {}
    const normalizedRole =
      role === 'consultor' ? 'member' : role || 'member'

    if (!email) {
      return NextResponse.json(
        { error: 'Email é obrigatório' },
        { status: 400 }
      )
    }

    const allowedRoles = new Set(['admin', 'manager', 'member'])
    if (!allowedRoles.has(normalizedRole)) {
      return NextResponse.json({ error: 'Role inválida' }, { status: 400 })
    }

    // 3. Usar service role para criar usuário
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Tentar inviteUserByEmail, fallback para createUser
    let userId: string
    try {
      const { data: invited, error: inviteErr } =
        await adminClient.auth.admin.inviteUserByEmail(email)
      if (inviteErr) throw inviteErr
      userId = invited.user.id
    } catch {
      // Fallback: createUser com senha temporária
      const tempPassword = crypto.randomUUID() + '_Aa1!'
      const { data: created, error: createErr } =
        await adminClient.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: false,
          user_metadata: {
            full_name,
            role: normalizedRole,
            company_id: companyId,
          },
        })
      if (createErr) {
        return NextResponse.json(
          { error: createErr.message },
          { status: 400 }
        )
      }
      userId = created.user.id
    }

    // 4. Upsert profile com company_id do admin (não do body)
    const { error: profileErr } = await adminClient.from('profiles').upsert({
      id: userId,
      company_id: companyId,
      email,
      full_name: full_name || email,
      role: normalizedRole,
      is_active: true,
    })

    if (profileErr) {
      await adminClient.auth.admin.deleteUser(userId)
      return NextResponse.json(
        { error: `Falha ao criar profile: ${profileErr.message}` },
        { status: 400 }
      )
    }

    // 5. Registrar evento de auditoria
    await adminClient.from('admin_events').insert({
      company_id: companyId,
      actor_user_id: userData.user.id,
      target_user_id: userId,
      event_type: 'seller_invited',
      metadata: { email, role: normalizedRole, full_name },
    })

    return NextResponse.json({ ok: true, user_id: userId })
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : 'Erro inesperado'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
