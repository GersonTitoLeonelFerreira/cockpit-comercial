import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const gate = require('../src/manychat-profile-gate.js')

function evidenceSnapshot(overrides = {}) {
  return {
    schema_version: 'yolen-manychat-evidence-v1',
    platform: 'manychat',
    supported: true,
    reason: null,
    observed_at: '2026-09-14T14:30:00-03:00',
    surface: {
      supported: true,
      platform: 'manychat',
      channel: 'unknown',
      conversation_key: 'manychat:unknown:fb123%3Achat%3A456',
      external_conversation_id: 'fb123:chat:456',
    },
    summary: {
      candidate_count: 7,
      tags: {},
      roles: {},
      attributes: {},
    },
    candidates: [
      {
        tag: 'div',
        attributes: { role: 'main' },
        ancestors: [],
      },
      {
        tag: 'span',
        attributes: { 'data-testid': 'channel-badge' },
        ancestors: [],
      },
      {
        tag: 'div',
        attributes: { 'data-testid': 'contact-card' },
        ancestors: [],
      },
      {
        tag: 'button',
        attributes: { 'data-testid': 'assignment-control' },
        ancestors: [],
      },
      {
        tag: 'div',
        attributes: { 'data-testid': 'message-row' },
        ancestors: [],
      },
      {
        tag: 'div',
        attributes: { 'data-testid': 'message-row' },
        ancestors: [],
      },
      {
        tag: 'textarea',
        attributes: { 'data-testid': 'reply-box' },
        ancestors: [],
      },
    ],
    privacy: {
      text_content_collected: false,
      input_values_collected: false,
      network_sent: false,
      persisted: false,
    },
    ...overrides,
  }
}

function fullMapping() {
  return {
    conversationRoot: { candidate_index: 0, attribute: 'role' },
    channel: { candidate_index: 1, attribute: 'data-testid' },
    contact: { candidate_index: 2, attribute: 'data-testid' },
    assignment: { candidate_index: 3, attribute: 'data-testid' },
    messages: { candidate_index: 4, attribute: 'data-testid' },
    composer: { candidate_index: 6, attribute: 'data-testid' },
  }
}

function structuralManyChatSnapshot() {
  const root = {
    tag: 'div',
    attributes: { 'data-test-id': 'chat-messages-list' },
    attribute_presence: [],
    ancestors: [],
  }
  const lane = {
    tag: 'div',
    attributes: {},
    attribute_presence: [],
    ancestors: [root],
  }
  const message = () => ({
    tag: 'div',
    attributes: {},
    attribute_presence: [
      'data-title-at',
      'data-title-offset-bottom',
      'data-title',
    ],
    ancestors: [lane, root],
  })

  return evidenceSnapshot({
    summary: {
      candidate_count: 3,
      tags: { div: 3 },
      roles: {},
      attributes: { 'data-test-id': 1 },
      attribute_presence: {
        'data-title-at': 2,
        'data-title-offset-bottom': 2,
        'data-title': 2,
      },
    },
    candidates: [root, message(), message()],
  })
}

function structuralMapping() {
  return {
    conversationRoot: { candidate_index: 0, attribute: 'data-test-id' },
    messages: {
      mode: 'attribute_presence',
      relation: 'grandchild_of_conversation_root',
      candidate_index: 1,
      presence_attributes: [
        'data-title-at',
        'data-title-offset-bottom',
        'data-title',
      ],
    },
  }
}

test('gera candidato de profile somente a partir de atributos realmente observados', () => {
  const result = gate.buildEvidenceBoundProfileCandidate(
    evidenceSnapshot(),
    fullMapping(),
  )

  assert.equal(result.platform, 'manychat')
  assert.equal(result.selectors.conversationRoot, 'div[role="main"]')
  assert.equal(result.selectors.messages, 'div[data-testid="message-row"]')
  assert.equal(result.bindings.messages.observed_match_count, 2)
  assert.match(result.fingerprint, /^mc-profile-[0-9a-f]{8}$/)
})

test('gera seletor relacional de mensagens a partir de presença estrutural observada', () => {
  const result = gate.buildEvidenceBoundProfileCandidate(
    structuralManyChatSnapshot(),
    structuralMapping(),
  )

  assert.equal(
    result.selectors.conversationRoot,
    'div[data-test-id="chat-messages-list"]',
  )
  assert.equal(
    result.selectors.messages,
    ':scope > div > div[data-title-at][data-title-offset-bottom][data-title]',
  )
  assert.equal(result.bindings.messages.mode, 'attribute_presence')
  assert.equal(result.bindings.messages.observed_match_count, 2)
})

test('seletor relacional exige evidência de que a mensagem é neta do conversationRoot', () => {
  const snapshot = structuralManyChatSnapshot()
  snapshot.candidates[1] = {
    ...snapshot.candidates[1],
    ancestors: [
      snapshot.candidates[1].ancestors[0],
      {
        tag: 'div',
        attributes: { 'data-test-id': 'outro-root' },
        attribute_presence: [],
      },
    ],
  }

  assert.throws(
    () => gate.buildEvidenceBoundProfileCandidate(snapshot, structuralMapping()),
    (error) => error.code === 'CONVERSATION_ROOT_RELATION_NOT_OBSERVED',
  )
})

test('candidato nunca sai aprovado para runtime, captura, persistência ou reasoning', () => {
  const result = gate.buildEvidenceBoundProfileCandidate(
    evidenceSnapshot(),
    fullMapping(),
  )

  assert.equal(result.approved_for_runtime, false)
  assert.equal(result.capture_enabled, false)
  assert.equal(result.persistence_enabled, false)
  assert.equal(result.reasoning_enabled, false)
  assert.equal(result.requires_authenticated_dom_validation, true)
})

test('fingerprint depende da estrutura e não da identidade individual da conversa', () => {
  const first = gate.buildEvidenceBoundProfileCandidate(
    evidenceSnapshot(),
    fullMapping(),
  )

  const second = gate.buildEvidenceBoundProfileCandidate(
    evidenceSnapshot({
      surface: {
        supported: true,
        platform: 'manychat',
        channel: 'unknown',
        conversation_key: 'manychat:unknown:fb999%3Achat%3A888',
        external_conversation_id: 'fb999:chat:888',
      },
    }),
    fullMapping(),
  )

  assert.equal(first.fingerprint, second.fingerprint)
})

test('recusa snapshot que declara coleta de texto, valor de input, rede ou persistência', () => {
  for (const field of [
    'text_content_collected',
    'input_values_collected',
    'network_sent',
    'persisted',
  ]) {
    const snapshot = evidenceSnapshot()
    snapshot.privacy = { ...snapshot.privacy, [field]: true }

    assert.throws(
      () => gate.buildEvidenceBoundProfileCandidate(snapshot, fullMapping()),
      (error) => error.code === 'UNSAFE_EVIDENCE_SNAPSHOT',
    )
  }
})

test('recusa seletor inventado que não aparece no candidato observado', () => {
  const mapping = fullMapping()
  mapping.channel = { candidate_index: 1, attribute: 'role' }

  assert.throws(
    () => gate.buildEvidenceBoundProfileCandidate(evidenceSnapshot(), mapping),
    (error) => error.code === 'ATTRIBUTE_NOT_OBSERVED',
  )
})

test('recusa atributo fora da allowlist estrutural', () => {
  const snapshot = evidenceSnapshot()
  snapshot.candidates[1] = {
    ...snapshot.candidates[1],
    attributes: {
      ...snapshot.candidates[1].attributes,
      style: 'background:red',
    },
  }

  const mapping = fullMapping()
  mapping.channel = { candidate_index: 1, attribute: 'style' }

  assert.throws(
    () => gate.buildEvidenceBoundProfileCandidate(snapshot, mapping),
    (error) => error.code === 'UNSAFE_SELECTOR_ATTRIBUTE',
  )
})

test('recusa valor redigido como seletor de runtime', () => {
  const snapshot = evidenceSnapshot()
  snapshot.candidates[1] = {
    tag: 'span',
    attributes: { 'data-testid': '[redacted-id]' },
    ancestors: [],
  }

  assert.throws(
    () => gate.buildEvidenceBoundProfileCandidate(snapshot, fullMapping()),
    (error) => error.code === 'REDACTED_SELECTOR_VALUE',
  )
})

test('bindings individuais precisam ser únicos no snapshot observado', () => {
  const snapshot = evidenceSnapshot()
  snapshot.candidates.push({
    tag: 'span',
    attributes: { 'data-testid': 'channel-badge' },
    ancestors: [],
  })

  assert.throws(
    () => gate.buildEvidenceBoundProfileCandidate(snapshot, fullMapping()),
    (error) => error.code === 'NON_UNIQUE_OBSERVED_SELECTOR',
  )
})

test('messages pode representar coleção observada, mas conversationRoot e messages são obrigatórios', () => {
  const minimal = {
    conversationRoot: { candidate_index: 0, attribute: 'role' },
    messages: { candidate_index: 4, attribute: 'data-testid' },
  }

  const result = gate.buildEvidenceBoundProfileCandidate(
    evidenceSnapshot(),
    minimal,
  )

  assert.equal(result.selectors.channel, null)
  assert.equal(result.selectors.contact, null)
  assert.equal(result.selectors.assignment, null)
  assert.equal(result.selectors.composer, null)

  assert.throws(
    () =>
      gate.buildEvidenceBoundProfileCandidate(evidenceSnapshot(), {
        conversationRoot: minimal.conversationRoot,
      }),
    (error) => error.code === 'REQUIRED_BINDING_MISSING',
  )
})

test('recusa snapshot fora do namespace ManyChat', () => {
  const snapshot = evidenceSnapshot()
  snapshot.surface = {
    ...snapshot.surface,
    conversation_key: 'whatsapp:+5547999990001',
  }

  assert.throws(
    () => gate.buildEvidenceBoundProfileCandidate(snapshot, fullMapping()),
    (error) => error.code === 'INVALID_CONVERSATION_NAMESPACE',
  )
})
