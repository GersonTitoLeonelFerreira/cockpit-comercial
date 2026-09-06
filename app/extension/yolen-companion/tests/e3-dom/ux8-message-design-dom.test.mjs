// Teste de DOM real (jsdom + node:vm) da UX8 FASE D: estabilidade
// geométrica da aba MENSAGEM redesenhada. A regra central desta fase
// (seção 16 da autorização) é que o shell (header/contato/abas/rodapé) e
// a geometria principal do workspace nunca mudam entre idle, loading,
// ready, no_message e error — nem com intenção longa, nem com mensagem
// gerada longa.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMessageHtml,
  defaultLeadResolution,
  loadContentScript,
  resolveLeadCalls,
  waitFor,
} from '../e3-test-support/load-content-script.mjs'

const HEADER_TITLE = '+55 11 98888-7777'
const PHONE = '5511988887777'
const CYCLE = 'cycle-design-test'

function initialPageHtml() {
  const messagesHtml = buildMessageHtml({
    id: 'msg-1',
    prePlainText: '[10:15, 21/08/2026] Cliente Teste: ',
    text: 'Quanto custa o plano?',
  })

  return `<!doctype html><html><body>
    <div id="app">
      <div id="main">
        <header><span title="${HEADER_TITLE}">${HEADER_TITLE}</span></header>
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
  const view = target.defaultView ?? target.ownerDocument?.defaultView
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

function baseOptions(overrides = {}) {
  return {
    initialHtml: initialPageHtml(),
    resolutionsByPhone: {
      [PHONE]: defaultLeadResolution({ phone: PHONE, cycle: { id: CYCLE, status: 'contato', owner_user_id: 'user-1' } }),
    },
    leadSummaryResult: {
      ok: true,
      data: {
        identity: { company_id: 'company-1', lead_id: 'lead-1', cycle_id: CYCLE, conversation_key: `whatsapp:${PHONE}` },
        summary: { summary: 'Cliente perguntou sobre o preço.', version: 1, updated_at: '2026-08-25T12:00:00.000Z' },
        working_summary: 'Cliente perguntou sobre o preço.',
      },
    },
    withSellerMessageRuntime: true,
    ...overrides,
  }
}

function getShellFingerprint(document) {
  const panel = getPanel(document)
  return {
    childCount: panel.children.length,
    panelWidth: panel.getAttribute('data-yolen-ux-build'),
    headerRegion: panel.querySelector('[data-yolen-region="header"]'),
    tabsRegion: panel.querySelector('[data-yolen-region="seller-area-tabs"]'),
    footerRegion: panel.querySelector('[data-yolen-region="footer"]'),
    workspaceBody: panel.querySelector('[data-yolen-workspace-body]'),
  }
}

async function loadAndOpenMessage(overrides) {
  const harness = loadContentScript(baseOptions(overrides))
  const { document, calls } = harness

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('[data-yolen-seller-area="message"]')))
  switchToTab(document, 'message')
  await waitFor(() => Boolean(document.querySelector('[data-yolen-seller-message-intent]')))

  return harness
}

test('8+9+10) ready mostra a mensagem dentro da área limitada; no_message e error usam estado compacto (sem card)', async () => {
  const { document, calls } = await loadAndOpenMessage({
    messageGenerationResult: { status: 'ready', message: 'Claro, posso explicar os planos.', error: null },
  })

  const intentField = document.querySelector('[data-yolen-seller-message-intent]')
  intentField.value = 'Responder sobre preço'
  dispatch(intentField, 'input')
  dispatch(document.querySelector('[data-yolen-seller-message-action="generate"]'), 'click')

  await waitFor(() => document.querySelector('.yolen-message-result-card'))
  assert.ok(document.querySelector('.yolen-message-result-scroll').contains(
    document.querySelector('.yolen-message-result-text'),
  ), 'o texto gerado precisa estar dentro da área com scroll próprio')
  assert.equal(document.querySelectorAll('.yolen-message-status').length, 0, 'não pode haver status compacto quando já existe um resultado pronto')

  void calls
})

test('9) no_message usa um status compacto de uma linha, sem card de resultado nem ações', async () => {
  const { document } = await loadAndOpenMessage({
    messageGenerationResult: { status: 'no_message', message: null, error: null },
  })

  const intentField = document.querySelector('[data-yolen-seller-message-intent]')
  intentField.value = 'Só um oi'
  dispatch(intentField, 'input')
  dispatch(document.querySelector('[data-yolen-seller-message-action="generate"]'), 'click')

  await waitFor(() => /não há uma mensagem/i.test(document.querySelector('.yolen-message-status')?.textContent || ''))
  assert.equal(document.querySelector('.yolen-message-result-card'), null)
  assert.equal(document.querySelector('.yolen-message-actions'), null)
})

test('10) error usa um status compacto com contraste de erro, sem card de resultado', async () => {
  const { document } = await loadAndOpenMessage({
    messageGenerationResult: { status: 'error', message: null, error: 'Falha simulada de teste.' },
  })

  const intentField = document.querySelector('[data-yolen-seller-message-intent]')
  intentField.value = 'Tentar gerar'
  dispatch(intentField, 'input')
  dispatch(document.querySelector('[data-yolen-seller-message-action="generate"]'), 'click')

  await waitFor(() => document.querySelector('.yolen-message-status--error'))
  assert.match(document.querySelector('.yolen-message-status--error').textContent, /Falha simulada de teste\./)
  assert.equal(document.querySelector('.yolen-message-result-card'), null)
})

test('7) loading preserva o box do composer (mesmo node) e o CTA continua com a mesma classe/estrutura', async () => {
  // O box ([data-yolen-seller-message-box]) é criado uma única vez e
  // reaproveitado — só seu innerHTML é substituído a cada renderização
  // significativa (o mesmo padrão de content-script.js para regiões).
  // Os elementos DENTRO dele (card do objetivo, botão) são recriados
  // junto com o innerHTML, então a garantia de estabilidade aqui é: o
  // BOX não muda de identidade, o shell nunca é tocado, e o CTA
  // reaparece com a mesma classe (nunca com layout diferente) em
  // qualquer estado.
  let resolveGeneration
  const { document } = await loadAndOpenMessage({
    messageGenerationResult: () => new Promise((resolve) => { resolveGeneration = resolve }),
  })

  const boxBefore = document.querySelector('[data-yolen-seller-message-box]')
  const shellBefore = getShellFingerprint(document)

  const intentField = document.querySelector('[data-yolen-seller-message-intent]')
  intentField.value = 'Responder sobre preço'
  dispatch(intentField, 'input')
  dispatch(document.querySelector('[data-yolen-seller-message-action="generate"]'), 'click')

  await waitFor(() => document.querySelector('.yolen-message-status')?.textContent.includes('Gerando mensagem'))

  assert.equal(document.querySelector('[data-yolen-seller-message-box]'), boxBefore)
  assert.equal(
    document.querySelector('[data-yolen-seller-message-action="generate"]').className,
    'yolen-primary-button yolen-message-generate',
  )
  assert.ok(document.querySelector('.yolen-message-spinner'))

  const shellDuringLoading = getShellFingerprint(document)
  assert.deepEqual(shellDuringLoading, shellBefore)

  resolveGeneration({ status: 'ready', message: 'Pronto.', error: null })
  await waitFor(() => document.querySelector('.yolen-message-result-card'))

  assert.equal(document.querySelector('[data-yolen-seller-message-box]'), boxBefore)
  assert.equal(
    document.querySelector('[data-yolen-seller-message-action="generate"]').className,
    'yolen-primary-button yolen-message-generate',
  )
  assert.deepEqual(getShellFingerprint(document), shellBefore)
})

test('12) mensagem gerada muito longa não altera a geometria do shell (header/tabs/footer/workspace-body)', async () => {
  const longMessage = 'Parágrafo longo sobre o plano e condições comerciais. '.repeat(60)

  const { document } = await loadAndOpenMessage({
    messageGenerationResult: { status: 'ready', message: longMessage, error: null },
  })

  const fingerprintBefore = getShellFingerprint(document)

  const intentField = document.querySelector('[data-yolen-seller-message-intent]')
  intentField.value = 'Responder com todos os detalhes do plano'
  dispatch(intentField, 'input')
  dispatch(document.querySelector('[data-yolen-seller-message-action="generate"]'), 'click')

  await waitFor(() => document.querySelector('.yolen-message-result-text')?.textContent === longMessage.trim())

  const fingerprintAfter = getShellFingerprint(document)

  assert.equal(fingerprintAfter.childCount, fingerprintBefore.childCount)
  assert.equal(fingerprintAfter.headerRegion, fingerprintBefore.headerRegion)
  assert.equal(fingerprintAfter.tabsRegion, fingerprintBefore.tabsRegion)
  assert.equal(fingerprintAfter.footerRegion, fingerprintBefore.footerRegion)
  assert.equal(fingerprintAfter.workspaceBody, fingerprintBefore.workspaceBody)

  // Tabs continuam todas presentes e a MENSAGEM continua a aba ativa.
  assert.equal(document.querySelectorAll('[role="tab"]').length, 4)
  assert.equal(
    document.querySelector('[data-yolen-seller-panel="message"]')?.hasAttribute('hidden'),
    false,
  )
})

test('13) intenção do vendedor muito longa não altera a geometria do shell nem do textarea', async () => {
  const { document } = await loadAndOpenMessage()

  const fingerprintBefore = getShellFingerprint(document)
  const intentField = document.querySelector('[data-yolen-seller-message-intent]')
  const heightBefore = intentField.getAttribute('class')

  const longIntent = 'Quero explicar em detalhes o que o cliente perguntou sobre o plano e as condições. '.repeat(10).slice(0, 999)
  intentField.value = longIntent
  dispatch(intentField, 'input')
  await sleep(10)

  assert.equal(document.querySelector('[data-yolen-seller-message-intent]'), intentField, 'a textarea não pode ter sido recriada')
  assert.equal(intentField.getAttribute('class'), heightBefore)
  assert.equal(
    document.querySelector('[data-yolen-seller-message-counter]')?.textContent,
    `${longIntent.length} / 1000`,
  )

  const fingerprintAfter = getShellFingerprint(document)
  assert.deepEqual(
    { ...fingerprintAfter, workspaceBody: null },
    { ...fingerprintBefore, workspaceBody: null },
  )
  assert.equal(fingerprintAfter.workspaceBody, fingerprintBefore.workspaceBody)
})

test('11) feedback (ex.: mensagem copiada) não recria o box nem o card do objetivo', async () => {
  const { document, window } = await loadAndOpenMessage({
    messageGenerationResult: { status: 'ready', message: 'Mensagem de teste.', error: null },
  })

  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: { async writeText() {} },
  })

  const intentField = document.querySelector('[data-yolen-seller-message-intent]')
  intentField.value = 'Responder sobre preço'
  dispatch(intentField, 'input')
  dispatch(document.querySelector('[data-yolen-seller-message-action="generate"]'), 'click')
  await waitFor(() => document.querySelector('.yolen-message-result-card'))

  const boxBefore = document.querySelector('[data-yolen-seller-message-box]')
  const shellBefore = getShellFingerprint(document)

  dispatch(document.querySelector('[data-yolen-seller-message-action="copy"]'), 'click')
  await waitFor(() => document.querySelector('.yolen-message-feedback')?.textContent.includes('copiada'))

  // O box do composer não é desmontado/remontado por causa de um
  // feedback (o mesmo node é reaproveitado, só o innerHTML muda), e o
  // shell (fora do mount) não é tocado de jeito nenhum.
  assert.equal(document.querySelector('[data-yolen-seller-message-box]'), boxBefore)
  assert.deepEqual(getShellFingerprint(document), shellBefore)
})
