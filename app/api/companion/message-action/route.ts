import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { verifyCompanionRequestToken } from '@/app/lib/server/companion-token'

type MessageAction = 'copied' | 'inserted' | 'sent'

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
    return value === 'copied' || value === 'inserted' || value === 'sent'
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
  
  
  
async function insertCompanionCommercialContactEvent({
    writeAdmin,
    companyId,
    cycleId,
    userId,
    occurredAt,
    coachingNoteId,
    idempotencyKey,
    message,
  }: {
    writeAdmin: CompanionMessageActionWriteClient
    companyId: string
    cycleId: string
    userId: string
    occurredAt: string
    coachingNoteId: string | null
    idempotencyKey: string
    message: string
  }) {
    const { error } = await writeAdmin.from('cycle_events').insert({
      company_id: companyId,
      cycle_id: cycleId,
      event_type: 'contacted',
      created_by: userId,
      occurred_at: occurredAt,
      metadata: {
        source: 'whatsapp_companion',
        action_channel: 'whatsapp',
        action_result: 'message_sent',
        result_detail: 'Mensagem sugerida enviada manualmente pelo WhatsApp.',
        action_type: 'quick_whats_sent',
        detail: 'quick_whats_sent',
        coaching_note_id: coachingNoteId,
        idempotency_key: idempotencyKey,
        message_preview: getMessagePreview(message),
        message_length: message.length,
        companion: {
          counted_as_commercial_activity: true,
          sent_manually: true,
          sent_automatically: false,
        },
      },
    })
  
    if (error) {
      throw new Error(
        error.message ||
          'Erro ao registrar envio manual como atividade comercial.',
      )
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
            sent_manually: action === 'sent',
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
  
      if (action === 'sent') {
        await insertCompanionCommercialContactEvent({
          writeAdmin,
          companyId: tokenPayload.company_id,
          cycleId,
          userId: tokenPayload.sub,
          occurredAt: now,
          coachingNoteId,
          idempotencyKey,
          message,
        })
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