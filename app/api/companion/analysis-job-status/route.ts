import {
  createClient,
} from '@supabase/supabase-js'

import {
  NextResponse,
} from 'next/server'

import {
  CompanionAnalysisJobReadError,
  loadCompanionAnalysisJobStatus,
} from '@/app/lib/server/companion-analysis-job-reader'

import {
  verifyCompanionRequestToken,
} from '@/app/lib/server/companion-token'

type AnalysisJobStatusBody = {
  cycle_id?: unknown
  conversation_key?: unknown
  analysis_job_id?: unknown
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
 * Endpoint somente leitura sobre um resultado de análise profunda já
 * produzido e já persistido. Nunca chama OpenAI, nunca cria job, nunca
 * escreve em CRM/Agenda. A autorização é encadeada e fail-closed:
 * token autenticado -> empresa autorizada -> ciclo autorizado (e da
 * carteira do usuário) -> job pertence exatamente a esse
 * company_id/cycle_id/conversation_key. analysis_job_id sozinho nunca
 * é aceito como chave de busca.
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
  ) as AnalysisJobStatusBody

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
      await loadCompanionAnalysisJobStatus({
        admin,
        token,

        cycle_id:
          body.cycle_id,

        conversation_key:
          body.conversation_key,

        analysis_job_id:
          body.analysis_job_id,
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
          'ANALYSIS_JOB_UNEXPECTED_ERROR',

        error:
          'Não foi possível carregar o status da análise profunda.',
      },
      {
        status: 500,
        headers:
          corsHeaders,
      },
    )
  }
}
