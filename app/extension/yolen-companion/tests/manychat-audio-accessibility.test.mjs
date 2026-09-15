import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const accessibility = require('../src/manychat-audio-accessibility.js')

test('probe realista 206 audio/ogg passa mesmo com hint DOM audio/mpeg', () => {
  const result = accessibility.evaluateManyChatAudioAccessibilityProbe({
    http_code: 206,
    content_type: 'audio/ogg',
    detected_mime: 'audio/ogg',
    source_mime_hint: 'audio/mpeg',
    bytes_downloaded: 59817,
    sha256: 'd589dcdc0d18fb4db65da008b6e508e9dcb0a09d71da54e9f3d1cf9df5bb96e6',
    accept_ranges: 'bytes',
  })

  assert.equal(result.ready, true)
  assert.equal(result.reason, null)
  assert.equal(result.http_code, 206)
  assert.equal(result.canonical_mime, 'audio/ogg')
  assert.equal(result.source_hint_matches_detected, false)
  assert.equal(result.transport_matches_detected, true)
  assert.equal(result.range_supported, true)
  assert.equal(result.external_fetch_proven, true)
  assert.equal(result.production_network_fetch_enabled, false)
  assert.equal(result.transcription_enabled, false)
})

test('MIME declarado no DOM é apenas hint e não substitui MIME detectado', () => {
  const result = accessibility.evaluateManyChatAudioAccessibilityProbe({
    http_code: 200,
    content_type: 'audio/ogg; charset=binary',
    detected_mime: 'audio/ogg',
    source_mime_hint: 'audio/mpeg',
    bytes_downloaded: 100,
    sha256: 'a'.repeat(64),
  })

  assert.equal(result.ready, true)
  assert.equal(result.canonical_mime, 'audio/ogg')
  assert.equal(result.source_mime_hint, 'audio/mpeg')
  assert.equal(result.source_hint_matches_detected, false)
})

test('resposta sem bytes falha fechado', () => {
  const result = accessibility.evaluateManyChatAudioAccessibilityProbe({
    http_code: 206,
    content_type: 'audio/ogg',
    detected_mime: 'audio/ogg',
    bytes_downloaded: 0,
    sha256: 'a'.repeat(64),
    accept_ranges: 'bytes',
  })

  assert.equal(result.ready, false)
  assert.equal(result.reason, 'audio_bytes_missing')
})

test('conteúdo que não é áudio falha fechado', () => {
  const result = accessibility.evaluateManyChatAudioAccessibilityProbe({
    http_code: 200,
    content_type: 'text/html',
    detected_mime: 'text/html',
    bytes_downloaded: 200,
    sha256: 'a'.repeat(64),
  })

  assert.equal(result.ready, false)
  assert.equal(result.reason, 'transport_content_type_not_audio')
})

test('digest inválido impede aprovação do probe', () => {
  const result = accessibility.evaluateManyChatAudioAccessibilityProbe({
    http_code: 200,
    content_type: 'audio/ogg',
    detected_mime: 'audio/ogg',
    bytes_downloaded: 200,
    sha256: 'invalid',
  })

  assert.equal(result.ready, false)
  assert.equal(result.reason, 'audio_digest_invalid')
})
