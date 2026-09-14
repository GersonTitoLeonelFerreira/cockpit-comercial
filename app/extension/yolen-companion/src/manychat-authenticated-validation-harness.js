;(function initYolenManyChatAuthenticatedValidationHarness(root) {
  'use strict'

  const PLATFORM = 'manychat'
  const HARNESS_SCHEMA_VERSION = 'yolen-manychat-authenticated-validation-harness-v1'
  const SAFE_EVIDENCE_SCHEMA_VERSION = 'yolen-manychat-safe-evidence-view-v1'

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  }

  function fail(code, message, path = null) {
    const error = new Error(message)
    error.name = 'YolenManyChatAuthenticatedValidationHarnessError'
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

  function fnv1a(value) {
    let hash = 0x811c9dc5
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index)
      hash = Math.imul(hash, 0x01000193) >>> 0
    }
    return hash.toString(16).padStart(8, '0')
  }

  function safeConversationRef(surface) {
    const key = surface?.conversation_key
    if (typeof key !== 'string' || !key) return null
    return `mc-auth-${fnv1a(key)}`
  }

  function safeEvidenceView(snapshot) {
    if (!isObject(snapshot)) return null

    return Object.freeze({
      schema_version: SAFE_EVIDENCE_SCHEMA_VERSION,
      source_schema_version: snapshot.schema_version ?? null,
      platform: PLATFORM,
      supported: snapshot.supported === true,
      reason: snapshot.reason ?? null,
      observed_at: snapshot.observed_at ?? null,
      surface: Object.freeze({
        supported: snapshot.surface?.supported === true,
        platform: snapshot.surface?.platform ?? null,
        channel: snapshot.surface?.channel ?? null,
        conversation_ref: safeConversationRef(snapshot.surface),
      }),
      summary: isObject(snapshot.summary)
        ? Object.freeze({ ...snapshot.summary })
        : null,
      candidates: Object.freeze(
        Array.isArray(snapshot.candidates)
          ? snapshot.candidates.slice()
          : [],
      ),
      privacy: Object.freeze({
        text_content_collected: false,
        input_values_collected: false,
        network_sent: false,
        persisted: false,
        raw_conversation_identity_exposed: false,
      }),
    })
  }

  function safeValidationState(state) {
    if (!isObject(state)) return null

    return Object.freeze({
      schema_version: state.schema_version ?? null,
      platform: state.platform ?? PLATFORM,
      fingerprint: state.fingerprint ?? null,
      ready: state.ready === true,
      pass_count: state.pass_count ?? 0,
      failure_count: state.failure_count ?? 0,
      distinct_conversation_count: state.distinct_conversation_count ?? 0,
      minimum_passes: state.minimum_passes ?? null,
      minimum_distinct_conversations:
        state.minimum_distinct_conversations ?? null,
      observations: Object.freeze(
        Array.isArray(state.observations)
          ? state.observations.slice()
          : [],
      ),
    })
  }

  function createManyChatAuthenticatedValidationHarness(options = {}) {
    const surfaceApi = dependency(
      options,
      'surfaceApi',
      'YolenManyChatSurface',
      'getCurrentConversationSurface',
    )
    const evidenceApi = dependency(
      options,
      'evidenceApi',
      'YolenManyChatEvidenceProbe',
      'createManyChatEvidenceProbe',
    )
    const gateApi = dependency(
      options,
      'gateApi',
      'YolenManyChatProfileGate',
      'buildEvidenceBoundProfileCandidate',
    )
    const validatorApi = dependency(
      options,
      'validatorApi',
      'YolenManyChatProfileValidator',
      'createReadOnlyProfileValidationSession',
    )

    const documentRef = options.document ?? root.document ?? null
    const now =
      typeof options.now === 'function'
        ? options.now
        : () => new Date().toISOString()

    const probe = evidenceApi.createManyChatEvidenceProbe({
      document: documentRef,
      surfaceApi,
      now,
      maxCandidates: options.maxCandidates,
    })

    let evidenceSnapshot = null
    let profileCandidate = null
    let validationSession = null
    let validatedProfile = null

    function collectEvidence(value) {
      const snapshot = probe.run(value)
      evidenceSnapshot = snapshot
      profileCandidate = null
      validationSession = null
      validatedProfile = null
      return safeEvidenceView(snapshot)
    }

    function getEvidence() {
      return safeEvidenceView(evidenceSnapshot)
    }

    function buildCandidate(mapping) {
      if (!evidenceSnapshot) {
        fail(
          'EVIDENCE_REQUIRED',
          'Colete evidência antes de montar o profile candidate.',
          'evidence',
        )
      }

      profileCandidate = gateApi.buildEvidenceBoundProfileCandidate(
        evidenceSnapshot,
        mapping,
      )
      validationSession = null
      validatedProfile = null
      return profileCandidate
    }

    function beginValidation(validationOptions = {}) {
      if (!profileCandidate) {
        fail(
          'PROFILE_CANDIDATE_REQUIRED',
          'Monte o profile candidate antes de iniciar a validação.',
          'candidate',
        )
      }

      validationSession =
        validatorApi.createReadOnlyProfileValidationSession(
          profileCandidate,
          validationOptions,
        )
      validatedProfile = null
      return safeValidationState(validationSession.getState())
    }

    function observeCurrentConversation() {
      if (!validationSession) {
        fail(
          'VALIDATION_SESSION_REQUIRED',
          'Inicie a sessão de validação antes de observar o DOM autenticado.',
          'validation',
        )
      }

      return validationSession.observe({
        document: documentRef,
        surfaceProvider: () => surfaceApi.getCurrentConversationSurface(),
        now,
      })
    }

    function getValidationState() {
      return validationSession
        ? safeValidationState(validationSession.getState())
        : null
    }

    function finalizeValidatedProfile() {
      if (!validationSession) {
        fail(
          'VALIDATION_SESSION_REQUIRED',
          'Inicie e execute a validação antes de finalizar o profile.',
          'validation',
        )
      }

      const result = validationSession.buildValidatedReadOnlyProfile()
      validatedProfile = result.ready === true ? result.profile : null

      return Object.freeze({
        ready: result.ready === true,
        reason: result.reason ?? null,
        state: safeValidationState(result.state),
        profile: validatedProfile,
      })
    }

    function exportSafeReport() {
      return Object.freeze({
        schema_version: HARNESS_SCHEMA_VERSION,
        platform: PLATFORM,
        observed_at: now(),
        evidence: safeEvidenceView(evidenceSnapshot),
        candidate: profileCandidate
          ? Object.freeze({
              schema_version: profileCandidate.schema_version,
              platform: profileCandidate.platform,
              fingerprint: profileCandidate.fingerprint,
              selectors: Object.freeze({ ...profileCandidate.selectors }),
              approved_for_runtime: false,
              capture_enabled: false,
              persistence_enabled: false,
              reasoning_enabled: false,
            })
          : null,
        validation: getValidationState(),
        validated_profile: validatedProfile,
        privacy: Object.freeze({
          text_content_collected: false,
          input_values_collected: false,
          network_sent: false,
          persisted: false,
          raw_conversation_identity_exposed: false,
        }),
      })
    }

    function reset() {
      evidenceSnapshot = null
      profileCandidate = null
      validationSession = null
      validatedProfile = null
    }

    return Object.freeze({
      collectEvidence,
      getEvidence,
      buildCandidate,
      beginValidation,
      observeCurrentConversation,
      getValidationState,
      finalizeValidatedProfile,
      exportSafeReport,
      reset,
    })
  }

  const api = Object.freeze({
    PLATFORM,
    HARNESS_SCHEMA_VERSION,
    SAFE_EVIDENCE_SCHEMA_VERSION,
    createManyChatAuthenticatedValidationHarness,
    safeEvidenceView,
  })

  root.YolenManyChatAuthenticatedValidationHarness = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
