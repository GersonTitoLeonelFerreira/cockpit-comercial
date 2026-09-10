import {
  createClient,
} from '@supabase/supabase-js'

import {
  NextResponse,
} from 'next/server'

import {
  AgoraDecisionStateReadError,
  CompanionClientContextError,
  loadAgoraViewModel,
} from '@/app/lib/server/agora-decision-state-loader'

import {
  verifyCompanionRequestToken,
} from '@/app/lib/server/companion-token'

// FASE 16.5 — expõe o AGORA seller-facing view model (Decision State,
// FASE 16.3E, traduzido por app/lib/server/agora-view-model.ts) para a
// extensão. Read-only: nunca escreve CRM/Agenda, nunca aciona análise,
// nunca aciona Message Intelligence Engine (MIE seller-facing continua
// pausado — mandato §30).

type DecisionStateBody = {
  cycle_id?: unknown
  conversation_key?: unknown
}

function getCorsHeaders(
  request: Request,
) {
  const origin =
    request.headers.get(
      'origin',
    ) ?? ''

  const allowedOrigins = [
    'https://web.whatsapp.com',
    'https://cockpit-comercial-vocn.vercel.app',
    'http://localhost:3000',
  ]

  const isExtensionOrigin =
    origin.startsWith(
      'chrome-extension://',
    ) ||
    origin.startsWith(
      'moz-extension://',
    )

  const allowOrigin =
    allowedOrigins.includes(
      origin,
    ) ||
    isExtensionOrigin
      ? origin
      : 'https://cockpit-comercial-vocn.vercel.app'

  return {
    'Access-Control-Allow-Origin':
      allowOrigin,

    'Access-Control-Allow-Credentials':
      'true',

    'Access-Control-Allow-Methods':
      'POST, OPTIONS',

    'Access-Control-Allow-Headers':
      'Content-Type, Authorization',

    Vary:
      'Origin',
  }
}

export async function OPTIONS(
  request: Request,
) {
  return new NextResponse(
    null,
    {
      status: 204,

      headers:
        getCorsHeaders(
          request,
        ),
    },
  )
}

export async function POST(
  request: Request,
) {
  const corsHeaders =
    getCorsHeaders(
      request,
    )

  const token =
    verifyCompanionRequestToken(
      request,
    )

  if (!token) {
    return NextResponse.json(
      {
        ok: false,

        code:
          'INVALID_COMPANION_SESSION',

        error:
          'Sessão do Companion inválida ou expirada.',
      },
      {
        status: 401,
        headers:
          corsHeaders,
      },
    )
  }

  const body = (
    await request
      .json()
      .catch(
        () => ({}),
      )
  ) as DecisionStateBody

  const supabaseUrl =
    process.env
      .NEXT_PUBLIC_SUPABASE_URL

  const serviceRoleKey =
    process.env
      .SUPABASE_SERVICE_ROLE_KEY

  if (
    !supabaseUrl ||
    !serviceRoleKey
  ) {
    return NextResponse.json(
      {
        ok: false,

        code:
          'DECISION_STATE_SERVER_NOT_CONFIGURED',

        error:
          'O servidor do Decision State do Companion não está configurado.',
      },
      {
        status: 500,
        headers:
          corsHeaders,
      },
    )
  }

  const admin =
    createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession:
            false,

          autoRefreshToken:
            false,
        },
      },
    )

  try {
    const result =
      await loadAgoraViewModel({
        admin,
        token,

        cycle_id:
          body.cycle_id,

        conversation_key:
          body.conversation_key,

        reference_time:
          new Date().toISOString(),
      })

    return NextResponse.json(
      {
        ok: true,
        data: result,
      },
      {
        status: 200,
        headers:
          corsHeaders,
      },
    )
  } catch (error) {
    if (
      error instanceof
        CompanionClientContextError ||
      error instanceof
        AgoraDecisionStateReadError
    ) {
      return NextResponse.json(
        {
          ok: false,

          code:
            error.code,

          error:
            error.message,

          retryable:
            error.retryable,
        },
        {
          status:
            error.status_code,

          headers:
            corsHeaders,
        },
      )
    }

    return NextResponse.json(
      {
        ok: false,

        code:
          'DECISION_STATE_UNEXPECTED_ERROR',

        error:
          'Não foi possível carregar o AGORA do Companion.',
      },
      {
        status: 500,
        headers:
          corsHeaders,
      },
    )
  }
}
