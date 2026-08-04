import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

import {
  CaptureContractError,
  getCaptureRpcErrorHttpStatus,
  normalizeCaptureIngestionEnvelope,
} from '@/app/lib/companion/capture-ingestion'
import { verifyCompanionRequestToken } from '@/app/lib/server/companion-token'

type IngestionRpcMessageResult = {
  message_key?: unknown
  synced?: unknown
  canonical_version?: unknown
  reason?: unknown
}

type IngestionRpcRow = {
  inserted_count?: unknown
  unchanged_count?: unknown
  conflict_count?: unknown
  last_observed_message_id?: unknown
  state_version?: unknown
  message_results?: unknown
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

function normalizePositiveBigintString(
  value: unknown,
  fieldName: string,
) {
  const normalized =
    normalizeBigintString(
      value,
      fieldName,
    )

  if (!/^[1-9][0-9]*$/.test(normalized)) {
    throw new Error(
      `Resultado inválido da RPC: ${fieldName}.`,
    )
  }

  return normalized
}

function normalizeMessageResults(
  value: unknown,
) {
  if (!Array.isArray(value)) {
    throw new Error(
      'Resultado inválido da RPC: message_results.',
    )
  }

  return value.map((item, index) => {
    const result = item as
      | IngestionRpcMessageResult
      | null

    if (
      !result ||
      typeof result !== 'object'
    ) {
      throw new Error(
        `Resultado inválido da RPC: message_results[${index}].`,
      )
    }

    const messageKey =
      typeof result.message_key === 'string'
        ? result.message_key.trim()
        : ''

    if (!messageKey) {
      throw new Error(
        `Resultado inválido da RPC: message_results[${index}].message_key.`,
      )
    }

    if (typeof result.synced !== 'boolean') {
      throw new Error(
        `Resultado inválido da RPC: message_results[${index}].synced.`,
      )
    }

    const canonicalVersion =
      normalizePositiveBigintString(
        result.canonical_version,
        `message_results[${index}].canonical_version`,
      )

    let reason:
      | 'VERSION_CONFLICT'
      | null = null

    if (
      result.reason !== null &&
      result.reason !== undefined
    ) {
      if (
        result.reason !==
        'VERSION_CONFLICT'
      ) {
        throw new Error(
          `Resultado inválido da RPC: message_results[${index}].reason.`,
        )
      }

      reason = 'VERSION_CONFLICT'
    }

    if (
      result.synced === false &&
      reason !== 'VERSION_CONFLICT'
    ) {
      throw new Error(
        `Resultado inválido da RPC: message_results[${index}].reason.`,
      )
    }

    if (
      result.synced === true &&
      reason !== null
    ) {
      throw new Error(
        `Resultado inválido da RPC: message_results[${index}].reason.`,
      )
    }

    return {
      message_key: messageKey,
      synced: result.synced,
      canonical_version:
        canonicalVersion,
      reason,
    }
  })
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
            envelope.messages,
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

    const conflictCount = normalizeCount(
      result.conflict_count,
      'conflict_count',
    )

    const messageResults =
      normalizeMessageResults(
        result.message_results,
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

    if (
      messageResults.length !==
      envelope.messages.length
    ) {
      throw new Error(
        'Resultado inválido da RPC: quantidade de message_results.',
      )
    }

    const requestedMessageKeys =
      new Set(
        envelope.messages.map(
          (message) =>
            message.message_key,
        ),
      )

    const returnedMessageKeys =
      new Set(
        messageResults.map(
          (message) =>
            message.message_key,
        ),
      )

    if (
      returnedMessageKeys.size !==
        messageResults.length ||
      messageResults.some(
        (message) =>
          !requestedMessageKeys.has(
            message.message_key,
          ),
      )
    ) {
      throw new Error(
        'Resultado inválido da RPC: message_results não corresponde ao lote enviado.',
      )
    }

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
        conflict_count: conflictCount,
        message_results: messageResults,
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
