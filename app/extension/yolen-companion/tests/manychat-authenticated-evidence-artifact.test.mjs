import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const artifactApi = require('../src/manychat-authenticated-evidence-artifact.js')

function selectors() {
  return {
    conversationRoot: 'div[role="main"]',
    messages: 'div[data-testid="message-row"]',
    channel: null,
    contact: null,
    assignment: null,
    composer: null,
  }
}

function observation(ref, observedAt) {
  return {
    schema_version: 'yolen-manychat-profile-validation-observation-v1',
    platform: 'manychat',
    fingerprint: 'mc-profile-a1b2c3d4',
    observed_at: observedAt,
    conversation_ref: ref,
    pass: true,
    reason: null,
    counts: {
      conversationRoot: 1,
      messages: 4,
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
}

function report(overrides = {}) {
  const baseSelectors = selectors()
  const validation = {
    schema_version: 'yolen-manychat-profile-validation-state-v1',
    platform: 'manychat',
    fingerprint: 'mc-profile-a1b2c3d4',
    ready: true,
    pass_count: 3,
    failure_count: 0,
    distinct_conversation_count: 2,
    minimum_passes: 3,
    minimum_distinct_conversations: 2,
    observations: [
      observation('mc-conv-11111111', '2026-09-14T18:01:00-03:00'),
      observation('mc-conv-22222222', '2026-09-14T18:02:00-03:00'),
      observation('mc-conv-22222222', '2026-09-14T18:03:00-03:00'),
    ],
  }

  return {
    schema_version: 'yolen-manychat-authenticated-validation-harness-v1',
    platform: 'manychat',
    observed_at: '2026-09-14T18:10:00-03:00',
    evidence: {
      schema_version: 'yolen-manychat-safe-evidence-view-v1',
      source_schema_version: 'yolen-manychat-evidence-v1',
      platform: 'manychat',
      supported: true,
      reason: null,
      observed_at: '2026-09-14T18:00:00-03:00',
      surface: {
        supported: true,
        platform: 'manychat',
        channel: 'whatsapp',
        conversation_ref: 'mc-auth-12345678',
      },
      summary: {
        candidate_count: 2,
        tags: { div: 2 },
        roles: { main: 1 },
        attributes: { role: 1, 'data-testid': 1 },
      },
      candidates: [
        { tag: 'div', attributes: { role: 'main' }, ancestors: [] },
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
        raw_conversation_identity_exposed: false,
      },
    },
    candidate: {
      schema_version: 'yolen-manychat-profile-candidate-v1',
      platform: 'manychat',
      fingerprint: 'mc-profile-a1b2c3d4',
      selectors: baseSelectors,
      approved_for_runtime: false,
      capture_enabled: false,
      persistence_enabled: false,
      reasoning_enabled: false,
    },
    validation,
    validated_profile: {
      schema_version: 'yolen-manychat-validated-profile-v1',
      platform: 'manychat',
      source_fingerprint: 'mc-profile-a1b2c3d4',
      selectors: baseSelectors,
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
    },
    privacy: {
      text_content_collected: false,
      input_values_collected: false,
      network_sent: false,
      persisted: false,
      raw_conversation_identity_exposed: false,
    },
    ...overrides,
  }
}

test('transforma relatório autenticado seguro em artefato verificável', () => {
  const artifact = artifactApi.verifyAuthenticatedEvidenceReport(report())

  assert.equal(artifact.schema_version, 'yolen-manychat-authenticated-evidence-artifact-v1')
  assert.equal(artifact.platform, 'manychat')
  assert.equal(artifact.verified, true)
  assert.match(artifact.artifact_fingerprint, /^mc-evidence-[0-9a-f]{8}$/)
  assert.equal(artifact.profile_fingerprint, 'mc-profile-a1b2c3d4')
  assert.equal(artifact.validation.pass_count, 3)
  assert.equal(artifact.validation.distinct_conversation_count, 2)
  assert.equal(artifact.eligibility.semantic_validation, true)
  assert.equal(artifact.eligibility.readonly_runtime, true)
  assert.equal(artifact.eligibility.manifest_injection, false)
  assert.equal(artifact.eligibility.capture, false)
  assert.equal(artifact.eligibility.persistence, false)
  assert.equal(artifact.eligibility.reasoning, false)
  assert.equal(artifact.eligibility.composer, false)
  assert.equal(artifact.eligibility.network_write, false)
})

test('fingerprint do artefato depende da prova estrutural e não do horário do relatório', () => {
  const first = artifactApi.verifyAuthenticatedEvidenceReport(report())
  const second = artifactApi.verifyAuthenticatedEvidenceReport(
    report({ observed_at: '2026-09-15T08:00:00-03:00' }),
  )

  assert.equal(first.artifact_fingerprint, second.artifact_fingerprint)
})

test('recusa identidade bruta ou conteúdo textual no relatório seguro', () => {
  const unsafeIdentity = report()
  unsafeIdentity.evidence.surface.conversation_key = 'manychat:whatsapp:secret'

  assert.throws(
    () => artifactApi.verifyAuthenticatedEvidenceReport(unsafeIdentity),
    (error) => error.code === 'RAW_IDENTITY_OR_CONTENT_EXPOSED',
  )

  const unsafeContent = report()
  unsafeContent.validation.observations[0].text_content = 'mensagem real'

  assert.throws(
    () => artifactApi.verifyAuthenticatedEvidenceReport(unsafeContent),
    (error) => error.code === 'RAW_IDENTITY_OR_CONTENT_EXPOSED',
  )
})

test('recusa relatório com falha de validação', () => {
  const value = report()
  value.validation.failure_count = 1

  assert.throws(
    () => artifactApi.verifyAuthenticatedEvidenceReport(value),
    (error) => error.code === 'VALIDATION_HAS_FAILURES',
  )
})

test('recusa contagem de conversas distinta que não é sustentada pelas observações', () => {
  const value = report()
  value.validation.distinct_conversation_count = 3
  value.validated_profile.validation.distinct_conversation_count = 3

  assert.throws(
    () => artifactApi.verifyAuthenticatedEvidenceReport(value),
    (error) => error.code === 'DISTINCT_CONVERSATION_COUNT_MISMATCH',
  )
})

test('recusa profile que troca seletores após a validação', () => {
  const value = report()
  value.validated_profile.selectors = {
    ...value.validated_profile.selectors,
    messages: 'div[data-testid="different-row"]',
  }

  assert.throws(
    () => artifactApi.verifyAuthenticatedEvidenceReport(value),
    (error) => error.code === 'PROFILE_SELECTOR_MISMATCH',
  )
})

test('recusa capability perigosa no profile validado', () => {
  const value = report()
  value.validated_profile.capture_enabled = true

  assert.throws(
    () => artifactApi.verifyAuthenticatedEvidenceReport(value),
    (error) => error.code === 'UNSAFE_VALIDATED_PROFILE',
  )
})

test('permite pinagem do fingerprint esperado e falha fechado quando diverge', () => {
  const value = report()

  const artifact = artifactApi.verifyAuthenticatedEvidenceReport(value, {
    expectedProfileFingerprint: 'mc-profile-a1b2c3d4',
  })
  assert.equal(artifact.verified, true)

  assert.throws(
    () =>
      artifactApi.verifyAuthenticatedEvidenceReport(value, {
        expectedProfileFingerprint: 'mc-profile-deadbeef',
      }),
    (error) => error.code === 'EXPECTED_PROFILE_FINGERPRINT_MISMATCH',
  )
})
