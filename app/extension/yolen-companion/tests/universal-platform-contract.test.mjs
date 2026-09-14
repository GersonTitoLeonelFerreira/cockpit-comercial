import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const contract = require('../src/platform-contract.js')

function validConversation(overrides = {}) {
  return {
    contract_version: contract.CONTRACT_VERSION,
    platform: 'manychat',
    channel: 'whatsapp',
    external_conversation_id: 'conversation-123',
    conversation_key: 'manychat:whatsapp:conversation-123',
    contact: {
      name: 'João',
      phone: '+5547999990001',
      external_contact_id: 'contact-123',
    },
    assignment: {
      assigned: true,
      agent_id: 'agent-1',
      agent_name: 'Maria',
    },
    observed_at: '2026-09-14T12:00:00-03:00',
    messages: [
      {
        message_key: 'mc-message-1',
        direction: 'incoming',
        occurred_at: '2026-09-14T11:59:00-03:00',
        content_type: 'text',
        text_content: 'Quero começar esta semana.',
        audio_transcription: null,
        is_deleted: false,
        deletion_reason: null,
      },
      {
        message_key: 'mc-message-2',
        direction: 'outgoing',
        occurred_at: '2026-09-14T11:59:30-03:00',
        content_type: 'text',
        text_content: 'Certo. Vou te orientar.',
        audio_transcription: null,
        is_deleted: false,
        deletion_reason: null,
      },
    ],
    ...overrides,
  }
}

test('normaliza conversa ManyChat/WhatsApp sem conhecer DOM da plataforma', () => {
  const normalized = contract.normalizeUniversalConversation(validConversation())

  assert.equal(normalized.platform, 'manychat')
  assert.equal(normalized.channel, 'whatsapp')
  assert.equal(normalized.messages.length, 2)
  assert.equal(normalized.messages[0].direction, 'incoming')
  assert.equal(normalized.messages[1].direction, 'outgoing')
  assert.equal(normalized.assignment.assigned, true)
  assert.equal(normalized.assignment.agent_name, 'Maria')
})

test('contrato não exige telefone e preserva identidade externa para canais futuros', () => {
  const normalized = contract.normalizeUniversalConversation(
    validConversation({
      channel: 'instagram',
      conversation_key: 'manychat:instagram:conversation-999',
      contact: {
        name: 'João',
        phone: null,
        external_contact_id: 'ig-9988',
      },
    }),
  )

  assert.equal(normalized.contact.phone, null)
  assert.equal(normalized.contact.external_contact_id, 'ig-9988')
})

test('conversation_key precisa permanecer namespaced pela plataforma', () => {
  assert.throws(
    () =>
      contract.normalizeUniversalConversation(
        validConversation({ conversation_key: 'whatsapp:+5547999990001' }),
      ),
    (error) => error.code === 'CONVERSATION_KEY_NAMESPACE_MISMATCH',
  )
})

test('rejeita direção que não possa ser mapeada para o ledger atual', () => {
  const input = validConversation()
  input.messages[0].direction = 'customer'

  assert.throws(
    () => contract.normalizeUniversalConversation(input),
    (error) => error.code === 'INVALID_DIRECTION',
  )
})

test('rejeita texto ativo sem conteúdo', () => {
  const input = validConversation()
  input.messages[0].text_content = '   '

  assert.throws(
    () => contract.normalizeUniversalConversation(input),
    (error) => error.code === 'TEXT_CONTENT_REQUIRED',
  )
})

test('não transforma desaparecimento de DOM em exclusão factual', () => {
  const input = validConversation()
  input.messages[0] = {
    ...input.messages[0],
    is_deleted: true,
    deletion_reason: 'dom_disappearance',
  }

  assert.throws(
    () => contract.normalizeUniversalConversation(input),
    (error) => error.code === 'INVALID_DELETION_REASON',
  )
})

test('aceita exclusão apenas quando explicitamente confirmada', () => {
  const input = validConversation()
  input.messages[0] = {
    ...input.messages[0],
    is_deleted: true,
    deletion_reason: 'explicit_deletion',
  }

  const normalized = contract.normalizeUniversalConversation(input)
  assert.equal(normalized.messages[0].is_deleted, true)
  assert.equal(normalized.messages[0].text_content, null)
})

test('rejeita message_key duplicada no mesmo snapshot', () => {
  const input = validConversation()
  input.messages[1].message_key = input.messages[0].message_key

  assert.throws(
    () => contract.normalizeUniversalConversation(input),
    (error) => error.code === 'DUPLICATE_MESSAGE_KEY',
  )
})

test('valida a interface mínima de um platform adapter', () => {
  const adapter = Object.fromEntries(
    contract.PLATFORM_ADAPTER_METHODS.map((method) => [method, () => null]),
  )

  assert.equal(contract.assertPlatformAdapter(adapter), adapter)

  delete adapter.getComposer
  assert.throws(
    () => contract.assertPlatformAdapter(adapter),
    (error) =>
      error.code === 'ADAPTER_METHOD_REQUIRED' &&
      error.path === 'adapter.getComposer',
  )
})

test('constrói conversation_key namespaced sem misturar separadores da identidade externa', () => {
  assert.equal(
    contract.buildNamespacedConversationKey({
      platform: 'ManyChat',
      channel: 'WhatsApp',
      externalIdentity: 'contact/123:abc',
    }),
    'manychat:whatsapp:contact%2F123%3Aabc',
  )
})
