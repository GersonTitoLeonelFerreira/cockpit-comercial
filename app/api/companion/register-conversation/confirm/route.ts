import {
  createHash,
} from 'crypto'

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
  verifyConversationRegistrationConfirmationTokenValue,
} from '../../../../lib/server/companion-token'

type ConfirmBody = {
  cycle_id?: unknown
  conversation_key?: unknown
  confirmation_token?: unknown
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

function hashSummaryText(summaryText: string) {
  return createHash('sha256').update(summaryText.trim()).digest('hex')
}

function errorResponse({
  corsHeaders,
  status,
  code,
  error,
  retryable,
}: {
  corsHeaders: Record<string, string>
  status: number
  code: string
  error: string
  retryable?: boolean
}) {
  return NextResponse.json(
    {
      ok: false,
      code,
      error,
      ...(retryable === undefined ? {} : { retryable }),
    },
    {
      status,
      headers: corsHeaders,
    },
  )
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
    return errorResponse({
      corsHeaders,
      status: 401,
      code: 'INVALID_COMPANION_SESSION',
      error: 'Sessão do Companion inválida ou expirada.',
    })
  }

  const body = (await request.json().catch(() => ({}))) as ConfirmBody

  const confirmationTokenValue = getCleanString(body.confirmation_token)
  const summaryText = getCleanString(body.summary_text)
  const bodyCycleId = getCleanString(body.cycle_id)
  const bodyConversationKey = getCleanString(body.conversation_key)

  if (!confirmationTokenValue) {
    return errorResponse({
      corsHeaders,
      status: 400,
      code: 'REGISTER_CONVERSATION_MISSING_CONFIRMATION_TOKEN',
      error: 'confirmation_token é obrigatório.',
    })
  }

  if (!summaryText || summaryText.length > 4000) {
    return errorResponse({
      corsHeaders,
      status: 400,
      code: 'REGISTER_CONVERSATION_INVALID_SUMMARY',
      error: 'summary_text é obrigatório e deve ter até 4000 caracteres.',
    })
  }

  // O token de confirmação prova que este summary_text e este watermark
  // foram os que o SERVIDOR gerou no preview — o cliente nunca é autoridade
  // sobre o conteúdo que entra no histórico canônico. Assinatura inválida
  // ou expirada é rejeitada antes de qualquer acesso ao banco.
  const confirmationToken = verifyConversationRegistrationConfirmationTokenValue(
    confirmationTokenValue,
  )

  if (!confirmationToken) {
    return errorResponse({
      corsHeaders,
      status: 401,
      code: 'REGISTER_CONVERSATION_INVALID_CONFIRMATION_TOKEN',
      error: 'confirmation_token inválido, adulterado ou expirado. Gere um novo resumo.',
      retryable: false,
    })
  }

  if (confirmationToken.company_id !== token.company_id || confirmationToken.sub !== token.sub) {
    return errorResponse({
      corsHeaders,
      status: 403,
      code: 'REGISTER_CONVERSATION_CONFIRMATION_TOKEN_SCOPE_MISMATCH',
      error: 'confirmation_token não pertence a esta sessão do Companion.',
      retryable: false,
    })
  }

  if (bodyCycleId && bodyCycleId !== confirmationToken.cycle_id) {
    return errorResponse({
      corsHeaders,
      status: 409,
      code: 'REGISTER_CONVERSATION_CYCLE_MISMATCH',
      error: 'O ciclo informado não corresponde ao resumo gerado. Gere um novo resumo.',
      retryable: false,
    })
  }

  if (bodyConversationKey && bodyConversationKey !== confirmationToken.conversation_key) {
    return errorResponse({
      corsHeaders,
      status: 409,
      code: 'REGISTER_CONVERSATION_CONVERSATION_KEY_MISMATCH',
      error: 'A conversa informada não corresponde ao resumo gerado. Gere um novo resumo.',
      retryable: false,
    })
  }

  if (hashSummaryText(summaryText) !== confirmationToken.summary_hash) {
    return errorResponse({
      corsHeaders,
      status: 409,
      code: 'REGISTER_CONVERSATION_SUMMARY_MISMATCH',
      error: 'O resumo confirmado não corresponde ao resumo gerado pelo servidor. Gere um novo resumo.',
      retryable: false,
    })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return errorResponse({
      corsHeaders,
      status: 500,
      code: 'REGISTER_CONVERSATION_SERVER_NOT_CONFIGURED',
      error: 'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.',
    })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  try {
    // O ciclo/conversa usados para recarregar o ledger e persistir vêm do
    // TOKEN assinado (fonte de verdade), não do body — o body só serve
    // para detectar, de forma explícita, uma tentativa de reaproveitar um
    // token válido contra outro ciclo/conversa (rejeitado acima).
    const snapshot = await loadCanonicalConversationForRegistration({
      admin,
      token,
      cycle_id: confirmationToken.cycle_id,
      conversation_key: confirmationToken.conversation_key,
    })

    if (snapshot.watermark !== confirmationToken.watermark) {
      return errorResponse({
        corsHeaders,
        status: 409,
        code: 'REGISTER_CONVERSATION_STALE_WATERMARK',
        error: 'A conversa mudou desde a geração do resumo. Gere um novo resumo.',
        retryable: false,
      })
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
      return errorResponse({
        corsHeaders,
        status: 500,
        code: 'REGISTER_CONVERSATION_PERSIST_FAILED',
        error: error.message || 'Não foi possível registrar a conversa no histórico.',
        retryable: true,
      })
    }

    const rows = Array.isArray(data) ? data : data ? [data] : []
    const result = rows[0] as RegisterConversationRpcRow | undefined

    if (!result) {
      return errorResponse({
        corsHeaders,
        status: 500,
        code: 'REGISTER_CONVERSATION_EMPTY_RESULT',
        error: 'O registro não retornou confirmação do banco.',
        retryable: true,
      })
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
      return errorResponse({
        corsHeaders,
        status: error.status_code,
        code: error.code,
        error: error.message,
        retryable: error.retryable,
      })
    }

    return errorResponse({
      corsHeaders,
      status: 500,
      code: 'REGISTER_CONVERSATION_UNEXPECTED_ERROR',
      error: 'Não foi possível registrar a conversa no histórico.',
    })
  }
}
