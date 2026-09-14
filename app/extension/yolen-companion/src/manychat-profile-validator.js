;(function initYolenManyChatProfileValidator(root) {
  'use strict'

  const PLATFORM = 'manychat'
  const PROFILE_CANDIDATE_SCHEMA_VERSION = 'yolen-manychat-profile-candidate-v1'
  const VALIDATED_PROFILE_SCHEMA_VERSION = 'yolen-manychat-validated-profile-v1'
  const DEFAULT_MINIMUM_PASSES = 3
  const DEFAULT_MINIMUM_DISTINCT_CONVERSATIONS = 2

  const OPTIONAL_SELECTORS = Object.freeze([
    'channel',
    'contact',
    'assignment',
    'composer',
  ])

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  }

  function fail(code, message, path = null) {
    const error = new Error(message)
    error.name = 'YolenManyChatProfileValidatorError'
    error.code = code
    error.path = path
    throw error
  }

  function assertFalseFlag(candidate, name) {
    if (candidate[name] !== false) {
      fail(
        'UNSAFE_PROFILE_CANDIDATE',
        `${name} precisa permanecer false antes da validação real de DOM.`,
        `candidate.${name}`,
      )
    }
  }

  function assertProfileCandidate(candidate) {
    if (!isObject(candidate)) {
      fail('PROFILE_CANDIDATE_REQUIRED', 'candidate é obrigatório.', 'candidate')
    }

    if (candidate.schema_version !== PROFILE_CANDIDATE_SCHEMA_VERSION) {
      fail(
        'UNSUPPORTED_PROFILE_CANDIDATE_SCHEMA',
        `schema_version precisa ser ${PROFILE_CANDIDATE_SCHEMA_VERSION}.`,
        'candidate.schema_version',
      )
    }

    if (candidate.platform !== PLATFORM) {
      fail('INVALID_PLATFORM', 'candidate não pertence ao ManyChat.', 'candidate.platform')
    }

    if (typeof candidate.fingerprint !== 'string' || !candidate.fingerprint.trim()) {
      fail('FINGERPRINT_REQUIRED', 'candidate.fingerprint é obrigatório.', 'candidate.fingerprint')
    }

    if (!isObject(candidate.selectors)) {
      fail('SELECTORS_REQUIRED', 'candidate.selectors é obrigatório.', 'candidate.selectors')
    }

    for (const required of ['conversationRoot', 'messages']) {
      if (
        typeof candidate.selectors[required] !== 'string' ||
        !candidate.selectors[required].trim()
      ) {
        fail(
          'REQUIRED_SELECTOR_MISSING',
          `candidate.selectors.${required} é obrigatório.`,
          `candidate.selectors.${required}`,
        )
      }
    }

    if (candidate.requires_authenticated_dom_validation !== true) {
      fail(
        'AUTHENTICATED_DOM_VALIDATION_REQUIRED',
        'candidate precisa exigir validação de DOM autenticado.',
        'candidate.requires_authenticated_dom_validation',
      )
    }

    assertFalseFlag(candidate, 'approved_for_runtime')
    assertFalseFlag(candidate, 'capture_enabled')
    assertFalseFlag(candidate, 'persistence_enabled')
    assertFalseFlag(candidate, 'reasoning_enabled')

    return candidate
  }

  function normalizePositiveInteger(value, fallback, path) {
    if (value === undefined || value === null) return fallback
    if (!Number.isInteger(value) || value <= 0) {
      fail('INVALID_THRESHOLD', `${path} precisa ser inteiro positivo.`, path)
    }
    return value
  }

  function fnv1a(value) {
    let hash = 0x811c9dc5
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index)
      hash = Math.imul(hash, 0x01000193) >>> 0
    }
    return hash.toString(16).padStart(8, '0')
  }

  function conversationRef(conversationKey) {
    return `mc-conv-${fnv1a(conversationKey)}`
  }

  function resolveSurface(options = {}) {
    if (isObject(options.surface)) return options.surface
    const provider =
      typeof options.surfaceProvider === 'function'
        ? options.surfaceProvider
        : root.YolenManyChatSurface?.getCurrentConversationSurface

    return typeof provider === 'function' ? provider() : null
  }

  function safeQueryAll(scope, selector) {
    if (!scope || typeof scope.querySelectorAll !== 'function') {
      return { ok: false, code: 'QUERY_SCOPE_UNAVAILABLE', nodes: [] }
    }

    try {
      return { ok: true, code: null, nodes: Array.from(scope.querySelectorAll(selector)) }
    } catch {
      return { ok: false, code: 'RUNTIME_SELECTOR_INVALID', nodes: [] }
    }
  }

  function immutableObservation(input) {
    return Object.freeze({
      schema_version: 'yolen-manychat-profile-validation-observation-v1',
      platform: PLATFORM,
      fingerprint: input.fingerprint,
      observed_at: input.observed_at,
      conversation_ref: input.conversation_ref,
      pass: input.pass,
      reason: input.reason,
      counts: Object.freeze({ ...input.counts }),
      privacy: Object.freeze({
        text_content_read: false,
        input_values_read: false,
        network_sent: false,
        persisted: false,
      }),
    })
  }

  function validateDomObservation(candidate, options = {}) {
    assertProfileCandidate(candidate)

    const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString()
    const observedAt = now()
    const surface = resolveSurface(options)
    const documentRef = options.document ?? root.document ?? null
    const counts = {
      conversationRoot: 0,
      messages: 0,
      channel: 0,
      contact: 0,
      assignment: 0,
      composer: 0,
    }

    function result(pass, reason, ref = null) {
      return immutableObservation({
        fingerprint: candidate.fingerprint,
        observed_at: observedAt,
        conversation_ref: ref,
        pass,
        reason,
        counts,
      })
    }

    if (
      !isObject(surface) ||
      surface.supported !== true ||
      typeof surface.conversation_key !== 'string' ||
      !surface.conversation_key.startsWith('manychat:')
    ) {
      return result(false, 'unsupported_surface')
    }

    const ref = conversationRef(surface.conversation_key)

    if (!documentRef) {
      return result(false, 'document_unavailable', ref)
    }

    const rootQuery = safeQueryAll(
      documentRef,
      candidate.selectors.conversationRoot,
    )

    if (!rootQuery.ok) {
      return result(false, rootQuery.code, ref)
    }

    counts.conversationRoot = rootQuery.nodes.length
    if (rootQuery.nodes.length !== 1) {
      return result(false, 'conversation_root_cardinality', ref)
    }

    const conversationRoot = rootQuery.nodes[0]
    const messagesQuery = safeQueryAll(
      conversationRoot,
      candidate.selectors.messages,
    )

    if (!messagesQuery.ok) {
      return result(false, messagesQuery.code, ref)
    }

    counts.messages = messagesQuery.nodes.length
    if (messagesQuery.nodes.length < 1) {
      return result(false, 'messages_not_observed', ref)
    }

    for (const name of OPTIONAL_SELECTORS) {
      const selector = candidate.selectors[name]
      if (selector === null || selector === undefined || selector === '') continue

      if (typeof selector !== 'string' || !selector.trim()) {
        return result(false, `invalid_optional_selector:${name}`, ref)
      }

      const query = safeQueryAll(conversationRoot, selector)
      if (!query.ok) {
        return result(false, `${query.code}:${name}`, ref)
      }

      counts[name] = query.nodes.length
      if (query.nodes.length !== 1) {
        return result(false, `optional_selector_cardinality:${name}`, ref)
      }
    }

    return result(true, null, ref)
  }

  function createReadOnlyProfileValidationSession(candidate, options = {}) {
    assertProfileCandidate(candidate)

    const minimumPasses = normalizePositiveInteger(
      options.minimumPasses,
      DEFAULT_MINIMUM_PASSES,
      'options.minimumPasses',
    )
    const minimumDistinctConversations = normalizePositiveInteger(
      options.minimumDistinctConversations,
      DEFAULT_MINIMUM_DISTINCT_CONVERSATIONS,
      'options.minimumDistinctConversations',
    )

    const observations = []

    function observe(observationOptions = {}) {
      const observation = validateDomObservation(candidate, observationOptions)
      observations.push(observation)
      return observation
    }

    function getState() {
      const passes = observations.filter((item) => item.pass)
      const failures = observations.filter((item) => !item.pass)
      const distinctConversationRefs = new Set(
        passes
          .map((item) => item.conversation_ref)
          .filter((value) => typeof value === 'string' && value),
      )

      const ready =
        failures.length === 0 &&
        passes.length >= minimumPasses &&
        distinctConversationRefs.size >= minimumDistinctConversations

      return Object.freeze({
        schema_version: 'yolen-manychat-profile-validation-state-v1',
        platform: PLATFORM,
        fingerprint: candidate.fingerprint,
        ready,
        pass_count: passes.length,
        failure_count: failures.length,
        distinct_conversation_count: distinctConversationRefs.size,
        minimum_passes: minimumPasses,
        minimum_distinct_conversations: minimumDistinctConversations,
        observations: Object.freeze(observations.slice()),
      })
    }

    function buildValidatedReadOnlyProfile() {
      const state = getState()
      if (!state.ready) {
        return Object.freeze({
          ready: false,
          reason: state.failure_count > 0 ? 'validation_failed' : 'insufficient_validation',
          state,
          profile: null,
        })
      }

      const profile = Object.freeze({
        schema_version: VALIDATED_PROFILE_SCHEMA_VERSION,
        platform: PLATFORM,
        source_fingerprint: candidate.fingerprint,
        selectors: Object.freeze({ ...candidate.selectors }),
        validation: Object.freeze({
          pass_count: state.pass_count,
          distinct_conversation_count: state.distinct_conversation_count,
          minimum_passes: state.minimum_passes,
          minimum_distinct_conversations: state.minimum_distinct_conversations,
        }),
        approved_for_readonly_runtime: true,
        approved_for_runtime: false,
        capture_enabled: false,
        persistence_enabled: false,
        reasoning_enabled: false,
        composer_enabled: false,
      })

      return Object.freeze({ ready: true, reason: null, state, profile })
    }

    return Object.freeze({
      observe,
      getState,
      buildValidatedReadOnlyProfile,
    })
  }

  const api = Object.freeze({
    PLATFORM,
    PROFILE_CANDIDATE_SCHEMA_VERSION,
    VALIDATED_PROFILE_SCHEMA_VERSION,
    DEFAULT_MINIMUM_PASSES,
    DEFAULT_MINIMUM_DISTINCT_CONVERSATIONS,
    assertProfileCandidate,
    validateDomObservation,
    createReadOnlyProfileValidationSession,
  })

  root.YolenManyChatProfileValidator = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
