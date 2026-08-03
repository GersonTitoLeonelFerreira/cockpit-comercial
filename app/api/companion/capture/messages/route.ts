import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

import {
  CaptureContractError,
  getCaptureRpcErrorHttpStatus,
  normalizeCaptureIngestionEnvelope,
} from '@/app/lib/companion/capture-ingestion'
import { verifyCompanionRequestToken } from '@/app/lib/server/companion-token'

type IngestionRpcRow = {
  inserted_count?: unknown
  unchanged_count?: unknown
  last_observed_message_id?: unknown
  state_version?: unknown
}

function getCorsHeaders(request: Request) {
  const origin = request.headers.get('origin') ?? ''

  const allowedOrigins = [
    'https://web.whatsapp.com',
    'https://cockpit-comercial-vocn.vercel.app',
    'http://localhost:3000',
  ]

  const isExtensionOrigin =
    origin.startsWith('chrome-extension://') ||
    origin.startsWith('moz-extension://')

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

function normalizeCount(value: unknown, fieldName: string) {
  const normalized = Number(value)

  if (
    !Number.isInteger(normalized) ||
    normalized < 0
  ) {
    throw new Error(
      `Resultado inválido da RPC: ${fieldName}.`,
    )
  }

  return normalized
}

function normalizeBigintString(
  value: unknown,
  fieldName: string,
) {
  if (
    typeof value === 'string' &&
    /^\d+$/.test(value)
  ) {
    return value
  }

  if (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0
  ) {
    return String(value)
  }

  if (typeof value === 'bigint') {
    const normalized = value.toString()

    if (/^\d+$/.test(normalized)) {
      return normalized
    }
  }

  throw new Error(
    `Resultado inválido da RPC: ${fieldName}.`,
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

  try {
    const tokenPayload =
      verifyCompanionRequestToken(request)

    if (!tokenPayload) {
      return NextResponse.json(
        {
          ok: false,
          status: 'INVALID_COMPANION_TOKEN',
          error:
            'Sessão do Companion inválida ou expirada.',
        },
        {
          status: 401,
          headers: corsHeaders,
        },
      )
    }

    const rawBody = await request
      .json()
      .catch(() => undefined)

    const envelope =
      normalizeCaptureIngestionEnvelope(rawBody)

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL

    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        {
          ok: false,
          status: 'ENV_MISSING',
          error:
            'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.',
        },
        {
          status: 500,
          headers: corsHeaders,
        },
      )
    }

    const admin = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    )

    const { data, error } = await admin.rpc(
      'rpc_ingest_companion_messages',
      {
        p_company_id: tokenPayload.company_id,
        p_cycle_id: envelope.cycle_id,
        p_captured_by: tokenPayload.sub,
        p_conversation_key:
          envelope.conversation_key,
          p_device_key: envelope.device_key,
          p_messages:
            envelope.messages.map(
              (message) => ({
                ...message,
                observed_at:
                  envelope.observed_at,
              }),
            ),
      },
    )

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          status: 'CAPTURE_INGESTION_REJECTED',
          error: error.message,
        },
        {
          status:
            getCaptureRpcErrorHttpStatus(
              error,
            ),
          headers: corsHeaders,
        },
      )
    }

    const rows = Array.isArray(data)
      ? data
      : data
        ? [data]
        : []

    const result = rows[0] as
      | IngestionRpcRow
      | undefined

    if (!result) {
      return NextResponse.json(
        {
          ok: false,
          status: 'EMPTY_INGESTION_RESULT',
          error:
            'A ingestão não retornou confirmação do banco.',
        },
        {
          status: 500,
          headers: corsHeaders,
        },
      )
    }

    const insertedCount = normalizeCount(
      result.inserted_count,
      'inserted_count',
    )

    const unchangedCount = normalizeCount(
      result.unchanged_count,
      'unchanged_count',
    )

    const lastObservedMessageId =
      normalizeBigintString(
        result.last_observed_message_id,
        'last_observed_message_id',
      )

    const stateVersion =
      normalizeBigintString(
        result.state_version,
        'state_version',
      )

    return NextResponse.json(
      {
        ok: true,
        status: 'CAPTURE_INGESTED',
        contract_version:
          envelope.contract_version,
        cycle_id: envelope.cycle_id,
        conversation_key:
          envelope.conversation_key,
          device_key: envelope.device_key,
          observed_at:
            envelope.observed_at,
          observed_count:
            envelope.messages.length,
        deleted_observed_count:
          envelope.messages.filter(
            (message) => message.is_deleted,
          ).length,
        inserted_count: insertedCount,
        unchanged_count: unchangedCount,
        cursor: {
          last_observed_message_id:
            lastObservedMessageId,
          state_version: stateVersion,
        },
      },
      {
        status: 200,
        headers: corsHeaders,
      },
    )
  } catch (error) {
    if (error instanceof CaptureContractError) {
      return NextResponse.json(
        {
          ok: false,
          status: 'INVALID_CAPTURE_PAYLOAD',
          error: error.message,
          validation: {
            code: error.code,
            path: error.path,
          },
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      )
    }

    return NextResponse.json(
      {
        ok: false,
        status: 'CAPTURE_INGESTION_ERROR',
        error:
          error instanceof Error &&
          error.message
            ? error.message
            : 'Não foi possível ingerir as mensagens.',
      },
      {
        status: 500,
        headers: corsHeaders,
      },
    )
  }
}
