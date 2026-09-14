;(function initYolenManyChatAdapter(root) {
  'use strict'

  const PLATFORM = 'manychat'
  const UNKNOWN = 'unknown'

  function contract() {
    const value = root.YolenUniversalPlatformContract
    if (!value) throw new Error('YolenUniversalPlatformContract ausente.')
    return value
  }

  function surfaceApi() {
    const value = root.YolenManyChatSurface
    if (!value) throw new Error('YolenManyChatSurface ausente.')
    return value
  }

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  }

  function createManyChatAdapter(options = {}) {
    const reader = isObject(options.reader) ? options.reader : null
    const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString()

    function current(value) {
      const api = surfaceApi()
      return value === undefined
        ? api.getCurrentConversationSurface()
        : api.parseManyChatConversationUrl(value)
    }

    function getPlatform() {
      return PLATFORM
    }

    function getCurrentConversation(value) {
      return current(value)
    }

    function getChannel(value) {
      const item = current(value)
      if (!item.supported) return UNKNOWN
      if (!reader || typeof reader.getChannel !== 'function') return item.channel || UNKNOWN
      const channel = reader.getChannel(item)
      return typeof channel === 'string' && channel.trim() ? channel.trim().toLowerCase() : UNKNOWN
    }

    function getContact(value) {
      const item = current(value)
      if (!item.supported) return null
      const base = { name: null, phone: null, external_contact_id: item.external_contact_id }
      if (!reader || typeof reader.getContact !== 'function') return Object.freeze(base)
      const data = reader.getContact(item)
      if (!isObject(data)) return Object.freeze(base)
      return Object.freeze({
        name: data.name ?? null,
        phone: data.phone ?? null,
        external_contact_id: data.external_contact_id ?? item.external_contact_id,
      })
    }

    function getAssignment(value) {
      const item = current(value)
      if (!item.supported) return null
      if (!reader || typeof reader.getAssignment !== 'function') {
        return Object.freeze({ known: false, assigned: null, agent_id: null, agent_name: null })
      }
      const data = reader.getAssignment(item)
      if (!isObject(data) || data.known !== true || typeof data.assigned !== 'boolean') {
        return Object.freeze({ known: false, assigned: null, agent_id: null, agent_name: null })
      }
      return Object.freeze({
        known: true,
        assigned: data.assigned,
        agent_id: data.assigned ? data.agent_id ?? null : null,
        agent_name: data.assigned ? data.agent_name ?? null : null,
      })
    }

    function collectVisibleMessages(value) {
      const item = current(value)
      if (!item.supported || !reader || typeof reader.collectVisibleMessages !== 'function') return []
      const messages = reader.collectVisibleMessages(item)
      return Array.isArray(messages) ? messages.slice() : []
    }

    function getComposer(value) {
      const item = current(value)
      if (!item.supported || !reader || typeof reader.getComposer !== 'function') return null
      return reader.getComposer(item) ?? null
    }

    function observeChanges(callback) {
      if (typeof callback !== 'function') throw new TypeError('callback obrigatório.')
      if (!reader || typeof reader.observeChanges !== 'function') return () => {}
      const stop = reader.observeChanges(callback)
      return typeof stop === 'function' ? stop : () => {}
    }

    function getEvidenceState(value) {
      const item = current(value)
      if (!item.supported) {
        return Object.freeze({ ready: false, reason: item.reason, missing: Object.freeze(['conversation']) })
      }

      const channel = getChannel(value)
      const assignment = getAssignment(value)
      const missing = []
      if (channel === UNKNOWN) missing.push('channel')
      if (!assignment || assignment.known !== true) missing.push('assignment')
      if (!reader || typeof reader.collectVisibleMessages !== 'function') missing.push('messages')

      return Object.freeze({
        ready: missing.length === 0,
        reason: missing.length === 0 ? null : 'insufficient_evidence',
        missing: Object.freeze(missing),
      })
    }

    function buildUniversalConversation(value) {
      const item = current(value)
      const evidence = getEvidenceState(value)
      if (!item.supported || !evidence.ready) {
        return Object.freeze({ ready: false, reason: evidence.reason, missing: evidence.missing, conversation: null })
      }

      const assignment = getAssignment(value)
      const conversation = contract().normalizeUniversalConversation({
        contract_version: contract().CONTRACT_VERSION,
        platform: PLATFORM,
        channel: getChannel(value),
        external_conversation_id: item.external_conversation_id,
        conversation_key: item.conversation_key,
        contact: getContact(value),
        assignment: {
          assigned: assignment.assigned,
          agent_id: assignment.agent_id,
          agent_name: assignment.agent_name,
        },
        observed_at: now(),
        messages: collectVisibleMessages(value),
      })

      return Object.freeze({ ready: true, reason: null, missing: Object.freeze([]), conversation })
    }

    function createReadOnlySnapshot(value) {
      const item = current(value)
      const evidence = getEvidenceState(value)
      return Object.freeze({
        platform: PLATFORM,
        surface: item,
        evidence_ready: evidence.ready,
        missing_evidence: evidence.missing,
        channel: getChannel(value),
        contact: getContact(value),
        assignment: getAssignment(value),
        messages: Object.freeze(collectVisibleMessages(value)),
        observed_at: now(),
        capture_enabled: false,
        persistence_enabled: false,
        reasoning_enabled: false,
        composer_enabled: false,
      })
    }

    const adapter = Object.freeze({
      getPlatform,
      getCurrentConversation,
      collectVisibleMessages,
      getContact,
      getAssignment,
      observeChanges,
      getComposer,
      getChannel,
      getEvidenceState,
      buildUniversalConversation,
      createReadOnlySnapshot,
    })

    contract().assertPlatformAdapter(adapter)
    return adapter
  }

  const api = Object.freeze({ PLATFORM, UNKNOWN, createManyChatAdapter })
  root.YolenManyChatAdapter = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof globalThis !== 'undefined' ? globalThis : this)
