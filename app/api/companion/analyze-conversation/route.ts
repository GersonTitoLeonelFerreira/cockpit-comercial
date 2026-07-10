import { createHmac, timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { analyzeConversationWithCopilotDetailed } from '@/app/lib/ai/sales-copilot'
import type {
  AISalesContext,
  AISalesRecentEvent,
  AnalyzeConversationResponse,
  ConversationSource,
} from '@/app/types/ai-sales'
import type { LeadStatus } from '@/app/types/sales_cycles'

type CompanionRole = 'admin' | 'manager' | 'member'

type CompanionTokenPayload = {
  sub: string
  company_id: string
  role: CompanionRole
  iat: number
  exp: number
}

type AnalyzeCompanionBody = {
  cycle_id?: unknown
  conversation_text?: unknown
  source?: unknown
}

type JsonRecord = Record<string, unknown>

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

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isLeadStatus(value: unknown): value is LeadStatus {
  return (
    value === 'novo' ||
    value === 'contato' ||
    value === 'respondeu' ||
    value === 'negociacao' ||
    value === 'pausado' ||
    value === 'cancelado' ||
    value === 'ganho' ||
    value === 'perdido'
  )
}

function isConversationSource(value: unknown): value is ConversationSource {
  return value === 'whatsapp' || value === 'phone_summary' || value === 'notes'
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

function cleanConversationText(value: unknown) {
  const text = String(value ?? '')
    .replace(/\u0000/g, '')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()

  return text.slice(0, 24000)
}

function getString(value: unknown) {
  return typeof value === 'string' ? value : null
}

function getNullableString(value: unknown) {
  return value === null || typeof value === 'string' ? value : null
}

function getNestedString(record: JsonRecord, paths: string[][]) {
  for (const path of paths) {
    let current: unknown = record

    for (const key of path) {
      if (!isRecord(current)) {
        current = null
        break
      }

      current = current[key]
    }

    if (typeof current === 'string' && current.trim()) {
      return current
    }
  }

  return null
}

function normalizeEventMetadata(value: unknown): JsonRecord {
  return isRecord(value) ? value : {}
}

function mapRecentEvent(event: JsonRecord): AISalesRecentEvent | null {
  const metadata = normalizeEventMetadata(event.metadata)

  const eventType = getString(event.event_type)
  const occurredAt = getString(event.occurred_at)

  if (!eventType || !occurredAt) {
    return null
  }

  const fromStatus = getNestedString(metadata, [
    ['from_status'],
    ['payload', 'from_status'],
    ['checkpoint', 'from_status'],
    ['previous_status'],
    ['original_status'],
  ])

  const toStatus = getNestedString(metadata, [
    ['to_status'],
    ['payload', 'to_status'],
    ['checkpoint', 'to_status'],
    ['applied_status'],
    ['new_status'],
  ])

  return {
    event_type: eventType,
    occurred_at: occurredAt,
    from_status: isLeadStatus(fromStatus) ? fromStatus : null,
    to_status: isLeadStatus(toStatus) ? toStatus : null,
    action_channel: getNestedString(metadata, [
      ['action_channel'],
      ['payload', 'action_channel'],
      ['checkpoint', 'action_channel'],
      ['suggestion', 'action_channel'],
    ]),
    action_result: getNestedString(metadata, [
      ['action_result'],
      ['payload', 'action_result'],
      ['checkpoint', 'action_result'],
      ['suggestion', 'action_result'],
    ]),
    result_detail: getNestedString(metadata, [
      ['result_detail'],
      ['payload', 'result_detail'],
      ['checkpoint', 'result_detail'],
      ['suggestion', 'result_detail'],
    ]),
    next_action: getNestedString(metadata, [
      ['next_action'],
      ['payload', 'next_action'],
      ['checkpoint', 'next_action'],
      ['new_next_action'],
    ]),
    next_action_date: getNestedString(metadata, [
      ['next_action_date'],
      ['payload', 'next_action_date'],
      ['checkpoint', 'next_action_date'],
      ['new_next_action_date'],
    ]),
    lost_reason: getNestedString(metadata, [
      ['lost_reason'],
      ['payload', 'lost_reason'],
      ['checkpoint', 'lost_reason'],
      ['suggestion', 'close_reason'],
    ]),
    source: getNestedString(metadata, [
      ['source'],
      ['payload', 'source'],
    ]),
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
      return NextResponse.json<AnalyzeConversationResponse>(
        {
          ok: false,
          error: 'Sessão do Companion inválida ou expirada.',
        },
        {
          status: 401,
          headers: corsHeaders,
        },
      )
    }

    const body = (await request.json().catch(() => ({}))) as AnalyzeCompanionBody
    const cycleId = getString(body.cycle_id)
    const conversationText = cleanConversationText(body.conversation_text)
    const source = isConversationSource(body.source) ? body.source : 'whatsapp'

    if (!cycleId) {
      return NextResponse.json<AnalyzeConversationResponse>(
        {
          ok: false,
          error: 'cycle_id é obrigatório.',
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      )
    }

    if (conversationText.length < 15) {
      return NextResponse.json<AnalyzeConversationResponse>(
        {
          ok: false,
          error: 'A conversa capturada precisa ter pelo menos 15 caracteres úteis.',
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      )
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json<AnalyzeConversationResponse>(
        {
          ok: false,
          error: 'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.',
        },
        {
          status: 500,
          headers: corsHeaders,
        },
      )
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

    const { data: membership, error: membershipError } = await admin
      .from('company_memberships')
      .select('company_id, user_id, role, is_active')
      .eq('company_id', tokenPayload.company_id)
      .eq('user_id', tokenPayload.sub)
      .eq('is_active', true)
      .maybeSingle()

    if (membershipError) {
      return NextResponse.json<AnalyzeConversationResponse>(
        {
          ok: false,
          error: membershipError.message,
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      )
    }

    if (!membership?.company_id) {
      return NextResponse.json<AnalyzeConversationResponse>(
        {
          ok: false,
          error: 'Usuário sem vínculo ativo com a empresa do Companion.',
        },
        {
          status: 403,
          headers: corsHeaders,
        },
      )
    }

    const { data: cycle, error: cycleError } = await admin
      .from('sales_cycles')
      .select(
        'id, company_id, lead_id, status, owner_user_id, next_action, next_action_date, current_group_id',
      )
      .eq('id', cycleId)
      .eq('company_id', tokenPayload.company_id)
      .maybeSingle()

    if (cycleError) {
      return NextResponse.json<AnalyzeConversationResponse>(
        {
          ok: false,
          error: cycleError.message,
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      )
    }

    if (!cycle?.id || !cycle.lead_id || !isLeadStatus(cycle.status)) {
      return NextResponse.json<AnalyzeConversationResponse>(
        {
          ok: false,
          error: 'Ciclo não encontrado ou sem permissão.',
        },
        {
          status: 404,
          headers: corsHeaders,
        },
      )
    }

    const ownerUserId = getNullableString(cycle.owner_user_id)
    const isAdminOrManager = tokenPayload.role === 'admin' || tokenPayload.role === 'manager'

    if (!isAdminOrManager && ownerUserId !== tokenPayload.sub) {
      return NextResponse.json<AnalyzeConversationResponse>(
        {
          ok: false,
          error: 'Este ciclo não pertence à sua carteira.',
        },
        {
          status: 403,
          headers: corsHeaders,
        },
      )
    }

    const { data: lead, error: leadError } = await admin
      .from('leads')
      .select('id, name, phone, email, company_id')
      .eq('id', cycle.lead_id)
      .eq('company_id', tokenPayload.company_id)
      .maybeSingle()

    if (leadError) {
      return NextResponse.json<AnalyzeConversationResponse>(
        {
          ok: false,
          error: leadError.message,
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      )
    }

    if (!lead?.id) {
      return NextResponse.json<AnalyzeConversationResponse>(
        {
          ok: false,
          error: 'Lead do ciclo não encontrado.',
        },
        {
          status: 404,
          headers: corsHeaders,
        },
      )
    }

    let currentGroupName: string | null = null

    if (cycle.current_group_id) {
      const { data: group, error: groupError } = await admin
        .from('lead_groups')
        .select('id, name')
        .eq('id', cycle.current_group_id)
        .eq('company_id', tokenPayload.company_id)
        .maybeSingle()

      if (groupError) {
        return NextResponse.json<AnalyzeConversationResponse>(
          {
            ok: false,
            error: groupError.message,
          },
          {
            status: 400,
            headers: corsHeaders,
          },
        )
      }

      currentGroupName = getNullableString(group?.name)
    }

    const { data: events, error: eventsError } = await admin
      .from('cycle_events')
      .select('event_type, occurred_at, metadata')
      .eq('company_id', tokenPayload.company_id)
      .eq('cycle_id', cycleId)
      .order('occurred_at', {
        ascending: false,
      })
      .limit(12)

    if (eventsError) {
      return NextResponse.json<AnalyzeConversationResponse>(
        {
          ok: false,
          error: eventsError.message,
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      )
    }

    const recentEvents: AISalesRecentEvent[] = Array.isArray(events)
      ? events
          .map((event) => mapRecentEvent(isRecord(event) ? event : {}))
          .filter((event): event is AISalesRecentEvent => Boolean(event))
      : []

    const context: AISalesContext = {
      cycle_id: String(cycle.id),
      current_status: cycle.status,
      lead_name: getNullableString(lead.name),
      lead_phone: getNullableString(lead.phone),
      lead_email: getNullableString(lead.email),
      owner_user_id: ownerUserId,
      current_next_action: getNullableString(cycle.next_action),
      current_next_action_date: getNullableString(cycle.next_action_date),
      current_group_id: getNullableString(cycle.current_group_id),
      current_group_name: currentGroupName,
      recent_events: recentEvents,
    }

    const result = await analyzeConversationWithCopilotDetailed({
      context,
      conversationText,
      source,
    })

    return NextResponse.json<AnalyzeConversationResponse>(
      {
        ok: true,
        data: {
          context,
          suggestion: result.suggestion,
          diagnostics: result.diagnostics,
        },
      },
      {
        headers: corsHeaders,
      },
    )
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : 'Erro desconhecido ao analisar conversa pelo Companion.'

    return NextResponse.json<AnalyzeConversationResponse>(
      {
        ok: false,
        error: message,
      },
      {
        status: 500,
        headers: corsHeaders,
      },
    )
  }
}
