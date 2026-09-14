;(function initYolenManyChatSurface(root) {
  'use strict'

  const PLATFORM = 'manychat'
  const CHANNEL_UNKNOWN = 'unknown'
  const MANYCHAT_APP_HOST = 'app.manychat.com'
  const CHAT_ROUTE_PATTERN = /^\/(fb[^/]+)\/chat\/([^/?#]+)/i

  function getContract() {
    const contract = root.YolenUniversalPlatformContract

    if (
      !contract ||
      typeof contract.buildNamespacedConversationKey !== 'function'
    ) {
      throw new Error(
        'YolenUniversalPlatformContract precisa ser carregado antes de manychat-surface.js.',
      )
    }

    return contract
  }

  function safeDecode(value) {
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  }

  function normalizeUrl(value) {
    if (value instanceof URL) {
      return value
    }

    if (typeof value === 'string' && value.trim()) {
      try {
        return new URL(value)
      } catch {
        return null
      }
    }

    if (
      value &&
      typeof value === 'object' &&
      typeof value.href === 'string'
    ) {
      try {
        return new URL(value.href)
      } catch {
        return null
      }
    }

    return null
  }

  function unsupported(reason, url) {
    return Object.freeze({
      supported: false,
      platform: PLATFORM,
      channel: CHANNEL_UNKNOWN,
      reason,
      host: url?.host ?? null,
      pathname: url?.pathname ?? null,
      account_key: null,
      external_contact_id: null,
      external_conversation_id: null,
      conversation_key: null,
    })
  }

  function parseManyChatConversationUrl(value) {
    const url = normalizeUrl(value)

    if (!url) {
      return unsupported('invalid_url', null)
    }

    if (url.protocol !== 'https:' || url.host !== MANYCHAT_APP_HOST) {
      return unsupported('unsupported_host', url)
    }

    const match = url.pathname.match(CHAT_ROUTE_PATTERN)

    if (!match) {
      return unsupported('unsupported_route', url)
    }

    const accountKey = safeDecode(match[1]).trim()
    const externalContactId = safeDecode(match[2]).trim()

    if (!accountKey || !externalContactId) {
      return unsupported('incomplete_chat_identity', url)
    }

    const externalConversationId =
      `${accountKey}:chat:${externalContactId}`

    const conversationKey =
      getContract().buildNamespacedConversationKey({
        platform: PLATFORM,
        channel: CHANNEL_UNKNOWN,
        externalIdentity: externalConversationId,
      })

    return Object.freeze({
      supported: true,
      platform: PLATFORM,
      channel: CHANNEL_UNKNOWN,
      reason: null,
      host: url.host,
      pathname: url.pathname,
      account_key: accountKey,
      external_contact_id: externalContactId,
      external_conversation_id: externalConversationId,
      conversation_key: conversationKey,
    })
  }

  function getCurrentConversationSurface() {
    const href = root.location?.href

    if (typeof href !== 'string') {
      return unsupported('location_unavailable', null)
    }

    return parseManyChatConversationUrl(href)
  }

  function createDiagnosticSnapshot(value) {
    const surface = value
      ? parseManyChatConversationUrl(value)
      : getCurrentConversationSurface()

    return Object.freeze({
      ...surface,
      observed_at: new Date().toISOString(),
      capture_enabled: false,
      persistence_enabled: false,
      reasoning_enabled: false,
    })
  }

  const api = Object.freeze({
    PLATFORM,
    CHANNEL_UNKNOWN,
    MANYCHAT_APP_HOST,
    parseManyChatConversationUrl,
    getCurrentConversationSurface,
    createDiagnosticSnapshot,
  })

  root.YolenManyChatSurface = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
