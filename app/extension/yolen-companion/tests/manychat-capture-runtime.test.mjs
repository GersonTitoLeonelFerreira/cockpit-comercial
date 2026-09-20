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
require('../src/manychat-audio-source.js')
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
            <span data-mid="${message.mid}">${
              message.audioUrl
                ? `<audio><source src="${message.audioUrl}" type="audio/ogg"></audio>`
                : (message.text ?? '')
            }</span>
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

function transcribeOk(text) {
  return { ok: true, payload: { ok: true, data: { text } } }
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

test('captura funciona mesmo sem NENHUMA evidência de canal ou atribuição (realidade atual do ManyChat)', async () => {
  const dom = buildDom([{ mid: 'native-1', text: 'Quero saber o preço.' }])

  const fake = createQueuedSender([
    safeIdentityOk(),
    resolveLeadOwnedByMe(),
    ingestOk([{ message_key: 'manychat:native-1', synced: true, canonical_version: '1' }]),
  ])

  const runtime = runtimeApi.createManyChatCaptureRuntime({
    document: dom.window.document,
    // Sem selectors.channel/selectors.assignment nem readChannel/
    // readAssignment: nenhuma evidência de DOM ou de estado interno foi
    // encontrada para nenhum dos dois (busca ao vivo confirmada vazia).
    selectors: {
      conversationRoot: SELECTORS.conversationRoot,
      messages: SELECTORS.messages,
    },
    sendMessage: fake.sendMessage,
    getConversationUrl: () => CONVERSATION_URL_A,
    now: () => '2026-09-14T20:35:00.000Z',
  })

  const result = await runtime.captureNow()

  assert.equal(result.ok, true)
  assert.equal(result.skipped, false)
  assert.equal(fake.calls[2].payload.messages[0].message_key, 'manychat:native-1')
})

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
// Transcrição de áudio com cycle_id REAL (nunca o cycle de teste do probe
// manual em manychat-audio-dispatch-runtime.js).
// -----------------------------------------------------------------------

test('mensagem de áudio é transcrita com o cycle_id real e reenviada como nova versão da MESMA mensagem', async () => {
  const dom = buildDom([
    { mid: 'audio-1', audioUrl: 'https://manybot-files.manychat.io/audio.ogg' },
  ])

  const fake = createQueuedSender([
    safeIdentityOk(),
    resolveLeadOwnedByMe('cycle-real-1'),
    ingestOk([{ message_key: 'manychat:audio-1', synced: true, canonical_version: '1' }]),
    transcribeOk('Quero saber o valor do plano.'),
    ingestOk([{ message_key: 'manychat:audio-1', synced: true, canonical_version: '2' }]),
  ])

  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage })
  const result = await runtime.captureNow()

  assert.equal(result.ok, true)
  assert.equal(fake.calls.length, 5)

  assert.equal(fake.calls[2].payload.messages[0].content_type, 'audio')
  assert.equal(fake.calls[2].payload.messages[0].audio_transcription, null)

  assert.equal(fake.calls[3].action, 'TRANSCRIBE_MANYCHAT_AUDIO')
  assert.equal(fake.calls[3].payload.audio_url, 'https://manybot-files.manychat.io/audio.ogg')
  assert.equal(fake.calls[3].payload.cycle_id, 'cycle-real-1')
  assert.equal(fake.calls[3].payload.audio_target_key, 'manychat:audio-1')

  assert.equal(fake.calls[4].action, 'INGEST_CAPTURE_MESSAGES')
  const resent = fake.calls[4].payload.messages[0]
  assert.equal(resent.message_key, 'manychat:audio-1')
  assert.equal(resent.audio_transcription, 'Quero saber o valor do plano.')
  // Reenvia como NOVA VERSÃO da mesma mensagem (base_version = canonical
  // confirmado no envio anterior), nunca um registro paralelo.
  assert.equal(resent.base_version, '1')

  const state = runtime.getConversationState(fake.calls[2].payload.conversation_key)
  assert.equal(state.baseVersionsByMessageKey['manychat:audio-1'], '2')
  assert.equal(state.transcribedMessageKeys.has('manychat:audio-1'), true)
})

test('mensagem já transcrita nesta conversa nunca é reprocessada numa segunda captura', async () => {
  const dom = buildDom([
    { mid: 'audio-1', audioUrl: 'https://manybot-files.manychat.io/audio.ogg' },
  ])

  const fake = createQueuedSender([
    safeIdentityOk(),
    resolveLeadOwnedByMe(),
    ingestOk([{ message_key: 'manychat:audio-1', synced: true, canonical_version: '1' }]),
    transcribeOk('Quero saber o valor do plano.'),
    ingestOk([{ message_key: 'manychat:audio-1', synced: true, canonical_version: '2' }]),
  ])

  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage })
  await runtime.captureNow()
  assert.equal(fake.calls.length, 5)

  // O DOM continua mostrando a mesma mensagem de áudio sem transcrição
  // (a transcrição não altera o DOM — só o ledger no backend), mas o
  // dedupe local precisa impedir uma segunda tentativa de transcrição.
  await runtime.captureNow()
  assert.equal(fake.calls.length, 5)
})

test('fonte de áudio não confiável (sem HTTPS) nunca dispara transcrição nem quebra a captura de texto', async () => {
  const dom = buildDom([
    { mid: 'text-1', text: 'Olá, tudo bem?' },
    { mid: 'audio-1', audioUrl: 'http://sem-https.example.com/audio.ogg' },
  ])

  const fake = createQueuedSender([
    safeIdentityOk(),
    resolveLeadOwnedByMe(),
    ingestOk([
      { message_key: 'manychat:text-1', synced: true, canonical_version: '1' },
      { message_key: 'manychat:audio-1', synced: true, canonical_version: '1' },
    ]),
  ])

  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage })
  const result = await runtime.captureNow()

  assert.equal(result.ok, true)
  assert.equal(fake.calls.length, 3)
  assert.equal(
    fake.calls.some((call) => call.action === 'TRANSCRIBE_MANYCHAT_AUDIO'),
    false,
  )
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

// -----------------------------------------------------------------------
// Prova quantitativa de estado estável ocioso: usa o dom-reader REAL (com
// seus próprios timers reais internos de lifecycle/mutation-debounce, não
// injetados) + capture-runtime REAL, e só substitui o debounce PRÓPRIO do
// capture-runtime por um fake controlável — nunca o do reader, que
// continua com o comportamento real de produção. Mutações "de fundo" fora
// do conversationRoot (sidebar) ao longo de uma janela real de tempo nunca
// devem gerar conversation_mutated nem tráfego de rede repetido.
// -----------------------------------------------------------------------

test('mutações repetidas FORA do conversationRoot (sidebar) nunca disparam captureNow/sendMessage extra — integração real', async () => {
  const dom = buildDom([{ mid: 'native-1', text: 'Mensagem parada.' }])

  const sidebar = dom.window.document.createElement('nav')
  sidebar.setAttribute('data-fixture-sidebar', '')
  dom.window.document.body.append(sidebar)

  const scheduler = (() => {
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
      flush() {
        const fns = Array.from(pending.values())
        pending.clear()
        fns.forEach((fn) => fn())
      },
    }
  })()

  let sendMessageCount = 0
  let readerEventCount = 0
  let conversationMutatedCount = 0
  let captureResultCount = 0

  const runtime = runtimeApi.createManyChatCaptureRuntime({
    document: dom.window.document,
    MutationObserver: dom.window.MutationObserver,
    selectors: SELECTORS,
    readChannel,
    readAssignment,
    sendMessage: async () => {
      sendMessageCount += 1
      return safeIdentityNotReady()
    },
    getConversationUrl: () => CONVERSATION_URL_A,
    now: () => '2026-09-14T20:35:00.000Z',
    schedule: scheduler.schedule,
    cancelSchedule: scheduler.cancel,
    onEvent(event) {
      if (event?.type === 'reader_event') {
        readerEventCount += 1
        if (event.event?.type === 'conversation_mutated') conversationMutatedCount += 1
      } else if (event?.type === 'capture_result') {
        captureResultCount += 1
      }
    },
  })

  runtime.start()

  // Simula ~600ms reais de "conversa parada" com ruído de fundo (sidebar
  // mutando a cada 50ms) — cobre pelo menos um tick do polling real de
  // lifecycle (500ms) do reader real, sem nenhum fake nele.
  for (let i = 0; i < 12; i += 1) {
    sidebar.textContent = `Atualização ${i}`
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  // Só agora deixa a ÚNICA captura inicial (agendada por start()) rodar —
  // nunca uma por mutação de sidebar, já que nenhuma delas gerou reader
  // event nenhum.
  scheduler.flush()
  await new Promise((resolve) => setTimeout(resolve, 0))

  runtime.stop()

  assert.equal(conversationMutatedCount, 0, 'nenhuma mutação de sidebar virou conversation_mutated')
  assert.equal(captureResultCount, 1, 'só a captura inicial do start(), nunca uma por mutação de sidebar')
  assert.equal(sendMessageCount, 1, 'só a tentativa inicial de identidade, nenhuma repetição por ruído de fundo')
  assert.ok(readerEventCount <= 1, 'nenhum reader_event espúrio vindo da sidebar')
})

// -----------------------------------------------------------------------
// STEP 2A.3 — refreshLeadResolution / getSafeIdentity (usados pelo fluxo de
// vínculo depois de um first-link bem-sucedido, para nunca inventar cycle
// a partir do lead selecionado na UI — só RESOLVE_LEAD decide).
// -----------------------------------------------------------------------

test('getSafeIdentity é exposto publicamente e devolve o mesmo formato usado internamente', async () => {
  const dom = buildDom([])
  const fake = createQueuedSender([safeIdentityOk()])
  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage })

  const identity = await runtime.getSafeIdentity()

  assert.equal(identity.platform, 'manychat')
  assert.equal(identity.platform_identity.key, `manychat:contact:v1:sha256:${'a'.repeat(64)}`)
  assert.equal(fake.calls[0].action, 'GET_MANYCHAT_SAFE_IDENTITY')
})

test('refreshLeadResolution sempre busca de novo (nunca usa cache), sobrescreve só state.resolution e preserva os demais campos da conversa', async () => {
  const dom = buildDom([{ mid: 'native-1', text: 'Quero saber o preço.' }])

  // createQueuedSender lê da MESMA referência de array a cada chamada —
  // podemos empurrar mais respostas nela depois da primeira captura, sem
  // precisar recriar o runtime (o estado por conversa é interno e não dá
  // pra transportar entre duas instâncias).
  const responses = [
    safeIdentityOk(),
    resolveLeadOwnedByMe('cycle-1'),
    ingestOk([{ message_key: 'manychat:native-1', synced: true, canonical_version: '1' }]),
  ]
  const fake = createQueuedSender(responses)

  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage })

  const first = await runtime.captureNow()
  assert.equal(first.ok, true)
  const conversationKey = fake.calls[2].payload.conversation_key

  const stateBefore = runtime.getConversationState(conversationKey)
  assert.equal(stateBefore.resolution.cycle_id, 'cycle-1')
  assert.equal(stateBefore.baseVersionsByMessageKey['manychat:native-1'], '1')

  // Uma segunda captureNow, sem refresh, reaproveita o cache (nenhuma
  // chamada nova) — prova que o próximo passo está de fato testando o
  // refresh, não um efeito colateral de outra captura.
  const second = await runtime.captureNow()
  assert.equal(second.skipped, true)
  assert.equal(fake.calls.length, 3)

  responses.push(safeIdentityOk(), resolveLeadOwnedByMe('cycle-after-link'), safeIdentityOk())

  const refreshed = await runtime.refreshLeadResolution({
    conversationKey,
    expectedPlatform: 'manychat',
    expectedIdentityKey: `manychat:contact:v1:sha256:${'a'.repeat(64)}`,
  })

  assert.equal(refreshed.ready, true)
  assert.equal(refreshed.cycle_id, 'cycle-after-link')
  assert.equal(
    fake.calls.length,
    6,
    'refreshLeadResolution sempre chama identidade + resolve-lead + identidade de novo (revalidação pós-resolve), nunca usa cache',
  )
  assert.equal(fake.calls[3].action, 'GET_MANYCHAT_SAFE_IDENTITY')
  assert.equal(fake.calls[4].action, 'RESOLVE_LEAD')
  assert.equal(fake.calls[5].action, 'GET_MANYCHAT_SAFE_IDENTITY')

  const stateAfter = runtime.getConversationState(conversationKey)
  assert.equal(stateAfter.resolution.ready, true)
  assert.equal(stateAfter.resolution.cycle_id, 'cycle-after-link')
  // Nunca limpa os outros campos do estado da conversa — só resolution.
  assert.equal(stateAfter.baseVersionsByMessageKey['manychat:native-1'], '1')
})

test('refreshLeadResolution reflete um contato que deixou de ser capture-eligible (ex.: transferido para outro vendedor)', async () => {
  const dom = buildDom([{ mid: 'native-1', text: 'Quero saber o preço.' }])

  const responses = [
    safeIdentityOk(),
    resolveLeadOwnedByMe('cycle-1'),
    ingestOk([{ message_key: 'manychat:native-1', synced: true, canonical_version: '1' }]),
  ]
  const fake = createQueuedSender(responses)
  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage })

  await runtime.captureNow()
  const conversationKey = fake.calls[2].payload.conversation_key

  responses.push(
    safeIdentityOk(),
    {
      ok: true,
      payload: { status: 'OWNED_BY_OTHER', cycle: null, actions: {}, flags: {} },
    },
    safeIdentityOk(),
  )

  const refreshed = await runtime.refreshLeadResolution({
    conversationKey,
    expectedPlatform: 'manychat',
    expectedIdentityKey: `manychat:contact:v1:sha256:${'a'.repeat(64)}`,
  })

  assert.equal(refreshed.ready, false)
  assert.equal(refreshed.reason, 'OWNED_BY_OTHER')
  assert.equal(refreshed.cycle_id, null)
})

// -----------------------------------------------------------------------
// STEP 2A.3 — hardening final (auditoria de race condition A→B): o
// first-link de A pode terminar no servidor depois que o vendedor já
// trocou para B — refreshLeadResolution nunca pode gravar a resolução de B
// (ou de identidade errada) em state[A].
// -----------------------------------------------------------------------

test('getCurrentConversationKey é derivado ao vivo do adapter/URL, não de uma variável cacheada', () => {
  const dom = buildDom([])
  let url = CONVERSATION_URL_A

  const runtime = createRuntime({
    dom,
    sendMessage: async () => ({ ok: true, payload: {} }),
    getConversationUrl: () => url,
  })

  assert.match(runtime.getCurrentConversationKey(), /.+/)
  const keyA = runtime.getCurrentConversationKey()

  url = CONVERSATION_URL_B
  const keyB = runtime.getCurrentConversationKey()

  assert.notEqual(keyA, keyB, 'a conversation_key muda assim que a URL/adapter mudam, sem nenhum cache')
})

test('D/E: refreshLeadResolution nunca grava a resolução de B em state[A] quando a conversa mudou durante o await', async () => {
  const dom = buildDom([{ mid: 'native-1', text: 'Quero saber o preço.' }])

  const responses = [
    safeIdentityOk(),
    resolveLeadOwnedByMe('cycle-A'),
    ingestOk([{ message_key: 'manychat:native-1', synced: true, canonical_version: '1' }]),
  ]
  const fake = createQueuedSender(responses)

  let currentUrl = CONVERSATION_URL_A
  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage, getConversationUrl: () => currentUrl })

  await runtime.captureNow()
  const conversationKeyA = fake.calls[2].payload.conversation_key

  const stateABefore = runtime.getConversationState(conversationKeyA)
  assert.equal(stateABefore.resolution.cycle_id, 'cycle-A')

  // A resposta do backend para o refresh de A já está na fila, mas ANTES
  // dela ser consumida o vendedor troca para B (a checagem de
  // isCurrentConversation() interna precisa flagrar isso).
  responses.push(safeIdentityOk(), resolveLeadOwnedByMe('cycle-B-nunca-deveria-entrar-em-A'))
  currentUrl = CONVERSATION_URL_B

  const refreshed = await runtime.refreshLeadResolution({
    conversationKey: conversationKeyA,
    expectedPlatform: 'manychat',
    expectedIdentityKey: `manychat:contact:v1:sha256:${'a'.repeat(64)}`,
  })

  assert.equal(refreshed.ready, false)
  assert.equal(refreshed.reason, 'CONTACT_CHANGED')
  assert.equal(refreshed.cycle_id, null)

  const stateAAfter = runtime.getConversationState(conversationKeyA)
  assert.notEqual(stateAAfter.resolution?.cycle_id, 'cycle-B-nunca-deveria-entrar-em-A')
  // Cache antigo é limpo (nunca fica preso em CONTACT_NOT_LINKED para
  // sempre) — o próximo ciclo normal fará RESOLVE_LEAD de novo.
  assert.equal(stateAAfter.resolution, null)
})

test('D/E: refreshLeadResolution nunca grava a resolução quando a identidade segura mudou (mesma conversa, contato trocou)', async () => {
  const dom = buildDom([{ mid: 'native-1', text: 'Quero saber o preço.' }])

  const responses = [
    safeIdentityOk(),
    resolveLeadOwnedByMe('cycle-A'),
    ingestOk([{ message_key: 'manychat:native-1', synced: true, canonical_version: '1' }]),
  ]
  const fake = createQueuedSender(responses)
  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage })

  await runtime.captureNow()
  const conversationKey = fake.calls[2].payload.conversation_key

  // A identidade segura atual, no momento do refresh, já é outra pessoa
  // (ex.: o próprio ManyChat trocou de contato sem trocar de URL/thread).
  responses.push(
    {
      ok: true,
      payload: {
        ready: true,
        safe: {
          platform: 'manychat',
          platform_identity: { source: 'subscriber_id', key: `manychat:contact:v1:sha256:${'b'.repeat(64)}` },
        },
      },
    },
    resolveLeadOwnedByMe('cycle-outro-contato'),
  )

  const refreshed = await runtime.refreshLeadResolution({
    conversationKey,
    expectedPlatform: 'manychat',
    expectedIdentityKey: `manychat:contact:v1:sha256:${'a'.repeat(64)}`,
  })

  assert.equal(refreshed.ready, false)
  assert.equal(refreshed.reason, 'CONTACT_CHANGED')
  assert.equal(
    fake.calls.some((call) => call.action === 'RESOLVE_LEAD' && call === fake.calls.at(-1)),
    false,
    'nunca chega a chamar RESOLVE_LEAD quando a identidade já não confere',
  )
})

// -----------------------------------------------------------------------
// Auditoria terse "POST-RESOLVE IDENTITY REVALIDATION": resolveLeadForIdentity
// é outro await depois da primeira checagem de identidade — o ManyChat pode
// trocar de contato DENTRO da mesma conversation_key (thread reaproveitada)
// exatamente nessa janela, sem que isCurrentConversation() detecte nada
// (ela só compara conversation_key, nunca identidade). Sem reler a safe
// identity uma segunda vez depois do RESOLVE_LEAD, a resolução do contato
// ANTIGO seria persistida como se fosse do contato atual.
// -----------------------------------------------------------------------

test('POST-RESOLVE: refreshLeadResolution nunca grava a resolução quando a identidade muda ENTRE o resolve-lead e a persistência (mesma conversation_key)', async () => {
  const dom = buildDom([{ mid: 'native-1', text: 'Quero saber o preço.' }])

  const responses = [
    safeIdentityOk(),
    resolveLeadOwnedByMe('cycle-A'),
    ingestOk([{ message_key: 'manychat:native-1', synced: true, canonical_version: '1' }]),
  ]
  const fake = createQueuedSender(responses)
  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage })

  await runtime.captureNow()
  const conversationKey = fake.calls[2].payload.conversation_key

  const identityB = {
    ok: true,
    payload: {
      ready: true,
      safe: {
        platform: 'manychat',
        platform_identity: { source: 'subscriber_id', key: `manychat:contact:v1:sha256:${'b'.repeat(64)}` },
      },
    },
  }

  // 1ª checagem de identidade (antes do RESOLVE_LEAD): ainda é A, passa.
  // RESOLVE_LEAD: responde para A (cycle-outro-contato nunca deveria persistir).
  // 2ª checagem de identidade (depois do RESOLVE_LEAD, ANTES de persistir):
  // o ManyChat já trocou de contato para B na MESMA thread/conversation_key
  // — isCurrentConversation() sozinha não pegaria isso.
  responses.push(safeIdentityOk(), resolveLeadOwnedByMe('cycle-outro-contato-nunca-deveria-persistir'), identityB)

  const refreshed = await runtime.refreshLeadResolution({
    conversationKey,
    expectedPlatform: 'manychat',
    expectedIdentityKey: `manychat:contact:v1:sha256:${'a'.repeat(64)}`,
  })

  assert.equal(refreshed.ready, false)
  assert.equal(refreshed.reason, 'CONTACT_CHANGED')
  assert.equal(refreshed.cycle_id, null)

  const stateAfter = runtime.getConversationState(conversationKey)
  assert.equal(stateAfter.resolution, null)
  assert.notEqual(stateAfter.resolution?.cycle_id, 'cycle-outro-contato-nunca-deveria-persistir')

  // Prova que a 2ª checagem de identidade realmente aconteceu (3 chamadas
  // de refresh: identidade, resolve-lead, identidade de novo).
  assert.equal(fake.calls.length, 6)
  assert.equal(fake.calls[3].action, 'GET_MANYCHAT_SAFE_IDENTITY')
  assert.equal(fake.calls[4].action, 'RESOLVE_LEAD')
  assert.equal(fake.calls[5].action, 'GET_MANYCHAT_SAFE_IDENTITY')
})

test('F: depois de um refresh abortado por CONTACT_CHANGED, voltar para a conversa original faz RESOLVE_LEAD de novo (nunca serve cache velho)', async () => {
  const dom = buildDom([{ mid: 'native-1', text: 'Quero saber o preço.' }])

  const responses = [
    safeIdentityOk(),
    resolveLeadOwnedByMe('cycle-A'),
    ingestOk([{ message_key: 'manychat:native-1', synced: true, canonical_version: '1' }]),
  ]
  const fake = createQueuedSender(responses)

  let currentUrl = CONVERSATION_URL_A
  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage, getConversationUrl: () => currentUrl })

  await runtime.captureNow()
  const conversationKey = fake.calls[2].payload.conversation_key

  currentUrl = CONVERSATION_URL_B

  // Nada é empurrado na fila aqui de propósito: a checagem de conversa
  // atual aborta ANTES de qualquer chamada de identidade/resolve-lead
  // acontecer — se o teste falhar consumindo alguma resposta, é sinal de
  // regressão (deveria abortar sem tocar a rede).
  await runtime.refreshLeadResolution({
    conversationKey,
    expectedPlatform: 'manychat',
    expectedIdentityKey: `manychat:contact:v1:sha256:${'a'.repeat(64)}`,
  })

  assert.equal(runtime.getConversationState(conversationKey).resolution, null)

  // Vendedor volta para a conversa original — o próximo captureNow precisa
  // resolver de novo do zero (não existe mais cache para reaproveitar).
  currentUrl = CONVERSATION_URL_A
  responses.push(
    safeIdentityOk(),
    resolveLeadOwnedByMe('cycle-A-de-verdade'),
    // O cycle_id mudou (cycle-A -> cycle-A-de-verdade), então o
    // fingerprint de conteúdo muda mesmo com as mesmas mensagens — dispara
    // um novo envio de ingestão.
    ingestOk([{ message_key: 'manychat:native-1', synced: true, canonical_version: '1' }]),
  )

  const afterReturn = await runtime.captureNow()

  assert.equal(afterReturn.ok, true)
  assert.equal(runtime.getConversationState(conversationKey).resolution.cycle_id, 'cycle-A-de-verdade')
})
