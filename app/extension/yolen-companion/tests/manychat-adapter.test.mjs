import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const contract = require('../src/platform-contract.js')
const surface = require('../src/manychat-surface.js')
const manychat = require('../src/manychat-adapter.js')

const URL = 'https://app.manychat.com/fb871594/chat/1443150072'
const NOW = '2026-09-14T17:30:00.000Z'

function buildReader() {
  return {
    getChannel() {
      return 'whatsapp'
    },
    getContact(item) {
      return {
        name: 'João',
        phone: '+5547999990001',
        external_contact_id: item.external_contact_id,
      }
    },
    getAssignment() {
      return {
        known: true,
        assigned: true,
        agent_id: 'seller-1',
        agent_name: 'Maria',
      }
    },
    collectVisibleMessages() {
      return [
        {
          message_key: 'mc-1',
          direction: 'incoming',
          occurred_at: '2026-09-14T17:29:00.000Z',
          content_type: 'text',
          text_content: 'Quero começar esta semana.',
          audio_transcription: null,
          is_deleted: false,
          deletion_reason: null,
        },
      ]
    },
    getComposer() {
      return { kind: 'readonly-reference' }
    },
    observeChanges() {
      return () => {}
    },
  }
}

test('adapter ManyChat cumpre o contrato mínimo universal', () => {
  const adapter = manychat.createManyChatAdapter({ reader: buildReader() })
  assert.equal(contract.assertPlatformAdapter(adapter), adapter)
  assert.equal(adapter.getPlatform(), 'manychat')
})

test('sem reader comprovado o adapter não inventa canal, assignment ou mensagens', () => {
  const adapter = manychat.createManyChatAdapter({ now: () => NOW })
  const snapshot = adapter.createReadOnlySnapshot(URL)

  assert.equal(snapshot.surface.supported, true)
  assert.equal(snapshot.channel, 'unknown')
  assert.equal(snapshot.assignment.known, false)
  assert.deepEqual(snapshot.messages, [])
  assert.equal(snapshot.evidence_ready, false)
  assert.deepEqual(snapshot.missing_evidence, ['channel', 'assignment', 'messages'])
  assert.equal(snapshot.capture_enabled, false)
  assert.equal(snapshot.persistence_enabled, false)
  assert.equal(snapshot.reasoning_enabled, false)
  assert.equal(snapshot.composer_enabled, false)
})

test('identidade mínima do contato vem apenas da rota já validada', () => {
  const adapter = manychat.createManyChatAdapter()
  const contact = adapter.getContact(URL)

  assert.deepEqual(contact, {
    name: null,
    phone: null,
    external_contact_id: '1443150072',
  })
})

test('com evidência suficiente o adapter produz UniversalConversation válido', () => {
  const adapter = manychat.createManyChatAdapter({
    reader: buildReader(),
    now: () => NOW,
  })

  const result = adapter.buildUniversalConversation(URL)

  assert.equal(result.ready, true)
  assert.equal(result.conversation.platform, 'manychat')
  assert.equal(result.conversation.channel, 'whatsapp')
  assert.equal(result.conversation.contact.name, 'João')
  assert.equal(result.conversation.assignment.assigned, true)
  assert.equal(result.conversation.messages.length, 1)
  assert.equal(result.conversation.messages[0].direction, 'incoming')
  assert.equal(result.conversation.observed_at, NOW)
  assert.equal(
    result.conversation.conversation_key,
    surface.parseManyChatConversationUrl(URL).conversation_key,
  )
})

test('assignment desconhecido não é tratado como conversa não atribuída', () => {
  const reader = buildReader()
  reader.getAssignment = () => ({ known: false, assigned: false })

  const adapter = manychat.createManyChatAdapter({ reader })
  const assignment = adapter.getAssignment(URL)
  const result = adapter.buildUniversalConversation(URL)

  assert.equal(assignment.known, false)
  assert.equal(assignment.assigned, null)
  assert.equal(result.ready, false)
  assert.ok(result.missing.includes('assignment'))
})

test('rota fora de conversa falha fechada antes de qualquer leitura', () => {
  let calls = 0
  const reader = buildReader()
  reader.getChannel = () => {
    calls += 1
    return 'whatsapp'
  }

  const adapter = manychat.createManyChatAdapter({ reader })
  const result = adapter.buildUniversalConversation(
    'https://app.manychat.com/fb871594/dashboard',
  )

  assert.equal(result.ready, false)
  assert.equal(result.reason, 'unsupported_route')
  assert.equal(result.conversation, null)
  assert.equal(calls, 0)
})
