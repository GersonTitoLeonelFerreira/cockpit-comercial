import assert from 'node:assert/strict'
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

function realAccessibilityProbe(overrides = {}) {
  return {
    http_code: 206,
    content_type: 'audio/ogg',
    detected_mime: 'audio/ogg',
    source_mime_hint: 'audio/mpeg',
    bytes_downloaded: 59817,
    sha256: 'd589dcdc0d18fb4db65da008b6e508e9dcb0a09d71da54e9f3d1cf9df5bb96e6',
    accept_ranges: 'bytes',
    ...overrides,
  }
}

test('plano usa MIME canônico detectado e preserva identidade ManyChat sem liberar dispatch', () => {
  const plan = contract.buildManyChatAudioTranscriptionPlan({
    node: messageNode(),
    cycle_id: 'cycle-123',
    audio_base64: 'T2dnUwAAAAA=',
    accessibility_probe: realAccessibilityProbe(),
  })

  assert.equal(plan.ready, true)
  assert.equal(plan.reason, null)
  assert.equal(plan.author_kind, 'customer')
  assert.equal(plan.direction, 'incoming')
  assert.equal(plan.message_key, 'manychat:native-manychat-audio-id')
  assert.equal(plan.canonical_mime, 'audio/ogg')
  assert.equal(plan.request_payload.mime_type, 'audio/ogg')
  assert.equal(plan.request_payload.file_name, 'manychat-audio.ogg')
  assert.equal(plan.request_payload.audio_target_key, plan.message_key)
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
        event_type: 'whatsapp_audio_transcribed',
        occurred_at: '2026-09-14T20:31:00.000Z',
        audio_size_bytes: 59817,
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

test('automação permanece bloqueada e não recebe message_key sintético', () => {
  const plan = contract.buildManyChatAudioTranscriptionPlan({
    node: messageNode({
      classes: ['_wrapper_hash', '_typeOut_hash', '_botMessage_hash'],
      mid: 'automation-id-that-must-not-be-used',
    }),
    cycle_id: 'cycle-123',
    audio_base64: 'T2dnUwAAAAA=',
    accessibility_probe: realAccessibilityProbe(),
  })

  assert.equal(plan.ready, false)
  assert.equal(plan.author_kind, 'automation')
  assert.equal(plan.message_key, null)
  assert.equal(plan.dispatch_enabled, false)
})

test('probe de acessibilidade inválido bloqueia preparação do payload', () => {
  const plan = contract.buildManyChatAudioTranscriptionPlan({
    node: messageNode(),
    cycle_id: 'cycle-123',
    audio_base64: 'T2dnUwAAAAA=',
    accessibility_probe: realAccessibilityProbe({
      detected_mime: 'text/html',
    }),
  })

  assert.equal(plan.ready, false)
  assert.equal(plan.reason, 'detected_mime_not_audio')
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

test('safe view não expõe base64 nem identidade bruta', () => {
  const rawBase64 = 'T2dnUwAAAAA='
  const plan = contract.buildManyChatAudioTranscriptionPlan({
    node: messageNode({ mid: 'secret-native-id' }),
    cycle_id: 'cycle-123',
    audio_base64: rawBase64,
    accessibility_probe: realAccessibilityProbe(),
  })
  const safe = contract.safeManyChatAudioTranscriptionPlanView(plan)
  const serialized = JSON.stringify(safe)

  assert.equal(safe.ready, true)
  assert.equal(safe.audio_base64_present, true)
  assert.equal(safe.message_key_present, true)
  assert.equal(safe.dispatch_enabled, false)
  assert.equal(safe.privacy.audio_base64_exposed, false)
  assert.equal(safe.privacy.raw_message_id_exposed, false)
  assert.doesNotMatch(serialized, /T2dnUwAAAAA=/)
  assert.doesNotMatch(serialized, /secret-native-id/)
})
