import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const contract = require('../src/platform-contract.js')
const surface = require('../src/manychat-surface.js')

test('reconhece rota direta de conversa do ManyChat sem depender do DOM', () => {
  const result = surface.parseManyChatConversationUrl(
    'https://app.manychat.com/fb871594/chat/1443150072',
  )

  assert.equal(result.supported, true)
  assert.equal(result.platform, 'manychat')
  assert.equal(result.channel, 'unknown')
  assert.equal(result.account_key, 'fb871594')
  assert.equal(result.external_contact_id, null)
  assert.equal(result.contact_identity_ready, false)
  assert.equal(result.identity_source, 'authenticated_route')
  assert.equal(
    result.external_conversation_id,
    'fb871594:chat:1443150072',
  )
  assert.equal(
    result.conversation_key,
    contract.buildNamespacedConversationKey({
      platform: 'manychat',
      channel: 'unknown',
      externalIdentity: 'fb871594:chat:1443150072',
    }),
  )
})

test('token de rota validado é identidade de conversa, nunca contact id implícito', () => {
  const result = surface.parseManyChatConversationUrl(
    'https://app.manychat.com/fb3678277/chat/438324835',
  )

  assert.equal(result.supported, true)
  assert.equal(result.external_contact_id, null)
  assert.equal(result.contact_identity_ready, false)
  assert.match(result.external_conversation_id, /:chat:/)
  assert.ok(result.conversation_key.startsWith('manychat:unknown:'))
})

test('query string e hash não alteram a identidade canônica da conversa', () => {
  const plain = surface.parseManyChatConversationUrl(
    'https://app.manychat.com/fb3937244/chat/166708683',
  )
  const decorated = surface.parseManyChatConversationUrl(
    'https://app.manychat.com/fb3937244/chat/166708683?tab=info#latest',
  )

  assert.equal(decorated.supported, true)
  assert.equal(decorated.conversation_key, plain.conversation_key)
  assert.equal(
    decorated.external_conversation_id,
    plain.external_conversation_id,
  )
})

test('A → B → A preserva a identidade da conversa e distingue B', () => {
  const a1 = surface.parseManyChatConversationUrl(
    'https://app.manychat.com/fb3678277/chat/438324835',
  )
  const b = surface.parseManyChatConversationUrl(
    'https://app.manychat.com/fb3678277/chat/438324836',
  )
  const a2 = surface.parseManyChatConversationUrl(
    'https://app.manychat.com/fb3678277/chat/438324835',
  )

  assert.equal(a1.conversation_key, a2.conversation_key)
  assert.notEqual(a1.conversation_key, b.conversation_key)
  assert.equal(a1.account_key, b.account_key)
  assert.equal(a1.external_contact_id, null)
  assert.equal(b.external_contact_id, null)
})

test('não inventa canal a partir da URL do ManyChat', () => {
  const result = surface.parseManyChatConversationUrl(
    'https://app.manychat.com/fb101734444447617/chat/12345678',
  )

  assert.equal(result.supported, true)
  assert.equal(result.channel, 'unknown')
})

test('página ManyChat que não é conversa fica explicitamente fora do escopo', () => {
  const result = surface.parseManyChatConversationUrl(
    'https://app.manychat.com/fb101734444447617/dashboard',
  )

  assert.equal(result.supported, false)
  assert.equal(result.reason, 'unsupported_route')
  assert.equal(result.conversation_key, null)
  assert.equal(result.external_contact_id, null)
})

test('host diferente de app.manychat.com nunca é aceito', () => {
  const result = surface.parseManyChatConversationUrl(
    'https://manychat.com/fb1/chat/2',
  )

  assert.equal(result.supported, false)
  assert.equal(result.reason, 'unsupported_host')
})

test('URL inválida falha de forma segura', () => {
  const result = surface.parseManyChatConversationUrl('não-é-url')

  assert.equal(result.supported, false)
  assert.equal(result.reason, 'invalid_url')
})

test('snapshot diagnóstico não habilita captura, persistência, reasoning ou resolução de lead', () => {
  const result = surface.createDiagnosticSnapshot(
    'https://app.manychat.com/fb871594/chat/766861530',
  )

  assert.equal(result.supported, true)
  assert.equal(result.capture_enabled, false)
  assert.equal(result.persistence_enabled, false)
  assert.equal(result.reasoning_enabled, false)
  assert.equal(result.lead_resolution_enabled, false)
  assert.equal(result.external_contact_id, null)
  assert.ok(Number.isFinite(Date.parse(result.observed_at)))
})
