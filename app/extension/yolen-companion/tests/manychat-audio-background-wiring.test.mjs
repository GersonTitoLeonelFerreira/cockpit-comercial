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
const MANYCHAT_APP_HOST = 'https://app.manychat.com/*'
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
  const storage = { yolen_companion_session: validSession() }

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
    YolenCompanionCaptureTransport: {
      isUuid() {
        return true
      },
      createDeviceKey() {
        return 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      },
      buildIngestionRequestBody(payload, deviceKey) {
        return { ...payload, device_key: deviceKey }
      },
    },
    YolenManyChatSafeIdentityBackground: {
      async handleIdentityRequest() {
        return {
          ok: false,
          statusCode: 409,
          payload: { ready: false, reason: 'not_stubbed', safe: null },
        }
      },
    },
    YolenManyChatAudioBackgroundTransport: {
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
        if (inputMedia.ready !== true) {
          return { ready: false, reason: 'media_not_ready', payload: null }
        }

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
    },
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
  runInContext(BACKGROUND_SOURCE, context, { filename: 'background.js' })
  assert.equal(typeof listener, 'function')

  return { listener, fetchCalls }
}

test('manifest mantém background correto e ativa somente o runtime mínimo ManyChat', () => {
  assert.deepEqual(MANIFEST.background.scripts, [
    'src/capture-transport.js',
    'src/manychat-audio-background-transport.js',
    'src/manychat-safe-identity-background.js',
    'src/background.js',
  ])
  assert.equal(MANIFEST.host_permissions.includes(MANYCHAT_MEDIA_HOST), true)
  assert.equal(MANIFEST.host_permissions.includes(MANYCHAT_APP_HOST), true)

  const manyChatBlocks = MANIFEST.content_scripts.filter(
    (block) =>
      block.matches?.includes(MANYCHAT_APP_HOST) &&
      block.run_at === 'document_idle' &&
      !block.world,
  )
  assert.equal(manyChatBlocks.length, 1)
  assert.deepEqual(manyChatBlocks[0].js, [
    'src/platform-contract.js',
    'src/manychat-surface.js',
    'src/manychat-context-evidence-probe.js',
    'src/manychat-message-semantics.js',
    'src/manychat-message-identity.js',
    'src/manychat-message-content.js',
    'src/manychat-message-profile.js',
    'src/manychat-dom-reader.js',
    'src/manychat-adapter.js',
    'src/capture-batch.js',
    'src/companion-client-context-view.js',
    'src/companion-seller-information-view.js',
    'src/companion-lead-summary-view.js',
    'src/manychat-feature-flags.js',
    'src/manychat-phone-evidence.js',
    'src/manychat-capture-runtime.js',
    'src/manychat-composer.js',
    'src/manychat-panel-mount.js',
    'src/companion-workspace-runtime.js',
    'src/companion-seller-workspace-view.js',
    'src/manychat-seller-panel-runtime.js',
    'src/manychat-capture-bootstrap.js',
    'src/manychat-audio-source.js',
    'src/manychat-audio-dispatch-runtime.js',
  ])

  assert.equal(
    SERVICE_WORKER_SOURCE.indexOf("'manychat-audio-background-transport.js'") <
      SERVICE_WORKER_SOURCE.indexOf("'background.js'"),
    true,
  )
})

test('allowlist e manifest PROD incluem app, mídia e runtime ManyChat', () => {
  assert.doesNotThrow(() => assertAllowlistMatchesManifest(MANIFEST))
  for (const file of [
    'src/manychat-audio-background-transport.js',
    'src/manychat-audio-dispatch-runtime.js',
    'src/manychat-audio-source.js',
    'src/manychat-message-content.js',
    'src/manychat-message-identity.js',
    'src/manychat-message-semantics.js',
  ]) {
    assert.equal(SHARED_RUNTIME_FILES.includes(file), true)
  }
  assert.equal(PRODUCTION_HOSTS.includes(MANYCHAT_APP_HOST), true)
  assert.equal(PRODUCTION_HOSTS.includes(MANYCHAT_MEDIA_HOST), true)

  for (const target of ['chrome', 'firefox']) {
    const prod = toProductionManifest(MANIFEST, target)
    assert.equal(prod.host_permissions.includes(MANYCHAT_APP_HOST), true)
    assert.equal(prod.host_permissions.includes(MANYCHAT_MEDIA_HOST), true)
    assert.equal(
      prod.host_permissions.some((host) => host.includes('localhost')),
      false,
    )
  }
})

test('TRANSCRIBE_MANYCHAT_AUDIO envia somente payload universal autenticado ao backend', async () => {
  const harness = createBackgroundHarness()

  const result = await harness.listener({
    source: 'YOLEN_COMPANION',
    action: 'TRANSCRIBE_MANYCHAT_AUDIO',
    baseUrl: BASE_URL,
    payload: {
      audio_url: 'https://manybot-files.manychat.io/3678277/wa/audio.ogg',
      cycle_id: 'cycle-123',
      audio_target_key: 'manychat:sha256:abc123',
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
    audio_target_key: 'manychat:sha256:abc123',
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
      audio_target_key: 'manychat:sha256:abc123',
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
