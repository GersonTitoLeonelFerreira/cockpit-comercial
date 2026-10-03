import {
  createClient,
} from '@supabase/supabase-js'

import {
  randomUUID,
} from 'crypto'

import {
  after,
  NextResponse,
} from 'next/server'

import {
  AnalysisViewModelReadError,
  CompanionClientContextError,
  loadAnalysisViewModel,
} from '@/app/lib/server/analysis-view-model-loader'

import {
  verifyCompanionRequestToken,
} from '@/app/lib/server/companion-token'

import {
  attachFullReadingToAnalysis,
  buildAnalysisFullReadingView,
  loadFullReadingPanelForRequest,
} from '@/app/lib/server/full-reading-panel'

// A leitura completa do painel (só em preview, com a flag
// COMPANION_FULL_READING_PANEL=on) roda depois da resposta (after) e leva
// por volta de 45 a 50 s.
export const maxDuration =
  300

// FASE 16.6 — expõe o ANÁLISE seller-facing view model (Integrated
// Commercial Context, FASE 16.4, traduzido por
// app/lib/server/analysis-view-model.ts) para a extensão. Read-only:
// nunca escreve CRM/Agenda, nunca aciona análise, nunca aciona Message
// Intelligence Engine (MIE seller-facing continua pausado — mandato
// §26). Mesmo desenho de app/api/companion/decision-state/route.ts
// (FASE 16.5).

type AnalysisViewModelBody = {
  cycle_id?: unknown
  conversation_key?: unknown
  force_reanalysis?: unknown
  // Rodada 8: "if_changed" quando o "Atualizar" só relê se algo mudou.
  force_mode?: unknown
  // Rodada 9: { current, total } enquanto a extensão transcreve áudio.
  audio_hold?: unknown
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
  ) as AnalysisViewModelBody

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
          'ANALYSIS_VIEW_MODEL_SERVER_NOT_CONFIGURED',

        error:
          'O servidor do ANÁLISE do Companion não está configurado.',
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
    const referenceTime =
      new Date().toISOString()

    const result =
      await loadAnalysisViewModel({
        admin,
        token,

        cycle_id:
          body.cycle_id,

        conversation_key:
          body.conversation_key,

        reference_time:
          referenceTime,
      })

    // Flag desligada: null, e a resposta é exatamente a de hoje.
    const fullReading =
      await loadFullReadingPanelForRequest({
        admin,
        userId:
          token.sub,
        companyId:
          token.company_id,
        cycleId:
          body.cycle_id,
        conversationKey:
          body.conversation_key,
        force:
          body.force_reanalysis,
        forceMode:
          body.force_mode,
        // Rodada 9 (I3): áudio desta conversa sendo transcrito.
        audioHold:
          body.audio_hold,
        referenceTime,
        route: '/api/companion/analysis-view-model',
        schedule:
          (task) => after(task),
        createRunId:
          randomUUID,
      })

    const data =
      fullReading
        ? attachFullReadingToAnalysis(
            result,
            buildAnalysisFullReadingView(
              fullReading.snapshot,
            ),
          )
        : result

    return NextResponse.json(
      {
        ok: true,
        data,
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
        AnalysisViewModelReadError
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
          'ANALYSIS_VIEW_MODEL_UNEXPECTED_ERROR',

        error:
          'Não foi possível carregar a ANÁLISE do Companion.',
      },
      {
        status: 500,
        headers:
          corsHeaders,
      },
    )
  }
}
