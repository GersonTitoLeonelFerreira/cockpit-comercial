import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import {
  areLeadEnrichmentValuesEqual,
  normalizeLeadEnrichmentFieldValue,
  normalizeLeadEnrichmentUpdateInput,
  type LeadEnrichmentUpdateField,
} from '@/app/lib/companion/lead-enrichment-update-contract'
import { verifyCompanionRequestToken } from '@/app/lib/server/companion-token'

type MembershipRow = {
  company_id: string
  user_id: string
  role: 'admin' | 'manager' | 'member'
  is_active: boolean
}

type LeadRow = {
  id: string
  company_id: string
  email: string | null
  cpf_cnpj: string | null
  deleted_at: string | null
}

type LeadProfileRow = {
  lead_id: string
  company_id: string
  email: string | null
  cpf: string | null
  cnpj: string | null
  birth_date: string | null
  profession: string | null
  cep: string | null
  phone_mobile: string | null
}

type CycleRow = {
  id: string
  lead_id: string
  company_id: string
  status: string | null
  owner_user_id: string | null
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

function onlyDigits(
  value: unknown,
) {
  return String(value ?? '')
    .replace(/\D/g, '')
}

function isClosedCycleStatus(
  value: unknown,
) {
  return [
    'ganho',
    'perdido',
    'cancelado',
  ].includes(
    String(value ?? '')
      .toLowerCase(),
  )
}

function getCurrentFieldValue(
  field:
    LeadEnrichmentUpdateField,
  lead: LeadRow,
  profile:
    LeadProfileRow | null,
) {
  if (field === 'email') {
    return (
      lead.email ||
      profile?.email ||
      null
    )
  }

  if (field === 'cpf') {
    if (profile?.cpf) {
      return profile.cpf
    }

    const document =
      onlyDigits(
        lead.cpf_cnpj,
      )

    return document.length === 11
      ? document
      : null
  }

  if (field === 'cnpj') {
    if (profile?.cnpj) {
      return profile.cnpj
    }

    const document =
      onlyDigits(
        lead.cpf_cnpj,
      )

    return document.length === 14
      ? document
      : null
  }

  if (field === 'birth_date') {
    return (
      profile?.birth_date ||
      null
    )
  }

  if (field === 'profession') {
    return (
      profile?.profession ||
      null
    )
  }

  if (field === 'cep') {
    return profile?.cep || null
  }

  if (field === 'phone_mobile') {
    return (
      profile?.phone_mobile ||
      null
    )
  }

  return null
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

  const {
    data: leadData,
    error: leadError,
  } = await admin
    .from('leads')
    .select(
      'id, company_id, email, cpf_cnpj, deleted_at',
    )
    .eq('id', leadId)
    .eq(
      'company_id',
      tokenPayload.company_id,
    )
    .maybeSingle()

  if (leadError) {
    return jsonResponse(
      request,
      {
        ok: false,
        code:
          'lead_search_error',
        error:
          'Não foi possível validar o lead.',
      },
      400,
    )
  }

  const lead =
    leadData as
      LeadRow | null

  if (
    !lead?.id ||
    lead.deleted_at
  ) {
    return jsonResponse(
      request,
      {
        ok: false,
        code:
          'lead_unavailable',
        error:
          'Lead inexistente ou indisponível.',
      },
      404,
    )
  }

  const {
    data: cycleData,
    error: cycleError,
  } = await admin
    .from('sales_cycles')
    .select(
      'id, lead_id, company_id, status, owner_user_id',
    )
    .eq('id', cycleId)
    .eq('lead_id', leadId)
    .eq(
      'company_id',
      tokenPayload.company_id,
    )
    .maybeSingle()

  if (cycleError) {
    return jsonResponse(
      request,
      {
        ok: false,
        code:
          'cycle_search_error',
        error:
          'Não foi possível validar o ciclo.',
      },
      400,
    )
  }

  const cycle =
    cycleData as
      CycleRow | null

  if (!cycle?.id) {
    return jsonResponse(
      request,
      {
        ok: false,
        code:
          'cycle_not_found',
        error:
          'Ciclo não encontrado para este lead.',
      },
      404,
    )
  }

  if (
    isClosedCycleStatus(
      cycle.status,
    )
  ) {
    return jsonResponse(
      request,
      {
        ok: false,
        code:
          'cycle_closed',
        error:
          'O ciclo comercial está encerrado.',
      },
      409,
    )
  }

  const currentRole =
    membership.role

  const isAdminOrManager =
    currentRole === 'admin' ||
    currentRole === 'manager'

  if (
    !isAdminOrManager &&
    cycle.owner_user_id !==
      tokenPayload.sub
  ) {
    return jsonResponse(
      request,
      {
        ok: false,
        code:
          'not_cycle_owner',
        error:
          'Este lead não pertence à sua carteira.',
      },
      403,
    )
  }

  const {
    data: profileData,
    error: profileError,
  } = await admin
    .from('lead_profiles')
    .select(
      'lead_id, company_id, email, cpf, cnpj, birth_date, profession, cep, phone_mobile',
    )
    .eq('lead_id', leadId)
    .eq(
      'company_id',
      tokenPayload.company_id,
    )
    .maybeSingle()

  if (profileError) {
    return jsonResponse(
      request,
      {
        ok: false,
        code:
          'profile_search_error',
        error:
          'Não foi possível consultar o cadastro atual.',
      },
      400,
    )
  }

  const profile =
    profileData as
      LeadProfileRow | null

  const currentValue =
    getCurrentFieldValue(
      field,
      lead,
      profile,
    )

  if (
    !areLeadEnrichmentValuesEqual(
      field,
      currentValue,
      expectedCurrentValue,
    )
  ) {
    return jsonResponse(
      request,
      {
        ok: false,
        code:
          'stale_current_value',
        error:
          'O cadastro mudou desde que a sugestão foi criada. Atualize o Companion antes de confirmar.',
      },
      409,
    )
  }

  if (
    field === 'email'
  ) {
    const {
      data: conflict,
      error: conflictError,
    } = await admin
      .from('leads')
      .select('id')
      .eq(
        'company_id',
        tokenPayload.company_id,
      )
      .eq(
        'email_norm',
        value,
      )
      .neq('id', leadId)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()

    if (conflictError) {
      return jsonResponse(
        request,
        {
          ok: false,
          code:
            'email_conflict_search_error',
          error:
            'Não foi possível validar o e-mail.',
        },
        400,
      )
    }

    if (conflict?.id) {
      return jsonResponse(
        request,
        {
          ok: false,
          code:
            'email_conflict',
          error:
            'Este e-mail já pertence a outro lead da empresa.',
        },
        409,
      )
    }
  }

  if (
    field === 'cpf' ||
    field === 'cnpj'
  ) {
    const {
      data: conflict,
      error: conflictError,
    } = await admin
      .from('lead_profiles')
      .select('lead_id')
      .eq(
        'company_id',
        tokenPayload.company_id,
      )
      .eq(field, value)
      .neq('lead_id', leadId)
      .limit(1)
      .maybeSingle()

    if (conflictError) {
      return jsonResponse(
        request,
        {
          ok: false,
          code:
            'document_conflict_search_error',
          error:
            'Não foi possível validar o documento.',
        },
        400,
      )
    }

    if (conflict?.lead_id) {
      return jsonResponse(
        request,
        {
          ok: false,
          code:
            'document_conflict',
          error:
            'Este documento já pertence a outro lead da empresa.',
        },
        409,
      )
    }
  }

  const {
    data: applyData,
    error: applyError,
  } = await admin.rpc(
    'companion_apply_lead_enrichment',
    {
      p_company_id:
        tokenPayload.company_id,
      p_user_id:
        tokenPayload.sub,
      p_lead_id:
        leadId,
      p_cycle_id:
        cycleId,
      p_field:
        field,
      p_value:
        value,
      p_expected_current_value:
        expectedCurrentValue,
      p_evidence_message_ids:
        evidenceMessageIds,
      p_confirmed_by_human:
        true,
    },
  )

  if (applyError) {
    return jsonResponse(
      request,
      {
        ok: false,
        code:
          'enrichment_transaction_error',
        error:
          'Não foi possível concluir a atualização cadastral.',
      },
      500,
    )
  }

  const applyResult =
    applyData &&
    typeof applyData === 'object' &&
    !Array.isArray(applyData)
      ? applyData as Record<
          string,
          unknown
        >
      : null

  if (
    !applyResult ||
    applyResult.ok !== true
  ) {
    const code =
      typeof applyResult?.code ===
        'string'
        ? applyResult.code
        : 'enrichment_rejected'

    const error =
      typeof applyResult?.error ===
        'string'
        ? applyResult.error
        : 'A atualização cadastral foi rejeitada.'

    const status =
      [
        'no_company_permission',
        'not_cycle_owner',
      ].includes(code)
        ? 403
        : [
              'lead_unavailable',
              'cycle_not_found',
            ].includes(code)
          ? 404
          : [
                'cycle_closed',
                'stale_current_value',
                'email_conflict',
                'document_conflict',
              ].includes(code)
            ? 409
            : 400

    return jsonResponse(
      request,
      {
        ok: false,
        code,
        error,
      },
      status,
    )
  }

  return jsonResponse(
    request,
    {
      ok: true,
      status:
        'LEAD_ENRICHMENT_APPLIED',
      lead_id:
        leadId,
      cycle_id:
        cycleId,
      field,
      value,
      evidence_message_ids:
        evidenceMessageIds,
      confirmation:
        'human',
      already_applied:
        applyResult
          .already_applied ===
          true,
    },
    200,
  )
}
