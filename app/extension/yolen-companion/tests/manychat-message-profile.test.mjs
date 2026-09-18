import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
require('../src/manychat-message-semantics.js')
require('../src/manychat-message-identity.js')
require('../src/manychat-message-content.js')
const profile = require('../src/manychat-message-profile.js')

function nativeNode({ mid = 'native-id', textContent = '', mediaCounts = {} } = {}) {
  const counts = {
    audio: 0,
    video: 0,
    image: 0,
    canvas: 0,
    ...mediaCounts,
  }

  return {
    textContent,
    getAttribute(name) {
      return name === 'data-mid' ? mid : null
    },
    querySelectorAll(selector) {
      return Array.from({ length: counts[selector] ?? 0 }, () => ({}))
    },
  }
}

function messageNode({
  classes = ['_wrapper_hash', '_typeIn_hash'],
  title = '2026-09-14T20:30:00',
  natives = [nativeNode()],
} = {}) {
  return {
    classList: classes,
    getAttribute(name) {
      if (name === 'class') return classes.join(' ')
      if (name === 'data-title') return title
      return null
    },
    querySelectorAll(selector) {
      if (selector === '[data-mid]') return natives
      return []
    },
  }
}

test('mensagem de cliente (typeIn) elegível vira mensagem canônica text', () => {
  const message = profile.readManyChatMessage(
    messageNode({
      classes: ['_wrapper_hash', '_typeIn_hash'],
      natives: [nativeNode({ mid: 'customer-msg-1', textContent: 'Quero saber o preço.' })],
    }),
  )

  assert.deepEqual(message, {
    message_key: 'manychat:customer-msg-1',
    direction: 'incoming',
    author_kind: 'customer',
    occurred_at: '2026-09-14T20:30:00.000Z',
    content_type: 'text',
    text_content: 'Quero saber o preço.',
    audio_transcription: null,
    is_deleted: false,
    deletion_reason: null,
  })
})

test('mensagem humana de saída (typeOut sem bot) vira human_agent outgoing', () => {
  const message = profile.readManyChatMessage(
    messageNode({
      classes: ['_wrapper_hash', '_typeOut_hash'],
      natives: [nativeNode({ mid: 'seller-msg-1', textContent: 'Posso te ajudar.' })],
    }),
  )

  assert.equal(message.direction, 'outgoing')
  assert.equal(message.author_kind, 'human_agent')
  assert.equal(message.message_key, 'manychat:seller-msg-1')
})

test('mensagem de áudio elegível vira content_type audio sem transcrição', () => {
  const message = profile.readManyChatMessage(
    messageNode({
      natives: [nativeNode({ mid: 'audio-msg-1', textContent: '', mediaCounts: { audio: 1 } })],
    }),
  )

  assert.equal(message.content_type, 'audio')
  assert.equal(message.text_content, null)
  assert.equal(message.audio_transcription, null)
})

test('automação (typeOut + botMessage) nunca vira mensagem canônica', () => {
  const message = profile.readManyChatMessage(
    messageNode({
      classes: ['_wrapper_hash', '_typeOut_hash', '_botMessage_hash'],
      natives: [],
    }),
  )

  assert.equal(message, null)
})

test('direção ambígua (typeIn e typeOut juntos) nunca vira mensagem canônica', () => {
  const message = profile.readManyChatMessage(
    messageNode({ classes: ['_wrapper_hash', '_typeIn_hash', '_typeOut_hash'] }),
  )

  assert.equal(message, null)
})

test('identidade nativa ausente nunca vira mensagem canônica', () => {
  const message = profile.readManyChatMessage(messageNode({ natives: [] }))

  assert.equal(message, null)
})

test('identidade nativa ambígua (mais de um data-mid) nunca vira mensagem canônica', () => {
  const message = profile.readManyChatMessage(
    messageNode({ natives: [nativeNode({ mid: 'a' }), nativeNode({ mid: 'b' })] }),
  )

  assert.equal(message, null)
})

test('timestamp inválido nunca vira mensagem canônica', () => {
  const message = profile.readManyChatMessage(messageNode({ title: 'não-é-uma-data' }))

  assert.equal(message, null)
})

test('mídia visual não suportada nunca vira mensagem canônica', () => {
  const message = profile.readManyChatMessage(
    messageNode({
      natives: [nativeNode({ mid: 'visual-1', mediaCounts: { image: 1 } })],
    }),
  )

  assert.equal(message, null)
})

test('message_key usa o mesmo namespace manychat: usado pela transcrição de áudio', () => {
  assert.equal(profile.buildMessageKey('abc/def'), 'manychat:abc%2Fdef')
  assert.equal(profile.buildMessageKey(''), null)
  assert.equal(profile.buildMessageKey(null), null)
})
