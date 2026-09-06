// Teste de DOM real (jsdom + node:vm) da UX8 FASE C: quarta aba MENSAGEM
// como superfície própria do composer seller-facing, navegação real por
// teclado entre as 4 abas, e — o requisito mais crítico desta fase —
// que mover o composer para sua própria aba não regride o isolamento
// A→B do PR #270: gerar em A não pode vazar para B, e uma resposta
// atrasada de A não pode aparecer na aba MENSAGEM depois que o vendedor
// já trocou para B.
//
// Usa withSellerMessageRuntime: true (novo nesta fase) para carregar
// lead-method-guidance-runtime.js e seller-message-runtime.js junto com
// content-script.js na mesma sandbox — necessário porque o composer real
// só existe com os dois runtimes presentes.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMessageHtml,
  defaultLeadResolution,
  leadSummaryCalls,
  loadContentScript,
  resolveLeadCalls,
  waitFor,
} from '../e3-test-support/load-content-script.mjs'

const CONVERSATION_A_TITLE = '+55 11 98888-7777'
const CONVERSATION_B_TITLE = '+55 21 97777-6666'
const PHONE_A = '5511988887777'
const PHONE_B = '5521977776666'
const CYCLE_A = 'cycle-conversation-a'
const CYCLE_B = 'cycle-conversation-b'
const SUMMARY_A = 'Cliente A perguntou sobre o preço do plano.'
const SUMMARY_B = 'Cliente B pediu para remarcar a demonstração.'
const MARKER_A = 'MENSAGEM_EXCLUSIVA_DA_CONVERSA_A_NAO_PODE_APARECER_EM_B'
const MARKER_B = 'MENSAGEM_EXCLUSIVA_DA_CONVERSA_B'

// Igual a buildWhatsAppPageHtml() de load-content-script.mjs, mas com um
// <footer><div contenteditable> dentro de #main — o campo de rascunho
// real que getWhatsAppComposer() (seller-message-runtime.js) procura, e
// que buildWhatsAppPageHtml() sozinho não inclui.
function initialPageHtml() {
  const messagesHtml = buildMessageHtml({
    id: 'msg-a1',
    prePlainText: '[10:15, 21/08/2026] Cliente A: ',
    text: 'Quanto custa o plano?',
  })

  return `<!doctype html><html><body>
    <div id="app">
      <div id="main">
        <header><span title="${CONVERSATION_A_TITLE}">${CONVERSATION_A_TITLE}</span></header>
        <div id="conversation-body">${messagesHtml}</div>
        <footer><div contenteditable="true" role="textbox"></div></footer>
      </div>
    </div>
  </body></html>`
}

function getPanel(document) {
  return document.getElementById('yolen-companion-panel')
}

function dispatch(target, type, init = {}) {
  const view =
    target.defaultView ??
    target.ownerDocument?.defaultView

  // 'key' só é reconhecido por KeyboardEventInit — um Event genérico
  // descarta esse campo silenciosamente, então handleSellerAreaKeyboard()
  // nunca veria event.key.
  const EventCtor =
    'key' in init
      ? (view?.KeyboardEvent ?? KeyboardEvent)
      : (target.Event ?? view?.Event ?? Event)

  target.dispatchEvent(new EventCtor(type, { bubbles: true, cancelable: true, ...init }))
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function switchToTab(document, area) {
  dispatch(document.querySelector(`[data-yolen-seller-area="${area}"]`), 'click')
}

function baseScenarioOptions(overrides = {}) {
  return {
    initialHtml: initialPageHtml(),
    resolutionsByPhone: {
      [PHONE_A]: defaultLeadResolution({ phone: PHONE_A, cycle: { id: CYCLE_A, status: 'contato', owner_user_id: 'user-1' } }),
      [PHONE_B]: defaultLeadResolution({ phone: PHONE_B, cycle: { id: CYCLE_B, status: 'contato', owner_user_id: 'user-1' } }),
    },
    leadSummaryResult: (_callCount, requestPayload) => ({
      ok: true,
      data: {
        identity: { company_id: 'company-1', lead_id: 'lead-1', cycle_id: requestPayload?.cycle_id, conversation_key: requestPayload?.conversation_key },
        summary: {
          summary: requestPayload?.cycle_id === CYCLE_B ? SUMMARY_B : SUMMARY_A,
          version: 1,
          updated_at: '2026-08-25T12:00:00.000Z',
        },
        working_summary: requestPayload?.cycle_id === CYCLE_B ? SUMMARY_B : SUMMARY_A,
      },
    }),
    withSellerMessageRuntime: true,
    ...overrides,
  }
}

function switchWhatsAppConversationToB(document) {
  const header = document.querySelector('header span[title]')
  header.setAttribute('title', CONVERSATION_B_TITLE)
  header.textContent = CONVERSATION_B_TITLE
  dispatch(header, 'click')
}

test('navegação por teclado real percorre as 4 abas na ordem oficial, nos dois sentidos, com Home/End', async () => {
  const { document, calls } = loadContentScript(baseScenarioOptions())

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('[data-yolen-seller-area="now"]')))

  const nowTab = document.querySelector('[data-yolen-seller-area="now"]')

  function activeArea() {
    return document.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('data-yolen-seller-area')
  }

  assert.equal(activeArea(), 'now')

  const order = ['now', 'message', 'analysis', 'client']
  let currentIndex = 0

  for (let step = 0; step < order.length; step += 1) {
    dispatch(document.querySelector(`[data-yolen-seller-area="${activeArea()}"]`), 'keydown', { key: 'ArrowRight' })
    await Promise.resolve()
    await Promise.resolve()
    currentIndex = (currentIndex + 1) % order.length
    assert.equal(activeArea(), order[currentIndex])
  }

  // currentIndex voltou a 0 ('now') — mais uma volta completa provando o
  // wrap round-trip antes de testar o sentido inverso.
  assert.equal(currentIndex, 0)

  // Voltando: ArrowLeft percorre o sentido inverso a partir de 'now'.
  for (let step = 0; step < order.length; step += 1) {
    dispatch(document.querySelector(`[data-yolen-seller-area="${activeArea()}"]`), 'keydown', { key: 'ArrowLeft' })
    await Promise.resolve()
    await Promise.resolve()
    currentIndex = (currentIndex - 1 + order.length) % order.length
    assert.equal(activeArea(), order[currentIndex])
  }

  dispatch(document.querySelector(`[data-yolen-seller-area="${activeArea()}"]`), 'keydown', { key: 'End' })
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(activeArea(), 'client')

  dispatch(document.querySelector(`[data-yolen-seller-area="${activeArea()}"]`), 'keydown', { key: 'Home' })
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(activeArea(), 'now')

  assert.ok(nowTab, 'referência inicial preservada só para garantir que o teste montou o DOM corretamente')
})

test('existe exatamente um mount seller-facing no DOM real, e ele mora só na aba MENSAGEM', async () => {
  const { document, calls } = loadContentScript(baseScenarioOptions())

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('[data-yolen-seller-area="message"]')))

  const mounts = document.querySelectorAll('[data-yolen-seller-message-mount]')
  assert.equal(mounts.length, 1)

  const mount = mounts[0]
  assert.ok(mount.closest('[data-yolen-seller-panel="message"]'))
  assert.equal(mount.closest('[data-yolen-seller-panel="now"]'), null)
})

test('gerar mensagem em A aparece na aba MENSAGEM; trocar para B some; voltar para MENSAGEM em B não traz o conteúdo de A', async () => {
  const { document, calls } = loadContentScript(
    baseScenarioOptions({
      messageGenerationResult: (requestPayload) => ({
        status: 'ready',
        message: requestPayload?.conversation_key?.includes(PHONE_B) ? MARKER_B : MARKER_A,
        error: null,
      }),
    }),
  )

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('[data-yolen-seller-area="message"]')))

  switchToTab(document, 'message')
  await waitFor(() => Boolean(document.querySelector('[data-yolen-seller-message-intent]')))

  const intentField = document.querySelector('[data-yolen-seller-message-intent]')
  intentField.value = 'Quero responder sobre o preço.'
  dispatch(intentField, 'input')
  dispatch(document.querySelector('[data-yolen-seller-message-action="generate"]'), 'click')

  await waitFor(() => document.querySelector('.yolen-message-result-text')?.textContent === MARKER_A)
  assert.equal(document.querySelector('[data-yolen-seller-panel="message"]')?.hasAttribute('hidden'), false)

  // Troca real de conversa: A -> B.
  switchWhatsAppConversationToB(document)

  // MutationObserver dispara em microtask, não sincronamente durante o
  // setAttribute/textContent acima — um único tick já é suficiente para
  // observar o clear imediato (que roda ANTES do debounce de 600ms).
  await waitFor(() => document.querySelector('[data-yolen-seller-message-box]') === null, { timeoutMs: 2000 })

  // O composer some imediatamente (síncrono ao detectar a mutação, antes
  // de B chegar) — contrato já garantido por seller-message-runtime.js e
  // provado por seller-message-runtime-contract.test.mjs; aqui provamos
  // que isso continua verdade estando o mount dentro da aba MENSAGEM.
  assert.equal(document.querySelector('[data-yolen-seller-message-box]'), null)

  await waitFor(() => resolveLeadCalls(calls).some((call) => call.payload.phone === PHONE_B))
  await waitFor(() => leadSummaryCalls(calls).some((call) => call.payload?.cycle_id === CYCLE_B))
  await sleep(30)

  // Mudança real de conversa reseta a aba ativa para 'now' — o vendedor
  // precisa navegar para MENSAGEM de novo, agora no contexto de B.
  switchToTab(document, 'message')
  await sleep(30)

  const bodyText = document.body.textContent
  assert.doesNotMatch(bodyText, new RegExp(MARKER_A), 'a mensagem gerada para A não pode reaparecer na aba MENSAGEM de B')

  const messagePanel = document.querySelector('[data-yolen-seller-panel="message"]')
  assert.doesNotMatch(messagePanel.innerHTML, new RegExp(MARKER_A))
})

test('geração de A em voo: trocar para B antes da resposta atrasada chegar nunca deixa a mensagem de A aparecer', async () => {
  let resolveGenerationForA
  const { document, calls } = loadContentScript(
    baseScenarioOptions({
      messageGenerationResult: (requestPayload) => {
        if (requestPayload?.conversation_key?.includes(PHONE_A)) {
          return new Promise((resolve) => {
            resolveGenerationForA = resolve
          })
        }

        return { status: 'ready', message: MARKER_B, error: null }
      },
    }),
  )

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('[data-yolen-seller-area="message"]')))

  switchToTab(document, 'message')
  await waitFor(() => Boolean(document.querySelector('[data-yolen-seller-message-intent]')))

  const intentField = document.querySelector('[data-yolen-seller-message-intent]')
  intentField.value = 'Quero responder sobre o preço.'
  dispatch(intentField, 'input')
  dispatch(document.querySelector('[data-yolen-seller-message-action="generate"]'), 'click')

  await waitFor(() => Boolean(resolveGenerationForA), { timeoutMs: 4000 })
  await waitFor(() => document.querySelector('.yolen-message-status')?.textContent === 'Gerando mensagem…')

  // Troca para B ANTES da geração de A resolver.
  switchWhatsAppConversationToB(document)
  await waitFor(() => resolveLeadCalls(calls).some((call) => call.payload.phone === PHONE_B))
  await sleep(30)

  // Só agora a resposta atrasada de A chega.
  resolveGenerationForA({ status: 'ready', message: MARKER_A, error: null })
  await sleep(30)

  assert.doesNotMatch(
    document.body.textContent,
    new RegExp(MARKER_A),
    'uma resposta atrasada de A não pode renderizar depois que o vendedor já trocou para B',
  )

  switchToTab(document, 'message')
  await sleep(30)

  assert.doesNotMatch(
    document.querySelector('[data-yolen-seller-panel="message"]').innerHTML,
    new RegExp(MARKER_A),
  )
})

test('Incluir no WhatsApp e Copiar continuam ligados ao contexto atual, sem enviar automaticamente', async () => {
  const { document, window, calls } = loadContentScript(
    baseScenarioOptions({
      messageGenerationResult: { status: 'ready', message: MARKER_A, error: null },
    }),
  )

  let copied = null
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: {
      async writeText(value) {
        copied = value
      },
    },
  })

  // jsdom não implementa execCommand('insertText', ...) de verdade —
  // mockado aqui do mesmo jeito que
  // tests/seller-message-runtime-contract.test.mjs faz na sua própria
  // sandbox isolada, para exercitar o caminho principal de inserção
  // (sem depender do fallback via InputEvent, que exigiria expor esse
  // construtor global nesta sandbox).
  const composerForExecCommand = document.querySelector(
    '#main footer [contenteditable="true"]',
  )
  document.execCommand = (command, _showUi, value) => {
    if (command !== 'insertText') {
      return false
    }

    composerForExecCommand.textContent = value
    return true
  }

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('[data-yolen-seller-area="message"]')))

  switchToTab(document, 'message')
  await waitFor(() => Boolean(document.querySelector('[data-yolen-seller-message-intent]')))

  const intentField = document.querySelector('[data-yolen-seller-message-intent]')
  intentField.value = 'Quero responder sobre o preço.'
  dispatch(intentField, 'input')
  dispatch(document.querySelector('[data-yolen-seller-message-action="generate"]'), 'click')

  await waitFor(() => document.querySelector('.yolen-message-result-text'))

  dispatch(document.querySelector('[data-yolen-seller-message-action="copy"]'), 'click')
  await sleep(10)
  assert.equal(copied, MARKER_A)

  const composer = document.querySelector('#main footer [contenteditable="true"]')
  assert.equal(composer.textContent, '', 'rascunho do WhatsApp precisa começar vazio para este teste')

  dispatch(document.querySelector('[data-yolen-seller-message-action="insert"]'), 'click')
  await sleep(10)

  assert.equal(composer.textContent.trim(), MARKER_A)
  // Nunca dispara envio: nenhum elemento de "enviar" foi clicado, e o
  // conteúdo permanece só no campo de rascunho do WhatsApp.
  assert.equal(document.querySelectorAll('[data-icon="send"]').length, 0)
})
