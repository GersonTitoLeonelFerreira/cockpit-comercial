;(function initYolenUniversalPlatformContract(root) {
  'use strict'

  const CONTRACT_VERSION = 'yolen-universal-conversation-v1'
  const MAX_PLATFORM_ID_LENGTH = 64
  const MAX_CHANNEL_ID_LENGTH = 64
  const MAX_CONVERSATION_KEY_LENGTH = 500
  const MAX_EXTERNAL_ID_LENGTH = 500
  const MAX_MESSAGE_KEY_LENGTH = 500
  const MAX_TEXT_CONTENT_LENGTH = 100000
  const MAX_AUDIO_TRANSCRIPTION_LENGTH = 200000

  const PLATFORM_ADAPTER_METHODS = Object.freeze([
    'getPlatform',
    'getCurrentConversation',
    'collectVisibleMessages',
    'getContact',
    'getAssignment',
    'observeChanges',
    'getComposer',
  ])

  function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  }

  function fail(code, path, message) {
    const error = new Error(message)
    error.name = 'YolenUniversalContractError'
    error.code = code
    error.path = path
    throw error
  }

  function normalizeRequiredText(value, path, maxLength) {
    if (typeof value !== 'string') {
      fail('INVALID_TEXT', path, `${path} deve ser um texto.`)
    }

    const normalized = value.trim()

    if (!normalized) {
      fail('EMPTY_TEXT', path, `${path} não pode ficar vazio.`)
    }

    if (normalized.length > maxLength) {
      fail('TEXT_TOO_LONG', path, `${path} ultrapassa ${maxLength} caracteres.`)
    }

    return normalized
  }

  function normalizeNullableText(value, path, maxLength) {
    if (value === null || value === undefined) {
      return null
    }

    if (typeof value !== 'string') {
      fail('INVALID_TEXT', path, `${path} deve ser um texto ou null.`)
    }

    const normalized = value.trim()

    if (!normalized) {
      return null
    }

    if (normalized.length > maxLength) {
      fail('TEXT_TOO_LONG', path, `${path} ultrapassa ${maxLength} caracteres.`)
    }

    return normalized
  }

  function normalizeNamespaceId(value, path, maxLength) {
    const normalized = normalizeRequiredText(value, path, maxLength).toLowerCase()

    if (!/^[a-z0-9][a-z0-9_-]*$/.test(normalized)) {
      fail(
        'INVALID_NAMESPACE_ID',
        path,
        `${path} deve usar apenas letras minúsculas, números, _ ou - e começar por letra/número.`,
      )
    }

    return normalized
  }

  function normalizeDateTime(value, path) {
    const normalized = normalizeRequiredText(value, path, 100)
    const timestamp = Date.parse(normalized)

    if (!Number.isFinite(timestamp)) {
      fail('INVALID_DATETIME', path, `${path} contém uma data inválida.`)
    }

    return new Date(timestamp).toISOString()
  }

  function normalizeBoolean(value, path) {
    if (typeof value !== 'boolean') {
      fail('INVALID_BOOLEAN', path, `${path} deve ser booleano.`)
    }

    return value
  }

  function buildNamespacedConversationKey({ platform, channel, externalIdentity }) {
    const normalizedPlatform = normalizeNamespaceId(
      platform,
      'platform',
      MAX_PLATFORM_ID_LENGTH,
    )
    const normalizedChannel = normalizeNamespaceId(
      channel,
      'channel',
      MAX_CHANNEL_ID_LENGTH,
    )
    const normalizedExternalIdentity = normalizeRequiredText(
      externalIdentity,
      'externalIdentity',
      MAX_EXTERNAL_ID_LENGTH,
    )

    const key = `${normalizedPlatform}:${normalizedChannel}:${encodeURIComponent(normalizedExternalIdentity)}`

    if (key.length > MAX_CONVERSATION_KEY_LENGTH) {
      fail(
        'CONVERSATION_KEY_TOO_LONG',
        'conversation_key',
        `conversation_key ultrapassa ${MAX_CONVERSATION_KEY_LENGTH} caracteres.`,
      )
    }

    return key
  }

  function normalizeContact(value) {
    if (!isRecord(value)) {
      fail('INVALID_CONTACT', 'contact', 'contact deve ser um objeto.')
    }

    return {
      name: normalizeNullableText(value.name, 'contact.name', 300),
      phone: normalizeNullableText(value.phone, 'contact.phone', 100),
      external_contact_id: normalizeNullableText(
        value.external_contact_id,
        'contact.external_contact_id',
        MAX_EXTERNAL_ID_LENGTH,
      ),
    }
  }

  function normalizeAssignment(value) {
    if (!isRecord(value)) {
      fail('INVALID_ASSIGNMENT', 'assignment', 'assignment deve ser um objeto.')
    }

    const assigned = normalizeBoolean(value.assigned, 'assignment.assigned')

    return {
      assigned,
      agent_id: assigned
        ? normalizeNullableText(value.agent_id, 'assignment.agent_id', 300)
        : null,
      agent_name: assigned
        ? normalizeNullableText(value.agent_name, 'assignment.agent_name', 300)
        : null,
    }
  }

  function normalizeMessage(value, index) {
    const path = `messages[${index}]`

    if (!isRecord(value)) {
      fail('INVALID_MESSAGE', path, `${path} deve ser um objeto.`)
    }

    const messageKey = normalizeRequiredText(
      value.message_key,
      `${path}.message_key`,
      MAX_MESSAGE_KEY_LENGTH,
    )

    const direction = value.direction
    if (direction !== 'incoming' && direction !== 'outgoing') {
      fail(
        'INVALID_DIRECTION',
        `${path}.direction`,
        `${path}.direction deve ser incoming ou outgoing.`,
      )
    }

    const contentType = value.content_type
    if (contentType !== 'text' && contentType !== 'audio') {
      fail(
        'INVALID_CONTENT_TYPE',
        `${path}.content_type`,
        `${path}.content_type deve ser text ou audio nesta versão do contrato.`,
      )
    }

    const isDeleted = normalizeBoolean(value.is_deleted, `${path}.is_deleted`)
    const textContent = normalizeNullableText(
      value.text_content,
      `${path}.text_content`,
      MAX_TEXT_CONTENT_LENGTH,
    )
    const audioTranscription = normalizeNullableText(
      value.audio_transcription,
      `${path}.audio_transcription`,
      MAX_AUDIO_TRANSCRIPTION_LENGTH,
    )

    let deletionReason = null

    if (isDeleted) {
      if (value.deletion_reason !== 'explicit_deletion') {
        fail(
          'INVALID_DELETION_REASON',
          `${path}.deletion_reason`,
          `${path}.deletion_reason deve ser explicit_deletion quando a exclusão for confirmada.`,
        )
      }
      deletionReason = 'explicit_deletion'
    } else if (value.deletion_reason !== null && value.deletion_reason !== undefined) {
      fail(
        'UNEXPECTED_DELETION_REASON',
        `${path}.deletion_reason`,
        `${path}.deletion_reason deve ser null em mensagem ativa.`,
      )
    }

    if (!isDeleted && contentType === 'text' && !textContent) {
      fail(
        'TEXT_CONTENT_REQUIRED',
        `${path}.text_content`,
        'Mensagem de texto ativa precisa possuir conteúdo.',
      )
    }

    if (!isDeleted && contentType === 'text' && audioTranscription) {
      fail(
        'TEXT_WITH_AUDIO_TRANSCRIPTION',
        `${path}.audio_transcription`,
        'Mensagem de texto não pode possuir transcrição de áudio.',
      )
    }

    return {
      message_key: messageKey,
      direction,
      occurred_at: normalizeDateTime(value.occurred_at, `${path}.occurred_at`),
      content_type: contentType,
      text_content: isDeleted ? null : textContent,
      audio_transcription: isDeleted ? null : audioTranscription,
      is_deleted: isDeleted,
      deletion_reason: deletionReason,
    }
  }

  function normalizeUniversalConversation(value) {
    if (!isRecord(value)) {
      fail('INVALID_CONVERSATION', 'conversation', 'conversation deve ser um objeto.')
    }

    if (value.contract_version !== CONTRACT_VERSION) {
      fail(
        'UNSUPPORTED_CONTRACT_VERSION',
        'contract_version',
        `contract_version deve ser ${CONTRACT_VERSION}.`,
      )
    }

    const platform = normalizeNamespaceId(
      value.platform,
      'platform',
      MAX_PLATFORM_ID_LENGTH,
    )
    const channel = normalizeNamespaceId(
      value.channel,
      'channel',
      MAX_CHANNEL_ID_LENGTH,
    )
    const conversationKey = normalizeRequiredText(
      value.conversation_key,
      'conversation_key',
      MAX_CONVERSATION_KEY_LENGTH,
    )

    if (!conversationKey.startsWith(`${platform}:`)) {
      fail(
        'CONVERSATION_KEY_NAMESPACE_MISMATCH',
        'conversation_key',
        `conversation_key deve começar com ${platform}: para impedir colisões entre plataformas.`,
      )
    }

    if (!Array.isArray(value.messages)) {
      fail('INVALID_MESSAGES', 'messages', 'messages deve ser uma lista.')
    }

    const messages = value.messages.map(normalizeMessage)
    const seenMessageKeys = new Set()

    for (const message of messages) {
      if (seenMessageKeys.has(message.message_key)) {
        fail(
          'DUPLICATE_MESSAGE_KEY',
          'messages',
          `message_key duplicada no snapshot: ${message.message_key}.`,
        )
      }
      seenMessageKeys.add(message.message_key)
    }

    return {
      contract_version: CONTRACT_VERSION,
      platform,
      channel,
      external_conversation_id: normalizeNullableText(
        value.external_conversation_id,
        'external_conversation_id',
        MAX_EXTERNAL_ID_LENGTH,
      ),
      conversation_key: conversationKey,
      contact: normalizeContact(value.contact),
      assignment: normalizeAssignment(value.assignment),
      observed_at: normalizeDateTime(value.observed_at, 'observed_at'),
      messages,
    }
  }

  function assertPlatformAdapter(adapter) {
    if (!isRecord(adapter)) {
      fail('INVALID_ADAPTER', 'adapter', 'adapter deve ser um objeto.')
    }

    for (const method of PLATFORM_ADAPTER_METHODS) {
      if (typeof adapter[method] !== 'function') {
        fail(
          'ADAPTER_METHOD_REQUIRED',
          `adapter.${method}`,
          `adapter.${method} deve ser uma função.`,
        )
      }
    }

    return adapter
  }

  const api = Object.freeze({
    CONTRACT_VERSION,
    PLATFORM_ADAPTER_METHODS,
    buildNamespacedConversationKey,
    normalizeUniversalConversation,
    assertPlatformAdapter,
  })

  root.YolenUniversalPlatformContract = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
