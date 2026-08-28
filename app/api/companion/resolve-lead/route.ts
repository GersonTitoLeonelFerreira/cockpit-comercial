import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import {
  verifyCompanionRequestToken,
  type CompanionTokenPayload,
} from '@/app/lib/server/companion-token'

type ResolveLeadBody = {
  phone?: unknown
  display_name?: unknown
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

type SalesCycleRow = {
  id: string
  lead_id: string
  company_id: string
  status: string | null
  owner_user_id: string | null
  current_group_id: string | null
  next_action: string | null
  next_action_date: string | null
  updated_at: string | null
  created_at: string | null
}

type ProfileRow = {
  id: string
  full_name: string | null
  email: string | null
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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  }
}

function onlyDigits(value: unknown) {
  return String(value ?? '').replace(/\D/g, '')
}

function cleanText(value: unknown) {
  const text = String(value ?? '').trim()
  return text ? text : null
}

function addPhoneVariant(variants: Set<string>, value: string | null | undefined) {
  const digits = onlyDigits(value)

  if (!digits) {
    return
  }

  variants.add(digits)
}

function addBrazilMobileNinthDigitVariants(variants: Set<string>, localPhone: string) {
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
    digits.startsWith('55') && (digits.length === 12 || digits.length === 13)
      ? digits.slice(2)
      : digits

  addBrazilMobileNinthDigitVariants(variants, localPhone)

  if (!digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) {
    addPhoneVariant(variants, `55${digits}`)
  }

  if (digits.startsWith('55') && digits.length > 11) {
    addPhoneVariant(variants, digits.slice(2))
  }

  return Array.from(variants).filter(Boolean)
}

function leadMatchesPhoneVariants(lead: LeadRow, phoneVariants: string[]) {
  const targetVariants = new Set(phoneVariants)
  const leadPhoneVariants = buildPhoneVariants(lead.phone ?? '')

  return leadPhoneVariants.some((variant) => targetVariants.has(variant))
}

function dedupeLeads(leads: LeadRow[]) {
  const map = new Map<string, LeadRow>()

  leads.forEach((lead) => {
    map.set(lead.id, lead)
  })

  return Array.from(map.values())
}

type CompanionQueryError = {
    message: string
  }
  
  type LeadQueryResponse = {
    data: LeadRow[] | null
    error: CompanionQueryError | null
  }
  
  type LeadFilterBuilder = {
    in: (
      column: string,
      values: string[],
    ) => PromiseLike<LeadQueryResponse>
  }
  
  type LeadSelectBuilder = {
    eq: (column: string, value: string) => LeadFilterBuilder
  }
  
  type LeadTableBuilder = {
    select: (columns: string) => LeadSelectBuilder
  }
  
  type SupabaseAdminClient = {
    from: (table: 'leads') => LeadTableBuilder
  }

  async function findLeadsByPhone({
    admin,
    companyId,
    phoneVariants,
  }: {
    admin: SupabaseAdminClient
    companyId: string
    phoneVariants: string[]
  }) {
    const {
      data: leadsData,
      error: leadsError,
    } = await admin
      .from('leads')
      .select(
        'id, company_id, name, phone, email, cpf_cnpj, deleted_at',
      )
      .eq('company_id', companyId)
      .in('phone_digits', phoneVariants)
  
    if (leadsError) {
      return {
        leads: [],
        error: leadsError.message,
      }
    }
  
    const leads = (
      (leadsData ?? []) as LeadRow[]
    ).filter((lead) => {
      return (
        lead.company_id === companyId &&
        leadMatchesPhoneVariants(
          lead,
          phoneVariants,
        )
      )
    })
  
    return {
      leads: dedupeLeads(leads),
      error: null,
    }
  }

function isClosedStatus(status: string | null) {
  return ['ganho', 'perdido', 'cancelado'].includes(String(status ?? '').toLowerCase())
}

function getOwnerName(owner: ProfileRow | null) {
  return owner?.full_name || owner?.email || 'Outro vendedor'
}

function buildCreateLeadUrl(phone: string | null, displayName: string | null) {
  const params = new URLSearchParams()

  params.set('source', 'companion')

  if (phone) {
    params.set('phone', phone)
  }

  if (displayName) {
    params.set('name', displayName)
  }

  return `/leads?${params.toString()}`
}

function buildResolutionPayload({
  status,
  userMessage,
  lead,
  leadProfile,
  cycle,
  owner,
  phone,
  phoneVariants,
  displayName,
  tokenPayload,
}: {
  status:
    | 'NO_PHONE_DETECTED'
    | 'NOT_FOUND'
    | 'OWNED_BY_ME'
    | 'OWNED_BY_OTHER'
    | 'IN_POOL'
    | 'CLOSED_CYCLE'
    | 'SOFT_DELETED'
    | 'MULTIPLE_MATCHES'
    | 'LEAD_WITHOUT_CYCLE'
  userMessage: string
  lead?: LeadRow | null
  leadProfile?: LeadProfileRow | null
  cycle?: SalesCycleRow | null
  owner?: ProfileRow | null
  phone: string | null
  phoneVariants?: string[]
  displayName: string | null
  tokenPayload: CompanionTokenPayload
}) {
  const isAdminOrManager = tokenPayload.role === 'admin' || tokenPayload.role === 'manager'
  const isOwnedByMe = cycle?.owner_user_id === tokenPayload.sub

  const canReadLeadProfile =
    status === 'OWNED_BY_ME' ||
    isAdminOrManager

  return {
    ok: true,
    status,
    user_message: userMessage,
    phone,
    phone_variants: phoneVariants ?? [],
    display_name: displayName,
    lead: lead
      ? {
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
          cpf_cnpj:
            canReadLeadProfile
              ? lead.cpf_cnpj
              : null,
          deleted_at: lead.deleted_at,
        }
      : null,
    lead_profile:
      canReadLeadProfile &&
      leadProfile
        ? {
            email: leadProfile.email,
            cpf: leadProfile.cpf,
            cnpj: leadProfile.cnpj,
            birth_date:
              leadProfile.birth_date,
            profession:
              leadProfile.profession,
            cep: leadProfile.cep,
            address_street:
              leadProfile.address_street,
            address_number:
              leadProfile.address_number,
            address_complement:
              leadProfile.address_complement,
            address_neighborhood:
              leadProfile.address_neighborhood,
            address_city:
              leadProfile.address_city,
            address_state:
              leadProfile.address_state,
            phone_mobile:
              leadProfile.phone_mobile,
          }
        : null,
    cycle: cycle
      ? {
          id: cycle.id,
          status: cycle.status,
          owner_user_id: cycle.owner_user_id,
          owner_name: owner ? getOwnerName(owner) : null,
          current_group_id: cycle.current_group_id,
          next_action: cycle.next_action,
          next_action_date: cycle.next_action_date,
        }
      : null,
    actions: {
      can_analyze_conversation:
        status === 'OWNED_BY_ME' || (isAdminOrManager && status !== 'NOT_FOUND'),
      can_apply_suggestion: status === 'OWNED_BY_ME',
      can_create_lead_inside_extension: false,
      can_assign_pool_inside_extension: false,
      can_transfer_owner_inside_extension: false,
      open_yolen_url: lead && cycle ? `/sales-cycles/${cycle.id}` : '/leads',
      create_lead_url: buildCreateLeadUrl(phone, displayName),
      pool_url: '/pool',
    },
    flags: {
      is_admin_or_manager: isAdminOrManager,
      is_owned_by_me: isOwnedByMe,
      is_pool: cycle ? cycle.owner_user_id === null : false,
      is_closed: cycle ? isClosedStatus(cycle.status) : false,
    },
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request),
  })
}

export async function POST(request: Request) {
  const corsHeaders = getCorsHeaders(request)

  try {
    const tokenPayload = verifyCompanionRequestToken(request)

    if (!tokenPayload) {
      return NextResponse.json(
        {
          ok: false,
          status: 'INVALID_COMPANION_TOKEN',
          error: 'Sessão do Companion inválida ou expirada.',
        },
        {
          status: 401,
          headers: corsHeaders,
        },
      )
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceRoleKey) {
      return NextResponse.json(
        {
          ok: false,
          status: 'ENV_MISSING',
          error: 'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.',
        },
        {
          status: 500,
          headers: corsHeaders,
        },
      )
    }

    const admin = createClient(url, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

    const body = (await request.json().catch(() => ({}))) as ResolveLeadBody
    const rawPhone = cleanText(body.phone)
    const displayName = cleanText(body.display_name)
    const phoneVariants = rawPhone ? buildPhoneVariants(rawPhone) : []

    if (phoneVariants.length === 0) {
      return NextResponse.json(
        buildResolutionPayload({
          status: 'NO_PHONE_DETECTED',
          userMessage:
            'Não consegui detectar um telefone confiável na conversa aberta.',
          phone: null,
          phoneVariants,
          displayName,
          tokenPayload,
        }),
        {
          status: 200,
          headers: corsHeaders,
        },
      )
    }

    const { data: membership, error: membershipError } = await admin
      .from('company_memberships')
      .select('company_id, user_id, role, is_active')
      .eq('company_id', tokenPayload.company_id)
      .eq('user_id', tokenPayload.sub)
      .eq('is_active', true)
      .maybeSingle()

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
          error: 'Usuário sem vínculo ativo com a empresa do Companion.',
        },
        {
          status: 403,
          headers: corsHeaders,
        },
      )
    }

    const leadSearchAdmin = admin as unknown as SupabaseAdminClient

    const { leads: matchedLeads, error: leadsError } = await findLeadsByPhone({
      admin: leadSearchAdmin,
      companyId: tokenPayload.company_id,
      phoneVariants,
    })

    if (leadsError) {
      return NextResponse.json(
        {
          ok: false,
          status: 'LEAD_SEARCH_ERROR',
          error: leadsError,
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      )
    }

    if (matchedLeads.length === 0) {
      return NextResponse.json(
        buildResolutionPayload({
          status: 'NOT_FOUND',
          userMessage: 'Telefone não vinculado a nenhum lead nesta empresa.',
          phone: rawPhone,
          phoneVariants,
          displayName,
          tokenPayload,
        }),
        {
          status: 200,
          headers: corsHeaders,
        },
      )
    }

    const activeLeads = matchedLeads.filter((lead) => !lead.deleted_at)

    if (activeLeads.length === 0) {
      return NextResponse.json(
        buildResolutionPayload({
          status: 'SOFT_DELETED',
          userMessage:
            'Este telefone está vinculado a um lead arquivado ou excluído. A reativação deve ser feita dentro da Yolen.',
          lead: matchedLeads[0],
          phone: rawPhone,
          phoneVariants,
          displayName,
          tokenPayload,
        }),
        {
          status: 200,
          headers: corsHeaders,
        },
      )
    }

    if (activeLeads.length > 1) {
      return NextResponse.json(
        buildResolutionPayload({
          status: 'MULTIPLE_MATCHES',
          userMessage:
            'Mais de um lead foi encontrado com este telefone. Abra a Yolen para resolver o vínculo correto.',
          phone: rawPhone,
          phoneVariants,
          displayName,
          tokenPayload,
        }),
        {
          status: 200,
          headers: corsHeaders,
        },
      )
    }

    const lead = activeLeads[0]

    const {
      data: leadProfileData,
      error: leadProfileError,
    } = await admin
      .from('lead_profiles')
      .select(
        'lead_id, email, cpf, cnpj, birth_date, profession, cep, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, phone_mobile',
      )
      .eq(
        'company_id',
        tokenPayload.company_id,
      )
      .eq('lead_id', lead.id)
      .maybeSingle()

    if (leadProfileError) {
      return NextResponse.json(
        {
          ok: false,
          status:
            'LEAD_PROFILE_SEARCH_ERROR',
          error:
            leadProfileError.message,
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      )
    }

    const leadProfile =
      (
        leadProfileData as
          LeadProfileRow | null
      ) ?? null

    const { data: cycles, error: cyclesError } = await admin
      .from('sales_cycles')
      .select(
        'id, lead_id, company_id, status, owner_user_id, current_group_id, next_action, next_action_date, updated_at, created_at',
      )
      .eq('company_id', tokenPayload.company_id)
      .eq('lead_id', lead.id)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false, nullsFirst: false })

    if (cyclesError) {
      return NextResponse.json(
        {
          ok: false,
          status: 'CYCLE_SEARCH_ERROR',
          error: cyclesError.message,
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      )
    }

    const cycleRows = ((cycles ?? []) as SalesCycleRow[]).filter(
      (cycle) => cycle.company_id === tokenPayload.company_id,
    )

    if (cycleRows.length === 0) {
      return NextResponse.json(
        buildResolutionPayload({
          status: 'LEAD_WITHOUT_CYCLE',
          userMessage:
            'Lead encontrado, mas sem ciclo comercial ativo. Abra a Yolen para corrigir o vínculo.',
          lead,
          leadProfile,
          phone: rawPhone,
          phoneVariants,
          displayName,
          tokenPayload,
        }),
        {
          status: 200,
          headers: corsHeaders,
        },
      )
    }

    const openCycle = cycleRows.find((cycle) => !isClosedStatus(cycle.status))
    const latestCycle = openCycle ?? cycleRows[0]

    let owner: ProfileRow | null = null

    if (latestCycle.owner_user_id) {
      const { data: ownerProfile } = await admin
        .from('profiles')
        .select('id, full_name, email')
        .eq('id', latestCycle.owner_user_id)
        .maybeSingle()

      owner = (ownerProfile as ProfileRow | null) ?? null
    }

    if (!openCycle) {
      return NextResponse.json(
        buildResolutionPayload({
          status: 'CLOSED_CYCLE',
          userMessage:
            'Este lead possui apenas ciclo fechado. Nova oportunidade deve ser criada dentro da Yolen.',
          lead,
          leadProfile,
          cycle: latestCycle,
          owner,
          phone: rawPhone,
          phoneVariants,
          displayName,
          tokenPayload,
        }),
        {
          status: 200,
          headers: corsHeaders,
        },
      )
    }

    if (openCycle.owner_user_id === null) {
      return NextResponse.json(
        buildResolutionPayload({
          status: 'IN_POOL',
          userMessage:
            'Este lead está no Pool. Solicite ao gestor a distribuição para sua carteira.',
          lead,
          leadProfile,
          cycle: openCycle,
          owner,
          phone: rawPhone,
          phoneVariants,
          displayName,
          tokenPayload,
        }),
        {
          status: 200,
          headers: corsHeaders,
        },
      )
    }

    if (openCycle.owner_user_id !== tokenPayload.sub) {
      return NextResponse.json(
        buildResolutionPayload({
          status: 'OWNED_BY_OTHER',
          userMessage: `Este lead está vinculado à carteira de ${getOwnerName(owner)}.`,
          lead,
          leadProfile,
          cycle: openCycle,
          owner,
          phone: rawPhone,
          phoneVariants,
          displayName,
          tokenPayload,
        }),
        {
          status: 200,
          headers: corsHeaders,
        },
      )
    }

    return NextResponse.json(
      buildResolutionPayload({
        status: 'OWNED_BY_ME',
        userMessage: 'Lead encontrado na sua carteira.',
        lead,
        leadProfile,
        cycle: openCycle,
        owner,
        phone: rawPhone,
        phoneVariants,
        displayName,
        tokenPayload,
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
        status: 'UNEXPECTED_ERROR',
        error:
          error instanceof Error && error.message
            ? error.message
            : 'Erro inesperado ao localizar lead.',
      },
      {
        status: 500,
        headers: corsHeaders,
      },
    )
  }
}