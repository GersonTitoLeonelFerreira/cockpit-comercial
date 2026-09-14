;(function initYolenManyChatRuntimeAdmission(root) {
  'use strict'

  const PLATFORM = 'manychat'
  const VALIDATED_PROFILE_SCHEMA_VERSION = 'yolen-manychat-validated-profile-v1'
  const RUNTIME_ADMISSION_SCHEMA_VERSION = 'yolen-manychat-runtime-admission-v1'

  const REQUIRED_SELECTORS = Object.freeze([
    'conversationRoot',
    'messages',
  ])

  const OPTIONAL_SELECTORS = Object.freeze([
    'channel',
    'contact',
    'assignment',
    'composer',
  ])

  const UNSAFE_TRUE_FLAGS = Object.freeze([
    'approved_for_runtime',
    'capture_enabled',
    'persistence_enabled',
    'reasoning_enabled',
    'composer_enabled',
  ])

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  }

  function fail(code, message, path = null) {
    const error = new Error(message)
    error.name = 'YolenManyChatRuntimeAdmissionError'
    error.code = code
    error.path = path
    throw error
  }

  function normalizeSelector(value, path, required) {
    if (value === null || value === undefined || value === '') {
      if (required) {
        fail('REQUIRED_SELECTOR_MISSING', `${path} é obrigatório.`, path)
      }
      return null
    }

    if (typeof value !== 'string' || !value.trim()) {
      fail('INVALID_SELECTOR', `${path} precisa ser string não vazia.`, path)
    }

    return value.trim()
  }

  function assertPositiveInteger(value, path) {
    if (!Number.isInteger(value) || value <= 0) {
      fail('INVALID_VALIDATION_COUNT', `${path} precisa ser inteiro positivo.`, path)
    }
    return value
  }

  function assertValidatedReadOnlyProfile(profile) {
    if (!isObject(profile)) {
      fail('VALIDATED_PROFILE_REQUIRED', 'profile validado é obrigatório.', 'profile')
    }

    if (profile.schema_version !== VALIDATED_PROFILE_SCHEMA_VERSION) {
      fail(
        'UNSUPPORTED_VALIDATED_PROFILE_SCHEMA',
        `profile.schema_version precisa ser ${VALIDATED_PROFILE_SCHEMA_VERSION}.`,
        'profile.schema_version',
      )
    }

    if (profile.platform !== PLATFORM) {
      fail('INVALID_PLATFORM', 'profile não pertence ao ManyChat.', 'profile.platform')
    }

    if (
      typeof profile.source_fingerprint !== 'string' ||
      !profile.source_fingerprint.trim()
    ) {
      fail(
        'SOURCE_FINGERPRINT_REQUIRED',
        'profile.source_fingerprint é obrigatório.',
        'profile.source_fingerprint',
      )
    }

    if (profile.approved_for_readonly_runtime !== true) {
      fail(
        'READONLY_RUNTIME_NOT_APPROVED',
        'profile ainda não foi aprovado para runtime read-only.',
        'profile.approved_for_readonly_runtime',
      )
    }

    for (const flag of UNSAFE_TRUE_FLAGS) {
      if (profile[flag] !== false) {
        fail(
          'UNSAFE_RUNTIME_PROFILE',
          `${flag} precisa permanecer false no runtime read-only.`,
          `profile.${flag}`,
        )
      }
    }

    if (!isObject(profile.selectors)) {
      fail('SELECTORS_REQUIRED', 'profile.selectors é obrigatório.', 'profile.selectors')
    }

    const selectors = {}
    for (const name of REQUIRED_SELECTORS) {
      selectors[name] = normalizeSelector(
        profile.selectors[name],
        `profile.selectors.${name}`,
        true,
      )
    }

    for (const name of OPTIONAL_SELECTORS) {
      selectors[name] = normalizeSelector(
        profile.selectors[name],
        `profile.selectors.${name}`,
        false,
      )
    }

    if (!isObject(profile.validation)) {
      fail('VALIDATION_REQUIRED', 'profile.validation é obrigatório.', 'profile.validation')
    }

    const passCount = assertPositiveInteger(
      profile.validation.pass_count,
      'profile.validation.pass_count',
    )
    const distinctConversationCount = assertPositiveInteger(
      profile.validation.distinct_conversation_count,
      'profile.validation.distinct_conversation_count',
    )
    const minimumPasses = assertPositiveInteger(
      profile.validation.minimum_passes,
      'profile.validation.minimum_passes',
    )
    const minimumDistinctConversations = assertPositiveInteger(
      profile.validation.minimum_distinct_conversations,
      'profile.validation.minimum_distinct_conversations',
    )

    if (passCount < minimumPasses) {
      fail(
        'INSUFFICIENT_VALIDATION_PASSES',
        'profile possui menos PASS do que o mínimo registrado.',
        'profile.validation.pass_count',
      )
    }

    if (distinctConversationCount < minimumDistinctConversations) {
      fail(
        'INSUFFICIENT_DISTINCT_CONVERSATIONS',
        'profile possui menos conversas distintas do que o mínimo registrado.',
        'profile.validation.distinct_conversation_count',
      )
    }

    return Object.freeze({
      profile,
      selectors: Object.freeze(selectors),
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

  function conversationRef(conversationKey) {
    return `mc-runtime-${fnv1a(conversationKey)}`
  }

  function assertSupportedSurface(surface) {
    if (!isObject(surface) || surface.supported !== true) {
      fail('UNSUPPORTED_SURFACE', 'surface ManyChat suportada é obrigatória.', 'surface')
    }

    if (surface.platform !== PLATFORM) {
      fail('INVALID_SURFACE_PLATFORM', 'surface não pertence ao ManyChat.', 'surface.platform')
    }

    if (
      typeof surface.conversation_key !== 'string' ||
      !surface.conversation_key.startsWith('manychat:')
    ) {
      fail(
        'INVALID_CONVERSATION_NAMESPACE',
        'surface.conversation_key precisa permanecer namespaced como manychat.',
        'surface.conversation_key',
      )
    }

    return surface
  }

  function createManyChatReadOnlyRuntimeAdmission(profile, options = {}) {
    const validated = assertValidatedReadOnlyProfile(profile)
    const expectedFingerprint =
      typeof options.expectedFingerprint === 'string'
        ? options.expectedFingerprint.trim()
        : null

    if (
      expectedFingerprint &&
      expectedFingerprint !== profile.source_fingerprint
    ) {
      fail(
        'PROFILE_FINGERPRINT_MISMATCH',
        'Fingerprint validado não corresponde ao fingerprint esperado pelo runtime.',
        'profile.source_fingerprint',
      )
    }

    function admitSurface(surface) {
      const accepted = assertSupportedSurface(surface)

      return Object.freeze({
        schema_version: 'yolen-manychat-runtime-session-v1',
        platform: PLATFORM,
        mode: 'readonly',
        conversation_ref: conversationRef(accepted.conversation_key),
        profile_fingerprint: profile.source_fingerprint,
        dom_read_enabled: true,
        capture_enabled: false,
        persistence_enabled: false,
        reasoning_enabled: false,
        composer_enabled: false,
        network_write_enabled: false,
      })
    }

    function describe() {
      return Object.freeze({
        schema_version: RUNTIME_ADMISSION_SCHEMA_VERSION,
        platform: PLATFORM,
        admitted: true,
        mode: 'readonly',
        profile_fingerprint: profile.source_fingerprint,
        selectors: validated.selectors,
        validation: Object.freeze({ ...profile.validation }),
        capabilities: Object.freeze({
          dom_read: true,
          capture: false,
          persistence: false,
          reasoning: false,
          composer: false,
          network_write: false,
        }),
      })
    }

    return Object.freeze({
      admitSurface,
      describe,
    })
  }

  const api = Object.freeze({
    PLATFORM,
    VALIDATED_PROFILE_SCHEMA_VERSION,
    RUNTIME_ADMISSION_SCHEMA_VERSION,
    REQUIRED_SELECTORS,
    OPTIONAL_SELECTORS,
    assertValidatedReadOnlyProfile,
    assertSupportedSurface,
    createManyChatReadOnlyRuntimeAdmission,
  })

  root.YolenManyChatRuntimeAdmission = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
