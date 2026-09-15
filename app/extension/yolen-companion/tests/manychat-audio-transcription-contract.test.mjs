import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
require('../src/platform-contract.js')
require('../src/manychat-message-semantics.js')
require('../src/manychat-message-identity.js')
require('../src/manychat-message-content.js')
require('../src/manychat-audio-source.js')
require('../src/manychat-audio-accessibility.js')
const contract = require('../src/manychat-audio-transcription-contract.js')

const AUDIO_BYTES = Buffer.concat([
  Buffer.from('OggS'),
  Buffer.alloc(124, 1),
])
const AUDIO_BASE64 = AUDIO_BYTES.toString('base64')
const AUDIO_SHA256 = createHash('sha256').update(AUDIO_BYTES).digest('hex')
const AUDIO_SIZE = AUDIO_BYTES.length

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
  mid = 'native-manychat-audio-id',
  currentSrc = 'https://manybot-files.example.test/audio.ogg',
  duration = 25.24,
} = {}) {
  const source = sourceNode({ src: currentSrc, type: 'audio/mpeg' })
  const audio = {
    currentSrc,
    src: '',
    duration,
    querySelectorAll(selector) {
      return selector === 'source' ? [source] : []
    },
  }

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
  classes = ['_wrapper_hash', '_typeIn_hash'],
  mid = 'native-manychat-audio-id',
} = {}) {
  const native = nativeNode({ mid })

  return {
    classList: classes,
    getAttribute(name) {
      if (name === 'class') return classes.join(' ')
      if (name === 'data-title') return '2026-09-14T20:30:00'
      return null
    },
    querySelectorAll(selector) {
      if (selector === '[data-mid]') return [native]
      return []
    },
  }
}

function accessibilityProbe(overrides = {}) {
  return {
    http_code: 206,
    content_type: 'audio/ogg',
    detected_mime: 'audio/ogg',
    source_mime_hint: 'audio/mpeg',
    bytes_downloaded: AUDIO_SIZE,
    sha256: AUDIO_SHA256,
    accept_ranges: 'bytes',
    ...overrides,
  }
}

function validPlanInput(overrides = {}) {
  return {
    node: messageNode(),
    cycle_id: 'cycle-123',
    audio_base64: AUDIO_BASE64,
    accessibility_probe: accessibilityProbe(),
    channel: 'whatsapp',
    ...overrides,
  }
}

test('plano usa MIME canônico, contexto ManyChat e vincula os bytes reais ao probe', async () => {
  const plan = await contract.buildManyChatAudioTranscriptionPlan(validPlanInput())

  assert.equal(plan.ready, true)
  assert.equal(plan.reason, null)
  assert.equal(plan.platform, 'manychat')
  assert.equal(plan.channel, 'whatsapp')
  assert.equal(plan.author_kind, 'customer')
  assert.equal(plan.direction, 'incoming')
  assert.equal(plan.message_key, 'manychat:native-manychat-audio-id')
  assert.equal(plan.canonical_mime, 'audio/ogg')
  assert.equal(plan.audio_digest_bound, true)
  assert.equal(plan.audio_size_bound, true)
  assert.equal(plan.request_payload.audio_base64, AUDIO_BASE64)
  assert.equal(plan.request_payload.mime_type, 'audio/ogg')
  assert.equal(plan.request_payload.file_name, 'manychat-audio.ogg')
  assert.equal(plan.request_payload.audio_target_key, plan.message_key)
  assert.equal(plan.request_payload.platform, 'manychat')
  assert.equal(plan.request_payload.channel, 'whatsapp')
  assert.equal(plan.endpoint, '/api/companion/transcribe-audio')
  assert.equal(plan.dispatch_enabled, false)
  assert.equal(plan.persistence_enabled, false)
  assert.equal(plan.reasoning_enabled, false)
})

test('resultado de transcrição válido entra no contrato universal sem perder identidade e autoria sidecar', () => {
  const node = messageNode()
  const result = contract.applyManyChatAudioTranscriptionResult({
    node,
    transcription_response: {
      ok: true,
      data: {
        text: 'Quero saber o valor do plano.',
        event_type: 'companion_audio_transcribed',
        platform: 'manychat',
        channel: 'whatsapp',
        occurred_at: '2026-09-14T20:31:00.000Z',
        audio_size_bytes: AUDIO_SIZE,
      },
    },
  })

  assert.equal(result.ready, true)
  assert.equal(result.reason, null)
  assert.equal(result.author_kind, 'customer')
  assert.equal(result.customer_evidence_eligible, true)
  assert.equal(result.seller_action_eligible, false)
  assert.equal(result.reasoning_evidence_eligible, true)
  assert.deepEqual(result.normalized_message, {
    message_key: 'manychat:native-manychat-audio-id',
    direction: 'incoming',
    occurred_at: '2026-09-14T20:30:00.000Z',
    content_type: 'audio',
    text_content: null,
    audio_transcription: 'Quero saber o valor do plano.',
    is_deleted: false,
    deletion_reason: null,
  })
  assert.equal(result.persistence_enabled, false)
  assert.equal(result.reasoning_enabled, false)
})

test('autoria humana de saída continua seller action e nunca customer evidence', () => {
  const result = contract.applyManyChatAudioTranscriptionResult({
    node: messageNode({
      classes: ['_wrapper_hash', '_typeOut_hash'],
      mid: 'seller-audio-id',
    }),
    transcription_response: {
      ok: true,
      data: { text: 'Posso te explicar as opções.' },
    },
  })

  assert.equal(result.ready, true)
  assert.equal(result.author_kind, 'human_agent')
  assert.equal(result.customer_evidence_eligible, false)
  assert.equal(result.seller_action_eligible, true)
  assert.equal(result.normalized_message.direction, 'outgoing')
})

test('automação permanece bloqueada e não recebe message_key sintético', async () => {
  const plan = await contract.buildManyChatAudioTranscriptionPlan(
    validPlanInput({
      node: messageNode({
        classes: ['_wrapper_hash', '_typeOut_hash', '_botMessage_hash'],
        mid: 'automation-id-that-must-not-be-used',
      }),
    }),
  )

  assert.equal(plan.ready, false)
  assert.equal(plan.author_kind, 'automation')
  assert.equal(plan.message_key, null)
  assert.equal(plan.dispatch_enabled, false)
})

test('channel inválido falha fechado antes de preparar payload', async () => {
  const plan = await contract.buildManyChatAudioTranscriptionPlan(
    validPlanInput({
      channel: 'whats app',
    }),
  )

  assert.equal(plan.ready, false)
  assert.equal(plan.reason, 'channel_invalid')
  assert.equal(plan.request_payload, null)
})

test('probe de acessibilidade inválido bloqueia preparação do payload', async () => {
  const plan = await contract.buildManyChatAudioTranscriptionPlan(
    validPlanInput({
      accessibility_probe: accessibilityProbe({
        detected_mime: 'text/html',
      }),
    }),
  )

  assert.equal(plan.ready, false)
  assert.equal(plan.reason, 'detected_mime_not_audio')
  assert.equal(plan.request_payload, null)
})

test('bytes diferentes do probe falham pelo tamanho antes do digest', async () => {
  const differentBytes = Buffer.concat([AUDIO_BYTES, Buffer.from([2])])
  const plan = await contract.buildManyChatAudioTranscriptionPlan(
    validPlanInput({
      audio_base64: differentBytes.toString('base64'),
    }),
  )

  assert.equal(plan.ready, false)
  assert.equal(plan.reason, 'audio_size_mismatch')
  assert.equal(plan.audio_size_bound, false)
  assert.equal(plan.request_payload, null)
})

test('bytes de mesmo tamanho mas conteúdo diferente falham pelo SHA-256', async () => {
  const differentBytes = Buffer.from(AUDIO_BYTES)
  differentBytes[differentBytes.length - 1] = 2

  const plan = await contract.buildManyChatAudioTranscriptionPlan(
    validPlanInput({
      audio_base64: differentBytes.toString('base64'),
    }),
  )

  assert.equal(plan.ready, false)
  assert.equal(plan.reason, 'audio_digest_mismatch')
  assert.equal(plan.audio_size_bound, true)
  assert.equal(plan.audio_digest_bound, false)
  assert.equal(plan.request_payload, null)
})

test('base64 inválido nunca gera payload', async () => {
  const plan = await contract.buildManyChatAudioTranscriptionPlan(
    validPlanInput({
      audio_base64: '***não-é-base64***',
    }),
  )

  assert.equal(plan.ready, false)
  assert.equal(plan.reason, 'audio_base64_invalid')
  assert.equal(plan.request_payload, null)
})

test('resposta vazia ou com erro nunca produz mensagem normalizada', () => {
  const failed = contract.applyManyChatAudioTranscriptionResult({
    node: messageNode(),
    transcription_response: {
      ok: false,
      error: 'falhou',
    },
  })

  assert.equal(failed.ready, false)
  assert.equal(failed.reason, 'transcription_response_invalid')
  assert.equal(failed.normalized_message, null)
})

test('safe view não expõe base64, digest ou identidade bruta', async () => {
  const plan = await contract.buildManyChatAudioTranscriptionPlan(
    validPlanInput({
      node: messageNode({ mid: 'secret-native-id' }),
    }),
  )
  const safe = contract.safeManyChatAudioTranscriptionPlanView(plan)
  const serialized = JSON.stringify(safe)

  assert.equal(safe.ready, true)
  assert.equal(safe.channel, 'whatsapp')
  assert.equal(safe.request_platform, 'manychat')
  assert.equal(safe.request_channel, 'whatsapp')
  assert.equal(safe.audio_base64_present, true)
  assert.equal(safe.message_key_present, true)
  assert.equal(safe.audio_digest_bound, true)
  assert.equal(safe.audio_size_bound, true)
  assert.equal(safe.dispatch_enabled, false)
  assert.equal(safe.privacy.audio_base64_exposed, false)
  assert.equal(safe.privacy.raw_message_id_exposed, false)
  assert.equal(safe.privacy.raw_sha256_exposed, false)
  assert.doesNotMatch(serialized, new RegExp(AUDIO_BASE64))
  assert.doesNotMatch(serialized, /secret-native-id/)
  assert.doesNotMatch(serialized, new RegExp(AUDIO_SHA256))
})
