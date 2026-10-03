import { createHash } from 'node:crypto'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

import {
  CaptureContractError,
  classifyCaptureRpcError,
  findRpcRejectedMessageIndex,
  normalizeCaptureIngestionEnvelope,
  redactCaptureValidationText,
  type NormalizedCaptureMessage,
} from '@/app/lib/companion/capture-ingestion'
import { verifyCompanionRequestToken } from '@/app/lib/server/companion-token'
import {
  CLOSED_CYCLE_CAPTURE_UNAVAILABLE,
  customerWroteAfterClosureInLedger,
  isClosedCycleCaptureUnavailable,
  readClosedCycleCaptureTarget,
} from '@/app/lib/server/full-reading-closed-cycle'

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

// Log de recusa sem conteúdo: código, texto da validação (sem dígitos
// longos), índice e uma impressão curta da message_key — a chave do
// WhatsApp carrega o telefone, então ela nunca vai crua para o log.
function fingerprintKey(value: unknown) {
  return typeof value === 'string' && value
    ? createHash('sha256').update(value).digest('hex').slice(0, 12)
    : null
}

function logCaptureRejection(fields: Record<string, unknown>) {
  console.warn(
    'YOLEN_CAPTURE_INGESTION',
    JSON.stringify({
      event: 'capture_rejected',
      ...fields,
    }),
  )
}

function readMessageIndexFromPath(path: string) {
  const match = /^messages\[(\d+)\]/.exec(path)

  return match ? Number(match[1]) : null
}

function readRawMessageKey(rawBody: unknown, index: number | null) {
  if (
    index === null ||
    !rawBody ||
    typeof rawBody !== 'object' ||
    !Array.isArray((rawBody as { messages?: unknown }).messages)
  ) {
    return null
  }

  const message =
    (rawBody as { messages: unknown[] }).messages[index]

  const key =
    message && typeof message === 'object'
      ? (message as { message_key?: unknown }).message_key
      : null

  return typeof key === 'string' && key.trim()
    ? key.trim()
    : null
}

// A RPC não diz qual message_key está sem estado canônico: só lê o
// ledger (nada é gravado) para devolver as chaves que a extensão precisa
// reenviar sem base_version.
async function findMessagesWithoutCanonicalState({
  admin,
  companyId,
  conversationKey,
  messages,
}: {
  admin: SupabaseClient
  companyId: string
  conversationKey: string
  messages: NormalizedCaptureMessage[]
}) {
  const keysWithBase =
    messages
      .filter((message) => message.base_version !== null)
      .map((message) => message.message_key)

  if (keysWithBase.length === 0) {
    return []
  }

  const { data, error } =
    await admin
      .from('conversation_messages')
      .select('message_key')
      .eq('company_id', companyId)
      .eq('conversation_key', conversationKey)
      .in('message_key', keysWithBase)

  if (error) {
    return keysWithBase
  }

  const known =
    new Set(
      ((data ?? []) as { message_key?: unknown }[])
        .map((row) => row.message_key)
        .filter((key): key is string => typeof key === 'string'),
    )

  return keysWithBase.filter((key) => !known.has(key))
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request),
  })
}

export async function POST(request: Request) {
  const corsHeaders = getCorsHeaders(request)

  let rawBody: unknown = undefined
  let cycleIdForLog: string | null = null

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

    rawBody = await request
      .json()
      .catch(() => undefined)

    const envelope =
      normalizeCaptureIngestionEnvelope(rawBody)

    cycleIdForLog = envelope.cycle_id

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

    // Rodada 10 (J): só com a leitura completa ligada (HML) e só para ciclo
    // encerrado. Ciclo aberto ou flag desligada: a chamada de hoje.
    const closedCycle =
      await readClosedCycleCaptureTarget({
        admin,
        companyId: tokenPayload.company_id,
        cycleId: envelope.cycle_id,
      })

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
        ...(closedCycle
          ? { p_allow_closed_cycle: true }
          : {}),
      },
    )

    if (error) {
      const classification =
        classifyCaptureRpcError(error)

      // A RPC recusou o ciclo encerrado (defesa: banco sem a migração
      // 20261003090000): recusa silenciosa, sem aviso de falha no painel.
      if (
        closedCycle &&
        isClosedCycleCaptureUnavailable({
          error,
          classificationCode: classification.code,
        })
      ) {
        logCaptureRejection({
          source: 'rpc',
          code: CLOSED_CYCLE_CAPTURE_UNAVAILABLE,
          http_status: 409,
          pg_code:
            typeof error.code === 'string' ? error.code : null,
          cycle_id: envelope.cycle_id,
          batch_size: envelope.messages.length,
        })

        return NextResponse.json(
          {
            ok: false,
            status: CLOSED_CYCLE_CAPTURE_UNAVAILABLE,
            error:
              'A captura de ciclo encerrado não está disponível agora.',
            validation: {
              code: CLOSED_CYCLE_CAPTURE_UNAVAILABLE,
              message_index: null,
              message_key: null,
              message_keys: null,
            },
          },
          {
            status: 409,
            headers: corsHeaders,
          },
        )
      }

      const rejectedIndex =
        findRpcRejectedMessageIndex(
          classification.code,
          envelope.messages,
        )

      const messageKeysWithoutState =
        classification.code === 'BASE_VERSION_WITHOUT_CANONICAL_STATE'
          ? await findMessagesWithoutCanonicalState({
              admin,
              companyId: tokenPayload.company_id,
              conversationKey: envelope.conversation_key,
              messages: envelope.messages,
            })
          : []

      const rejectedMessageKey =
        rejectedIndex >= 0
          ? envelope.messages[rejectedIndex].message_key
          : null

      logCaptureRejection({
        source: 'rpc',
        code: classification.code,
        http_status: classification.status,
        pg_code:
          typeof error.code === 'string' ? error.code : null,
        validation: redactCaptureValidationText(error),
        cycle_id: envelope.cycle_id,
        batch_size: envelope.messages.length,
        message_index: rejectedIndex >= 0 ? rejectedIndex : null,
        message_ref: fingerprintKey(rejectedMessageKey),
        message_refs_without_state:
          messageKeysWithoutState.map(fingerprintKey),
      })

      return NextResponse.json(
        {
          ok: false,
          status: 'CAPTURE_INGESTION_REJECTED',
          error: error.message,
          validation: {
            code: classification.code,
            message_index:
              rejectedIndex >= 0 ? rejectedIndex : null,
            message_key: rejectedMessageKey,
            message_keys:
              messageKeysWithoutState.length > 0
                ? messageKeysWithoutState
                : null,
          },
        },
        {
          status: classification.status,
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

    // Rodada 10 (J): ciclo encerrado aceito; o cliente escreveu depois do
    // encerramento? Só então a extensão abre as abas (leitura de
    // atendimento).
    const closedCycleResult =
      closedCycle
        ? {
            status: closedCycle.status,
            service:
              await customerWroteAfterClosureInLedger({
                admin,
                companyId: tokenPayload.company_id,
                cycleId: envelope.cycle_id,
                conversationKey: envelope.conversation_key,
                closedAt: closedCycle.closed_at,
              }),
          }
        : null

    return NextResponse.json(
      {
        ok: true,
        status: 'CAPTURE_INGESTED',
        ...(closedCycleResult
          ? { closed_cycle: closedCycleResult }
          : {}),
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
      const messageIndex =
        readMessageIndexFromPath(error.path)

      const messageKey =
        readRawMessageKey(rawBody, messageIndex)

      logCaptureRejection({
        source: 'contract',
        code: error.code,
        http_status: 400,
        path: error.path.replace(/\d{5,}/g, '<n>'),
        cycle_id: cycleIdForLog,
        message_index: messageIndex,
        message_ref: fingerprintKey(messageKey),
      })

      return NextResponse.json(
        {
          ok: false,
          status: 'INVALID_CAPTURE_PAYLOAD',
          error: error.message,
          validation: {
            code: error.code,
            path: error.path,
            message_index: messageIndex,
            message_key: messageKey,
          },
        },
        {
          status: 400,
          headers: corsHeaders,
        },
      )
    }

    logCaptureRejection({
      source: 'route',
      code: 'CAPTURE_INGESTION_ERROR',
      http_status: 500,
      cycle_id: cycleIdForLog,
    })

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
