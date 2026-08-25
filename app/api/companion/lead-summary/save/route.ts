import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

import {
  CompanionLeadSummaryError,
  saveCompanionLeadConversationSummary,
  resolveCompanionLeadIdentity,
} from '../../../../lib/server/companion-lead-summary-store'

import { verifyCompanionRequestToken } from '../../../../lib/server/companion-token'

type LeadSummarySaveBody = {
  cycle_id?: unknown
  conversation_key?: unknown
  summary?: unknown
  expected_version?: unknown
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

  const body = (await request.json().catch(() => ({}))) as LeadSummarySaveBody

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      {
        ok: false,
        code: 'LEAD_SUMMARY_SERVER_NOT_CONFIGURED',
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
    const identity = await resolveCompanionLeadIdentity({
      admin,
      token,
      cycle_id: body.cycle_id,
      conversation_key: body.conversation_key,
    })

    const result = await saveCompanionLeadConversationSummary({
      admin,
      identity,
      actorUserId: token.sub,
      summary: body.summary,
      expectedVersion: body.expected_version,
    })

    if (result.conflict) {
      return NextResponse.json(
        {
          ok: false,
          code: 'LEAD_SUMMARY_VERSION_CONFLICT',
          error:
            'O resumo já foi atualizado por outra ação desde a última leitura. Recarregue antes de salvar novamente.',
          retryable: false,
          data: {
            identity,
            current_version: result.current_version,
            summary: result.summary,
          },
        },
        {
          status: 409,
          headers: corsHeaders,
        },
      )
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          identity,
          summary: result.summary,
        },
      },
      {
        status: 200,
        headers: corsHeaders,
      },
    )
  } catch (error) {
    if (error instanceof CompanionLeadSummaryError) {
      // TEMP-DIAG-LEAD-SUMMARY — só código/status, nunca conteúdo do
      // resumo, token ou dado pessoal. Remover quando a Etapa 1 estiver
      // validada em produção real.
      console.error('[LEAD_SUMMARY_API] save failed', {
        code: error.code,
        status_code: error.status_code,
      })

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

    console.error(
      '[LEAD_SUMMARY_API] save unexpected error',
      error instanceof Error ? error.name : 'unknown',
    )

    return NextResponse.json(
      {
        ok: false,
        code: 'LEAD_SUMMARY_UNEXPECTED_ERROR',
        error: 'Não foi possível salvar o resumo persistente do lead.',
      },
      {
        status: 500,
        headers: corsHeaders,
      },
    )
  }
}
