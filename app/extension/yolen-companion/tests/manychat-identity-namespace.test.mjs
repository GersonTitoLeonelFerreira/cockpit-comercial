import assert from 'node:assert/strict'
import { createHash, webcrypto } from 'node:crypto'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const namespace = require('../src/manychat-identity-namespace.js')

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

test('normaliza somente identificadores opacos suportados', () => {
  assert.equal(namespace.normalizeOpaqueIdentifier('  abc  '), 'abc')
  assert.equal(namespace.normalizeOpaqueIdentifier(12345), '12345')
  assert.equal(namespace.normalizeOpaqueIdentifier(12345n), '12345')
  assert.equal(namespace.normalizeOpaqueIdentifier('   '), null)
  assert.equal(namespace.normalizeOpaqueIdentifier(-1), null)
  assert.equal(namespace.normalizeOpaqueIdentifier(1.5), null)
  assert.equal(namespace.normalizeOpaqueIdentifier({ id: 1 }), null)
})

test('gera chave canônica ManyChat usando workspace + subscriber_id', async () => {
  const result = await namespace.buildIdentityNamespace(
    {
      workspace_key: 'workspace-a',
      subscriber_id: 'subscriber-a',
    },
    webcrypto,
  )

  assert.equal(result.ready, true)
  assert.equal(result.reason, null)

  const expected = sha256(
    JSON.stringify([
      'yolen-manychat-contact-v1',
      'workspace-a',
      'subscriber-a',
    ]),
  )

  assert.equal(
    result.safe.platform_identity.key,
    `manychat:contact:v1:sha256:${expected}`,
  )
  assert.equal(result.safe.platform_identity.source, 'subscriber_id')
  assert.equal(result.safe.scope, 'workspace')
  assert.equal(result.safe.channel_identity, null)
})

test('mesmo subscriber em workspaces distintos produz namespaces distintos', async () => {
  const left = await namespace.buildIdentityNamespace(
    {
      workspace_key: 'workspace-a',
      subscriber_id: 'subscriber-a',
    },
    webcrypto,
  )

  const right = await namespace.buildIdentityNamespace(
    {
      workspace_key: 'workspace-b',
      subscriber_id: 'subscriber-a',
    },
    webcrypto,
  )

  assert.equal(left.ready, true)
  assert.equal(right.ready, true)
  assert.notEqual(
    left.safe.platform_identity.key,
    right.safe.platform_identity.key,
  )
})

test('separa identidade da plataforma da identidade WhatsApp', async () => {
  const result = await namespace.buildIdentityNamespace(
    {
      workspace_key: 'workspace-a',
      subscriber_id: 'same-raw-value',
      whatsapp_user_id: 'same-raw-value',
    },
    webcrypto,
  )

  assert.equal(result.ready, true)
  assert.equal(result.safe.channel_identity.channel, 'whatsapp')
  assert.equal(result.safe.channel_identity.source, 'whatsapp_user_id')
  assert.match(
    result.safe.platform_identity.key,
    /^manychat:contact:v1:sha256:[a-f0-9]{64}$/,
  )
  assert.match(
    result.safe.channel_identity.key,
    /^manychat:channel:whatsapp:v1:sha256:[a-f0-9]{64}$/,
  )
  assert.notEqual(
    result.safe.platform_identity.key,
    result.safe.channel_identity.key,
  )
})

test('saída segura não contém workspace nem identidades brutas', async () => {
  const rawWorkspace = 'workspace-secret-123'
  const rawSubscriber = 'subscriber-secret-456'
  const rawWhatsapp = '5511999999999'

  const result = await namespace.buildIdentityNamespace(
    {
      workspace_key: rawWorkspace,
      subscriber_id: rawSubscriber,
      whatsapp_user_id: rawWhatsapp,
    },
    webcrypto,
  )

  const serialized = JSON.stringify(result)

  assert.equal(result.ready, true)
  assert.doesNotMatch(serialized, new RegExp(rawWorkspace))
  assert.doesNotMatch(serialized, new RegExp(rawSubscriber))
  assert.doesNotMatch(serialized, new RegExp(rawWhatsapp))
  assert.equal(result.safe.privacy.raw_workspace_key_exposed, false)
  assert.equal(result.safe.privacy.raw_subscriber_id_exposed, false)
  assert.equal(result.safe.privacy.raw_whatsapp_user_id_exposed, false)
})

test('falha fechado sem workspace, subscriber ou SHA-256', async () => {
  const missingWorkspace = await namespace.buildIdentityNamespace(
    { subscriber_id: 'subscriber-a' },
    webcrypto,
  )
  assert.equal(missingWorkspace.ready, false)
  assert.equal(missingWorkspace.reason, 'workspace_key_missing')

  const missingSubscriber = await namespace.buildIdentityNamespace(
    { workspace_key: 'workspace-a' },
    webcrypto,
  )
  assert.equal(missingSubscriber.ready, false)
  assert.equal(missingSubscriber.reason, 'subscriber_id_missing')

  const missingCrypto = await namespace.buildIdentityNamespace(
    {
      workspace_key: 'workspace-a',
      subscriber_id: 'subscriber-a',
    },
    {},
  )
  assert.equal(missingCrypto.ready, false)
  assert.equal(missingCrypto.reason, 'sha256_unavailable')
})
