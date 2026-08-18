import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { verifyCompanionRequestToken } from '@/app/lib/server/companion-token'

type CreateLeadBody = {
  name?: unknown
  phone?: unknown
}

type LeadRow = {
  id: string
  company_id: string
  name: string | null
  phone: string | null
  deleted_at: string | null
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

    const { data: possibleLeads, error: leadSearchError } =
      await admin
        .from('leads')
        .select('id, company_id, name, phone, deleted_at')
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

    const matchedLeads = dedupeLeads(
      ((possibleLeads ?? []) as LeadRow[])
        .filter((lead) =>
          leadMatchesPhoneVariants(
            lead,
            phoneVariants,
          ),
        ),
    )

    if (matchedLeads.length > 1) {
      return jsonResponse(
        request,
        {
          ok: false,
          code: 'multiple_lead_matches',
          error: 'Mais de um lead foi encontrado com este telefone. Resolva o vínculo dentro da Yolen antes de criar.',
        },
        409,
      )
    }

    const existingLead = matchedLeads[0] ?? null

    if (existingLead && !existingLead.deleted_at) {
      return jsonResponse(
        request,
        {
          ok: false,
          code: 'active_lead_conflict',
          error: 'Este contato já existe na Yolen. A criação foi bloqueada para evitar duplicidade.',
          conflict: {
            lead_id: existingLead.id,
            name: existingLead.name,
            phone: existingLead.phone,
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
              ? 'Existe um lead excluído com este telefone. Use o fluxo administrativo de reativação.'
              : 'Existe um lead excluído com este telefone. Solicite a reativação ao administrador.',
          conflict: {
            lead_id: existingLead.id,
            name: existingLead.name,
            phone: existingLead.phone,
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
          status: 'novo',
          created_by: tokenPayload.sub,
          entry_mode: 'manual',
          source: 'whatsapp_companion',
          external_key: externalKey,
        })
        .select('id, company_id, name, phone, deleted_at')

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

    const { error: profileInsertError } =
      await admin
        .from('lead_profiles')
        .insert({
          lead_id: leadId,
          company_id: tokenPayload.company_id,
        })

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
