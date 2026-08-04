import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import {
  createCompanionToken,
  type CompanionRole,
} from '@/app/lib/server/companion-token'
import { getAuthedSupabase } from '@/app/lib/supabase/server'


type CompanyMembershipRow = {
  company_id: string
  role: CompanionRole
  is_active: boolean
  companies:
    | {
        name: string | null
        trade_name: string | null
        legal_name: string | null
      }
    | {
        name: string | null
        trade_name: string | null
        legal_name: string | null
      }[]
    | null
}

function getCompanyName(membership: CompanyMembershipRow) {
  const rawCompany = Array.isArray(membership.companies)
    ? membership.companies[0] ?? null
    : membership.companies

  return (
    rawCompany?.trade_name ||
    rawCompany?.name ||
    rawCompany?.legal_name ||
    'Empresa sem nome'
  )
}

export async function GET() {
  try {
    const { supabase, user } = await getAuthedSupabase()
    const cookieStore = await cookies()
    const activeCompanyId = cookieStore.get('cockpit_active_company_id')?.value ?? null

    if (!activeCompanyId) {
      return NextResponse.json(
        {
          ok: false,
          status: 'NO_ACTIVE_COMPANY',
          error: 'Empresa ativa não selecionada.',
        },
        { status: 400 },
      )
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, email, is_active_global, is_platform_admin')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      return NextResponse.json(
        {
          ok: false,
          status: 'PROFILE_ERROR',
          error: profileError.message,
        },
        { status: 400 },
      )
    }

    if (!profile?.id || profile.is_active_global === false) {
      return NextResponse.json(
        {
          ok: false,
          status: 'USER_INACTIVE',
          error: 'Usuário globalmente inativo ou sem perfil válido.',
        },
        { status: 403 },
      )
    }

    const { data: membership, error: membershipError } = await supabase
      .from('company_memberships')
      .select(
        `
        company_id,
        role,
        is_active,
        companies (
          name,
          trade_name,
          legal_name
        )
      `,
      )
      .eq('company_id', activeCompanyId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle<CompanyMembershipRow>()

    if (membershipError) {
      return NextResponse.json(
        {
          ok: false,
          status: 'MEMBERSHIP_ERROR',
          error: membershipError.message,
        },
        { status: 400 },
      )
    }

    if (!membership?.company_id) {
      return NextResponse.json(
        {
          ok: false,
          status: 'NO_COMPANY_PERMISSION',
          error: 'Usuário sem vínculo ativo com a empresa selecionada.',
        },
        { status: 403 },
      )
    }

    const issuedAt = Math.floor(Date.now() / 1000)
    const expiresAt = issuedAt + 60 * 60 * 6

    const companionToken = createCompanionToken({
      sub: user.id,
      company_id: membership.company_id,
      role: membership.role,
      iat: issuedAt,
      exp: expiresAt,
    })

    return NextResponse.json({
      ok: true,
      status: 'CONNECTED',
      companion_token: companionToken,
      expires_at: new Date(expiresAt * 1000).toISOString(),
      user: {
        id: user.id,
        full_name: profile.full_name ?? null,
        email: profile.email ?? user.email ?? null,
        is_platform_admin: profile.is_platform_admin === true,
      },
      active_company: {
        id: membership.company_id,
        name: getCompanyName(membership),
        role: membership.role,
        is_active: membership.is_active === true,
      },
      companion: {
        can_read_whatsapp_screen: true,
        can_create_lead_inside_extension: false,
        can_assign_pool_inside_extension: false,
        can_transfer_owner_inside_extension: false,
        can_apply_cycle_action_without_approval: false,
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: 'UNAUTHENTICATED',
        error:
          error instanceof Error && error.message
            ? error.message
            : 'Não autenticado.',
      },
      { status: 401 },
    )
  }
}