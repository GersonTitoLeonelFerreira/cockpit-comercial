import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

import {
  composeLeadMethodGuidance,
  normalizePublishedCommercialMethod,
} from '../../../lib/companion/lead-method-guidance'

import {
  createStatefulCopilotOpenAIProvider,
} from '../../../lib/companion/stateful-copilot-openai-provider'

import {
  CompanionLeadSummaryError,
  resolveCompanionLeadIdentity,
} from '../../../lib/server/companion-lead-summary-store'

import { verifyCompanionRequestToken } from '../../../lib/server/companion-token'

type MethodGuidanceBody = {
  cycle_id?: unknown
  conversation_key?: unknown
  working_summary?: unknown
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

  const body = (await request.json().catch(() => ({}))) as MethodGuidanceBody
  const workingSummary =
    typeof body.working_summary === 'string'
      ? body.working_summary.trim()
      : ''

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      {
        ok: false,
        code: 'METHOD_GUIDANCE_SERVER_NOT_CONFIGURED',
        error: 'Servidor da orientação comercial não está configurado.',
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

    const { data: publishedConfigRow, error: methodError } = await admin
      .from('company_commercial_config_versions')
      .select(
        'id, version_number, commercial_method_name, commercial_method_contract_version, commercial_method_definition',
      )
      .eq('company_id', identity.company_id)
      .eq('status', 'published')
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (methodError) {
      return NextResponse.json(
        {
          ok: false,
          code: 'METHOD_GUIDANCE_CONFIG_LOAD_FAILED',
          error: 'Não foi possível carregar o método comercial publicado.',
        },
        {
          status: 500,
          headers: corsHeaders,
        },
      )
    }

    const method = normalizePublishedCommercialMethod(publishedConfigRow)

    if (publishedConfigRow && !method) {
      return NextResponse.json(
        {
          ok: true,
          data: {
            status: 'invalid_method',
            method_name:
              typeof publishedConfigRow.commercial_method_name === 'string'
                ? publishedConfigRow.commercial_method_name
                : null,
            method_config_version_id:
              typeof publishedConfigRow.id === 'string'
                ? publishedConfigRow.id
                : null,
            stage_key: null,
            stage_name: null,
            stage_reason: null,
            next_step: null,
            error: 'O método comercial publicado está fora do contrato esperado.',
          },
        },
        {
          status: 200,
          headers: corsHeaders,
        },
      )
    }

    const provider = createStatefulCopilotOpenAIProvider({
      timeout_ms: 45_000,
      max_output_tokens: 900,
    })

    const guidance = await composeLeadMethodGuidance({
      workingSummary: workingSummary || null,
      method,
      provider,
    })

    return NextResponse.json(
      {
        ok: true,
        data: guidance,
      },
      {
        status: 200,
        headers: corsHeaders,
      },
    )
  } catch (error) {
    if (error instanceof CompanionLeadSummaryError) {
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
      '[METHOD_GUIDANCE_API] unexpected error',
      error instanceof Error ? error.name : 'unknown',
    )

    return NextResponse.json(
      {
        ok: false,
        code: 'METHOD_GUIDANCE_UNEXPECTED_ERROR',
        error: 'Não foi possível definir o próximo passo agora.',
      },
      {
        status: 500,
        headers: corsHeaders,
      },
    )
  }
}
