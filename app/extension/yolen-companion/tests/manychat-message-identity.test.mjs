import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
require('../src/manychat-message-semantics.js')
const identity = require('../src/manychat-message-identity.js')

function messageNode({
  classes = [],
  title = '2026-09-14T20:30:00',
  mids = [],
} = {}) {
  const midNodes = mids.map((mid) => ({
    getAttribute(name) {
      return name === 'data-mid' ? mid : null
    },
  }))

  return {
    classList: classes,
    getAttribute(name) {
      if (name === 'class') return classes.join(' ')
      if (name === 'data-title') return title
      return null
    },
    querySelectorAll(selector) {
      return selector === '[data-mid]' ? midNodes : []
    },
  }
}

test('cliente com um data-mid e timestamp válido fica elegível para message_key', () => {
  const result = identity.extractManyChatMessageIdentity(
    messageNode({
      classes: ['_wrapper_hash', '_typeIn_hash'],
      mids: ['native-incoming-message-id'],
    }),
  )

  assert.equal(result.ready, true)
  assert.equal(result.author_kind, 'customer')
  assert.equal(result.direction, 'incoming')
  assert.equal(result.identity_source, 'data-mid')
  assert.equal(result.native_message_id, 'native-incoming-message-id')
  assert.equal(result.native_message_id_count, 1)
  assert.equal(result.message_key_eligible, true)
  assert.equal(result.occurred_at, '2026-09-14T20:30:00.000Z')
})

test('atendente humano usa o mesmo gate de identidade nativa', () => {
  const result = identity.extractManyChatMessageIdentity(
    messageNode({
      classes: ['_wrapper_hash', '_typeOut_hash'],
      mids: ['native-human-message-id'],
    }),
  )

  assert.equal(result.ready, true)
  assert.equal(result.author_kind, 'human_agent')
  assert.equal(result.direction, 'outgoing')
  assert.equal(result.identity_source, 'data-mid')
  assert.equal(result.message_key_eligible, true)
})

test('automação continua bloqueada mesmo com timestamp válido', () => {
  const result = identity.extractManyChatMessageIdentity(
    messageNode({
      classes: ['_typeOut_hash', '_botMessage_hash'],
      mids: [],
    }),
  )

  assert.equal(result.author_kind, 'automation')
  assert.equal(result.ready, false)
  assert.equal(result.reason, 'automation_native_identity_not_validated')
  assert.equal(result.message_key_eligible, false)
  assert.equal(result.native_message_id, null)
})

test('mais de um data-mid falha fechado como identidade ambígua', () => {
  const result = identity.extractManyChatMessageIdentity(
    messageNode({
      classes: ['_typeIn_hash'],
      mids: ['mid-1', 'mid-2'],
    }),
  )

  assert.equal(result.ready, false)
  assert.equal(result.reason, 'native_message_id_ambiguous')
  assert.equal(result.native_message_id_count, 2)
  assert.equal(result.message_key_eligible, false)
})

test('timestamp ausente ou inválido impede identidade pronta', () => {
  for (const title of [null, 'nao-e-data']) {
    const result = identity.extractManyChatMessageIdentity(
      messageNode({
        classes: ['_typeIn_hash'],
        title,
        mids: ['mid-1'],
      }),
    )

    assert.equal(result.ready, false)
    assert.equal(result.message_key_eligible, false)
  }
})

test('safe view não expõe data-mid bruto', () => {
  const raw = identity.extractManyChatMessageIdentity(
    messageNode({
      classes: ['_typeIn_hash'],
      mids: ['secret-native-id-123456'],
    }),
  )
  const safe = identity.safeManyChatMessageIdentityView(raw)
  const serialized = JSON.stringify(safe)

  assert.equal(safe.native_message_id_present, true)
  assert.equal(safe.native_message_id_length, 'secret-native-id-123456'.length)
  assert.equal(safe.privacy.raw_message_id_exposed, false)
  assert.doesNotMatch(serialized, /secret-native-id-123456/)
})

test('sumário reproduz cobertura autenticada 6 cliente / 12 humano / 2 automação', () => {
  const nodes = [
    ...Array.from({ length: 6 }, (_, index) =>
      messageNode({
        classes: ['_typeIn_hash'],
        mids: [`customer-mid-${index}`],
      }),
    ),
    ...Array.from({ length: 12 }, (_, index) =>
      messageNode({
        classes: ['_typeOut_hash'],
        mids: [`human-mid-${index}`],
      }),
    ),
    ...Array.from({ length: 2 }, () =>
      messageNode({
        classes: ['_typeOut_hash', '_botMessage_hash'],
        mids: [],
      }),
    ),
  ]

  const summary = identity.summarizeManyChatMessageIdentity(nodes)

  assert.equal(summary.total, 20)
  assert.equal(summary.customer_total, 6)
  assert.equal(summary.customer_ready, 6)
  assert.equal(summary.human_agent_total, 12)
  assert.equal(summary.human_agent_ready, 12)
  assert.equal(summary.automation_total, 2)
  assert.equal(summary.automation_ready, 0)
  assert.equal(summary.unknown_total, 0)
  assert.equal(summary.timestamp_ready, 20)
  assert.equal(summary.privacy.raw_message_id_exposed, false)
})
