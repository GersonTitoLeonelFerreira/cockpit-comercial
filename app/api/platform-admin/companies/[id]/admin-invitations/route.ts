import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createHash, randomBytes } from 'crypto'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

type InviteBody = {
  email?: string
  full_name?: string | null
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function getBaseUrl(req: Request) {
  const envUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.VERCEL_URL ||
    ''

  if (envUrl) {
    if (envUrl.startsWith('http://') || envUrl.startsWith('https://')) {
      return envUrl.replace(/\/$/, '')
    }

    return `https://${envUrl.replace(/\/$/, '')}`
  }

  const requestUrl = new URL(req.url)
  return requestUrl.origin
}

async function getPlatformAdminActor() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anon) {
    return {
      error: 'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY',
      status: 500,
    } as const
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
    return { error: authError.message, status: 401 } as const
  }

  if (!auth?.user?.id) {
    return { error: 'Não autenticado.', status: 401 } as const
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, is_active, is_platform_admin')
    .eq('id', auth.user.id)
    .single()

  if (profileError) {
    return { error: profileError.message, status: 400 } as const
  }

  if (!profile) {
    return { error: 'Perfil do usuário logado não encontrado.', status: 403 } as const
  }

  if (profile.is_active === false) {
    return { error: 'Usuário inativo.', status: 403 } as const
  }

  if (profile.is_platform_admin !== true) {
    return { error: 'Acesso negado: admin da plataforma obrigatório.', status: 403 } as const
  }

  return { ok: true as const, actorId: auth.user.id }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getPlatformAdminActor()

    if (!actor.ok) {
      return NextResponse.json({ error: actor.error }, { status: actor.status })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
      return NextResponse.json(
        { error: 'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.' },
        { status: 500 },
      )
    }

    const { id: companyId } = await ctx.params
    const body = (await req.json().catch(() => ({}))) as InviteBody

    const email = normalizeEmail(body.email ?? '')
    const fullName = (body.full_name ?? '').trim() || null

    if (!companyId) {
      return NextResponse.json({ error: 'company_id obrigatório.' }, { status: 400 })
    }

    if (!email) {
      return NextResponse.json({ error: 'E-mail obrigatório.' }, { status: 400 })
    }

    if (!email.includes('@')) {
      return NextResponse.json({ error: 'E-mail inválido.' }, { status: 400 })
    }

    const admin = createClient(url, serviceKey)

    const { data: company, error: companyError } = await admin
      .from('companies')
      .select('id, trade_name, legal_name, name, onboarding_status, platform_status')
      .eq('id', companyId)
      .single()

    if (companyError) {
      return NextResponse.json({ error: companyError.message }, { status: 400 })
    }

    if (!company) {
      return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 404 })
    }

    if (company.platform_status && company.platform_status !== 'active') {
      return NextResponse.json(
        { error: 'Empresa não está ativa na plataforma.' },
        { status: 400 },
      )
    }

    const { count: activeAdminsCount, error: activeAdminsError } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('role', 'admin')
      .eq('is_active', true)

    if (activeAdminsError) {
      return NextResponse.json({ error: activeAdminsError.message }, { status: 400 })
    }

    if ((activeAdminsCount ?? 0) > 0) {
      return NextResponse.json(
        { error: 'Esta empresa já possui admin ativo.' },
        { status: 400 },
      )
    }

    const { data: pendingInvite, error: pendingInviteError } = await admin
      .from('company_admin_invitations')
      .select('id, email, status, expires_at')
      .eq('company_id', companyId)
      .eq('status', 'pending')
      .maybeSingle()

    if (pendingInviteError) {
      return NextResponse.json({ error: pendingInviteError.message }, { status: 400 })
    }

    if (pendingInvite?.id) {
      return NextResponse.json(
        {
          error: 'Já existe um convite pendente para esta empresa.',
          pending_invitation: {
            id: pendingInvite.id,
            email: pendingInvite.email,
            expires_at: pendingInvite.expires_at,
          },
        },
        { status: 400 },
      )
    }

    const token = randomBytes(32).toString('hex')
    const tokenHash = hashToken(token)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    const { data: invitation, error: invitationError } = await admin
      .from('company_admin_invitations')
      .insert({
        company_id: companyId,
        email,
        full_name: fullName,
        token_hash: tokenHash,
        status: 'pending',
        created_by: actor.actorId,
        expires_at: expiresAt,
        last_sent_at: new Date().toISOString(),
        metadata: {
          source: 'platform_admin_company_detail',
          company_name: company.trade_name || company.name || company.legal_name || null,
        },
      })
      .select('id, email, expires_at')
      .single()

    if (invitationError) {
      return NextResponse.json({ error: invitationError.message }, { status: 400 })
    }

    const now = new Date().toISOString()

    const { error: companyUpdateError } = await admin
      .from('companies')
      .update({
        onboarding_status: 'admin_invited',
        onboarding_status_updated_at: now,
      })
      .eq('id', companyId)

    if (companyUpdateError) {
      return NextResponse.json({ error: companyUpdateError.message }, { status: 400 })
    }

    await admin.from('admin_events').insert({
      company_id: companyId,
      actor_user_id: actor.actorId,
      target_user_id: null,
      event_type: 'platform_first_admin_invited',
      metadata: {
        invitation_id: invitation.id,
        email,
        full_name: fullName,
        expires_at: invitation.expires_at,
      },
    })

    const inviteUrl = `${getBaseUrl(req)}/convites/admin/${token}`

    return NextResponse.json({
      ok: true,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        expires_at: invitation.expires_at,
      },
      invite_url: inviteUrl,
    })
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message
            ? error.message
            : 'Erro inesperado ao gerar convite.',
      },
      { status: 500 },
    )
  }
}