// Onda 4 — arquitetura AGORA / ANÁLISE / CLIENTE do Companion. Testes de
// DOM real (jsdom) para o esqueleto de navegação em abas e as regras de
// silêncio comercial / progressive enhancement V1×V2 que dependem do
// runtime real (content-script.js), não só de checagens estáticas do
// código-fonte.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  analyzeConversationCalls,
  buildMessageHtml,
  buildWhatsAppPageHtml,
  defaultCommercialReading,
  legacyAnalyzeConversationResult,
  loadContentScript,
  resolveLeadCalls,
  waitFor,
} from '../e3-test-support/load-content-script.mjs'

const HEADER_TITLE = '+55 11 98888-7777'

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

async function triggerManualAnalysis(document, calls) {
  await waitFor(() => resolveLeadCalls(calls).length > 0)

  await waitFor(() =>
    Boolean(document.querySelector('[data-yolen-action="analyze-conversation"]')),
  )

  document
    .querySelector('[data-yolen-action="analyze-conversation"]')
    .dispatchEvent(new document.defaultView.Event('click', { bubbles: true }))

  await waitFor(() => analyzeConversationCalls(calls).length > 0, { timeoutMs: 10000 })
}

// Cenário 1: arquitetura AGORA / ANÁLISE / CLIENTE.
test('o painel expõe as três abas AGORA, ANÁLISE e CLIENTE com marcação acessível', async () => {
  const { document, calls } = loadContentScript({ initialHtml: initialPageHtml() })

  await waitFor(() => resolveLeadCalls(calls).length > 0)

  await waitFor(() => Boolean(document.querySelector('.yolen-tabs')))

  const tabs = document.querySelector('.yolen-tabs')
  assert.equal(tabs.getAttribute('role'), 'tablist')

  const buttons = Array.from(document.querySelectorAll('[data-yolen-action="select-companion-tab"]'))
  assert.equal(buttons.length, 3)

  const tabIds = buttons.map((button) => button.getAttribute('data-yolen-tab'))
  assert.deepEqual(tabIds, ['agora', 'analise', 'cliente'])

  for (const tabId of tabIds) {
    const button = document.querySelector(`[data-yolen-tab="${tabId}"]`)
    assert.equal(button.getAttribute('role'), 'tab')
    assert.equal(button.getAttribute('aria-controls'), `yolen-tabpanel-${tabId}`)

    const panel = document.getElementById(`yolen-tabpanel-${tabId}`)
    assert.ok(panel, `esperava o tabpanel de ${tabId}`)
    assert.equal(panel.getAttribute('role'), 'tabpanel')
    assert.equal(panel.getAttribute('aria-labelledby'), `yolen-tab-${tabId}`)
  }
})

// Cenário 3: AGORA é a área padrão.
test('AGORA é a aba visível por padrão; ANÁLISE e CLIENTE começam ocultas', async () => {
  const { document, calls } = loadContentScript({ initialHtml: initialPageHtml() })

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('.yolen-tabs')))

  assert.equal(document.getElementById('yolen-tabpanel-agora').hasAttribute('hidden'), false)
  assert.equal(document.getElementById('yolen-tabpanel-analise').hasAttribute('hidden'), true)
  assert.equal(document.getElementById('yolen-tabpanel-cliente').hasAttribute('hidden'), true)

  assert.equal(document.querySelector('[data-yolen-tab="agora"]').getAttribute('aria-selected'), 'true')
  assert.equal(document.querySelector('[data-yolen-tab="analise"]').getAttribute('aria-selected'), 'false')
})

// Cenário 2: navegação entre áreas.
test('clicar na aba ANÁLISE mostra o painel de Análise e esconde o de AGORA', async () => {
  const { document, calls } = loadContentScript({ initialHtml: initialPageHtml() })

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('.yolen-tabs')))

  document
    .querySelector('[data-yolen-tab="analise"]')
    .dispatchEvent(new document.defaultView.Event('click', { bubbles: true }))

  assert.equal(document.getElementById('yolen-tabpanel-analise').hasAttribute('hidden'), false)
  assert.equal(document.getElementById('yolen-tabpanel-agora').hasAttribute('hidden'), true)
  assert.equal(document.querySelector('[data-yolen-tab="analise"]').getAttribute('aria-selected'), 'true')
  assert.equal(document.querySelector('[data-yolen-tab="agora"]').getAttribute('aria-selected'), 'false')

  document
    .querySelector('[data-yolen-tab="cliente"]')
    .dispatchEvent(new document.defaultView.Event('click', { bubbles: true }))

  assert.equal(document.getElementById('yolen-tabpanel-cliente').hasAttribute('hidden'), false)
  assert.equal(document.getElementById('yolen-tabpanel-analise').hasAttribute('hidden'), true)
})

// Navegação por teclado (item 24 — acessibilidade): seta para a direita
// avança para a próxima aba e move o foco.
test('a seta para a direita no teclado avança para a próxima aba', async () => {
  const { document, calls } = loadContentScript({ initialHtml: initialPageHtml() })

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('.yolen-tabs')))

  const agoraButton = document.querySelector('[data-yolen-tab="agora"]')

  const keydownEvent = new document.defaultView.KeyboardEvent('keydown', {
    key: 'ArrowRight',
    bubbles: true,
    cancelable: true,
  })

  agoraButton.dispatchEvent(keydownEvent)

  assert.equal(document.getElementById('yolen-tabpanel-analise').hasAttribute('hidden'), false)
  assert.equal(document.querySelector('[data-yolen-tab="analise"]').getAttribute('aria-selected'), 'true')
})

// Cenário 6: V2 rico — ANÁLISE mostra coaching e método reais.
test('com leitura V2 rica, a aba ANÁLISE mostra coaching e método com conteúdo real', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    analyzeConversationResult: {
      ok: true,
      data: {
        engine_source: 'stateful',
        commercial_reading: defaultCommercialReading(),
      },
    },
  })

  await triggerManualAnalysis(document, calls)

  document
    .querySelector('[data-yolen-tab="analise"]')
    .dispatchEvent(new document.defaultView.Event('click', { bubbles: true }))

  await waitFor(() => {
    const panel = document.getElementById('yolen-tabpanel-analise')
    return Boolean(panel && /Coaching/.test(panel.textContent))
  })

  const panel = document.getElementById('yolen-tabpanel-analise')

  assert.match(panel.textContent, /Coaching/)
  assert.match(panel.textContent, /Fez perguntas abertas/)
  assert.match(panel.textContent, /Mencionou o preço antes de confirmar o impacto/)
  assert.match(panel.textContent, /Método/)
  assert.match(panel.textContent, /Dentro do método/)

  assert.doesNotMatch(document.querySelector('.yolen-cliente-empty')?.textContent ?? '', /./)
})

// Cenário 5: V1 pobre — a UI não pode quebrar nem fingir método/coaching
// que não existem.
test('com leitura V1 (legado), ANÁLISE mostra estado vazio honesto em vez de inventar método ou coaching', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    analyzeConversationResult: legacyAnalyzeConversationResult(),
  })

  await triggerManualAnalysis(document, calls)

  await waitFor(() => {
    const card = document.querySelector('.yolen-decision-card')
    return Boolean(card && /Cliente perguntou sobre o produto/.test(card.textContent))
  })

  document
    .querySelector('[data-yolen-tab="analise"]')
    .dispatchEvent(new document.defaultView.Event('click', { bubbles: true }))

  const analisePanel = document.getElementById('yolen-tabpanel-analise')

  assert.match(analisePanel.textContent, /Ainda não há uma análise comercial detalhada disponível/)
  assert.doesNotMatch(analisePanel.textContent, /Dentro do método|Saiu do método|Coaching/)
})

// Cenário 4: non_commercial — AGORA fica silenciosa, sem pressão, sem
// método/aderência/mensagem — mesmo que a leitura ainda carregue dados
// comerciais antigos (o motor V2 preserva o estado anterior de
// propósito).
test('sessão non_commercial deixa a área AGORA silenciosa, sem pressionar o vendedor', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    analyzeConversationResult: {
      ok: true,
      data: {
        engine_source: 'stateful',
        commercial_reading: defaultCommercialReading({
          commercial_relevance: 'non_commercial',
        }),
      },
    },
  })

  await triggerManualAnalysis(document, calls)

  await waitFor(() => {
    const card = document.querySelector('.yolen-decision-card')
    return Boolean(card && /Conversa sem evidência comercial relevante/.test(card.textContent))
  })

  const agoraPanel = document.getElementById('yolen-tabpanel-agora')

  assert.match(agoraPanel.textContent, /Conversa sem evidência comercial relevante/)
  assert.match(agoraPanel.textContent, /Nenhuma ação comercial necessária/)

  assert.doesNotMatch(agoraPanel.textContent, /Mencionou o preço antes de confirmar o impacto/)
  assert.doesNotMatch(agoraPanel.textContent, /Como esse problema afeta o dia a dia/)
  assert.equal(agoraPanel.querySelector('.yolen-agora-method-line'), null)
  assert.equal(agoraPanel.querySelector('.yolen-agora-attention-line'), null)
})
