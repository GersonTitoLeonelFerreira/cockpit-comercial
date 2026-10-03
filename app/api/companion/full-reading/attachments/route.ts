// Leitura completa — "Incluir na leitura" de um arquivo da conversa (HML).
//
// POST /api/companion/full-reading/attachments
//   { cycle_id, conversation_key, message_key, kind, media_type,
//     file_name, size_bytes, content_base64 }
//
// Só existe com COMPANION_FULL_READING_PANEL=on e VERCEL_ENV=preview (404
// fora disso). Exige a sessão do Companion e o mesmo acesso ao ciclo das
// demais rotas (vínculo ativo, ciclo da carteira ou gestor/admin). O
// arquivo vem da extensão: o servidor nunca baixa um endereço. Só o resumo
// é guardado; o arquivo não.

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
} from '@/app/lib/server/full-reading-flag'

import {
  countFullReadingRunsToday,
  resolveFullReadingDailyCap,
  startOfBrasiliaDay,
} from '@/app/lib/server/full-reading-panel'

import {
  AttachmentIncludeError,
  includeConversationAttachment,
  resolveAttachmentSummaryModel,
} from '@/app/lib/server/full-reading-attachments'

import {
  ClaudeProviderError,
  PROVIDER_CREDIT_EXHAUSTED_CODE,
} from '@/app/lib/companion/full-reading/anthropic-client'

export const maxDuration =
  90

export const dynamic =
  'force-dynamic'

type IncludeBody = {
  cycle_id?: unknown
  conversation_key?: unknown
  message_key?: unknown
  kind?: unknown
  media_type?: unknown
  file_name?: unknown
  size_bytes?: unknown
  content_base64?: unknown
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
  ) as IncludeBody

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return fail(500, 'FULL_READING_ATTACHMENT_NOT_CONFIGURED', 'O servidor não está configurado.')
  }

  const admin =
    createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

  try {
    // Mesma checagem de acesso das demais rotas do Companion: vínculo
    // ativo e ciclo da carteira (ou gestor/admin).
    const identity =
      await resolveCompanionLeadIdentity({
        admin,
        token,
        cycle_id: body.cycle_id,
        conversation_key: body.conversation_key,
      })

    const now =
      new Date().toISOString()

    const dailyCap =
      resolveFullReadingDailyCap()

    const result =
      await includeConversationAttachment({
        admin,
        scope: {
          company_id: identity.company_id,
          cycle_id: identity.cycle_id,
          conversation_key: identity.conversation_key,
        },
        userId: token.sub,
        messageKey: body.message_key,
        fileName: body.file_name,
        sizeBytes: body.size_bytes,
        kind: body.kind,
        mediaType: body.media_type,
        contentBase64: body.content_base64,
        apiKey: process.env.ANTHROPIC_API_KEY ?? '',
        model: resolveAttachmentSummaryModel(),
        dailyCap,
        since: startOfBrasiliaDay(now),
        countRunsToday: () =>
          countFullReadingRunsToday(admin, identity.company_id, now, dailyCap),
      })

    return NextResponse.json(
      {
        ok: true,
        data: {
          status: result.status,
          message_key: result.message_key,
        },
      },
      { status: 200, headers: corsHeaders },
    )
  } catch (error) {
    if (error instanceof CompanionLeadSummaryError) {
      return fail(error.status_code, error.code, error.message)
    }

    if (error instanceof AttachmentIncludeError) {
      if (error.code === PROVIDER_CREDIT_EXHAUSTED_CODE) {
        return fail(503, error.code, 'A IA ficou sem crédito.')
      }

      return fail(error.status, error.code, error.message)
    }

    if (error instanceof ClaudeProviderError) {
      return fail(502, error.code, 'Não consegui ler o arquivo agora.')
    }

    return fail(500, 'FULL_READING_ATTACHMENT_UNEXPECTED_ERROR', 'Não consegui ler o arquivo agora.')
  }
}
