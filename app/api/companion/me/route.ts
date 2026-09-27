import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { getAuthedSupabase } from '@/app/lib/supabase/server'
import {
  verifyCompanionRequestToken,
  type CompanionTokenPayload,
} from '@/app/lib/server/companion-token'
import { verifyActiveCompanionProfile } from '@/app/lib/companion/companion-principal-access'

type CompanionRole = 'admin' | 'manager' | 'member'

type CompanyMembershipRow = {
  company_id: string
  company_name: string | null
  trade_name: string | null
  legal_name: string | null
  role: CompanionRole
  is_active: boolean
}

type DirectMembershipRow = {
  company_id: string
  user_id: string
  role: CompanionRole
  is_active: boolean
}

type CompanyRow = {
  id: string
  name: string | null
  trade_name: string | null
  legal_name: string | null
}

type ProfileRow = {
  id: string
  full_name: string | null
  email: string | null
  is_active_global: boolean | null
  is_platform_admin: boolean | null
}

function getCorsHeaders(request: Request) {
  const origin = request.headers.get('origin') ?? ''
  const allowedOrigins = [
    'https://web.whatsapp.com',
    'https://cockpit-comercial-vocn.vercel.app',
    'http://localhost:3000',
  ]

  const isExtensionOrigin =
    origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://')

  const allowOrigin =
    allowedOrigins.includes(origin) || isExtensionOrigin
      ? origin
      : 'https://cockpit-comercial-vocn.vercel.app'

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  }
}

function getCompanyName(
  source:
    | CompanyMembershipRow
    | CompanyRow,
) {
  const companyName =
    'company_name' in source
      ? source.company_name
      : source.name

  return (
    source.trade_name ||
    companyName ||
    source.legal_name ||
    'Empresa sem nome'
  )
}

function buildConnectedPayload({
  userId,
  fullName,
  email,
  isPlatformAdmin,
  companyId,
  companyName,
  role,
  isActive,
}: {
  userId: string
  fullName: string | null
  email: string | null
  isPlatformAdmin: boolean
  companyId: string
  companyName: string
  role: CompanionRole
  isActive: boolean
}) {
  return {
    ok: true,
    status: 'CONNECTED',
    user: {
      id: userId,
      full_name: fullName,
      email,
      is_platform_admin: isPlatformAdmin,
    },
    active_company: {
      id: companyId,
      name: companyName,
      role,
      is_active: isActive,
    },
    companion: {
      can_read_whatsapp_screen: true,
      can_create_lead_inside_extension: false,
      can_assign_pool_inside_extension: false,
      can_transfer_owner_inside_extension: false,
      can_apply_cycle_action_without_approval: false,
    },
  }
}

async function getTokenAuthenticatedContext(
  request: Request,
  tokenPayload: CompanionTokenPayload,
  corsHeaders: Record<string, string>,
) {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    return NextResponse.json(
      {
        ok: false,
        status: 'ENV_MISSING',
        error:
          'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.',
      },
      {
        status: 500,
        headers: corsHeaders,
      },
    )
  }

  const admin =
    createClient(
      url,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    )

  const profileAccess =
    await verifyActiveCompanionProfile({
      admin,
      userId: tokenPayload.sub,
    })

  if (profileAccess.error) {
    return NextResponse.json(
      {
        ok: false,
        status: 'PROFILE_ERROR',
        error: profileAccess.error,
      },
      {
        status: 400,
        headers: corsHeaders,
      },
    )
  }

  if (!profileAccess.active) {
    return NextResponse.json(
      {
        ok: false,
        status: 'USER_INACTIVE',
        error:
          'Usuário globalmente inativo ou sem perfil válido.',
      },
      {
        status: 403,
        headers: corsHeaders,
      },
    )
  }

  const [
    membershipResult,
    profileResult,
    companyResult,
  ] = await Promise.all([
    admin
      .from('company_memberships')
      .select(
        'company_id, user_id, role, is_active',
      )
      .eq(
        'company_id',
        tokenPayload.company_id,
      )
      .eq(
        'user_id',
        tokenPayload.sub,
      )
      .eq(
        'is_active',
        true,
      )
      .maybeSingle(),

    admin
      .from('profiles')
      .select(
        'id, full_name, email, is_active_global, is_platform_admin',
      )
      .eq(
        'id',
        tokenPayload.sub,
      )
      .maybeSingle(),

    admin
      .from('companies')
      .select(
        'id, name, trade_name, legal_name',
      )
      .eq(
        'id',
        tokenPayload.company_id,
      )
      .maybeSingle(),
  ])

  if (membershipResult.error) {
    return NextResponse.json(
      {
        ok: false,
        status: 'MEMBERSHIP_ERROR',
        error: membershipResult.error.message,
      },
      {
        status: 400,
        headers: corsHeaders,
      },
    )
  }

  const membership =
    membershipResult.data as
      | DirectMembershipRow
      | null

  if (!membership?.company_id) {
    return NextResponse.json(
      {
        ok: false,
        status: 'NO_COMPANY_PERMISSION',
        error:
          'Usuário sem vínculo ativo com a empresa selecionada.',
      },
      {
        status: 403,
        headers: corsHeaders,
      },
    )
  }

  if (profileResult.error) {
    return NextResponse.json(
      {
        ok: false,
        status: 'PROFILE_ERROR',
        error: profileResult.error.message,
      },
      {
        status: 400,
        headers: corsHeaders,
      },
    )
  }

  const profile =
    profileResult.data as
      | ProfileRow
      | null

  if (
    !profile?.id ||
    profile.is_active_global === false
  ) {
    return NextResponse.json(
      {
        ok: false,
        status: 'USER_INACTIVE',
        error:
          'Usuário globalmente inativo ou sem perfil válido.',
      },
      {
        status: 403,
        headers: corsHeaders,
      },
    )
  }

  if (companyResult.error) {
    return NextResponse.json(
      {
        ok: false,
        status: 'COMPANY_ERROR',
        error: companyResult.error.message,
      },
      {
        status: 400,
        headers: corsHeaders,
      },
    )
  }

  const company =
    companyResult.data as
      | CompanyRow
      | null

  if (!company?.id) {
    return NextResponse.json(
      {
        ok: false,
        status: 'COMPANY_NOT_FOUND',
        error:
          'Empresa ativa não localizada.',
      },
      {
        status: 403,
        headers: corsHeaders,
      },
    )
  }

  return NextResponse.json(
    buildConnectedPayload({
      userId: tokenPayload.sub,
      fullName:
        profile.full_name ?? null,
      email:
        profile.email ?? null,
      isPlatformAdmin:
        profile.is_platform_admin === true,
      companyId:
        membership.company_id,
      companyName:
        getCompanyName(company),
      role:
        membership.role,
      isActive:
        membership.is_active === true,
    }),
    {
      status: 200,
      headers: corsHeaders,
    },
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

  const authorization =
    request.headers.get(
      'authorization',
    ) ?? ''

  const hasBearerToken =
    authorization.startsWith(
      'Bearer ',
    )

  const tokenPayload =
    verifyCompanionRequestToken(
      request,
    )

  if (hasBearerToken) {
    if (!tokenPayload) {
      return NextResponse.json(
        {
          ok: false,
          status:
            'INVALID_COMPANION_SESSION',
          error:
            'Sessão do Companion inválida ou expirada.',
        },
        {
          status: 401,
          headers: corsHeaders,
        },
      )
    }

    return getTokenAuthenticatedContext(
      request,
      tokenPayload,
      corsHeaders,
    )
  }

  try {
    const { supabase, user } =
      await getAuthedSupabase()

    const cookieStore =
      await cookies()

    const activeCompanyId =
      cookieStore.get(
        'cockpit_active_company_id',
      )?.value ?? null

    if (!activeCompanyId) {
      return NextResponse.json(
        {
          ok: false,
          status: 'NO_ACTIVE_COMPANY',
          error:
            'Empresa ativa não selecionada.',
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      )
    }

    const {
      data: profile,
      error: profileError,
    } = await supabase
      .from('profiles')
      .select(
        'id, full_name, email, is_active_global, is_platform_admin',
      )
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

    if (
      !profile?.id ||
      profile.is_active_global === false
    ) {
      return NextResponse.json(
        {
          ok: false,
          status: 'USER_INACTIVE',
          error:
            'Usuário globalmente inativo ou sem perfil válido.',
        },
        {
          status: 403,
          headers: corsHeaders,
        },
      )
    }

    const {
      data: membershipsData,
      error: membershipError,
    } = await supabase.rpc(
      'get_user_company_memberships',
    )

    const membership =
      (
        (membershipsData ?? []) as
          CompanyMembershipRow[]
      ).find(
        (company) =>
          company.company_id ===
          activeCompanyId,
      ) ?? null

    if (membershipError) {
      return NextResponse.json(
        {
          ok: false,
          status: 'MEMBERSHIP_ERROR',
          error:
            membershipError.message,
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
          status:
            'NO_COMPANY_PERMISSION',
          error:
            'Usuário sem vínculo ativo com a empresa selecionada.',
        },
        {
          status: 403,
          headers: corsHeaders,
        },
      )
    }

    return NextResponse.json(
      buildConnectedPayload({
        userId:
          user.id,
        fullName:
          profile.full_name ?? null,
        email:
          profile.email ??
          user.email ??
          null,
        isPlatformAdmin:
          profile.is_platform_admin === true,
        companyId:
          membership.company_id,
        companyName:
          getCompanyName(
            membership,
          ),
        role:
          membership.role,
        isActive:
          membership.is_active === true,
      }),
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
          error instanceof Error &&
          error.message
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
