import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
require('../src/manychat-message-semantics.js')
require('../src/manychat-message-identity.js')
require('../src/manychat-message-content.js')
const audioSource = require('../src/manychat-audio-source.js')

function sourceNode({ src, type = 'audio/mpeg' } = {}) {
  return {
    src,
    getAttribute(name) {
      if (name === 'src') return src ?? null
      if (name === 'type') return type
      return null
    },
  }
}

function nativeNode({
  text = '',
  mid = 'native-mid',
  audioCurrentSrc = 'https://cdn.example.com/audio.mp3',
  audioSrc = '',
  duration = 25.24,
  sources = [sourceNode({ src: 'https://cdn.example.com/audio.mp3' })],
} = {}) {
  const audio = {
    currentSrc: audioCurrentSrc,
    src: audioSrc,
    duration,
    querySelectorAll(selector) {
      return selector === 'source' ? sources : []
    },
  }

  return {
    textContent: text,
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
  classes = ['_typeIn_hash'],
  title = '2026-09-14T20:30:00',
  native = nativeNode(),
} = {}) {
  return {
    classList: classes,
    getAttribute(name) {
      if (name === 'class') return classes.join(' ')
      if (name === 'data-title') return title
      return null
    },
    querySelectorAll(selector) {
      if (selector === '[data-mid]') return native ? [native] : []
      return []
    },
  }
}

test('extrai uma única fonte https de áudio humano sem liberar rede', () => {
  const result = audioSource.extractManyChatAudioSource(messageNode())

  assert.equal(result.source_ready, true)
  assert.equal(result.source_kind, 'https')
  assert.equal(result.source_url, 'https://cdn.example.com/audio.mp3')
  assert.equal(result.source_candidate_count, 1)
  assert.equal(result.audio_element_count, 1)
  assert.equal(result.source_element_count, 1)
  assert.equal(result.mime_type, 'audio/mpeg')
  assert.equal(result.duration_seconds, 25.24)
  assert.equal(result.network_fetch_allowed, false)
  assert.equal(result.persistence_enabled, false)
  assert.equal(result.transcription_enabled, false)
})

test('currentSrc e source iguais contam como uma única fonte', () => {
  const url = 'https://cdn.example.com/same.mp3'
  const result = audioSource.extractManyChatAudioSource(
    messageNode({
      native: nativeNode({
        audioCurrentSrc: url,
        sources: [sourceNode({ src: url })],
      }),
    }),
  )

  assert.equal(result.source_ready, true)
  assert.equal(result.source_candidate_count, 1)
})

test('fontes https divergentes falham fechado como ambíguas', () => {
  const result = audioSource.extractManyChatAudioSource(
    messageNode({
      native: nativeNode({
        audioCurrentSrc: 'https://cdn.example.com/a.mp3',
        sources: [sourceNode({ src: 'https://cdn.example.com/b.mp3' })],
      }),
    }),
  )

  assert.equal(result.source_ready, false)
  assert.equal(result.reason, 'audio_source_ambiguous')
  assert.equal(result.source_candidate_count, 2)
})

test('fonte não https não é elegível', () => {
  const result = audioSource.extractManyChatAudioSource(
    messageNode({
      native: nativeNode({
        audioCurrentSrc: 'blob:https://app.manychat.com/example',
        sources: [sourceNode({ src: 'blob:https://app.manychat.com/example' })],
      }),
    }),
  )

  assert.equal(result.source_ready, false)
  assert.equal(result.reason, 'https_audio_source_missing')
})

test('mensagem de texto não entra no gate de áudio', () => {
  const result = audioSource.extractManyChatAudioSource(
    messageNode({
      native: nativeNode({ text: 'mensagem textual' }),
    }),
  )

  assert.equal(result.source_ready, false)
  assert.equal(result.reason, 'audio_content_not_ready')
})

test('safe view não expõe URL bruta', () => {
  const raw = audioSource.extractManyChatAudioSource(messageNode())
  const safe = audioSource.safeManyChatAudioSourceView(raw)
  const serialized = JSON.stringify(safe)

  assert.equal(safe.source_ready, true)
  assert.equal(safe.source_present, true)
  assert.equal(safe.source_length, raw.source_url.length)
  assert.equal(safe.privacy.raw_source_url_exposed, false)
  assert.equal(safe.network_fetch_allowed, false)
  assert.doesNotMatch(serialized, /cdn\.example\.com/)
})
