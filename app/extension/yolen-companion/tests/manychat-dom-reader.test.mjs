import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)
const contract = require('../src/platform-contract.js')
const surface = require('../src/manychat-surface.js')
const adapterApi = require('../src/manychat-adapter.js')
const readerApi = require('../src/manychat-dom-reader.js')

function createFixture(contactId = '1001') {
  return new JSDOM(`
    <!doctype html>
    <html>
      <body>
        <main data-fixture-conversation>
          <header>
            <span data-fixture-channel="whatsapp">WhatsApp</span>
            <span
              data-fixture-contact
              data-name="João"
              data-phone="+5547999990001"
              data-contact-id="${contactId}"
            ></span>
            <span
              data-fixture-assignment
              data-known="true"
              data-assigned="true"
              data-agent-id="agent-7"
              data-agent-name="Maria"
            ></span>
          </header>
          <section data-fixture-messages>
            <article
              data-fixture-message
              data-message-id="m-1"
              data-direction="incoming"
              data-occurred-at="2026-09-14T12:00:00-03:00"
            >Quero começar esta semana.</article>
            <article
              data-fixture-message
              data-message-id="m-2"
              data-direction="outgoing"
              data-occurred-at="2026-09-14T12:01:00-03:00"
            >Certo. Vou te orientar.</article>
          </section>
          <div data-fixture-composer contenteditable="true"></div>
        </main>
      </body>
    </html>
  `)
}

function createProfile() {
  return {
    selectors: {
      conversationRoot: '[data-fixture-conversation]',
      channel: '[data-fixture-channel]',
      contact: '[data-fixture-contact]',
      assignment: '[data-fixture-assignment]',
      messages: '[data-fixture-message]',
      composer: '[data-fixture-composer]',
    },
    readChannel(node) {
      return node.dataset.fixtureChannel
    },
    readContact(node) {
      return {
        name: node.dataset.name,
        phone: node.dataset.phone,
        external_contact_id: node.dataset.contactId,
      }
    },
    readAssignment(node) {
      return {
        known: node.dataset.known === 'true',
        assigned: node.dataset.assigned === 'true',
        agent_id: node.dataset.agentId,
        agent_name: node.dataset.agentName,
      }
    },
    readMessage(node) {
      return {
        message_key: node.dataset.messageId,
        direction: node.dataset.direction,
        author_kind:
          node.dataset.direction === 'outgoing' ? 'human_agent' : 'customer',
        occurred_at: node.dataset.occurredAt,
        content_type: 'text',
        text_content: node.textContent.trim(),
        audio_transcription: null,
        is_deleted: false,
        deletion_reason: null,
      }
    },
  }
}

function createReader(dom, currentUrlRef, overrides = {}) {
  return readerApi.createManyChatDomReader({
    document: dom.window.document,
    MutationObserver: dom.window.MutationObserver,
    profile: createProfile(),
    surfaceProvider: () => surface.parseManyChatConversationUrl(currentUrlRef.value),
    ...overrides,
  })
}

// Scheduler falso para os testes de debounce/coalescing do observer: nunca
// depende de setTimeout real, então os testes ficam determinísticos e
// rápidos (flush() dispara manualmente o callback pendente).
function createFakeScheduler() {
  let nextId = 1
  const pending = new Map()
  return {
    schedule(fn) {
      const id = nextId++
      pending.set(id, fn)
      return id
    },
    cancel(id) {
      pending.delete(id)
    },
    pendingCount: () => pending.size,
    flush() {
      const fns = Array.from(pending.values())
      pending.clear()
      fns.forEach((fn) => fn())
    },
  }
}

test('reader DOM usa somente profile explícito e não inventa seletores ManyChat', () => {
  const dom = createFixture()
  const currentUrlRef = {
    value: 'https://app.manychat.com/fb871594/chat/1001',
  }
  const currentSurface = surface.parseManyChatConversationUrl(currentUrlRef.value)
  const reader = createReader(dom, currentUrlRef)

  assert.equal(reader.getChannel(currentSurface), 'whatsapp')
  assert.deepEqual(reader.getContact(currentSurface), {
    name: 'João',
    phone: '+5547999990001',
    external_contact_id: '1001',
  })
  assert.deepEqual(reader.getAssignment(currentSurface), {
    known: true,
    assigned: true,
    agent_id: 'agent-7',
    agent_name: 'Maria',
  })

  const messages = reader.collectVisibleMessages(currentSurface)
  assert.equal(messages.length, 2)
  assert.equal(messages[0].message_key, 'm-1')
  assert.equal(messages[0].direction, 'incoming')
  assert.equal(messages[1].direction, 'outgoing')
})

test('reader + adapter produzem UniversalConversation válida sem tocar em persistência', () => {
  const dom = createFixture()
  const currentUrlRef = {
    value: 'https://app.manychat.com/fb871594/chat/1001',
  }
  const reader = createReader(dom, currentUrlRef)
  const adapter = adapterApi.createManyChatAdapter({
    reader,
    now: () => '2026-09-14T16:00:00Z',
  })

  const result = adapter.buildUniversalConversation(currentUrlRef.value)

  assert.equal(result.ready, true)
  assert.equal(result.conversation.contract_version, contract.CONTRACT_VERSION)
  assert.equal(result.conversation.platform, 'manychat')
  assert.equal(result.conversation.channel, 'whatsapp')
  assert.equal(result.conversation.contact.external_contact_id, '1001')
  assert.equal(result.conversation.messages.length, 2)

  const snapshot = adapter.createReadOnlySnapshot(currentUrlRef.value)
  assert.equal(snapshot.capture_enabled, false)
  assert.equal(snapshot.persistence_enabled, false)
  assert.equal(snapshot.reasoning_enabled, false)
  assert.equal(snapshot.composer_enabled, false)
})

test('ausência de evidência de assignment permanece desconhecida e não bloqueia a captura', () => {
  const dom = createFixture()
  dom.window.document
    .querySelector('[data-fixture-assignment]')
    .remove()

  const currentUrlRef = {
    value: 'https://app.manychat.com/fb871594/chat/1001',
  }
  const currentSurface = surface.parseManyChatConversationUrl(currentUrlRef.value)
  const reader = createReader(dom, currentUrlRef)

  assert.deepEqual(reader.getAssignment(currentSurface), {
    known: false,
    assigned: null,
    agent_id: null,
    agent_name: null,
  })

  // assignment é metadado informativo (nunca usado por autorização — o
  // backend Yolen via resolve-lead é a única autoridade sobre ownership),
  // então não conhecê-lo não pode impedir a captura das mensagens.
  const adapter = adapterApi.createManyChatAdapter({ reader })
  const evidence = adapter.getEvidenceState(currentUrlRef.value)
  assert.equal(evidence.ready, true)
  assert.ok(!evidence.missing.includes('assignment'))
})

test('mensagem removida do DOM não vira exclusão factual automaticamente', () => {
  const dom = createFixture()
  const currentUrlRef = {
    value: 'https://app.manychat.com/fb871594/chat/1001',
  }
  const currentSurface = surface.parseManyChatConversationUrl(currentUrlRef.value)
  const reader = createReader(dom, currentUrlRef)

  const before = reader.collectVisibleMessages(currentSurface)
  assert.equal(before.length, 2)

  dom.window.document.querySelector('[data-message-id="m-1"]').remove()

  const after = reader.collectVisibleMessages(currentSurface)
  assert.equal(after.length, 1)
  assert.equal(after[0].message_key, 'm-2')
  assert.equal(after.some((message) => message.is_deleted), false)
})

test('reader rejeita exclusão sem evidência explícita', () => {
  const dom = createFixture()
  const currentUrlRef = {
    value: 'https://app.manychat.com/fb871594/chat/1001',
  }
  const profile = createProfile()
  profile.readMessage = (node) => ({
    message_key: node.dataset.messageId,
    direction: node.dataset.direction,
    author_kind:
      node.dataset.direction === 'outgoing' ? 'human_agent' : 'customer',
    occurred_at: node.dataset.occurredAt,
    content_type: 'text',
    text_content: null,
    audio_transcription: null,
    is_deleted: true,
    deletion_reason: 'dom_disappearance',
  })

  const reader = readerApi.createManyChatDomReader({
    document: dom.window.document,
    MutationObserver: dom.window.MutationObserver,
    profile,
    surfaceProvider: () => surface.parseManyChatConversationUrl(currentUrlRef.value),
  })
  const currentSurface = surface.parseManyChatConversationUrl(currentUrlRef.value)

  assert.throws(
    () => reader.collectVisibleMessages(currentSurface),
    (error) => error.code === 'UNPROVEN_DELETION',
  )
})

test('troca A→B é emitida como mudança de conversa e nunca como mutação de A', async () => {
  const dom = createFixture()
  const currentUrlRef = {
    value: 'https://app.manychat.com/fb871594/chat/1001',
  }
  const reader = createReader(dom, currentUrlRef)
  const events = []
  const stop = reader.observeChanges((event) => events.push(event))

  currentUrlRef.value = 'https://app.manychat.com/fb871594/chat/2002'
  dom.window.document.body.append(dom.window.document.createElement('span'))

  await new Promise((resolve) => setTimeout(resolve, 0))
  stop()

  assert.equal(events.length, 1)
  assert.equal(events[0].type, 'conversation_changed')
  assert.match(events[0].previous_conversation_key, /1001/)
  assert.match(events[0].conversation_key, /2002/)
})

test('mutação na mesma conversa preserva a conversation_key atual (após o debounce)', async () => {
  const dom = createFixture()
  const currentUrlRef = {
    value: 'https://app.manychat.com/fb871594/chat/1001',
  }
  const scheduler = createFakeScheduler()
  const reader = createReader(dom, currentUrlRef, {
    schedule: scheduler.schedule,
    cancelSchedule: scheduler.cancel,
  })
  const events = []
  const stop = reader.observeChanges((event) => events.push(event))

  const node = dom.window.document.querySelector('[data-message-id="m-2"]')
  node.textContent = 'Nova versão visível da mesma mensagem.'

  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(events.length, 0, 'a notificação fica pendente até o debounce disparar')

  scheduler.flush()
  stop()

  assert.equal(events.length, 1)
  assert.equal(events[0].type, 'conversation_mutated')
  assert.match(events[0].conversation_key, /1001/)
})

test('rajada de mutações reais na mesma conversa é coalescida em UM único evento (debounce)', async () => {
  const dom = createFixture()
  const currentUrlRef = {
    value: 'https://app.manychat.com/fb871594/chat/1001',
  }
  const scheduler = createFakeScheduler()
  const reader = createReader(dom, currentUrlRef, {
    schedule: scheduler.schedule,
    cancelSchedule: scheduler.cancel,
  })
  const events = []
  const stop = reader.observeChanges((event) => events.push(event))

  const node = dom.window.document.querySelector('[data-message-id="m-2"]')
  node.textContent = 'Primeira atualização.'
  await new Promise((resolve) => setTimeout(resolve, 0))
  node.textContent = 'Segunda atualização.'
  await new Promise((resolve) => setTimeout(resolve, 0))
  node.textContent = 'Terceira atualização.'
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(scheduler.pendingCount(), 1, 'cada mutação nova cancela o agendamento anterior')

  scheduler.flush()
  stop()

  assert.equal(events.length, 1, 'a rajada inteira vira um único evento, não um por mutação')
  assert.equal(events[0].type, 'conversation_mutated')
})

test('mutação restrita ao próprio painel Yolen nunca reaciona o observer (evita loop autoinduzido)', async () => {
  const dom = createFixture()
  const currentUrlRef = {
    value: 'https://app.manychat.com/fb871594/chat/1001',
  }
  const scheduler = createFakeScheduler()
  const reader = createReader(dom, currentUrlRef, {
    schedule: scheduler.schedule,
    cancelSchedule: scheduler.cancel,
  })

  const panel = dom.window.document.createElement('aside')
  panel.setAttribute('data-yolen-platform', 'manychat')
  dom.window.document.body.append(panel)

  const events = []
  const stop = reader.observeChanges((event) => events.push(event))

  // Simula exatamente o que o painel faz a cada render: reescrever o
  // próprio innerHTML. Isso é uma mutação real (childList) — mas dentro da
  // NOSSA UI, então nunca deve contar como "a conversa mudou".
  panel.innerHTML = '<section>AGORA</section><section>ANÁLISE</section>'
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(scheduler.pendingCount(), 0, 'nenhuma notificação é sequer agendada')
  assert.equal(events.length, 0)

  // Confirma que o observer continua vivo e funcional para mutações reais
  // do ManyChat (a exclusão é só para a própria UI, não desliga o reader).
  const node = dom.window.document.querySelector('[data-message-id="m-2"]')
  node.textContent = 'Mutação real do ManyChat.'
  await new Promise((resolve) => setTimeout(resolve, 0))
  scheduler.flush()
  stop()

  assert.equal(events.length, 1)
  assert.equal(events[0].type, 'conversation_mutated')
})

test('mudança de atributo isolada não é mais observada (redução deliberada de ruído/tempestade de mutações)', async () => {
  const dom = createFixture()
  const currentUrlRef = {
    value: 'https://app.manychat.com/fb871594/chat/1001',
  }
  const scheduler = createFakeScheduler()
  const reader = createReader(dom, currentUrlRef, {
    schedule: scheduler.schedule,
    cancelSchedule: scheduler.cancel,
  })
  const events = []
  const stop = reader.observeChanges((event) => events.push(event))

  const node = dom.window.document.querySelector('[data-message-id="m-2"]')
  node.setAttribute('aria-live', 'polite')

  await new Promise((resolve) => setTimeout(resolve, 0))
  stop()

  assert.equal(scheduler.pendingCount(), 0)
  assert.equal(events.length, 0)
})

test('profile sem readMessage falha fechado', () => {
  const dom = createFixture()
  const profile = createProfile()
  delete profile.readMessage

  assert.throws(
    () =>
      readerApi.createManyChatDomReader({
        document: dom.window.document,
        profile,
      }),
    (error) => error.code === 'MESSAGE_READER_REQUIRED',
  )
})
