;(function initYolenManyChatAuthenticatedEvidenceArtifact(root) {
  'use strict'

  const PLATFORM = 'manychat'
  const REPORT_SCHEMA_VERSION =
    'yolen-manychat-authenticated-validation-harness-v1'
  const VALIDATED_PROFILE_SCHEMA_VERSION =
    'yolen-manychat-validated-profile-v1'
  const ARTIFACT_SCHEMA_VERSION =
    'yolen-manychat-authenticated-evidence-artifact-v1'

  const FORBIDDEN_KEYS = Object.freeze(
    new Set([
      'conversation_key',
      'external_conversation_id',
      'text_content',
      'audio_transcription',
      'input_value',
      'raw_text',
      'message_text',
    ]),
  )

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  }

  function fail(code, message, path = null) {
    const error = new Error(message)
    error.name = 'YolenManyChatAuthenticatedEvidenceArtifactError'
    error.code = code
    error.path = path
    throw error
  }

  function assertObject(value, code, message, path) {
    if (!isObject(value)) fail(code, message, path)
    return value
  }

  function assertFalse(value, path) {
    if (value !== false) {
      fail('UNSAFE_PRIVACY_FLAG', `${path} precisa permanecer false.`, path)
    }
  }

  function assertPositiveInteger(value, path) {
    if (!Number.isInteger(value) || value <= 0) {
      fail('INVALID_VALIDATION_COUNT', `${path} precisa ser inteiro positivo.`, path)
    }
    return value
  }

  function assertNonNegativeInteger(value, path) {
    if (!Number.isInteger(value) || value < 0) {
      fail(
        'INVALID_VALIDATION_COUNT',
        `${path} precisa ser inteiro não negativo.`,
        path,
      )
    }
    return value
  }

  function assertNoForbiddenKeys(value, path = 'report') {
    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        assertNoForbiddenKeys(item, `${path}[${index}]`),
      )
      return
    }

    if (!isObject(value)) return

    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key)) {
        fail(
          'RAW_IDENTITY_OR_CONTENT_EXPOSED',
          `${path}.${key} não pode existir no relatório seguro.`,
          `${path}.${key}`,
        )
      }
      assertNoForbiddenKeys(child, `${path}.${key}`)
    }
  }

  function canonicalize(value) {
    if (Array.isArray(value)) {
      return `[${value.map((item) => canonicalize(item)).join(',')}]`
    }

    if (isObject(value)) {
      const keys = Object.keys(value).sort()
      return `{${keys
        .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
        .join(',')}}`
    }

    return JSON.stringify(value)
  }

  function fnv1a(value) {
    let hash = 0x811c9dc5
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index)
      hash = Math.imul(hash, 0x01000193) >>> 0
    }
    return hash.toString(16).padStart(8, '0')
  }

  function artifactFingerprint(payload) {
    return `mc-evidence-${fnv1a(canonicalize(payload))}`
  }

  function assertPrivacy(report) {
    const privacy = assertObject(
      report.privacy,
      'PRIVACY_BLOCK_REQUIRED',
      'report.privacy é obrigatório.',
      'report.privacy',
    )

    assertFalse(privacy.text_content_collected, 'report.privacy.text_content_collected')
    assertFalse(privacy.input_values_collected, 'report.privacy.input_values_collected')
    assertFalse(privacy.network_sent, 'report.privacy.network_sent')
    assertFalse(privacy.persisted, 'report.privacy.persisted')
    assertFalse(
      privacy.raw_conversation_identity_exposed,
      'report.privacy.raw_conversation_identity_exposed',
    )

    return privacy
  }

  function assertEvidence(report) {
    const evidence = assertObject(
      report.evidence,
      'EVIDENCE_REQUIRED',
      'report.evidence é obrigatório.',
      'report.evidence',
    )

    if (evidence.platform !== PLATFORM || evidence.supported !== true) {
      fail(
        'UNSUPPORTED_AUTHENTICATED_EVIDENCE',
        'A evidência precisa pertencer ao ManyChat e estar suportada.',
        'report.evidence',
      )
    }

    const surface = assertObject(
      evidence.surface,
      'EVIDENCE_SURFACE_REQUIRED',
      'report.evidence.surface é obrigatório.',
      'report.evidence.surface',
    )

    if (
      surface.supported !== true ||
      surface.platform !== PLATFORM ||
      typeof surface.conversation_ref !== 'string' ||
      !surface.conversation_ref.startsWith('mc-auth-')
    ) {
      fail(
        'INVALID_SAFE_SURFACE',
        'A surface segura precisa usar referência anonimizada mc-auth-.',
        'report.evidence.surface',
      )
    }

    return evidence
  }

  function assertCandidate(report) {
    const candidate = assertObject(
      report.candidate,
      'PROFILE_CANDIDATE_REQUIRED',
      'report.candidate é obrigatório.',
      'report.candidate',
    )

    if (candidate.platform !== PLATFORM) {
      fail('INVALID_PLATFORM', 'candidate não pertence ao ManyChat.', 'report.candidate.platform')
    }

    if (typeof candidate.fingerprint !== 'string' || !candidate.fingerprint.trim()) {
      fail(
        'PROFILE_FINGERPRINT_REQUIRED',
        'candidate.fingerprint é obrigatório.',
        'report.candidate.fingerprint',
      )
    }

    const selectors = assertObject(
      candidate.selectors,
      'SELECTORS_REQUIRED',
      'candidate.selectors é obrigatório.',
      'report.candidate.selectors',
    )

    for (const name of ['conversationRoot', 'messages']) {
      if (typeof selectors[name] !== 'string' || !selectors[name].trim()) {
        fail(
          'REQUIRED_SELECTOR_MISSING',
          `candidate.selectors.${name} é obrigatório.`,
          `report.candidate.selectors.${name}`,
        )
      }
    }

    for (const flag of [
      'approved_for_runtime',
      'capture_enabled',
      'persistence_enabled',
      'reasoning_enabled',
    ]) {
      if (candidate[flag] !== false) {
        fail(
          'UNSAFE_PROFILE_CANDIDATE',
          `candidate.${flag} precisa permanecer false.`,
          `report.candidate.${flag}`,
        )
      }
    }

    return candidate
  }

  function assertValidation(report) {
    const validation = assertObject(
      report.validation,
      'VALIDATION_REQUIRED',
      'report.validation é obrigatório.',
      'report.validation',
    )

    if (validation.platform !== PLATFORM || validation.ready !== true) {
      fail(
        'VALIDATION_NOT_READY',
        'A validação autenticada ainda não está pronta.',
        'report.validation',
      )
    }

    const passCount = assertPositiveInteger(
      validation.pass_count,
      'report.validation.pass_count',
    )
    const failureCount = assertNonNegativeInteger(
      validation.failure_count,
      'report.validation.failure_count',
    )
    const distinctConversationCount = assertPositiveInteger(
      validation.distinct_conversation_count,
      'report.validation.distinct_conversation_count',
    )
    const minimumPasses = assertPositiveInteger(
      validation.minimum_passes,
      'report.validation.minimum_passes',
    )
    const minimumDistinctConversations = assertPositiveInteger(
      validation.minimum_distinct_conversations,
      'report.validation.minimum_distinct_conversations',
    )

    if (failureCount !== 0) {
      fail(
        'VALIDATION_HAS_FAILURES',
        'A validação autenticada não pode conter falhas.',
        'report.validation.failure_count',
      )
    }

    if (passCount < minimumPasses) {
      fail(
        'INSUFFICIENT_VALIDATION_PASSES',
        'A validação possui menos PASS do que o mínimo.',
        'report.validation.pass_count',
      )
    }

    if (distinctConversationCount < minimumDistinctConversations) {
      fail(
        'INSUFFICIENT_DISTINCT_CONVERSATIONS',
        'A validação não cobriu conversas distintas suficientes.',
        'report.validation.distinct_conversation_count',
      )
    }

    const observations = Array.isArray(validation.observations)
      ? validation.observations
      : []

    if (observations.length < passCount) {
      fail(
        'OBSERVATIONS_INCOMPLETE',
        'O relatório não contém observações suficientes para o pass_count declarado.',
        'report.validation.observations',
      )
    }

    const distinctRefs = new Set()
    for (let index = 0; index < observations.length; index += 1) {
      const item = observations[index]
      if (!isObject(item) || item.pass !== true || item.platform !== PLATFORM) {
        fail(
          'INVALID_VALIDATION_OBSERVATION',
          `Observação ${index} precisa ser PASS do ManyChat.`,
          `report.validation.observations[${index}]`,
        )
      }

      if (
        typeof item.conversation_ref !== 'string' ||
        !item.conversation_ref.startsWith('mc-conv-')
      ) {
        fail(
          'UNSAFE_CONVERSATION_REFERENCE',
          `Observação ${index} precisa usar conversation_ref anonimizada.`,
          `report.validation.observations[${index}].conversation_ref`,
        )
      }
      distinctRefs.add(item.conversation_ref)
    }

    if (distinctRefs.size < distinctConversationCount) {
      fail(
        'DISTINCT_CONVERSATION_COUNT_MISMATCH',
        'distinct_conversation_count excede as referências distintas observadas.',
        'report.validation.distinct_conversation_count',
      )
    }

    return validation
  }

  function assertValidatedProfile(report, candidate, validation) {
    const profile = assertObject(
      report.validated_profile,
      'VALIDATED_PROFILE_REQUIRED',
      'report.validated_profile é obrigatório.',
      'report.validated_profile',
    )

    if (
      profile.schema_version !== VALIDATED_PROFILE_SCHEMA_VERSION ||
      profile.platform !== PLATFORM
    ) {
      fail(
        'INVALID_VALIDATED_PROFILE',
        'validated_profile não corresponde ao contrato ManyChat esperado.',
        'report.validated_profile',
      )
    }

    if (profile.source_fingerprint !== candidate.fingerprint) {
      fail(
        'PROFILE_FINGERPRINT_MISMATCH',
        'validated_profile não corresponde ao candidate validado.',
        'report.validated_profile.source_fingerprint',
      )
    }

    if (canonicalize(profile.selectors) !== canonicalize(candidate.selectors)) {
      fail(
        'PROFILE_SELECTOR_MISMATCH',
        'validated_profile alterou seletores após a validação.',
        'report.validated_profile.selectors',
      )
    }

    if (profile.approved_for_readonly_runtime !== true) {
      fail(
        'READONLY_RUNTIME_NOT_APPROVED',
        'validated_profile precisa estar aprovado somente para runtime read-only.',
        'report.validated_profile.approved_for_readonly_runtime',
      )
    }

    for (const flag of [
      'approved_for_runtime',
      'capture_enabled',
      'persistence_enabled',
      'reasoning_enabled',
      'composer_enabled',
    ]) {
      if (profile[flag] !== false) {
        fail(
          'UNSAFE_VALIDATED_PROFILE',
          `validated_profile.${flag} precisa permanecer false.`,
          `report.validated_profile.${flag}`,
        )
      }
    }

    const profileValidation = assertObject(
      profile.validation,
      'PROFILE_VALIDATION_REQUIRED',
      'validated_profile.validation é obrigatório.',
      'report.validated_profile.validation',
    )

    if (
      profileValidation.pass_count !== validation.pass_count ||
      profileValidation.distinct_conversation_count !==
        validation.distinct_conversation_count ||
      profileValidation.minimum_passes !== validation.minimum_passes ||
      profileValidation.minimum_distinct_conversations !==
        validation.minimum_distinct_conversations
    ) {
      fail(
        'PROFILE_VALIDATION_MISMATCH',
        'validated_profile não preservou o resumo da validação autenticada.',
        'report.validated_profile.validation',
      )
    }

    return profile
  }

  function verifyAuthenticatedEvidenceReport(report, options = {}) {
    assertObject(
      report,
      'REPORT_REQUIRED',
      'Relatório autenticado é obrigatório.',
      'report',
    )

    if (report.schema_version !== REPORT_SCHEMA_VERSION) {
      fail(
        'UNSUPPORTED_REPORT_SCHEMA',
        `report.schema_version precisa ser ${REPORT_SCHEMA_VERSION}.`,
        'report.schema_version',
      )
    }

    if (report.platform !== PLATFORM) {
      fail('INVALID_PLATFORM', 'report não pertence ao ManyChat.', 'report.platform')
    }

    assertNoForbiddenKeys(report)
    assertPrivacy(report)
    assertEvidence(report)
    const candidate = assertCandidate(report)
    const validation = assertValidation(report)
    const profile = assertValidatedProfile(report, candidate, validation)

    const expectedFingerprint =
      typeof options.expectedProfileFingerprint === 'string'
        ? options.expectedProfileFingerprint.trim()
        : null

    if (expectedFingerprint && expectedFingerprint !== candidate.fingerprint) {
      fail(
        'EXPECTED_PROFILE_FINGERPRINT_MISMATCH',
        'O fingerprint do report não corresponde ao fingerprint esperado.',
        'report.candidate.fingerprint',
      )
    }

    const payload = Object.freeze({
      platform: PLATFORM,
      profile_fingerprint: candidate.fingerprint,
      selectors: Object.freeze({ ...profile.selectors }),
      validation: Object.freeze({
        pass_count: validation.pass_count,
        failure_count: validation.failure_count,
        distinct_conversation_count: validation.distinct_conversation_count,
        minimum_passes: validation.minimum_passes,
        minimum_distinct_conversations:
          validation.minimum_distinct_conversations,
      }),
    })

    return Object.freeze({
      schema_version: ARTIFACT_SCHEMA_VERSION,
      platform: PLATFORM,
      verified: true,
      artifact_fingerprint: artifactFingerprint(payload),
      profile_fingerprint: candidate.fingerprint,
      selectors: payload.selectors,
      validation: payload.validation,
      eligibility: Object.freeze({
        semantic_validation: true,
        readonly_runtime: true,
        manifest_injection: false,
        capture: false,
        persistence: false,
        reasoning: false,
        composer: false,
        network_write: false,
      }),
      privacy: Object.freeze({
        text_content_collected: false,
        input_values_collected: false,
        network_sent: false,
        persisted: false,
        raw_conversation_identity_exposed: false,
      }),
    })
  }

  const api = Object.freeze({
    PLATFORM,
    REPORT_SCHEMA_VERSION,
    VALIDATED_PROFILE_SCHEMA_VERSION,
    ARTIFACT_SCHEMA_VERSION,
    FORBIDDEN_KEYS,
    verifyAuthenticatedEvidenceReport,
    canonicalize,
  })

  root.YolenManyChatAuthenticatedEvidenceArtifact = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
