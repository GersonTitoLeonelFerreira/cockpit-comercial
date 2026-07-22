import { createHash, createHmac, timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type CompanionRole = 'admin' | 'manager' | 'member'
type MessageAction = 'copied' | 'inserted'

type CompanionTokenPayload = {
  sub: string
  company_id: string
  role: CompanionRole
  iat: number
  exp: number
}

type RegisterMessageActionBody = {
  cycle_id?: unknown
  action?: unknown
  message?: unknown
  coaching_note_id?: unknown
}

type RegisterMessageActionResponse = {
    ok: boolean
    data?: {
      event_type: string
      action: MessageAction
      occurred_at: string
      already_registered?: boolean
    }
    error?: string
  }

type JsonRecord = Record<string, unknown>

type CompanionQueryError = {
  message?: string
}

type InsertResult = {
    error: CompanionQueryError | null
  }
  
  type ExistingMessageActionResult = {
    data: JsonRecord | null
    error: CompanionQueryError | null
  }
  
  type ExistingMessageActionQueryBuilder = {
    eq: (column: string, value: string) => ExistingMessageActionQueryBuilder
    order: (
      column: string,
      options?: {
        ascending?: boolean
      },
    ) => ExistingMessageActionQueryBuilder
    limit: (count: number) => ExistingMessageActionQueryBuilder
    maybeSingle: () => PromiseLike<ExistingMessageActionResult>
  }
  
  type CompanionMessageActionTable = {
    insert: (values: JsonRecord) => PromiseLike<InsertResult>
    select: (columns: string) => ExistingMessageActionQueryBuilder
  }
  
  type CompanionMessageActionWriteClient = {
    from: (table: 'cycle_events') => CompanionMessageActionTable
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

function getString(value: unknown) {
  return typeof value === 'string' ? value : null
}

function getNullableString(value: unknown) {
  return value === null || typeof value === 'string' ? value : null
}

function getCleanString(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const clean = value.trim()

  return clean || null
}

function isMessageAction(value: unknown): value is MessageAction {
  return value === 'copied' || value === 'inserted'
}

function getMessagePreview(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 500)
}


function buildMessageActionIdempotencyKey({
    cycleId,
    action,
    coachingNoteId,
    message,
  }: {
    cycleId: string
    action: MessageAction
    coachingNoteId: string | null
    message: string
  }) {
    return createHash('sha256')
      .update(
        [
          cycleId,
          action,
          coachingNoteId || '-',
          message.replace(/\s+/g, ' ').trim(),
        ].join('::'),
      )
      .digest('hex')
  }
  
  async function findExistingMessageAction({
    writeAdmin,
    companyId,
    cycleId,
    idempotencyKey,
  }: {
    writeAdmin: CompanionMessageActionWriteClient
    companyId: string
    cycleId: string
    idempotencyKey: string
  }) {
    const { data, error } = await writeAdmin
      .from('cycle_events')
      .select('id, occurred_at')
      .eq('company_id', companyId)
      .eq('cycle_id', cycleId)
      .eq('event_type', 'whatsapp_suggested_message_used')
      .eq('metadata->>idempotency_key', idempotencyKey)
      .order('occurred_at', {
        ascending: false,
      })
      .limit(1)
      .maybeSingle()
  
    if (error) {
      throw new Error(error.message || 'Erro ao verificar uso já registrado.')
    }
  
    const occurredAt = getString(data?.occurred_at)
  
    return occurredAt
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
      return NextResponse.json<RegisterMessageActionResponse>(
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

    const body = (await request.json().catch(() => ({}))) as RegisterMessageActionBody

    const cycleId = getString(body.cycle_id)
    const action = isMessageAction(body.action) ? body.action : null
    const message = getCleanString(body.message)
    const coachingNoteId = getNullableString(body.coaching_note_id)

    if (!cycleId) {
      return NextResponse.json<RegisterMessageActionResponse>(
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

    if (!action) {
      return NextResponse.json<RegisterMessageActionResponse>(
        {
          ok: false,
          error: 'Ação de mensagem inválida.',
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      )
    }

    if (!message) {
      return NextResponse.json<RegisterMessageActionResponse>(
        {
          ok: false,
          error: 'Mensagem sugerida é obrigatória.',
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
      return NextResponse.json<RegisterMessageActionResponse>(
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
      return NextResponse.json<RegisterMessageActionResponse>(
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
      return NextResponse.json<RegisterMessageActionResponse>(
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
      .select('id, company_id, status, owner_user_id')
      .eq('id', cycleId)
      .eq('company_id', tokenPayload.company_id)
      .maybeSingle()

    if (cycleError) {
      return NextResponse.json<RegisterMessageActionResponse>(
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

    if (!cycle?.id) {
      return NextResponse.json<RegisterMessageActionResponse>(
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
      return NextResponse.json<RegisterMessageActionResponse>(
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

    const now = new Date().toISOString()
    const eventType = 'whatsapp_suggested_message_used'
    const writeAdmin = admin as unknown as CompanionMessageActionWriteClient

    const idempotencyKey = buildMessageActionIdempotencyKey({
      cycleId,
      action,
      coachingNoteId,
      message,
    })

    const existingOccurredAt = await findExistingMessageAction({
      writeAdmin,
      companyId: tokenPayload.company_id,
      cycleId,
      idempotencyKey,
    })

    if (existingOccurredAt) {
      return NextResponse.json<RegisterMessageActionResponse>(
        {
          ok: true,
          data: {
            event_type: eventType,
            action,
            occurred_at: existingOccurredAt,
            already_registered: true,
          },
        },
        {
          headers: corsHeaders,
        },
      )
    }

    const { error: insertError } = await writeAdmin.from('cycle_events').insert({
      company_id: tokenPayload.company_id,
      cycle_id: cycleId,
      event_type: eventType,
      created_by: tokenPayload.sub,
      occurred_at: now,
      metadata: {
        source: 'whatsapp_companion',
        action,
        coaching_note_id: coachingNoteId,
        idempotency_key: idempotencyKey,
        message_preview: getMessagePreview(message),
        message_length: message.length,
        companion: {
          used_suggested_message: true,
          copied_to_clipboard: action === 'copied',
          inserted_into_whatsapp: action === 'inserted',
          sent_automatically: false,
        },
      },
    })

    if (insertError) {
      return NextResponse.json<RegisterMessageActionResponse>(
        {
          ok: false,
          error: insertError.message || 'Erro ao registrar uso da mensagem sugerida.',
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      )
    }

    return NextResponse.json<RegisterMessageActionResponse>(
      {
        ok: true,
        data: {
            event_type: eventType,
            action,
            occurred_at: now,
            already_registered: false,
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
        : 'Erro desconhecido ao registrar uso da mensagem sugerida.'

    return NextResponse.json<RegisterMessageActionResponse>(
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