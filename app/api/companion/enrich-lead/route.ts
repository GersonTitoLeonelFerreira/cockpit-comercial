import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import {
  normalizeLeadEnrichmentUpdateInput,
} from '@/app/lib/companion/lead-enrichment-update-contract'
import { verifyCompanionRequestToken } from '@/app/lib/server/companion-token'
import { verifyActiveCompanionProfile } from '@/app/lib/companion/companion-principal-access'
import { applyLeadEnrichmentCore } from '@/app/lib/server/lead-enrichment-apply-core'

type MembershipRow = {
  company_id: string
  user_id: string
  role: 'admin' | 'manager' | 'member'
  is_active: boolean
}

function getCorsHeaders(
  request: Request,
) {
  const origin =
    request.headers.get('origin') ??
    ''

  const allowedOrigins = [
    'https://web.whatsapp.com',
    'https://cockpit-comercial-vocn.vercel.app',
    'http://localhost:3000',
  ]

  const isExtensionOrigin =
    origin.startsWith(
      'chrome-extension://',
    ) ||
    origin.startsWith(
      'moz-extension://',
    )

  const allowOrigin =
    allowedOrigins.includes(origin) ||
    isExtensionOrigin
      ? origin
      : 'https://cockpit-comercial-vocn.vercel.app'

  return {
    'Access-Control-Allow-Origin':
      allowOrigin,
    'Access-Control-Allow-Credentials':
      'true',
    'Access-Control-Allow-Methods':
      'POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization',
    Vary: 'Origin',
  }
}

function jsonResponse(
  request: Request,
  body: Record<string, unknown>,
  status: number,
) {
  return NextResponse.json(
    body,
    {
      status,
      headers:
        getCorsHeaders(request),
    },
  )
}

export async function OPTIONS(
  request: Request,
) {
  return new NextResponse(
    null,
    {
      status: 204,
      headers:
        getCorsHeaders(request),
    },
  )
}

export async function POST(
  request: Request,
) {
  const tokenPayload =
    verifyCompanionRequestToken(
      request,
    )

  if (!tokenPayload) {
    return jsonResponse(
      request,
      {
        ok: false,
        code:
          'invalid_companion_token',
        error:
          'Sessão do Companion inválida ou expirada.',
      },
      401,
    )
  }

  const body =
    await request
      .json()
      .catch(() => ({}))

  const normalized =
    normalizeLeadEnrichmentUpdateInput(
      body,
    )

  if (!normalized.ok) {
    return jsonResponse(
      request,
      {
        ok: false,
        code:
          normalized.code,
        error:
          normalized.error,
      },
      400,
    )
  }

  const {
    leadId,
    cycleId,
    field,
    value,
    expectedCurrentValue,
    evidenceMessageIds,
  } = normalized.value

  const supabaseUrl =
    process.env
      .NEXT_PUBLIC_SUPABASE_URL

  const serviceRoleKey =
    process.env
      .SUPABASE_SERVICE_ROLE_KEY

  if (
    !supabaseUrl ||
    !serviceRoleKey
  ) {
    return jsonResponse(
      request,
      {
        ok: false,
        code: 'env_missing',
        error:
          'Configuração de banco indisponível.',
      },
      500,
    )
  }

  const admin =
    createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    )

  const {
    data: membershipData,
    error: membershipError,
  } = await admin
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
    .eq('is_active', true)
    .maybeSingle()

  if (membershipError) {
    return jsonResponse(
      request,
      {
        ok: false,
        code:
          'membership_error',
        error:
          'Não foi possível validar o vínculo atual do usuário.',
      },
      400,
    )
  }

  const membership =
    membershipData as
      MembershipRow | null

  if (!membership?.company_id) {
    return jsonResponse(
      request,
      {
        ok: false,
        code:
          'no_company_permission',
        error:
          'Usuário sem vínculo ativo com esta empresa.',
      },
      403,
    )
  }

  // Hardening (STEP 2A.4, "REVOGAÇÃO GLOBAL IMEDIATA"): membership ativa
  // sozinha não basta — um usuário com profiles.is_active_global=false
  // precisa perder a capacidade de atualizar lead/lead_profile
  // IMEDIATAMENTE, mesmo com um Companion token ainda válido por horas.
  const profileAccess = await verifyActiveCompanionProfile({
    admin,
    userId: tokenPayload.sub,
  })

  if (profileAccess.error) {
    return jsonResponse(
      request,
      {
        ok: false,
        code: 'profile_lookup_failed',
        error: profileAccess.error,
      },
      400,
    )
  }

  if (!profileAccess.active) {
    return jsonResponse(
      request,
      {
        ok: false,
        code: 'profile_inactive',
        error: 'Usuário globalmente inativo ou sem perfil válido.',
      },
      403,
    )
  }

  const currentRole =
    membership.role

  const isAdminOrManager =
    currentRole === 'admin' ||
    currentRole === 'manager'

  // Núcleo compartilhado com app/api/companion/apply-manychat-lead-enrichment
  // (STEP 2B.5-D1.1) — mesma validação de ciclo/ownership/status,
  // stale-check e conflito de e-mail/documento, e a MESMA RPC. O
  // WhatsApp continua conhecendo e enviando leadId (nunca sanitizado
  // para este canal — RESOLVE_LEAD já expõe o lead inteiro), então
  // forceServerDerivedPhoneExpectedValue fica false: nenhuma mudança de
  // comportamento para o telefone no WhatsApp.
  const result = await applyLeadEnrichmentCore({
    admin,
    companyId: tokenPayload.company_id,
    userId: tokenPayload.sub,
    isAdminOrManager,
    cycleId,
    leadId,
    field,
    value,
    expectedCurrentValue,
    evidenceMessageIds,
    forceServerDerivedPhoneExpectedValue: false,
  })

  return jsonResponse(request, result.body, result.status)
}
