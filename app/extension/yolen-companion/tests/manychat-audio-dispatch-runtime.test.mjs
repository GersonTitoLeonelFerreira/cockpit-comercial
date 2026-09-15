import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const runtime = require('../src/manychat-audio-dispatch-runtime.js')

const RAW_MID = 'wa-message-sensitive-native-id'
const AUDIO_URL = 'https://manybot-files.manychat.io/3678277/wa/audio.ogg'
const TARGET_DIGEST = createHash('sha256').update(RAW_MID).digest('hex')

function documentWith(nodes) {
  return {
    querySelectorAll(selector) {
      assert.equal(selector, runtime.MESSAGE_SELECTOR)
      return nodes
    },
  }
}

function installEvidenceStubs() {
  globalThis.YolenManyChatMessageIdentity = {
    extractManyChatMessageIdentity(node) {
      return {
        ready: node.ready !== false,
        message_key_eligible: node.ready !== false,
        native_message_id: node.mid ?? RAW_MID,
        author_kind: node.author_kind ?? 'customer',
        direction: node.direction ?? 'incoming',
        occurred_at: '2026-09-14T22:30:00.000Z',
      }
    },
  }

  globalThis.YolenManyChatAudioSource = {
    extractManyChatAudioSource(node) {
      return {
        source_ready: node.source_ready !== false,
        source_kind: 'https',
        source_url: node.audio_url ?? AUDIO_URL,
        mime_type: 'audio/ogg',
        duration_seconds: 25.24,
      }
    },
  }
}

function cleanupGlobals() {
  delete globalThis.YolenManyChatMessageIdentity
  delete globalThis.YolenManyChatAudioSource
  delete globalThis.browser
  delete globalThis.chrome
}

test.afterEach(cleanupGlobals)

test('seleciona um único áudio validado e deriva target key SHA-256 sem expor data-mid bruto', async () => {
  installEvidenceStubs()

  const selected = await runtime.findSingleAudioCandidate(
    documentWith([{ mid: RAW_MID }]),
  )

  assert.equal(selected.ready, true)
  assert.equal(selected.candidate_count, 1)
  assert.equal(
    selected.candidate.audio_target_key,
    `manychat:sha256:${TARGET_DIGEST}`,
  )
  assert.equal(selected.candidate.audio_url, AUDIO_URL)
  assert.equal(selected.candidate.author_kind, 'customer')
  assert.equal(selected.candidate.direction, 'incoming')
  assert.equal(JSON.stringify(selected).includes(RAW_MID), false)
})

test('falha fechado quando não existe ou existe mais de um áudio validado', async () => {
  installEvidenceStubs()

  const none = await runtime.findSingleAudioCandidate(documentWith([]))
  assert.equal(none.ready, false)
  assert.equal(none.reason, 'validated_audio_message_not_found')
  assert.equal(none.candidate_count, 0)

  const ambiguous = await runtime.findSingleAudioCandidate(
    documentWith([{ mid: 'mid-a' }, { mid: 'mid-b' }]),
  )
  assert.equal(ambiguous.ready, false)
  assert.equal(ambiguous.reason, 'validated_audio_message_ambiguous')
  assert.equal(ambiguous.candidate_count, 2)
})

test('dispatch envia URL somente ao background, usa target key hash e devolve view sem texto/URL/raw mid', async () => {
  installEvidenceStubs()
  const messages = []

  globalThis.browser = {
    runtime: {
      async sendMessage(message) {
        messages.push(message)
        return {
          ok: true,
          statusCode: 200,
          payload: {
            ok: true,
            data: {
              text: 'conteúdo sensível da transcrição',
              event_type: 'companion_audio_transcribed',
              platform: 'manychat',
              channel: 'whatsapp',
              already_transcribed: false,
              audio_size_bytes: 59817,
            },
          },
          transport: {
            ready: true,
            mime_type: 'audio/ogg',
            size_bytes: 59817,
            privacy: {
              raw_audio_url_exposed: false,
              raw_audio_base64_exposed: false,
              raw_sha256_exposed: false,
            },
          },
        }
      },
    },
  }

  const result = await runtime.dispatchCurrentAudio({
    cycle_id: 'cycle-123',
    channel: 'whatsapp',
    document: documentWith([{ mid: RAW_MID }]),
  })

  assert.equal(messages.length, 1)
  assert.deepEqual(messages[0], {
    source: 'YOLEN_COMPANION',
    action: 'TRANSCRIBE_MANYCHAT_AUDIO',
    payload: {
      audio_url: AUDIO_URL,
      cycle_id: 'cycle-123',
      audio_target_key: `manychat:sha256:${TARGET_DIGEST}`,
      channel: 'whatsapp',
      audio_index: 0,
    },
  })

  assert.equal(result.ok, true)
  assert.equal(result.backend.transcription_present, true)
  assert.equal(result.backend.transcription_length, 32)
  assert.equal(result.backend.audio_size_bytes, 59817)
  assert.equal(result.audio.target_key_scheme, 'manychat:sha256')

  const safe = JSON.stringify(result)
  assert.equal(safe.includes(AUDIO_URL), false)
  assert.equal(safe.includes(RAW_MID), false)
  assert.equal(safe.includes('conteúdo sensível da transcrição'), false)
  assert.equal(result.privacy.raw_audio_url_exposed, false)
  assert.equal(result.privacy.raw_native_message_id_exposed, false)
  assert.equal(result.privacy.raw_transcription_exposed, false)
})

test('requisição inválida ou DOM ambíguo não chama o background', async () => {
  installEvidenceStubs()
  let calls = 0

  globalThis.browser = {
    runtime: {
      async sendMessage() {
        calls += 1
        return { ok: true, statusCode: 200, payload: { ok: true } }
      },
    },
  }

  const missingCycle = await runtime.dispatchCurrentAudio({
    channel: 'whatsapp',
    document: documentWith([{ mid: RAW_MID }]),
  })
  assert.equal(missingCycle.ok, false)
  assert.equal(missingCycle.reason, 'cycle_id_required')

  const invalidChannel = await runtime.dispatchCurrentAudio({
    cycle_id: 'cycle-123',
    channel: 'Whats App!',
    document: documentWith([{ mid: RAW_MID }]),
  })
  assert.equal(invalidChannel.ok, false)
  assert.equal(invalidChannel.reason, 'channel_invalid')

  const ambiguous = await runtime.dispatchCurrentAudio({
    cycle_id: 'cycle-123',
    channel: 'whatsapp',
    document: documentWith([{ mid: 'mid-a' }, { mid: 'mid-b' }]),
  })
  assert.equal(ambiguous.ok, false)
  assert.equal(ambiguous.reason, 'validated_audio_message_ambiguous')
  assert.equal(calls, 0)
})

test('probe visual só aparece no hash explícito e somente clique confiável dispara rede', async () => {
  installEvidenceStubs()
  let calls = 0

  globalThis.browser = {
    runtime: {
      async sendMessage() {
        calls += 1
        return {
          ok: false,
          statusCode: 404,
          payload: {
            ok: false,
            error: 'Ciclo não encontrado ou sem permissão.',
          },
          transport: {
            ready: true,
            mime_type: 'audio/ogg',
            size_bytes: 59817,
          },
        }
      },
    },
  }

  let clickHandler = null
  let appended = null
  const button = {
    id: '',
    type: '',
    textContent: '',
    disabled: false,
    dataset: {},
    style: {},
    setAttribute() {},
    addEventListener(type, handler) {
      assert.equal(type, 'click')
      clickHandler = handler
    },
  }

  const fakeDocument = {
    body: {
      appendChild(node) {
        appended = node
      },
    },
    getElementById() {
      return null
    },
    createElement(tag) {
      assert.equal(tag, 'button')
      return button
    },
    querySelectorAll(selector) {
      assert.equal(selector, runtime.MESSAGE_SELECTOR)
      return [{ mid: RAW_MID }]
    },
  }

  const inactive = runtime.installDiagnosticProbe({
    window: { location: { hash: '' } },
    document: fakeDocument,
  })
  assert.equal(inactive, null)
  assert.equal(appended, null)

  const installed = runtime.installDiagnosticProbe({
    window: { location: { hash: runtime.PROBE_HASH } },
    document: fakeDocument,
  })
  assert.equal(installed, button)
  assert.equal(appended, button)
  assert.equal(typeof clickHandler, 'function')

  await clickHandler({ isTrusted: false })
  assert.equal(calls, 0)

  await clickHandler({ isTrusted: true })
  assert.equal(calls, 1)
  assert.equal(button.dataset.yolenProbePassed, 'true')
  assert.match(button.textContent, /transporte OK/)

  const safe = JSON.parse(button.dataset.yolenProbeResult)
  assert.equal(safe.backend.status_code, 404)
  assert.equal(safe.backend.transport.ready, true)
  assert.equal(safe.backend.transcription_present, false)
  assert.equal(JSON.stringify(safe).includes(AUDIO_URL), false)
  assert.equal(JSON.stringify(safe).includes(RAW_MID), false)
})
