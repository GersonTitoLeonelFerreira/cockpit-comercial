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
