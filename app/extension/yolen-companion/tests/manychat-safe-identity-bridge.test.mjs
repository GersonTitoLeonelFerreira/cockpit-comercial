import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const namespace = require('../src/manychat-identity-namespace.js')
const mainBridge = require('../src/manychat-safe-identity-main.js')
const backgroundBridge = require('../src/manychat-safe-identity-background.js')
const isolatedBridge = require('../src/manychat-safe-identity-bridge.js')

function snapshot(entries) {
  return {
    ready: true,
    reason: null,
    secret: {
      entries: entries.map(([locator, values]) => ({
        locator,
        values: [...values],
      })),
    },
    safe: {
      react_fiber_found: true,
    },
  }
}

function identityApiFor(subscriberId, whatsappId) {
  const current = snapshot([
    ['fiber0.memoizedProps.children.[].props.subscriberId', [subscriberId]],
    ['fiber1.memoizedProps.thread.user_id', [subscriberId]],
    ['fiber1.memoizedProps.thread.user.user_id', [subscriberId]],
    ['fiber1.memoizedProps.data.user_id', [subscriberId]],
    ['fiber1.memoizedProps.thread.user.wa_id', [whatsappId]],
  ])

  return {
    snapshotCandidateMap() {
      return current
    },
  }
}

test('MAIN world gera somente identidade pseudônima corroborada', async () => {
  const namespaceApi = {
    buildIdentityNamespace(payload) {
      return namespace.buildIdentityNamespace(payload, webcrypto)
    },
  }

  const result = await mainBridge.resolveSafeIdentity({
    document: {},
    location: {
      pathname: '/fb3678277/chat/438324835',
    },
    identityApi: identityApiFor('subscriber-secret-a', '5511999999999'),
    namespaceApi,
  })

  assert.equal(result.ready, true)
  assert.match(
    result.safe.platform_identity.key,
    /^manychat:contact:v1:sha256:[a-f0-9]{64}$/,
  )
  assert.match(
    result.safe.channel_identity.key,
    /^manychat:channel:whatsapp:v1:sha256:[a-f0-9]{64}$/,
  )
  assert.deepEqual(
    [...result.safe.corroborated_by].sort(),
    ['data_user_id', 'thread_user_id', 'user_object_user_id'].sort(),
  )

  const serialized = JSON.stringify(result)
  assert.doesNotMatch(serialized, /subscriber-secret-a/)
  assert.doesNotMatch(serialized, /5511999999999/)
  assert.doesNotMatch(serialized, /fb3678277/)
  assert.equal(result.safe.privacy.persisted, false)
  assert.equal(result.safe.privacy.network_sent, false)
})

test('MAIN world falha fechado quando subscriber não é corroborado', async () => {
  const namespaceApi = {
    buildIdentityNamespace(payload) {
      return namespace.buildIdentityNamespace(payload, webcrypto)
    },
  }

  const result = await mainBridge.resolveSafeIdentity({
    document: {},
    location: {
      pathname: '/fb3678277/chat/438324835',
    },
    identityApi: {
      snapshotCandidateMap() {
        return snapshot([
          ['fiber0.memoizedProps.children.[].props.subscriberId', ['sub-a']],
          ['fiber1.memoizedProps.thread.user_id', ['different-value']],
        ])
      },
    },
    namespaceApi,
  })

  assert.equal(result.ready, false)
  assert.equal(result.reason, 'subscriber_id_not_corroborated')
  assert.equal(result.safe, null)
})

test('background usa scripting MAIN world e sanitiza a resposta', async () => {
  const mainSafeResult = {
    ready: true,
    reason: null,
    safe: {
      platform: 'manychat',
      platform_identity: {
        source: 'subscriber_id',
        key: `manychat:contact:v1:sha256:${'a'.repeat(64)}`,
      },
      channel_identity: {
        channel: 'whatsapp',
        source: 'whatsapp_user_id',
        key: `manychat:channel:whatsapp:v1:sha256:${'b'.repeat(64)}`,
      },
      subscriber_id: 'should-never-cross',
      whatsapp_user_id: 'should-never-cross',
    },
  }

  let observedWorld = null
  let observedTabId = null

  const extensionApi = {
    scripting: {
      async executeScript(options) {
        observedWorld = options.world
        observedTabId = options.target.tabId
        return [{ result: mainSafeResult }]
      },
    },
  }

  const result = await backgroundBridge.executeMainIdentity(
    extensionApi,
    {
      tab: {
        id: 42,
        url: 'https://app.manychat.com/fb3678277/chat/438324835',
      },
      frameId: 0,
      url: 'https://app.manychat.com/fb3678277/chat/438324835',
    },
  )

  assert.equal(result.ready, true)
  assert.equal(observedWorld, 'MAIN')
  assert.equal(observedTabId, 42)

  const serialized = JSON.stringify(result)
  assert.doesNotMatch(serialized, /should-never-cross/)
  assert.match(
    result.safe.platform_identity.key,
    /^manychat:contact:v1:sha256:[a-f0-9]{64}$/,
  )
})

test('background rejeita origem fora do ManyChat e frame não principal', async () => {
  assert.equal(
    backgroundBridge.normalizeSender({
      tab: { id: 1, url: 'https://example.com/' },
      frameId: 0,
    }).reason,
    'sender_host_not_allowed',
  )

  assert.equal(
    backgroundBridge.normalizeSender({
      tab: { id: 1, url: 'https://app.manychat.com/fb1/chat/2' },
      frameId: 4,
    }).reason,
    'sender_frame_not_top',
  )
})

test('isolated world prova A → B → A usando apenas chaves pseudônimas', () => {
  const a = {
    ready: true,
    safe: {
      platform_identity: {
        key: `manychat:contact:v1:sha256:${'a'.repeat(64)}`,
      },
      channel_identity: {
        key: `manychat:channel:whatsapp:v1:sha256:${'c'.repeat(64)}`,
      },
    },
  }

  const b = {
    ready: true,
    safe: {
      platform_identity: {
        key: `manychat:contact:v1:sha256:${'b'.repeat(64)}`,
      },
      channel_identity: {
        key: `manychat:channel:whatsapp:v1:sha256:${'d'.repeat(64)}`,
      },
    },
  }

  const evaluated = isolatedBridge.evaluateABAReturn(a, b, a)

  assert.equal(evaluated.pass, true)
  assert.equal(evaluated.reason, null)
  assert.equal(evaluated.safe.identity_changed_on_b, true)
  assert.equal(evaluated.safe.identity_returned_on_a, true)
  assert.equal(evaluated.safe.channel_identity_present, true)

  const serialized = JSON.stringify(evaluated.safe)
  assert.doesNotMatch(serialized, /manychat:contact:v1:sha256:/)
  assert.doesNotMatch(serialized, /manychat:channel:whatsapp:v1:sha256:/)
})

test('isolated world valida resposta segura do background', () => {
  const result = isolatedBridge.sanitizeBackgroundResponse({
    ok: true,
    statusCode: 200,
    payload: {
      ready: true,
      reason: null,
      safe: {
        platform: 'manychat',
        platform_identity: {
          source: 'subscriber_id',
          key: `manychat:contact:v1:sha256:${'a'.repeat(64)}`,
        },
        channel_identity: {
          channel: 'whatsapp',
          source: 'whatsapp_user_id',
          key: `manychat:channel:whatsapp:v1:sha256:${'b'.repeat(64)}`,
        },
      },
    },
  })

  assert.equal(result.ready, true)
  assert.equal(result.safe.platform, 'manychat')
  assert.equal(result.safe.privacy.raw_subscriber_id_exposed, false)
})
