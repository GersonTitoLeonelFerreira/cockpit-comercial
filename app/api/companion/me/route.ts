import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { getAuthedSupabase } from '@/app/lib/supabase/server'

type CompanionRole = 'admin' | 'manager' | 'member'

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

function getCorsHeaders(request: Request) {
  const origin = request.headers.get('origin') ?? ''
  const allowedOrigins = [
    'https://web.whatsapp.com',
    'https://cockpit-commercial-vocn.vercel.app',
    'http://localhost:3000',
  ]

  const isExtensionOrigin =
    origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://')

  const allowOrigin =
    allowedOrigins.includes(origin) || isExtensionOrigin
      ? origin
      : 'https://cockpit-commercial-vocn.vercel.app'

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  }
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

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request),
  })
}

export async function GET(request: Request) {
  const corsHeaders = getCorsHeaders(request)

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
        {
          status: 400,
          headers: corsHeaders,
        },
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
        {
          status: 400,
          headers: corsHeaders,
        },
      )
    }

    if (!profile?.id || profile.is_active_global === false) {
      return NextResponse.json(
        {
          ok: false,
          status: 'USER_INACTIVE',
          error: 'Usuário globalmente inativo ou sem perfil válido.',
        },
        {
          status: 403,
          headers: corsHeaders,
        },
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
        {
          status: 400,
          headers: corsHeaders,
        },
      )
    }

    if (!membership?.company_id) {
      return NextResponse.json(
        {
          ok: false,
          status: 'NO_COMPANY_PERMISSION',
          error: 'Usuário sem vínculo ativo com a empresa selecionada.',
        },
        {
          status: 403,
          headers: corsHeaders,
        },
      )
    }

    return NextResponse.json(
      {
        ok: true,
        status: 'CONNECTED',
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
      },
      {
        status: 200,
        headers: corsHeaders,
      },
    )
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
      {
        status: 401,
        headers: corsHeaders,
      },
    )
  }
}