import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const validator = require('../src/manychat-profile-validator.js')

function candidate(overrides = {}) {
  return {
    schema_version: 'yolen-manychat-profile-candidate-v1',
    platform: 'manychat',
    fingerprint: 'mc-profile-a1b2c3d4',
    selectors: {
      conversationRoot: 'div[role="main"]',
      channel: null,
      contact: null,
      assignment: null,
      messages: 'div[data-testid="message-row"]',
      composer: null,
    },
    approved_for_runtime: false,
    capture_enabled: false,
    persistence_enabled: false,
    reasoning_enabled: false,
    requires_authenticated_dom_validation: true,
    ...overrides,
  }
}

function surface(id = 'A') {
  return {
    supported: true,
    conversation_key: `manychat:unknown:account%3Achat%3A${id}`,
  }
}

function dom(messageCount = 2, rootCount = 1) {
  const conversationRoot = {
    querySelectorAll(selector) {
      if (selector === 'div[data-testid="message-row"]') {
        return Array.from({ length: messageCount }, () => ({}))
      }
      return []
    },
  }

  return {
    querySelectorAll(selector) {
      if (selector !== 'div[role="main"]') return []
      return Array.from({ length: rootCount }, () => conversationRoot)
    },
  }
}

test('candidato inseguro não entra na validação', () => {
  assert.throws(
    () => validator.createReadOnlyProfileValidationSession(candidate({ capture_enabled: true })),
    (error) => error.code === 'UNSAFE_PROFILE_CANDIDATE',
  )
})

test('threshold inválido não é relaxado silenciosamente', () => {
  assert.throws(
    () => validator.createReadOnlyProfileValidationSession(candidate(), { minimumPasses: 0 }),
    (error) => error.code === 'INVALID_THRESHOLD',
  )
})

test('observação estrutural válida não lê conteúdo e usa referência anonimizada', () => {
  const result = validator.validateDomObservation(candidate(), {
    document: dom(),
    surface: surface('ABC'),
  })

  assert.equal(result.pass, true)
  assert.equal(result.counts.conversationRoot, 1)
  assert.equal(result.counts.messages, 2)
  assert.match(result.conversation_ref, /^mc-conv-[0-9a-f]{8}$/)
  assert.equal(result.privacy.text_content_read, false)
  assert.equal(result.privacy.input_values_read, false)
})

test('cardinalidade incorreta ou ausência de mensagens falha fechado', () => {
  const multipleRoots = validator.validateDomObservation(candidate(), {
    document: dom(2, 2),
    surface: surface('A'),
  })
  assert.equal(multipleRoots.pass, false)
  assert.equal(multipleRoots.reason, 'conversation_root_cardinality')

  const noMessages = validator.validateDomObservation(candidate(), {
    document: dom(0, 1),
    surface: surface('A'),
  })
  assert.equal(noMessages.pass, false)
  assert.equal(noMessages.reason, 'messages_not_observed')
})

test('aprovação read-only exige três passes em pelo menos duas conversas', () => {
  const session = validator.createReadOnlyProfileValidationSession(candidate())

  session.observe({ document: dom(), surface: surface('A') })
  session.observe({ document: dom(), surface: surface('A') })
  assert.equal(session.buildValidatedReadOnlyProfile().ready, false)

  session.observe({ document: dom(), surface: surface('B') })
  const result = session.buildValidatedReadOnlyProfile()

  assert.equal(result.ready, true)
  assert.equal(result.state.pass_count, 3)
  assert.equal(result.state.distinct_conversation_count, 2)
  assert.equal(result.profile.approved_for_readonly_runtime, true)
  assert.equal(result.profile.approved_for_runtime, false)
  assert.equal(result.profile.capture_enabled, false)
  assert.equal(result.profile.persistence_enabled, false)
  assert.equal(result.profile.reasoning_enabled, false)
  assert.equal(result.profile.composer_enabled, false)
})

test('uma falha observada invalida a sessão inteira', () => {
  const session = validator.createReadOnlyProfileValidationSession(candidate(), {
    minimumPasses: 2,
    minimumDistinctConversations: 2,
  })

  session.observe({ document: dom(), surface: surface('A') })
  session.observe({ document: dom(0), surface: surface('B') })
  session.observe({ document: dom(), surface: surface('B') })

  const result = session.buildValidatedReadOnlyProfile()
  assert.equal(result.ready, false)
  assert.equal(result.reason, 'validation_failed')
  assert.equal(result.state.failure_count, 1)
})
