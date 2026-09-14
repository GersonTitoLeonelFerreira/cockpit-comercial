;(function initYolenManyChatDomReader(root) {
  'use strict'

  const PLATFORM = 'manychat'
  const UNKNOWN = 'unknown'

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  }

  function fail(code, message) {
    const error = new Error(message)
    error.name = 'YolenManyChatDomReaderError'
    error.code = code
    throw error
  }

  function normalizeSelector(value, path, required = false) {
    if (value === null || value === undefined || value === '') {
      if (required) fail('SELECTOR_REQUIRED', `${path} é obrigatório.`)
      return null
    }

    if (typeof value !== 'string' || !value.trim()) {
      fail('INVALID_SELECTOR', `${path} deve ser um seletor CSS não vazio.`)
    }

    return value.trim()
  }

  function normalizeProfile(value) {
    if (!isObject(value)) {
      fail('PROFILE_REQUIRED', 'profile é obrigatório para criar o ManyChat DOM reader.')
    }

    const selectors = isObject(value.selectors) ? value.selectors : {}

    const profile = {
      selectors: Object.freeze({
        conversationRoot: normalizeSelector(
          selectors.conversationRoot,
          'profile.selectors.conversationRoot',
          true,
        ),
        channel: normalizeSelector(selectors.channel, 'profile.selectors.channel'),
        contact: normalizeSelector(selectors.contact, 'profile.selectors.contact'),
        assignment: normalizeSelector(
          selectors.assignment,
          'profile.selectors.assignment',
        ),
        messages: normalizeSelector(
          selectors.messages,
          'profile.selectors.messages',
          true,
        ),
        composer: normalizeSelector(selectors.composer, 'profile.selectors.composer'),
      }),
      readChannel:
        typeof value.readChannel === 'function' ? value.readChannel : null,
      readContact:
        typeof value.readContact === 'function' ? value.readContact : null,
      readAssignment:
        typeof value.readAssignment === 'function' ? value.readAssignment : null,
      readMessage:
        typeof value.readMessage === 'function' ? value.readMessage : null,
      readComposer:
        typeof value.readComposer === 'function' ? value.readComposer : null,
    }

    if (!profile.readMessage) {
      fail('MESSAGE_READER_REQUIRED', 'profile.readMessage é obrigatório.')
    }

    return Object.freeze(profile)
  }

  function queryOne(scope, selector) {
    if (!scope || !selector || typeof scope.querySelector !== 'function') return null
    try {
      return scope.querySelector(selector)
    } catch {
      return null
    }
  }

  function queryAll(scope, selector) {
    if (!scope || !selector || typeof scope.querySelectorAll !== 'function') return []
    try {
      return Array.from(scope.querySelectorAll(selector))
    } catch {
      return []
    }
  }

  function normalizeChannel(value) {
    return typeof value === 'string' && value.trim()
      ? value.trim().toLowerCase()
      : UNKNOWN
  }

  function normalizeContact(value, surface) {
    const base = {
      name: null,
      phone: null,
      external_contact_id: surface?.external_contact_id ?? null,
    }

    if (!isObject(value)) return Object.freeze(base)

    return Object.freeze({
      name: value.name ?? null,
      phone: value.phone ?? null,
      external_contact_id:
        value.external_contact_id ?? surface?.external_contact_id ?? null,
    })
  }

  function unknownAssignment() {
    return Object.freeze({
      known: false,
      assigned: null,
      agent_id: null,
      agent_name: null,
    })
  }

  function normalizeAssignment(value) {
    if (!isObject(value) || value.known !== true || typeof value.assigned !== 'boolean') {
      return unknownAssignment()
    }

    return Object.freeze({
      known: true,
      assigned: value.assigned,
      agent_id: value.assigned ? value.agent_id ?? null : null,
      agent_name: value.assigned ? value.agent_name ?? null : null,
    })
  }

  function normalizeMessage(value, index) {
    if (!isObject(value)) {
      fail('INVALID_MESSAGE', `profile.readMessage retornou valor inválido em messages[${index}].`)
    }

    if (typeof value.message_key !== 'string' || !value.message_key.trim()) {
      fail('MESSAGE_KEY_REQUIRED', `messages[${index}].message_key é obrigatório.`)
    }

    if (value.direction !== 'incoming' && value.direction !== 'outgoing') {
      fail(
        'INVALID_DIRECTION',
        `messages[${index}].direction deve ser incoming ou outgoing.`,
      )
    }

    if (value.content_type !== 'text' && value.content_type !== 'audio') {
      fail(
        'INVALID_CONTENT_TYPE',
        `messages[${index}].content_type deve ser text ou audio.`,
      )
    }

    if (typeof value.occurred_at !== 'string' || !Number.isFinite(Date.parse(value.occurred_at))) {
      fail('INVALID_OCCURRED_AT', `messages[${index}].occurred_at é inválido.`)
    }

    const isDeleted = value.is_deleted === true

    if (isDeleted && value.deletion_reason !== 'explicit_deletion') {
      fail(
        'UNPROVEN_DELETION',
        'O reader só pode marcar exclusão quando houver evidência explícita de exclusão.',
      )
    }

    return Object.freeze({
      message_key: value.message_key.trim(),
      direction: value.direction,
      occurred_at: new Date(value.occurred_at).toISOString(),
      content_type: value.content_type,
      text_content: isDeleted ? null : value.text_content ?? null,
      audio_transcription: isDeleted ? null : value.audio_transcription ?? null,
      is_deleted: isDeleted,
      deletion_reason: isDeleted ? 'explicit_deletion' : null,
    })
  }

  function createManyChatDomReader(options = {}) {
    const documentRef = options.document ?? root.document ?? null
    const MutationObserverClass =
      options.MutationObserver ?? root.MutationObserver ?? null
    const profile = normalizeProfile(options.profile)
    const surfaceProvider =
      typeof options.surfaceProvider === 'function'
        ? options.surfaceProvider
        : () => root.YolenManyChatSurface?.getCurrentConversationSurface?.() ?? null

    function getSurface() {
      const value = surfaceProvider()
      return isObject(value) ? value : null
    }

    function getConversationRoot() {
      return queryOne(documentRef, profile.selectors.conversationRoot)
    }

    function getChannel(surface) {
      if (!surface?.supported || !profile.selectors.channel || !profile.readChannel) {
        return UNKNOWN
      }

      const node = queryOne(getConversationRoot(), profile.selectors.channel)
      if (!node) return UNKNOWN
      return normalizeChannel(profile.readChannel(node, surface))
    }

    function getContact(surface) {
      if (!surface?.supported) return null
      if (!profile.selectors.contact || !profile.readContact) {
        return normalizeContact(null, surface)
      }

      const node = queryOne(getConversationRoot(), profile.selectors.contact)
      if (!node) return normalizeContact(null, surface)
      return normalizeContact(profile.readContact(node, surface), surface)
    }

    function getAssignment(surface) {
      if (!surface?.supported) return null
      if (!profile.selectors.assignment || !profile.readAssignment) {
        return unknownAssignment()
      }

      const node = queryOne(getConversationRoot(), profile.selectors.assignment)
      if (!node) return unknownAssignment()
      return normalizeAssignment(profile.readAssignment(node, surface))
    }

    function collectVisibleMessages(surface) {
      if (!surface?.supported) return []
      const conversationRoot = getConversationRoot()
      if (!conversationRoot) return []

      const nodes = queryAll(conversationRoot, profile.selectors.messages)
      const messages = nodes.map((node, index) =>
        normalizeMessage(profile.readMessage(node, index, surface), index),
      )

      const seen = new Set()
      for (const message of messages) {
        if (seen.has(message.message_key)) {
          fail(
            'DUPLICATE_MESSAGE_KEY',
            `message_key duplicada no DOM visível: ${message.message_key}.`,
          )
        }
        seen.add(message.message_key)
      }

      return messages
    }

    function getComposer(surface) {
      if (!surface?.supported || !profile.selectors.composer) return null
      const node = queryOne(getConversationRoot(), profile.selectors.composer)
      if (!node) return null
      return profile.readComposer ? profile.readComposer(node, surface) ?? null : node
    }

    function getCapabilities(surface) {
      const conversationRoot = getConversationRoot()
      return Object.freeze({
        platform: PLATFORM,
        conversation_supported: surface?.supported === true,
        conversation_root_found: Boolean(conversationRoot),
        channel_reader_configured: Boolean(profile.selectors.channel && profile.readChannel),
        contact_reader_configured: Boolean(profile.selectors.contact && profile.readContact),
        assignment_reader_configured: Boolean(
          profile.selectors.assignment && profile.readAssignment,
        ),
        message_reader_configured: Boolean(
          profile.selectors.messages && profile.readMessage,
        ),
        composer_reader_configured: Boolean(profile.selectors.composer),
      })
    }

    function observeChanges(callback) {
      if (typeof callback !== 'function') {
        throw new TypeError('callback obrigatório.')
      }

      if (!MutationObserverClass || !documentRef?.documentElement) {
        return () => {}
      }

      let lastSurface = getSurface()
      let lastConversationKey =
        lastSurface?.supported === true ? lastSurface.conversation_key : null
      let stopped = false

      const observer = new MutationObserverClass((mutations) => {
        if (stopped) return

        const currentSurface = getSurface()
        const currentConversationKey =
          currentSurface?.supported === true
            ? currentSurface.conversation_key
            : null

        if (currentConversationKey !== lastConversationKey) {
          const previousConversationKey = lastConversationKey
          lastSurface = currentSurface
          lastConversationKey = currentConversationKey

          callback(
            Object.freeze({
              type: 'conversation_changed',
              platform: PLATFORM,
              previous_conversation_key: previousConversationKey,
              conversation_key: currentConversationKey,
              surface: currentSurface,
            }),
          )
          return
        }

        if (!currentConversationKey) return

        lastSurface = currentSurface
        callback(
          Object.freeze({
            type: 'conversation_mutated',
            platform: PLATFORM,
            conversation_key: currentConversationKey,
            mutation_count: Array.isArray(mutations) ? mutations.length : 0,
            surface: lastSurface,
          }),
        )
      })

      observer.observe(documentRef.documentElement, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
      })

      return () => {
        stopped = true
        observer.disconnect()
      }
    }

    return Object.freeze({
      getChannel,
      getContact,
      getAssignment,
      collectVisibleMessages,
      getComposer,
      observeChanges,
      getCapabilities,
    })
  }

  const api = Object.freeze({
    PLATFORM,
    UNKNOWN,
    createManyChatDomReader,
  })

  root.YolenManyChatDomReader = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
