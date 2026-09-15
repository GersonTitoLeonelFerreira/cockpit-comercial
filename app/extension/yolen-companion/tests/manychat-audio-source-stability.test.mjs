import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
require('../src/manychat-message-semantics.js')
require('../src/manychat-message-identity.js')
require('../src/manychat-message-content.js')
require('../src/manychat-audio-source.js')
const stability = require('../src/manychat-audio-source-stability.js')

function sourceElement(url, type = 'audio/mpeg') {
  return {
    src: url,
    getAttribute(name) {
      if (name === 'src') return url
      if (name === 'type') return type
      return null
    },
  }
}

function audioElement(url, duration = 25.24, type = 'audio/mpeg') {
  const source = sourceElement(url, type)

  return {
    currentSrc: url,
    src: '',
    duration,
    querySelectorAll(selector) {
      return selector === 'source' ? [source] : []
    },
  }
}

function nativeNode(mid, url, duration = 25.24, type = 'audio/mpeg') {
  const audio = audioElement(url, duration, type)

  return {
    textContent: '',
    getAttribute(name) {
      return name === 'data-mid' ? mid : null
    },
    querySelectorAll(selector) {
      if (selector === 'audio') return [audio]
      if (selector === 'video') return []
      if (selector === 'img') return []
      if (selector === 'canvas') return []
      return []
    },
  }
}

function messageNode({
  mid = 'native-audio-message-id',
  url = 'https://cdn.example.test/audio/message-1.mp3',
  duration = 25.24,
  type = 'audio/mpeg',
} = {}) {
  const native = nativeNode(mid, url, duration, type)

  return {
    classList: ['_wrapper_hash', '_typeIn_hash'],
    getAttribute(name) {
      if (name === 'class') return '_wrapper_hash _typeIn_hash'
      if (name === 'data-title') return '2026-09-14T20:30:00'
      return null
    },
    querySelectorAll(selector) {
      if (selector === '[data-mid]') return [native]
      return []
    },
  }
}

test('snapshot seguro preserva identidade e forma da fonte sem expor valores brutos', () => {
  const rawMid = 'secret-message-id-123'
  const rawUrl = 'https://cdn.example.test/audio/secret-file.mp3'
  const snapshot = stability.createManyChatAudioSourceStabilitySnapshot(
    messageNode({ mid: rawMid, url: rawUrl }),
  )
  const serialized = JSON.stringify(snapshot)

  assert.equal(snapshot.ready, true)
  assert.equal(snapshot.author_kind, 'customer')
  assert.equal(snapshot.direction, 'incoming')
  assert.equal(snapshot.source.protocol, 'https:')
  assert.equal(snapshot.mime_type, 'audio/mpeg')
  assert.equal(snapshot.duration_seconds, 25.24)
  assert.doesNotMatch(serialized, /secret-message-id-123/)
  assert.doesNotMatch(serialized, /secret-file\.mp3/)
  assert.doesNotMatch(serialized, /cdn\.example\.test/)
})

test('mesma mensagem e mesma fonte após remount passam o gate', () => {
  const baseline = stability.createManyChatAudioSourceStabilitySnapshot(
    messageNode(),
  )
  const current = stability.createManyChatAudioSourceStabilitySnapshot(
    messageNode(),
  )
  const result = stability.compareManyChatAudioSourceStabilitySnapshots(
    baseline,
    current,
  )

  assert.equal(result.same_message, true)
  assert.equal(result.same_source, true)
  assert.equal(result.same_host, true)
  assert.equal(result.same_path, true)
  assert.equal(result.same_query_shape, true)
  assert.equal(result.same_mime, true)
  assert.equal(result.same_duration, true)
  assert.equal(result.stable, true)
  assert.equal(result.reason, null)
})

test('mudança da URL falha fechado mesmo para a mesma mensagem', () => {
  const baseline = stability.createManyChatAudioSourceStabilitySnapshot(
    messageNode(),
  )
  const current = stability.createManyChatAudioSourceStabilitySnapshot(
    messageNode({ url: 'https://cdn.example.test/audio/message-2.mp3' }),
  )
  const result = stability.compareManyChatAudioSourceStabilitySnapshots(
    baseline,
    current,
  )

  assert.equal(result.same_message, true)
  assert.equal(result.same_source, false)
  assert.equal(result.same_host, true)
  assert.equal(result.same_path, false)
  assert.equal(result.stable, false)
  assert.equal(result.reason, 'audio_source_changed_after_remount')
})

test('mudança de data-mid nunca é considerada a mesma mensagem', () => {
  const baseline = stability.createManyChatAudioSourceStabilitySnapshot(
    messageNode({ mid: 'message-a' }),
  )
  const current = stability.createManyChatAudioSourceStabilitySnapshot(
    messageNode({ mid: 'message-b' }),
  )
  const result = stability.compareManyChatAudioSourceStabilitySnapshots(
    baseline,
    current,
  )

  assert.equal(result.same_message, false)
  assert.equal(result.stable, false)
})

test('snapshot inválido impede comparação estável', () => {
  const baseline = stability.createManyChatAudioSourceStabilitySnapshot(
    messageNode({ url: 'http://unsafe.example.test/audio.mp3' }),
  )
  const current = stability.createManyChatAudioSourceStabilitySnapshot(
    messageNode(),
  )
  const result = stability.compareManyChatAudioSourceStabilitySnapshots(
    baseline,
    current,
  )

  assert.equal(baseline.ready, false)
  assert.equal(result.stable, false)
  assert.equal(result.reason, 'snapshot_not_ready')
  assert.equal(result.network_fetch_allowed, false)
  assert.equal(result.transcription_enabled, false)
})
