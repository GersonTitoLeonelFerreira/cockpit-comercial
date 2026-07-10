import { createHmac, timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type CompanionRole = 'admin' | 'manager' | 'member'

type CompanionTokenPayload = {
  sub: string
  company_id: string
  role: CompanionRole
  iat: number
  exp: number
}

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

function getTokenSecret() {
  const secret =
    process.env.COMPANION_TOKEN_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!secret) {
    throw new Error(
      'ENV faltando: COMPANION_TOKEN_SECRET, SUPABASE_SERVICE_ROLE_KEY ou NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    )
  }

  return secret
}

function decodeBase64UrlJson<T>(value: string): T {
  const json = Buffer.from(value, 'base64url').toString('utf8')
  return JSON.parse(json) as T
}

function signPayload(encodedPayload: string) {
  return createHmac('sha256', getTokenSecret())
    .update(encodedPayload)
    .digest('base64url')
}

function safeCompare(a: string, b: string) {
  const aBuffer = Buffer.from(a)
  const bBuffer = Buffer.from(b)

  if (aBuffer.length !== bBuffer.length) {
    return false
  }

  return timingSafeEqual(aBuffer, bBuffer)
}

function verifyCompanionToken(request: Request): CompanionTokenPayload | null {
  const authorization = request.headers.get('authorization') ?? ''

  if (!authorization.startsWith('Bearer ')) {
    return null
  }

  const token = authorization.replace('Bearer ', '').trim()
  const [encodedPayload, signature] = token.split('.')

  if (!encodedPayload || !signature) {
    return null
  }

  const expectedSignature = signPayload(encodedPayload)

  if (!safeCompare(signature, expectedSignature)) {
    return null
  }

  const payload = decodeBase64UrlJson<CompanionTokenPayload>(encodedPayload)
  const now = Math.floor(Date.now() / 1000)

  if (!payload.sub || !payload.company_id || !payload.role || !payload.exp) {
    return null
  }

  if (payload.exp <= now) {
    return null
  }

  return payload
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

function buildPhoneSearchFragments(phoneVariants: string[]) {
  const fragments = new Set<string>()

  phoneVariants.forEach((variant) => {
    const digits = onlyDigits(variant)

    if (!digits) {
      return
    }

    fragments.add(digits)

    if (digits.startsWith('55') && digits.length > 11) {
      fragments.add(digits.slice(2))
    }

    if (digits.length >= 11) {
      fragments.add(digits.slice(-11))
    }

    if (digits.length >= 9) {
      fragments.add(digits.slice(-9))
    }

    if (digits.length >= 8) {
      fragments.add(digits.slice(-8))
    }

    if (digits.length >= 6) {
      fragments.add(digits.slice(-6))
    }

    if (digits.length >= 4) {
      fragments.add(digits.slice(-4))
    }
  })

  return Array.from(fragments).filter((fragment) => fragment.length >= 4)
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
    in: (column: string, values: string[]) => PromiseLike<LeadQueryResponse>
    or: (filters: string) => {
      limit: (count: number) => PromiseLike<LeadQueryResponse>
    }
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
  const { data: exactLeadsData, error: exactLeadsError } = await admin
    .from('leads')
    .select('id, company_id, name, phone, email, cpf_cnpj, deleted_at')
    .eq('company_id', companyId)
    .in('phone', phoneVariants)

  if (exactLeadsError) {
    return {
      leads: [],
      error: exactLeadsError.message,
    }
  }

  const exactLeads = ((exactLeadsData ?? []) as LeadRow[]).filter(
    (lead) => lead.company_id === companyId,
  )

  const exactMatches = exactLeads.filter((lead) => leadMatchesPhoneVariants(lead, phoneVariants))

  if (exactMatches.length > 0) {
    return {
      leads: dedupeLeads(exactMatches),
      error: null,
    }
  }

  const fragments = buildPhoneSearchFragments(phoneVariants)

  if (fragments.length === 0) {
    return {
      leads: [],
      error: null,
    }
  }

  const orFilter = fragments.map((fragment) => `phone.ilike.%${fragment}%`).join(',')

  const { data: fuzzyLeadsData, error: fuzzyLeadsError } = await admin
    .from('leads')
    .select('id, company_id, name, phone, email, cpf_cnpj, deleted_at')
    .eq('company_id', companyId)
    .or(orFilter)
    .limit(500)

  if (fuzzyLeadsError) {
    return {
      leads: [],
      error: fuzzyLeadsError.message,
    }
  }

  const fuzzyLeads = ((fuzzyLeadsData ?? []) as LeadRow[]).filter(
    (lead) => lead.company_id === companyId,
  )

  const fuzzyMatches = fuzzyLeads.filter((lead) => leadMatchesPhoneVariants(lead, phoneVariants))

  return {
    leads: dedupeLeads(fuzzyMatches),
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
  cycle?: SalesCycleRow | null
  owner?: ProfileRow | null
  phone: string | null
  phoneVariants?: string[]
  displayName: string | null
  tokenPayload: CompanionTokenPayload
}) {
  const isAdminOrManager = tokenPayload.role === 'admin' || tokenPayload.role === 'manager'
  const isOwnedByMe = cycle?.owner_user_id === tokenPayload.sub

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
          deleted_at: lead.deleted_at,
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
    const tokenPayload = verifyCompanionToken(request)

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