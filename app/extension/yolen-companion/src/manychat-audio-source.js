;(function initYolenManyChatAudioSource(root) {
  'use strict'

  const PLATFORM = 'manychat'
  const SCHEMA_VERSION = 'yolen-manychat-audio-source-evidence-v1'

  function contentApi() {
    const api = root.YolenManyChatMessageContent
    if (!api || typeof api.extractManyChatMessageContent !== 'function') {
      const error = new Error('YolenManyChatMessageContent ausente.')
      error.name = 'YolenManyChatAudioSourceError'
      error.code = 'CONTENT_UNAVAILABLE'
      throw error
    }
    return api
  }

  function queryAll(node, selector) {
    if (!node || typeof node.querySelectorAll !== 'function') return []
    try {
      return Array.from(node.querySelectorAll(selector))
    } catch {
      return []
    }
  }

  function readAttribute(node, name) {
    if (!node || typeof node.getAttribute !== 'function') return null
    try {
      const value = node.getAttribute(name)
      return typeof value === 'string' ? value : null
    } catch {
      return null
    }
  }

  function readProperty(node, name) {
    try {
      const value = node?.[name]
      return typeof value === 'string' ? value : null
    } catch {
      return null
    }
  }

  function normalizeUrl(value) {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    if (!trimmed) return null

    try {
      const parsed = new URL(trimmed)
      if (parsed.protocol !== 'https:') return null
      return parsed.href
    } catch {
      return null
    }
  }

  function findSingleNativeNode(node) {
    const matches = queryAll(node, '[data-mid]')
    return Object.freeze({
      count: matches.length,
      node: matches.length === 1 ? matches[0] : null,
    })
  }

  function unique(values) {
    return Array.from(new Set(values.filter(Boolean)))
  }

  function fnv1a(value) {
    let hash = 0x811c9dc5
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index)
      hash = Math.imul(hash, 0x01000193) >>> 0
    }
    return hash.toString(16).padStart(8, '0')
  }

  function base(content) {
    return {
      schema_version: SCHEMA_VERSION,
      platform: PLATFORM,
      author_kind: content?.author_kind ?? 'unknown',
      direction: content?.direction ?? 'unknown',
      content_type: content?.content_type ?? null,
      content_ready: content?.content_ready === true,
      source_kind: null,
      source_url: null,
      source_candidate_count: 0,
      audio_element_count: 0,
      source_element_count: 0,
      mime_type: null,
      duration_seconds: null,
      source_ready: false,
      reason: null,
      network_fetch_allowed: false,
      persistence_enabled: false,
      transcription_enabled: false,
    }
  }

  function extractManyChatAudioSource(node) {
    const content = contentApi().extractManyChatMessageContent(node)
    const evidence = base(content)

    if (!content.content_ready || content.content_type !== 'audio') {
      return Object.freeze({
        ...evidence,
        reason: content.reason ?? 'audio_content_not_ready',
      })
    }

    const native = findSingleNativeNode(node)
    if (!native.node || native.count !== 1) {
      return Object.freeze({
        ...evidence,
        reason:
          native.count === 0
            ? 'native_audio_node_missing'
            : 'native_audio_node_ambiguous',
      })
    }

    const audioElements = queryAll(native.node, 'audio')
    if (audioElements.length !== 1) {
      return Object.freeze({
        ...evidence,
        audio_element_count: audioElements.length,
        reason:
          audioElements.length === 0
            ? 'audio_element_missing'
            : 'audio_element_ambiguous',
      })
    }

    const audio = audioElements[0]
    const sources = queryAll(audio, 'source')
    const candidateUrls = unique([
      normalizeUrl(readProperty(audio, 'currentSrc')),
      normalizeUrl(readProperty(audio, 'src')),
      ...sources.map((source) => normalizeUrl(readAttribute(source, 'src'))),
      ...sources.map((source) => normalizeUrl(readProperty(source, 'src'))),
    ])

    const mimeTypes = unique(
      sources
        .map((source) => readAttribute(source, 'type'))
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean),
    )

    const duration = Number(audio?.duration)
    const durationSeconds = Number.isFinite(duration) && duration >= 0
      ? duration
      : null

    if (candidateUrls.length === 0) {
      return Object.freeze({
        ...evidence,
        audio_element_count: 1,
        source_element_count: sources.length,
        source_candidate_count: 0,
        mime_type: mimeTypes.length === 1 ? mimeTypes[0] : null,
        duration_seconds: durationSeconds,
        reason: 'https_audio_source_missing',
      })
    }

    if (candidateUrls.length !== 1) {
      return Object.freeze({
        ...evidence,
        audio_element_count: 1,
        source_element_count: sources.length,
        source_candidate_count: candidateUrls.length,
        duration_seconds: durationSeconds,
        reason: 'audio_source_ambiguous',
      })
    }

    if (mimeTypes.length > 1) {
      return Object.freeze({
        ...evidence,
        audio_element_count: 1,
        source_element_count: sources.length,
        source_candidate_count: 1,
        duration_seconds: durationSeconds,
        reason: 'audio_mime_type_ambiguous',
      })
    }

    return Object.freeze({
      ...evidence,
      source_kind: 'https',
      source_url: candidateUrls[0],
      source_candidate_count: 1,
      audio_element_count: 1,
      source_element_count: sources.length,
      mime_type: mimeTypes.length === 1 ? mimeTypes[0] : null,
      duration_seconds: durationSeconds,
      source_ready: true,
      reason: null,
    })
  }

  function safeManyChatAudioSourceView(value) {
    const source = typeof value?.source_url === 'string'
      ? value.source_url
      : null

    return Object.freeze({
      schema_version: value?.schema_version ?? SCHEMA_VERSION,
      platform: value?.platform ?? PLATFORM,
      author_kind: value?.author_kind ?? 'unknown',
      direction: value?.direction ?? 'unknown',
      content_type: value?.content_type ?? null,
      source_kind: value?.source_kind ?? null,
      source_present: Boolean(source),
      source_length: source?.length ?? 0,
      source_fingerprint: source ? fnv1a(source) : null,
      source_candidate_count: Number.isInteger(value?.source_candidate_count)
        ? value.source_candidate_count
        : 0,
      audio_element_count: Number.isInteger(value?.audio_element_count)
        ? value.audio_element_count
        : 0,
      source_element_count: Number.isInteger(value?.source_element_count)
        ? value.source_element_count
        : 0,
      mime_type: value?.mime_type ?? null,
      duration_seconds:
        typeof value?.duration_seconds === 'number' &&
        Number.isFinite(value.duration_seconds)
          ? value.duration_seconds
          : null,
      source_ready: value?.source_ready === true,
      reason: value?.reason ?? null,
      network_fetch_allowed: false,
      persistence_enabled: false,
      transcription_enabled: false,
      privacy: Object.freeze({
        raw_source_url_exposed: false,
        network_sent: false,
        persisted: false,
      }),
    })
  }

  const api = Object.freeze({
    PLATFORM,
    SCHEMA_VERSION,
    extractManyChatAudioSource,
    safeManyChatAudioSourceView,
  })

  root.YolenManyChatAudioSource = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
