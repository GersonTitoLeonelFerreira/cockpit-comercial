// Correção cirúrgica — stale seller region confirmado em Firefox real.
//
// Diagnóstico real (smoke Firefox): data-yolen-region-action-lock="true"
// ficava preso na região seller-information-architecture e impedia
// renderPanelRegion() de substituir o HTML dessa região durante uma troca
// de conversa de verdade. Causa raiz: o único jeito de liberar o lock era
// um `click` correspondente na MESMA região (ou os sweeps globais de
// pointercancel/dragstart) — se o pointerdown não fosse seguido de um
// click nessa região (dedo solto fora do elemento, região substituída no
// meio do gesto, troca de conversa entre os dois eventos...), o lock nunca
// era liberado, e isRegionInteractionActive() continuava reportando a
// região como "em uso" para sempre.
//
// Correção (exclusivamente o lifecycle do region-action-lock):
//   1) clearPanelRegionActionLocks() é chamado no início de
//      clearLeadStateForNewConversation() — uma troca REAL de conversa
//      descarta qualquer lock imediatamente, antes de limpar
//      caches/pending regions.
//   2) fallback de liberação no pointerup (agendado com setTimeout(0), ou
//      seja, sempre depois do release síncrono/microtask do click normal
//      da mesma sequência de gesto) — cobre o caso de um pointerdown sem
//      click correspondente.
//
// Este arquivo cobre exatamente as regressões comportamentais pedidas:
//   a) region lock ativo + A->B => B renderiza imediatamente;
//   b) region lock ativo + A->grupo => seller mount/box desaparecem;
//   c) region lock ativo + A->self => seller mount/box desaparecem;
//   d) pointerdown sem click + pointerup => lock é liberado;
//   e) pointerdown + click normal => ação continua ocorrendo apenas uma vez;
//   f) estabilidade da mesma conversa (sem troca real) continua preservada
//      — o lock não pode ser descartado só porque um render de fundo foi
//      pedido na mesma conversa.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMessageHtml,
  createLeadCalls,
  defaultLeadResolution,
  leadSummaryCalls,
  loadContentScript,
  resolveLeadCalls,
  waitFor,
} from '../e3-test-support/load-content-script.mjs'

const TITLE_A = '+55 11 98888-7777'
const TITLE_B = '+55 21 97777-6666'
const PHONE_A = '5511988887777'
const PHONE_B = '5521977776666'
const CYCLE_A = 'cycle-conversation-a'
const CYCLE_B = 'cycle-conversation-b'
const SUMMARY_A = 'Cliente A perguntou sobre o preço do plano.'
const SUMMARY_B = 'Cliente B pediu desconto no plano anual.'
const MARKER_A = 'MENSAGEM_EXCLUSIVA_DA_CONVERSA_A_NAO_PODE_APARECER_DEPOIS'
const SELF_TITLE = 'Gerson Ferreira (você)'

function summaryPayload(cycleId, conversationKey, summary) {
  return {
    ok: true,
    data: {
      identity: { company_id: 'company-1', lead_id: 'lead-1', cycle_id: cycleId, conversation_key: conversationKey },
      summary: { summary, version: 1, updated_at: '2026-08-25T12:00:00.000Z' },
      working_summary: summary,
    },
  }
}

function initialPageHtml() {
  const messagesHtml = buildMessageHtml({
    id: 'msg-a1',
    prePlainText: '[10:15, 21/08/2026] Cliente A: ',
    text: 'Quanto custa o plano?',
  })

  return `<!doctype html><html><body>
    <div id="app">
      <div id="main">
        <header><span title="${TITLE_A}">${TITLE_A}</span></header>
        <div id="conversation-body">${messagesHtml}</div>
        <footer><div contenteditable="true" role="textbox"></div></footer>
      </div>
    </div>
  </body></html>`
}

function dispatch(target, type, init = {}) {
  const view = target.defaultView ?? target.ownerDocument?.defaultView
  const EventCtor =
    'key' in init ? (view?.KeyboardEvent ?? KeyboardEvent) : (target.Event ?? view?.Event ?? Event)
  target.dispatchEvent(new EventCtor(type, { bubbles: true, cancelable: true, ...init }))
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function switchToTab(document, area) {
  dispatch(document.querySelector(`[data-yolen-seller-area="${area}"]`), 'click')
}

function replaceHeader(document, innerHtml) {
  const header = document.querySelector('#main header')
  header.innerHTML = innerHtml
  dispatch(header, 'click')
}

function switchTo(document, title) {
  replaceHeader(document, `<span title="${title}">${title}</span>`)
}

function switchToGroup(document, title) {
  replaceHeader(document, `<div aria-label="Conversa em grupo"></div><span title="${title}">${title}</span>`)
}

function switchToSelf(document) {
  replaceHeader(document, `<span title="${SELF_TITLE}">${SELF_TITLE}</span>`)
}

function hasMount(document) {
  return Boolean(document.querySelector('[data-yolen-seller-message-mount]'))
}

function hasBox(document) {
  return Boolean(document.querySelector('[data-yolen-seller-message-box]'))
}

function messagePanelHtml(document) {
  return document.querySelector('[data-yolen-seller-panel="message"]')?.innerHTML || ''
}

function getSellerRegion(document) {
  return document
    .getElementById('yolen-companion-panel')
    ?.querySelector('[data-yolen-region="seller-information-architecture"]')
}

function isSellerRegionLocked(document) {
  return getSellerRegion(document)?.dataset.yolenRegionActionLock === 'true'
}

function isAnyRegionLocked(document) {
  return Boolean(document.querySelector('[data-yolen-region-action-lock="true"]'))
}

// Trava a região seller-information-architecture do jeito real: pointerdown
// num elemento de ação (REGION_ACTION_SELECTOR) que more dentro dela — o
// botão "Copiar" do composer (inserido por seller-message-runtime.js dentro
// de [data-yolen-seller-message-mount], que é filho da região) — sem
// disparar o click correspondente. Reproduz exatamente o cenário do
// diagnóstico real: lock preso sem release.
function lockSellerRegionWithoutReleasing(document) {
  const copyButton = document.querySelector('[data-yolen-seller-message-action="copy"]')
  assert.ok(copyButton, 'botão "Copiar" precisa existir para travar a região seller de verdade')
  dispatch(copyButton, 'pointerdown')
  assert.equal(isSellerRegionLocked(document), true, 'pointerdown no botão precisa travar a região seller')
  return copyButton
}

async function setupAActiveWithMessage(overrides = {}) {
  const { document, calls, window } = loadContentScript({
    initialHtml: initialPageHtml(),
    resolutionsByPhone: {
      [PHONE_A]: defaultLeadResolution({ phone: PHONE_A, cycle: { id: CYCLE_A, status: 'contato', owner_user_id: 'user-1' } }),
      ...overrides.resolutionsByPhone,
    },
    leadSummaryResult: overrides.leadSummaryResult ?? summaryPayload(CYCLE_A, `whatsapp:${PHONE_A}`, SUMMARY_A),
    messageGenerationResult: overrides.messageGenerationResult ?? { status: 'ready', message: MARKER_A, error: null },
    withSellerMessageRuntime: true,
    withStabilityRuntimes: true,
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => leadSummaryCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('[data-yolen-seller-area="message"]')))

  switchToTab(document, 'message')
  await waitFor(() => Boolean(document.querySelector('[data-yolen-seller-message-intent]')))

  const intentField = document.querySelector('[data-yolen-seller-message-intent]')
  intentField.value = 'Quero responder sobre o preço.'
  dispatch(intentField, 'input')
  dispatch(document.querySelector('[data-yolen-seller-message-action="generate"]'), 'click')

  await waitFor(() => document.querySelector('.yolen-message-result-text')?.textContent === MARKER_A)
  await waitFor(() => Boolean(document.querySelector('[data-yolen-seller-message-action="copy"]')))

  return { document, calls, window }
}

test('a) region lock ativo (A) + A->B: B renderiza imediatamente, sem depender de um click liberador', async () => {
  const { document, calls } = await setupAActiveWithMessage({
    resolutionsByPhone: {
      [PHONE_B]: defaultLeadResolution({ phone: PHONE_B, cycle: { id: CYCLE_B, status: 'contato', owner_user_id: 'user-1' } }),
    },
    leadSummaryResult: (_count, payload) =>
      payload?.cycle_id === CYCLE_B
        ? summaryPayload(CYCLE_B, `whatsapp:${PHONE_B}`, SUMMARY_B)
        : summaryPayload(CYCLE_A, `whatsapp:${PHONE_A}`, SUMMARY_A),
  })

  lockSellerRegionWithoutReleasing(document)

  // Troca real de conversa (A -> B) enquanto o lock continua ligado — o
  // clique é no header, nunca na região travada, então nada libera o lock
  // pelo caminho normal (click na mesma região).
  switchTo(document, TITLE_B)

  await waitFor(() => resolveLeadCalls(calls).some((call) => call.payload.phone === PHONE_B))
  await waitFor(() => leadSummaryCalls(calls).some((call) => call.payload?.cycle_id === CYCLE_B))
  await sleep(50)

  assert.equal(isSellerRegionLocked(document), false, 'a troca real de conversa precisa descartar o lock imediatamente')

  switchToTab(document, 'now')
  await waitFor(() => document.querySelector('.yolen-lead-summary-card')?.textContent.includes(SUMMARY_B))

  switchToTab(document, 'message')
  assert.doesNotMatch(messagePanelHtml(document), new RegExp(MARKER_A), 'nenhum resquício da mensagem de A pode sobreviver à troca')
})

test('b) region lock ativo (A) + A->grupo: seller mount/box desaparecem', async () => {
  const { document } = await setupAActiveWithMessage()

  lockSellerRegionWithoutReleasing(document)

  switchToGroup(document, 'Grupo da Equipe')

  await sleep(700)

  assert.equal(isSellerRegionLocked(document), false, 'a troca para grupo precisa descartar o lock imediatamente')

  switchToTab(document, 'message')
  await sleep(30)

  assert.equal(hasMount(document), false, 'nenhum mount seller pode sobreviver a A->grupo mesmo com o lock ativo')
  assert.equal(hasBox(document), false, 'nenhum box seller pode sobreviver a A->grupo mesmo com o lock ativo')
  assert.doesNotMatch(messagePanelHtml(document), new RegExp(MARKER_A))
})

test('c) region lock ativo (A) + A->self: seller mount/box desaparecem', async () => {
  const { document } = await setupAActiveWithMessage()

  lockSellerRegionWithoutReleasing(document)

  switchToSelf(document)

  await sleep(700)

  assert.equal(isSellerRegionLocked(document), false, 'a troca para self precisa descartar o lock imediatamente')

  switchToTab(document, 'message')
  await sleep(30)

  assert.equal(hasMount(document), false, 'nenhum mount seller pode sobreviver a A->self mesmo com o lock ativo')
  assert.equal(hasBox(document), false, 'nenhum box seller pode sobreviver a A->self mesmo com o lock ativo')
  assert.doesNotMatch(messagePanelHtml(document), new RegExp(MARKER_A))
})

test('d) pointerdown sem click correspondente + pointerup: lock é liberado pelo fallback', async () => {
  const { document } = await setupAActiveWithMessage()

  const copyButton = lockSellerRegionWithoutReleasing(document)

  // Ponteiro solto sem um click correspondente na região (ex.: dedo saiu do
  // elemento antes de soltar) — o fallback de pointerup precisa liberar o
  // lock mesmo assim, mas só depois de um tick assíncrono (setTimeout(0)),
  // nunca sincronamente dentro do próprio handler de pointerup.
  dispatch(copyButton, 'pointerup')

  assert.equal(isSellerRegionLocked(document), true, 'o lock não pode ser liberado SINCRONAMENTE dentro do handler de pointerup')

  await sleep(10)

  assert.equal(isSellerRegionLocked(document), false, 'o fallback agendado pelo pointerup precisa liberar o lock quando o click esperado nunca chega')
})

test('e) pointerdown + pointerup + click normal: a ação ocorre exatamente uma vez (fallback não duplica)', async () => {
  const { document, calls } = await setupAActiveWithMessage({
    resolutionsByPhone: {
      [PHONE_B]: defaultLeadResolution({ phone: PHONE_B, status: 'NOT_FOUND', lead: null, cycle: null }),
    },
  })

  switchTo(document, TITLE_B)
  await waitFor(() => resolveLeadCalls(calls).some((call) => call.payload.phone === PHONE_B))
  await waitFor(() => Boolean(document.querySelector('[data-yolen-lead-create-form]')))

  const nameInput = document.querySelector('[name="yolen-lead-name"]')
  nameInput.focus()
  dispatch(nameInput, 'focusin')
  nameInput.value = 'Cliente Novo B'
  dispatch(nameInput, 'input')

  const submitButton = document.querySelector('.yolen-lead-create-submit')
  assert.ok(submitButton)

  // Sequência real de gesto: pointerdown -> pointerup -> click, nessa
  // ordem, na mesma interação — o fallback de pointerup não pode causar
  // (nem via corrida com o release do click) uma segunda execução da ação.
  dispatch(submitButton, 'pointerdown')
  dispatch(submitButton, 'pointerup')
  dispatch(submitButton, 'click')
  dispatch(document.querySelector('[data-yolen-lead-create-form]'), 'submit')

  await waitFor(() => createLeadCalls(calls).length > 0)

  // O setTimeout(0) do fallback de pointerup ainda roda depois disso —
  // dá tempo para ele disparar antes de conferir que nada duplicou.
  await sleep(20)

  assert.equal(createLeadCalls(calls).length, 1, 'um único gesto precisa criar o lead uma única vez, mesmo com o fallback de pointerup agendado')
})

test('f) sem troca real de conversa, o lock de região continua protegendo o DOM normalmente (nenhuma regressão)', async () => {
  // Cenário próximo do teste 5) já existente em
  // content-script-dom-panel-region-stability.test.mjs: o formulário de
  // criação de lead (região seller-information-architecture) precisa
  // continuar com sua identidade de node preservada durante uma
  // atualização em segundo plano NA MESMA conversa — a nova regra de
  // invalidação de lock em clearLeadStateForNewConversation() só pode
  // disparar numa troca REAL de conversa, nunca aqui.
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    resolutionsByPhone: {
      [PHONE_A]: defaultLeadResolution({ phone: PHONE_A, status: 'NOT_FOUND', lead: null, cycle: null }),
    },
    withStabilityRuntimes: true,
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('[data-yolen-lead-create-form]')))

  const submitButton = document.querySelector('.yolen-lead-create-submit')
  assert.ok(submitButton)

  dispatch(submitButton, 'pointerdown')
  assert.equal(isAnyRegionLocked(document), true, 'pointerdown no botão de criar lead precisa travar sua região')

  // Atualização em segundo plano NA MESMA conversa (não é troca de
  // conversa).
  dispatch(document.querySelector('[data-yolen-action="refresh"]'), 'click')

  await waitFor(() => resolveLeadCalls(calls).length > 1)
  await sleep(30)

  assert.equal(isAnyRegionLocked(document), true, 'uma atualização em segundo plano da MESMA conversa não pode descartar o lock de ação')
  assert.equal(
    document.querySelector('.yolen-lead-create-submit'),
    submitButton,
    'o botão não pode ter sido substituído por um node novo enquanto o lock protegia a interação em andamento',
  )

  // Fechando o gesto normalmente: o click de release na própria região
  // ainda precisa funcionar como sempre funcionou.
  dispatch(submitButton, 'click')
  await Promise.resolve()
  await Promise.resolve()

  assert.equal(isAnyRegionLocked(document), false, 'o release normal por click na mesma região continua funcionando')
})
