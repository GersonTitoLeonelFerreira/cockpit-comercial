;(function initYolenManyChatAudioTranscriptionContract(root) {
  'use strict'

  const PLATFORM = 'manychat'
  const SCHEMA_VERSION = 'yolen-manychat-audio-transcription-contract-v1'
  const TRANSCRIBE_ENDPOINT = '/api/companion/transcribe-audio'

  function identityApi() {
    const api = root.YolenManyChatMessageIdentity
    if (!api || typeof api.extractManyChatMessageIdentity !== 'function') {
      const error = new Error('YolenManyChatMessageIdentity ausente.')
      error.name = 'YolenManyChatAudioTranscriptionContractError'
      error.code = 'IDENTITY_UNAVAILABLE'
      throw error
    }
    return api
  }

  function contentApi() {
    const api = root.YolenManyChatMessageContent
    if (!api || typeof api.extractManyChatMessageContent !== 'function') {
      const error = new Error('YolenManyChatMessageContent ausente.')
      error.name = 'YolenManyChatAudioTranscriptionContractError'
      error.code = 'CONTENT_UNAVAILABLE'
      throw error
    }
    return api
  }

  function audioSourceApi() {
    const api = root.YolenManyChatAudioSource
    if (!api || typeof api.extractManyChatAudioSource !== 'function') {
      const error = new Error('YolenManyChatAudioSource ausente.')
      error.name = 'YolenManyChatAudioTranscriptionContractError'
      error.code = 'AUDIO_SOURCE_UNAVAILABLE'
      throw error
    }
    return api
  }

  function accessibilityApi() {
    const api = root.YolenManyChatAudioAccessibility
    if (!api || typeof api.evaluateManyChatAudioAccessibilityProbe !== 'function') {
      const error = new Error('YolenManyChatAudioAccessibility ausente.')
      error.name = 'YolenManyChatAudioTranscriptionContractError'
      error.code = 'ACCESSIBILITY_UNAVAILABLE'
      throw error
    }
    return api
  }

  function contractApi() {
    const api = root.YolenUniversalPlatformContract
    if (!api || typeof api.normalizeUniversalConversation !== 'function') {
      const error = new Error('YolenUniversalPlatformContract ausente.')
      error.name = 'YolenManyChatAudioTranscriptionContractError'
      error.code = 'UNIVERSAL_CONTRACT_UNAVAILABLE'
      throw error
    }
    return api
  }

  function requiredText(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null
  }

  function buildMessageKey(nativeMessageId) {
    const value = requiredText(nativeMessageId)
    return value ? `manychat:${encodeURIComponent(value)}` : null
  }

  function extensionForMime(value) {
    const mime = requiredText(value)?.toLowerCase() || ''
    if (mime.includes('ogg') || mime.includes('opus')) return 'ogg'
    if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3'
    if (mime.includes('wav')) return 'wav'
    if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a'
    if (mime.includes('webm')) return 'webm'
    return 'bin'
  }

  function base() {
    return {
      schema_version: SCHEMA_VERSION,
      platform: PLATFORM,
      ready: false,
      reason: null,
      author_kind: 'unknown',
      direction: 'unknown',
      message_key: null,
      occurred_at: null,
      canonical_mime: null,
      endpoint: TRANSCRIBE_ENDPOINT,
      request_payload: null,
      dispatch_enabled: false,
      production_network_fetch_enabled: false,
      persistence_enabled: false,
      reasoning_enabled: false,
    }
  }

  function buildManyChatAudioTranscriptionPlan({
    node,
    cycle_id: cycleId,
    audio_base64: audioBase64,
    accessibility_probe: accessibilityProbe,
    audio_index: audioIndex = 0,
  } = {}) {
    const identity = identityApi().extractManyChatMessageIdentity(node)
    const content = contentApi().extractManyChatMessageContent(node)
    const source = audioSourceApi().extractManyChatAudioSource(node)
    const accessibility = accessibilityApi().evaluateManyChatAudioAccessibilityProbe(
      accessibilityProbe || {},
    )
    const plan = base()

    if (!identity.ready || !identity.native_message_id) {
      return Object.freeze({
        ...plan,
        author_kind: identity.author_kind ?? 'unknown',
        direction: identity.direction ?? 'unknown',
        reason: identity.reason ?? 'message_identity_not_ready',
      })
    }

    if (!content.content_ready || content.content_type !== 'audio') {
      return Object.freeze({
        ...plan,
        author_kind: identity.author_kind,
        direction: identity.direction,
        reason: content.reason ?? 'audio_content_not_ready',
      })
    }

    if (!source.source_ready || !source.source_url) {
      return Object.freeze({
        ...plan,
        author_kind: identity.author_kind,
        direction: identity.direction,
        reason: source.reason ?? 'audio_source_not_ready',
      })
    }

    if (!accessibility.ready || !accessibility.canonical_mime) {
      return Object.freeze({
        ...plan,
        author_kind: identity.author_kind,
        direction: identity.direction,
        reason: accessibility.reason ?? 'audio_accessibility_not_ready',
      })
    }

    const normalizedCycleId = requiredText(cycleId)
    if (!normalizedCycleId) {
      return Object.freeze({
        ...plan,
        author_kind: identity.author_kind,
        direction: identity.direction,
        reason: 'cycle_id_required',
      })
    }

    const normalizedBase64 = requiredText(audioBase64)
    if (!normalizedBase64) {
      return Object.freeze({
        ...plan,
        author_kind: identity.author_kind,
        direction: identity.direction,
        reason: 'audio_base64_required',
      })
    }

    const messageKey = buildMessageKey(identity.native_message_id)
    if (!messageKey) {
      return Object.freeze({
        ...plan,
        author_kind: identity.author_kind,
        direction: identity.direction,
        reason: 'message_key_unavailable',
      })
    }

    const canonicalMime = accessibility.canonical_mime
    const extension = extensionForMime(canonicalMime)
    const normalizedAudioIndex = Number.isFinite(Number(audioIndex))
      ? Math.max(0, Math.floor(Number(audioIndex)))
      : 0

    return Object.freeze({
      ...plan,
      ready: true,
      reason: null,
      author_kind: identity.author_kind,
      direction: identity.direction,
      message_key: messageKey,
      occurred_at: identity.occurred_at,
      canonical_mime: canonicalMime,
      request_payload: Object.freeze({
        cycle_id: normalizedCycleId,
        audio_base64: normalizedBase64,
        mime_type: canonicalMime,
        file_name: `manychat-audio.${extension}`,
        audio_index: normalizedAudioIndex,
        audio_target_key: messageKey,
      }),
      // O endpoint existente ainda persiste eventos com semântica WhatsApp.
      // Portanto este contrato prepara/valida o payload, mas não autoriza o
      // dispatch produtivo do ManyChat até a persistência ser universalizada.
      dispatch_enabled: false,
      production_network_fetch_enabled: false,
      persistence_enabled: false,
      reasoning_enabled: false,
    })
  }

  function normalizeTranscriptionText(response) {
    if (!response || typeof response !== 'object' || Array.isArray(response)) {
      return null
    }

    if (response.ok !== true) return null

    const data = response.data
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null

    return requiredText(data.text)
  }

  function applyManyChatAudioTranscriptionResult({
    node,
    transcription_response: transcriptionResponse,
  } = {}) {
    const identity = identityApi().extractManyChatMessageIdentity(node)
    const content = contentApi().extractManyChatMessageContent(node)
    const resultBase = {
      schema_version: 'yolen-manychat-audio-transcription-result-v1',
      platform: PLATFORM,
      ready: false,
      reason: null,
      author_kind: identity.author_kind ?? 'unknown',
      customer_evidence_eligible: identity.author_kind === 'customer',
      seller_action_eligible: identity.author_kind === 'human_agent',
      reasoning_evidence_eligible:
        identity.author_kind === 'customer' ||
        identity.author_kind === 'human_agent',
      normalized_message: null,
      persistence_enabled: false,
      reasoning_enabled: false,
    }

    if (!identity.ready || !identity.native_message_id) {
      return Object.freeze({
        ...resultBase,
        reason: identity.reason ?? 'message_identity_not_ready',
      })
    }

    if (!content.content_ready || content.content_type !== 'audio') {
      return Object.freeze({
        ...resultBase,
        reason: content.reason ?? 'audio_content_not_ready',
      })
    }

    const text = normalizeTranscriptionText(transcriptionResponse)
    if (!text) {
      return Object.freeze({
        ...resultBase,
        reason: 'transcription_response_invalid',
      })
    }

    const messageKey = buildMessageKey(identity.native_message_id)
    if (!messageKey) {
      return Object.freeze({
        ...resultBase,
        reason: 'message_key_unavailable',
      })
    }

    try {
      const normalizedConversation = contractApi().normalizeUniversalConversation({
        contract_version: contractApi().CONTRACT_VERSION,
        platform: PLATFORM,
        channel: 'unknown',
        external_conversation_id: null,
        conversation_key: 'manychat:unknown:transcription-contract-validation',
        contact: {
          name: null,
          phone: null,
          external_contact_id: null,
        },
        assignment: {
          assigned: false,
          agent_id: null,
          agent_name: null,
        },
        observed_at: identity.occurred_at,
        messages: [
          {
            message_key: messageKey,
            direction: identity.direction,
            occurred_at: identity.occurred_at,
            content_type: 'audio',
            text_content: null,
            audio_transcription: text,
            is_deleted: false,
            deletion_reason: null,
          },
        ],
      })

      return Object.freeze({
        ...resultBase,
        ready: true,
        reason: null,
        normalized_message: Object.freeze(normalizedConversation.messages[0]),
      })
    } catch {
      return Object.freeze({
        ...resultBase,
        reason: 'universal_contract_rejected_transcription',
      })
    }
  }

  function safeManyChatAudioTranscriptionPlanView(plan) {
    const payload = plan?.request_payload

    return Object.freeze({
      schema_version: plan?.schema_version ?? SCHEMA_VERSION,
      platform: plan?.platform ?? PLATFORM,
      ready: plan?.ready === true,
      reason: plan?.reason ?? null,
      author_kind: plan?.author_kind ?? 'unknown',
      direction: plan?.direction ?? 'unknown',
      message_key_present: typeof plan?.message_key === 'string',
      occurred_at_present: typeof plan?.occurred_at === 'string',
      canonical_mime: plan?.canonical_mime ?? null,
      endpoint: plan?.endpoint ?? TRANSCRIBE_ENDPOINT,
      cycle_id_present: Boolean(requiredText(payload?.cycle_id)),
      audio_base64_present: Boolean(requiredText(payload?.audio_base64)),
      audio_target_key_present: Boolean(requiredText(payload?.audio_target_key)),
      dispatch_enabled: plan?.dispatch_enabled === true,
      production_network_fetch_enabled: false,
      persistence_enabled: false,
      reasoning_enabled: false,
      privacy: Object.freeze({
        raw_message_id_exposed: false,
        raw_source_url_exposed: false,
        audio_base64_exposed: false,
        transcription_text_exposed: false,
        network_sent: false,
        persisted: false,
      }),
    })
  }

  const api = Object.freeze({
    PLATFORM,
    SCHEMA_VERSION,
    TRANSCRIBE_ENDPOINT,
    buildMessageKey,
    buildManyChatAudioTranscriptionPlan,
    applyManyChatAudioTranscriptionResult,
    safeManyChatAudioTranscriptionPlanView,
  })

  root.YolenManyChatAudioTranscriptionContract = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
