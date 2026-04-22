import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthedSupabase } from '@/app/lib/supabase/server'

// Roles permitidas por este endpoint.
// ATENÇÃO: 'admin' NÃO é permitido aqui — criação de admin só pelo fluxo
// de provisionamento de empresa (app/platform/provision-company).
const CREATABLE_ROLES = new Set<'manager' | 'member'>(['manager', 'member'])

export async function POST(req: Request) {
  try {
    // 1) Exige sessão válida (cookie). Anônimo -> 401.
    let supabase, actor
    try {
      ;({ supabase, user: actor } = await getAuthedSupabase())
    } catch {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    // 2) Carrega o profile do ator e exige admin ativo.
    const { data: actorProfile, error: actorProfileErr } = await supabase
      .from('profiles')
      .select('id, role, company_id, is_active')
      .eq('id', actor.id)
      .maybeSingle()

    if (actorProfileErr) {
      return NextResponse.json({ error: actorProfileErr.message }, { status: 400 })
    }
    if (!actorProfile) {
      return NextResponse.json(
        { error: 'Perfil do usuário logado não encontrado.' },
        { status: 403 },
      )
    }
    if (actorProfile.is_active === false) {
      return NextResponse.json({ error: 'Usuário inativo.' }, { status: 403 })
    }
    if (actorProfile.role !== 'admin') {
      return NextResponse.json(
        { error: 'Acesso negado (admin only).' },
        { status: 403 },
      )
    }
    if (!actorProfile.company_id) {
      return NextResponse.json(
        { error: 'company_id do admin não encontrado.' },
        { status: 400 },
      )
    }

    // 3) Lê o body, mas IGNORA company_id vindo dele.
    const body = await req.json().catch(() => ({} as any))
    const { email, password, full_name, role } = body || {}

    // Normalização de role legado (consultor -> member).
    const normalizedRole = role === 'consultor' ? 'member' : role

    if (!email || !password || !normalizedRole) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: email, password, role.' },
        { status: 400 },
      )
    }

    // 4) Whitelist: só manager|member. admin é bloqueado de propósito.
    if (!CREATABLE_ROLES.has(normalizedRole)) {
      return NextResponse.json(
        {
          error:
            'Role inválida para este endpoint. Permitidas: manager | member.',
        },
        { status: 400 },
      )
    }

    if (typeof password !== 'string' || password.length < 6) {
      return NextResponse.json(
        { error: 'Senha deve ter no mínimo 6 caracteres.' },
        { status: 400 },
      )
    }

    // 5) company_id SEMPRE vem do admin logado. Nunca do body.
    const company_id = actorProfile.company_id

    // 6) Service role apenas para as operações que precisam.
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

    // 6.1) Cria usuário no Auth (precisa de service role).
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
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
        { status: 500 },
      )
    }

    // 6.2) Upsert do profile (service role ignora RLS).
    const { error: profileErr } = await admin.from('profiles').upsert({
      id: userId,
      company_id,
      role: normalizedRole,
      full_name: full_name || email,
    })

    if (profileErr) {
      // Rollback: remove o user do Auth para não ficar órfão.
      await admin.auth.admin.deleteUser(userId)
      return NextResponse.json(
        { error: `Falha ao criar profile: ${profileErr.message}` },
        { status: 400 },
      )
    }

    return NextResponse.json({ ok: true, user_id: userId })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Erro inesperado' },
      { status: 500 },
    )
  }
}