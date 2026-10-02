// Leitura completa — "Gerar mensagem" da aba MENSAGEM (HML).
//
// POST /api/companion/full-reading/message
//   { cycle_id, conversation_key, seller_intent }
//
// Só existe com COMPANION_FULL_READING_PANEL=on e VERCEL_ENV=preview (404
// fora disso). Exige a sessão do Companion e o mesmo acesso ao ciclo das
// demais rotas. Só lê o banco: não grava telemetria nem nada. A resposta
// traz a mensagem; quem envia é o vendedor (Incluir/Copiar).

import {
  createClient,
} from '@supabase/supabase-js'

import {
  NextResponse,
} from 'next/server'

import {
  verifyCompanionRequestToken,
} from '@/app/lib/server/companion-token'

import {
  CompanionLeadSummaryError,
  resolveCompanionLeadIdentity,
} from '@/app/lib/server/companion-lead-summary-store'

import {
  isFullReadingPanelEnabled,
} from '@/app/lib/server/full-reading-panel'

import {
  FullReadingMessageError,
  generateFullReadingMessage,
} from '@/app/lib/server/full-reading-message'

import {
  FULL_READING_CREDIT_EXHAUSTED_NOTICE,
} from '@/app/lib/server/full-reading-panel-view'

import {
  ClaudeProviderError,
  PROVIDER_CREDIT_EXHAUSTED_CODE,
} from '@/app/lib/companion/full-reading/anthropic-client'

import {
  FullReadingMessageOutputError,
} from '@/app/lib/companion/full-reading/message-prompt'

export const maxDuration =
  90

export const dynamic =
  'force-dynamic'

type MessageBody = {
  cycle_id?: unknown
  conversation_key?: unknown
  seller_intent?: unknown
}

function getCorsHeaders(
  request: Request,
) {
  const origin =
    request.headers.get('origin') ?? ''

  const allowedOrigins = [
    'https://web.whatsapp.com',
    'https://cockpit-comercial-vocn.vercel.app',
    'http://localhost:3000',
  ]

  const isExtensionOrigin =
    origin.startsWith('chrome-extension://') ||
    origin.startsWith('moz-extension://')

  return {
    'Access-Control-Allow-Origin':
      allowedOrigins.includes(origin) || isExtensionOrigin
        ? origin
        : 'https://cockpit-comercial-vocn.vercel.app',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  }
}

function notFound(): NextResponse {
  return new NextResponse(
    'Not Found',
    { status: 404 },
  )
}

export async function OPTIONS(
  request: Request,
) {
  if (!isFullReadingPanelEnabled()) {
    return notFound()
  }

  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request),
  })
}

export async function POST(
  request: Request,
) {
  if (!isFullReadingPanelEnabled()) {
    return notFound()
  }

  const corsHeaders =
    getCorsHeaders(request)

  const fail = (status: number, code: string, error: string) =>
    NextResponse.json(
      { ok: false, code, error },
      { status, headers: corsHeaders },
    )

  const token =
    verifyCompanionRequestToken(request)

  if (!token) {
    return fail(401, 'INVALID_COMPANION_SESSION', 'Sessão do Companion inválida ou expirada.')
  }

  const body = (
    await request.json().catch(() => ({}))
  ) as MessageBody

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return fail(500, 'FULL_READING_MESSAGE_NOT_CONFIGURED', 'O servidor da mensagem não está configurado.')
  }

  const admin =
    createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

  try {
    // Mesma checagem de acesso das demais rotas do Companion: membership
    // ativa e ciclo da carteira (ou admin/gestor).
    const identity =
      await resolveCompanionLeadIdentity({
        admin,
        token,
        cycle_id: body.cycle_id,
        conversation_key: body.conversation_key,
      })

    const result =
      await generateFullReadingMessage({
        admin,
        scope: {
          company_id: identity.company_id,
          cycle_id: identity.cycle_id,
          conversation_key: identity.conversation_key,
        },
        sellerIntent:
          typeof body.seller_intent === 'string'
            ? body.seller_intent
            : '',
        apiKey: process.env.ANTHROPIC_API_KEY ?? '',
      })

    return NextResponse.json(
      {
        ok: true,
        data: {
          status: 'ready',
          message: result.message,
          run_id: result.run_id,
        },
      },
      { status: 200, headers: corsHeaders },
    )
  } catch (error) {
    if (error instanceof CompanionLeadSummaryError) {
      return fail(error.status_code, error.code, error.message)
    }

    if (error instanceof FullReadingMessageError) {
      return fail(error.status, error.code, error.message)
    }

    // Rodada 7: sem crédito na API, o vendedor vê o motivo (sem nova
    // tentativa automática; o botão só é clicado de novo pelo vendedor).
    if (
      error instanceof ClaudeProviderError &&
      error.code === PROVIDER_CREDIT_EXHAUSTED_CODE
    ) {
      return fail(503, error.code, FULL_READING_CREDIT_EXHAUSTED_NOTICE)
    }

    if (
      error instanceof ClaudeProviderError ||
      error instanceof FullReadingMessageOutputError
    ) {
      return fail(502, error.code, 'Não foi possível gerar a mensagem agora.')
    }

    return fail(500, 'FULL_READING_MESSAGE_UNEXPECTED_ERROR', 'Não foi possível gerar a mensagem agora.')
  }
}
