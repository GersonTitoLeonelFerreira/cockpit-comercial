export const COMPANION_ACTION_TYPES = [
  'suggestion_shown',
  'suggestion_copied',
  'suggestion_inserted',
  'suggestion_ignored',
  'suggestion_edited',
  'suggestion_sent',
  'crm_accepted',
  'crm_rejected',
  'agenda_accepted',
  'agenda_rejected',
] as const

export type CompanionActionType = (typeof COMPANION_ACTION_TYPES)[number]

const FORBIDDEN_METADATA_KEYS = [
  'conversation_text',
  'messages',
  'suggested_message',
  'text_content',
  'audio_transcription',
] as const

const FORBIDDEN_METADATA_KEY_SET = new Set<string>(FORBIDDEN_METADATA_KEYS)
const MAX_IDEMPOTENCY_KEY_LENGTH = 200
const MAX_CONVERSATION_KEY_LENGTH = 500

export type NormalizedRegisterActionEventBody = {
  cycle_id: string
  action_type: CompanionActionType
  idempotency_key: string
  coaching_note_id: string | null
  conversation_key: string | null
  metadata: Record<string, unknown>
}

type UnknownRecord = Record<string, unknown>

export class ActionEventContractError extends Error {
  readonly code: string
  readonly path: string

  constructor({
    code,
    path,
    message,
  }: {
    code: string
    path: string
    message: string
  }) {
    super(message)

    this.name = 'ActionEventContractError'
    this.code = code
    this.path = path
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fail({
  code,
  path,
  message,
}: {
  code: string
  path: string
  message: string
}): never {
  throw new ActionEventContractError({ code, path, message })
}

function isCompanionActionType(value: unknown): value is CompanionActionType {
  return (
    typeof value === 'string' &&
    (COMPANION_ACTION_TYPES as readonly string[]).includes(value)
  )
}

function normalizeUuid(value: unknown, path: string) {
  if (typeof value !== 'string') {
    fail({ code: 'INVALID_UUID', path, message: `${path} deve ser um UUID.` })
  }

  const normalized = value.trim()
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

  if (!uuidPattern.test(normalized)) {
    fail({
      code: 'INVALID_UUID',
      path,
      message: `${path} deve possuir um UUID válido.`,
    })
  }

  return normalized.toLowerCase()
}

function normalizeNullableUuid(value: unknown, path: string) {
  if (value === null || value === undefined) {
    return null
  }

  return normalizeUuid(value, path)
}

export function normalizeOptionalActionEventUuidParam(
  value: string | null,
  path: string,
) {
  if (value === null) {
    return null
  }

  return normalizeUuid(value, path)
}

function normalizeIdempotencyKey(value: unknown) {
  if (typeof value !== 'string') {
    fail({
      code: 'INVALID_IDEMPOTENCY_KEY',
      path: 'idempotency_key',
      message: 'idempotency_key deve ser um texto.',
    })
  }

  const normalized = value.trim()

  if (!normalized) {
    fail({
      code: 'EMPTY_IDEMPOTENCY_KEY',
      path: 'idempotency_key',
      message: 'idempotency_key não pode ficar vazio.',
    })
  }

  if (normalized.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    fail({
      code: 'IDEMPOTENCY_KEY_TOO_LONG',
      path: 'idempotency_key',
      message: `idempotency_key ultrapassa o limite de ${MAX_IDEMPOTENCY_KEY_LENGTH} caracteres.`,
    })
  }

  return normalized
}

function normalizeNullableConversationKey(value: unknown) {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value !== 'string') {
    fail({
      code: 'INVALID_CONVERSATION_KEY',
      path: 'conversation_key',
      message: 'conversation_key deve ser um texto ou null.',
    })
  }

  const normalized = value.trim()

  if (!normalized) {
    return null
  }

  if (normalized.length > MAX_CONVERSATION_KEY_LENGTH) {
    fail({
      code: 'CONVERSATION_KEY_TOO_LONG',
      path: 'conversation_key',
      message: `conversation_key ultrapassa o limite de ${MAX_CONVERSATION_KEY_LENGTH} caracteres.`,
    })
  }

  return normalized
}

function findForbiddenMetadataPath(value: unknown) {
  const stack: Array<{ value: unknown; path: string }> = [
    { value, path: 'metadata' },
  ]

  while (stack.length > 0) {
    const current = stack.pop()

    if (!current) {
      continue
    }

    if (Array.isArray(current.value)) {
      current.value.forEach((item, index) => {
        stack.push({ value: item, path: `${current.path}[${index}]` })
      })
      continue
    }

    if (!isRecord(current.value)) {
      continue
    }

    for (const [key, nestedValue] of Object.entries(current.value)) {
      const nestedPath = `${current.path}.${key}`

      if (FORBIDDEN_METADATA_KEY_SET.has(key)) {
        return nestedPath
      }

      stack.push({ value: nestedValue, path: nestedPath })
    }
  }

  return null
}

function normalizeMetadata(value: unknown) {
  if (value === null || value === undefined) {
    return {}
  }

  if (!isRecord(value)) {
    fail({
      code: 'INVALID_METADATA',
      path: 'metadata',
      message: 'metadata precisa ser um objeto JSON.',
    })
  }

  const forbiddenPath = findForbiddenMetadataPath(value)

  if (forbiddenPath) {
    fail({
      code: 'METADATA_CONTAINS_CONVERSATION_CONTENT',
      path: forbiddenPath,
      message: 'metadata não pode armazenar conteúdo da conversa.',
    })
  }

  return value
}

export function normalizeRegisterActionEventBody(
  raw: unknown,
): NormalizedRegisterActionEventBody {
  if (!isRecord(raw)) {
    fail({
      code: 'INVALID_BODY',
      path: 'body',
      message: 'O corpo da requisição precisa ser um objeto JSON.',
    })
  }

  const cycleId = normalizeUuid(raw.cycle_id, 'cycle_id')

  if (!isCompanionActionType(raw.action_type)) {
    fail({
      code: 'INVALID_ACTION_TYPE',
      path: 'action_type',
      message: `action_type deve ser um dos valores suportados: ${COMPANION_ACTION_TYPES.join(', ')}.`,
    })
  }

  const idempotencyKey = normalizeIdempotencyKey(raw.idempotency_key)
  const coachingNoteId = normalizeNullableUuid(raw.coaching_note_id, 'coaching_note_id')
  const conversationKey = normalizeNullableConversationKey(raw.conversation_key)
  const metadata = normalizeMetadata(raw.metadata)

  return {
    cycle_id: cycleId,
    action_type: raw.action_type,
    idempotency_key: idempotencyKey,
    coaching_note_id: coachingNoteId,
    conversation_key: conversationKey,
    metadata,
  }
}

export function getActionEventRpcErrorHttpStatus(error: unknown) {
  const message =
    isRecord(error) && typeof error.message === 'string'
      ? error.message
      : typeof error === 'string'
        ? error
        : ''

  const normalized = message.trim().toLowerCase()

  if (normalized.includes('ciclo comercial não encontrado')) {
    return 404
  }

  if (
    normalized.includes('não pertence a esta empresa ou ciclo') ||
    normalized.includes('evento diferente')
  ) {
    return 409
  }

  if (
    normalized.includes('é obrigatório') ||
    normalized.includes('inválido') ||
    normalized.includes('ultrapassa') ||
    normalized.includes('não pode armazenar') ||
    normalized.includes('precisa ser um objeto')
  ) {
    return 400
  }

  return 500
}
