import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { verifyCompanionRequestToken } from '@/app/lib/server/companion-token'

type CreateLeadBody = {
  name?: unknown
  phone?: unknown
  email?: unknown
  cpf_cnpj?: unknown
}

type LeadRow = {
  id: string
  company_id: string
  name: string | null
  phone: string | null
  email: string | null
  cpf_cnpj: string | null
  deleted_at: string | null
}

type LeadProfileRow = {
  lead_id: string
  cpf: string | null
  cnpj: string | null
}

type MembershipRow = {
  company_id: string
  user_id: string
  role: 'admin' | 'manager' | 'member'
  is_active: boolean
}

function getCorsHeaders(request: Request) {
  const origin = request.headers.get('origin') ?? ''
  const allowedOrigins = [
    'https://web.whatsapp.com',
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

function cleanText(value: unknown) {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()

  return text || null
}

function normalizeEmail(value: unknown) {
  const email = cleanText(value)
    ?.toLowerCase() ?? null

  return email
}

function isValidEmail(value: string) {
  return (
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      value,
    )
  )
}

function hasRepeatedDigits(value: string) {
  return /^(\d)\1+$/.test(value)
}

function isValidCPF(value: string) {
  const cpf = onlyDigits(value)

  if (cpf.length !== 11 || hasRepeatedDigits(cpf)) {
    return false
  }

  let sum = 0

  for (let index = 0; index < 9; index += 1) {
    sum += Number(cpf[index]) * (10 - index)
  }

  let firstCheck = (sum * 10) % 11

  if (firstCheck === 10) {
    firstCheck = 0
  }

  if (firstCheck !== Number(cpf[9])) {
    return false
  }

  sum = 0

  for (let index = 0; index < 10; index += 1) {
    sum += Number(cpf[index]) * (11 - index)
  }

  let secondCheck = (sum * 10) % 11

  if (secondCheck === 10) {
    secondCheck = 0
  }

  return secondCheck === Number(cpf[10])
}

function isValidCNPJ(value: string) {
  const cnpj = onlyDigits(value)

  if (cnpj.length !== 14 || hasRepeatedDigits(cnpj)) {
    return false
  }

  const calculateDigit = (
    base: string,
    weights: number[],
  ) => {
    const sum = base
      .split('')
      .reduce(
        (total, digit, index) =>
          total + Number(digit) * weights[index],
        0,
      )

    const remainder = sum % 11

    return remainder < 2 ? 0 : 11 - remainder
  }

  const base12 = cnpj.slice(0, 12)

  const firstDigit = calculateDigit(
    base12,
    [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  )

  const base13 = base12 + firstDigit

  const secondDigit = calculateDigit(
    base13,
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  )

  return cnpj === base12 + firstDigit + secondDigit
}

function normalizeDocumentInput(value: unknown) {
  const digits = onlyDigits(value)

  if (!digits) {
    return null
  }

  if (digits.length === 11 && isValidCPF(digits)) {
    return digits
  }

  if (digits.length === 14 && isValidCNPJ(digits)) {
    return digits
  }

  if (digits.length < 11) {
    const cpfCandidate = digits.padStart(11, '0')

    if (isValidCPF(cpfCandidate)) {
      return cpfCandidate
    }
  }

  if (digits.length > 11 && digits.length < 14) {
    const cnpjCandidate = digits.padStart(14, '0')

    if (isValidCNPJ(cnpjCandidate)) {
      return cnpjCandidate
    }
  }

  return digits
}

function isValidDocument(value: string) {
  if (value.length === 11) {
    return isValidCPF(value)
  }

  if (value.length === 14) {
    return isValidCNPJ(value)
  }

  return false
}

function buildLeadType(
  document: string | null,
): 'PF' | 'PJ' | null {
  if (document?.length === 11) {
    return 'PF'
  }

  if (document?.length === 14) {
    return 'PJ'
  }

  return null
}

function looksLikePhone(value: string) {
  const digits = onlyDigits(value)

  if (digits.length < 10 || digits.length > 13) {
    return false
  }

  return value.replace(/[\d\s()+.-]/g, '').length === 0
}

function addPhoneVariant(
  variants: Set<string>,
  value: string | null | undefined,
) {
  const digits = onlyDigits(value)

  if (digits) {
    variants.add(digits)
  }
}

function addBrazilMobileNinthDigitVariants(
  variants: Set<string>,
  localPhone: string,
) {
  const digits = onlyDigits(localPhone)

  if (digits.length !== 10 && digits.length !== 11) {
    return
  }

  addPhoneVariant(variants, digits)
  addPhoneVariant(variants, `55${digits}`)

  const ddd = digits.slice(0, 2)
  const subscriber = digits.slice(2)

  if (digits.length === 10) {
    const withNinthDigit = `${ddd}9${subscriber}`

    addPhoneVariant(variants, withNinthDigit)
    addPhoneVariant(variants, `55${withNinthDigit}`)
  }

  if (digits.length === 11 && digits[2] === '9') {
    const withoutNinthDigit = `${ddd}${digits.slice(3)}`

    addPhoneVariant(variants, withoutNinthDigit)
    addPhoneVariant(variants, `55${withoutNinthDigit}`)
  }
}

function buildPhoneVariants(rawPhone: string) {
  const digits = onlyDigits(rawPhone)
  const variants = new Set<string>()

  if (!digits) {
    return []
  }

  addPhoneVariant(variants, digits)

  const localPhone =
    digits.startsWith('55') &&
    (digits.length === 12 || digits.length === 13)
      ? digits.slice(2)
      : digits

  addBrazilMobileNinthDigitVariants(
    variants,
    localPhone,
  )

  if (
    !digits.startsWith('55') &&
    (digits.length === 10 || digits.length === 11)
  ) {
    addPhoneVariant(variants, `55${digits}`)
  }

  if (digits.startsWith('55') && digits.length > 11) {
    addPhoneVariant(variants, digits.slice(2))
  }

  return Array.from(variants).filter(Boolean)
}

function leadMatchesPhoneVariants(
  lead: LeadRow,
  phoneVariants: string[],
) {
  const targetVariants = new Set(phoneVariants)
  const leadPhoneVariants = buildPhoneVariants(
    lead.phone ?? '',
  )

  return leadPhoneVariants.some((variant) =>
    targetVariants.has(variant),
  )
}

function dedupeLeads(leads: LeadRow[]) {
  const byId = new Map<string, LeadRow>()

  leads.forEach((lead) => {
    byId.set(lead.id, lead)
  })

  return Array.from(byId.values())
}

function getCanonicalPhone(phoneVariants: string[]) {
  return [...phoneVariants]
    .sort((first, second) => {
      const firstHasCountry = first.startsWith('55') ? 1 : 0
      const secondHasCountry = second.startsWith('55') ? 1 : 0

      if (firstHasCountry !== secondHasCountry) {
        return secondHasCountry - firstHasCountry
      }

      if (first.length !== second.length) {
        return second.length - first.length
      }

      return first.localeCompare(second)
    })[0] ?? null
}

function isUniqueViolation(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false
  }

  const message = String(error.message ?? '').toLowerCase()

  return (
    error.code === '23505' ||
    message.includes('duplicate') ||
    message.includes('unique')
  )
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request),
  })
}

export async function POST(request: Request) {
  try {
    const tokenPayload =
      verifyCompanionRequestToken(request)

    if (!tokenPayload) {
      return jsonResponse(
        request,
        {
          ok: false,
          status: 'INVALID_COMPANION_TOKEN',
          error: 'Sessão do Companion inválida ou expirada.',
        },
        401,
      )
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceRoleKey) {
      return jsonResponse(
        request,
        {
          ok: false,
          status: 'ENV_MISSING',
          error: 'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.',
        },
        500,
      )
    }

    const body =
      (await request.json().catch(() => ({}))) as CreateLeadBody

    const name = cleanText(body.name)
    const phone = onlyDigits(body.phone)
    const email = normalizeEmail(body.email)
    const document = normalizeDocumentInput(body.cpf_cnpj)
    const phoneVariants = buildPhoneVariants(phone)
    const canonicalPhone =
      getCanonicalPhone(phoneVariants)

    if (!name || looksLikePhone(name)) {
      return jsonResponse(
        request,
        {
          ok: false,
          code: 'name_required',
          error: 'Informe o nome do contato para criar o lead.',
        },
        400,
      )
    }

    if (
      !phone ||
      phoneVariants.length === 0 ||
      !canonicalPhone
    ) {
      return jsonResponse(
        request,
        {
          ok: false,
          code: 'phone_required',
          error: 'Telefone confiável não localizado para criação do lead.',
        },
        400,
      )
    }

    if (document && !isValidDocument(document)) {
      return jsonResponse(
        request,
        {
          ok: false,
          code: 'invalid_document',
          error: 'Informe um CPF ou CNPJ válido.',
        },
        400,
      )
    }

    if (email && !isValidEmail(email)) {
      return jsonResponse(
        request,
        {
          ok: false,
          code: 'invalid_email',
          error: 'Informe um e-mail válido.',
        },
        400,
      )
    }

    const admin = createClient(url, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

    const { data: membershipData, error: membershipError } =
      await admin
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
          status: 'MEMBERSHIP_ERROR',
          error: membershipError.message,
        },
        400,
      )
    }

    const membership =
      membershipData as MembershipRow | null

    if (!membership?.company_id) {
      return jsonResponse(
        request,
        {
          ok: false,
          status: 'NO_COMPANY_PERMISSION',
          error: 'Usuário sem vínculo ativo com a empresa do Companion.',
        },
        403,
      )
    }

    const { data: profile, error: profileError } =
      await admin
        .from('profiles')
        .select('id, is_active_global')
        .eq('id', tokenPayload.sub)
        .maybeSingle()

    if (profileError) {
      return jsonResponse(
        request,
        {
          ok: false,
          status: 'PROFILE_ERROR',
          error: profileError.message,
        },
        400,
      )
    }

    if (!profile?.id || profile.is_active_global === false) {
      return jsonResponse(
        request,
        {
          ok: false,
          status: 'USER_INACTIVE',
          error: 'Usuário globalmente inativo ou sem perfil válido.',
        },
        403,
      )
    }

    const { data: possiblePhoneLeads, error: leadSearchError } =
      await admin
        .from('leads')
        .select(
          'id, company_id, name, phone, email, cpf_cnpj, deleted_at',
        )
        .eq('company_id', tokenPayload.company_id)
        .in('phone_digits', phoneVariants)

    if (leadSearchError) {
      return jsonResponse(
        request,
        {
          ok: false,
          status: 'LEAD_SEARCH_ERROR',
          error: leadSearchError.message,
        },
        400,
      )
    }

    const phoneMatchedLeads = dedupeLeads(
      ((possiblePhoneLeads ?? []) as LeadRow[])
        .filter((lead) =>
          leadMatchesPhoneVariants(
            lead,
            phoneVariants,
          ),
        ),
    )

    let emailMatchedLeads: LeadRow[] = []

    if (email) {
      const {
        data: directEmailLeads,
        error: directEmailError,
      } = await admin
        .from('leads')
        .select(
          'id, company_id, name, phone, email, cpf_cnpj, deleted_at',
        )
        .eq(
          'company_id',
          tokenPayload.company_id,
        )
        .eq('email_norm', email)

      if (directEmailError) {
        return jsonResponse(
          request,
          {
            ok: false,
            status: 'EMAIL_SEARCH_ERROR',
            error: directEmailError.message,
          },
          400,
        )
      }

      emailMatchedLeads =
        dedupeLeads(
          (
            directEmailLeads ?? []
          ) as LeadRow[],
        )
    }

    let documentMatchedLeads: LeadRow[] = []

    if (document) {
      const { data: directDocumentLeads, error: directDocumentError } =
        await admin
          .from('leads')
          .select(
            'id, company_id, name, phone, email, cpf_cnpj, deleted_at',
          )
          .eq('company_id', tokenPayload.company_id)
          .eq('cpf_cnpj', document)

      if (directDocumentError) {
        return jsonResponse(
          request,
          {
            ok: false,
            status: 'DOCUMENT_SEARCH_ERROR',
            error: directDocumentError.message,
          },
          400,
        )
      }

      const documentColumn =
        document.length === 11
          ? 'cpf'
          : 'cnpj'

      const { data: profileMatches, error: profileSearchError } =
        await admin
          .from('lead_profiles')
          .select('lead_id, cpf, cnpj')
          .eq('company_id', tokenPayload.company_id)
          .eq(documentColumn, document)

      if (profileSearchError) {
        return jsonResponse(
          request,
          {
            ok: false,
            status: 'DOCUMENT_SEARCH_ERROR',
            error: profileSearchError.message,
          },
          400,
        )
      }

      const profileLeadIds = Array.from(
        new Set(
          ((profileMatches ?? []) as LeadProfileRow[])
            .map((row) => row.lead_id)
            .filter(Boolean),
        ),
      )

      let profileDocumentLeads: LeadRow[] = []

      if (profileLeadIds.length > 0) {
        const { data: profileLeads, error: profileLeadsError } =
          await admin
            .from('leads')
            .select(
              'id, company_id, name, phone, email, cpf_cnpj, deleted_at',
            )
            .eq('company_id', tokenPayload.company_id)
            .in('id', profileLeadIds)

        if (profileLeadsError) {
          return jsonResponse(
            request,
            {
              ok: false,
              status: 'DOCUMENT_SEARCH_ERROR',
              error: profileLeadsError.message,
            },
            400,
          )
        }

        profileDocumentLeads =
          (profileLeads ?? []) as LeadRow[]
      }

      documentMatchedLeads = dedupeLeads([
        ...((directDocumentLeads ?? []) as LeadRow[]),
        ...profileDocumentLeads,
      ])
    }

    const matchedLeads = dedupeLeads([
      ...phoneMatchedLeads,
      ...emailMatchedLeads,
      ...documentMatchedLeads,
    ])

    if (matchedLeads.length > 1) {
      return jsonResponse(
        request,
        {
          ok: false,
          code: 'multiple_lead_matches',
          error:
            'Telefone, e-mail ou CPF/CNPJ apontam para cadastros diferentes. Resolva o vínculo dentro da Yolen antes de criar.',
        },
        409,
      )
    }

    const existingLead = matchedLeads[0] ?? null

    const matchedByPhone =
      existingLead
        ? phoneMatchedLeads.some(
            (lead) => lead.id === existingLead.id,
          )
        : false

    const matchedByEmail =
      existingLead
        ? emailMatchedLeads.some(
            (lead) => lead.id === existingLead.id,
          )
        : false

    const matchedByDocument =
      existingLead
        ? documentMatchedLeads.some(
            (lead) => lead.id === existingLead.id,
          )
        : false

    if (existingLead && !existingLead.deleted_at) {
      const conflictCode =
        matchedByPhone ||
        matchedByEmail
          ? 'active_lead_conflict'
          : 'document_lead_conflict'

      return jsonResponse(
        request,
        {
          ok: false,
          code: conflictCode,
          error:
            matchedByPhone
              ? 'Este contato já existe na Yolen. A criação foi bloqueada para evitar duplicidade.'
              : matchedByEmail
                ? 'Já existe um lead ativo com este e-mail na empresa. A criação foi bloqueada para evitar duplicidade.'
                : 'Já existe um lead ativo com este CPF/CNPJ na empresa. A criação foi bloqueada para evitar duplicidade.',
          conflict: {
            lead_id: existingLead.id,
            name: existingLead.name,
            phone: existingLead.phone,
            email: existingLead.email,
            cpf_cnpj: existingLead.cpf_cnpj,
            matched_by:
              matchedByPhone &&
              matchedByEmail &&
              matchedByDocument
                ? 'phone_email_and_document'
                : matchedByPhone &&
                    matchedByEmail
                  ? 'phone_and_email'
                  : matchedByPhone &&
                      matchedByDocument
                    ? 'phone_and_document'
                    : matchedByEmail &&
                        matchedByDocument
                      ? 'email_and_document'
                      : matchedByPhone
                        ? 'phone'
                        : matchedByEmail
                          ? 'email'
                          : 'document',
          },
        },
        409,
      )
    }

    if (existingLead?.deleted_at) {
      return jsonResponse(
        request,
        {
          ok: false,
          code: 'deleted_lead_conflict',
          error:
            membership.role === 'admin'
              ? 'Existe um lead excluído com este telefone, e-mail ou CPF/CNPJ. Use o fluxo administrativo de reativação.'
              : 'Existe um lead excluído com este telefone, e-mail ou CPF/CNPJ. Solicite a reativação ao administrador.',
          conflict: {
            lead_id: existingLead.id,
            name: existingLead.name,
            phone: existingLead.phone,
            cpf_cnpj: existingLead.cpf_cnpj,
          },
        },
        409,
      )
    }

    const ownerUserId = tokenPayload.sub

    const externalKey =
      `companion_phone:${canonicalPhone}`

    const { data: createdLeads, error: createLeadError } =
      await admin
        .from('leads')
        .insert({
          company_id: tokenPayload.company_id,
          name,
          phone,
          email,
          cpf_cnpj: document,
          status: 'novo',
          created_by: tokenPayload.sub,
          entry_mode: 'manual',
          source: 'whatsapp_companion',
          external_key: externalKey,
        })
        .select(
          'id, company_id, name, phone, email, cpf_cnpj, deleted_at',
        )

    if (createLeadError) {
      if (isUniqueViolation(createLeadError)) {
        return jsonResponse(
          request,
          {
            ok: false,
            code: 'concurrent_create_conflict',
            error: 'Outro cadastro deste contato foi concluído ao mesmo tempo. Atualize o vínculo.',
          },
          409,
        )
      }

      return jsonResponse(
        request,
        {
          ok: false,
          status: 'LEAD_CREATE_ERROR',
          error: createLeadError.message,
        },
        400,
      )
    }

    const createdLead =
      (createdLeads?.[0] as LeadRow | undefined) ?? null

    if (!createdLead?.id) {
      return jsonResponse(
        request,
        {
          ok: false,
          status: 'LEAD_CREATE_ERROR',
          error: 'Falha ao criar lead.',
        },
        400,
      )
    }

    const leadId = createdLead.id

    const leadProfilePayload: Record<string, unknown> = {
      lead_id: leadId,
      company_id: tokenPayload.company_id,
    }

    const leadType = buildLeadType(document)

    if (leadType) {
      leadProfilePayload.lead_type = leadType
    }

    if (document?.length === 11) {
      leadProfilePayload.cpf = document
    }

    if (document?.length === 14) {
      leadProfilePayload.cnpj = document
    }

    if (email) {
      leadProfilePayload.email = email
    }

    const { error: profileInsertError } =
      await admin
        .from('lead_profiles')
        .insert(leadProfilePayload)

    if (profileInsertError) {
      await admin
        .from('leads')
        .delete()
        .eq('company_id', tokenPayload.company_id)
        .eq('id', leadId)

      return jsonResponse(
        request,
        {
          ok: false,
          status: 'LEAD_PROFILE_CREATE_ERROR',
          error: profileInsertError.message,
        },
        400,
      )
    }

    const { data: createdCycles, error: cycleCreateError } =
      await admin
        .from('sales_cycles')
        .insert({
          company_id: tokenPayload.company_id,
          lead_id: leadId,
          owner_user_id: ownerUserId,
          status: 'novo',
          stage_entered_at: new Date().toISOString(),
        })
        .select('id, lead_id, owner_user_id, status')

    if (cycleCreateError) {
      await admin
        .from('lead_profiles')
        .delete()
        .eq('lead_id', leadId)

      await admin
        .from('leads')
        .delete()
        .eq('company_id', tokenPayload.company_id)
        .eq('id', leadId)

      return jsonResponse(
        request,
        {
          ok: false,
          status: 'CYCLE_CREATE_ERROR',
          error: cycleCreateError.message,
        },
        400,
      )
    }

    const cycleId = createdCycles?.[0]?.id as string | undefined

    if (!cycleId) {
      return jsonResponse(
        request,
        {
          ok: false,
          status: 'CYCLE_CREATE_ERROR',
          error: 'Falha ao criar ciclo comercial.',
        },
        400,
      )
    }

    const { error: cycleEventError } =
      await admin
        .from('cycle_events')
        .insert({
          company_id: tokenPayload.company_id,
          cycle_id: cycleId,
          event_type: 'cycle_created',
          created_by: tokenPayload.sub,
          metadata: {
            lead_name: name,
            owner_user_id: ownerUserId,
            group_id: null,
            source: 'companion',
            entry_mode: 'manual',
          },
          occurred_at: new Date().toISOString(),
        })

    if (cycleEventError) {
      console.error(
        'Companion create-lead: ciclo criado sem evento de auditoria.',
        cycleEventError.message,
      )
    }

    return jsonResponse(
      request,
      {
        ok: true,
        status: 'CREATED',
        data: {
          lead_id: leadId,
          cycle_id: cycleId,
          owner_user_id: ownerUserId,
          placement:
            ownerUserId === null
              ? 'IN_POOL'
              : 'OWNED_BY_ME',
        },
      },
      201,
    )
  } catch (error) {
    return jsonResponse(
      request,
      {
        ok: false,
        status: 'UNEXPECTED_ERROR',
        error:
          error instanceof Error && error.message
            ? error.message
            : 'Erro inesperado ao criar lead pelo Companion.',
      },
      500,
    )
  }
}
