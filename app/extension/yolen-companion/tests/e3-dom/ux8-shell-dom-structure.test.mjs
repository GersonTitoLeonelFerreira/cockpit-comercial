// Teste de DOM real (jsdom + node:vm) do shell estrutural da UX8 (FASE B):
// header, cartão de contato, barra de abas, pre-send-assessment e rodapé
// precisam existir como irmãos do container rolável (.yolen-workspace-body),
// nunca dentro dele — só o conteúdo das abas (região
// 'seller-information-architecture') mora lá dentro. Ver
// tests/ux8-shell-structure.test.mjs para a prova via texto-fonte
// (CSS/JS); aqui provamos a árvore real que o navegador (e o vendedor)
// efetivamente vê.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMessageHtml,
  buildWhatsAppPageHtml,
  defaultLeadSummary,
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

function getPanel(document) {
  return document.getElementById('yolen-companion-panel')
}

function getFixedRegionKeys() {
  return [
    'header',
    'contact-card',
    'pre-send-assessment',
    'seller-area-tabs',
    'footer',
  ]
}

test('shell UX8: header/contato/abas/pre-send-assessment/rodapé ficam fora do workspace-body; só o conteúdo das abas mora dentro', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    leadSummaryResult: defaultLeadSummary({
      data: { summary: { summary: 'Resumo inicial salvo.', version: 1, updated_at: '2026-08-25T12:00:00.000Z' } },
    }),
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('[data-yolen-seller-area="analysis"]')))

  const panel = getPanel(document)
  assert.ok(panel)
  assert.equal(panel.getAttribute('data-yolen-ux-build'), 'UX8')

  const workspaceBody = panel.querySelector('[data-yolen-workspace-body]')
  assert.ok(workspaceBody, 'workspace-body precisa existir')

  for (const regionKey of getFixedRegionKeys()) {
    const region = panel.querySelector(`[data-yolen-region="${regionKey}"]`)
    assert.ok(region, `região "${regionKey}" precisa existir`)
    assert.equal(
      region.closest('[data-yolen-workspace-body]'),
      null,
      `região "${regionKey}" não pode estar dentro do workspace-body`,
    )
  }

  const architectureRegion = panel.querySelector(
    '[data-yolen-region="seller-information-architecture"]',
  )
  assert.ok(architectureRegion)
  assert.equal(
    architectureRegion.closest('[data-yolen-workspace-body]'),
    workspaceBody,
    'o conteúdo das abas precisa estar dentro do workspace-body',
  )

  // As três abas (tablist) continuam clicáveis fora do workspace-body.
  const tabsRegion = panel.querySelector('[data-yolen-region="seller-area-tabs"]')
  assert.ok(tabsRegion.querySelector('[data-yolen-seller-area="now"]'))
  assert.ok(tabsRegion.querySelector('[data-yolen-seller-area="analysis"]'))
  assert.ok(tabsRegion.querySelector('[data-yolen-seller-area="client"]'))
})

test('shell UX8: ordem no DOM é header, contato, pre-send-assessment, abas, workspace-body, rodapé', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('[data-yolen-seller-area="analysis"]')))

  const panel = getPanel(document)
  const children = Array.from(panel.children)

  const indexOfRegion = (regionKey) =>
    children.findIndex((child) => child.getAttribute('data-yolen-region') === regionKey)
  const indexOfWorkspaceBody = children.findIndex((child) =>
    child.hasAttribute('data-yolen-workspace-body'),
  )

  const headerIndex = indexOfRegion('header')
  const contactIndex = indexOfRegion('contact-card')
  const preSendIndex = indexOfRegion('pre-send-assessment')
  const tabsIndex = indexOfRegion('seller-area-tabs')
  const footerIndex = indexOfRegion('footer')

  for (const index of [headerIndex, contactIndex, preSendIndex, tabsIndex, indexOfWorkspaceBody, footerIndex]) {
    assert.notEqual(index, -1)
  }

  assert.ok(headerIndex < contactIndex)
  assert.ok(contactIndex < preSendIndex)
  assert.ok(preSendIndex < tabsIndex)
  assert.ok(tabsIndex < indexOfWorkspaceBody)
  assert.ok(indexOfWorkspaceBody < footerIndex)

  // O shell tem exatamente 6 regiões top-level — nenhuma outra região
  // "solta" foi criada como filha direta do painel.
  assert.equal(children.length, 6)
})

test('conteúdo grande dentro do workspace-body não cria/realoca regiões do shell (header/abas/rodapé continuam os mesmos nós)', async () => {
  const longSummary = 'Resumo muito longo da conversa. '.repeat(120)

  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    leadSummaryResult: defaultLeadSummary({
      data: { summary: { summary: longSummary, version: 1, updated_at: '2026-08-25T12:00:00.000Z' } },
    }),
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('.yolen-lead-summary-card')))

  const panel = getPanel(document)
  const childCountBefore = panel.children.length
  const headerBefore = panel.querySelector('[data-yolen-region="header"]')
  const tabsBefore = panel.querySelector('[data-yolen-region="seller-area-tabs"]')
  const footerBefore = panel.querySelector('[data-yolen-region="footer"]')
  const workspaceBodyBefore = panel.querySelector('[data-yolen-workspace-body]')

  // Um conteúdo bem maior ainda que o já longo resumo inicial (troca de
  // aba para ANÁLISE/CLIENTE também engorda o corpo da aba ativa) não
  // pode alterar a árvore de regiões fixas do shell.
  document.querySelector('[data-yolen-seller-area="client"]')?.dispatchEvent(
    new document.defaultView.Event('click', { bubbles: true, cancelable: true }),
  )
  await waitFor(() => document.querySelector('[data-yolen-seller-panel="client"]')?.hasAttribute('hidden') === false)

  assert.equal(panel.children.length, childCountBefore)
  assert.equal(panel.querySelector('[data-yolen-region="header"]'), headerBefore)
  assert.equal(panel.querySelector('[data-yolen-region="seller-area-tabs"]'), tabsBefore)
  assert.equal(panel.querySelector('[data-yolen-region="footer"]'), footerBefore)
  assert.equal(panel.querySelector('[data-yolen-workspace-body]'), workspaceBodyBefore)
})
