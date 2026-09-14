import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const admission = require('../src/manychat-runtime-admission.js')

function validatedProfile(overrides = {}) {
  return {
    schema_version: 'yolen-manychat-validated-profile-v1',
    platform: 'manychat',
    source_fingerprint: 'mc-profile-a1b2c3d4',
    selectors: {
      conversationRoot: 'div[role="main"]',
      channel: null,
      contact: null,
      assignment: null,
      messages: 'div[data-testid="message-row"]',
      composer: null,
    },
    validation: {
      pass_count: 3,
      distinct_conversation_count: 2,
      minimum_passes: 3,
      minimum_distinct_conversations: 2,
    },
    approved_for_readonly_runtime: true,
    approved_for_runtime: false,
    capture_enabled: false,
    persistence_enabled: false,
    reasoning_enabled: false,
    composer_enabled: false,
    ...overrides,
  }
}

function surface(overrides = {}) {
  return {
    supported: true,
    platform: 'manychat',
    channel: 'unknown',
    conversation_key: 'manychat:unknown:fb123%3Achat%3A456',
    external_conversation_id: 'fb123:chat:456',
    ...overrides,
  }
}

test('admite somente profile já validado para runtime read-only', () => {
  const runtime = admission.createManyChatReadOnlyRuntimeAdmission(
    validatedProfile(),
  )
  const state = runtime.describe()

  assert.equal(state.admitted, true)
  assert.equal(state.mode, 'readonly')
  assert.equal(state.profile_fingerprint, 'mc-profile-a1b2c3d4')
  assert.equal(state.capabilities.dom_read, true)
  assert.equal(state.capabilities.capture, false)
  assert.equal(state.capabilities.persistence, false)
  assert.equal(state.capabilities.reasoning, false)
  assert.equal(state.capabilities.composer, false)
  assert.equal(state.capabilities.network_write, false)
})

test('runtime recusa qualquer capability perigosa habilitada no profile', () => {
  for (const field of [
    'approved_for_runtime',
    'capture_enabled',
    'persistence_enabled',
    'reasoning_enabled',
    'composer_enabled',
  ]) {
    assert.throws(
      () =>
        admission.createManyChatReadOnlyRuntimeAdmission(
          validatedProfile({ [field]: true }),
        ),
      (error) => error.code === 'UNSAFE_RUNTIME_PROFILE',
    )
  }
})

test('profile sem aprovação read-only não é admitido', () => {
  assert.throws(
    () =>
      admission.createManyChatReadOnlyRuntimeAdmission(
        validatedProfile({ approved_for_readonly_runtime: false }),
      ),
    (error) => error.code === 'READONLY_RUNTIME_NOT_APPROVED',
  )
})

test('validação registrada precisa continuar satisfazendo os próprios thresholds', () => {
  assert.throws(
    () =>
      admission.createManyChatReadOnlyRuntimeAdmission(
        validatedProfile({
          validation: {
            pass_count: 2,
            distinct_conversation_count: 2,
            minimum_passes: 3,
            minimum_distinct_conversations: 2,
          },
        }),
      ),
    (error) => error.code === 'INSUFFICIENT_VALIDATION_PASSES',
  )

  assert.throws(
    () =>
      admission.createManyChatReadOnlyRuntimeAdmission(
        validatedProfile({
          validation: {
            pass_count: 3,
            distinct_conversation_count: 1,
            minimum_passes: 3,
            minimum_distinct_conversations: 2,
          },
        }),
      ),
    (error) => error.code === 'INSUFFICIENT_DISTINCT_CONVERSATIONS',
  )
})

test('fingerprint esperado impede troca silenciosa de profile', () => {
  assert.throws(
    () =>
      admission.createManyChatReadOnlyRuntimeAdmission(
        validatedProfile(),
        { expectedFingerprint: 'mc-profile-different' },
      ),
    (error) => error.code === 'PROFILE_FINGERPRINT_MISMATCH',
  )
})

test('surface fora do namespace ManyChat falha fechada', () => {
  const runtime = admission.createManyChatReadOnlyRuntimeAdmission(
    validatedProfile(),
  )

  assert.throws(
    () => runtime.admitSurface(surface({ conversation_key: 'whatsapp:+5547999990001' })),
    (error) => error.code === 'INVALID_CONVERSATION_NAMESPACE',
  )
})

test('sessão read-only não expõe a conversation_key bruta e não habilita escrita', () => {
  const runtime = admission.createManyChatReadOnlyRuntimeAdmission(
    validatedProfile(),
  )
  const session = runtime.admitSurface(surface())

  assert.equal(session.mode, 'readonly')
  assert.match(session.conversation_ref, /^mc-runtime-[0-9a-f]{8}$/)
  assert.equal('conversation_key' in session, false)
  assert.equal(session.dom_read_enabled, true)
  assert.equal(session.capture_enabled, false)
  assert.equal(session.persistence_enabled, false)
  assert.equal(session.reasoning_enabled, false)
  assert.equal(session.composer_enabled, false)
  assert.equal(session.network_write_enabled, false)
})

test('seletores obrigatórios permanecem obrigatórios na admissão', () => {
  const profile = validatedProfile()
  profile.selectors = {
    ...profile.selectors,
    messages: null,
  }

  assert.throws(
    () => admission.createManyChatReadOnlyRuntimeAdmission(profile),
    (error) => error.code === 'REQUIRED_SELECTOR_MISSING',
  )
})
