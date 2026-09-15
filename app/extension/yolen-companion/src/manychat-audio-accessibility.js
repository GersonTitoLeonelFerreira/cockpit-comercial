;(function initYolenManyChatAudioAccessibility(root) {
  'use strict'

  const PLATFORM = 'manychat'
  const SCHEMA_VERSION = 'yolen-manychat-audio-accessibility-probe-v1'

  function normalizeMime(value) {
    if (typeof value !== 'string') return null
    const normalized = value.split(';', 1)[0].trim().toLowerCase()
    return normalized || null
  }

  function isAudioMime(value) {
    const mime = normalizeMime(value)
    return Boolean(mime && mime.startsWith('audio/'))
  }

  function normalizeStatus(value) {
    const number = Number(value)
    return Number.isInteger(number) ? number : null
  }

  function normalizeBytes(value) {
    const number = Number(value)
    return Number.isFinite(number) && number >= 0 ? number : null
  }

  function validSha256(value) {
    return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value)
  }

  function evaluateManyChatAudioAccessibilityProbe(probe = {}) {
    const httpCode = normalizeStatus(probe.http_code)
    const contentType = normalizeMime(probe.content_type)
    const detectedMime = normalizeMime(probe.detected_mime)
    const sourceMimeHint = normalizeMime(probe.source_mime_hint)
    const bytesDownloaded = normalizeBytes(probe.bytes_downloaded)
    const acceptRanges = typeof probe.accept_ranges === 'string'
      ? probe.accept_ranges.trim().toLowerCase()
      : null
    const sha256Present = validSha256(probe.sha256)

    const responseAccepted = httpCode === 200 || httpCode === 206
    const transportIsAudio = isAudioMime(contentType)
    const detectedIsAudio = isAudioMime(detectedMime)
    const hasBytes = typeof bytesDownloaded === 'number' && bytesDownloaded > 0
    const rangeSupported = httpCode === 206 || acceptRanges === 'bytes'
    const transportMatchesDetected = Boolean(
      contentType && detectedMime && contentType === detectedMime,
    )
    const sourceHintMatchesDetected = sourceMimeHint == null
      ? null
      : sourceMimeHint === detectedMime

    const ready = Boolean(
      responseAccepted &&
      transportIsAudio &&
      detectedIsAudio &&
      hasBytes &&
      sha256Present,
    )

    let reason = null
    if (!responseAccepted) reason = 'http_response_not_usable'
    else if (!transportIsAudio) reason = 'transport_content_type_not_audio'
    else if (!detectedIsAudio) reason = 'detected_mime_not_audio'
    else if (!hasBytes) reason = 'audio_bytes_missing'
    else if (!sha256Present) reason = 'audio_digest_invalid'

    return Object.freeze({
      schema_version: SCHEMA_VERSION,
      platform: PLATFORM,
      ready,
      reason,
      http_code: httpCode,
      content_type: contentType,
      detected_mime: detectedMime,
      canonical_mime: ready ? detectedMime : null,
      source_mime_hint: sourceMimeHint,
      source_hint_matches_detected: sourceHintMatchesDetected,
      transport_matches_detected: transportMatchesDetected,
      bytes_downloaded: bytesDownloaded,
      range_supported: rangeSupported,
      sha256_present: sha256Present,
      external_fetch_proven: ready,
      production_network_fetch_enabled: false,
      transcription_enabled: false,
      persistence_enabled: false,
      capture_enabled: false,
      reasoning_enabled: false,
      privacy: Object.freeze({
        raw_source_url_exposed: false,
        audio_content_exposed: false,
        persisted: false,
      }),
    })
  }

  const api = Object.freeze({
    PLATFORM,
    SCHEMA_VERSION,
    evaluateManyChatAudioAccessibilityProbe,
  })

  root.YolenManyChatAudioAccessibility = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
