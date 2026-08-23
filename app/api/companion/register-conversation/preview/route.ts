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
  generateConversationRegistrationSummary,
} from '../../../../lib/companion/register-conversation-summary'

import {
  verifyCompanionRequestToken,
} from '../../../../lib/server/companion-token'

type PreviewBody = {
  cycle_id?: unknown
  conversation_key?: unknown
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

  const body = (await request.json().catch(() => ({}))) as PreviewBody

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
    const snapshot = await loadCanonicalConversationForRegistration({
      admin,
      token,
      cycle_id: body.cycle_id,
      conversation_key: body.conversation_key,
    })

    const { data: existing, error: existingError } = await admin
      .from('companion_conversation_registrations')
      .select('id, summary_text, created_at, message_count')
      .eq('company_id', snapshot.company_id)
      .eq('cycle_id', snapshot.cycle_id)
      .eq('watermark', snapshot.watermark)
      .maybeSingle()

    if (existingError) {
      return NextResponse.json(
        {
          ok: false,
          code: 'REGISTER_CONVERSATION_QUERY_FAILED',
          error: 'Não foi possível verificar registros existentes.',
        },
        {
          status: 500,
          headers: corsHeaders,
        },
      )
    }

    if (existing?.id) {
      return NextResponse.json(
        {
          ok: true,
          data: {
            already_registered: true,
            summary_text: existing.summary_text,
            watermark: snapshot.watermark,
            message_count: existing.message_count,
            occurred_at: existing.created_at,
          },
        },
        {
          status: 200,
          headers: corsHeaders,
        },
      )
    }

    const summaryResult = await generateConversationRegistrationSummary({
      messages: snapshot.messages,
      api_key: process.env.OPENAI_API_KEY,
      model: process.env.COMPANION_REGISTER_CONVERSATION_MODEL || process.env.OPENAI_MODEL,
    })

    if (!summaryResult.ok) {
      return NextResponse.json(
        {
          ok: false,
          code: summaryResult.code,
          error: summaryResult.message,
          retryable: summaryResult.retryable,
        },
        {
          status: summaryResult.code === 'REGISTER_CONVERSATION_MODEL_NOT_CONFIGURED' ? 503 : 502,
          headers: corsHeaders,
        },
      )
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          already_registered: false,
          summary_text: summaryResult.summary,
          watermark: snapshot.watermark,
          message_count: snapshot.message_count,
          occurred_at: null,
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
        error: 'Não foi possível gerar o resumo da conversa.',
      },
      {
        status: 500,
        headers: corsHeaders,
      },
    )
  }
}
