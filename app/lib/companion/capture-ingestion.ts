export const CAPTURE_INGESTION_CONTRACT_VERSION = 'pt4-c-v1' as const

export const MAX_CAPTURE_BATCH_SIZE = 200
export const MAX_CONVERSATION_KEY_LENGTH = 500
export const MAX_MESSAGE_KEY_LENGTH = 500
export const MAX_CAPTURE_TEXT_LENGTH = 100_000
export const MAX_AUDIO_TRANSCRIPTION_LENGTH = 200_000

export type CaptureDirection = 'incoming' | 'outgoing'
export type CaptureContentType = 'text' | 'audio'

export type NormalizedCaptureMessage = {
  message_key: string
  direction: CaptureDirection
  occurred_at: string
  content_type: CaptureContentType
  text_content: string | null
  audio_transcription: string | null
  is_deleted: boolean
}

export type NormalizedCaptureIngestionEnvelope = {
  contract_version: typeof CAPTURE_INGESTION_CONTRACT_VERSION
  cycle_id: string
  conversation_key: string
  device_key: string
  messages: NormalizedCaptureMessage[]
}

type UnknownRecord = Record<string, unknown>

export class CaptureContractError extends Error {
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

    this.name = 'CaptureContractError'
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
  throw new CaptureContractError({
    code,
    path,
    message,
  })
}

function normalizeRequiredText({
  value,
  path,
  maxLength,
}: {
  value: unknown
  path: string
  maxLength: number
}) {
  if (typeof value !== 'string') {
    fail({
      code: 'INVALID_TEXT',
      path,
      message: `${path} deve ser um texto.`,
    })
  }

  const normalized = value.trim()

  if (!normalized) {
    fail({
      code: 'EMPTY_TEXT',
      path,
      message: `${path} não pode ficar vazio.`,
    })
  }

  if (normalized.length > maxLength) {
    fail({
      code: 'TEXT_TOO_LONG',
      path,
      message: `${path} ultrapassa o limite de ${maxLength} caracteres.`,
    })
  }

  return normalized
}

function normalizeNullableText({
  value,
  path,
  maxLength,
}: {
  value: unknown
  path: string
  maxLength: number
}) {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value !== 'string') {
    fail({
      code: 'INVALID_TEXT',
      path,
      message: `${path} deve ser um texto ou null.`,
    })
  }

  const normalized = value.trim()

  if (!normalized) {
    return null
  }

  if (normalized.length > maxLength) {
    fail({
      code: 'TEXT_TOO_LONG',
      path,
      message: `${path} ultrapassa o limite de ${maxLength} caracteres.`,
    })
  }

  return normalized
}

function normalizeUuid(value: unknown, path: string) {
  const normalized = normalizeRequiredText({
    value,
    path,
    maxLength: 100,
  })

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

function normalizeDirection(
  value: unknown,
  path: string,
): CaptureDirection {
  if (value !== 'incoming' && value !== 'outgoing') {
    fail({
      code: 'INVALID_DIRECTION',
      path,
      message: `${path} deve ser incoming ou outgoing.`,
    })
  }

  return value
}

function normalizeContentType(
  value: unknown,
  path: string,
): CaptureContentType {
  if (value !== 'text' && value !== 'audio') {
    fail({
      code: 'INVALID_CONTENT_TYPE',
      path,
      message: `${path} deve ser text ou audio.`,
    })
  }

  return value
}

function normalizeBoolean(value: unknown, path: string) {
  if (typeof value !== 'boolean') {
    fail({
      code: 'INVALID_BOOLEAN',
      path,
      message: `${path} deve ser true ou false.`,
    })
  }

  return value
}

function normalizeOccurredAt(value: unknown, path: string) {
  if (typeof value !== 'string') {
    fail({
      code: 'INVALID_OCCURRED_AT',
      path,
      message: `${path} deve ser uma data em texto.`,
    })
  }

  const timestamp = Date.parse(value)

  if (!Number.isFinite(timestamp)) {
    fail({
      code: 'INVALID_OCCURRED_AT',
      path,
      message: `${path} contém uma data inválida.`,
    })
  }

  return new Date(timestamp).toISOString()
}

function normalizeCaptureMessage(
  value: unknown,
  index: number,
): NormalizedCaptureMessage {
  const path = `messages[${index}]`

  if (!isRecord(value)) {
    fail({
      code: 'INVALID_MESSAGE',
      path,
      message: `${path} deve ser um objeto.`,
    })
  }

  const messageKey = normalizeRequiredText({
    value: value.message_key,
    path: `${path}.message_key`,
    maxLength: MAX_MESSAGE_KEY_LENGTH,
  })

  const direction = normalizeDirection(
    value.direction,
    `${path}.direction`,
  )

  const occurredAt = normalizeOccurredAt(
    value.occurred_at,
    `${path}.occurred_at`,
  )

  const contentType = normalizeContentType(
    value.content_type,
    `${path}.content_type`,
  )

  const isDeleted = normalizeBoolean(
    value.is_deleted,
    `${path}.is_deleted`,
  )

  const textContent = normalizeNullableText({
    value: value.text_content,
    path: `${path}.text_content`,
    maxLength: MAX_CAPTURE_TEXT_LENGTH,
  })

  const audioTranscription = normalizeNullableText({
    value: value.audio_transcription,
    path: `${path}.audio_transcription`,
    maxLength: MAX_AUDIO_TRANSCRIPTION_LENGTH,
  })

  if (isDeleted) {
    return {
      message_key: messageKey,
      direction,
      occurred_at: occurredAt,
      content_type: contentType,
      text_content: null,
      audio_transcription: null,
      is_deleted: true,
    }
  }

  if (contentType === 'text' && !textContent) {
    fail({
      code: 'TEXT_CONTENT_REQUIRED',
      path: `${path}.text_content`,
      message: 'Mensagem de texto ativa precisa possuir conteúdo.',
    })
  }

  if (contentType === 'text' && audioTranscription) {
    fail({
      code: 'TEXT_MESSAGE_WITH_AUDIO_TRANSCRIPTION',
      path: `${path}.audio_transcription`,
      message: 'Mensagem de texto não pode possuir transcrição de áudio.',
    })
  }

  return {
    message_key: messageKey,
    direction,
    occurred_at: occurredAt,
    content_type: contentType,
    text_content: textContent,
    audio_transcription: audioTranscription,
    is_deleted: false,
  }
}

export function normalizeCaptureIngestionEnvelope(
  value: unknown,
): NormalizedCaptureIngestionEnvelope {
  if (!isRecord(value)) {
    fail({
      code: 'INVALID_ENVELOPE',
      path: 'body',
      message: 'O corpo da ingestão deve ser um objeto.',
    })
  }

  if (value.contract_version !== CAPTURE_INGESTION_CONTRACT_VERSION) {
    fail({
      code: 'UNSUPPORTED_CONTRACT_VERSION',
      path: 'contract_version',
      message: `contract_version deve ser ${CAPTURE_INGESTION_CONTRACT_VERSION}.`,
    })
  }

  const cycleId = normalizeUuid(value.cycle_id, 'cycle_id')

  const conversationKey = normalizeRequiredText({
    value: value.conversation_key,
    path: 'conversation_key',
    maxLength: MAX_CONVERSATION_KEY_LENGTH,
  })

  const deviceKey = normalizeUuid(value.device_key, 'device_key')

  if (!Array.isArray(value.messages)) {
    fail({
      code: 'INVALID_MESSAGES',
      path: 'messages',
      message: 'messages deve ser uma lista.',
    })
  }

  if (value.messages.length === 0) {
    fail({
      code: 'EMPTY_MESSAGES',
      path: 'messages',
      message: 'O lote precisa possuir pelo menos uma mensagem.',
    })
  }

  if (value.messages.length > MAX_CAPTURE_BATCH_SIZE) {
    fail({
      code: 'CAPTURE_BATCH_TOO_LARGE',
      path: 'messages',
      message: `O lote pode possuir no máximo ${MAX_CAPTURE_BATCH_SIZE} mensagens.`,
    })
  }

  const messages = value.messages.map((message, index) => {
    return normalizeCaptureMessage(message, index)
  })

  const observedMessageKeys = new Set<string>()

  messages.forEach((message, index) => {
    if (observedMessageKeys.has(message.message_key)) {
      fail({
        code: 'DUPLICATE_MESSAGE_KEY',
        path: `messages[${index}].message_key`,
        message: `A chave ${message.message_key} apareceu mais de uma vez no mesmo lote.`,
      })
    }

    observedMessageKeys.add(message.message_key)
  })

  return {
    contract_version: CAPTURE_INGESTION_CONTRACT_VERSION,
    cycle_id: cycleId,
    conversation_key: conversationKey,
    device_key: deviceKey,
    messages,
  }
}

export function buildCaptureMessageStateKey(
  message: NormalizedCaptureMessage,
) {
  return JSON.stringify([
    message.message_key,
    message.direction,
    message.occurred_at,
    message.content_type,
    message.text_content,
    message.audio_transcription,
    message.is_deleted,
  ])
}
