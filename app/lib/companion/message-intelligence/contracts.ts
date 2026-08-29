import type {
  CommercialReading,
} from '../commercial-reading-contract'

import type {
  StatefulCopilotRealContext,
} from '../stateful-copilot-real-context-loader'

export const MESSAGE_INTELLIGENCE_REQUEST_CONTRACT_VERSION =
  'message-intelligence-request-v1' as const

export type MessageIntelligenceRequestV1 = {
  contract_version:
    typeof MESSAGE_INTELLIGENCE_REQUEST_CONTRACT_VERSION

  request_id: string
  company_id: string
  seller_user_id: string
  cycle_id: string
  conversation_key: string
  seller_intent: string
  reference_time: string
}

export type MessageIntelligenceCommercialReadingSourceV1 = {
  company_id: string
  cycle_id: string
  conversation_key: string

  reading: CommercialReading

  source_id:
    string | null

  observed_at:
    string | null
}

export type MessageIntelligenceContextSourcesV1 = {
  real_context:
    StatefulCopilotRealContext

  commercial_reading:
    MessageIntelligenceCommercialReadingSourceV1 | null
}

export type MessageIntelligenceContextSourceLoaderV1 =
  (
    request:
      MessageIntelligenceRequestV1,
  ) => Promise<MessageIntelligenceContextSourcesV1>

export class MessageIntelligenceRequestContractError
  extends Error {
  readonly code: string
  readonly path: string

  constructor(
    code: string,
    path: string,
    message: string,
  ) {
    super(message)

    this.name =
      'MessageIntelligenceRequestContractError'

    this.code =
      code

    this.path =
      path
  }
}

function fail(
  code: string,
  path: string,
  message: string,
): never {
  throw new MessageIntelligenceRequestContractError(
    code,
    path,
    message,
  )
}

function requireCanonicalText(
  value: unknown,
  path: string,
  maximumLength: number,
): string {
  if (typeof value !== 'string') {
    fail(
      'INVALID_MESSAGE_INTELLIGENCE_REQUEST',
      path,
      `${path} precisa ser um texto.`,
    )
  }

  const normalized =
    value.trim()

  if (
    !normalized ||
    normalized !== value ||
    normalized.length > maximumLength
  ) {
    fail(
      'INVALID_MESSAGE_INTELLIGENCE_REQUEST',
      path,
      `${path} possui um valor inválido.`,
    )
  }

  return normalized
}

function requireUuid(
  value: unknown,
  path: string,
): string {
  const normalized =
    requireCanonicalText(
      value,
      path,
      100,
    ).toLowerCase()

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      .test(normalized)
  ) {
    fail(
      'INVALID_MESSAGE_INTELLIGENCE_REQUEST_UUID',
      path,
      `${path} precisa ser um UUID válido.`,
    )
  }

  return normalized
}

function requireDate(
  value: unknown,
  path: string,
): string {
  const raw =
    requireCanonicalText(
      value,
      path,
      100,
    )

  const timestamp =
    Date.parse(raw)

  if (!Number.isFinite(timestamp)) {
    fail(
      'INVALID_MESSAGE_INTELLIGENCE_REQUEST_DATE',
      path,
      `${path} precisa ser uma data válida.`,
    )
  }

  return new Date(
    timestamp,
  ).toISOString()
}

export function normalizeMessageIntelligenceRequestV1(
  value: unknown,
): MessageIntelligenceRequestV1 {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    fail(
      'INVALID_MESSAGE_INTELLIGENCE_REQUEST',
      'request',
      'request precisa ser um objeto.',
    )
  }

  const record =
    value as Record<string, unknown>

  if (
    record.contract_version !==
    MESSAGE_INTELLIGENCE_REQUEST_CONTRACT_VERSION
  ) {
    fail(
      'UNSUPPORTED_MESSAGE_INTELLIGENCE_REQUEST_VERSION',
      'request.contract_version',
      'A versão do contrato de request não é suportada.',
    )
  }

  return {
    contract_version:
      MESSAGE_INTELLIGENCE_REQUEST_CONTRACT_VERSION,

    request_id:
      requireCanonicalText(
        record.request_id,
        'request.request_id',
        200,
      ),

    company_id:
      requireUuid(
        record.company_id,
        'request.company_id',
      ),

    seller_user_id:
      requireUuid(
        record.seller_user_id,
        'request.seller_user_id',
      ),

    cycle_id:
      requireUuid(
        record.cycle_id,
        'request.cycle_id',
      ),

    conversation_key:
      requireCanonicalText(
        record.conversation_key,
        'request.conversation_key',
        500,
      ),

    seller_intent:
      requireCanonicalText(
        record.seller_intent,
        'request.seller_intent',
        4000,
      ),

    reference_time:
      requireDate(
        record.reference_time,
        'request.reference_time',
      ),
  }
}
