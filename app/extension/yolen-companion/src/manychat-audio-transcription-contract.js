;(function initYolenManyChatAudioTranscriptionContract(root) {
  'use strict'

  const PLATFORM = 'manychat'
  const SCHEMA_VERSION = 'yolen-manychat-audio-transcription-contract-v1'
  const TRANSCRIBE_ENDPOINT = '/api/companion/transcribe-audio'
  const CHANNEL_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/

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

  function normalizeChannel(value) {
    const normalized = requiredText(value)?.toLowerCase() || 'unknown'
    return CHANNEL_PATTERN.test(normalized) ? normalized : null
  }

  function normalizeSha256(value) {
    const normalized = requiredText(value)?.toLowerCase() || null
    return normalized && /^[a-f0-9]{64}$/.test(normalized) ? normalized : null
  }

  function normalizePositiveInteger(value) {
    const number = Number(value)
    return Number.isInteger(number) && number > 0 ? number : null
  }

  function cleanBase64(value) {
    const normalized = requiredText(value)
    if (!normalized) return null

    const payload = normalized.includes(',')
      ? normalized.split(',').pop() || ''
      : normalized

    const compact = payload.replace(/\s/g, '')
    return compact || null
  }

  function decodeBase64(value) {
    const compact = cleanBase64(value)
    if (!compact) return null

    try {
      if (typeof root.atob === 'function') {
        const binary = root.atob(compact)
        const bytes = new Uint8Array(binary.length)
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index)
        }
        return bytes
      }

      if (typeof Buffer !== 'undefined') {
        return Uint8Array.from(Buffer.from(compact, 'base64'))
      }
    } catch {
      return null
    }

    return null
  }

  async function sha256Hex(bytes) {
    const subtle = root.crypto?.subtle
    if (!subtle || typeof subtle.digest !== 'function') return null

    try {
      const digest = await subtle.digest('SHA-256', bytes)
      return Array.from(new Uint8Array(digest))
        .map((value) => value.toString(16).padStart(2, '0'))
        .join('')
    } catch {
      return null
    }
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
      channel: 'unknown',
      ready: false,
      reason: null,
      author_kind: 'unknown',
      direction: 'unknown',
      message_key: null,
      occurred_at: null,
      canonical_mime: null,
      audio_digest_bound: false,
      audio_size_bound: false,
      endpoint: TRANSCRIBE_ENDPOINT,
      request_payload: null,
      dispatch_enabled: false,
      production_network_fetch_enabled: false,
      persistence_enabled: false,
      reasoning_enabled: false,
    }
  }

  async function buildManyChatAudioTranscriptionPlan({
    node,
    cycle_id: cycleId,
    audio_base64: audioBase64,
    accessibility_probe: accessibilityProbe,
    audio_index: audioIndex = 0,
    channel: channelValue = 'unknown',
  } = {}) {
    const identity = identityApi().extractManyChatMessageIdentity(node)
    const content = contentApi().extractManyChatMessageContent(node)
    const source = audioSourceApi().extractManyChatAudioSource(node)
    const rawProbe = accessibilityProbe || {}
    const accessibility = accessibilityApi().evaluateManyChatAudioAccessibilityProbe(rawProbe)
    const plan = base()
    const channel = normalizeChannel(channelValue)

    if (!channel) {
      return Object.freeze({
        ...plan,
        reason: 'channel_invalid',
      })
    }

    if (!identity.ready || !identity.native_message_id) {
      return Object.freeze({
        ...plan,
        channel,
        author_kind: identity.author_kind ?? 'unknown',
        direction: identity.direction ?? 'unknown',
        reason: identity.reason ?? 'message_identity_not_ready',
      })
    }

    if (!content.content_ready || content.content_type !== 'audio') {
      return Object.freeze({
        ...plan,
        channel,
        author_kind: identity.author_kind,
        direction: identity.direction,
        reason: content.reason ?? 'audio_content_not_ready',
      })
    }

    if (!source.source_ready || !source.source_url) {
      return Object.freeze({
        ...plan,
        channel,
        author_kind: identity.author_kind,
        direction: identity.direction,
        reason: source.reason ?? 'audio_source_not_ready',
      })
    }

    if (!accessibility.ready || !accessibility.canonical_mime) {
      return Object.freeze({
        ...plan,
        channel,
        author_kind: identity.author_kind,
        direction: identity.direction,
        reason: accessibility.reason ?? 'audio_accessibility_not_ready',
      })
    }

    const normalizedBase64 = cleanBase64(audioBase64)
    const decodedBytes = decodeBase64(normalizedBase64)
    if (!normalizedBase64 || !decodedBytes || decodedBytes.length === 0) {
      return Object.freeze({
        ...plan,
        channel,
        author_kind: identity.author_kind,
        direction: identity.direction,
        reason: 'audio_base64_invalid',
      })
    }

    const probeSize = normalizePositiveInteger(rawProbe.bytes_downloaded)
    if (!probeSize || decodedBytes.length !== probeSize) {
      return Object.freeze({
        ...plan,
        channel,
        author_kind: identity.author_kind,
        direction: identity.direction,
        reason: 'audio_size_mismatch',
      })
    }

    const probeSha256 = normalizeSha256(rawProbe.sha256)
    const computedSha256 = await sha256Hex(decodedBytes)
    if (!computedSha256) {
      return Object.freeze({
        ...plan,
        channel,
        author_kind: identity.author_kind,
        direction: identity.direction,
        audio_size_bound: true,
        reason: 'sha256_unavailable',
      })
    }

    if (!probeSha256 || computedSha256 !== probeSha256) {
      return Object.freeze({
        ...plan,
        channel,
        author_kind: identity.author_kind,
        direction: identity.direction,
        audio_size_bound: true,
        reason: 'audio_digest_mismatch',
      })
    }

    const normalizedCycleId = requiredText(cycleId)
    if (!normalizedCycleId) {
      return Object.freeze({
        ...plan,
        channel,
        author_kind: identity.author_kind,
        direction: identity.direction,
        audio_digest_bound: true,
        audio_size_bound: true,
        reason: 'cycle_id_required',
      })
    }

    const messageKey = buildMessageKey(identity.native_message_id)
    if (!messageKey) {
      return Object.freeze({
        ...plan,
        channel,
        author_kind: identity.author_kind,
        direction: identity.direction,
        audio_digest_bound: true,
        audio_size_bound: true,
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
      channel,
      ready: true,
      reason: null,
      author_kind: identity.author_kind,
      direction: identity.direction,
      message_key: messageKey,
      occurred_at: identity.occurred_at,
      canonical_mime: canonicalMime,
      audio_digest_bound: true,
      audio_size_bound: true,
      request_payload: Object.freeze({
        cycle_id: normalizedCycleId,
        audio_base64: normalizedBase64,
        mime_type: canonicalMime,
        file_name: `manychat-audio.${extension}`,
        audio_index: normalizedAudioIndex,
        audio_target_key: messageKey,
        platform: PLATFORM,
        channel,
      }),
      // O backend já aceita semântica multi-plataforma, mas o fetch real do
      // áudio e o dispatch produtivo do ManyChat continuam fora do runtime.
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
      channel: plan?.channel ?? 'unknown',
      ready: plan?.ready === true,
      reason: plan?.reason ?? null,
      author_kind: plan?.author_kind ?? 'unknown',
      direction: plan?.direction ?? 'unknown',
      message_key_present: typeof plan?.message_key === 'string',
      occurred_at_present: typeof plan?.occurred_at === 'string',
      canonical_mime: plan?.canonical_mime ?? null,
      audio_digest_bound: plan?.audio_digest_bound === true,
      audio_size_bound: plan?.audio_size_bound === true,
      endpoint: plan?.endpoint ?? TRANSCRIBE_ENDPOINT,
      cycle_id_present: Boolean(requiredText(payload?.cycle_id)),
      audio_base64_present: Boolean(requiredText(payload?.audio_base64)),
      audio_target_key_present: Boolean(requiredText(payload?.audio_target_key)),
      request_platform: payload?.platform ?? null,
      request_channel: payload?.channel ?? null,
      dispatch_enabled: plan?.dispatch_enabled === true,
      production_network_fetch_enabled: false,
      persistence_enabled: false,
      reasoning_enabled: false,
      privacy: Object.freeze({
        raw_message_id_exposed: false,
        raw_source_url_exposed: false,
        raw_sha256_exposed: false,
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
