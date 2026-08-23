import {
  createClient,
} from '@supabase/supabase-js'

import {
  NextResponse,
} from 'next/server'

import {
  CompanionConversationRegistrationError,
  loadCanonicalConversationForRegistration,
} from '../../../../lib/server/companion-conversation-registration-loader'

import {
  verifyCompanionRequestToken,
} from '../../../../lib/server/companion-token'

type ConfirmBody = {
  cycle_id?: unknown
  conversation_key?: unknown
  watermark?: unknown
  summary_text?: unknown
}

type RegisterConversationRpcRow = {
  registration_id: string
  occurred_at: string
  summary_text: string
  already_registered: boolean
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

function getCleanString(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const clean = value.trim()

  return clean || null
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request),
  })
}

export async function POST(request: Request) {
  const corsHeaders = getCorsHeaders(request)

  const token = verifyCompanionRequestToken(request)

  if (!token) {
    return NextResponse.json(
      {
        ok: false,
        code: 'INVALID_COMPANION_SESSION',
        error: 'Sessão do Companion inválida ou expirada.',
      },
      {
        status: 401,
        headers: corsHeaders,
      },
    )
  }

  const body = (await request.json().catch(() => ({}))) as ConfirmBody

  const clientWatermark = getCleanString(body.watermark)
  const summaryText = getCleanString(body.summary_text)

  if (!clientWatermark) {
    return NextResponse.json(
      {
        ok: false,
        code: 'REGISTER_CONVERSATION_MISSING_WATERMARK',
        error: 'watermark é obrigatório.',
      },
      {
        status: 400,
        headers: corsHeaders,
      },
    )
  }

  if (!summaryText || summaryText.length > 4000) {
    return NextResponse.json(
      {
        ok: false,
        code: 'REGISTER_CONVERSATION_INVALID_SUMMARY',
        error: 'summary_text é obrigatório e deve ter até 4000 caracteres.',
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
    return NextResponse.json(
      {
        ok: false,
        code: 'REGISTER_CONVERSATION_SERVER_NOT_CONFIGURED',
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

  try {
    // Recarrega o snapshot canônico e recalcula o watermark no servidor —
    // nunca confia apenas no watermark que o cliente devolve. Se a conversa
    // mudou (mensagem nova, editada, deletada ou restaurada) desde o
    // preview, o watermark diverge e o registro é recusado em vez de
    // persistir um resumo desatualizado.
    const snapshot = await loadCanonicalConversationForRegistration({
      admin,
      token,
      cycle_id: body.cycle_id,
      conversation_key: body.conversation_key,
    })

    if (snapshot.watermark !== clientWatermark) {
      return NextResponse.json(
        {
          ok: false,
          code: 'REGISTER_CONVERSATION_STALE_WATERMARK',
          error: 'A conversa mudou desde a geração do resumo. Gere um novo resumo.',
          retryable: false,
        },
        {
          status: 409,
          headers: corsHeaders,
        },
      )
    }

    const { data, error } = await admin.rpc('rpc_register_companion_conversation_summary', {
      p_company_id: snapshot.company_id,
      p_cycle_id: snapshot.cycle_id,
      p_lead_id: snapshot.lead_id,
      p_seller_user_id: token.sub,
      p_conversation_key: snapshot.conversation_key,
      p_watermark: snapshot.watermark,
      p_summary_text: summaryText,
      p_message_count: snapshot.message_count,
      p_source: 'yolen_companion_register_conversation',
    })

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          code: 'REGISTER_CONVERSATION_PERSIST_FAILED',
          error: error.message || 'Não foi possível registrar a conversa no histórico.',
          retryable: true,
        },
        {
          status: 500,
          headers: corsHeaders,
        },
      )
    }

    const rows = Array.isArray(data) ? data : data ? [data] : []
    const result = rows[0] as RegisterConversationRpcRow | undefined

    if (!result) {
      return NextResponse.json(
        {
          ok: false,
          code: 'REGISTER_CONVERSATION_EMPTY_RESULT',
          error: 'O registro não retornou confirmação do banco.',
          retryable: true,
        },
        {
          status: 500,
          headers: corsHeaders,
        },
      )
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          registration_id: result.registration_id,
          summary_text: result.summary_text,
          occurred_at: result.occurred_at,
          watermark: snapshot.watermark,
          already_registered: result.already_registered,
        },
      },
      {
        status: 200,
        headers: corsHeaders,
      },
    )
  } catch (error) {
    if (error instanceof CompanionConversationRegistrationError) {
      return NextResponse.json(
        {
          ok: false,
          code: error.code,
          error: error.message,
          retryable: error.retryable,
        },
        {
          status: error.status_code,
          headers: corsHeaders,
        },
      )
    }

    return NextResponse.json(
      {
        ok: false,
        code: 'REGISTER_CONVERSATION_UNEXPECTED_ERROR',
        error: 'Não foi possível registrar a conversa no histórico.',
      },
      {
        status: 500,
        headers: corsHeaders,
      },
    )
  }
}
