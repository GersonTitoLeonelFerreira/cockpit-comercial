import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)
require('../src/platform-contract.js')
require('../src/manychat-surface.js')
require('../src/manychat-message-semantics.js')
require('../src/manychat-message-identity.js')
require('../src/manychat-message-content.js')
require('../src/manychat-message-profile.js')
require('../src/manychat-dom-reader.js')
require('../src/manychat-adapter.js')
require('../src/capture-batch.js')
const runtimeApi = require('../src/manychat-capture-runtime.js')

const CONVERSATION_URL_A = 'https://app.manychat.com/fb3678277/chat/438324835'
const CONVERSATION_URL_B = 'https://app.manychat.com/fb3678277/chat/999999999'

// manychat-adapter.js exige evidência de canal e de atribuição para
// produzir uma UniversalConversation (ver comentário em
// manychat-capture-runtime.js). Nenhum seletor real foi validado ainda
// contra o DOM do ManyChat para isso — os marcadores abaixo
// (data-fixture-channel/data-fixture-assignment) são SOMENTE deste teste,
// para exercitar o runtime de ponta a ponta com evidência conhecida.
const SELECTORS = {
  conversationRoot: 'div[data-test-id="chat-messages-list"]',
  channel: '[data-fixture-channel]',
  assignment: '[data-fixture-assignment]',
  messages: ':scope > div > div[data-title-at][data-title-offset-bottom][data-title]',
}

function readChannel(node) {
  return node.getAttribute('data-fixture-channel')
}

function readAssignment() {
  return {
    known: true,
    assigned: true,
    agent_id: 'seller-1',
    agent_name: 'Maria',
  }
}

function buildDom(messages = []) {
  const messageHtml = messages
    .map(
      (message) => `
        <div>
          <div
            class="_wrapper_x ${message.classes ?? '_typeIn_x'}"
            data-title="${message.title ?? '2026-09-14T20:30:00'}"
            data-title-at="1"
            data-title-offset-bottom="1"
          >
            <span data-mid="${message.mid}">${message.text ?? ''}</span>
          </div>
        </div>
      `,
    )
    .join('')

  return new JSDOM(
    `<!doctype html><html><body>
      <div data-test-id="chat-messages-list">
        <span data-fixture-channel="whatsapp"></span>
        <span data-fixture-assignment></span>
        ${messageHtml}
      </div>
    </body></html>`,
  )
}

function safeIdentityOk() {
  return {
    ok: true,
    payload: {
      ready: true,
      safe: {
        platform: 'manychat',
        platform_identity: {
          source: 'subscriber_id',
          key: `manychat:contact:v1:sha256:${'a'.repeat(64)}`,
        },
      },
    },
  }
}

function safeIdentityNotReady() {
  return { ok: false, payload: { ready: false, reason: 'account_key_missing' } }
}

function resolveLeadOwnedByMe(cycleId = 'cycle-1') {
  return {
    ok: true,
    payload: {
      status: 'OWNED_BY_ME',
      cycle: { id: cycleId },
      actions: { can_analyze_conversation: true },
      flags: { is_closed: false },
    },
  }
}

function resolveLeadNotLinked() {
  return {
    ok: true,
    payload: {
      status: 'CONTACT_NOT_LINKED',
      cycle: null,
      actions: { can_analyze_conversation: false },
      flags: {},
    },
  }
}

function ingestOk(results = []) {
  return { ok: true, payload: { message_results: results } }
}

function createQueuedSender(responses) {
  const calls = []
  return {
    calls,
    async sendMessage(message) {
      calls.push(message)
      const next = responses[calls.length - 1]
      if (!next) {
        throw new Error(`[fake-send-message] fila vazia na chamada ${calls.length}`)
      }
      return typeof next === 'function' ? next(message, calls.length) : next
    },
  }
}

function createRuntime({ dom, sendMessage, getConversationUrl, now }) {
  return runtimeApi.createManyChatCaptureRuntime({
    document: dom.window.document,
    selectors: SELECTORS,
    readChannel,
    readAssignment,
    sendMessage,
    getConversationUrl: getConversationUrl ?? (() => CONVERSATION_URL_A),
    now: now ?? (() => '2026-09-14T20:35:00.000Z'),
  })
}

test('captureNow resolve identidade, lead e envia o lote de captura', async () => {
  const dom = buildDom([
    { mid: 'native-1', text: 'Quero saber o preço.', classes: '_typeIn_x' },
  ])

  const fake = createQueuedSender([
    safeIdentityOk(),
    resolveLeadOwnedByMe(),
    ingestOk([{ message_key: 'manychat:native-1', synced: true, canonical_version: '1' }]),
  ])

  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage })
  const result = await runtime.captureNow()

  assert.equal(result.ok, true)
  assert.equal(result.skipped, false)
  assert.equal(fake.calls.length, 3)
  assert.equal(fake.calls[0].action, 'GET_MANYCHAT_SAFE_IDENTITY')
  assert.equal(fake.calls[1].action, 'RESOLVE_LEAD')
  assert.equal(fake.calls[1].payload.platform, 'manychat')
  assert.equal(
    fake.calls[1].payload.platform_contact_key,
    `manychat:contact:v1:sha256:${'a'.repeat(64)}`,
  )
  assert.equal(fake.calls[2].action, 'INGEST_CAPTURE_MESSAGES')
  assert.equal(fake.calls[2].payload.cycle_id, 'cycle-1')
  assert.equal(fake.calls[2].payload.messages[0].message_key, 'manychat:native-1')
  assert.equal(fake.calls[2].payload.messages[0].author_kind, 'customer')
  assert.equal(fake.calls[2].payload.messages[0].base_version, null)

  const state = runtime.getConversationState(fake.calls[2].payload.conversation_key)
  assert.equal(state.baseVersionsByMessageKey['manychat:native-1'], '1')
})

test('segunda captura sem mudança nenhuma é no-op e reaproveita a resolução de ciclo em cache', async () => {
  const dom = buildDom([{ mid: 'native-1', text: 'Quero saber o preço.' }])

  const fake = createQueuedSender([
    safeIdentityOk(),
    resolveLeadOwnedByMe(),
    ingestOk([{ message_key: 'manychat:native-1', synced: true, canonical_version: '1' }]),
  ])

  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage })

  const first = await runtime.captureNow()
  assert.equal(first.skipped, false)

  const second = await runtime.captureNow()
  assert.equal(second.ok, true)
  assert.equal(second.skipped, true)
  assert.equal(second.reason, 'unchanged_snapshot')

  // nenhuma chamada adicional: nem identidade/lead (cache por conversation_key),
  // nem ingestão (snapshot idêntico).
  assert.equal(fake.calls.length, 3)

  // Uma terceira chamada precisa CONVERGIR (continuar no-op), não reenviar
  // para sempre só porque base_version mudou depois do primeiro envio
  // bem-sucedido — base_version é bookkeeping, não conteúdo novo.
  const third = await runtime.captureNow()
  assert.equal(third.skipped, true)
  assert.equal(fake.calls.length, 3)
})

test('contato não vinculado (CONTACT_NOT_LINKED) nunca chega a montar nem enviar captura', async () => {
  const dom = buildDom([{ mid: 'native-1', text: 'Quero saber o preço.' }])

  const fake = createQueuedSender([safeIdentityOk(), resolveLeadNotLinked()])

  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage })
  const result = await runtime.captureNow()

  assert.equal(result.ok, false)
  assert.equal(result.reason, 'CONTACT_NOT_LINKED')
  assert.equal(fake.calls.length, 2)
  assert.equal(
    fake.calls.some((call) => call.action === 'INGEST_CAPTURE_MESSAGES'),
    false,
  )
})

test('identidade indisponível nunca chega a chamar RESOLVE_LEAD', async () => {
  const dom = buildDom([{ mid: 'native-1', text: 'Quero saber o preço.' }])
  const fake = createQueuedSender([safeIdentityNotReady()])

  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage })
  const result = await runtime.captureNow()

  assert.equal(result.ok, false)
  assert.equal(result.reason, 'identity_not_ready')
  assert.equal(fake.calls.length, 1)
})

test('conversa sem mensagem elegível (só automação) não dispara ingestão', async () => {
  const dom = buildDom([
    { mid: 'bot-1', text: 'Como posso ajudar?', classes: '_typeOut_x _botMessage_x' },
  ])

  const fake = createQueuedSender([safeIdentityOk(), resolveLeadOwnedByMe()])

  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage })
  const result = await runtime.captureNow()

  assert.equal(result.ok, true)
  assert.equal(result.skipped, true)
  assert.equal(result.reason, 'no_eligible_messages')
  assert.equal(fake.calls.length, 2)
})

test('troca de conversa durante a resolução assíncrona de identidade/lead nunca captura para a conversa errada', async () => {
  const dom = buildDom([{ mid: 'native-1', text: 'Quero saber o preço.' }])
  const fake = createQueuedSender([safeIdentityOk(), resolveLeadOwnedByMe()])

  let calls = 0
  const getConversationUrl = () => {
    calls += 1
    // A primeira leitura (início de captureNow) ainda vê a conversa A; a
    // resolução de identidade/lead é assíncrona, e quando ela termina o
    // usuário já trocou para B.
    return calls === 1 ? CONVERSATION_URL_A : CONVERSATION_URL_B
  }

  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage, getConversationUrl })
  const result = await runtime.captureNow()

  assert.equal(result.ok, false)
  assert.equal(result.reason, 'conversation_changed_during_resolution')
  assert.equal(
    fake.calls.some((call) => call.action === 'INGEST_CAPTURE_MESSAGES'),
    false,
  )
})

test('conversa não suportada (fora de app.manychat.com) não chama nenhuma mensagem de background', async () => {
  const dom = buildDom([{ mid: 'native-1', text: 'oi' }])
  const fake = createQueuedSender([])

  const runtime = createRuntime({
    dom,
    sendMessage: fake.sendMessage,
    getConversationUrl: () => 'https://example.com/nao-e-manychat',
  })

  const result = await runtime.captureNow()

  assert.equal(result.ok, false)
  assert.equal(result.reason, 'conversation_not_supported')
  assert.equal(fake.calls.length, 0)
})

test('resposta de ingestão rejeitada não atualiza base_version nem o snapshot confirmado', async () => {
  const dom = buildDom([{ mid: 'native-1', text: 'Quero saber o preço.' }])

  const fake = createQueuedSender([
    safeIdentityOk(),
    resolveLeadOwnedByMe(),
    { ok: false, payload: { status: 'CAPTURE_INGESTION_REJECTED' } },
  ])

  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage })
  const result = await runtime.captureNow()

  assert.equal(result.ok, false)
  assert.equal(result.reason, 'ingestion_rejected')

  const conversationKey = fake.calls[2].payload.conversation_key
  const state = runtime.getConversationState(conversationKey)
  assert.deepEqual(state.baseVersionsByMessageKey, {})
  assert.equal(state.lastContentFingerprint, null)
})

// -----------------------------------------------------------------------
// Debounce/coalescing do observer: usa um readerApi FALSO para isolar a
// lógica de agendamento do parsing real do DOM.
// -----------------------------------------------------------------------

function createFakeScheduler() {
  let nextId = 1
  const pending = new Map()
  const canceled = []
  return {
    pendingCount: () => pending.size,
    canceled,
    schedule(fn) {
      const id = nextId++
      pending.set(id, fn)
      return id
    },
    cancel(id) {
      canceled.push(id)
      pending.delete(id)
    },
    flush() {
      const fns = Array.from(pending.values())
      pending.clear()
      fns.forEach((fn) => fn())
    },
  }
}

function createFakeReaderAdapter() {
  let observerCallback = null
  let stopped = false

  const reader = {
    observeChanges(callback) {
      observerCallback = callback
      return () => {
        stopped = true
      }
    },
  }

  return {
    readerApi: { createManyChatDomReader: () => reader },
    adapterApi: {
      createManyChatAdapter: () => ({
        getCurrentConversation: () => ({ supported: false, conversation_key: null }),
        buildUniversalConversation: () => ({ ready: false, reason: 'not_supported' }),
      }),
    },
    emit(event) {
      observerCallback?.(event)
    },
    isStopped: () => stopped,
  }
}

test('múltiplos eventos de mutação em sequência agendam somente UMA captura (debounce)', () => {
  const fakeParts = createFakeReaderAdapter()
  const scheduler = createFakeScheduler()

  const runtime = runtimeApi.createManyChatCaptureRuntime({
    selectors: SELECTORS,
    sendMessage: async () => ({ ok: true, payload: {} }),
    readerApi: fakeParts.readerApi,
    adapterApi: fakeParts.adapterApi,
    captureBatchApi: require('../src/capture-batch.js'),
    messageProfileApi: require('../src/manychat-message-profile.js'),
    schedule: scheduler.schedule,
    cancelSchedule: scheduler.cancel,
  })

  runtime.start()
  assert.equal(scheduler.pendingCount(), 1, 'start() já agenda a primeira captura')

  fakeParts.emit({ type: 'conversation_mutated' })
  fakeParts.emit({ type: 'conversation_mutated' })
  fakeParts.emit({ type: 'conversation_changed' })

  assert.equal(scheduler.pendingCount(), 1, 'eventos repetidos cancelam o agendamento anterior')
  assert.equal(scheduler.canceled.length, 3)

  runtime.stop()
  assert.equal(fakeParts.isStopped(), true)
  assert.equal(scheduler.pendingCount(), 0, 'stop() cancela o agendamento pendente')
})
