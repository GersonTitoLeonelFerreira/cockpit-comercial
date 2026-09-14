import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const admissionApi = require('../src/manychat-runtime-admission.js')
const bootstrapApi = require('../src/manychat-runtime-bootstrap.js')

function validatedProfile(overrides = {}) {
  return {
    schema_version: 'yolen-manychat-validated-profile-v1',
    platform: 'manychat',
    source_fingerprint: 'mc-profile-a1b2c3d4',
    selectors: {
      conversationRoot: 'div[role="main"]',
      channel: 'span[data-testid="channel-badge"]',
      contact: 'div[data-testid="contact-card"]',
      assignment: 'button[data-testid="assignment-control"]',
      messages: 'div[data-testid="message-row"]',
      composer: 'textarea[data-testid="reply-box"]',
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

function surface(id = '456') {
  return {
    supported: true,
    platform: 'manychat',
    channel: 'unknown',
    conversation_key: `manychat:unknown:fb123%3Achat%3A${id}`,
    external_conversation_id: `fb123:chat:${id}`,
  }
}

function harness(overrides = {}) {
  let currentSurface = surface('456')
  let observerCallback = null
  let observerStopped = false
  let receivedReaderProfile = null
  let adapterSnapshotCalls = 0

  const reader = {
    observeChanges(callback) {
      observerCallback = callback
      return () => {
        observerStopped = true
      }
    },
  }

  const readerApi = {
    createManyChatDomReader(options) {
      receivedReaderProfile = options.profile
      return reader
    },
  }

  const adapterApi = {
    createManyChatAdapter() {
      return {
        createReadOnlySnapshot() {
          adapterSnapshotCalls += 1
          return {
            evidence_ready: true,
            missing_evidence: [],
            channel: 'whatsapp',
            assignment: {
              known: true,
              assigned: true,
              agent_id: 'seller-1',
              agent_name: 'Seller',
            },
            messages: [
              {
                message_key: 'm1',
                text_content: 'conteúdo que não deve sair no snapshot do bootstrap',
              },
            ],
          }
        },
      }
    },
  }

  const surfaceApi = {
    getCurrentConversationSurface() {
      return currentSurface
    },
  }

  const bootstrap = bootstrapApi.createManyChatReadOnlyRuntimeBootstrap(
    overrides.profile ?? validatedProfile(),
    {
      admissionApi,
      readerApi,
      adapterApi,
      surfaceApi,
      readers: overrides.readers ?? {
        readChannel() {
          return 'whatsapp'
        },
        readContact() {
          return { name: 'Contato' }
        },
        readAssignment() {
          return { known: true, assigned: true, agent_id: 'seller-1' }
        },
        readMessage() {
          return {
            message_key: 'm1',
            direction: 'incoming',
            occurred_at: '2026-09-14T17:00:00-03:00',
            content_type: 'text',
            text_content: 'oi',
            is_deleted: false,
          }
        },
        readComposer() {
          throw new Error('composer não pode ser habilitado')
        },
      },
      now: () => '2026-09-14T20:00:00.000Z',
    },
  )

  return {
    bootstrap,
    setSurface(value) {
      currentSurface = value
    },
    emit(value) {
      assert.equal(typeof observerCallback, 'function')
      observerCallback(value)
    },
    observerStopped() {
      return observerStopped
    },
    readerProfile() {
      return receivedReaderProfile
    },
    adapterSnapshotCalls() {
      return adapterSnapshotCalls
    },
  }
}

test('bootstrap inicia somente em modo read-only e não expõe conteúdo bruto', () => {
  const env = harness()
  const snapshot = env.bootstrap.start()

  assert.equal(snapshot.active, true)
  assert.equal(snapshot.channel, 'whatsapp')
  assert.equal(snapshot.visible_message_count, 1)
  assert.equal(snapshot.capabilities.dom_read, true)
  assert.equal(snapshot.capabilities.capture, false)
  assert.equal(snapshot.capabilities.persistence, false)
  assert.equal(snapshot.capabilities.reasoning, false)
  assert.equal(snapshot.capabilities.composer, false)
  assert.equal(snapshot.capabilities.network_write, false)

  const serialized = JSON.stringify(snapshot)
  assert.doesNotMatch(serialized, /conteúdo que não deve sair/)
  assert.doesNotMatch(serialized, /manychat:unknown:/)
})

test('bootstrap usa exatamente os seletores validados e mantém composer sem reader', () => {
  const env = harness()
  env.bootstrap.start()

  const profile = env.readerProfile()
  assert.equal(profile.selectors.conversationRoot, 'div[role="main"]')
  assert.equal(profile.selectors.messages, 'div[data-testid="message-row"]')
  assert.equal(profile.selectors.composer, 'textarea[data-testid="reply-box"]')
  assert.equal(profile.readComposer, null)
})

test('readMessage é obrigatório antes de qualquer bootstrap', () => {
  assert.throws(
    () => harness({ readers: {} }),
    (error) => error.code === 'READER_FUNCTION_REQUIRED',
  )
})

test('profile perigoso é recusado pelo gate de admissão antes de iniciar', () => {
  assert.throws(
    () => harness({ profile: validatedProfile({ capture_enabled: true }) }),
    (error) => error.code === 'UNSAFE_RUNTIME_PROFILE',
  )
})

test('troca A para B readmite a surface sem transportar chave bruta no evento', () => {
  const env = harness()
  const first = env.bootstrap.start()

  env.setSurface(surface('999'))
  env.emit({
    type: 'conversation_changed',
    conversation_key: surface('999').conversation_key,
  })

  const state = env.bootstrap.getState()
  assert.notEqual(state.conversation_ref, first.conversation_ref)
  assert.equal(state.last_event.type, 'conversation_changed')
  assert.equal(state.last_event.admitted, true)
  assert.doesNotMatch(JSON.stringify(state.last_event), /manychat:unknown:/)
})

test('snapshot ressincroniza a surface mesmo se a mutação A para B não tiver sido observada', () => {
  const env = harness()
  const first = env.bootstrap.start()

  env.setSurface(surface('777'))
  const second = env.bootstrap.snapshot()

  assert.equal(second.active, true)
  assert.notEqual(second.conversation_ref, first.conversation_ref)
  assert.doesNotMatch(JSON.stringify(second), /manychat:unknown:/)
})

test('surface não admitida bloqueia leitura antes de consultar o adapter', () => {
  const env = harness()
  env.bootstrap.start()
  const callsBefore = env.adapterSnapshotCalls()

  env.setSurface({
    supported: false,
    platform: 'manychat',
    conversation_key: null,
  })

  const snapshot = env.bootstrap.snapshot()
  assert.equal(snapshot.active, false)
  assert.equal(snapshot.reason, 'surface_not_admitted')
  assert.equal(snapshot.error_code, 'UNSUPPORTED_SURFACE')
  assert.equal(env.adapterSnapshotCalls(), callsBefore)
})

test('stop encerra observer e bootstrap encerrado não reinicia', () => {
  const env = harness()
  env.bootstrap.start()
  env.bootstrap.stop()

  assert.equal(env.observerStopped(), true)
  assert.equal(env.bootstrap.snapshot().reason, 'stopped')

  assert.throws(
    () => env.bootstrap.start(),
    (error) => error.code === 'BOOTSTRAP_STOPPED',
  )
})
