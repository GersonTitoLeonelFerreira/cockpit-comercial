import assert from 'node:assert/strict'
import { createHash, webcrypto } from 'node:crypto'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const transport = require('../src/manychat-audio-background-transport.js')

const AUDIO_BYTES = Buffer.concat([
  Buffer.from('OggS'),
  Buffer.alloc(256, 7),
])
const AUDIO_SHA256 = createHash('sha256').update(AUDIO_BYTES).digest('hex')
const AUDIO_URL = 'https://manybot-files.manychat.io/3678277/wa/2026/09/14/audio.ogg'

function response({
  url = AUDIO_URL,
  status = 206,
  contentType = 'audio/ogg',
  contentLength = String(AUDIO_BYTES.length),
  bytes = AUDIO_BYTES,
} = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: {
      get(name) {
        const normalized = String(name).toLowerCase()
        if (normalized === 'content-type') return contentType
        if (normalized === 'content-length') return contentLength
        return null
      },
    },
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    },
  }
}

test('aceita somente HTTPS no host oficial observado do ManyChat', () => {
  assert.equal(transport.validateManyChatAudioUrl(AUDIO_URL).valid, true)
  assert.equal(
    transport.validateManyChatAudioUrl('http://manybot-files.manychat.io/audio.ogg').valid,
    false,
  )
  assert.equal(
    transport.validateManyChatAudioUrl('https://evil.example/audio.ogg').valid,
    false,
  )
  assert.equal(
    transport.validateManyChatAudioUrl('https://manybot-files.manychat.io.evil.example/audio.ogg').valid,
    false,
  )
})

test('fetch background valida mídia, calcula SHA-256 e produz base64', async () => {
  const calls = []
  const result = await transport.fetchManyChatAudio({
    url: AUDIO_URL,
    cryptoImpl: webcrypto,
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      return response()
    },
  })

  assert.equal(result.ready, true)
  assert.equal(result.reason, null)
  assert.equal(result.status, 206)
  assert.equal(result.mime_type, 'audio/ogg')
  assert.equal(result.size_bytes, AUDIO_BYTES.length)
  assert.equal(result.sha256, AUDIO_SHA256)
  assert.equal(result.audio_base64, AUDIO_BYTES.toString('base64'))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, AUDIO_URL)
  assert.equal(calls[0].init.credentials, 'omit')
  assert.equal(calls[0].init.cache, 'no-store')
})

test('redirect para host não autorizado falha fechado', async () => {
  const result = await transport.fetchManyChatAudio({
    url: AUDIO_URL,
    cryptoImpl: webcrypto,
    fetchImpl: async () => response({
      url: 'https://cdn.evil.example/audio.ogg',
    }),
  })

  assert.equal(result.ready, false)
  assert.equal(result.reason, 'audio_redirect_not_allowed')
  assert.equal(result.audio_base64, null)
})

test('conteúdo que não é áudio é rejeitado antes de ler bytes', async () => {
  let arrayBufferRead = false
  const result = await transport.fetchManyChatAudio({
    url: AUDIO_URL,
    cryptoImpl: webcrypto,
    fetchImpl: async () => ({
      ...response({ contentType: 'text/html' }),
      async arrayBuffer() {
        arrayBufferRead = true
        return AUDIO_BYTES.buffer
      },
    }),
  })

  assert.equal(result.ready, false)
  assert.equal(result.reason, 'audio_content_type_invalid')
  assert.equal(arrayBufferRead, false)
})

test('content-length acima do limite bloqueia download antes de materializar bytes', async () => {
  let arrayBufferRead = false
  const result = await transport.fetchManyChatAudio({
    url: AUDIO_URL,
    cryptoImpl: webcrypto,
    maxBytes: 100,
    fetchImpl: async () => ({
      ...response({ contentLength: '101' }),
      async arrayBuffer() {
        arrayBufferRead = true
        return AUDIO_BYTES.buffer
      },
    }),
  })

  assert.equal(result.ready, false)
  assert.equal(result.reason, 'audio_too_large')
  assert.equal(arrayBufferRead, false)
})

test('tamanho real acima do limite também falha quando header não ajuda', async () => {
  const result = await transport.fetchManyChatAudio({
    url: AUDIO_URL,
    cryptoImpl: webcrypto,
    maxBytes: 100,
    fetchImpl: async () => response({ contentLength: null }),
  })

  assert.equal(result.ready, false)
  assert.equal(result.reason, 'audio_too_large')
  assert.equal(result.size_bytes, AUDIO_BYTES.length)
})

test('monta payload universal ManyChat compatível com endpoint já universalizado', async () => {
  const media = await transport.fetchManyChatAudio({
    url: AUDIO_URL,
    cryptoImpl: webcrypto,
    fetchImpl: async () => response(),
  })

  const built = transport.buildTranscriptionPayload({
    cycle_id: 'cycle-123',
    audio_target_key: 'manychat:native-mid-123',
    channel: 'whatsapp',
    audio_index: 2,
    media,
  })

  assert.equal(built.ready, true)
  assert.deepEqual(built.payload, {
    cycle_id: 'cycle-123',
    audio_base64: AUDIO_BYTES.toString('base64'),
    mime_type: 'audio/ogg',
    file_name: 'manychat-audio.ogg',
    audio_index: 2,
    audio_target_key: 'manychat:native-mid-123',
    platform: 'manychat',
    channel: 'whatsapp',
  })
})

test('payload exige target key ManyChat e mídia pronta', () => {
  const invalidKey = transport.buildTranscriptionPayload({
    cycle_id: 'cycle-123',
    audio_target_key: 'sem-namespace',
    channel: 'whatsapp',
    media: {
      ready: true,
      audio_base64: 'T2dnUw==',
      mime_type: 'audio/ogg',
      size_bytes: 4,
      sha256: 'a'.repeat(64),
    },
  })

  assert.equal(invalidKey.ready, false)
  assert.equal(invalidKey.reason, 'audio_target_key_invalid')
})

test('safe view não expõe URL, base64 ou digest bruto', async () => {
  const raw = await transport.fetchManyChatAudio({
    url: AUDIO_URL,
    cryptoImpl: webcrypto,
    fetchImpl: async () => response(),
  })
  const safe = transport.safeTransportView(raw)
  const serialized = JSON.stringify(safe)

  assert.equal(safe.ready, true)
  assert.equal(safe.audio_base64_present, true)
  assert.equal(safe.sha256_present, true)
  assert.equal(safe.privacy.raw_audio_url_exposed, false)
  assert.equal(safe.privacy.raw_audio_base64_exposed, false)
  assert.equal(safe.privacy.raw_sha256_exposed, false)
  assert.doesNotMatch(serialized, /manybot-files\.manychat\.io/)
  assert.doesNotMatch(serialized, new RegExp(AUDIO_BYTES.toString('base64')))
  assert.doesNotMatch(serialized, new RegExp(AUDIO_SHA256))
})
