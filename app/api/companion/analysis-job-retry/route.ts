import {
  createClient,
} from '@supabase/supabase-js'

import {
  NextResponse,
} from 'next/server'

import {
  send,
} from '@vercel/queue'

import {
  CompanionAnalysisJobReadError,
} from '@/app/lib/server/companion-analysis-job-reader'

import {
  retryCompanionAnalysisJob,
} from '@/app/lib/server/companion-analysis-job-retry'

import {
  verifyCompanionRequestToken,
} from '@/app/lib/server/companion-token'

type RetryAnalysisJobBody = {
  analysis_job_id?: unknown
  device_key?: unknown
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

/*
 * Este endpoint NÃO executa IA. Ele apenas reabre, mediante ação posterior
 * do vendedor, um job terminal `failed` do mesmo snapshot e o republica no
 * mesmo Queue/worker durable. `succeeded` e `superseded` nunca são reabertos.
 */
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
  ) as RetryAnalysisJobBody

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
          'ANALYSIS_JOB_SERVER_NOT_CONFIGURED',
        error:
          'O servidor da análise profunda do Companion não está configurado.',
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
      await retryCompanionAnalysisJob({
        admin,
        token,
        analysis_job_id:
          body.analysis_job_id,
        device_key:
          body.device_key,
        publish:
          send,
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
      CompanionAnalysisJobReadError
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
          'ANALYSIS_JOB_RETRY_UNEXPECTED_ERROR',
        error:
          'Não foi possível iniciar uma nova tentativa da análise profunda.',
      },
      {
        status: 500,
        headers:
          corsHeaders,
      },
    )
  }
}
