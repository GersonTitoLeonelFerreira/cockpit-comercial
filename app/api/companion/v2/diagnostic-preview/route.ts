import {
  createClient,
} from '@supabase/supabase-js'

import {
  NextResponse,
} from 'next/server'

import {
  CompanionDiagnosticEngineError,
} from '@/app/lib/server/companion-diagnostic-engine'

import {
  CompanionDiagnosticModelError,
} from '@/app/lib/companion/diagnostic-model'

import {
  CompanionDiagnosticPreviewError,
  runCompanionDiagnosticPreview,
} from '@/app/lib/server/companion-diagnostic-preview'

import {
  CompanionDiagnosticSnapshotError,
} from '@/app/lib/server/companion-diagnostic-snapshot'

import {
  verifyCompanionRequestToken,
} from '@/app/lib/server/companion-token'

type DiagnosticPreviewBody = {
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

function isKnownDiagnosticError(
  error: unknown,
): error is
  | CompanionDiagnosticPreviewError
  | CompanionDiagnosticSnapshotError
  | CompanionDiagnosticEngineError
  | CompanionDiagnosticModelError {
  return (
    error instanceof
      CompanionDiagnosticPreviewError ||
    error instanceof
      CompanionDiagnosticSnapshotError ||
    error instanceof
      CompanionDiagnosticEngineError ||
    error instanceof
      CompanionDiagnosticModelError
  )
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

  if (
    process.env
      .COMPANION_V2_PREVIEW_ENABLED !==
    'true'
  ) {
    return NextResponse.json(
      {
        ok: false,

        code:
          'COMPANION_V2_PREVIEW_DISABLED',

        error:
          'A prévia do Companion V2 não está habilitada neste ambiente.',
      },
      {
        status: 503,
        headers:
          corsHeaders,
      },
    )
  }

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
  ) as DiagnosticPreviewBody

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
          'DIAGNOSTIC_SERVER_NOT_CONFIGURED',

        error:
          'O servidor do diagnóstico V2 não está configurado.',
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
      await runCompanionDiagnosticPreview({
        admin,
        token,

        cycle_id:
          body.cycle_id,

        conversation_key:
          body.conversation_key,

        reference_time:
          new Date()
            .toISOString(),
      })

    return NextResponse.json(
      {
        ok: true,
        ...result,
      },
      {
        status: 200,
        headers:
          corsHeaders,
      },
    )
  } catch (error) {
    if (
      isKnownDiagnosticError(
        error,
      )
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
          'DIAGNOSTIC_PREVIEW_FAILED',

        error:
          'Não foi possível gerar a prévia do diagnóstico V2.',
      },
      {
        status: 500,
        headers:
          corsHeaders,
      },
    )
  }
}
