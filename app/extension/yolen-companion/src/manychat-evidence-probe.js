;(function initYolenManyChatEvidenceProbe(root) {
  'use strict'

  const PLATFORM = 'manychat'
  const MAX_CANDIDATES = 400
  const MAX_ATTRIBUTE_VALUE_LENGTH = 180
  const SAFE_ATTRIBUTE_NAMES = Object.freeze([
    'role',
    'aria-label',
    'data-testid',
    'data-test',
    'data-test-id',
    'data-cy',
    'data-qa',
    'contenteditable',
    'placeholder',
    'type',
    'name',
    'class',
    'id',
  ])
  const SIGNAL_PATTERN = /(chat|message|conversation|contact|assign|composer|inbox|reply|channel|thread|bubble)/i

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  }

  function surfaceApi(options = {}) {
    const api = options.surfaceApi ?? root.YolenManyChatSurface
    if (!api || typeof api.parseManyChatConversationUrl !== 'function') {
      throw new Error('YolenManyChatSurface precisa estar disponível para o probe.')
    }
    return api
  }

  function normalizeLimit(value) {
    if (!Number.isInteger(value) || value <= 0) return MAX_CANDIDATES
    return Math.min(value, MAX_CANDIDATES)
  }

  function sanitizeAttributeValue(value) {
    if (typeof value !== 'string') return null

    let output = value.replace(/\s+/g, ' ').trim()
    if (!output) return null

    output = output.replace(
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
      '[redacted-email]',
    )
    output = output.replace(/\b\d{7,}\b/g, '[redacted-id]')
    output = output.replace(
      /\+?\d[\d\s().-]{7,}\d/g,
      '[redacted-number]',
    )

    if (output.length > MAX_ATTRIBUTE_VALUE_LENGTH) {
      output = `${output.slice(0, MAX_ATTRIBUTE_VALUE_LENGTH)}…`
    }

    return output
  }

  function getAttribute(node, name) {
    if (!node || typeof node.getAttribute !== 'function') return null
    try {
      return sanitizeAttributeValue(node.getAttribute(name))
    } catch {
      return null
    }
  }

  function getTagName(node) {
    const raw = node?.tagName
    return typeof raw === 'string' && raw.trim()
      ? raw.trim().toLowerCase()
      : null
  }

  function collectAttributes(node) {
    const attributes = {}

    for (const name of SAFE_ATTRIBUTE_NAMES) {
      const value = getAttribute(node, name)
      if (value !== null) attributes[name] = value
    }

    return Object.freeze(attributes)
  }

  function hasSignal(node, attributes) {
    const tag = getTagName(node)
    if (tag === 'input' || tag === 'textarea' || tag === 'button') return true

    if (attributes.contenteditable === 'true') return true
    if (attributes.role) return true
    if (attributes['data-testid']) return true
    if (attributes['data-test']) return true
    if (attributes['data-test-id']) return true
    if (attributes['data-cy']) return true
    if (attributes['data-qa']) return true
    if (attributes['aria-label']) return true

    return Object.values(attributes).some(
      (value) => typeof value === 'string' && SIGNAL_PATTERN.test(value),
    )
  }

  function describeNode(node) {
    return Object.freeze({
      tag: getTagName(node),
      attributes: collectAttributes(node),
    })
  }

  function describeAncestors(node, depth = 4) {
    const ancestors = []
    let current = node?.parentElement ?? null

    while (current && ancestors.length < depth) {
      ancestors.push(describeNode(current))
      current = current.parentElement ?? null
    }

    return Object.freeze(ancestors)
  }

  function collectCandidates(documentRef, limit) {
    if (!documentRef || typeof documentRef.querySelectorAll !== 'function') return []

    let nodes = []
    try {
      nodes = Array.from(documentRef.querySelectorAll('*'))
    } catch {
      return []
    }

    const candidates = []

    for (const node of nodes) {
      if (candidates.length >= limit) break

      const attributes = collectAttributes(node)
      if (!hasSignal(node, attributes)) continue

      candidates.push(
        Object.freeze({
          tag: getTagName(node),
          attributes,
          ancestors: describeAncestors(node),
        }),
      )
    }

    return Object.freeze(candidates)
  }

  function increment(map, key) {
    if (!key) return
    map[key] = (map[key] ?? 0) + 1
  }

  function summarizeCandidates(candidates) {
    const tags = {}
    const roles = {}
    const attributes = {}

    for (const candidate of candidates) {
      increment(tags, candidate.tag)
      increment(roles, candidate.attributes.role)
      for (const name of Object.keys(candidate.attributes)) increment(attributes, name)
    }

    return Object.freeze({
      candidate_count: candidates.length,
      tags: Object.freeze(tags),
      roles: Object.freeze(roles),
      attributes: Object.freeze(attributes),
    })
  }

  function resolveSurface(api, value) {
    if (value !== undefined && value !== null) {
      return api.parseManyChatConversationUrl(value)
    }

    if (typeof api.getCurrentConversationSurface === 'function') {
      return api.getCurrentConversationSurface()
    }

    return Object.freeze({
      supported: false,
      platform: PLATFORM,
      reason: 'surface_unavailable',
      conversation_key: null,
    })
  }

  function createManyChatEvidenceProbe(options = {}) {
    const documentRef = options.document ?? root.document ?? null
    const api = surfaceApi(options)
    const limit = normalizeLimit(options.maxCandidates)
    const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString()

    function run(value) {
      const surface = resolveSurface(api, value)

      if (!surface?.supported) {
        return Object.freeze({
          schema_version: 'yolen-manychat-evidence-v1',
          platform: PLATFORM,
          supported: false,
          reason: surface?.reason ?? 'unsupported_surface',
          observed_at: now(),
          surface,
          summary: summarizeCandidates([]),
          candidates: Object.freeze([]),
          privacy: Object.freeze({
            text_content_collected: false,
            input_values_collected: false,
            network_sent: false,
            persisted: false,
          }),
        })
      }

      const candidates = collectCandidates(documentRef, limit)

      return Object.freeze({
        schema_version: 'yolen-manychat-evidence-v1',
        platform: PLATFORM,
        supported: true,
        reason: null,
        observed_at: now(),
        surface,
        summary: summarizeCandidates(candidates),
        candidates,
        privacy: Object.freeze({
          text_content_collected: false,
          input_values_collected: false,
          network_sent: false,
          persisted: false,
        }),
      })
    }

    function toJson(value) {
      return JSON.stringify(run(value), null, 2)
    }

    return Object.freeze({ run, toJson })
  }

  const api = Object.freeze({
    PLATFORM,
    SAFE_ATTRIBUTE_NAMES,
    createManyChatEvidenceProbe,
    sanitizeAttributeValue,
  })

  root.YolenManyChatEvidenceProbe = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
