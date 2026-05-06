import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createClient } from '@supabase/supabase-js'

type InvitationRow = {
  id: string
  company_id: string
  email: string
  full_name: string | null
  status: string
  expires_at: string
  accepted_at: string | null
  companies:
    | {
        id: string
        name: string | null
        legal_name: string | null
        trade_name: string | null
        platform_status: string | null
        onboarding_status: string | null
      }
    | {
        id: string
        name: string | null
        legal_name: string | null
        trade_name: string | null
        platform_status: string | null
        onboarding_status: string | null
      }[]
    | null
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function getCompany(invitation: InvitationRow) {
  if (Array.isArray(invitation.companies)) {
    return invitation.companies[0] ?? null
  }

  return invitation.companies
}

function getCompanyDisplayName(company: ReturnType<typeof getCompany>) {
  if (!company) return 'Empresa'

  return company.trade_name || company.name || company.legal_name || 'Empresa'
}

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params

    if (!token || token.trim().length < 32) {
      return NextResponse.json({ error: 'Convite inválido.' }, { status: 400 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
      return NextResponse.json(
        { error: 'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.' },
        { status: 500 },
      )
    }

    const admin = createClient(url, serviceKey)
    const tokenHash = hashToken(token)

    const { data, error } = await admin
      .from('company_admin_invitations')
      .select(
        `
          id,
          company_id,
          email,
          full_name,
          status,
          expires_at,
          accepted_at,
          companies:company_id (
            id,
            name,
            legal_name,
            trade_name,
            platform_status,
            onboarding_status
          )
        `,
      )
      .eq('token_hash', tokenHash)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Convite não encontrado.' }, { status: 404 })
    }

    const invitation = data as InvitationRow
    const company = getCompany(invitation)

    if (!company) {
      return NextResponse.json({ error: 'Empresa vinculada ao convite não encontrada.' }, { status: 404 })
    }

    if (company.platform_status && company.platform_status !== 'active') {
      return NextResponse.json(
        { error: 'Empresa não está ativa na plataforma.' },
        { status: 400 },
      )
    }

    if (invitation.status !== 'pending') {
      return NextResponse.json(
        {
          error:
            invitation.status === 'accepted'
              ? 'Este convite já foi aceito.'
              : 'Este convite não está mais disponível.',
          status: invitation.status,
        },
        { status: 400 },
      )
    }

    const expiresAt = new Date(invitation.expires_at)

    if (Number.isNaN(expiresAt.getTime())) {
      return NextResponse.json({ error: 'Data de expiração inválida.' }, { status: 400 })
    }

    if (expiresAt.getTime() < Date.now()) {
      return NextResponse.json(
        {
          error: 'Este convite expirou.',
          status: 'expired',
        },
        { status: 400 },
      )
    }

    return NextResponse.json({
      ok: true,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        full_name: invitation.full_name,
        expires_at: invitation.expires_at,
      },
      company: {
        id: company.id,
        name: getCompanyDisplayName(company),
        onboarding_status: company.onboarding_status,
      },
    })
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message
            ? error.message
            : 'Erro inesperado ao validar convite.',
      },
      { status: 500 },
    )
  }
}