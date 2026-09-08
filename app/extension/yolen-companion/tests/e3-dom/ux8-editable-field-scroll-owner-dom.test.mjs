// Teste de DOM real (jsdom + node:vm) da FASE B.2 da UX8 (scroll owner
// correto em editable-field-stability-runtime.js): esse runtime é um
// segundo sistema, independente de panel-stability-runtime.js, que trava
// e preserva a posição de leitura especificamente durante interação com
// campos editáveis (pointerdown/focusin/input em inputs/textareas/
// contenteditable). Antes da FASE B.2 ele lia/escrevia
// currentPanel.scrollTop — o mesmo bug de dono de scroll errado já
// corrigido em panel-stability-runtime.js e content-script.js. Aqui
// provamos que ele também usa .yolen-workspace-body agora, e que os dois
// runtimes de estabilidade não brigam entre si pelo elemento dono do
// scroll quando carregados juntos (como rodam de verdade, via manifest).
//
// Usa o campo [name="yolen-lead-name"] (formulário de criação de lead,
// de lead-automation.js) como campo editável de teste — o harness
// tests/e3-test-support/load-content-script.mjs não carrega
// seller-message-runtime.js (a textarea real de intenção da mensagem só
// existe no manifest real), mas editable-field-stability-runtime.js trata
// qualquer campo do EDITABLE_SELECTOR (inputs, textareas, contenteditable)
// de forma idêntica — o comportamento provado aqui é o mesmo.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMessageHtml,
  buildWhatsAppPageHtml,
  defaultLeadResolution,
  loadContentScript,
  resolveLeadCalls,
  waitFor,
} from '../e3-test-support/load-content-script.mjs'

const HEADER_TITLE = '+55 11 98888-7777'
const PHONE_DIGITS = '5511988887777'

function initialPageHtml() {
  return buildWhatsAppPageHtml({
    headerTitle: HEADER_TITLE,
    messagesHtml: buildMessageHtml({
      id: 'msg-1',
      prePlainText: '[10:15, 21/08/2026] Cliente Teste: ',
      text: 'Ola, bom dia',
    }),
  })
}

function getPanel(document) {
  return document.getElementById('yolen-companion-panel')
}

function getWorkspaceBody(document) {
  return getPanel(document)?.querySelector('[data-yolen-workspace-body]')
}

function loadWithLeadForm() {
  return loadContentScript({
    initialHtml: initialPageHtml(),
    resolutionsByPhone: {
      [PHONE_DIGITS]: defaultLeadResolution({ phone: PHONE_DIGITS, status: 'NOT_FOUND', lead: null, cycle: null }),
    },
    withStabilityRuntimes: true,
  })
}

function dispatch(target, type, init = {}) {
  const EventCtor =
    target.Event ??
    target.defaultView?.Event ??
    target.ownerDocument?.defaultView?.Event ??
    Event
  target.dispatchEvent(new EventCtor(type, { bubbles: true, cancelable: true, ...init }))
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function makeFakeScrollable(element, { scrollHeight = 3000, clientHeight = 600 } = {}) {
  Object.defineProperty(element, 'scrollHeight', { get: () => scrollHeight, configurable: true })
  Object.defineProperty(element, 'clientHeight', { get: () => clientHeight, configurable: true })
}

function spyScrollTopWrites(element) {
  let writes = 0
  let value = element.scrollTop
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get() {
      return value
    },
    set(next) {
      writes += 1
      value = next
    },
  })
  return () => writes
}

test('1) foco em campo editável usa workspaceBody.scrollTop, nunca panel.scrollTop', async () => {
  const { document, calls } = loadWithLeadForm()

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('[name="yolen-lead-name"]')))

  const panel = getPanel(document)
  const workspaceBody = getWorkspaceBody(document)

  await sleep(80)

  makeFakeScrollable(workspaceBody)
  workspaceBody.scrollTop = 300
  dispatch(workspaceBody, 'scroll')
  await sleep(10)

  const getPanelWrites = spyScrollTopWrites(panel)

  const nameInput = document.querySelector('[name="yolen-lead-name"]')
  nameInput.focus()
  dispatch(nameInput, 'focusin')
  await sleep(20)

  assert.equal(getPanelWrites(), 0, 'foco em campo editável não pode ler/escrever panel.scrollTop')
  assert.equal(getWorkspaceBody(document).scrollTop, 300, 'a posição de leitura do workspace-body precisa ser preservada ao focar')
})

test('2) digitar em campo editável (input) preserva workspaceBody.scrollTop e não joga o workspace-body para o topo', async () => {
  const { document, calls } = loadWithLeadForm()

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('[name="yolen-lead-name"]')))

  const workspaceBody = getWorkspaceBody(document)
  await sleep(80)

  makeFakeScrollable(workspaceBody)
  workspaceBody.scrollTop = 540
  dispatch(workspaceBody, 'scroll')
  await sleep(10)

  const nameInput = document.querySelector('[name="yolen-lead-name"]')
  nameInput.focus()
  dispatch(nameInput, 'focusin')

  for (const char of 'Ana Cliente') {
    nameInput.value += char
    dispatch(nameInput, 'input')
  }

  await sleep(20)

  assert.equal(
    getWorkspaceBody(document).scrollTop,
    540,
    'digitar no campo editável não pode alterar a posição de leitura do workspace-body',
  )
})

test('4) o clamp de scrollHeight/clientHeight usado para restaurar a posição vem do workspace-body, não do painel', async () => {
  const { document, calls } = loadWithLeadForm()

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('[name="yolen-lead-name"]')))

  const workspaceBody = getWorkspaceBody(document)
  await sleep(80)

  // workspace-body só tem 100px de scroll disponível (scrollHeight -
  // clientHeight = 100) — bem menor que a posição que vamos tentar
  // restaurar, para provar que o clamp usa os limites do workspace-body,
  // não do painel (que nem tem esses limites simulados aqui).
  makeFakeScrollable(workspaceBody, { scrollHeight: 700, clientHeight: 600 })
  workspaceBody.scrollTop = 100
  dispatch(workspaceBody, 'scroll')
  await sleep(10)

  const nameInput = document.querySelector('[name="yolen-lead-name"]')
  nameInput.focus()
  dispatch(nameInput, 'focusin')
  await sleep(20)

  assert.ok(
    getWorkspaceBody(document).scrollTop <= 100,
    'a posição restaurada precisa respeitar o limite (scrollHeight - clientHeight) do workspace-body',
  )
})

test('5+6) colapsar (sem workspace-body) não lança erro em editable-field-stability-runtime, e expandir continua funcional', async () => {
  const { document, calls } = loadWithLeadForm()

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('[name="yolen-lead-name"]')))

  const panel = getPanel(document)

  assert.doesNotThrow(() => {
    dispatch(panel.querySelector('[data-yolen-action="collapse-companion"]'), 'click')
  })

  await sleep(10)
  assert.equal(getWorkspaceBody(document), null, 'não existe workspace-body no modo colapsado')

  // Nenhuma mutação observada pelo runtime pode lançar mesmo sem
  // workspace-body (a casca colapsada não tem campos editáveis).
  assert.doesNotThrow(() => {
    document.dispatchEvent(new document.defaultView.Event('visibilitychange'))
  })

  assert.doesNotThrow(() => {
    dispatch(document.querySelector('[data-yolen-action="expand-companion"]'), 'click')
  })

  await waitFor(() => Boolean(getWorkspaceBody(document)))
  await waitFor(() => Boolean(document.querySelector('[name="yolen-lead-name"]')))

  const nameInputAfterExpand = document.querySelector('[name="yolen-lead-name"]')
  nameInputAfterExpand.focus()

  assert.doesNotThrow(() => {
    dispatch(nameInputAfterExpand, 'focusin')
  })
})

test('8) panel-stability-runtime e editable-field-stability-runtime não brigam pelo elemento dono do scroll', async () => {
  const { document, calls } = loadWithLeadForm()

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('[name="yolen-lead-name"]')))

  const panel = getPanel(document)
  const workspaceBody = getWorkspaceBody(document)
  await sleep(80)

  makeFakeScrollable(workspaceBody)
  workspaceBody.scrollTop = 260
  dispatch(workspaceBody, 'scroll')
  await sleep(10)

  const getPanelWrites = spyScrollTopWrites(panel)

  // [name="yolen-lead-name"] é reconhecido tanto pelo EDITABLE_SELECTOR
  // genérico de editable-field-stability-runtime.js quanto pelas travas
  // de ação/interação de panel-stability-runtime.js — os dois reagem ao
  // mesmo gesto do vendedor, cada um com seu próprio estado interno.
  const nameInput = document.querySelector('[name="yolen-lead-name"]')

  assert.doesNotThrow(() => {
    dispatch(nameInput, 'pointerdown')
    nameInput.focus()
    dispatch(nameInput, 'focusin')
    nameInput.value = 'Ana'
    dispatch(nameInput, 'input')
  })

  await sleep(20)

  assert.equal(
    getPanelWrites(),
    0,
    'nenhum dos dois runtimes de estabilidade pode ler/escrever panel.scrollTop — ambos precisam concordar que o dono é o workspace-body',
  )
  assert.equal(
    getWorkspaceBody(document).scrollTop,
    260,
    'a posição de leitura do workspace-body precisa sobreviver à interação simultânea dos dois runtimes',
  )
})
