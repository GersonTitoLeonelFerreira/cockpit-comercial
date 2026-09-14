;(function initYolenManyChatRuntimeBootstrap(root) {
  'use strict'

  const PLATFORM = 'manychat'
  const BOOTSTRAP_SCHEMA_VERSION = 'yolen-manychat-readonly-bootstrap-v1'

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  }

  function fail(code, message, path = null) {
    const error = new Error(message)
    error.name = 'YolenManyChatRuntimeBootstrapError'
    error.code = code
    error.path = path
    throw error
  }

  function dependency(options, optionName, globalName, methodName) {
    const value = options[optionName] ?? root[globalName]
    if (!value || typeof value[methodName] !== 'function') {
      fail(
        'DEPENDENCY_UNAVAILABLE',
        `${globalName}.${methodName} precisa estar disponível.`,
        optionName,
      )
    }
    return value
  }

  function assertFunction(value, path, required = false) {
    if (value === undefined || value === null) {
      if (required) {
        fail('READER_FUNCTION_REQUIRED', `${path} é obrigatório.`, path)
      }
      return null
    }

    if (typeof value !== 'function') {
      fail('INVALID_READER_FUNCTION', `${path} precisa ser função.`, path)
    }

    return value
  }

  function buildReaderProfile(validatedProfile, readers = {}) {
    const selectors = validatedProfile?.selectors
    if (!isObject(selectors)) {
      fail(
        'SELECTORS_REQUIRED',
        'validatedProfile.selectors é obrigatório.',
        'validatedProfile.selectors',
      )
    }

    return Object.freeze({
      selectors: Object.freeze({
        conversationRoot: selectors.conversationRoot,
        channel: selectors.channel ?? null,
        contact: selectors.contact ?? null,
        assignment: selectors.assignment ?? null,
        messages: selectors.messages,
        composer: selectors.composer ?? null,
      }),
      readChannel: assertFunction(readers.readChannel, 'readers.readChannel'),
      readContact: assertFunction(readers.readContact, 'readers.readContact'),
      readAssignment: assertFunction(
        readers.readAssignment,
        'readers.readAssignment',
      ),
      readMessage: assertFunction(
        readers.readMessage,
        'readers.readMessage',
        true,
      ),
      readComposer: null,
    })
  }

  function immutableCapabilities() {
    return Object.freeze({
      dom_read: true,
      capture: false,
      persistence: false,
      reasoning: false,
      composer: false,
      network_write: false,
    })
  }

  function createManyChatReadOnlyRuntimeBootstrap(
    validatedProfile,
    options = {},
  ) {
    if (!isObject(validatedProfile)) {
      fail(
        'VALIDATED_PROFILE_REQUIRED',
        'validatedProfile é obrigatório.',
        'validatedProfile',
      )
    }

    const admissionApi = dependency(
      options,
      'admissionApi',
      'YolenManyChatRuntimeAdmission',
      'createManyChatReadOnlyRuntimeAdmission',
    )
    const readerApi = dependency(
      options,
      'readerApi',
      'YolenManyChatDomReader',
      'createManyChatDomReader',
    )
    const adapterApi = dependency(
      options,
      'adapterApi',
      'YolenManyChatAdapter',
      'createManyChatAdapter',
    )
    const surfaceApi = dependency(
      options,
      'surfaceApi',
      'YolenManyChatSurface',
      'getCurrentConversationSurface',
    )

    const admission =
      admissionApi.createManyChatReadOnlyRuntimeAdmission(
        validatedProfile,
        { expectedFingerprint: options.expectedFingerprint },
      )
    const readers = isObject(options.readers) ? options.readers : {}
    const readerProfile = buildReaderProfile(validatedProfile, readers)
    const capabilities = immutableCapabilities()
    const now =
      typeof options.now === 'function'
        ? options.now
        : () => new Date().toISOString()

    let started = false
    let stopped = false
    let stopObserver = null
    let currentSession = null
    let lastSnapshot = null
    let lastEvent = null
    let runtimeParts = null

    function getSurface() {
      return surfaceApi.getCurrentConversationSurface()
    }

    function admitCurrentSurface() {
      currentSession = admission.admitSurface(getSurface())
      return currentSession
    }

    function createRuntimeParts() {
      const reader = readerApi.createManyChatDomReader({
        document: options.document ?? root.document ?? null,
        MutationObserver:
          options.MutationObserver ?? root.MutationObserver ?? null,
        profile: readerProfile,
        surfaceProvider: getSurface,
      })

      const adapter = adapterApi.createManyChatAdapter({
        reader,
        now,
      })

      return { reader, adapter }
    }

    function inactiveSnapshot() {
      return Object.freeze({
        schema_version: BOOTSTRAP_SCHEMA_VERSION,
        platform: PLATFORM,
        active: false,
        reason: stopped ? 'stopped' : 'not_started',
        profile_fingerprint:
          validatedProfile.source_fingerprint ?? null,
        conversation_ref: null,
        observed_at: now(),
        evidence_ready: false,
        missing_evidence: Object.freeze([]),
        capabilities,
      })
    }

    function snapshot() {
      if (!started || stopped || !runtimeParts || !currentSession) {
        return inactiveSnapshot()
      }

      const readOnly = runtimeParts.adapter.createReadOnlySnapshot()

      lastSnapshot = Object.freeze({
        schema_version: BOOTSTRAP_SCHEMA_VERSION,
        platform: PLATFORM,
        active: true,
        reason: null,
        profile_fingerprint: currentSession.profile_fingerprint,
        conversation_ref: currentSession.conversation_ref,
        observed_at: now(),
        evidence_ready: readOnly.evidence_ready,
        missing_evidence: Object.freeze(
          Array.from(readOnly.missing_evidence ?? []),
        ),
        channel: readOnly.channel,
        assignment_known: readOnly.assignment?.known === true,
        visible_message_count: Array.isArray(readOnly.messages)
          ? readOnly.messages.length
          : 0,
        capabilities,
      })

      return lastSnapshot
    }

    function emitSafeEvent(type, details = {}) {
      lastEvent = Object.freeze({
        schema_version: 'yolen-manychat-readonly-runtime-event-v1',
        platform: PLATFORM,
        type,
        observed_at: now(),
        profile_fingerprint:
          currentSession?.profile_fingerprint ??
          validatedProfile.source_fingerprint ??
          null,
        conversation_ref: currentSession?.conversation_ref ?? null,
        ...details,
      })

      return lastEvent
    }

    function handleReaderEvent(event) {
      if (!started || stopped || !isObject(event)) return

      if (event.type === 'conversation_changed') {
        try {
          admitCurrentSurface()
          emitSafeEvent('conversation_changed', { admitted: true })
        } catch (error) {
          currentSession = null
          emitSafeEvent('conversation_changed', {
            admitted: false,
            error_code: error?.code ?? 'ADMISSION_FAILED',
          })
        }
        return
      }

      if (event.type === 'conversation_mutated') {
        emitSafeEvent('conversation_mutated', {
          admitted: Boolean(currentSession),
        })
      }
    }

    function start() {
      if (started && !stopped) return snapshot()

      if (stopped) {
        fail(
          'BOOTSTRAP_STOPPED',
          'Bootstrap encerrado não pode ser reiniciado.',
          'bootstrap',
        )
      }

      admitCurrentSurface()
      runtimeParts = createRuntimeParts()
      stopObserver = runtimeParts.reader.observeChanges(handleReaderEvent)
      started = true
      emitSafeEvent('started', { admitted: true })
      return snapshot()
    }

    function stop() {
      if (stopped) return

      if (typeof stopObserver === 'function') stopObserver()
      stopObserver = null
      runtimeParts = null
      currentSession = null
      started = false
      stopped = true
      emitSafeEvent('stopped', { admitted: false })
    }

    function getState() {
      return Object.freeze({
        schema_version: BOOTSTRAP_SCHEMA_VERSION,
        platform: PLATFORM,
        started,
        stopped,
        profile_fingerprint:
          validatedProfile.source_fingerprint ?? null,
        conversation_ref: currentSession?.conversation_ref ?? null,
        last_snapshot: lastSnapshot,
        last_event: lastEvent,
        capabilities,
      })
    }

    return Object.freeze({
      start,
      snapshot,
      stop,
      getState,
    })
  }

  const api = Object.freeze({
    PLATFORM,
    BOOTSTRAP_SCHEMA_VERSION,
    createManyChatReadOnlyRuntimeBootstrap,
  })

  root.YolenManyChatRuntimeBootstrap = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
