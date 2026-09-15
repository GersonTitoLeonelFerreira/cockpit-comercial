import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

import {
  SOURCE_FILES,
  buildBundleContent,
} from '../scripts/build-manychat-authenticated-validation-bundle.mjs'

const require = createRequire(import.meta.url)
const harnessApi = require('../src/manychat-authenticated-validation-harness.js')

function rawEvidence(overrides = {}) {
  return {
    schema_version: 'yolen-manychat-evidence-v1',
    platform: 'manychat',
    supported: true,
    reason: null,
    observed_at: '2026-09-14T18:00:00-03:00',
    surface: {
      supported: true,
      platform: 'manychat',
      channel: 'whatsapp',
      conversation_key: 'manychat:whatsapp:contact-secret-123456789',
      external_conversation_id: 'contact-secret-123456789',
    },
    summary: {
      candidate_count: 2,
      tags: { div: 2 },
      roles: { main: 1 },
      attributes: { role: 1, 'data-testid': 1 },
    },
    candidates: [
      {
        tag: 'div',
        attributes: { role: 'main' },
        ancestors: [],
      },
      {
        tag: 'div',
        attributes: { 'data-testid': 'message-row' },
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

function dependencies() {
  const evidence = rawEvidence()
  const profile = {
    schema_version: 'yolen-manychat-validated-profile-v1',
    platform: 'manychat',
    source_fingerprint: 'mc-profile-a1b2c3d4',
    selectors: {
      conversationRoot: 'div[role="main"]',
      messages: 'div[data-testid="message-row"]',
      channel: null,
      contact: null,
      assignment: null,
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
  }

  let passCount = 0

  return {
    surfaceApi: {
      getCurrentConversationSurface() {
        return evidence.surface
      },
    },
    evidenceApi: {
      createManyChatEvidenceProbe() {
        return {
          run() {
            return evidence
          },
        }
      },
    },
    gateApi: {
      buildEvidenceBoundProfileCandidate(snapshot, mapping) {
        assert.equal(snapshot, evidence)
        assert.ok(mapping.conversationRoot)
        assert.ok(mapping.messages)
        return {
          schema_version: 'yolen-manychat-profile-candidate-v1',
          platform: 'manychat',
          fingerprint: 'mc-profile-a1b2c3d4',
          selectors: profile.selectors,
          approved_for_runtime: false,
          capture_enabled: false,
          persistence_enabled: false,
          reasoning_enabled: false,
        }
      },
    },
    validatorApi: {
      createReadOnlyProfileValidationSession() {
        const observations = []

        return {
          observe() {
            passCount += 1
            const observation = {
              schema_version: 'yolen-manychat-profile-validation-observation-v1',
              platform: 'manychat',
              fingerprint: 'mc-profile-a1b2c3d4',
              observed_at: `2026-09-14T18:0${passCount}:00-03:00`,
              conversation_ref: passCount === 1
                ? 'mc-conv-a'
                : 'mc-conv-b',
              pass: true,
              reason: null,
              counts: {
                conversationRoot: 1,
                messages: 2,
                channel: 0,
                contact: 0,
                assignment: 0,
                composer: 0,
              },
              privacy: {
                text_content_read: false,
                input_values_read: false,
                network_sent: false,
                persisted: false,
              },
            }
            observations.push(observation)
            return observation
          },
          getState() {
            return {
              schema_version: 'yolen-manychat-profile-validation-state-v1',
              platform: 'manychat',
              fingerprint: 'mc-profile-a1b2c3d4',
              ready: observations.length >= 3,
              pass_count: observations.length,
              failure_count: 0,
              distinct_conversation_count:
                observations.length >= 2 ? 2 : observations.length,
              minimum_passes: 3,
              minimum_distinct_conversations: 2,
              observations,
            }
          },
          buildValidatedReadOnlyProfile() {
            const state = this.getState()
            return state.ready
              ? { ready: true, reason: null, state, profile }
              : {
                  ready: false,
                  reason: 'insufficient_validation',
                  state,
                  profile: null,
                }
          },
        }
      },
    },
  }
}

test('safeEvidenceView não expõe identidade bruta da conversa', () => {
  const safe = harnessApi.safeEvidenceView(rawEvidence())
  const serialized = JSON.stringify(safe)

  assert.equal(safe.surface.conversation_ref.startsWith('mc-auth-'), true)
  assert.equal(safe.privacy.raw_conversation_identity_exposed, false)
  assert.doesNotMatch(serialized, /contact-secret-123456789/)
  assert.doesNotMatch(serialized, /external_conversation_id/)
})

test('harness executa evidence -> candidate -> validação -> profile sem rede ou persistência', () => {
  const deps = dependencies()
  const harness = harnessApi.createManyChatAuthenticatedValidationHarness({
    ...deps,
    document: {},
    now: () => '2026-09-14T18:10:00-03:00',
  })

  const evidence = harness.collectEvidence()
  assert.equal(evidence.supported, true)

  const candidate = harness.buildCandidate({
    conversationRoot: { candidate_index: 0, attribute: 'role' },
    messages: { candidate_index: 1, attribute: 'data-testid' },
  })
  assert.equal(candidate.fingerprint, 'mc-profile-a1b2c3d4')

  const initial = harness.beginValidation()
  assert.equal(initial.ready, false)

  harness.observeCurrentConversation()
  harness.observeCurrentConversation()
  harness.observeCurrentConversation()

  const result = harness.finalizeValidatedProfile()
  assert.equal(result.ready, true)
  assert.equal(result.profile.approved_for_readonly_runtime, true)

  const report = harness.exportSafeReport()
  assert.equal(report.validation.pass_count, 3)
  assert.equal(report.validation.distinct_conversation_count, 2)
  assert.equal(report.privacy.network_sent, false)
  assert.equal(report.privacy.persisted, false)
  assert.doesNotMatch(JSON.stringify(report), /contact-secret-123456789/)
})

test('harness falha fechado quando etapas são executadas fora de ordem', () => {
  const harness = harnessApi.createManyChatAuthenticatedValidationHarness({
    ...dependencies(),
    document: {},
  })

  assert.throws(
    () => harness.buildCandidate({}),
    (error) => error.code === 'EVIDENCE_REQUIRED',
  )

  harness.collectEvidence()

  assert.throws(
    () => harness.beginValidation(),
    (error) => error.code === 'PROFILE_CANDIDATE_REQUIRED',
  )

  assert.throws(
    () => harness.observeCurrentConversation(),
    (error) => error.code === 'VALIDATION_SESSION_REQUIRED',
  )
})

test('reset apaga estado transitório da validação', () => {
  const harness = harnessApi.createManyChatAuthenticatedValidationHarness({
    ...dependencies(),
    document: {},
  })

  harness.collectEvidence()
  harness.buildCandidate({
    conversationRoot: { candidate_index: 0, attribute: 'role' },
    messages: { candidate_index: 1, attribute: 'data-testid' },
  })
  harness.beginValidation()
  harness.reset()

  assert.equal(harness.getEvidence(), null)
  assert.equal(harness.getValidationState(), null)
})

test('bundle diagnóstico contém a cadeia completa na ordem de dependência', () => {
  assert.deepEqual(SOURCE_FILES, [
    'src/platform-contract.js',
    'src/manychat-surface.js',
    'src/manychat-message-semantics.js',
    'src/manychat-message-identity.js',
    'src/manychat-message-content.js',
    'src/manychat-audio-source.js',
    'src/manychat-evidence-probe.js',
    'src/manychat-profile-gate.js',
    'src/manychat-profile-validator.js',
    'src/manychat-authenticated-validation-harness.js',
  ])

  assert.equal(SOURCE_FILES.includes('src/content-script.js'), false)
  assert.equal(SOURCE_FILES.includes('src/capture-transport.js'), false)
  assert.equal(SOURCE_FILES.includes('src/background.js'), false)

  const bundle = buildBundleContent()
  for (const path of SOURCE_FILES) {
    assert.match(bundle, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }

  assert.ok(
    bundle.indexOf('src/manychat-message-semantics.js') <
      bundle.indexOf('src/manychat-message-identity.js'),
  )
  assert.ok(
    bundle.indexOf('src/manychat-message-identity.js') <
      bundle.indexOf('src/manychat-message-content.js'),
  )
  assert.ok(
    bundle.indexOf('src/manychat-message-content.js') <
      bundle.indexOf('src/manychat-audio-source.js'),
  )
  assert.ok(
    bundle.indexOf('src/platform-contract.js') <
      bundle.indexOf('src/manychat-surface.js'),
  )
  assert.match(bundle, /createYolenManyChatAuthenticatedValidation/)
})
