;(function initYolenManyChatAudioBackgroundTransport(root) {
  'use strict'

  const PLATFORM = 'manychat'
  const SCHEMA_VERSION = 'yolen-manychat-audio-background-transport-v1'
  const ALLOWED_AUDIO_HOST = 'manybot-files.manychat.io'
  const MAX_AUDIO_BYTES = 15 * 1024 * 1024
  const CHANNEL_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/

  function requiredText(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null
  }

  function normalizeChannel(value) {
    const normalized = requiredText(value)?.toLowerCase() || 'unknown'
    return CHANNEL_PATTERN.test(normalized) ? normalized : null
  }

  function normalizeAudioTargetKey(value) {
    const normalized = requiredText(value)
    return normalized && normalized.startsWith('manychat:')
      ? normalized.slice(0, 500)
      : null
  }

  function validateManyChatAudioUrl(value) {
    const raw = requiredText(value)
    if (!raw) {
      return Object.freeze({
        valid: false,
        reason: 'audio_url_required',
        url: null,
      })
    }

    try {
      const parsed = new URL(raw)
      const valid =
        parsed.protocol === 'https:' &&
        parsed.hostname === ALLOWED_AUDIO_HOST &&
        parsed.username === '' &&
        parsed.password === ''

      return Object.freeze({
        valid,
        reason: valid ? null : 'audio_url_not_allowed',
        url: valid ? parsed.toString() : null,
      })
    } catch {
      return Object.freeze({
        valid: false,
        reason: 'audio_url_invalid',
        url: null,
      })
    }
  }

  function normalizeMime(value) {
    const mime = requiredText(value)?.split(';')[0]?.trim().toLowerCase() || null
    return mime && mime.startsWith('audio/') ? mime : null
  }

  function extensionForMime(value) {
    const mime = normalizeMime(value) || ''
    if (mime.includes('ogg') || mime.includes('opus')) return 'ogg'
    if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3'
    if (mime.includes('wav')) return 'wav'
    if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a'
    if (mime.includes('webm')) return 'webm'
    return 'bin'
  }

  function bytesToBase64(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length === 0) return null

    if (typeof root.btoa === 'function') {
      let binary = ''
      const chunkSize = 0x8000
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        const chunk = bytes.subarray(offset, offset + chunkSize)
        binary += String.fromCharCode(...chunk)
      }
      return root.btoa(binary)
    }

    if (typeof Buffer !== 'undefined') {
      return Buffer.from(bytes).toString('base64')
    }

    return null
  }

  async function sha256Hex(bytes, cryptoImpl = root.crypto) {
    if (
      !(bytes instanceof Uint8Array) ||
      !cryptoImpl?.subtle ||
      typeof cryptoImpl.subtle.digest !== 'function'
    ) {
      return null
    }

    const digest = await cryptoImpl.subtle.digest(
      'SHA-256',
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    )

    return Array.from(new Uint8Array(digest))
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
  }

  async function fetchManyChatAudio({
    url,
    fetchImpl = root.fetch,
    cryptoImpl = root.crypto,
    maxBytes = MAX_AUDIO_BYTES,
  } = {}) {
    const validated = validateManyChatAudioUrl(url)

    if (!validated.valid) {
      return Object.freeze({
        schema_version: SCHEMA_VERSION,
        platform: PLATFORM,
        ready: false,
        reason: validated.reason,
        audio_base64: null,
        mime_type: null,
        size_bytes: 0,
        sha256: null,
      })
    }

    if (typeof fetchImpl !== 'function') {
      return Object.freeze({
        schema_version: SCHEMA_VERSION,
        platform: PLATFORM,
        ready: false,
        reason: 'fetch_unavailable',
        audio_base64: null,
        mime_type: null,
        size_bytes: 0,
        sha256: null,
      })
    }

    try {
      const response = await fetchImpl(validated.url, {
        method: 'GET',
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'follow',
      })

      if (!response || response.ok !== true) {
        return Object.freeze({
          schema_version: SCHEMA_VERSION,
          platform: PLATFORM,
          ready: false,
          reason: 'audio_fetch_failed',
          status: Number(response?.status) || 0,
          audio_base64: null,
          mime_type: null,
          size_bytes: 0,
          sha256: null,
        })
      }

      const finalUrl = validateManyChatAudioUrl(response.url || validated.url)
      if (!finalUrl.valid) {
        return Object.freeze({
          schema_version: SCHEMA_VERSION,
          platform: PLATFORM,
          ready: false,
          reason: 'audio_redirect_not_allowed',
          status: Number(response.status) || 0,
          audio_base64: null,
          mime_type: null,
          size_bytes: 0,
          sha256: null,
        })
      }

      const mimeType = normalizeMime(response.headers?.get?.('content-type'))
      if (!mimeType) {
        return Object.freeze({
          schema_version: SCHEMA_VERSION,
          platform: PLATFORM,
          ready: false,
          reason: 'audio_content_type_invalid',
          status: Number(response.status) || 0,
          audio_base64: null,
          mime_type: null,
          size_bytes: 0,
          sha256: null,
        })
      }

      const declaredLength = Number(response.headers?.get?.('content-length'))
      if (
        Number.isFinite(declaredLength) &&
        declaredLength > maxBytes
      ) {
        return Object.freeze({
          schema_version: SCHEMA_VERSION,
          platform: PLATFORM,
          ready: false,
          reason: 'audio_too_large',
          status: Number(response.status) || 0,
          audio_base64: null,
          mime_type: mimeType,
          size_bytes: 0,
          sha256: null,
        })
      }

      const buffer = await response.arrayBuffer()
      const bytes = new Uint8Array(buffer)

      if (bytes.length === 0) {
        return Object.freeze({
          schema_version: SCHEMA_VERSION,
          platform: PLATFORM,
          ready: false,
          reason: 'audio_empty',
          status: Number(response.status) || 0,
          audio_base64: null,
          mime_type: mimeType,
          size_bytes: 0,
          sha256: null,
        })
      }

      if (bytes.length > maxBytes) {
        return Object.freeze({
          schema_version: SCHEMA_VERSION,
          platform: PLATFORM,
          ready: false,
          reason: 'audio_too_large',
          status: Number(response.status) || 0,
          audio_base64: null,
          mime_type: mimeType,
          size_bytes: bytes.length,
          sha256: null,
        })
      }

      const [audioBase64, digest] = await Promise.all([
        Promise.resolve(bytesToBase64(bytes)),
        sha256Hex(bytes, cryptoImpl),
      ])

      if (!audioBase64 || !digest) {
        return Object.freeze({
          schema_version: SCHEMA_VERSION,
          platform: PLATFORM,
          ready: false,
          reason: 'audio_encoding_failed',
          status: Number(response.status) || 0,
          audio_base64: null,
          mime_type: mimeType,
          size_bytes: bytes.length,
          sha256: null,
        })
      }

      return Object.freeze({
        schema_version: SCHEMA_VERSION,
        platform: PLATFORM,
        ready: true,
        reason: null,
        status: Number(response.status) || 0,
        audio_base64: audioBase64,
        mime_type: mimeType,
        size_bytes: bytes.length,
        sha256: digest,
      })
    } catch {
      return Object.freeze({
        schema_version: SCHEMA_VERSION,
        platform: PLATFORM,
        ready: false,
        reason: 'audio_fetch_exception',
        status: 0,
        audio_base64: null,
        mime_type: null,
        size_bytes: 0,
        sha256: null,
      })
    }
  }

  function buildTranscriptionPayload({
    cycle_id: cycleId,
    audio_target_key: audioTargetKey,
    channel,
    audio_index: audioIndex = 0,
    media,
  } = {}) {
    const normalizedCycleId = requiredText(cycleId)
    const normalizedTargetKey = normalizeAudioTargetKey(audioTargetKey)
    const normalizedChannel = normalizeChannel(channel)

    if (!normalizedCycleId) {
      return Object.freeze({ ready: false, reason: 'cycle_id_required', payload: null })
    }

    if (!normalizedTargetKey) {
      return Object.freeze({ ready: false, reason: 'audio_target_key_invalid', payload: null })
    }

    if (!normalizedChannel) {
      return Object.freeze({ ready: false, reason: 'channel_invalid', payload: null })
    }

    if (
      media?.ready !== true ||
      !requiredText(media.audio_base64) ||
      !normalizeMime(media.mime_type) ||
      !Number.isInteger(media.size_bytes) ||
      media.size_bytes <= 0 ||
      !/^[a-f0-9]{64}$/i.test(media.sha256 || '')
    ) {
      return Object.freeze({ ready: false, reason: 'media_not_ready', payload: null })
    }

    const normalizedAudioIndex = Number.isFinite(Number(audioIndex))
      ? Math.max(0, Math.floor(Number(audioIndex)))
      : 0
    const mimeType = normalizeMime(media.mime_type)
    const extension = extensionForMime(mimeType)

    return Object.freeze({
      ready: true,
      reason: null,
      payload: Object.freeze({
        cycle_id: normalizedCycleId,
        audio_base64: media.audio_base64,
        mime_type: mimeType,
        file_name: `manychat-audio.${extension}`,
        audio_index: normalizedAudioIndex,
        audio_target_key: normalizedTargetKey,
        platform: PLATFORM,
        channel: normalizedChannel,
      }),
    })
  }

  function safeTransportView(value) {
    return Object.freeze({
      schema_version: value?.schema_version ?? SCHEMA_VERSION,
      platform: value?.platform ?? PLATFORM,
      ready: value?.ready === true,
      reason: value?.reason ?? null,
      status: Number(value?.status) || 0,
      mime_type: value?.mime_type ?? null,
      size_bytes: Number(value?.size_bytes) || 0,
      sha256_present:
        typeof value?.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(value.sha256),
      audio_base64_present: Boolean(requiredText(value?.audio_base64)),
      privacy: Object.freeze({
        raw_audio_url_exposed: false,
        raw_audio_base64_exposed: false,
        raw_sha256_exposed: false,
        persisted: false,
        yolen_dispatch_performed: false,
      }),
    })
  }

  // FASE 6 — getAudioSource do ManyChatAdapter: o content script não
  // consegue baixar a mídia de manybot-files.manychat.io (CORS da página);
  // o background já validado ao vivo baixa e devolve SÓ a mídia, sem
  // backend, sem transcrição e sem persistência. Aceita somente o frame
  // principal de app.manychat.com; a URL passa pela mesma validação de
  // host/tamanho/tipo de fetchManyChatAudio.
  const AUDIO_SOURCE_ACTION = 'FETCH_MANYCHAT_AUDIO_SOURCE'
  const MANYCHAT_APP_HOST = 'app.manychat.com'

  function isAllowedAudioSourceSender(sender) {
    const frameId = Number(sender?.frameId ?? 0)

    if (!Number.isInteger(frameId) || frameId !== 0) {
      return false
    }

    try {
      const url = new URL(requiredText(sender?.url ?? sender?.tab?.url) || '')
      return url.protocol === 'https:' && url.hostname === MANYCHAT_APP_HOST
    } catch {
      return false
    }
  }

  async function handleAudioSourceRequest(message, sender, { fetchImpl, cryptoImpl } = {}) {
    if (!isAllowedAudioSourceSender(sender)) {
      return Object.freeze({
        ok: false,
        statusCode: 403,
        payload: Object.freeze({ ready: false, reason: 'sender_not_allowed' }),
      })
    }

    const media = await fetchManyChatAudio({
      url: message?.payload?.audio_url,
      ...(fetchImpl ? { fetchImpl } : {}),
      ...(cryptoImpl ? { cryptoImpl } : {}),
    })

    if (!media?.ready) {
      return Object.freeze({
        ok: false,
        statusCode: 409,
        payload: Object.freeze({ ready: false, reason: media?.reason || 'audio_fetch_failed' }),
      })
    }

    return Object.freeze({
      ok: true,
      statusCode: 200,
      payload: Object.freeze({
        ready: true,
        reason: null,
        audio_base64: media.audio_base64,
        mime_type: media.mime_type,
        size_bytes: media.size_bytes,
      }),
    })
  }

  const api = Object.freeze({
    PLATFORM,
    SCHEMA_VERSION,
    ALLOWED_AUDIO_HOST,
    MAX_AUDIO_BYTES,
    AUDIO_SOURCE_ACTION,
    validateManyChatAudioUrl,
    fetchManyChatAudio,
    buildTranscriptionPayload,
    safeTransportView,
    handleAudioSourceRequest,
  })

  root.YolenManyChatAudioBackgroundTransport = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
