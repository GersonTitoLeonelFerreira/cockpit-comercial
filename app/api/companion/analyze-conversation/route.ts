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

function isRecord(value: unknown): value is Record<string, unknown> {
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

function getRecentEvents(value: unknown): AISalesRecentEvent[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter(isRecord)
    .map((event) => ({
      event_type: String(event.event_type ?? ''),
      occurred_at: String(event.occurred_at ?? ''),
      from_status: isLeadStatus(event.from_status) ? event.from_status : null,
      to_status: isLeadStatus(event.to_status) ? event.to_status : null,
      action_channel: getNullableString(event.action_channel),
      action_result: getNullableString(event.action_result),
      result_detail: getNullableString(event.result_detail),
      next_action: getNullableString(event.next_action),
      next_action_date: getNullableString(event.next_action_date),
      lost_reason: getNullableString(event.lost_reason),
      source: getNullableString(event.source),
    }))
    .filter((event) => event.event_type && event.occurred_at)
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

    const { data, error } = await admin.rpc('rpc_get_cycle_ai_context_for_company', {
      p_company_id: tokenPayload.company_id,
      p_cycle_id: cycleId,
      p_events_limit: 12,
    })

    if (error) {
      return NextResponse.json<AnalyzeConversationResponse>(
        {
          ok: false,
          error: error.message || 'Erro ao montar contexto da IA.',
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      )
    }

    const rpcResult = Array.isArray(data) ? data[0] : data

    if (!isRecord(rpcResult)) {
      return NextResponse.json<AnalyzeConversationResponse>(
        {
          ok: false,
          error: 'Contexto do ciclo não retornado.',
        },
        {
          status: 404,
          headers: corsHeaders,
        },
      )
    }

    const cycle = isRecord(rpcResult.cycle) ? rpcResult.cycle : null
    const lead = isRecord(rpcResult.lead) ? rpcResult.lead : null

    if (rpcResult.success !== true || !cycle || !lead || !isLeadStatus(cycle.status)) {
      return NextResponse.json<AnalyzeConversationResponse>(
        {
          ok: false,
          error:
            getString(rpcResult.error) ||
            'Ciclo não encontrado ou sem permissão.',
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
      current_group_name: getNullableString(cycle.current_group_name),
      recent_events: getRecentEvents(rpcResult.recent_events),
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
