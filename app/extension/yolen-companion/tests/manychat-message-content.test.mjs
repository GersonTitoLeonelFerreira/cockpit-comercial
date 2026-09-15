import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
require('../src/manychat-message-semantics.js')
require('../src/manychat-message-identity.js')
const content = require('../src/manychat-message-content.js')

function element({ text = '', audio = 0, video = 0, image = 0, canvas = 0 } = {}) {
  return {
    textContent: text,
    querySelectorAll(selector) {
      const counts = {
        audio,
        video,
        img: image,
        canvas,
      }
      const count = counts[selector] ?? 0
      return Array.from({ length: count }, () => ({}))
    },
  }
}

function messageNode({
  classes = [],
  title = '2026-09-14T20:30:00',
  mid = 'native-message-id',
  midContent = {},
} = {}) {
  const native = mid === null
    ? null
    : {
        ...element(midContent),
        getAttribute(name) {
          return name === 'data-mid' ? mid : null
        },
      }

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

test('texto humano vem exclusivamente do nó nativo data-mid', () => {
  const result = content.extractManyChatMessageContent(
    messageNode({
      classes: ['_typeIn_hash'],
      mid: 'customer-mid-1',
      midContent: { text: 'Quero saber mais.' },
    }),
  )

  assert.equal(result.content_ready, true)
  assert.equal(result.content_type, 'text')
  assert.equal(result.text_content, 'Quero saber mais.')
  assert.equal(result.content_node_source, 'data-mid')
  assert.equal(result.author_kind, 'customer')
})

test('áudio humano sem texto é reconhecido estruturalmente sem inventar transcrição', () => {
  const result = content.extractManyChatMessageContent(
    messageNode({
      classes: ['_typeIn_hash'],
      mid: 'customer-audio-mid',
      midContent: { text: '', audio: 1 },
    }),
  )

  assert.equal(result.content_ready, true)
  assert.equal(result.content_type, 'audio')
  assert.equal(result.text_content, null)
  assert.equal(result.audio_transcription, null)
  assert.equal(result.content_node_source, 'data-mid')
})

test('automação permanece fora do conteúdo elegível mesmo quando possui texto', () => {
  const result = content.extractManyChatMessageContent(
    messageNode({
      classes: ['_typeOut_hash', '_botMessage_hash'],
      mid: null,
    }),
  )

  assert.equal(result.author_kind, 'automation')
  assert.equal(result.content_ready, false)
  assert.equal(result.reason, 'automation_content_context_only')
})

test('mídia visual ainda não validada falha fechado', () => {
  for (const midContent of [
    { text: '', image: 1 },
    { text: '', video: 1 },
    { text: '', canvas: 1 },
  ]) {
    const result = content.extractManyChatMessageContent(
      messageNode({ classes: ['_typeIn_hash'], midContent }),
    )

    assert.equal(result.content_ready, false)
    assert.equal(result.reason, 'visual_media_content_not_validated')
  }
})

test('áudio misturado com texto falha fechado até validação específica', () => {
  const result = content.extractManyChatMessageContent(
    messageNode({
      classes: ['_typeOut_hash'],
      midContent: { text: 'texto auxiliar', audio: 1 },
    }),
  )

  assert.equal(result.content_ready, false)
  assert.equal(result.reason, 'mixed_audio_text_content_not_validated')
})

test('safe view não expõe o texto bruto', () => {
  const raw = content.extractManyChatMessageContent(
    messageNode({
      classes: ['_typeOut_hash'],
      midContent: { text: 'conteudo-secreto-cliente' },
    }),
  )
  const safe = content.safeManyChatMessageContentView(raw)
  const serialized = JSON.stringify(safe)

  assert.equal(safe.content_ready, true)
  assert.equal(safe.text_present, true)
  assert.equal(safe.text_length, 'conteudo-secreto-cliente'.length)
  assert.equal(safe.privacy.raw_text_exposed, false)
  assert.doesNotMatch(serialized, /conteudo-secreto-cliente/)
})

test('sumário reproduz evidência autenticada 17 textos + 1 áudio + 2 automações', () => {
  const nodes = [
    ...Array.from({ length: 5 }, (_, index) =>
      messageNode({
        classes: ['_typeIn_hash'],
        mid: `customer-text-${index}`,
        midContent: { text: `customer-${index}` },
      }),
    ),
    messageNode({
      classes: ['_typeIn_hash'],
      mid: 'customer-audio',
      midContent: { text: '', audio: 1 },
    }),
    ...Array.from({ length: 12 }, (_, index) =>
      messageNode({
        classes: ['_typeOut_hash'],
        mid: `human-text-${index}`,
        midContent: { text: `human-${index}` },
      }),
    ),
    ...Array.from({ length: 2 }, () =>
      messageNode({
        classes: ['_typeOut_hash', '_botMessage_hash'],
        mid: null,
      }),
    ),
  ]

  const summary = content.summarizeManyChatMessageContent(nodes)

  assert.equal(summary.total, 20)
  assert.equal(summary.human_total, 18)
  assert.equal(summary.text_ready, 17)
  assert.equal(summary.audio_ready, 1)
  assert.equal(summary.automation_total, 2)
  assert.equal(summary.automation_blocked, 2)
  assert.equal(summary.unknown_total, 0)
  assert.equal(summary.not_ready_total, 2)
  assert.equal(summary.privacy.raw_text_exposed, false)
})
