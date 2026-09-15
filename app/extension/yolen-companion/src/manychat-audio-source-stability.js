;(function initYolenManyChatAudioSourceStability(root) {
  'use strict'

  const PLATFORM = 'manychat'
  const SCHEMA_VERSION = 'yolen-manychat-audio-source-stability-snapshot-v1'

  function identityApi() {
    const api = root.YolenManyChatMessageIdentity
    if (!api || typeof api.extractManyChatMessageIdentity !== 'function') {
      const error = new Error('YolenManyChatMessageIdentity ausente.')
      error.name = 'YolenManyChatAudioSourceStabilityError'
      error.code = 'IDENTITY_UNAVAILABLE'
      throw error
    }
    return api
  }

  function audioSourceApi() {
    const api = root.YolenManyChatAudioSource
    if (!api || typeof api.extractManyChatAudioSource !== 'function') {
      const error = new Error('YolenManyChatAudioSource ausente.')
      error.name = 'YolenManyChatAudioSourceStabilityError'
      error.code = 'AUDIO_SOURCE_UNAVAILABLE'
      throw error
    }
    return api
  }

  function fnv1a(value) {
    let hash = 0x811c9dc5
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index)
      hash = Math.imul(hash, 0x01000193) >>> 0
    }
    return hash.toString(16).padStart(8, '0')
  }

  function urlShape(value) {
    if (typeof value !== 'string' || !value.trim()) return null

    try {
      const parsed = new URL(value)
      const queryKeys = Array.from(parsed.searchParams.keys()).sort()

      return Object.freeze({
        protocol: parsed.protocol,
        host_fingerprint: fnv1a(parsed.host),
        pathname_fingerprint: fnv1a(parsed.pathname),
        query_key_count: queryKeys.length,
        query_shape_fingerprint: fnv1a(JSON.stringify(queryKeys)),
        source_fingerprint: fnv1a(parsed.href),
        source_length: parsed.href.length,
      })
    } catch {
      return null
    }
  }

  function base() {
    return {
      schema_version: SCHEMA_VERSION,
      platform: PLATFORM,
      ready: false,
      reason: null,
      author_kind: 'unknown',
      direction: 'unknown',
      native_message_id_fingerprint: null,
      native_message_id_length: 0,
      source: null,
      mime_type: null,
      duration_seconds: null,
      network_fetch_allowed: false,
      persistence_enabled: false,
      transcription_enabled: false,
      capture_enabled: false,
    }
  }

  function createManyChatAudioSourceStabilitySnapshot(node) {
    const identity = identityApi().extractManyChatMessageIdentity(node)
    const source = audioSourceApi().extractManyChatAudioSource(node)
    const snapshot = base()

    if (!identity.ready || !identity.native_message_id) {
      return Object.freeze({
        ...snapshot,
        author_kind: identity.author_kind ?? 'unknown',
        direction: identity.direction ?? 'unknown',
        reason: identity.reason ?? 'message_identity_not_ready',
      })
    }

    if (!source.source_ready || !source.source_url) {
      return Object.freeze({
        ...snapshot,
        author_kind: identity.author_kind,
        direction: identity.direction,
        native_message_id_fingerprint: fnv1a(identity.native_message_id),
        native_message_id_length: identity.native_message_id.length,
        reason: source.reason ?? 'audio_source_not_ready',
      })
    }

    const shape = urlShape(source.source_url)
    if (!shape || shape.protocol !== 'https:') {
      return Object.freeze({
        ...snapshot,
        author_kind: identity.author_kind,
        direction: identity.direction,
        native_message_id_fingerprint: fnv1a(identity.native_message_id),
        native_message_id_length: identity.native_message_id.length,
        reason: 'https_source_shape_invalid',
      })
    }

    return Object.freeze({
      ...snapshot,
      ready: true,
      reason: null,
      author_kind: identity.author_kind,
      direction: identity.direction,
      native_message_id_fingerprint: fnv1a(identity.native_message_id),
      native_message_id_length: identity.native_message_id.length,
      source: shape,
      mime_type: source.mime_type ?? null,
      duration_seconds:
        typeof source.duration_seconds === 'number' &&
        Number.isFinite(source.duration_seconds)
          ? source.duration_seconds
          : null,
    })
  }

  function compareManyChatAudioSourceStabilitySnapshots(baseline, current) {
    const leftReady = baseline?.ready === true
    const rightReady = current?.ready === true

    const sameMessage =
      leftReady &&
      rightReady &&
      baseline.native_message_id_fingerprint === current.native_message_id_fingerprint &&
      baseline.native_message_id_length === current.native_message_id_length

    const sameSource =
      leftReady &&
      rightReady &&
      baseline.source?.source_fingerprint === current.source?.source_fingerprint &&
      baseline.source?.source_length === current.source?.source_length

    const sameHost =
      leftReady &&
      rightReady &&
      baseline.source?.host_fingerprint === current.source?.host_fingerprint

    const samePath =
      leftReady &&
      rightReady &&
      baseline.source?.pathname_fingerprint === current.source?.pathname_fingerprint

    const sameQueryShape =
      leftReady &&
      rightReady &&
      baseline.source?.query_key_count === current.source?.query_key_count &&
      baseline.source?.query_shape_fingerprint === current.source?.query_shape_fingerprint

    const sameMime =
      leftReady &&
      rightReady &&
      baseline.mime_type === current.mime_type

    const sameDuration =
      leftReady &&
      rightReady &&
      baseline.duration_seconds === current.duration_seconds

    const stable = Boolean(
      sameMessage &&
      sameSource &&
      sameHost &&
      samePath &&
      sameQueryShape &&
      sameMime &&
      sameDuration,
    )

    return Object.freeze({
      schema_version: 'yolen-manychat-audio-source-stability-comparison-v1',
      platform: PLATFORM,
      baseline_ready: leftReady,
      current_ready: rightReady,
      same_message: sameMessage,
      same_source: sameSource,
      same_host: sameHost,
      same_path: samePath,
      same_query_shape: sameQueryShape,
      same_mime: sameMime,
      same_duration: sameDuration,
      stable,
      reason: stable
        ? null
        : !leftReady || !rightReady
          ? 'snapshot_not_ready'
          : 'audio_source_changed_after_remount',
      network_fetch_allowed: false,
      persistence_enabled: false,
      transcription_enabled: false,
      capture_enabled: false,
      privacy: Object.freeze({
        raw_message_id_exposed: false,
        raw_source_url_exposed: false,
        network_sent: false,
        persisted: false,
      }),
    })
  }

  const api = Object.freeze({
    PLATFORM,
    SCHEMA_VERSION,
    createManyChatAudioSourceStabilitySnapshot,
    compareManyChatAudioSourceStabilitySnapshots,
  })

  root.YolenManyChatAudioSourceStability = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
