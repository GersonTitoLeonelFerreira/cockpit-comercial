import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import test from 'node:test'

import {
  PRODUCTION_HOSTS,
  SHARED_RUNTIME_FILES,
  assertAllowlistMatchesManifest,
  toProductionManifest,
} from '../scripts/build-package.mjs'

const BACKGROUND_SOURCE = readFileSync(
  new URL('../src/background.js', import.meta.url),
  'utf8',
)
const SERVICE_WORKER_SOURCE = readFileSync(
  new URL('../src/background-service-worker.js', import.meta.url),
  'utf8',
)
const MANIFEST = JSON.parse(
  readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'),
)

const BASE_URL = 'https://cockpit-comercial-vocn.vercel.app'
const MANYCHAT_MEDIA_HOST = 'https://manybot-files.manychat.io/*'

function validSession() {
  return {
    ok: true,
    statusCode: 200,
    payload: {
      ok: true,
      companion_token: 'test-companion-token',
      expires_at: '2099-01-01T00:00:00.000Z',
    },
    origin: BASE_URL,
    capturedAt: '2026-09-15T01:00:00.000Z',
  }
}

function createBackgroundHarness({ mediaReady = true } = {}) {
  let listener = null
  const fetchCalls = []
  const storage = {
    yolen_companion_session: validSession(),
  }

  const browser = {
    storage: {
      local: {
        async get(key) {
          return { [key]: storage[key] }
        },
        async set(value) {
          Object.assign(storage, value)
        },
        async remove(key) {
          delete storage[key]
        },
      },
    },
    runtime: {
      onMessage: {
        addListener(fn) {
          listener = fn
        },
      },
    },
  }

  const captureTransport = {
    isUuid() {
      return true
    },
    createDeviceKey() {
      return 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    },
    buildIngestionRequestBody(payload, deviceKey) {
      return { ...payload, device_key: deviceKey }
    },
  }

  const media = mediaReady
    ? {
        ready: true,
        reason: null,
        status: 200,
        audio_base64: 'T2dnUw==',
        mime_type: 'audio/ogg',
        size_bytes: 4,
        sha256: 'a'.repeat(64),
      }
    : {
        ready: false,
        reason: 'audio_fetch_failed',
        status: 403,
        audio_base64: null,
        mime_type: null,
        size_bytes: 0,
        sha256: null,
      }

  const manyChatTransport = {
    async fetchManyChatAudio({ url }) {
      assert.equal(
        url,
        'https://manybot-files.manychat.io/3678277/wa/audio.ogg',
      )
      return media
    },
    safeTransportView(value) {
      return {
        ready: value.ready === true,
        status: value.status || 0,
        mime_type: value.mime_type || null,
        size_bytes: value.size_bytes || 0,
        audio_base64_present: Boolean(value.audio_base64),
        sha256_present: Boolean(value.sha256),
        privacy: {
          raw_audio_url_exposed: false,
          raw_audio_base64_exposed: false,
          raw_sha256_exposed: false,
        },
      }
    },
    buildTranscriptionPayload({
      cycle_id,
      audio_target_key,
      channel,
      audio_index,
      media: inputMedia,
    }) {
      assert.equal(inputMedia, media)

      return {
        ready: true,
        reason: null,
        payload: {
          cycle_id,
          audio_base64: inputMedia.audio_base64,
          mime_type: inputMedia.mime_type,
          file_name: 'manychat-audio.ogg',
          audio_index,
          audio_target_key,
          platform: 'manychat',
          channel,
        },
      }
    },
  }

  const context = createContext({
    browser,
    chrome: undefined,
    globalThis: null,
    crypto: globalThis.crypto,
    fetch: async (url, init) => {
      fetchCalls.push({ url, init })
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            ok: true,
            data: {
              text: 'Transcrição de teste.',
              platform: 'manychat',
              channel: 'whatsapp',
            },
          }
        },
      }
    },
    YolenCompanionCaptureTransport: captureTransport,
    YolenManyChatAudioBackgroundTransport: manyChatTransport,
    console,
    Date,
    Promise,
    Error,
    Object,
    Array,
    Boolean,
    Number,
    String,
  })

  context.globalThis = context
  runInContext(BACKGROUND_SOURCE, context, {
    filename: 'background.js',
  })

  assert.equal(typeof listener, 'function')

  return {
    listener,
    fetchCalls,
  }
}

test('manifest carrega transporte ManyChat antes do background e concede somente host de mídia', () => {
  assert.deepEqual(MANIFEST.background.scripts, [
    'src/capture-transport.js',
    'src/manychat-audio-background-transport.js',
    'src/background.js',
  ])
  assert.equal(MANIFEST.host_permissions.includes(MANYCHAT_MEDIA_HOST), true)
  assert.equal(
    MANIFEST.host_permissions.some((host) => host.includes('app.manychat.com')),
    false,
  )

  assert.equal(
    SERVICE_WORKER_SOURCE.indexOf("'manychat-audio-background-transport.js'") <
      SERVICE_WORKER_SOURCE.indexOf("'background.js'"),
    true,
  )
})

test('allowlist e manifest PROD incluem o transporte e o host de mídia', () => {
  assert.doesNotThrow(() => assertAllowlistMatchesManifest(MANIFEST))
  assert.equal(
    SHARED_RUNTIME_FILES.includes('src/manychat-audio-background-transport.js'),
    true,
  )
  assert.equal(PRODUCTION_HOSTS.includes(MANYCHAT_MEDIA_HOST), true)

  for (const target of ['chrome', 'firefox']) {
    const prod = toProductionManifest(MANIFEST, target)
    assert.equal(prod.host_permissions.includes(MANYCHAT_MEDIA_HOST), true)
    assert.equal(
      prod.host_permissions.some((host) => host.includes('localhost')),
      false,
    )
  }
})

test('TRANSCRIBE_MANYCHAT_AUDIO baixa mídia no background e envia somente payload universal autenticado', async () => {
  const harness = createBackgroundHarness()

  const result = await harness.listener({
    source: 'YOLEN_COMPANION',
    action: 'TRANSCRIBE_MANYCHAT_AUDIO',
    baseUrl: BASE_URL,
    payload: {
      audio_url: 'https://manybot-files.manychat.io/3678277/wa/audio.ogg',
      cycle_id: 'cycle-123',
      audio_target_key: 'manychat:native-mid-123',
      channel: 'whatsapp',
      audio_index: 0,
    },
  })

  assert.equal(result.ok, true)
  assert.equal(result.statusCode, 200)
  assert.equal(result.transport.ready, true)
  assert.equal(result.transport.privacy.raw_audio_url_exposed, false)
  assert.equal(harness.fetchCalls.length, 1)

  const call = harness.fetchCalls[0]
  assert.equal(call.url, `${BASE_URL}/api/companion/transcribe-audio`)
  assert.equal(call.init.method, 'POST')
  assert.equal(call.init.credentials, 'omit')
  assert.equal(call.init.headers.Authorization, 'Bearer test-companion-token')

  const body = JSON.parse(call.init.body)
  assert.deepEqual(body, {
    cycle_id: 'cycle-123',
    audio_base64: 'T2dnUw==',
    mime_type: 'audio/ogg',
    file_name: 'manychat-audio.ogg',
    audio_index: 0,
    audio_target_key: 'manychat:native-mid-123',
    platform: 'manychat',
    channel: 'whatsapp',
  })
  assert.equal('audio_url' in body, false)
})

test('falha no download ManyChat encerra antes do backend', async () => {
  const harness = createBackgroundHarness({ mediaReady: false })

  const result = await harness.listener({
    source: 'YOLEN_COMPANION',
    action: 'TRANSCRIBE_MANYCHAT_AUDIO',
    baseUrl: BASE_URL,
    payload: {
      audio_url: 'https://manybot-files.manychat.io/3678277/wa/audio.ogg',
      cycle_id: 'cycle-123',
      audio_target_key: 'manychat:native-mid-123',
      channel: 'whatsapp',
      audio_index: 0,
    },
  })

  assert.equal(result.ok, false)
  assert.equal(result.statusCode, 403)
  assert.equal(result.payload.status, 'MANYCHAT_AUDIO_FETCH_FAILED')
  assert.equal(result.payload.transport.ready, false)
  assert.equal(harness.fetchCalls.length, 0)
})
