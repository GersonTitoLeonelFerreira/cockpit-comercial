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

const [contentScript, summaryView] = await Promise.all([
  readFile('app/extension/yolen-companion/src/content-script.js', 'utf8'),
  readFile('app/extension/yolen-companion/src/companion-lead-summary-view.js', 'utf8'),
])

test('existe uma única fonte canônica das 4 áreas seller-facing, na ordem oficial', () => {
  const start = contentScript.indexOf('const SELLER_AREAS = [')
  const end = contentScript.indexOf(']', start)
  const block = contentScript.slice(start, end)

  assert.notEqual(start, -1)
  assert.match(
    block,
    /'now',\s*'message',\s*'analysis',\s*'client',/,
  )

  // setActiveSellerArea() e handleSellerAreaKeyboard() não podem manter
  // listas de áreas próprias e divergentes — ambas devem reaproveitar
  // SELLER_AREAS.
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

  assert.match(
    setActiveBlock,
    /SELLER_AREAS\.includes\(\s*nextArea,?\s*\)/,
  )
  assert.doesNotMatch(
    setActiveBlock,
    /const areas = \[/,
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
  assert.match(keyboardBlock, /SELLER_AREAS\.indexOf\(/)
  assert.match(keyboardBlock, /SELLER_AREAS\.length/)
  assert.match(keyboardBlock, /SELLER_AREAS\[nextIndex\]/)
  assert.doesNotMatch(keyboardBlock, /const areas = \[/)
})

test('a tablist renderiza exatamente 4 abas, na ordem Agora Mensagem Análise Cliente', () => {
  const start = contentScript.indexOf(
    'function getSellerAreaTabsBarHtml()',
  )
  const end = contentScript.indexOf(
    'function getSellerMessageAreaHtml()',
    start,
  )
  const block = contentScript.slice(start, end)

  assert.notEqual(start, -1)

  const nowIndex = block.indexOf(
    "getSellerAreaTabHtml('now', 'Agora')",
  )
  const messageIndex = block.indexOf(
    "getSellerAreaTabHtml('message', 'Mensagem')",
  )
  const analysisIndex = block.indexOf(
    "getSellerAreaTabHtml('analysis', 'Análise')",
  )
  const clientIndex = block.indexOf(
    "getSellerAreaTabHtml('client', 'Cliente')",
  )

  for (const index of [nowIndex, messageIndex, analysisIndex, clientIndex]) {
    assert.notEqual(index, -1)
  }

  assert.ok(nowIndex < messageIndex)
  assert.ok(messageIndex < analysisIndex)
  assert.ok(analysisIndex < clientIndex)

  // Exatamente 4 chamadas de getSellerAreaTabHtml nesta barra — nenhuma
  // 5ª aba solta, nenhuma duplicada.
  const calls = block.match(/getSellerAreaTabHtml\(/g)
  assert.equal(calls?.length, 4)
})

test('existe a superfície message (tabpanel próprio) dentro de getSellerInformationArchitectureHtml()', () => {
  const start = contentScript.indexOf(
    'function getSellerInformationArchitectureHtml()',
  )
  const end = contentScript.indexOf(
    'function setActiveSellerArea',
    start,
  )
  const block = contentScript.slice(start, end)

  assert.notEqual(start, -1)
  assert.match(block, /const messageHtml =\s*getSellerMessageAreaHtml\(\)/)

  const nowPanelIndex = block.indexOf("getSellerAreaPanelHtml(\n          'now',")
  const messagePanelIndex = block.indexOf("getSellerAreaPanelHtml(\n          'message',")
  const analysisPanelIndex = block.indexOf("getSellerAreaPanelHtml(\n          'analysis',")
  const clientPanelIndex = block.indexOf("getSellerAreaPanelHtml(\n          'client',")

  for (const index of [nowPanelIndex, messagePanelIndex, analysisPanelIndex, clientPanelIndex]) {
    assert.notEqual(index, -1)
  }

  assert.ok(nowPanelIndex < messagePanelIndex)
  assert.ok(messagePanelIndex < analysisPanelIndex)
  assert.ok(analysisPanelIndex < clientPanelIndex)
})

test('existe exatamente um mount seller-facing em todo o content-script.js, dentro de getSellerMessageAreaHtml()', () => {
  const allMountOccurrences = contentScript.match(
    /data-yolen-seller-message-mount/g,
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
