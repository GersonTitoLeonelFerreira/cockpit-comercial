import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { areEquivalentPhones } from '@/app/lib/companion/lead-enrichment-phone-equivalence'
import { verifyCompanionRequestToken } from '@/app/lib/server/companion-token'
import { verifyActiveCompanionProfile } from '@/app/lib/companion/companion-principal-access'

// STEP 2B.5-D1 / 2B.5-D1.1 (Blocker D, Lead Enrichment — hardening):
// action privilegiada e MÍNIMA para o ManyChat obter o que falta para
// comparar/aplicar candidatos de cadastro
// (companion-lead-enrichment-controller.js), sem jamais reabrir o
// vazamento de telefone que
// manychat-capture-runtime.js#sanitizeLeadResolutionPayload corrige
// deliberadamente (nunca aumenta aquele allowlist, nunca usa o payload de
// RESOLVE_LEAD como transporte de dado cadastral). Entrada: SOMENTE
// cycle_id (autorizado pelo token) — lead_id é DERIVADO aqui no servidor
// a partir do próprio ciclo E NUNCA DEVOLVIDO na resposta: o content
// script opera inteiramente por cycle_id, sem round-trip de lead_id (ver
// app/api/companion/apply-manychat-lead-enrichment/route.ts, que deriva
// lead_id de novo, sozinho, na hora de aplicar). Telefone: o content
// script manda os candidatos NORMALIZADOS extraídos da conversa
// (phone_candidates) e recebe de volta só o resultado semântico
// (matches: true/false) — o telefone atual do lead
// (lead_profile.phone_mobile) nunca é incluído na resposta.
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
  address_street: string | null
  address_number: string | null
  address_complement: string | null
  address_neighborhood: string | null
  address_city: string | null
  address_state: string | null
  phone_mobile: string | null
}

type CycleRow = {
  id: string
  lead_id: string
  company_id: string
  status: string | null
  owner_user_id: string | null
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function getCorsHeaders(request: Request) {
  const origin = request.headers.get('origin') ?? ''

  const allowedOrigins = [
    'https://app.manychat.com',
    'https://cockpit-comercial-vocn.vercel.app',
    'http://localhost:3000',
  ]

  const isExtensionOrigin =
    origin.startsWith('chrome-extension://') ||
    origin.startsWith('moz-extension://')

  const allowOrigin =
    allowedOrigins.includes(origin) || isExtensionOrigin
      ? origin
      : 'https://cockpit-comercial-vocn.vercel.app'

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  }
}

function jsonResponse(
  request: Request,
  body: Record<string, unknown>,
  status: number,
) {
  return NextResponse.json(body, {
    status,
    headers: getCorsHeaders(request),
  })
}

function onlyDigits(value: unknown) {
  return String(value ?? '').replace(/\D/g, '')
}

function normalizePhoneCandidates(value: unknown) {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const normalized: string[] = []

  for (const item of value) {
    const digits = onlyDigits(item)

    if (
      digits.length < 10 ||
      digits.length > 13 ||
      seen.has(digits)
    ) {
      continue
    }

    seen.add(digits)
    normalized.push(digits)

    if (normalized.length >= 20) break
  }

  return normalized
}

function getCurrentNonPhoneValue(
  field:
    | 'email'
    | 'cpf'
    | 'cnpj'
    | 'birth_date'
    | 'profession'
    | 'cep',
  lead: LeadRow,
  profile: LeadProfileRow | null,
) {
  if (field === 'email') {
    return lead.email || profile?.email || null
  }

  if (field === 'cpf') {
    if (profile?.cpf) return profile.cpf
    const document = onlyDigits(lead.cpf_cnpj)
    return document.length === 11 ? document : null
  }

  if (field === 'cnpj') {
    if (profile?.cnpj) return profile.cnpj
    const document = onlyDigits(lead.cpf_cnpj)
    return document.length === 14 ? document : null
  }

  if (field === 'birth_date') {
    return profile?.birth_date || null
  }

  if (field === 'profession') {
    return profile?.profession || null
  }

  if (field === 'cep') {
    return profile?.cep || null
  }

  return null
}

function getAddressRawValue(profile: LeadProfileRow | null) {
  const parts = [
    profile?.address_street,
    profile?.address_number,
    profile?.address_complement,
    profile?.address_neighborhood,
    profile?.address_city,
    profile?.address_state,
  ]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)

  return parts.length > 0 ? parts.join(', ') : null
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request),
  })
}

export async function POST(request: Request) {
  const tokenPayload = verifyCompanionRequestToken(request)

  if (!tokenPayload) {
    return jsonResponse(
      request,
      {
        ok: false,
        code: 'invalid_companion_token',
        error: 'Sessão do Companion inválida ou expirada.',
      },
      401,
    )
  }

  const body = await request.json().catch(() => ({}))

  const cycleId =
    typeof body?.cycle_id === 'string'
      ? body.cycle_id.trim().toLowerCase()
      : ''

  if (!UUID_PATTERN.test(cycleId)) {
    return jsonResponse(
      request,
      {
        ok: false,
        code: 'invalid_scope',
        error: 'Ciclo inválido.',
      },
      400,
    )
  }

  const phoneCandidates = normalizePhoneCandidates(body?.phone_candidates)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      request,
      {
        ok: false,
        code: 'env_missing',
        error: 'Configuração de banco indisponível.',
      },
      500,
    )
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: membershipData, error: membershipError } = await admin
    .from('company_memberships')
    .select('company_id, user_id, role, is_active')
    .eq('company_id', tokenPayload.company_id)
    .eq('user_id', tokenPayload.sub)
    .eq('is_active', true)
    .maybeSingle()

  if (membershipError) {
    return jsonResponse(
      request,
      {
        ok: false,
        code: 'membership_error',
        error: 'Não foi possível validar o vínculo atual do usuário.',
      },
      400,
    )
  }

  const membership = membershipData as MembershipRow | null

  if (!membership?.company_id) {
    return jsonResponse(
      request,
      {
        ok: false,
        code: 'no_company_permission',
        error: 'Usuário sem vínculo ativo com esta empresa.',
      },
      403,
    )
  }

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

  const { data: cycleData, error: cycleError } = await admin
    .from('sales_cycles')
    .select('id, lead_id, company_id, status, owner_user_id')
    .eq('id', cycleId)
    .eq('company_id', tokenPayload.company_id)
    .maybeSingle()

  if (cycleError) {
    return jsonResponse(
      request,
      {
        ok: false,
        code: 'cycle_search_error',
        error: 'Não foi possível validar o ciclo.',
      },
      400,
    )
  }

  const cycle = cycleData as CycleRow | null

  if (!cycle?.id || !cycle.lead_id) {
    return jsonResponse(
      request,
      {
        ok: false,
        code: 'cycle_not_found',
        error: 'Ciclo não encontrado para esta empresa.',
      },
      404,
    )
  }

  const currentRole = membership.role
  const isAdminOrManager = currentRole === 'admin' || currentRole === 'manager'

  if (!isAdminOrManager && cycle.owner_user_id !== tokenPayload.sub) {
    return jsonResponse(
      request,
      {
        ok: false,
        code: 'not_cycle_owner',
        error: 'Este lead não pertence à sua carteira.',
      },
      403,
    )
  }

  const { data: leadData, error: leadError } = await admin
    .from('leads')
    .select('id, company_id, email, cpf_cnpj, deleted_at')
    .eq('id', cycle.lead_id)
    .eq('company_id', tokenPayload.company_id)
    .maybeSingle()

  if (leadError) {
    return jsonResponse(
      request,
      {
        ok: false,
        code: 'lead_search_error',
        error: 'Não foi possível validar o lead.',
      },
      400,
    )
  }

  const lead = leadData as LeadRow | null

  if (!lead?.id || lead.deleted_at) {
    return jsonResponse(
      request,
      {
        ok: false,
        code: 'lead_unavailable',
        error: 'Lead inexistente ou indisponível.',
      },
      404,
    )
  }

  const { data: profileData, error: profileError } = await admin
    .from('lead_profiles')
    .select(
      'lead_id, company_id, email, cpf, cnpj, birth_date, profession, cep, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, phone_mobile',
    )
    .eq('lead_id', lead.id)
    .eq('company_id', tokenPayload.company_id)
    .maybeSingle()

  if (profileError) {
    return jsonResponse(
      request,
      {
        ok: false,
        code: 'profile_search_error',
        error: 'Não foi possível consultar o cadastro atual.',
      },
      400,
    )
  }

  const profile = profileData as LeadProfileRow | null

  const phoneRegistered = Boolean(profile?.phone_mobile)

  const phoneMatches = phoneCandidates.map((normalizedValue) => ({
    normalized_value: normalizedValue,
    matches: profile?.phone_mobile
      ? areEquivalentPhones(normalizedValue, profile.phone_mobile)
      : false,
  }))

  return jsonResponse(
    request,
    {
      ok: true,
      data: {
        // STEP 2B.5-D1.1 (hardening): lead_id NUNCA é devolvido ao
        // content script — o ManyChat opera enrichment inteiramente por
        // cycle_id (único scope seller-facing que ele conhece); a
        // action de aplicação (APPLY_MANYCHAT_LEAD_ENRICHMENT) deriva
        // lead_id de novo, sozinha, a partir do cycle_id. Sem esse
        // round-trip o content nunca precisa reter/repassar um
        // identificador que ele mesmo não decide nada com.
        current_values: {
          email: getCurrentNonPhoneValue('email', lead, profile),
          cpf: getCurrentNonPhoneValue('cpf', lead, profile),
          cnpj: getCurrentNonPhoneValue('cnpj', lead, profile),
          birth_date: getCurrentNonPhoneValue('birth_date', lead, profile),
          profession: getCurrentNonPhoneValue('profession', lead, profile),
          cep: getCurrentNonPhoneValue('cep', lead, profile),
          address_raw: getAddressRawValue(profile),
        },
        // phone_mobile nunca aparece em current_values (hardening de
        // telefone). phone_registered é só um booleano (existe cadastro
        // ou não) — nunca o número em si. Um candidato "diferente" de um
        // telefone já cadastrado ainda pode ser confirmado: a action de
        // aplicação lê lead_profiles.phone_mobile ela mesma, no momento
        // do APPLY, e usa esse valor como expected_current_value
        // internamente — o content nunca precisa (nem pode) fornecê-lo.
        phone_registered: phoneRegistered,
        phone_matches: phoneMatches,
      },
    },
    200,
  )
}
