// UX8 FASE C: quarta aba MENSAGEM. Antes desta fase existiam 3 áreas
// (Agora/Análise/Cliente) e o composer seller-facing nascia dentro de
// AGORA (mount emitido por companion-lead-summary-view.js). Esta fase
// retira o composer estruturalmente de AGORA e cria a área própria
// 'message', usando a mesma fonte canônica de áreas para tabs e
// navegação por teclado. Prova via texto-fonte; a prova via DOM real
// (comportamento, isolamento A→B, geração) está em
// tests/e3-dom/ux8-message-tab-dom.test.mjs.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const require = createRequire(import.meta.url)
const workspaceRuntime = require('../src/companion-workspace-runtime.js')

const [contentScript, workspaceRuntimeSource, summaryView, sharedWorkspaceView] = await Promise.all([
  readFile('app/extension/yolen-companion/src/content-script.js', 'utf8'),
  readFile('app/extension/yolen-companion/src/companion-workspace-runtime.js', 'utf8'),
  readFile('app/extension/yolen-companion/src/companion-lead-summary-view.js', 'utf8'),
  readFile('app/extension/yolen-companion/src/companion-seller-workspace-view.js', 'utf8'),
])

// STEP 2B.5-A: SELLER_AREAS/setActiveSellerArea/handleSellerAreaKeyboard/
// getSellerAreaTabHtml/getSellerAreaPanelHtml/getSellerAreaTabsBarHtml
// foram extraídos para companion-workspace-runtime.js (fonte canônica
// única, platform-agnostic). content-script.js passou a ser CONSUMIDOR:
// nunca mantém sua própria lista de áreas nem uma segunda máquina de
// navegação — só chama workspaceRuntimeTools.
test('existe uma única fonte canônica das 4 áreas seller-facing, na ordem oficial — dentro de companion-workspace-runtime.js', () => {
  assert.deepEqual(workspaceRuntime.SELLER_AREAS, [
    'now',
    'message',
    'analysis',
    'client',
  ])

  const start = workspaceRuntimeSource.indexOf('const SELLER_AREAS = ')
  assert.notEqual(start, -1)

  // content-script.js nunca pode voltar a declarar sua própria lista.
  assert.doesNotMatch(contentScript, /const SELLER_AREAS = \[/)
  assert.doesNotMatch(contentScript, /const areas = \[/)

  // setActiveSellerArea() e handleSellerAreaKeyboard() não podem manter
  // listas de áreas próprias e divergentes — ambas devem delegar ao
  // workspace compartilhado.
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
    /workspaceRuntimeTools\.isValidSellerArea\(\s*nextArea,?\s*\)/,
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
    /workspaceRuntimeTools\.getNextSellerAreaForKeydown\(/,
  )
  assert.doesNotMatch(keyboardBlock, /SELLER_AREAS\.indexOf\(/)
  assert.doesNotMatch(keyboardBlock, /const areas = \[/)
})

test('a tablist renderiza exatamente 4 abas, na ordem Agora Mensagem Análise Cliente — execução real do módulo compartilhado', () => {
  const html = workspaceRuntime.getSellerAreaTabsBarHtml('now')

  const nowIndex = html.indexOf('data-yolen-seller-area="now"')
  const messageIndex = html.indexOf('data-yolen-seller-area="message"')
  const analysisIndex = html.indexOf('data-yolen-seller-area="analysis"')
  const clientIndex = html.indexOf('data-yolen-seller-area="client"')

  for (const index of [nowIndex, messageIndex, analysisIndex, clientIndex]) {
    assert.notEqual(index, -1)
  }

  assert.ok(nowIndex < messageIndex)
  assert.ok(messageIndex < analysisIndex)
  assert.ok(analysisIndex < clientIndex)

  assert.match(html, />\s*Agora\s*</)
  assert.match(html, />\s*Mensagem\s*</)
  assert.match(html, />\s*Análise\s*</)
  assert.match(html, />\s*Cliente\s*</)

  // Exatamente 4 abas — nenhuma 5ª aba solta, nenhuma duplicada.
  const calls = html.match(/role="tab"/g)
  assert.equal(calls?.length, 4)

  // content-script.js delega ao módulo compartilhado — nunca reimplementa
  // a barra de abas localmente.
  assert.match(
    contentScript,
    /workspaceRuntimeTools\.getSellerAreaTabsBarHtml\(\s*activeSellerArea,?\s*\)/,
  )
  assert.doesNotMatch(contentScript, /function getSellerAreaTabsBarHtml\(/)
  assert.doesNotMatch(contentScript, /function getSellerAreaTabHtml\(/)
})

test('existe a superfície message (tabpanel próprio) dentro de getSellerInformationArchitectureHtml(), delegando ao módulo compartilhado', () => {
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
  assert.doesNotMatch(block, /function getSellerAreaPanelHtml\(/)

  const nowPanelIndex = block.indexOf("workspaceRuntimeTools.getSellerAreaPanelHtml(\n          'now',")
  const messagePanelIndex = block.indexOf("workspaceRuntimeTools.getSellerAreaPanelHtml(\n          'message',")
  const analysisPanelIndex = block.indexOf("workspaceRuntimeTools.getSellerAreaPanelHtml(\n          'analysis',")
  const clientPanelIndex = block.indexOf("workspaceRuntimeTools.getSellerAreaPanelHtml(\n          'client',")

  for (const index of [nowPanelIndex, messagePanelIndex, analysisPanelIndex, clientPanelIndex]) {
    assert.notEqual(index, -1)
  }

  assert.ok(nowPanelIndex < messagePanelIndex)
  assert.ok(messagePanelIndex < analysisPanelIndex)
  assert.ok(analysisPanelIndex < clientPanelIndex)

  // Execução real: confirma que o módulo compartilhado marca exatamente a
  // área ativa como selecionada/visível, nunca mais de uma ao mesmo tempo.
  for (const area of workspaceRuntime.SELLER_AREAS) {
    const html = workspaceRuntime.getSellerAreaPanelHtml(area, '<p>x</p>', area)
    assert.doesNotMatch(html, /hidden/)
    const otherArea = workspaceRuntime.SELLER_AREAS.find((candidate) => candidate !== area)
    const hiddenHtml = workspaceRuntime.getSellerAreaPanelHtml(otherArea, '<p>x</p>', area)
    assert.match(hiddenHtml, /hidden/)
  }
})

test('existe exatamente um mount seller-facing em todo o Companion, dentro do renderer compartilhado', () => {
  // STEP 2B.5-D1: getSellerMessageAreaHtml() (content-script.js) delega ao
  // renderer compartilhado (companion-seller-workspace-view.js#renderMessageAreaHtml,
  // usado também pelo ManyChat) — nunca uma segunda declaração local do
  // mount em content-script.js.
  assert.equal(
    (contentScript.match(/data-yolen-seller-message-mount/g) ?? []).length,
    0,
    'content-script.js não declara mais o mount localmente — delega ao renderer compartilhado',
  )

  const allMountOccurrences = sharedWorkspaceView.match(
    /data-yolen-seller-message-mount/g,
  )

  assert.equal(
    allMountOccurrences?.length,
    1,
    'companion-seller-workspace-view.js só pode declarar o mount uma única vez',
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
    /sellerWorkspaceViewTools\.renderMessageAreaHtml/,
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
