// Teste de DOM real (jsdom + node:vm) da FASE B.1 da UX8 (scroll owner
// correto): .yolen-workspace-body é o dono real do scroll seller-facing;
// #yolen-companion-panel (overflow:hidden) não é mais um container
// rolável operacional. Ver tests/ux8-scroll-owner-structure.test.mjs para
// a prova via texto-fonte; aqui provamos o comportamento real.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMessageHtml,
  buildWhatsAppPageHtml,
  defaultLeadResolution,
  defaultLeadSummary,
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

test('1+2) trocar de aba preserva o scroll do workspace-body e nunca lê/escreve panel.scrollTop', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    withStabilityRuntimes: true,
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('[data-yolen-seller-area="analysis"]')))

  const panel = getPanel(document)
  const workspaceBody = getWorkspaceBody(document)

  // Deixa qualquer ciclo de restauração de scroll da montagem inicial
  // terminar antes de simular a leitura do vendedor (ver comentário
  // equivalente no teste "5+6" abaixo).
  await sleep(80)

  makeFakeScrollable(workspaceBody)
  workspaceBody.scrollTop = 420
  dispatch(workspaceBody, 'scroll')
  await sleep(10)

  // Espiona toda escrita em panel.scrollTop: trocar de aba nunca pode
  // tocar nele (o painel externo tem overflow:hidden — não existe scroll
  // operacional nele na UX8).
  let panelScrollTopWrites = 0
  let panelScrollTopBackingValue = 0
  Object.defineProperty(panel, 'scrollTop', {
    configurable: true,
    get() {
      return panelScrollTopBackingValue
    },
    set(value) {
      panelScrollTopWrites += 1
      panelScrollTopBackingValue = value
    },
  })

  dispatch(document.querySelector('[data-yolen-seller-area="analysis"]'), 'click')
  await Promise.resolve()
  await Promise.resolve()

  assert.equal(
    document.querySelector('[data-yolen-seller-panel="analysis"]')?.hasAttribute('hidden'),
    false,
    'a troca de aba precisa ter acontecido de verdade',
  )

  assert.equal(
    getWorkspaceBody(document).scrollTop,
    420,
    'trocar de aba não pode alterar a posição de leitura do workspace-body',
  )
  assert.equal(
    panelScrollTopWrites,
    0,
    'trocar de aba não pode ler/escrever panel.scrollTop — o dono do scroll é o workspace-body',
  )
})

test('3) mudança real de conversa zera o scroll do workspace-body (com panel-stability-runtime carregado)', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    resolutionsByPhone: {
      [PHONE_DIGITS]: defaultLeadResolution({ phone: PHONE_DIGITS, status: 'NOT_FOUND', lead: null, cycle: null }),
    },
    withStabilityRuntimes: true,
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('[data-yolen-lead-create-form]')))

  const workspaceBody = getWorkspaceBody(document)

  await sleep(80)

  makeFakeScrollable(workspaceBody)
  workspaceBody.scrollTop = 900
  dispatch(workspaceBody, 'scroll')
  await sleep(10)

  const header = document.querySelector('header span[title]')
  header.setAttribute('title', '+55 11 97777-6666')
  header.textContent = '+55 11 97777-6666'
  dispatch(header, 'click')

  await waitFor(() => resolveLeadCalls(calls).some((call) => call.payload.phone !== PHONE_DIGITS))
  await sleep(30)

  assert.equal(
    getWorkspaceBody(document).scrollTop,
    0,
    'uma mudança real de conversa precisa resetar o scroll do workspace-body',
  )
})

test('5+6) rerender de região em segundo plano (mesma conversa) preserva o scroll do workspace-body via panel-stability-runtime', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    withStabilityRuntimes: true,
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('[data-yolen-seller-area="now"]')))

  const workspaceBody = getWorkspaceBody(document)

  // Deixa qualquer ciclo de restauração de scroll disparado pelos renders
  // iniciais (montagem do painel) terminar antes de simular a leitura do
  // vendedor — senão um restore() já agendado (rAF) pode sobrescrever o
  // scrollTop que estamos prestes a definir com o snapshot antigo (0).
  await sleep(80)

  makeFakeScrollable(workspaceBody)
  workspaceBody.scrollTop = 850
  // jsdom não dispara 'scroll' sozinho ao atribuir scrollTop (não simula
  // física de layout) — dispara manualmente para que
  // panel-stability-runtime.js capture esta posição como a "posição de
  // leitura atual" antes do rerender, exatamente como um scroll real do
  // vendedor faria.
  dispatch(workspaceBody, 'scroll')
  await sleep(10)

  // Clicar repetidamente na aba já ativa força renderPanel() de novo
  // (rerender de região em segundo plano) sem trocar de conversa e sem
  // re-resolver o lead — ao contrário do botão "Atualizar", que
  // temporariamente troca o texto de .yolen-lead-name para o telefone
  // enquanto re-resolve (um comportamento pré-existente e independente
  // desta fase: panel-stability-runtime.js detecta troca de conversa
  // comparando esse texto, e esse texto intermediário dispara um
  // falso-positivo de "conversa mudou" — fora do escopo de FASE B.1,
  // que só corrige QUAL elemento rola, não QUANDO a heurística de troca
  // de conversa decide resetar).
  const nowTab = document.querySelector('[data-yolen-seller-area="now"]')
  for (let i = 0; i < 3; i += 1) {
    dispatch(nowTab, 'click')
  }

  await sleep(60)

  assert.equal(
    getWorkspaceBody(document).scrollTop,
    850,
    'um rerender de região em segundo plano (sem trocar de conversa) não pode jogar o workspace-body de volta ao topo',
  )
})

test('7+8) colapsar e expandir de novo não lança erro mesmo sem workspace-body, e recria o shell UX8 corretamente', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    withStabilityRuntimes: true,
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('[data-yolen-seller-area="analysis"]')))

  const panel = getPanel(document)
  assert.ok(getWorkspaceBody(document), 'workspace-body precisa existir expandido')

  // Colapsar: a casca colapsada não tem regiões nem workspace-body. Nada
  // no runtime de estabilidade pode lançar ao tentar capturar/restaurar
  // scroll nesse estado (fail-safe).
  assert.doesNotThrow(() => {
    dispatch(panel.querySelector('[data-yolen-action="collapse-companion"]'), 'click')
  })

  await sleep(10)

  assert.ok(document.querySelector('.yolen-collapsed-shell'), 'modo colapsado precisa renderizar')
  assert.equal(
    getWorkspaceBody(document),
    null,
    'não existe workspace-body no modo colapsado',
  )
  assert.equal(
    panel.getAttribute('data-yolen-ux-build'),
    'UX8',
    'a identidade do shell persiste mesmo colapsado (é um atributo do próprio painel, não do innerHTML)',
  )

  // Uma mutação qualquer enquanto colapsado (o runtime observa o
  // documento inteiro) não pode lançar mesmo sem workspace-body.
  assert.doesNotThrow(() => {
    document.dispatchEvent(new document.defaultView.Event('visibilitychange'))
  })

  // Expandir de novo: o shell precisa ser recriado do zero sem erro, com
  // workspace-body de volta e as abas funcionando.
  assert.doesNotThrow(() => {
    dispatch(document.querySelector('[data-yolen-action="expand-companion"]'), 'click')
  })

  await waitFor(() => Boolean(getWorkspaceBody(document)))
  await waitFor(() => Boolean(document.querySelector('[data-yolen-seller-area="client"]')))

  assert.ok(getWorkspaceBody(document), 'workspace-body precisa voltar a existir ao expandir')
  assert.equal(panel.getAttribute('data-yolen-ux-build'), 'UX8')

  dispatch(document.querySelector('[data-yolen-seller-area="client"]'), 'click')
  await Promise.resolve()
  await Promise.resolve()

  assert.equal(
    document.querySelector('[data-yolen-seller-panel="client"]')?.hasAttribute('hidden'),
    false,
    'as abas precisam continuar funcionando depois de expandir de novo',
  )
})

test('9) mesmo depois de recolher/expandir, header/contato/abas/rodapé continuam fora do workspace-body', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    withStabilityRuntimes: true,
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('[data-yolen-seller-area="analysis"]')))

  const panel = getPanel(document)

  dispatch(panel.querySelector('[data-yolen-action="collapse-companion"]'), 'click')
  await sleep(10)
  dispatch(document.querySelector('[data-yolen-action="expand-companion"]'), 'click')
  await waitFor(() => Boolean(getWorkspaceBody(document)))
  await waitFor(() => Boolean(document.querySelector('[data-yolen-seller-area="analysis"]')))

  const workspaceBody = getWorkspaceBody(document)

  for (const regionKey of ['header', 'contact-card', 'pre-send-assessment', 'seller-area-tabs', 'footer']) {
    const region = panel.querySelector(`[data-yolen-region="${regionKey}"]`)
    assert.ok(region, `região "${regionKey}" precisa existir depois de expandir de novo`)
    assert.equal(
      region.closest('[data-yolen-workspace-body]'),
      null,
      `região "${regionKey}" não pode estar dentro do workspace-body depois de expandir de novo`,
    )
  }

  assert.equal(
    panel.querySelector('[data-yolen-region="seller-information-architecture"]').closest('[data-yolen-workspace-body]'),
    workspaceBody,
  )
})
