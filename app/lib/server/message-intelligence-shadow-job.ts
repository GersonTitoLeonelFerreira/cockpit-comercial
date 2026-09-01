import 'server-only'

// ============================================================================
// Message Intelligence Engine V1 — Shadow Validation
// Job contract: message-intelligence-shadow-job-v1
//
// Este job NUNCA carrega device_key (MIE é device-independent). Ele
// carrega apenas os identificadores canônicos necessários para o worker
// rodar o pipeline completo do MIE server-side e comparar com o
// resultado do gerador atual (legacy), sem nunca expor nada disso ao
// vendedor.
// ============================================================================

export const MESSAGE_INTELLIGENCE_SHADOW_JOB_VERSION =
  'message-intelligence-shadow-job-v1' as const

export const MESSAGE_INTELLIGENCE_SHADOW_QUEUE_TOPIC =
  'message-intelligence-shadow-v1' as const

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const MESSAGE_INTELLIGENCE_LEGACY_GENERATION_STATUSES = [
  'ready',
  'error',
] as const

export type MessageIntelligenceLegacyGenerationStatus =
  (typeof MESSAGE_INTELLIGENCE_LEGACY_GENERATION_STATUSES)[number]

/**
 * Payload da mensagem publicada no topic da fila.
 *
 * shadow_run_id dobra como request_id do MessageIntelligenceRequestV1
 * (contrato da Frente 1) — precisa ser sempre um UUID válido.
 */
export type MessageIntelligenceShadowJobV1 = {
  job_version:
    typeof MESSAGE_INTELLIGENCE_SHADOW_JOB_VERSION

  shadow_run_id: string

  company_id: string
  seller_user_id: string
  cycle_id: string
  conversation_key: string
  seller_intent: string
  reference_time: string

  legacy_generation_status:
    MessageIntelligenceLegacyGenerationStatus
  legacy_message: string | null

  enqueued_at: string
}

export class MessageIntelligenceShadowJobError
  extends Error {
  readonly code: string

  constructor(
    code: string,
    message: string,
  ) {
    super(message)

    this.name =
      'MessageIntelligenceShadowJobError'

    this.code =
      code
  }
}

function fail(
  code: string,
  message: string,
): never {
  throw new MessageIntelligenceShadowJobError(
    code,
    message,
  )
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value)
  )
}

function requireUuid(
  value: unknown,
  path: string,
): string {
  if (
    typeof value !== 'string' ||
    !UUID_PATTERN.test(value)
  ) {
    fail(
      'MESSAGE_INTELLIGENCE_SHADOW_JOB_INVALID_UUID',
      `${path} precisa ser um UUID válido.`,
    )
  }

  return value.toLowerCase()
}

function requireText(
  value: unknown,
  path: string,
  maximumLength: number,
): string {
  if (typeof value !== 'string') {
    fail(
      'MESSAGE_INTELLIGENCE_SHADOW_JOB_INVALID_FIELD',
      `${path} precisa ser texto.`,
    )
  }

  const normalized =
    value.trim()

  if (
    !normalized ||
    normalized.length > maximumLength
  ) {
    fail(
      'MESSAGE_INTELLIGENCE_SHADOW_JOB_INVALID_FIELD',
      `${path} possui um valor inválido.`,
    )
  }

  return normalized
}

function requireDate(
  value: unknown,
  path: string,
): string {
  const raw =
    requireText(value, path, 100)

  const timestamp =
    Date.parse(raw)

  if (!Number.isFinite(timestamp)) {
    fail(
      'MESSAGE_INTELLIGENCE_SHADOW_JOB_INVALID_FIELD',
      `${path} precisa ser uma data válida.`,
    )
  }

  return new Date(timestamp).toISOString()
}

function requireLegacyGenerationStatus(
  value: unknown,
  path: string,
): MessageIntelligenceLegacyGenerationStatus {
  if (
    typeof value !== 'string' ||
    !MESSAGE_INTELLIGENCE_LEGACY_GENERATION_STATUSES
      .includes(
        value as MessageIntelligenceLegacyGenerationStatus,
      )
  ) {
    fail(
      'MESSAGE_INTELLIGENCE_SHADOW_JOB_INVALID_FIELD',
      `${path} precisa ser ready ou error.`,
    )
  }

  return value as MessageIntelligenceLegacyGenerationStatus
}

function requireNullableMessage(
  value: unknown,
  path: string,
): string | null {
  if (value === null) {
    return null
  }

  return requireText(value, path, 4000)
}

/**
 * Constrói o payload do job a partir de identificadores já validados
 * pelo request seller-facing (identity resolvida via
 * resolveCompanionLeadIdentity + token). Nunca inclui device_key.
 */
export function buildMessageIntelligenceShadowJobV1({
  shadow_run_id,
  company_id,
  seller_user_id,
  cycle_id,
  conversation_key,
  seller_intent,
  reference_time,
  legacy_generation_status,
  legacy_message,
  enqueued_at,
}: {
  shadow_run_id: unknown
  company_id: unknown
  seller_user_id: unknown
  cycle_id: unknown
  conversation_key: unknown
  seller_intent: unknown
  reference_time: unknown
  legacy_generation_status: unknown
  legacy_message: unknown
  enqueued_at: unknown
}): MessageIntelligenceShadowJobV1 {
  return Object.freeze({
    job_version:
      MESSAGE_INTELLIGENCE_SHADOW_JOB_VERSION,

    shadow_run_id:
      requireUuid(shadow_run_id, 'shadow_run_id'),

    company_id:
      requireUuid(company_id, 'company_id'),

    seller_user_id:
      requireUuid(seller_user_id, 'seller_user_id'),

    cycle_id:
      requireUuid(cycle_id, 'cycle_id'),

    conversation_key:
      requireText(conversation_key, 'conversation_key', 500),

    seller_intent:
      requireText(seller_intent, 'seller_intent', 4000),

    reference_time:
      requireDate(reference_time, 'reference_time'),

    legacy_generation_status:
      requireLegacyGenerationStatus(
        legacy_generation_status,
        'legacy_generation_status',
      ),

    legacy_message:
      requireNullableMessage(
        legacy_message,
        'legacy_message',
      ),

    enqueued_at:
      requireDate(enqueued_at, 'enqueued_at'),
  })
}

export function parseMessageIntelligenceShadowJobV1(
  value: unknown,
): MessageIntelligenceShadowJobV1 {
  if (!isRecord(value)) {
    fail(
      'MESSAGE_INTELLIGENCE_SHADOW_JOB_INVALID_MESSAGE',
      'Mensagem do job de shadow validation inválida.',
    )
  }

  if (
    value.job_version !==
    MESSAGE_INTELLIGENCE_SHADOW_JOB_VERSION
  ) {
    fail(
      'MESSAGE_INTELLIGENCE_SHADOW_JOB_VERSION_MISMATCH',
      'Versão do job de shadow validation incompatível.',
    )
  }

  return buildMessageIntelligenceShadowJobV1({
    shadow_run_id: value.shadow_run_id,
    company_id: value.company_id,
    seller_user_id: value.seller_user_id,
    cycle_id: value.cycle_id,
    conversation_key: value.conversation_key,
    seller_intent: value.seller_intent,
    reference_time: value.reference_time,
    legacy_generation_status:
      value.legacy_generation_status,
    legacy_message: value.legacy_message,
    enqueued_at: value.enqueued_at,
  })
}
