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

// Hardening STEP 2A.4 — "LEDGER MESSAGE KEY IDENTITY-SCOPED": toda chave
// persistida agora é manychat:<contact-sha256>:<data-mid>, nunca a chave
// estrutural crua. DEFAULT_DIGEST é o mesmo hash usado por safeIdentityOk()
// (identidade padrão destes testes); OTHER_DIGEST representa um segundo
// contato (Y) para os cenários de troca de identidade.
const DEFAULT_DIGEST = 'a'.repeat(64)
const OTHER_DIGEST = 'b'.repeat(64)

function scopedKey(digest, rawMid) {
  return `manychat:${digest}:${rawMid}`
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
    safeIdentityOk(),
    safeIdentityOk(),
    ingestOk([{ message_key: scopedKey(DEFAULT_DIGEST, 'native-1'), synced: true, canonical_version: '1' }]),
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
  assert.equal(fake.calls[4].payload.messages[0].message_key, scopedKey(DEFAULT_DIGEST, 'native-1'))
})

test('captureNow resolve identidade, lead e envia o lote de captura', async () => {
  const dom = buildDom([
    { mid: 'native-1', text: 'Quero saber o preço.', classes: '_typeIn_x' },
  ])

  const fake = createQueuedSender([
    safeIdentityOk(),
    resolveLeadOwnedByMe(),
    safeIdentityOk(),
    safeIdentityOk(),
    ingestOk([{ message_key: scopedKey(DEFAULT_DIGEST, 'native-1'), synced: true, canonical_version: '1' }]),
  ])

  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage })
  const result = await runtime.captureNow()

  assert.equal(result.ok, true)
  assert.equal(result.skipped, false)
  assert.equal(fake.calls.length, 5)
  assert.equal(fake.calls[0].action, 'GET_MANYCHAT_SAFE_IDENTITY')
  assert.equal(fake.calls[1].action, 'RESOLVE_LEAD')
  assert.equal(fake.calls[1].payload.platform, 'manychat')
  assert.equal(
    fake.calls[1].payload.platform_contact_key,
    `manychat:contact:v1:sha256:${'a'.repeat(64)}`,
  )
  assert.equal(fake.calls[2].action, 'GET_MANYCHAT_SAFE_IDENTITY')
  // Auditoria STEP 2A.4, "PRE/POST-SNAPSHOT IDENTITY": entre a resolução do
  // cycle e a leitura do DOM (buildUniversalConversation), a identidade é
  // relida mais uma vez — nunca usa um cycle validado antes do snapshot sem
  // confirmar que ele ainda corresponde à identidade atual DEPOIS do
  // snapshot.
  assert.equal(fake.calls[3].action, 'GET_MANYCHAT_SAFE_IDENTITY')
  assert.equal(fake.calls[4].action, 'INGEST_CAPTURE_MESSAGES')
  assert.equal(fake.calls[4].payload.cycle_id, 'cycle-1')
  assert.equal(fake.calls[4].payload.messages[0].message_key, scopedKey(DEFAULT_DIGEST, 'native-1'))
  assert.equal(fake.calls[4].payload.messages[0].author_kind, 'customer')
  assert.equal(fake.calls[4].payload.messages[0].base_version, null)

  const state = runtime.getConversationState(fake.calls[4].payload.conversation_key)
  assert.equal(state.baseVersionsByMessageKey[scopedKey(DEFAULT_DIGEST, 'native-1')], '1')
})

test('segunda captura sem mudança nenhuma é no-op e reaproveita a resolução de ciclo em cache', async () => {
  const dom = buildDom([{ mid: 'native-1', text: 'Quero saber o preço.' }])

  const fake = createQueuedSender([
    safeIdentityOk(),
    resolveLeadOwnedByMe(),
    safeIdentityOk(),
    safeIdentityOk(),
    ingestOk([{ message_key: scopedKey(DEFAULT_DIGEST, 'native-1'), synced: true, canonical_version: '1' }]),
    // Hardening (auditoria STEP 2A.4, "CACHED RESOLUTION IDENTITY
    // SAFETY" + "TOCTOU SNAPSHOT BOUNDARY"): toda captureNow — mesmo com
    // state.resolution já em cache — relê a safe identity duas vezes: uma
    // para validar o cache (ensureCycleResolved) e outra depois do DOM já
    // ter sido lido (boundary do snapshot). Com a MESMA identidade,
    // RESOLVE_LEAD nunca roda de novo.
    safeIdentityOk(),
    safeIdentityOk(),
    safeIdentityOk(),
    safeIdentityOk(),
  ])

  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage })

  const first = await runtime.captureNow()
  assert.equal(first.skipped, false)

  const second = await runtime.captureNow()
  assert.equal(second.ok, true)
  assert.equal(second.skipped, true)
  assert.equal(second.reason, 'unchanged_snapshot')

  // A identidade é relida duas vezes (cache quente + boundary do
  // snapshot), mas nem RESOLVE_LEAD nem INGEST rodam de novo (mesma
  // identidade, mesmo snapshot).
  assert.equal(fake.calls.length, 7)
  assert.equal(fake.calls[5].action, 'GET_MANYCHAT_SAFE_IDENTITY')
  assert.equal(fake.calls[6].action, 'GET_MANYCHAT_SAFE_IDENTITY')

  // Uma terceira chamada precisa CONVERGIR (continuar no-op), não reenviar
  // para sempre só porque base_version mudou depois do primeiro envio
  // bem-sucedido — base_version é bookkeeping, não conteúdo novo.
  const third = await runtime.captureNow()
  assert.equal(third.skipped, true)
  assert.equal(fake.calls.length, 9)
})

test('contato não vinculado (CONTACT_NOT_LINKED) nunca chega a montar nem enviar captura', async () => {
  const dom = buildDom([{ mid: 'native-1', text: 'Quero saber o preço.' }])

  const fake = createQueuedSender([safeIdentityOk(), resolveLeadNotLinked(), safeIdentityOk()])

  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage })
  const result = await runtime.captureNow()

  assert.equal(result.ok, false)
  assert.equal(result.reason, 'CONTACT_NOT_LINKED')
  assert.equal(fake.calls.length, 3)
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

  const fake = createQueuedSender([
    safeIdentityOk(),
    resolveLeadOwnedByMe(),
    safeIdentityOk(),
    safeIdentityOk(),
  ])

  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage })
  const result = await runtime.captureNow()

  assert.equal(result.ok, true)
  assert.equal(result.skipped, true)
  assert.equal(result.reason, 'no_eligible_messages')
  assert.equal(fake.calls.length, 4)
})

test('troca de conversa durante a resolução assíncrona de identidade/lead nunca captura para a conversa errada', async () => {
  const dom = buildDom([{ mid: 'native-1', text: 'Quero saber o preço.' }])
  const fake = createQueuedSender([safeIdentityOk(), resolveLeadOwnedByMe(), safeIdentityOk()])

  let calls = 0
  const getConversationUrl = () => {
    calls += 1
    // A primeira leitura (início de captureNow) ainda vê a conversa A; a
    // resolução de identidade/lead é assíncrona, e quando ela termina o
    // usuário já trocou para B. A própria checagem interna de
    // resolveAndStoreResolution (isCurrentConversation) já intercepta a
    // troca antes de qualquer chamada de rede — mais forte que o check
    // antigo (que só rodava depois da resolução já ter ido à rede).
    return calls === 1 ? CONVERSATION_URL_A : CONVERSATION_URL_B
  }

  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage, getConversationUrl })
  const result = await runtime.captureNow()

  assert.equal(result.ok, false)
  assert.equal(result.reason, 'CONTACT_CHANGED')
  assert.equal(fake.calls.length, 0, 'aborta antes de qualquer chamada de rede')
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
    safeIdentityOk(),
    safeIdentityOk(),
    { ok: false, payload: { status: 'CAPTURE_INGESTION_REJECTED' } },
  ])

  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage })
  const result = await runtime.captureNow()

  assert.equal(result.ok, false)
  assert.equal(result.reason, 'ingestion_rejected')

  const conversationKey = fake.calls[4].payload.conversation_key
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
    safeIdentityOk(),
    safeIdentityOk(),
    ingestOk([{ message_key: scopedKey(DEFAULT_DIGEST, 'audio-1'), synced: true, canonical_version: '1' }]),
    // Hardening STEP 2A.4, "AUDIO PRE-DOM IDENTITY CHECK": revalida a
    // identidade antes de procurar o node/fonte de áudio no DOM.
    safeIdentityOk(),
    // Hardening STEP 2A.4 (residual P1): a leitura do DOM/source fica
    // BRACKETED por identidade — uma segunda checagem imediatamente
    // depois de localizar o node/fonte, antes de disparar a transcrição.
    safeIdentityOk(),
    transcribeOk('Quero saber o valor do plano.'),
    // Hardening STEP 2A.4, "AUDIO POST-TRANSCRIPTION IDENTITY CHECK":
    // revalida de novo depois do await de TRANSCRIBE_MANYCHAT_AUDIO.
    safeIdentityOk(),
    ingestOk([{ message_key: scopedKey(DEFAULT_DIGEST, 'audio-1'), synced: true, canonical_version: '2' }]),
  ])

  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage })
  const result = await runtime.captureNow()

  assert.equal(result.ok, true)
  assert.equal(fake.calls.length, 10)

  assert.equal(fake.calls[4].payload.messages[0].content_type, 'audio')
  assert.equal(fake.calls[4].payload.messages[0].audio_transcription, null)

  assert.equal(fake.calls[5].action, 'GET_MANYCHAT_SAFE_IDENTITY')
  assert.equal(fake.calls[6].action, 'GET_MANYCHAT_SAFE_IDENTITY')
  assert.equal(fake.calls[7].action, 'TRANSCRIBE_MANYCHAT_AUDIO')
  assert.equal(fake.calls[7].payload.audio_url, 'https://manybot-files.manychat.io/audio.ogg')
  assert.equal(fake.calls[7].payload.cycle_id, 'cycle-real-1')
  assert.equal(fake.calls[7].payload.audio_target_key, scopedKey(DEFAULT_DIGEST, 'audio-1'))

  assert.equal(fake.calls[8].action, 'GET_MANYCHAT_SAFE_IDENTITY')
  assert.equal(fake.calls[9].action, 'INGEST_CAPTURE_MESSAGES')
  const resent = fake.calls[9].payload.messages[0]
  assert.equal(resent.message_key, scopedKey(DEFAULT_DIGEST, 'audio-1'))
  assert.equal(resent.audio_transcription, 'Quero saber o valor do plano.')
  // Reenvia como NOVA VERSÃO da mesma mensagem (base_version = canonical
  // confirmado no envio anterior), nunca um registro paralelo.
  assert.equal(resent.base_version, '1')

  const state = runtime.getConversationState(fake.calls[4].payload.conversation_key)
  assert.equal(state.baseVersionsByMessageKey[scopedKey(DEFAULT_DIGEST, 'audio-1')], '2')
  assert.equal(state.transcribedMessageKeys.has(scopedKey(DEFAULT_DIGEST, 'audio-1')), true)
})

test('mensagem já transcrita nesta conversa nunca é reprocessada numa segunda captura', async () => {
  const dom = buildDom([
    { mid: 'audio-1', audioUrl: 'https://manybot-files.manychat.io/audio.ogg' },
  ])

  const fake = createQueuedSender([
    safeIdentityOk(),
    resolveLeadOwnedByMe(),
    safeIdentityOk(),
    safeIdentityOk(),
    ingestOk([{ message_key: scopedKey(DEFAULT_DIGEST, 'audio-1'), synced: true, canonical_version: '1' }]),
    // Pré-DOM, pós-DOM/pré-transcrição e pós-transcrição (STEP 2A.4).
    safeIdentityOk(),
    safeIdentityOk(),
    transcribeOk('Quero saber o valor do plano.'),
    safeIdentityOk(),
    ingestOk([{ message_key: scopedKey(DEFAULT_DIGEST, 'audio-1'), synced: true, canonical_version: '2' }]),
    // Segunda captureNow: cache quente revalida a identidade duas vezes
    // (cache + boundary do snapshot) antes de reaproveitar state.resolution.
    // A mensagem já está em transcribedMessageKeys — dispatchPendingAudio
    // Transcriptions nunca chega a rodar o pré-DOM check para ela.
    safeIdentityOk(),
    safeIdentityOk(),
  ])

  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage })
  await runtime.captureNow()
  assert.equal(fake.calls.length, 10)

  // O DOM continua mostrando a mesma mensagem de áudio sem transcrição
  // (a transcrição não altera o DOM — só o ledger no backend), mas o
  // dedupe local precisa impedir uma segunda tentativa de transcrição.
  await runtime.captureNow()
  assert.equal(fake.calls.length, 12)
})

test('fonte de áudio não confiável (sem HTTPS) nunca dispara transcrição nem quebra a captura de texto', async () => {
  const dom = buildDom([
    { mid: 'text-1', text: 'Olá, tudo bem?' },
    { mid: 'audio-1', audioUrl: 'http://sem-https.example.com/audio.ogg' },
  ])

  const fake = createQueuedSender([
    safeIdentityOk(),
    resolveLeadOwnedByMe(),
    safeIdentityOk(),
    safeIdentityOk(),
    ingestOk([
      { message_key: scopedKey(DEFAULT_DIGEST, 'text-1'), synced: true, canonical_version: '1' },
      { message_key: scopedKey(DEFAULT_DIGEST, 'audio-1'), synced: true, canonical_version: '1' },
    ]),
    safeIdentityOk(),
  ])

  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage })
  const result = await runtime.captureNow()

  assert.equal(result.ok, true)
  assert.equal(fake.calls.length, 6)
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
// Auditoria terse "invalidateLeadResolution: IMPLEMENTED": limpa só
// resolution — nunca baseVersionsByMessageKey, lastContentFingerprint ou
// transcribedMessageKeys — e nunca inventa estado para uma conversa que o
// runtime ainda não conhece.
// -----------------------------------------------------------------------

test('invalidateLeadResolution limpa só resolution, preserva base_version/fingerprint/transcrições e devolve false para conversa desconhecida', async () => {
  const dom = buildDom([{ mid: 'native-1', text: 'Quero saber o preço.' }])

  const fake = createQueuedSender([
    safeIdentityOk(),
    resolveLeadOwnedByMe('cycle-1'),
    safeIdentityOk(),
    safeIdentityOk(),
    ingestOk([{ message_key: scopedKey(DEFAULT_DIGEST, 'native-1'), synced: true, canonical_version: '1' }]),
  ])
  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage })

  assert.equal(runtime.invalidateLeadResolution('conversa-desconhecida'), false)

  await runtime.captureNow()
  const conversationKey = fake.calls[4].payload.conversation_key

  const stateBefore = runtime.getConversationState(conversationKey)
  assert.equal(stateBefore.resolution.cycle_id, 'cycle-1')
  assert.equal(stateBefore.baseVersionsByMessageKey[scopedKey(DEFAULT_DIGEST, 'native-1')], '1')

  assert.equal(runtime.invalidateLeadResolution(conversationKey), true)

  const stateAfter = runtime.getConversationState(conversationKey)
  assert.equal(stateAfter.resolution, null)
  // Nunca toca nos outros campos do estado da conversa.
  assert.equal(stateAfter.baseVersionsByMessageKey[scopedKey(DEFAULT_DIGEST, 'native-1')], '1')
})

// -----------------------------------------------------------------------
// Auditoria STEP 2A.4 — "CACHED RESOLUTION IDENTITY SAFETY": o P1 real
// encontrado na integration review. conversation_key sozinho NUNCA prova
// que uma resolution cacheada ainda pertence à identidade atual — o
// ManyChat pode reaproveitar a mesma thread/conversation_key para outro
// assinante sem nenhum conversation_changed. ensureCycleResolved precisa
// revalidar a safe identity a cada chamada e descartar (nunca reusar) um
// cycle cacheado que pertence a uma identidade diferente da atual.
// -----------------------------------------------------------------------

function identityWith(key) {
  return {
    ok: true,
    payload: {
      ready: true,
      safe: {
        platform: 'manychat',
        platform_identity: { source: 'subscriber_id', key },
      },
    },
  }
}

const IDENTITY_KEY_X = `manychat:contact:v1:sha256:${'a'.repeat(64)}`
const IDENTITY_KEY_Y = `manychat:contact:v1:sha256:${'b'.repeat(64)}`

test('P1: mesma conversation_key com identidade trocada entre capturas — cache de X é descartado, nunca usa cycle-X para o conteúdo de Y', async () => {
  const dom = buildDom([{ mid: 'native-1', text: 'Quero saber o preço.' }])

  const fake = createQueuedSender([
    // Primeira captura: identidade X do início ao fim (pré-resolve,
    // pós-resolve e pós-snapshot).
    identityWith(IDENTITY_KEY_X),
    resolveLeadOwnedByMe('cycle-X'),
    identityWith(IDENTITY_KEY_X),
    identityWith(IDENTITY_KEY_X),
    ingestOk([{ message_key: scopedKey(DEFAULT_DIGEST, 'native-1'), synced: true, canonical_version: '1' }]),
    // Segunda captura: ensureCycleResolved relê a identidade e encontra Y —
    // precisa descartar o cache de X e resolver Y do zero.
    identityWith(IDENTITY_KEY_Y),
    resolveLeadOwnedByMe('cycle-Y'),
    identityWith(IDENTITY_KEY_Y),
    identityWith(IDENTITY_KEY_Y),
    ingestOk([{ message_key: scopedKey(OTHER_DIGEST, 'native-1'), synced: true, canonical_version: '1' }]),
  ])

  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage })

  const first = await runtime.captureNow()
  assert.equal(first.ok, true)
  assert.equal(first.skipped, false)

  const conversationKey = runtime.getCurrentConversationKey()
  assert.equal(runtime.getConversationState(conversationKey).resolution.cycle_id, 'cycle-X')

  const callsBeforeSecond = fake.calls.length

  const second = await runtime.captureNow()

  const callsDuringSecond = fake.calls.slice(callsBeforeSecond)

  // RESOLVE_LEAD da segunda captura precisa ter sido chamado com a chave de
  // identidade de Y, nunca reaproveitando X.
  const secondResolveCall = callsDuringSecond.find((call) => call.action === 'RESOLVE_LEAD')
  assert.ok(secondResolveCall, 'RESOLVE_LEAD precisa rodar de novo para a identidade Y')
  assert.equal(secondResolveCall.payload.platform_contact_key, IDENTITY_KEY_Y)

  // O cache de X nunca é devolvido como resolução válida para a segunda
  // captura — o cycle_id em uso passa a ser o de Y.
  assert.equal(runtime.getConversationState(conversationKey).resolution.cycle_id, 'cycle-Y')

  // Gate crítico (cycle↔message correlation): se a segunda captura chegou a
  // ingerir mensagens, o payload TEM que carregar cycle-Y — nunca cycle-X.
  const secondIngestCall = callsDuringSecond.find((call) => call.action === 'INGEST_CAPTURE_MESSAGES')
  assert.ok(secondIngestCall, 'sanity: a segunda captura realmente ingeriu (cycle mudou -> fingerprint mudou)')
  assert.equal(secondIngestCall.payload.cycle_id, 'cycle-Y')
  assert.notEqual(secondIngestCall.payload.cycle_id, 'cycle-X')

  assert.equal(second.ok, true)
})

test('P1: identity_not_ready nunca fica preso em cache — identidade fica disponível depois e RESOLVE_LEAD roda normalmente', async () => {
  const dom = buildDom([{ mid: 'native-1', text: 'Quero saber o preço.' }])

  const fake = createQueuedSender([
    safeIdentityNotReady(),
    identityWith(IDENTITY_KEY_X),
    resolveLeadOwnedByMe('cycle-X'),
    identityWith(IDENTITY_KEY_X),
    identityWith(IDENTITY_KEY_X),
    ingestOk([{ message_key: scopedKey(DEFAULT_DIGEST, 'native-1'), synced: true, canonical_version: '1' }]),
  ])

  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage })

  const first = await runtime.captureNow()
  assert.equal(first.ok, false)
  assert.equal(first.reason, 'identity_not_ready')

  const conversationKey = runtime.getCurrentConversationKey()
  assert.equal(runtime.getConversationState(conversationKey).resolution.reason, 'identity_not_ready')

  // A identidade fica disponível na segunda tentativa — o cache de
  // identity_not_ready nunca trava a conversa permanentemente.
  const second = await runtime.captureNow()

  assert.equal(second.ok, true)
  assert.equal(second.skipped, false)
  assert.equal(
    fake.calls.some((call) => call.action === 'RESOLVE_LEAD'),
    true,
    'RESOLVE_LEAD precisa rodar assim que a identidade ficar pronta',
  )
  assert.equal(runtime.getConversationState(conversationKey).resolution.cycle_id, 'cycle-X')
})

test('P1: mesma identidade entre capturas — cache quente é reaproveitado (identidade relida, RESOLVE_LEAD/INGEST não repetem)', async () => {
  const dom = buildDom([{ mid: 'native-1', text: 'Quero saber o preço.' }])

  const fake = createQueuedSender([
    identityWith(IDENTITY_KEY_X),
    resolveLeadOwnedByMe('cycle-X'),
    identityWith(IDENTITY_KEY_X),
    identityWith(IDENTITY_KEY_X),
    ingestOk([{ message_key: scopedKey(DEFAULT_DIGEST, 'native-1'), synced: true, canonical_version: '1' }]),
    // Segunda captura: mesma identidade X — releitura de identidade para
    // validar o cache E releitura para o boundary do snapshot.
    identityWith(IDENTITY_KEY_X),
    identityWith(IDENTITY_KEY_X),
  ])

  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage })

  await runtime.captureNow()
  const conversationKey = runtime.getCurrentConversationKey()
  assert.equal(runtime.getConversationState(conversationKey).resolution.cycle_id, 'cycle-X')

  const callsBeforeSecond = fake.calls.length
  const second = await runtime.captureNow()
  const callsDuringSecond = fake.calls.slice(callsBeforeSecond)

  assert.equal(callsDuringSecond.length, 2)
  assert.equal(callsDuringSecond[0].action, 'GET_MANYCHAT_SAFE_IDENTITY')
  assert.equal(callsDuringSecond[1].action, 'GET_MANYCHAT_SAFE_IDENTITY')
  assert.equal(
    callsDuringSecond.some((call) => call.action === 'RESOLVE_LEAD'),
    false,
    'mesma identidade -> nunca chama RESOLVE_LEAD de novo',
  )
  assert.equal(
    callsDuringSecond.some((call) => call.action === 'INGEST_CAPTURE_MESSAGES'),
    false,
    'snapshot inalterado -> nunca ingere de novo',
  )

  assert.equal(second.ok, true)
  assert.equal(second.skipped, true)
  assert.equal(second.reason, 'unchanged_snapshot')
  assert.equal(runtime.getConversationState(conversationKey).resolution.cycle_id, 'cycle-X')
})

// -----------------------------------------------------------------------
// Auditoria STEP 2A.4 — "SNAPSHOT X→Y SAME conversation_key" / "TOCTOU
// SNAPSHOT BOUNDARY": mesmo com o cache de resolution já revalidado contra
// a identidade atual (ensureCycleResolved), a identidade pode mudar DEPOIS
// dessa validação e ANTES de buildUniversalConversation ler o DOM — o
// ManyChat pode trocar de contato bem nesse intervalo, sem
// conversation_changed algum. O snapshot só pode ser usado se a identidade
// relida DEPOIS do DOM materializado ainda bater com o binding que validou
// o cache antes dele.
// -----------------------------------------------------------------------

function replaceDomMessages(dom, messages) {
  const root = dom.window.document.querySelector(SELECTORS.conversationRoot)
  for (const child of Array.from(root.children)) {
    if (child.tagName === 'DIV') {
      root.removeChild(child)
    }
  }

  const wrapper = dom.window.document.createElement('div')
  wrapper.innerHTML = messages
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

  while (wrapper.firstElementChild) {
    root.appendChild(wrapper.firstElementChild)
  }
}

test('P1: identidade muda ENTRE a validação do cache e a leitura do DOM (mesma conversation_key) — snapshot de Y nunca é ingerido sob cycle-X', async () => {
  const dom = buildDom([{ mid: 'native-1', text: 'Mensagem de X.' }])

  let identityCallCount = 0
  const calls = []

  const sendMessage = async (message) => {
    calls.push(message)

    if (message.action === 'GET_MANYCHAT_SAFE_IDENTITY') {
      identityCallCount += 1

      // 1: ensureCycleResolved da 1ª captura (fria, estabelece cache X).
      // 2: pós-resolve da 1ª captura (dentro de resolveAndStoreResolution).
      // 3: pós-snapshot da 1ª captura (boundary novo) — completa normal.
      if (identityCallCount <= 3) {
        return identityWith(IDENTITY_KEY_X)
      }

      // 4: ensureCycleResolved da 2ª captura — a identidade AINDA é X aqui
      // (o cache de X é validado corretamente). É exatamente NESTE
      // instante — enquanto essa resposta está "retornando" — que o
      // ManyChat troca o contato exibido para Y, sem nenhum
      // conversation_changed.
      if (identityCallCount === 4) {
        replaceDomMessages(dom, [{ mid: 'native-y-1', text: 'Mensagem de Y.' }])
        return identityWith(IDENTITY_KEY_X)
      }

      // 5: pós-snapshot da 2ª captura — por essa altura a identidade real
      // já é Y (o DOM já foi lido nesse estado, no meio do caminho).
      return identityWith(IDENTITY_KEY_Y)
    }

    if (message.action === 'RESOLVE_LEAD') {
      return resolveLeadOwnedByMe('cycle-X')
    }

    if (message.action === 'INGEST_CAPTURE_MESSAGES') {
      return ingestOk(
        message.payload.messages.map((m) => ({
          message_key: m.message_key,
          synced: true,
          canonical_version: '1',
        })),
      )
    }

    throw new Error(`ação inesperada: ${message.action}`)
  }

  const runtime = createRuntime({ dom, sendMessage })

  const first = await runtime.captureNow()
  assert.equal(first.ok, true)
  assert.equal(first.skipped, false)

  const conversationKey = runtime.getCurrentConversationKey()
  assert.equal(runtime.getConversationState(conversationKey).resolution.cycle_id, 'cycle-X')

  const ingestCallsBeforeSecond = calls.filter((call) => call.action === 'INGEST_CAPTURE_MESSAGES').length

  const second = await runtime.captureNow()

  assert.equal(second.ok, false)
  assert.equal(second.reason, 'contact_changed_during_snapshot')

  // A segunda captura NUNCA ingere — nem o conteúdo de Y sob cycle-X, nem
  // qualquer outra coisa.
  const ingestCallsAfterSecond = calls.filter((call) => call.action === 'INGEST_CAPTURE_MESSAGES').length
  assert.equal(ingestCallsAfterSecond, ingestCallsBeforeSecond)
  assert.equal(
    calls.some((call) => call.action === 'INGEST_CAPTURE_MESSAGES' && call.payload.messages.some((m) => m.message_key === 'manychat:native-y-1')),
    false,
    'mensagem de Y nunca pode ser ingerida sob cycle-X',
  )

  // A própria resolution X (a mesma que esta captura leu) é limpa — nunca
  // fica presa em cache depois de detectar a divergência.
  assert.equal(runtime.getConversationState(conversationKey).resolution, null)
})

// -----------------------------------------------------------------------
// Auditoria STEP 2A.4 — "CONCURRENT STALE RESOLUTION" / "NEW VALID
// RESOLUTION CLEARED BY STALE CAPTURE": uma captura antiga que ainda
// segura uma resolution local (X) nunca pode, ao finalmente retomar depois
// de atrasada, nem enviar um batch com cycle-X, nem apagar uma resolution
// Y válida que uma captura mais nova já produziu enquanto ela estava
// pendente. A defesa é a checagem por IDENTIDADE DE OBJETO
// (state.resolution === resolution), nunca por valor.
// -----------------------------------------------------------------------

test('P1: captura antiga (X) atrasada nunca sobrescreve nem descarta uma resolution Y mais nova já em state.resolution', async () => {
  const dom = buildDom([{ mid: 'native-1', text: 'Quero saber o preço.' }])

  let resolvePostSnapshotForStaleCapture
  const staleCapturePostSnapshotPromise = new Promise((resolve) => {
    resolvePostSnapshotForStaleCapture = resolve
  })

  let identityCallCount = 0
  const calls = []

  const sendMessage = async (message) => {
    calls.push(message)

    if (message.action === 'GET_MANYCHAT_SAFE_IDENTITY') {
      identityCallCount += 1

      // 1-3: 1ª captura (fria), estabelece cache X normalmente.
      if (identityCallCount <= 3) {
        return identityWith(IDENTITY_KEY_X)
      }

      // 4: ensureCycleResolved da 2ª captura (STALE) — identidade ainda X,
      // cache válido, reaproveita a MESMA resolution X já em memória.
      if (identityCallCount === 4) {
        return identityWith(IDENTITY_KEY_X)
      }

      // 5: pós-snapshot da 2ª captura (STALE) — fica PENDENTE de propósito,
      // simulando a captura antiga atrasada enquanto uma captura mais nova
      // (Y) roda e conclui primeiro.
      if (identityCallCount === 5) {
        return staleCapturePostSnapshotPromise
      }

      // 6-8: 3ª captura (NOVA) — a identidade já mudou para Y; descarta o
      // cache X e resolve Y do zero, do início ao fim, sem interferência.
      return identityWith(IDENTITY_KEY_Y)
    }

    if (message.action === 'RESOLVE_LEAD') {
      const cycleId = message.payload.platform_contact_key === IDENTITY_KEY_Y ? 'cycle-Y' : 'cycle-X'
      return resolveLeadOwnedByMe(cycleId)
    }

    if (message.action === 'INGEST_CAPTURE_MESSAGES') {
      return ingestOk(
        message.payload.messages.map((m) => ({
          message_key: m.message_key,
          synced: true,
          canonical_version: '1',
        })),
      )
    }

    throw new Error(`ação inesperada: ${message.action}`)
  }

  const runtime = createRuntime({ dom, sendMessage })

  // 1ª captura: estabelece cache X normalmente.
  const first = await runtime.captureNow()
  assert.equal(first.ok, true)
  const conversationKey = runtime.getCurrentConversationKey()
  const resolutionXRef = runtime.getConversationState(conversationKey).resolution
  assert.equal(resolutionXRef.cycle_id, 'cycle-X')

  // 2ª captura (STALE): entra, valida o cache X (mesmo objeto), mas fica
  // presa no boundary pós-snapshot (identidade #5, ainda pendente).
  const staleCapturePromise = runtime.captureNow()

  for (let i = 0; i < 20 && identityCallCount < 5; i += 1) {
    await Promise.resolve()
  }
  assert.equal(identityCallCount, 5, 'sanity: a captura stale já está presa no boundary pós-snapshot')

  // 3ª captura (NOVA, Y): roda e conclui INTEIRAMENTE antes da 2ª captura
  // continuar — substitui state.resolution por uma resolution Y diferente
  // (objeto novo, nunca o mesmo da 1ª captura).
  const newCapture = await runtime.captureNow()
  assert.equal(newCapture.ok, true)
  const resolutionYRef = runtime.getConversationState(conversationKey).resolution
  assert.equal(resolutionYRef.cycle_id, 'cycle-Y')
  assert.notEqual(resolutionYRef, resolutionXRef)

  // Só agora a 2ª captura (stale) recebe sua resposta pendente.
  resolvePostSnapshotForStaleCapture(identityWith(IDENTITY_KEY_X))
  const stale = await staleCapturePromise

  assert.equal(stale.ok, false)
  assert.equal(stale.reason, 'contact_changed_during_snapshot')

  // A captura stale nunca envia um batch com cycle-X depois que Y já
  // assumiu (só o INGEST legítimo da 1ª captura usa cycle-X).
  const ingestCallsWithCycleX = calls.filter(
    (call) => call.action === 'INGEST_CAPTURE_MESSAGES' && call.payload.cycle_id === 'cycle-X',
  )
  assert.equal(ingestCallsWithCycleX.length, 1)

  // E a resolution Y válida, criada pela captura mais nova, nunca é limpa
  // pela captura antiga que só agora terminou de esperar.
  assert.equal(runtime.getConversationState(conversationKey).resolution, resolutionYRef)
  assert.equal(runtime.getConversationState(conversationKey).resolution.cycle_id, 'cycle-Y')
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
    safeIdentityOk(),
    safeIdentityOk(),
    ingestOk([{ message_key: scopedKey(DEFAULT_DIGEST, 'native-1'), synced: true, canonical_version: '1' }]),
  ]
  const fake = createQueuedSender(responses)

  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage })

  const first = await runtime.captureNow()
  assert.equal(first.ok, true)
  const conversationKey = fake.calls[4].payload.conversation_key

  const stateBefore = runtime.getConversationState(conversationKey)
  assert.equal(stateBefore.resolution.cycle_id, 'cycle-1')
  assert.equal(stateBefore.baseVersionsByMessageKey[scopedKey(DEFAULT_DIGEST, 'native-1')], '1')

  // Uma segunda captureNow, sem refresh, reaproveita o cycle cacheado
  // (mesma identidade — releitura de identidade para validar o cache E
  // para o boundary do snapshot, nenhum RESOLVE_LEAD/INGEST novo) — prova
  // que o próximo passo está de fato testando o refresh, não um efeito
  // colateral de outra captura.
  responses.push(safeIdentityOk(), safeIdentityOk())
  const second = await runtime.captureNow()
  assert.equal(second.skipped, true)
  assert.equal(fake.calls.length, 7)
  assert.equal(fake.calls[5].action, 'GET_MANYCHAT_SAFE_IDENTITY')
  assert.equal(fake.calls[6].action, 'GET_MANYCHAT_SAFE_IDENTITY')

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
    10,
    'refreshLeadResolution sempre chama identidade + resolve-lead + identidade de novo (revalidação pós-resolve), nunca usa cache',
  )
  assert.equal(fake.calls[7].action, 'GET_MANYCHAT_SAFE_IDENTITY')
  assert.equal(fake.calls[8].action, 'RESOLVE_LEAD')
  assert.equal(fake.calls[9].action, 'GET_MANYCHAT_SAFE_IDENTITY')

  const stateAfter = runtime.getConversationState(conversationKey)
  assert.equal(stateAfter.resolution.ready, true)
  assert.equal(stateAfter.resolution.cycle_id, 'cycle-after-link')
  // Nunca limpa os outros campos do estado da conversa — só resolution.
  assert.equal(stateAfter.baseVersionsByMessageKey[scopedKey(DEFAULT_DIGEST, 'native-1')], '1')
})

test('refreshLeadResolution reflete um contato que deixou de ser capture-eligible (ex.: transferido para outro vendedor)', async () => {
  const dom = buildDom([{ mid: 'native-1', text: 'Quero saber o preço.' }])

  const responses = [
    safeIdentityOk(),
    resolveLeadOwnedByMe('cycle-1'),
    safeIdentityOk(),
    safeIdentityOk(),
    ingestOk([{ message_key: scopedKey(DEFAULT_DIGEST, 'native-1'), synced: true, canonical_version: '1' }]),
  ]
  const fake = createQueuedSender(responses)
  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage })

  await runtime.captureNow()
  const conversationKey = fake.calls[4].payload.conversation_key

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
    safeIdentityOk(),
    safeIdentityOk(),
    ingestOk([{ message_key: scopedKey(DEFAULT_DIGEST, 'native-1'), synced: true, canonical_version: '1' }]),
  ]
  const fake = createQueuedSender(responses)

  let currentUrl = CONVERSATION_URL_A
  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage, getConversationUrl: () => currentUrl })

  await runtime.captureNow()
  const conversationKeyA = fake.calls[4].payload.conversation_key

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
    safeIdentityOk(),
    safeIdentityOk(),
    ingestOk([{ message_key: scopedKey(DEFAULT_DIGEST, 'native-1'), synced: true, canonical_version: '1' }]),
  ]
  const fake = createQueuedSender(responses)
  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage })

  await runtime.captureNow()
  const conversationKey = fake.calls[4].payload.conversation_key

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
    safeIdentityOk(),
    safeIdentityOk(),
    ingestOk([{ message_key: scopedKey(DEFAULT_DIGEST, 'native-1'), synced: true, canonical_version: '1' }]),
  ]
  const fake = createQueuedSender(responses)
  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage })

  await runtime.captureNow()
  const conversationKey = fake.calls[4].payload.conversation_key

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
  assert.equal(fake.calls.length, 8)
  assert.equal(fake.calls[5].action, 'GET_MANYCHAT_SAFE_IDENTITY')
  assert.equal(fake.calls[6].action, 'RESOLVE_LEAD')
  assert.equal(fake.calls[7].action, 'GET_MANYCHAT_SAFE_IDENTITY')
})

// -----------------------------------------------------------------------
// Auditoria terse "INITIAL SAME-CONVERSATION IDENTITY SWAP" /
// "WRONG-CYCLE INGEST AFTER IDENTITY SWAP": a resolução INICIAL (primeira
// vez que uma conversa é vista, via resolveAndStoreResolution/
// ensureCycleResolved) precisa da MESMA dupla checagem de identidade já
// aplicada em refreshLeadResolution — nunca só depois de resolveLeadForIdentity
// resolver, mas TAMBÉM antes de persistir. Sem isso, um contato trocado
// dentro da MESMA conversation_key enquanto RESOLVE_LEAD ainda está em voo
// faria o cycle do contato ANTIGO ser persistido e potencialmente usado por
// captureNow para ingerir o conteúdo do contato NOVO sob o cycle errado.
// -----------------------------------------------------------------------

test('INITIAL: resolução inicial (captureNow) nunca persiste nem ingere quando a identidade muda ENTRE o resolve-lead e a persistência (mesma conversation_key)', async () => {
  const dom = buildDom([{ mid: 'native-1', text: 'Quero saber o preço.' }])

  const identityA = safeIdentityOk()
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

  let currentIdentity = identityA
  let resolveLeadPromiseResolve = null
  let resolveLeadFixedResponse = null
  const calls = []
  const sendMessage = async (message) => {
    calls.push(message)
    if (message.action === 'GET_MANYCHAT_SAFE_IDENTITY') {
      return currentIdentity
    }
    if (message.action === 'RESOLVE_LEAD') {
      if (resolveLeadFixedResponse) {
        return resolveLeadFixedResponse
      }
      return new Promise((resolve) => {
        resolveLeadPromiseResolve = resolve
      })
    }
    if (message.action === 'INGEST_CAPTURE_MESSAGES') {
      return ingestOk([{ message_key: scopedKey(DEFAULT_DIGEST, 'native-1'), synced: true, canonical_version: '1' }])
    }
    throw new Error(`ação inesperada: ${message.action}`)
  }

  const runtime = createRuntime({ dom, sendMessage })

  const capturePromise = runtime.captureNow()

  // Deixa a 1ª identidade (A) e o disparo do RESOLVE_LEAD(A) acontecerem
  // antes de trocar a identidade "atual" para B.
  for (let i = 0; i < 10 && !calls.some((call) => call.action === 'RESOLVE_LEAD'); i += 1) {
    await Promise.resolve()
  }
  assert.ok(calls.some((call) => call.action === 'RESOLVE_LEAD'), 'sanity: RESOLVE_LEAD(A) já foi disparado')

  // O contato muda DENTRO da mesma conversation_key enquanto RESOLVE_LEAD
  // ainda está em voo no servidor.
  currentIdentity = identityB

  // Só agora o servidor responde ao RESOLVE_LEAD(A) que estava pendente.
  resolveLeadPromiseResolve(resolveLeadOwnedByMe('cycle-A'))

  const result = await capturePromise

  assert.equal(result.ok, false)
  assert.equal(result.reason, 'CONTACT_CHANGED')
  assert.equal(
    calls.some((call) => call.action === 'INGEST_CAPTURE_MESSAGES'),
    false,
    'cycle-A nunca deveria ser usado para ingerir o conteúdo do contato B',
  )

  const conversationKey = runtime.getCurrentConversationKey()
  assert.equal(runtime.getConversationState(conversationKey).resolution, null)

  // Vendedor (ou o próprio ManyChat) volta a mostrar a identidade A — a
  // MESMA instância de runtime/estado precisa resolver de novo do zero
  // (nunca reaproveitar o cycle-A abortado como cache válido).
  currentIdentity = identityA
  resolveLeadFixedResponse = resolveLeadOwnedByMe('cycle-A-de-verdade')

  const afterReturn = await runtime.captureNow()

  assert.equal(afterReturn.ok, true)
  assert.equal(
    runtime.getConversationState(conversationKey).resolution.cycle_id,
    'cycle-A-de-verdade',
  )
  assert.ok(calls.some((call) => call.action === 'INGEST_CAPTURE_MESSAGES'))
})

test('F: depois de um refresh abortado por CONTACT_CHANGED, voltar para a conversa original faz RESOLVE_LEAD de novo (nunca serve cache velho)', async () => {
  const dom = buildDom([{ mid: 'native-1', text: 'Quero saber o preço.' }])

  const responses = [
    safeIdentityOk(),
    resolveLeadOwnedByMe('cycle-A'),
    safeIdentityOk(),
    safeIdentityOk(),
    ingestOk([{ message_key: scopedKey(DEFAULT_DIGEST, 'native-1'), synced: true, canonical_version: '1' }]),
  ]
  const fake = createQueuedSender(responses)

  let currentUrl = CONVERSATION_URL_A
  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage, getConversationUrl: () => currentUrl })

  await runtime.captureNow()
  const conversationKey = fake.calls[4].payload.conversation_key

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
    safeIdentityOk(),
    safeIdentityOk(),
    // O cycle_id mudou (cycle-A -> cycle-A-de-verdade), então o
    // fingerprint de conteúdo muda mesmo com as mesmas mensagens — dispara
    // um novo envio de ingestão.
    ingestOk([{ message_key: scopedKey(DEFAULT_DIGEST, 'native-1'), synced: true, canonical_version: '1' }]),
  )

  const afterReturn = await runtime.captureNow()

  assert.equal(afterReturn.ok, true)
  assert.equal(runtime.getConversationState(conversationKey).resolution.cycle_id, 'cycle-A-de-verdade')
})

// -----------------------------------------------------------------------
// Auditoria STEP 2A.4, "AUXILIARY CAPTURE STATE ISOLATION" — mandato de
// implementação: identity-scope de toda chave de mensagem do ledger
// (manychat:<contact-sha256>:<data-mid>), nunca conversation_key +
// data-mid sozinhos. data-mid só foi validado como único DENTRO de uma
// única conversa observada — nunca entre contatos diferentes que passam
// pela MESMA conversation_key ao longo do tempo.
// -----------------------------------------------------------------------

test('TESTE MAIS IMPORTANTE: mesmo data-mid bruto sob identidades diferentes (mesma conversation_key, mesmo texto, mesmo timestamp) produz message_keys diferentes — Y nunca reaproveita base_version/canonical_version de X', async () => {
  const sharedMid = 'shared-mid'
  const sharedText = 'Mesmo texto'
  const sharedTimestamp = '2026-09-14T20:30:00'

  const dom = buildDom([{ mid: sharedMid, text: sharedText, title: sharedTimestamp }])

  const responses = [
    // Primeira captura: identidade X.
    identityWith(IDENTITY_KEY_X),
    resolveLeadOwnedByMe('cycle-X'),
    identityWith(IDENTITY_KEY_X),
    identityWith(IDENTITY_KEY_X),
    ingestOk([{ message_key: scopedKey(DEFAULT_DIGEST, sharedMid), synced: true, canonical_version: '7' }]),
  ]
  const fake = createQueuedSender(responses)

  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage })

  const first = await runtime.captureNow()
  assert.equal(first.ok, true)
  assert.equal(first.skipped, false)

  const firstIngest = fake.calls.find((call) => call.action === 'INGEST_CAPTURE_MESSAGES')
  const firstMessageKey = firstIngest.payload.messages[0].message_key
  assert.equal(firstMessageKey, scopedKey(DEFAULT_DIGEST, sharedMid))
  assert.equal(firstIngest.payload.messages[0].base_version, null)

  // Segunda captura: identidade muda para Y — MESMO conversation_key,
  // MESMO data-mid bruto, MESMO texto, MESMO timestamp. Só a identidade
  // muda.
  responses.push(
    identityWith(IDENTITY_KEY_Y),
    resolveLeadOwnedByMe('cycle-Y'),
    identityWith(IDENTITY_KEY_Y),
    identityWith(IDENTITY_KEY_Y),
    ingestOk([{ message_key: scopedKey(OTHER_DIGEST, sharedMid), synced: true, canonical_version: '1' }]),
  )

  const callsBeforeSecond = fake.calls.length
  const second = await runtime.captureNow()
  assert.equal(second.ok, true)
  assert.equal(second.skipped, false)

  const secondIngest = fake.calls
    .slice(callsBeforeSecond)
    .find((call) => call.action === 'INGEST_CAPTURE_MESSAGES')
  assert.ok(
    secondIngest,
    'sanity: a segunda captura (Y) precisa realmente ingerir, apesar de mesmo data-mid/texto/timestamp',
  )
  const secondMessageKey = secondIngest.payload.messages[0].message_key

  // GATE CENTRAL: mesmo data-mid bruto — mas o message_key final PRECISA
  // ser diferente entre X e Y, nunca colidindo na chave única do ledger
  // (company_id, conversation_key, message_key, version).
  assert.notEqual(secondMessageKey, firstMessageKey)
  assert.equal(secondMessageKey, scopedKey(OTHER_DIGEST, sharedMid))

  // Y nunca reaproveita nenhum version/canonical_version de X — o primeiro
  // envio de Y sob a chave nova é sempre base_version: null.
  assert.equal(secondIngest.payload.messages[0].base_version, null)
  assert.notEqual(secondIngest.payload.messages[0].base_version, '7')
})

test('X/Y IDENTICAL MESSAGE ALIAS: mesmo texto e mesmo timestamp sob identidades diferentes (data-mid diferente) nunca colidem nem compartilham base_version', async () => {
  const sharedText = 'Mesmo texto'
  const sharedTimestamp = '2026-09-14T20:30:00'

  const dom = buildDom([{ mid: 'native-x', text: sharedText, title: sharedTimestamp }])

  const responses = [
    identityWith(IDENTITY_KEY_X),
    resolveLeadOwnedByMe('cycle-X'),
    identityWith(IDENTITY_KEY_X),
    identityWith(IDENTITY_KEY_X),
    ingestOk([{ message_key: scopedKey(DEFAULT_DIGEST, 'native-x'), synced: true, canonical_version: '4' }]),
  ]
  const fake = createQueuedSender(responses)
  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage })

  const first = await runtime.captureNow()
  assert.equal(first.ok, true)

  // Y aparece com uma mensagem de conteúdo e timestamp IDÊNTICOS (mesmo
  // texto, mesmo instante) mas com seu próprio data-mid — dois contatos
  // digitando a mesma frase padrão no mesmo horário.
  replaceDomMessages(dom, [{ mid: 'native-y', text: sharedText, title: sharedTimestamp }])
  responses.push(
    identityWith(IDENTITY_KEY_Y),
    resolveLeadOwnedByMe('cycle-Y'),
    identityWith(IDENTITY_KEY_Y),
    identityWith(IDENTITY_KEY_Y),
    ingestOk([{ message_key: scopedKey(OTHER_DIGEST, 'native-y'), synced: true, canonical_version: '1' }]),
  )

  const second = await runtime.captureNow()
  assert.equal(second.ok, true)
  assert.equal(second.skipped, false)

  const secondIngest = fake.calls
    .slice()
    .reverse()
    .find((call) => call.action === 'INGEST_CAPTURE_MESSAGES')

  const yMessage = secondIngest.payload.messages[0]
  assert.equal(yMessage.message_key, scopedKey(OTHER_DIGEST, 'native-y'))
  assert.notEqual(yMessage.message_key, scopedKey(DEFAULT_DIGEST, 'native-x'))
  // Mesmo com texto e timestamp idênticos aos de X, Y nunca reaproveita o
  // base_version de X — nunca é tratado como a mesma mensagem.
  assert.equal(yMessage.base_version, null)
})

test('AUXILIARY IDENTITY BINDING: troca de identidade (mesma conversation_key) reseta baseVersionsByMessageKey, lastContentFingerprint e transcribedMessageKeys de X antes de qualquer leitura/gravação para Y', async () => {
  const dom = buildDom([{ mid: 'native-x', text: 'Mensagem de X.' }])

  const responses = [
    identityWith(IDENTITY_KEY_X),
    resolveLeadOwnedByMe('cycle-X'),
    identityWith(IDENTITY_KEY_X),
    identityWith(IDENTITY_KEY_X),
    ingestOk([{ message_key: scopedKey(DEFAULT_DIGEST, 'native-x'), synced: true, canonical_version: '3' }]),
  ]
  const fake = createQueuedSender(responses)

  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage })
  const first = await runtime.captureNow()
  assert.equal(first.ok, true)

  const conversationKey = runtime.getCurrentConversationKey()
  const stateAfterFirst = runtime.getConversationState(conversationKey)
  assert.equal(stateAfterFirst.baseVersionsByMessageKey[scopedKey(DEFAULT_DIGEST, 'native-x')], '3')
  assert.equal(stateAfterFirst.auxiliaryIdentity.key, IDENTITY_KEY_X)
  assert.notEqual(stateAfterFirst.lastContentFingerprint, null)

  // Troca de contato: mesma conversation_key, identidade Y, mensagem
  // diferente (native-y) — nunca a mesma chave estrutural de X.
  replaceDomMessages(dom, [{ mid: 'native-y', text: 'Mensagem de Y.' }])
  responses.push(
    identityWith(IDENTITY_KEY_Y),
    resolveLeadOwnedByMe('cycle-Y'),
    identityWith(IDENTITY_KEY_Y),
    identityWith(IDENTITY_KEY_Y),
    ingestOk([{ message_key: scopedKey(OTHER_DIGEST, 'native-y'), synced: true, canonical_version: '1' }]),
  )

  const second = await runtime.captureNow()
  assert.equal(second.ok, true)
  assert.equal(second.skipped, false)

  const stateAfterSecond = runtime.getConversationState(conversationKey)
  assert.equal(stateAfterSecond.auxiliaryIdentity.key, IDENTITY_KEY_Y)

  // O bookkeeping de X nunca sobrevive para dentro do estado auxiliar de Y.
  assert.equal(stateAfterSecond.baseVersionsByMessageKey[scopedKey(DEFAULT_DIGEST, 'native-x')], undefined)
  assert.equal(stateAfterSecond.transcribedMessageKeys.has(scopedKey(DEFAULT_DIGEST, 'native-x')), false)

  // A própria gravação de Y (depois do reset) está presente normalmente.
  assert.equal(stateAfterSecond.baseVersionsByMessageKey[scopedKey(OTHER_DIGEST, 'native-y')], '1')
})

test('SAME-IDENTITY CACHE: duas capturas seguidas com a MESMA identidade preservam baseVersionsByMessageKey (ensureAuxiliaryStateBound nunca reseta quando a identidade não muda)', async () => {
  const dom = buildDom([{ mid: 'native-1', text: 'Quero saber o preço.' }])

  const responses = [
    identityWith(IDENTITY_KEY_X),
    resolveLeadOwnedByMe('cycle-X'),
    identityWith(IDENTITY_KEY_X),
    identityWith(IDENTITY_KEY_X),
    ingestOk([{ message_key: scopedKey(DEFAULT_DIGEST, 'native-1'), synced: true, canonical_version: '5' }]),
  ]
  const fake = createQueuedSender(responses)

  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage })
  const first = await runtime.captureNow()
  assert.equal(first.ok, true)

  const conversationKey = runtime.getCurrentConversationKey()
  const auxiliaryIdentityAfterFirst = runtime.getConversationState(conversationKey).auxiliaryIdentity

  // Mesma identidade, mas o conteúdo mudou (mensagem nova adicionada) — a
  // segunda captura precisa ingerir de novo, e o base_version de native-1
  // tem que continuar vindo do cache (nunca resetado, já que a identidade
  // não mudou).
  replaceDomMessages(dom, [
    { mid: 'native-1', text: 'Quero saber o preço.' },
    { mid: 'native-2', text: 'Ainda está disponível?' },
  ])
  responses.push(
    identityWith(IDENTITY_KEY_X),
    identityWith(IDENTITY_KEY_X),
    ingestOk([
      { message_key: scopedKey(DEFAULT_DIGEST, 'native-1'), synced: true, canonical_version: '5' },
      { message_key: scopedKey(DEFAULT_DIGEST, 'native-2'), synced: true, canonical_version: '1' },
    ]),
  )

  const second = await runtime.captureNow()
  assert.equal(second.ok, true)
  assert.equal(second.skipped, false)

  const secondIngest = fake.calls
    .slice()
    .reverse()
    .find((call) => call.action === 'INGEST_CAPTURE_MESSAGES')

  const nativeOneMessage = secondIngest.payload.messages.find(
    (m) => m.message_key === scopedKey(DEFAULT_DIGEST, 'native-1'),
  )
  assert.equal(nativeOneMessage.base_version, '5')

  const stateAfterSecond = runtime.getConversationState(conversationKey)
  // Mesma identidade -> ensureAuxiliaryStateBound retorna cedo (mesmo
  // objeto de binding), nunca reseta o estado auxiliar.
  assert.equal(stateAfterSecond.auxiliaryIdentity, auxiliaryIdentityAfterFirst)
})

// -----------------------------------------------------------------------
// Auditoria STEP 2A.4, "AUDIO PRE-DOM IDENTITY CHECK" / "AUDIO
// POST-TRANSCRIPTION IDENTITY CHECK" / "STALE INGEST CALLBACK" — as duas
// janelas de corrida do fluxo de áudio e o callback assíncrono tardio do
// INGEST de texto nunca podem gravar bookkeeping ou disparar transcrição
// sob uma identidade que já não é mais a atual.
// -----------------------------------------------------------------------

test('ÁUDIO: identidade muda para Y ENTRE o snapshot validado e a busca do node/fonte de áudio (mesma conversation_key, mesmo data-mid) — TRANSCRIBE_MANYCHAT_AUDIO sob cycle-X é ZERO', async () => {
  const dom = buildDom([{ mid: 'audio-1', audioUrl: 'https://manybot-files.manychat.io/audio.ogg' }])

  const calls = []
  let identityCallCount = 0

  const sendMessage = async (message) => {
    calls.push(message)

    if (message.action === 'GET_MANYCHAT_SAFE_IDENTITY') {
      identityCallCount += 1
      // 1: ensureCycleResolved. 2: pós-resolve. 3: pós-snapshot (captureNow).
      if (identityCallCount <= 3) {
        return identityWith(IDENTITY_KEY_X)
      }
      // 4: AUDIO PRE-DOM IDENTITY CHECK — a identidade já mudou para Y
      // exatamente aqui, ANTES de qualquer busca de node/fonte no DOM.
      return identityWith(IDENTITY_KEY_Y)
    }

    if (message.action === 'RESOLVE_LEAD') {
      return resolveLeadOwnedByMe('cycle-X')
    }

    if (message.action === 'INGEST_CAPTURE_MESSAGES') {
      return ingestOk(
        message.payload.messages.map((m) => ({
          message_key: m.message_key,
          synced: true,
          canonical_version: '1',
        })),
      )
    }

    throw new Error(`ação inesperada: ${message.action}`)
  }

  const runtime = createRuntime({ dom, sendMessage })
  const result = await runtime.captureNow()

  // A captura de texto continua funcionando normalmente — áudio nunca
  // bloqueia nem quebra o texto — mas nenhuma transcrição pode ser
  // disparada sob a identidade antiga (X).
  assert.equal(result.ok, true)
  assert.equal(calls.filter((call) => call.action === 'TRANSCRIBE_MANYCHAT_AUDIO').length, 0)
  assert.equal(
    calls.some((call) => call.action === 'TRANSCRIBE_MANYCHAT_AUDIO' && call.payload?.cycle_id === 'cycle-X'),
    false,
  )
})

// -----------------------------------------------------------------------
// Auditoria STEP 2A.4 (residual P1) — "SAFE IDENTITY PODE FICAR STALE
// DURANTE O AWAIT": o teste acima já cobre a identidade mudando ANTES do
// GET pré-DOM devolver a resposta. Mas isso não basta: a PRÓPRIA resposta
// de identidade pode ser X (correta no instante em que a promise foi
// criada) e o DOM já ter mudado para Y no instante em que o content
// script retoma a execução — sem nenhuma nova leitura de identidade de
// permeio, findNodeForMessageKey consultaria o DOM de Y como se ainda
// fosse X (mesmo data-mid bruto). Só o gate pós-DOM/pré-transcrição
// (novo, seção 5 do mandato) fecha essa janela.
// -----------------------------------------------------------------------

test('ÁUDIO: DOM já pertence a Y quando o content script retoma da resposta de identidade pré-DOM (resposta ainda diz X, mesmo data-mid) — gate pós-DOM/pré-transcrição bloqueia TRANSCRIBE_MANYCHAT_AUDIO sob cycle-X', async () => {
  const sharedAudioMid = 'shared-audio'
  const dom = buildDom([
    { mid: sharedAudioMid, audioUrl: 'https://manybot-files.manychat.io/x-audio.ogg' },
  ])

  const calls = []
  let identityCallCount = 0

  const sendMessage = async (message) => {
    calls.push(message)

    if (message.action === 'GET_MANYCHAT_SAFE_IDENTITY') {
      identityCallCount += 1

      // 1-3: fluxo normal da 1ª captura (X) até o pós-snapshot.
      if (identityCallCount <= 3) {
        return identityWith(IDENTITY_KEY_X)
      }

      // 4: AUDIO PRE-DOM IDENTITY CHECK. A RESPOSTA em si ainda é X (ela
      // já estava "em voo" quando a amostra foi tirada) — mas é
      // exatamente enquanto essa promise está retornando que o ManyChat
      // troca o contato exibido para Y, MESMA conversation_key, e Y
      // também tem uma mensagem de áudio com o MESMO data-mid bruto. Sem
      // o gate pós-DOM, o helper aprovaria essa checagem (identidade
      // ainda bate) e o node de Y seria lido como se fosse de X.
      if (identityCallCount === 4) {
        replaceDomMessages(dom, [
          { mid: sharedAudioMid, audioUrl: 'https://manybot-files.manychat.io/y-audio.ogg' },
        ])
        return identityWith(IDENTITY_KEY_X)
      }

      // 5: AUDIO POST-DOM/PRE-TRANSCRIBE IDENTITY CHECK (gate novo desta
      // rodada) — por esta altura o DOM já foi consultado no estado de Y;
      // uma releitura fresca da identidade já reflete a troca real.
      return identityWith(IDENTITY_KEY_Y)
    }

    if (message.action === 'RESOLVE_LEAD') {
      return resolveLeadOwnedByMe('cycle-X')
    }

    if (message.action === 'INGEST_CAPTURE_MESSAGES') {
      return ingestOk(
        message.payload.messages.map((m) => ({
          message_key: m.message_key,
          synced: true,
          canonical_version: '1',
        })),
      )
    }

    throw new Error(`ação inesperada: ${message.action}`)
  }

  const runtime = createRuntime({ dom, sendMessage })
  const result = await runtime.captureNow()

  assert.equal(result.ok, true)

  // Sem o gate pós-DOM/pré-transcrição, o node de Y (mesmo data-mid bruto)
  // seria tratado como se fosse de X e sua fonte de áudio REAL seria
  // enviada para transcrição sob cycle-X.
  assert.equal(calls.filter((call) => call.action === 'TRANSCRIBE_MANYCHAT_AUDIO').length, 0)
  assert.equal(
    calls.some((call) => call.action === 'TRANSCRIBE_MANYCHAT_AUDIO' && call.payload?.cycle_id === 'cycle-X'),
    false,
  )
})

test('ÁUDIO: TRANSCRIBE_MANYCHAT_AUDIO em voo quando a identidade muda para Y — resposta tardia nunca gera INGEST sob cycle-X nem mexe no bookkeeping', async () => {
  const dom = buildDom([{ mid: 'audio-1', audioUrl: 'https://manybot-files.manychat.io/audio.ogg' }])

  const calls = []
  let identityCallCount = 0
  let resolveTranscription
  const transcriptionPromise = new Promise((resolve) => {
    resolveTranscription = resolve
  })

  const sendMessage = async (message) => {
    calls.push(message)

    if (message.action === 'GET_MANYCHAT_SAFE_IDENTITY') {
      identityCallCount += 1
      // 1-5: fluxo normal até o pós-DOM/pré-transcrição (identidade ainda
      // X): ensureCycleResolved, pós-resolve, pós-snapshot, pré-DOM,
      // pós-DOM/pré-transcrição.
      if (identityCallCount <= 5) {
        return identityWith(IDENTITY_KEY_X)
      }
      // 6: AUDIO POST-TRANSCRIPTION IDENTITY CHECK — a identidade já é Y
      // aqui, depois do await de TRANSCRIBE_MANYCHAT_AUDIO ter resolvido.
      return identityWith(IDENTITY_KEY_Y)
    }

    if (message.action === 'RESOLVE_LEAD') {
      return resolveLeadOwnedByMe('cycle-X')
    }

    if (message.action === 'TRANSCRIBE_MANYCHAT_AUDIO') {
      return transcriptionPromise
    }

    if (message.action === 'INGEST_CAPTURE_MESSAGES') {
      return ingestOk(
        message.payload.messages.map((m) => ({
          message_key: m.message_key,
          synced: true,
          canonical_version: '1',
        })),
      )
    }

    throw new Error(`ação inesperada: ${message.action}`)
  }

  const runtime = createRuntime({ dom, sendMessage })
  const capturePromise = runtime.captureNow()

  for (let i = 0; i < 20 && !calls.some((call) => call.action === 'TRANSCRIBE_MANYCHAT_AUDIO'); i += 1) {
    await Promise.resolve()
  }
  assert.ok(
    calls.some((call) => call.action === 'TRANSCRIBE_MANYCHAT_AUDIO'),
    'sanity: a transcrição já está em voo',
  )

  const ingestCallsBeforeResolve = calls.filter((call) => call.action === 'INGEST_CAPTURE_MESSAGES').length

  resolveTranscription(transcribeOk('Texto transcrito depois que Y assumiu.'))
  const result = await capturePromise
  assert.equal(result.ok, true)

  const ingestCallsAfterResolve = calls.filter((call) => call.action === 'INGEST_CAPTURE_MESSAGES').length
  // A única ingestão que existe é a do texto original (áudio ainda sem
  // transcrição) — a resposta tardia de TRANSCRIBE_MANYCHAT_AUDIO nunca
  // gera uma segunda ingestão sob cycle-X.
  assert.equal(ingestCallsAfterResolve, ingestCallsBeforeResolve)

  const conversationKey = runtime.getCurrentConversationKey()
  const state = runtime.getConversationState(conversationKey)
  // O bookkeeping nunca é mutado por essa resposta tardia — a mensagem de
  // áudio nunca é marcada como transcrita.
  assert.equal(state.transcribedMessageKeys.has(scopedKey(DEFAULT_DIGEST, 'audio-1')), false)
})

test('CALLBACK STALE DE INGEST: resposta de INGEST_CAPTURE_MESSAGES de X, em voo quando Y assume state.resolution/resolutionIdentity/auxiliaryIdentity, nunca grava bookkeeping na conta de Y', async () => {
  const dom = buildDom([{ mid: 'native-x', text: 'Mensagem de X.' }])

  const calls = []
  let identityCallCount = 0
  let resolveStaleIngest
  const staleIngestPromise = new Promise((resolve) => {
    resolveStaleIngest = resolve
  })

  const sendMessage = async (message) => {
    calls.push(message)

    if (message.action === 'GET_MANYCHAT_SAFE_IDENTITY') {
      identityCallCount += 1
      // 1-3: 1ª captura (X) — ensureCycleResolved, pós-resolve, pós-snapshot.
      if (identityCallCount <= 3) {
        return identityWith(IDENTITY_KEY_X)
      }
      // 4+: 2ª captura (Y) roda inteira enquanto o INGEST de X ainda está
      // pendente (ver abaixo).
      return identityWith(IDENTITY_KEY_Y)
    }

    if (message.action === 'RESOLVE_LEAD') {
      const cycleId = message.payload.platform_contact_key === IDENTITY_KEY_Y ? 'cycle-Y' : 'cycle-X'
      return resolveLeadOwnedByMe(cycleId)
    }

    if (message.action === 'INGEST_CAPTURE_MESSAGES') {
      // A PRIMEIRA chamada de INGEST (a de X) fica pendente de propósito.
      if (message.payload.cycle_id === 'cycle-X') {
        return staleIngestPromise
      }

      return ingestOk(
        message.payload.messages.map((m) => ({
          message_key: m.message_key,
          synced: true,
          canonical_version: '9',
        })),
      )
    }

    throw new Error(`ação inesperada: ${message.action}`)
  }

  const runtime = createRuntime({ dom, sendMessage })

  // 1ª captura (X): fica presa esperando a resposta do INGEST.
  const stalePromise = runtime.captureNow()

  for (let i = 0; i < 20 && !calls.some((call) => call.action === 'INGEST_CAPTURE_MESSAGES'); i += 1) {
    await Promise.resolve()
  }
  assert.ok(
    calls.some((call) => call.action === 'INGEST_CAPTURE_MESSAGES'),
    'sanity: o INGEST de X já está em voo',
  )

  const conversationKey = runtime.getCurrentConversationKey()

  // Enquanto isso, o contato muda (mesma conversation_key) — a mensagem no
  // DOM passa a ser a de Y — e uma nova captura roda inteira, assumindo
  // state.resolution/resolutionIdentity/auxiliaryIdentity.
  replaceDomMessages(dom, [{ mid: 'native-y', text: 'Mensagem de Y.' }])
  const newCapture = await runtime.captureNow()
  assert.equal(newCapture.ok, true)
  assert.equal(newCapture.skipped, false)

  const stateAfterY = runtime.getConversationState(conversationKey)
  assert.equal(stateAfterY.resolution.cycle_id, 'cycle-Y')
  assert.equal(stateAfterY.auxiliaryIdentity.key, IDENTITY_KEY_Y)
  assert.equal(stateAfterY.baseVersionsByMessageKey[scopedKey(OTHER_DIGEST, 'native-y')], '9')

  // Só agora a resposta atrasada de X finalmente retorna.
  resolveStaleIngest(
    ingestOk([{ message_key: scopedKey(DEFAULT_DIGEST, 'native-x'), synced: true, canonical_version: '1' }]),
  )
  const stale = await stalePromise
  assert.equal(stale.ok, true)

  const stateAfterStale = runtime.getConversationState(conversationKey)

  // A resposta tardia de X nunca grava em cima do bookkeeping de Y.
  assert.equal(stateAfterStale.auxiliaryIdentity.key, IDENTITY_KEY_Y)
  assert.equal(stateAfterStale.baseVersionsByMessageKey[scopedKey(OTHER_DIGEST, 'native-y')], '9')
  assert.equal(stateAfterStale.baseVersionsByMessageKey[scopedKey(DEFAULT_DIGEST, 'native-x')], undefined)
})

// -----------------------------------------------------------------------
// Auditoria STEP 2A.4 (residual P1) — "MESSAGE KEY — LIMITE DO CONTRATO":
// message_key é uma coluna com limite de 500 caracteres no ledger.
// buildIdentityScopedMessageKey precisa recusar (fail-closed) uma chave
// escopada que ultrapassaria esse limite, e captureNow precisa recusar o
// SNAPSHOT INTEIRO (nunca ingerir parcialmente só as mensagens cuja chave
// deu certo) — mascarar a quebra de contrato com um reduce() que apenas
// descarta a mensagem inválida esconderia o problema em vez de reportá-lo.
// -----------------------------------------------------------------------

test('MESSAGE KEY LENGTH: message_key escopado que ultrapassaria 500 caracteres do contrato do ledger fail-closed — nenhuma mensagem do MESMO snapshot é ingerida, nem as com chave válida', async () => {
  const oversizedMid = 'm'.repeat(450)
  const dom = buildDom([
    { mid: 'native-1', text: 'Mensagem normal.' },
    { mid: oversizedMid, text: 'Mensagem com data-mid enorme.' },
  ])

  const fake = createQueuedSender([
    safeIdentityOk(),
    resolveLeadOwnedByMe(),
    safeIdentityOk(),
    safeIdentityOk(),
  ])

  const runtime = createRuntime({ dom, sendMessage: fake.sendMessage })
  const result = await runtime.captureNow()

  assert.equal(result.ok, false)
  assert.equal(result.reason, 'message_identity_scope_invalid')
  assert.equal(
    fake.calls.some((call) => call.action === 'INGEST_CAPTURE_MESSAGES'),
    false,
    'nenhuma mensagem do snapshot pode ser ingerida parcialmente — nem as com chave escopada válida',
  )
})
