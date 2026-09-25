// UX8 FASE C: quarta aba MENSAGEM. Antes desta fase existiam 3 áreas
// (Agora/Análise/Cliente) e o composer seller-facing nascia dentro de
// AGORA (mount emitido por companion-lead-summary-view.js). Esta fase
// retira o composer estruturalmente de AGORA e cria a área própria
// 'message', usando a mesma fonte canônica de áreas para tabs e
// navegação por teclado. Prova via texto-fonte; a prova via DOM real
// (comportamento, isolamento A→B, geração) está em
// tests/e3-dom/ux8-message-tab-dom.test.mjs.

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { readWhatsAppCompositionSource } from './support/whatsapp-composition-source.mjs'

const [contentScript, summaryView, workspaceRuntimeSource] = await Promise.all([
  Promise.resolve(readWhatsAppCompositionSource()),
  readFile('app/extension/yolen-companion/src/companion-lead-summary-view.js', 'utf8'),
  readFile('app/extension/yolen-companion/src/companion-workspace-runtime.js', 'utf8'),
])

test('content-script consome a autoridade canônica das áreas seller-facing sem manter lista própria', () => {
  assert.doesNotMatch(
    contentScript,
    /\bconst SELLER_AREAS\s*=/,
  )

  assert.doesNotMatch(
    contentScript,
    /\bactiveSellerArea\b/,
  )

  assert.match(
    contentScript,
    /workspaceRuntime\.createSellerWorkspaceState\(\)/,
  )

  const setActiveStart = contentScript.indexOf(
    'function setActiveSellerArea(',
  )
  const setActiveEnd = contentScript.indexOf(
    'function handleSellerAreaKeyboard(',
    setActiveStart,
  )
  const setActiveBlock = contentScript.slice(
    setActiveStart,
    setActiveEnd,
  )

  assert.notEqual(setActiveStart, -1)

  assert.match(
    setActiveBlock,
    /workspaceState\.setActiveArea\(\s*nextArea,?\s*\)/,
  )

  assert.doesNotMatch(
    setActiveBlock,
    /\bSELLER_AREAS\b/,
  )

  const keyboardStart = contentScript.indexOf(
    'function handleSellerAreaKeyboard(',
  )
  const keyboardEnd = contentScript.indexOf(
    'function getLeadEnrichmentAddressValue(',
    keyboardStart,
  )
  const keyboardBlock = contentScript.slice(
    keyboardStart,
    keyboardEnd,
  )

  assert.notEqual(keyboardStart, -1)

  assert.match(
    keyboardBlock,
    /workspaceRuntime\.getNextSellerAreaForKeydown\(\s*currentArea,\s*event\.key,?\s*\)/,
  )

  assert.doesNotMatch(
    keyboardBlock,
    /\bSELLER_AREAS\b/,
  )
})

test('a tablist é delegada à autoridade canônica do workspace runtime', () => {
  const start = contentScript.indexOf(
    'function renderPanel()',
  )
  const end = contentScript.indexOf(
    'function escapeHtml',
    start,
  )
  const block = contentScript.slice(
    start,
    end,
  )

  assert.notEqual(start, -1)

  assert.match(
    block,
    /workspaceRuntime\s*\.getSellerAreaTabsBarHtml\(\s*workspaceState\s*\.getActiveArea\(\),?\s*\)/,
  )

  assert.doesNotMatch(
    contentScript,
    /function getSellerAreaTabsBarHtml\(/,
  )

  assert.doesNotMatch(
    contentScript,
    /function getSellerAreaTabHtml\(/,
  )
})

test('a composição dos quatro tabpanels pertence ao workspace canônico', () => {
  const start = contentScript.indexOf(
    'function getSellerInformationArchitectureHtml()',
  )
  const end = contentScript.indexOf(
    'function setActiveSellerArea',
    start,
  )
  const block = contentScript.slice(start, end)

  assert.notEqual(start, -1)
  assert.match(
    block,
    /const messageHtml =\s*getSellerMessageAreaHtml\(\)/,
  )
  assert.match(
    block,
    /workspaceRuntime\.getSellerWorkspaceHtml\(\{/,
  )

  assert.doesNotMatch(
    block,
    /workspaceRuntime\.getSellerAreaPanelHtml\(/,
  )

  const nowPanelIndex =
    workspaceRuntimeSource.indexOf(
      "getSellerAreaPanelHtml('now'",
    )
  const messagePanelIndex =
    workspaceRuntimeSource.indexOf(
      "getSellerAreaPanelHtml('message'",
    )
  const analysisPanelIndex =
    workspaceRuntimeSource.indexOf(
      "getSellerAreaPanelHtml('analysis'",
    )
  const clientPanelIndex =
    workspaceRuntimeSource.indexOf(
      "getSellerAreaPanelHtml('client'",
    )

  for (const index of [
    nowPanelIndex,
    messagePanelIndex,
    analysisPanelIndex,
    clientPanelIndex,
  ]) {
    assert.notEqual(index, -1)
  }

  assert.ok(nowPanelIndex < messagePanelIndex)
  assert.ok(messagePanelIndex < analysisPanelIndex)
  assert.ok(analysisPanelIndex < clientPanelIndex)
})

test('existe exatamente um mount seller-facing em todo o content-script.js, dentro de getSellerMessageAreaHtml()', () => {
  // FASE 5: a composição inclui o controller de MENSAGEM do Core, que
  // localiza o mount ([data-yolen-seller-message-mount]) para montar o
  // composer; a declaração do mount no HTML continua sendo única.
  const allMountOccurrences = contentScript.match(
    /<[^<>]*\bdata-yolen-seller-message-mount\b[^<>]*>/g,
  )

  assert.equal(
    allMountOccurrences?.length,
    1,
    'content-script.js só pode declarar o mount uma única vez',
  )

  const messageAreaStart = contentScript.indexOf(
    'function getSellerMessageAreaHtml()',
  )
  const messageAreaEnd = contentScript.indexOf(
    'function getSellerInformationArchitectureHtml()',
    messageAreaStart,
  )
  const messageAreaBlock = contentScript.slice(
    messageAreaStart,
    messageAreaEnd,
  )

  assert.match(
    messageAreaBlock,
    /data-yolen-seller-message-mount/,
  )
})

test('companion-lead-summary-view.js (AGORA) não emite mais o mount do composer, mas continua expondo o working summary', () => {
  assert.doesNotMatch(
    summaryView,
    /data-yolen-seller-message-mount/,
  )
  assert.match(
    summaryView,
    /data-yolen-textarea="lead-summary"/,
  )
})

test('AGORA (now) não referencia o mount do composer em nenhum lugar do seu próprio bloco de composição', () => {
  const architectureStart = contentScript.indexOf(
    'function getSellerInformationArchitectureHtml()',
  )
  const nowHtmlStart = contentScript.indexOf(
    'const nowHtml =',
    architectureStart,
  )
  const nowHtmlEnd = contentScript.indexOf(
    'const messageHtml =',
    nowHtmlStart,
  )
  const nowHtmlBlock = contentScript.slice(
    nowHtmlStart,
    nowHtmlEnd,
  )

  assert.notEqual(nowHtmlStart, -1)
  assert.doesNotMatch(
    nowHtmlBlock,
    /data-yolen-seller-message-mount/,
  )
})

test('pre-send-assessment permanece como região estrutural própria, sem mudança semântica nesta fase', () => {
  // Mesma função, mesmo nome de região, mesma posição relativa (antes da
  // barra de abas) — FASE C não é autorizada a mover ou alterar o
  // conteúdo/gate de pre-send-assessment.
  assert.match(
    contentScript,
    /function getPreSendAssessmentCardHtml\(\)/,
  )

  const renderStart = contentScript.indexOf('function renderPanel()')
  const renderEnd = contentScript.indexOf('function escapeHtml', renderStart)
  const renderBlock = contentScript.slice(renderStart, renderEnd)

  const preSendIndex = renderBlock.indexOf("'pre-send-assessment'")
  const tabsIndex = renderBlock.indexOf("'seller-area-tabs'")
  const architectureIndex = renderBlock.indexOf(
    "'seller-information-architecture'",
  )

  assert.notEqual(preSendIndex, -1)
  assert.notEqual(tabsIndex, -1)
  assert.notEqual(architectureIndex, -1)
  assert.ok(preSendIndex < tabsIndex)
  assert.ok(tabsIndex < architectureIndex)

  // pre-send-assessment não é roteado para dentro do workspace-body (a
  // mesma regra do shell da FASE B continua valendo).
  const workspaceBodyKeysStart = contentScript.indexOf(
    'WORKSPACE_BODY_REGION_KEYS =',
  )
  const workspaceBodyKeysEnd = contentScript.indexOf(
    ')',
    workspaceBodyKeysStart,
  )
  const workspaceBodyKeysBlock = contentScript.slice(
    workspaceBodyKeysStart,
    workspaceBodyKeysEnd,
  )

  assert.doesNotMatch(
    workspaceBodyKeysBlock,
    /'pre-send-assessment'/,
  )
})
