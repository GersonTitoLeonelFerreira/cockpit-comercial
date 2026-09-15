;(function initYolenManyChatMessageContent(root) {
  'use strict'

  const PLATFORM = 'manychat'
  const SCHEMA_VERSION = 'yolen-manychat-message-content-evidence-v1'

  function identityApi() {
    const api = root.YolenManyChatMessageIdentity
    if (!api || typeof api.extractManyChatMessageIdentity !== 'function') {
      const error = new Error('YolenManyChatMessageIdentity ausente.')
      error.name = 'YolenManyChatMessageContentError'
      error.code = 'IDENTITY_UNAVAILABLE'
      throw error
    }
    return api
  }

  function queryAll(node, selector) {
    if (!node || typeof node.querySelectorAll !== 'function') return []
    try {
      return Array.from(node.querySelectorAll(selector))
    } catch {
      return []
    }
  }

  function readText(node) {
    try {
      return typeof node?.textContent === 'string' ? node.textContent : ''
    } catch {
      return ''
    }
  }

  function findSingleNativeContentNode(node) {
    const matches = queryAll(node, '[data-mid]')
    return Object.freeze({
      count: matches.length,
      node: matches.length === 1 ? matches[0] : null,
    })
  }

  function structuralMedia(node) {
    return Object.freeze({
      audio: queryAll(node, 'audio').length,
      video: queryAll(node, 'video').length,
      image: queryAll(node, 'img').length,
      canvas: queryAll(node, 'canvas').length,
    })
  }

  function base(identity) {
    return {
      schema_version: SCHEMA_VERSION,
      platform: PLATFORM,
      author_kind: identity?.author_kind ?? 'unknown',
      direction: identity?.direction ?? 'unknown',
      message_key_eligible: identity?.message_key_eligible === true,
      identity_ready: identity?.ready === true,
      content_type: null,
      text_content: null,
      audio_transcription: null,
      content_node_source: null,
      content_node_count: 0,
      content_ready: false,
      reason: null,
      capture_enabled: false,
      persistence_enabled: false,
      reasoning_enabled: false,
    }
  }

  function extractManyChatMessageContent(node) {
    const identity = identityApi().extractManyChatMessageIdentity(node)
    const evidence = base(identity)

    if (identity.author_kind === 'automation') {
      return Object.freeze({
        ...evidence,
        reason: 'automation_content_context_only',
      })
    }

    if (identity.author_kind === 'unknown') {
      return Object.freeze({
        ...evidence,
        reason: 'semantic_author_unknown',
      })
    }

    if (!identity.ready) {
      return Object.freeze({
        ...evidence,
        reason: identity.reason ?? 'identity_not_ready',
      })
    }

    const native = findSingleNativeContentNode(node)
    if (native.count !== 1 || !native.node) {
      return Object.freeze({
        ...evidence,
        content_node_count: native.count,
        reason:
          native.count === 0
            ? 'native_content_node_missing'
            : 'native_content_node_ambiguous',
      })
    }

    const text = readText(native.node)
    const media = structuralMedia(native.node)
    const hasText = text.length > 0
    const hasUnsupportedVisualMedia =
      media.video > 0 || media.image > 0 || media.canvas > 0

    if (hasUnsupportedVisualMedia) {
      return Object.freeze({
        ...evidence,
        content_node_source: 'data-mid',
        content_node_count: 1,
        reason: 'visual_media_content_not_validated',
      })
    }

    if (media.audio > 1) {
      return Object.freeze({
        ...evidence,
        content_node_source: 'data-mid',
        content_node_count: 1,
        reason: 'audio_content_ambiguous',
      })
    }

    if (media.audio === 1 && hasText) {
      return Object.freeze({
        ...evidence,
        content_node_source: 'data-mid',
        content_node_count: 1,
        reason: 'mixed_audio_text_content_not_validated',
      })
    }

    if (media.audio === 1) {
      return Object.freeze({
        ...evidence,
        content_type: 'audio',
        text_content: null,
        audio_transcription: null,
        content_node_source: 'data-mid',
        content_node_count: 1,
        content_ready: true,
        reason: null,
      })
    }

    if (hasText) {
      return Object.freeze({
        ...evidence,
        content_type: 'text',
        text_content: text,
        audio_transcription: null,
        content_node_source: 'data-mid',
        content_node_count: 1,
        content_ready: true,
        reason: null,
      })
    }

    return Object.freeze({
      ...evidence,
      content_node_source: 'data-mid',
      content_node_count: 1,
      reason: 'empty_content_not_classified',
    })
  }

  function fnv1a(value) {
    let hash = 0x811c9dc5
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index)
      hash = Math.imul(hash, 0x01000193) >>> 0
    }
    return hash.toString(16).padStart(8, '0')
  }

  function safeManyChatMessageContentView(value) {
    const text = typeof value?.text_content === 'string'
      ? value.text_content
      : null

    return Object.freeze({
      schema_version: value?.schema_version ?? SCHEMA_VERSION,
      platform: value?.platform ?? PLATFORM,
      author_kind: value?.author_kind ?? 'unknown',
      direction: value?.direction ?? 'unknown',
      content_type: value?.content_type ?? null,
      content_node_source: value?.content_node_source ?? null,
      content_node_count: Number.isInteger(value?.content_node_count)
        ? value.content_node_count
        : 0,
      text_present: Boolean(text),
      text_length: text?.length ?? 0,
      text_fingerprint: text ? fnv1a(text) : null,
      audio_transcription_present:
        typeof value?.audio_transcription === 'string' &&
        value.audio_transcription.length > 0,
      content_ready: value?.content_ready === true,
      reason: value?.reason ?? null,
      privacy: Object.freeze({
        raw_text_exposed: false,
        input_values_read: false,
        network_sent: false,
        persisted: false,
      }),
    })
  }

  function summarizeManyChatMessageContent(nodes) {
    const evidence = Array.from(nodes ?? []).map(extractManyChatMessageContent)

    return Object.freeze({
      schema_version: 'yolen-manychat-message-content-summary-v1',
      platform: PLATFORM,
      total: evidence.length,
      human_total: evidence.filter(
        (item) => item.author_kind === 'customer' || item.author_kind === 'human_agent',
      ).length,
      text_ready: evidence.filter(
        (item) => item.content_ready && item.content_type === 'text',
      ).length,
      audio_ready: evidence.filter(
        (item) => item.content_ready && item.content_type === 'audio',
      ).length,
      automation_total: evidence.filter(
        (item) => item.author_kind === 'automation',
      ).length,
      automation_blocked: evidence.filter(
        (item) =>
          item.author_kind === 'automation' &&
          item.content_ready === false &&
          item.reason === 'automation_content_context_only',
      ).length,
      unknown_total: evidence.filter(
        (item) => item.author_kind === 'unknown',
      ).length,
      not_ready_total: evidence.filter((item) => !item.content_ready).length,
      privacy: Object.freeze({
        raw_text_exposed: false,
        input_values_read: false,
        network_sent: false,
        persisted: false,
      }),
    })
  }

  const api = Object.freeze({
    PLATFORM,
    SCHEMA_VERSION,
    extractManyChatMessageContent,
    safeManyChatMessageContentView,
    summarizeManyChatMessageContent,
  })

  root.YolenManyChatMessageContent = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
