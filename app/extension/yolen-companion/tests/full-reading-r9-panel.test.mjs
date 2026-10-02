// Rodada 9 (HML), Fase 1: extensão. Textos e DOM sintéticos.
//
// - ManyChat: linha de sistema reconhecida pela estrutura (classe de linha
//   de sistema) e, como reserva, pelo texto; evento interno não vira
//   mensagem; evento útil entra com o texto da linha (links no lugar, sem
//   "[opções: …]"); a ausência de um evento nunca vira mensagem apagada;
//   mensagem do robô continua.
// - Painel: faixa da rajada, da resposta do vendedor e do teto; mensagem
//   da leitura esmaecida ("pode estar desatualizada"); "Ler a conversa
//   inteira" discreto junto do "Atualizar"; releitura agendada com o
//   painel aberto (fim da rajada e revisar_em).

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import vm from 'node:vm'

import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)
require('../src/platform-contract.js')
const surfaceApi = require('../src/manychat-surface.js')
require('../src/manychat-message-semantics.js')
require('../src/manychat-message-identity.js')
require('../src/manychat-message-content.js')
require('../src/manychat-message-profile.js')
require('../src/manychat-dom-reader.js')
require('../src/manychat-composer.js')
require('../src/manychat-phone-evidence.js')
require('../src/manychat-audio-source.js')
const adapterApi = require('../src/manychat-channel-adapter.js')
const view = require('../src/companion-seller-information-view.js')

const readSrc = (name) =>
  readFileSync(fileURLToPath(new URL(`../src/${name}`, import.meta.url)), 'utf8')

const URL_A = 'https://app.manychat.com/fb1/chat/111'
const KEY_X = `manychat:contact:v1:sha256:${'a'.repeat(64)}`
const CHANNEL_KEY = `manychat:channel:whatsapp:v1:sha256:${'c'.repeat(64)}`

function botBubble({ title, html, classes = '' }) {
  return `
    <div>
      <div class="_wrapper_x _typeOut_x _botMessage_x ${classes}" data-title="${title}" data-title-at="1" data-title-offset-bottom="1">
        <div class="_bubble_x">${html}</div>
      </div>
    </div>`
}

// Linha de sistema: mesmas marcas de saída do bot, com a classe de linha
// de sistema do CSS module e o link (nome da regra/automação) no meio.
function systemLine({ title, html }) {
  return `
    <div>
      <div class="_wrapper_x _typeOut_x _botMessage_x" data-title="${title}" data-title-at="1" data-title-offset-bottom="1">
        <div class="_systemMessage_x">${html}</div>
      </div>
    </div>`
}

function humanBubble({ mid, classes = '_typeIn_x', title, html }) {
  return `
    <div>
      <div class="_wrapper_x ${classes}" data-title="${title}" data-title-at="1" data-title-offset-bottom="1">
        <div data-mid="${mid}">${html}</div>
      </div>
    </div>`
}

function buildDom(bubbles) {
  return new JSDOM(
    `<!doctype html><html><body>
      <main>
        <div data-test-id="chat-messages-list">${bubbles.join('')}</div>
        <footer><textarea></textarea></footer>
      </main>
    </body></html>`,
    { url: URL_A },
  )
}

function createAdapter(dom) {
  return adapterApi.create({
    document: dom.window.document,
    window: dom.window,
    MutationObserver: dom.window.MutationObserver,
    surfaceProvider: () => surfaceApi.parseManyChatConversationUrl(URL_A),
    readSafeIdentity: async () => ({
      ready: true,
      reason: null,
      safe: {
        platform: 'manychat',
        platform_identity: { source: 'subscriber_id', key: KEY_X },
        channel_identity: { channel: 'whatsapp', source: 'whatsapp_user_id', key: CHANNEL_KEY },
      },
    }),
    mutationDebounceMs: 1,
    scheduleInterval: () => 1,
    cancelInterval: () => {},
  })
}

function readEntries(bubbles) {
  const adapter = createAdapter(buildDom(bubbles))
  const entries = adapter.readVisibleMessageEntries({ observedAt: '2026-10-02T12:00:00.000Z' })

  assert.ok(Array.isArray(entries), 'a leitura não pode falhar fechado')

  return entries
}

const read = (bubbles) =>
  readEntries(bubbles).map((entry) => ({
    author: entry.message.authorKind,
    text: entry.message.text,
    deleted: entry.deleted,
  }))

const customer = humanBubble({ mid: 'm1', title: '2026-10-02T09:00:00', html: '<span>Oi, quero saber dos planos</span>' })
const welcome = botBubble({ title: '2026-10-02T09:00:00', html: '<p>Olá! Seja bem-vindo à Empresa Exemplo.</p>' })

test('B1: linha de sistema pela estrutura — evento interno não vira mensagem; mensagem do robô continua', () => {
  const messages = read([
    customer,
    welcome,
    systemLine({ title: '2026-10-02T09:01:00', html: 'Regra acionada : <a href="#">Planilha</a>' }),
    systemLine({ title: '2026-10-02T09:01:00', html: 'Tag adicionada : <a href="#">Lead quente</a>' }),
    // Linha de sistema com texto que não é evento útil conhecido: fora.
    systemLine({ title: '2026-10-02T09:02:00', html: 'Algo interno do sistema' }),
  ])

  assert.deepEqual(messages.map((item) => [item.author, item.text]), [
    ['customer', 'Oi, quero saber dos planos'],
    ['automation', 'Olá! Seja bem-vindo à Empresa Exemplo.'],
  ])
})

test('B1: evento útil entra com o texto da linha e os links no lugar (sem "[opções: …]")', () => {
  const messages = read([
    customer,
    systemLine({ title: '2026-10-02T09:01:00', html: 'Atribuir automaticamente a <b>Equipe Exemplo</b> pela automação <a href="#">Fluxo inicial</a>' }),
    systemLine({ title: '2026-10-02T09:05:00', html: 'A conversa foi movida de Abrir para Fechada' }),
  ])

  assert.deepEqual(messages.map((item) => [item.author, item.text]), [
    ['customer', 'Oi, quero saber dos planos'],
    ['automation', 'Atribuir automaticamente a Equipe Exemplo pela automação Fluxo inicial'],
    ['automation', 'A conversa foi movida de Abrir para Fechada'],
  ])
  assert.doesNotMatch(messages.map((item) => item.text).join('\n'), /\[opções:/)
})

test('B1 (reserva): sem a classe de linha de sistema, o texto reconhece o evento', () => {
  const messages = read([
    customer,
    botBubble({ title: '2026-10-02T09:01:00', html: 'Regra acionada : <a href="#">Planilha</a>' }),
    botBubble({ title: '2026-10-02T09:02:00', html: 'Conversa atribuída a <a href="#">Equipe Exemplo</a>' }),
  ])

  assert.deepEqual(messages.map((item) => [item.author, item.text]), [
    ['customer', 'Oi, quero saber dos planos'],
    ['automation', 'Conversa atribuída a Equipe Exemplo'],
  ])
})

test('B5: a ausência de um evento nunca vira mensagem apagada', () => {
  const withEvent = readEntries([
    customer,
    systemLine({ title: '2026-10-02T09:01:00', html: 'Tag adicionada : <a href="#">Lead quente</a>' }),
    welcome,
  ])
  const without = readEntries([customer, welcome])

  assert.deepEqual(withEvent.map((entry) => entry.messageId), without.map((entry) => entry.messageId))
  assert.ok([...withEvent, ...without].every((entry) => entry.deleted === false))

  // O núcleo da captura só marca exclusão quando o adaptador diz que a
  // entrada foi apagada (o ManyChat nunca diz).
  const adapter = readSrc('manychat-channel-adapter.js')

  assert.match(adapter, /deleted: false,/)
  assert.doesNotMatch(adapter, /deleted: true/)
})

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------

function status(overrides = {}) {
  return {
    running: null,
    running_since: null,
    failure: null,
    retry_at: null,
    refresh: { label: 'Atualizar', mode: 'if_changed', disabled: false, hint: null, full: { label: 'Ler a conversa inteira', mode: 'full' } },
    nothing_new_since: null,
    band: null,
    message_outdated: false,
    pending_until: null,
    review_at: null,
    ...overrides,
  }
}

function agoraView(overrides = {}) {
  return {
    state: 'ready',
    notice: null,
    failure_code: null,
    kanban: { status: 'contato', label: 'Contato' },
    kanban_line: 'Etapa no kanban: Contato',
    main: { situacao: 'O cliente pediu o valor.', acao: 'Responder o valor.', por_que: 'Está esperando.' },
    next_step: {
      turn: 'vendedor',
      turn_label: 'Vez do vendedor',
      title: 'Responder o valor',
      complement: '',
      why: 'Está esperando.',
      send: true,
      no_send_reason: null,
    },
    conduct: null,
    stage_card: null,
    facts: [],
    before_send: [],
    message: { mode: 'send' },
    kanban_late: false,
    hide_stage_sla: false,
    locks: [],
    footer: 'Leitura completa · 02/10, 17:30',
    run_id: 'run-1',
    status: status(),
    view_key: 'agora-r9-1',
    ...overrides,
  }
}

function hydrated(kind, viewValue, views) {
  const dom = new JSDOM(`<!doctype html><div id="root">${view.renderFullReadingSlot(kind, viewValue)}</div>`)
  const root = dom.window.document.getElementById('root')

  assert.equal(view.hydrateFullReadingSlots(root, views), 1)

  return root
}

test('D1/D2/D4: faixas da economia — rajada, resposta do vendedor e teto diário', () => {
  for (const [kind, text, state] of [
    ['burst', 'Mensagem nova — atualizando em instantes', 'ready'],
    ['seller_replied', 'Você respondeu às 17:58. A leitura atualiza quando o cliente responder.', 'ready'],
  ]) {
    const agora = agoraView({ state, notice: text, status: status({ band: { kind, text } }), view_key: `agora-${kind}` })
    const root = hydrated('agora', agora, { agora })
    const notice = root.querySelector('[data-yolen-full-reading-notice]')

    assert.equal(notice.getAttribute('data-yolen-fr-band'), kind)
    assert.ok(notice.classList.contains('yolen-fr-band'))
    assert.equal(notice.querySelector('.yolen-fr-notice-text').textContent, text)
    assert.equal(notice.querySelector('.yolen-spinner'), null)
    assert.ok(root.querySelector('[data-yolen-full-reading-main]'), 'a leitura continua na tela')
  }

  const capped = agoraView({
    state: 'failed',
    notice: 'Limite diário de leituras atingido',
    failure_code: 'DAILY_CAP_REACHED',
    status: status({
      failure: { kind: 'deterministic', text: 'Limite diário de leituras atingido', detail: null },
      band: { kind: 'daily_cap', text: 'Limite diário de leituras atingido' },
      refresh: { label: 'Tentar de novo', mode: 'always', disabled: false, hint: null, full: null },
    }),
    view_key: 'agora-cap',
  })
  const root = hydrated('agora', capped, { agora: capped })

  assert.equal(root.querySelector('.yolen-fr-notice-text').textContent, 'Limite diário de leituras atingido')
  assert.equal(root.querySelector('[data-yolen-fr-full-read]'), null)
  assert.doesNotMatch(root.textContent, /DAILY_CAP/)
})

test('E2: "Ler a conversa inteira" discreto junto do "Atualizar"; some enquanto a leitura roda', () => {
  const agora = agoraView()
  const root = hydrated('agora', agora, { agora })
  const buttons = [...root.querySelectorAll('[data-yolen-action="full-reading-refresh"]')]

  assert.deepEqual(buttons.map((button) => [button.textContent, button.getAttribute('data-yolen-fr-mode')]), [
    ['Atualizar', 'if_changed'],
    ['Ler a conversa inteira', 'full'],
  ])

  const running = agoraView({
    state: 'running',
    notice: 'Atualizando a leitura…',
    status: status({ running: 'update', refresh: { label: 'Atualizar', mode: 'always', disabled: true, hint: null, full: null } }),
    view_key: 'agora-running',
  })

  assert.equal(hydrated('agora', running, { agora: running }).querySelector('[data-yolen-fr-full-read]'), null)

  // O clique manda o modo "full" e o controlador o envia como force_mode.
  const core = readSrc('companion-core.js')

  assert.match(core, /frMode === 'if_changed' \|\| frMode === 'full'/)
  assert.match(core, /force && \(mode === 'if_changed' \|\| mode === 'full'\)/)
})

test('G2/D1: com o painel aberto, a extensão relê no fim da rajada e no horário de revisar', () => {
  const core = readSrc('companion-core.js')
  const wake = core.slice(core.indexOf('function syncFullReadingWake(views, scope)'), core.indexOf('function syncFullReadingWake(views, scope)') + 2000)

  assert.match(core, /syncFullReadingRetry\(views, scope\)\s*\n\s*syncFullReadingWake\(views, scope\)/)
  assert.match(wake, /status\?\.pending_until, status\?\.review_at/)
  assert.match(wake, /requestFullReadingRefresh\(\)/)
})

test('D2: a mensagem da leitura fica esmaecida com "pode estar desatualizada" depois que o vendedor respondeu', async () => {
  const dom = new JSDOM(
    `<!doctype html><html><body>
      <div id="main"><footer><div contenteditable="true" role="textbox"></div></footer></div>
      <div data-yolen-seller-message-mount></div>
    </body></html>`,
    { url: 'https://web.whatsapp.com/', pretendToBeVisual: true },
  )

  const sandbox = {
    window: dom.window,
    chrome: { runtime: { async sendMessage() { return { ok: true, payload: { ok: true, data: {} } } } } },
    document: dom.window.document,
    navigator: dom.window.navigator,
    MutationObserver: dom.window.MutationObserver,
    InputEvent: dom.window.InputEvent,
    Promise,
    Map,
    Math,
    String,
  }
  sandbox.globalThis = sandbox

  vm.createContext(sandbox)
  vm.runInContext(readSrc('whatsapp-adapter.js'), sandbox, { filename: 'whatsapp-adapter.js' })
  vm.runInContext(readSrc('companion-message-controller.js'), sandbox, { filename: 'companion-message-controller.js' })

  const adapter = sandbox.YolenCompanionWhatsAppAdapter.create()
  const controller = sandbox.YolenCompanionMessageController.create({
    insertIntoComposer: adapter.insertTextIntoEmptyComposer,
    getBaseUrl: () => 'https://preview.example',
    platformDisplayName: adapter.platform.displayName,
  })

  controller.syncFullReading(
    { cycle_id: '20000000-0000-4000-8000-000000000009', conversation_key: 'whatsapp:5511900000009' },
    {
      mode: 'send',
      objective: 'Responder o valor.',
      no_send_reason: null,
      notice: null,
      section_text: 'Oi! O valor é R$ 100,00.',
      recommended_objective: 'Responder o valor.',
      suggested_message: 'Oi! O valor é R$ 100,00.',
      observation: null,
      outdated: true,
      outdated_notice: 'pode estar desatualizada',
      run_id: 'run-1',
    },
  )

  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))

  const card = dom.window.document.querySelector('[data-yolen-fr-card="message"]')

  assert.ok(card.classList.contains('yolen-fr-card--outdated'))
  assert.ok(card.hasAttribute('data-yolen-full-reading-message-outdated'))
  assert.equal(card.querySelector('[data-yolen-fr-outdated]').textContent, 'pode estar desatualizada')
  assert.equal(card.querySelector('textarea[data-yolen-fr-draft]').value, 'Oi! O valor é R$ 100,00.')
})
