// Rodada 8 (HML): painel da leitura v5. Textos sintéticos.
//
// - Estado de falha em qualquer aba: aviso sem código e com a hora,
//   "Tentar de novo" logo abaixo, a última leitura boa depois.
// - Primeira leitura: segundos passando e "costuma levar até 1 minuto";
//   com leitura na tela, só "Atualizando a leitura…".
// - Um controle só de atualizar, no rodapé de todas as abas, desabilitado
//   enquanto a leitura roda; "Nada novo desde HH:MM" + "Ler de novo mesmo
//   assim".
// - "Como conduzir" no AGORA; "Houve/Melhor" e "Para o gestor" na ANÁLISE;
//   observação embaixo da mensagem.
// - "Aguardando" do Relacionamento vem da vez da leitura.
// - Nenhum código interno na tela; botão legado de análise fora do painel
//   da leitura; polling de 3 s nos primeiros 90 s.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import vm from 'node:vm'

import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)

const view = require('../src/companion-seller-information-view.js')
const clientContextView = require('../src/companion-client-context-view.js')

const readSrc = (name) =>
  readFileSync(fileURLToPath(new URL(`../src/${name}`, import.meta.url)), 'utf8')

const HOSTILE = '<img src=x onerror="alert(1)">'
const INTERNAL_CODE = /\b[A-Z]{3,}_[A-Z_]{3,}\b/

function status(overrides = {}) {
  return {
    running: null,
    running_since: null,
    failure: null,
    retry_at: null,
    refresh: { label: 'Atualizar', mode: 'if_changed', disabled: false, hint: null },
    nothing_new_since: null,
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
    main: { situacao: 'Cliente pediu o valor.', acao: 'Responder o valor.', por_que: 'Ele está esperando.' },
    next_step: {
      turn: 'vendedor',
      turn_label: 'Vez do vendedor',
      title: 'Responder o valor do plano',
      complement: 'Depois, propor um horário.',
      why: 'Ele está esperando.',
      send: true,
      no_send_reason: null,
    },
    conduct: {
      moment: `Cliente interessado, esperando o valor ${HOSTILE}`,
      steps: [
        { technique: 'Valor antes de preço', how: 'Ligar o plano ao objetivo dele.', example: 'Pelo que você contou, o mensal encaixa bem.' },
        { technique: 'Próximo passo pequeno', how: 'Propor um horário para começar.', example: '' },
      ],
      avoid: ['Mandar só o número.'],
    },
    stage_card: null,
    facts: [],
    before_send: [],
    message: { mode: 'send' },
    kanban_late: false,
    hide_stage_sla: false,
    locks: [],
    footer: 'Leitura completa · 01/10, 20:07',
    run_id: 'run-1',
    status: status(),
    view_key: 'agora-r8-1',
    ...overrides,
  }
}

function analysisView(overrides = {}) {
  return {
    state: 'ready',
    notice: null,
    failure_code: null,
    has_reading: true,
    summary: [{ key: 'fase', label: 'Fase', value: 'Não é venda' }, { key: 'venda', label: 'Venda', value: 'Não se aplica' }],
    timeline: [],
    pending: [],
    opportunities: [],
    coaching: {
      acertos: ['Respondeu no mesmo dia.'],
      ajustes: [],
      adjustments: [
        { happened: `Disse que o erro não foi da empresa ${HOSTILE}`, better: 'Assumir o caso e dizer quando volta.' },
      ],
    },
    manager_notes: ['Risco de reclamação pública: a cliente citou um advogado.'],
    sections: [],
    afirmacoes_a_confirmar: ['Regra de reembolso dita pela atendente.'],
    alertas_de_captura: [],
    footer: 'Leitura completa · 01/10, 20:07',
    run_id: 'run-1',
    status: status(),
    view_key: 'analysis-r8-1',
    ...overrides,
  }
}

function mount(html) {
  const dom = new JSDOM(`<!doctype html><div id="root">${html}</div>`)
  return dom.window.document.getElementById('root')
}

function hydrated(kind, viewValue, views) {
  const root = mount(view.renderFullReadingSlot(kind, viewValue))

  assert.equal(view.hydrateFullReadingSlots(root, views), 1)

  return root
}

const texts = (root, selector) =>
  [...root.querySelectorAll(selector)].map((node) => node.textContent)

const FAILED_STATUS = status({
  failure: { kind: 'transient', text: 'Não consegui ler a conversa às 21:50.', detail: 'Vou tentar de novo sozinho às 21:52.' },
  retry_at: '2026-10-02T00:52:00.000Z',
  refresh: { label: 'Tentar de novo', mode: 'always', disabled: false, hint: null },
})

test('falha em qualquer aba: aviso com a hora e sem código, "Tentar de novo" logo abaixo, a última leitura boa depois', () => {
  const agora = agoraView({
    state: 'failed',
    failure_code: 'PROVIDER_TIMEOUT',
    notice: 'Não consegui ler a conversa às 21:50.',
    status: FAILED_STATUS,
    view_key: 'agora-failed',
  })

  const root = hydrated('agora', agora, { agora })
  const slot = root.querySelector('[data-yolen-full-reading="agora"]')
  const children = [...slot.children]

  assert.equal(children[0].getAttribute('data-yolen-full-reading-notice'), 'failed')
  assert.match(children[0].textContent, /Não consegui ler a conversa às 21:50\./)
  assert.match(children[0].textContent, /Vou tentar de novo sozinho às 21:52\./)
  assert.ok(children[1].matches('.yolen-fr-footer'))

  const retry = children[1].querySelector('[data-yolen-action="full-reading-refresh"]')

  assert.equal(retry.textContent, 'Tentar de novo')
  assert.equal(retry.getAttribute('data-yolen-fr-mode'), 'always')
  assert.equal(retry.disabled, false)
  // A última leitura boa continua embaixo.
  assert.equal(children[1].querySelector('.yolen-full-reading-footer').textContent, 'Última leitura · 01/10, 20:07')
  assert.ok(slot.querySelector('[data-yolen-full-reading-main]'))
  // Um controle só, nenhum código interno.
  assert.equal(slot.querySelectorAll('[data-yolen-action="full-reading-refresh"]').length, 1)
  assert.doesNotMatch(slot.textContent, INTERNAL_CODE)

  // ANÁLISE e CLIENTE: o mesmo aviso e o mesmo controle.
  const analysis = analysisView({ state: 'failed', notice: 'Não consegui ler a conversa às 21:50.', status: FAILED_STATUS, view_key: 'analysis-failed' })
  const analysisRoot = hydrated('analysis', analysis, { analysis })

  assert.match(analysisRoot.textContent, /Não consegui ler a conversa às 21:50\./)
  assert.equal(texts(analysisRoot, '[data-yolen-action="full-reading-refresh"]').join('|'), 'Tentar de novo')

  const client = agoraView({ state: 'failed', notice: 'A IA ficou sem crédito às 21:50.', status: FAILED_STATUS, client: { said: [], seems: [], missing: [] }, view_key: 'client-failed' })
  const clientRoot = hydrated('client', client, { agora: client })

  assert.match(clientRoot.textContent, /A IA ficou sem crédito às 21:50\./)
  assert.equal(clientRoot.querySelectorAll('[data-yolen-action="full-reading-refresh"]').length, 1)

  // MENSAGEM sem a mensagem da leitura: aviso + controle.
  const messageRoot = hydrated('message_notice', client, { agora: client })

  assert.match(messageRoot.textContent, /A IA ficou sem crédito às 21:50\./)
  assert.equal(messageRoot.querySelectorAll('[data-yolen-action="full-reading-refresh"]').length, 1)
})

test('primeira leitura: segundos passando e "costuma levar até 1 minuto"; Atualizar desabilitado', () => {
  const agora = agoraView({
    state: 'running',
    notice: 'Lendo a conversa inteira…',
    main: null,
    next_step: null,
    conduct: null,
    footer: null,
    status: status({ running: 'first', running_since: new Date(Date.now() - 12_000).toISOString(), refresh: { label: 'Atualizar', mode: 'always', disabled: true, hint: null } }),
    view_key: 'agora-running',
  })

  const root = hydrated('agora', agora, { agora })
  const notice = root.querySelector('[data-yolen-full-reading-notice]')

  assert.equal(notice.getAttribute('data-yolen-fr-running'), 'first')
  assert.ok(notice.querySelector('.yolen-spinner'))
  assert.match(notice.textContent, /Lendo a conversa inteira…/)
  assert.match(notice.querySelector('[data-yolen-fr-elapsed-since]').textContent, /^1[0-9] s$/)
  assert.match(notice.textContent, /costuma levar até 1 minuto/)

  const refresh = root.querySelector('[data-yolen-action="full-reading-refresh"]')

  assert.equal(refresh.textContent, 'Atualizar')
  assert.equal(refresh.disabled, true)
})

test('com leitura na tela, rodando: ela continua e a faixa diz "Atualizando a leitura…"', () => {
  const agora = agoraView({
    state: 'running',
    notice: 'Atualizando a leitura…',
    status: status({ running: 'update', refresh: { label: 'Atualizar', mode: 'always', disabled: true, hint: null } }),
    view_key: 'agora-updating',
  })

  const root = hydrated('agora', agora, { agora })

  assert.equal(root.querySelector('[data-yolen-full-reading-notice]').getAttribute('data-yolen-fr-running'), 'update')
  assert.doesNotMatch(root.textContent, /Lendo a conversa inteira/)
  assert.ok(root.querySelector('[data-yolen-full-reading-main]'))
  assert.equal(root.querySelector('[data-yolen-action="full-reading-refresh"]').disabled, true)
})

test('Atualizar sem nada novo: "Nada novo desde HH:MM" e "Ler de novo mesmo assim"; aviso da espera de 60 s', () => {
  const agora = agoraView({
    status: status({ nothing_new_since: '20:07', refresh: { label: 'Atualizar', mode: 'if_changed', disabled: false, hint: 'Acabei de ler esta conversa. Tente de novo em 30 s.' } }),
    view_key: 'agora-nothing-new',
  })

  const root = hydrated('agora', agora, { agora })
  const buttons = [...root.querySelectorAll('[data-yolen-action="full-reading-refresh"]')]

  assert.deepEqual(buttons.map((button) => [button.textContent, button.getAttribute('data-yolen-fr-mode')]), [
    ['Atualizar', 'if_changed'],
    ['Ler de novo mesmo assim', 'always'],
  ])
  assert.match(root.querySelector('[data-yolen-fr-nothing-new]').textContent, /^Nada novo desde 20:07\./)
  assert.equal(root.querySelector('[data-yolen-fr-refresh-hint]').textContent, 'Acabei de ler esta conversa. Tente de novo em 30 s.')
})

test('"Como conduzir" logo depois do próximo passo: técnica — como, exemplo em letra menor, "Evite: …"', () => {
  const agora = agoraView()
  const root = hydrated('agora', agora, { agora })
  const slot = root.querySelector('[data-yolen-full-reading="agora"]')
  const cards = [...slot.querySelectorAll(':scope > [data-yolen-fr-card]')].map((card) => card.getAttribute('data-yolen-fr-card'))

  assert.deepEqual(cards.slice(0, 2), ['next_step', 'conduct'])

  const conduct = slot.querySelector('[data-yolen-fr-card="conduct"]')

  assert.equal(conduct.querySelector('.yolen-fr-label').textContent, 'Como conduzir')
  assert.match(conduct.querySelector('.yolen-fr-conduct-moment').textContent, /^Cliente interessado, esperando o valor <img/)
  assert.deepEqual(
    texts(conduct, '[data-yolen-fr-conduct-step] .yolen-fr-list-text'),
    ['Valor antes de preço — Ligar o plano ao objetivo dele.', 'Próximo passo pequeno — Propor um horário para começar.'],
  )
  assert.deepEqual(texts(conduct, '[data-yolen-fr-conduct-example]'), ['Pelo que você contou, o mensal encaixa bem.'])
  assert.equal(conduct.querySelector('[data-yolen-fr-conduct-avoid]').textContent, 'Evite: Mandar só o número.')
  assert.equal(conduct.querySelectorAll('img, script').length, 0)
})

test('ANÁLISE: "Houve/Melhor" na condução, "Para o gestor" em bloco próprio, "A confirmar"', () => {
  const analysis = analysisView()
  const root = hydrated('analysis', analysis, { analysis })

  const adjustment = root.querySelector('[data-yolen-fr-adjustment]')

  assert.match(adjustment.textContent, /^Houve: Disse que o erro não foi da empresa <img/)
  assert.match(adjustment.textContent, /Melhor: Assumir o caso e dizer quando volta\.$/)
  assert.equal(root.querySelector('[data-yolen-fr-card="manager"] .yolen-fr-label').textContent, 'Para o gestor')
  assert.deepEqual(texts(root, '[data-yolen-fr-card="manager"] .yolen-fr-list-text'), ['Risco de reclamação pública: a cliente citou um advogado.'])
  assert.equal(root.querySelector('[data-yolen-fr-collapse="afirmacoes_a_confirmar"] summary span').textContent, 'A confirmar')
  assert.equal(root.querySelectorAll('img, script').length, 0)

  // O footer da ANÁLISE leva o controle único.
  assert.equal(root.querySelectorAll('[data-yolen-action="full-reading-refresh"]').length, 1)
})

test('CLIENTE: "O que foi dito"; Relacionamento com "Aguardando" vindo da vez da leitura', () => {
  const agora = agoraView({ client: { said: [{ text: 'Pediu o valor do plano', date: '01/10' }], seems: [], missing: [] } })
  const root = hydrated('client', agora, { agora })

  assert.equal(root.querySelector('[data-yolen-fr-card="said"] .yolen-fr-label').textContent, 'O que foi dito')

  const context = {
    status: 'ready',
    data: {
      identity: { current_status: 'contato' },
      relationship: { first_known_interaction_at: '2026-09-01T12:00:00.000Z', known_interaction_count: 3 },
      waiting: { state: 'seller_waiting_for_customer' },
    },
  }

  const now = Date.parse('2026-10-01T23:00:00.000Z')
  const waiting = (options) => {
    const html = clientContextView.renderCompactRelationshipCard(context, now, options)
    const match = /Aguardando<\/div>\s*<div class="yolen-fr-cell-value">([^<]*)</.exec(html)
    return match ? match[1] : null
  }

  // Sem a leitura (flag desligada): como hoje.
  assert.equal(waiting(undefined), 'O cliente')
  assert.equal(waiting({ turn: 'vendedor' }), 'Sua resposta')
  assert.equal(waiting({ turn: 'cliente' }), 'Resposta do cliente')
  assert.equal(waiting({ turn: 'ninguem' }), 'Ninguém')
  // Leitura sem vez definida: a célula sai (nada de valor antigo ambíguo).
  assert.equal(waiting({ turn: null }), null)
})

test('aviso de captura recusada não mostra o código da falha', () => {
  const changed =
    view.applyCaptureFailureNotice(
      { state: 'failed', failure_code: 'EMPTY_CONVERSATION', notice: 'x', view_key: 'k' },
      'CAPTURE_RPC_REJECTED',
    )

  assert.equal(changed.notice, 'As mensagens desta conversa ainda não chegaram à Yolen: a captura desta conversa está sendo recusada.')
  assert.doesNotMatch(changed.notice, INTERNAL_CODE)
  assert.match(changed.view_key, /CAPTURE_RPC_REJECTED/)
})

test('MENSAGEM: a observação aparece embaixo da mensagem pronta da leitura', async () => {
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
    { cycle_id: '20000000-0000-4000-8000-000000000001', conversation_key: 'whatsapp:5511900000000' },
    {
      mode: 'send',
      objective: 'Dar um retorno sobre a cobrança.',
      no_send_reason: null,
      notice: null,
      section_text: 'Oi! Vou verificar a cobrança e te respondo [até amanhã às 12h].',
      recommended_objective: 'Dar um retorno sobre a cobrança.',
      suggested_message: 'Oi! Vou verificar a cobrança e te respondo [até amanhã às 12h].',
      observation: `Confirme o prazo antes de enviar ${HOSTILE}`,
      run_id: 'run-1',
    },
  )

  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))

  const card = dom.window.document.querySelector('[data-yolen-fr-card="message"]')

  assert.equal(card.querySelector('textarea[data-yolen-fr-draft]').value, 'Oi! Vou verificar a cobrança e te respondo [até amanhã às 12h].')
  assert.ok(card.querySelector('[data-yolen-seller-message-action="insert"]'))
  assert.ok(card.querySelector('[data-yolen-seller-message-action="copy"]'))

  const observation = card.querySelector('[data-yolen-full-reading-message-observation]')

  assert.match(observation.textContent, /^Confirme o prazo antes de enviar <img/)
  assert.equal(card.querySelectorAll('img').length, 0)
})

test('core: um controle só de atualizar, polling de 3 s nos primeiros 90 s, nova tentativa marcada e botão legado fora', () => {
  const core = readSrc('companion-core.js')
  const slice = (name, length = 3000) => core.slice(core.indexOf(name), core.indexOf(name) + length)

  assert.match(core, /const FULL_READING_FAST_POLL_INTERVAL_MS = 3000/)
  assert.match(core, /const FULL_READING_FAST_POLL_WINDOW_MS = 90 \* 1000/)
  assert.match(core, /const FULL_READING_POLL_INTERVAL_MS = 8000/)
  assert.match(slice('function syncFullReadingPolling()', 2500), /elapsed < FULL_READING_FAST_POLL_WINDOW_MS\s*\?\s*FULL_READING_FAST_POLL_INTERVAL_MS\s*:\s*FULL_READING_POLL_INTERVAL_MS/)
  assert.match(slice('function syncFullReadingRetry(views, scope)', 2000), /status\?\.retry_at/)

  // O clique lê o modo do botão (if_changed ou always) e respeita o
  // desabilitado.
  const wiring = slice('function wirePanelInteractions(panel)', 4000)

  assert.match(wiring, /full-reading-refresh[\s\S]*if \(button\.disabled\)[\s\S]*data-yolen-fr-mode/)
  assert.match(slice('function requestFullReadingRefresh({', 1200), /forceFullReadingMode/)

  // ANÁLISE no painel da leitura: sem "Analisar agora/Atualizar análise";
  // "Transcrever áudio" continua.
  const analysis = slice('function getDetailedAnalysisAreaHtml()', 4500)
  const panelBranch = analysis.slice(analysis.indexOf('if (isFullReadingPanelMode()) {'), analysis.indexOf('// Leitura completa (HML): com leitura pronta'))

  assert.doesNotMatch(panelBranch, /getAnalysisActionButton\(\)/)
  assert.match(panelBranch, /getTranscribeAudioButtonHtml\(\)/)

  // MENSAGEM com a mensagem da leitura: aviso em cima, controle no rodapé.
  const message = slice('function getSellerMessageAreaHtml()', 3500)

  assert.match(message, /renderFullReadingSlot\('notice', fullReadingMessageView\)[\s\S]*data-yolen-seller-message-mount[\s\S]*renderFullReadingSlot\('footer', fullReadingMessageView\)/)

  const controller = readSrc('companion-analysis-controller.js')

  assert.equal((controller.match(/force_mode: 'if_changed'/g) || []).length, 2)
})
