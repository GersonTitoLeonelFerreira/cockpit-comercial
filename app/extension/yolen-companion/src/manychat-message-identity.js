;(function initYolenManyChatMessageIdentity(root) {
  'use strict'

  const PLATFORM = 'manychat'
  const SCHEMA_VERSION = 'yolen-manychat-message-identity-evidence-v1'

  function semanticsApi() {
    const api = root.YolenManyChatMessageSemantics
    if (!api || typeof api.classifyManyChatMessageNode !== 'function') {
      const error = new Error('YolenManyChatMessageSemantics ausente.')
      error.name = 'YolenManyChatMessageIdentityError'
      error.code = 'SEMANTICS_UNAVAILABLE'
      throw error
    }
    return api
  }

  function readAttribute(node, name) {
    if (!node || typeof node.getAttribute !== 'function') return null
    try {
      const value = node.getAttribute(name)
      return typeof value === 'string' ? value : null
    } catch {
      return null
    }
  }

  function findNativeMessageIds(node) {
    if (!node || typeof node.querySelectorAll !== 'function') return []

    try {
      return Array.from(node.querySelectorAll('[data-mid]'))
        .map((child) => readAttribute(child, 'data-mid'))
        .filter((value) => typeof value === 'string' && value.trim())
        .map((value) => value.trim())
    } catch {
      return []
    }
  }

  function normalizeTimestamp(node) {
    const raw = readAttribute(node, 'data-title')
    if (!raw) {
      return Object.freeze({
        ready: false,
        reason: 'timestamp_missing',
        occurred_at: null,
      })
    }

    const parsed = Date.parse(raw)
    if (!Number.isFinite(parsed)) {
      return Object.freeze({
        ready: false,
        reason: 'timestamp_invalid',
        occurred_at: null,
      })
    }

    return Object.freeze({
      ready: true,
      reason: null,
      occurred_at: new Date(parsed).toISOString(),
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

  function baseEvidence(semantic, timestamp) {
    return {
      schema_version: SCHEMA_VERSION,
      platform: PLATFORM,
      direction: semantic.direction,
      author_kind: semantic.author_kind,
      occurred_at: timestamp.occurred_at,
      identity_source: null,
      native_message_id: null,
      native_message_id_count: 0,
      ready: false,
      reason: null,
      message_key_eligible: false,
      capture_enabled: false,
      persistence_enabled: false,
      reasoning_enabled: false,
    }
  }

  function extractManyChatMessageIdentity(node) {
    const semantic = semanticsApi().classifyManyChatMessageNode(node)
    const timestamp = normalizeTimestamp(node)
    const evidence = baseEvidence(semantic, timestamp)

    if (semantic.author_kind === 'unknown') {
      return Object.freeze({
        ...evidence,
        reason: semantic.reason ?? 'semantic_identity_unknown',
      })
    }

    if (!timestamp.ready) {
      return Object.freeze({
        ...evidence,
        reason: timestamp.reason,
      })
    }

    const mids = findNativeMessageIds(node)

    if (semantic.author_kind === 'automation') {
      return Object.freeze({
        ...evidence,
        native_message_id_count: mids.length,
        reason: 'automation_native_identity_not_validated',
      })
    }

    if (
      semantic.author_kind !== 'customer' &&
      semantic.author_kind !== 'human_agent'
    ) {
      return Object.freeze({
        ...evidence,
        native_message_id_count: mids.length,
        reason: 'unsupported_author_kind',
      })
    }

    if (mids.length === 0) {
      return Object.freeze({
        ...evidence,
        reason: 'native_message_id_missing',
      })
    }

    if (mids.length !== 1) {
      return Object.freeze({
        ...evidence,
        native_message_id_count: mids.length,
        reason: 'native_message_id_ambiguous',
      })
    }

    return Object.freeze({
      ...evidence,
      identity_source: 'data-mid',
      native_message_id: mids[0],
      native_message_id_count: 1,
      ready: true,
      reason: null,
      message_key_eligible: true,
    })
  }

  function safeManyChatMessageIdentityView(value) {
    const nativeId = typeof value?.native_message_id === 'string'
      ? value.native_message_id
      : null

    return Object.freeze({
      schema_version: value?.schema_version ?? SCHEMA_VERSION,
      platform: value?.platform ?? PLATFORM,
      direction: value?.direction ?? 'unknown',
      author_kind: value?.author_kind ?? 'unknown',
      occurred_at_valid: Boolean(
        typeof value?.occurred_at === 'string' &&
        Number.isFinite(Date.parse(value.occurred_at)),
      ),
      identity_source: value?.identity_source ?? null,
      native_message_id_present: Boolean(nativeId),
      native_message_id_length: nativeId?.length ?? 0,
      native_message_id_fingerprint: nativeId ? fnv1a(nativeId) : null,
      native_message_id_count: Number.isInteger(value?.native_message_id_count)
        ? value.native_message_id_count
        : 0,
      ready: value?.ready === true,
      reason: value?.reason ?? null,
      message_key_eligible: value?.message_key_eligible === true,
      privacy: Object.freeze({
        raw_message_id_exposed: false,
        text_content_read: false,
        input_values_read: false,
        network_sent: false,
        persisted: false,
      }),
    })
  }

  function summarizeManyChatMessageIdentity(nodes) {
    const evidence = Array.from(nodes ?? []).map(extractManyChatMessageIdentity)

    return Object.freeze({
      schema_version: 'yolen-manychat-message-identity-summary-v1',
      platform: PLATFORM,
      total: evidence.length,
      customer_total: evidence.filter((item) => item.author_kind === 'customer').length,
      customer_ready: evidence.filter(
        (item) => item.author_kind === 'customer' && item.ready,
      ).length,
      human_agent_total: evidence.filter(
        (item) => item.author_kind === 'human_agent',
      ).length,
      human_agent_ready: evidence.filter(
        (item) => item.author_kind === 'human_agent' && item.ready,
      ).length,
      automation_total: evidence.filter(
        (item) => item.author_kind === 'automation',
      ).length,
      automation_ready: evidence.filter(
        (item) => item.author_kind === 'automation' && item.ready,
      ).length,
      unknown_total: evidence.filter(
        (item) => item.author_kind === 'unknown',
      ).length,
      timestamp_ready: evidence.filter((item) => Boolean(item.occurred_at)).length,
      privacy: Object.freeze({
        raw_message_id_exposed: false,
        text_content_read: false,
        input_values_read: false,
        network_sent: false,
        persisted: false,
      }),
    })
  }

  const api = Object.freeze({
    PLATFORM,
    SCHEMA_VERSION,
    extractManyChatMessageIdentity,
    safeManyChatMessageIdentityView,
    summarizeManyChatMessageIdentity,
  })

  root.YolenManyChatMessageIdentity = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
