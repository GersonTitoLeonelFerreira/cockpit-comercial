// FASE B da UX8 (workspace estável): o painel deixa de ser, ele mesmo, o
// container de scroll. Header, cartão de contato, barra de abas,
// pre-send-assessment e rodapé passam a ser regiões de tamanho fixo
// (flex: 0 0 auto); só .yolen-workspace-body (onde mora a região
// 'seller-information-architecture', com o conteúdo das abas Agora/
// Análise/Cliente) rola. Este arquivo prova a fundação estrutural via
// texto-fonte (CSS + content-script.js); a asserção via DOM real
// (nesting/ordem, "grande conteúdo não deforma o shell") está em
// tests/e3-dom/ux8-shell-dom-structure.test.mjs.

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [contentScript, styles] = await Promise.all([
  readFile('app/extension/yolen-companion/src/content-script.js', 'utf8'),
  readFile('app/extension/yolen-companion/src/styles.css', 'utf8'),
])

function cssBlock(source, selectorLine) {
  const start = source.indexOf(selectorLine)
  const end = source.indexOf('}', start)
  return { start, block: source.slice(start, end) }
}

test('painel externo (#yolen-companion-panel) é flex column e não é mais o container de scroll', () => {
  const { start, block } = cssBlock(styles, '#yolen-companion-panel {')

  assert.notEqual(start, -1)
  assert.match(block, /display:\s*flex/)
  assert.match(block, /flex-direction:\s*column/)
  assert.match(block, /overflow:\s*hidden/)
  assert.doesNotMatch(block, /overflow-y:\s*auto/)
  // painel continua desativando scroll anchoring — não é a única mudança
  // permitida a rodar por cima deste bloco (teste já existente em
  // seller-workspace-final-ux.test.mjs cobre isso também).
  assert.match(block, /overflow-anchor:\s*none/)
})

test('workspace-body é a única região seller-facing rolável', () => {
  const { start, block } = cssBlock(styles, '.yolen-workspace-body {')

  assert.notEqual(start, -1)
  assert.match(block, /flex:\s*1 1 auto/)
  assert.match(block, /min-height:\s*0/)
  assert.match(block, /overflow-y:\s*auto/)
})

test('header, contato, barra de abas, pre-send-assessment e rodapé são regiões fixas (flex: 0 0 auto)', () => {
  const { start, block } = cssBlock(
    styles,
    '.yolen-region-header,',
  )

  assert.notEqual(start, -1)
  assert.match(block, /\.yolen-region-header/)
  assert.match(block, /\.yolen-region-contact-card/)
  assert.match(block, /\.yolen-region-pre-send-assessment/)
  assert.match(block, /\.yolen-region-seller-area-tabs/)
  assert.match(block, /\.yolen-region-footer/)
  assert.match(block, /flex:\s*0 0 auto/)
})

test('a barra de abas na sua nova região não depende de position: sticky', () => {
  const { start, block } = cssBlock(
    styles,
    '.yolen-region-seller-area-tabs .yolen-seller-tabs {',
  )

  assert.notEqual(start, -1)
  assert.match(block, /position:\s*static/)
  assert.doesNotMatch(block, /position:\s*sticky/)
})

test('createPanel() identifica o shell como UX8', () => {
  const start = contentScript.indexOf('function createPanel()')
  const end = contentScript.indexOf('function ', start + 1)
  const block = contentScript.slice(start, end)

  assert.notEqual(start, -1)
  assert.match(
    block,
    /panel\.setAttribute\(\s*'data-yolen-ux-build',\s*'UX8',?\s*\)/,
  )
})

test('a região seller-information-architecture (conteúdo das abas) é a única roteada para dentro do workspace-body', () => {
  const start = contentScript.indexOf('function getPanelRegionContainer(')
  const end = contentScript.indexOf('function applyPanelRegionHtml(', start)
  const block = contentScript.slice(start, end)

  assert.notEqual(start, -1)
  assert.match(
    block,
    /WORKSPACE_BODY_REGION_KEYS\.has\(\s*regionKey,?\s*\)/,
  )

  const setStart = contentScript.indexOf('WORKSPACE_BODY_REGION_KEYS =')
  const setEnd = contentScript.indexOf(')', setStart)
  const setBlock = contentScript.slice(setStart, setEnd)

  assert.match(setBlock, /'seller-information-architecture'/)
  // Nenhuma outra região top-level pode ser desviada para dentro do
  // workspace-body nesta fase — header/contato/abas/pre-send/rodapé
  // continuam fora do scroll.
  assert.doesNotMatch(setBlock, /'header'/)
  assert.doesNotMatch(setBlock, /'contact-card'/)
  assert.doesNotMatch(setBlock, /'pre-send-assessment'/)
  assert.doesNotMatch(setBlock, /'seller-area-tabs'/)
  assert.doesNotMatch(setBlock, /'footer'/)
})

test('renderPanel() renderiza a barra de abas como região própria, antes do conteúdo das abas, sem tocar pre-send-assessment', () => {
  const start = contentScript.indexOf('function renderPanel()')
  const end = contentScript.indexOf('function escapeHtml', start)
  const render = contentScript.slice(start, end)

  assert.notEqual(start, -1)

  const preSendIndex = render.indexOf("'pre-send-assessment'")
  const tabsIndex = render.indexOf("'seller-area-tabs'")
  const architectureIndex = render.indexOf(
    "'seller-information-architecture'",
  )
  const footerIndex = render.indexOf("'footer'")

  assert.notEqual(preSendIndex, -1)
  assert.notEqual(tabsIndex, -1)
  assert.notEqual(architectureIndex, -1)
  assert.notEqual(footerIndex, -1)

  // Ordem de renderização = ordem de inserção no DOM na primeira vez que
  // cada região é criada (getPanelRegionContainer faz appendChild na
  // ordem de chamada) — pre-send-assessment antes das abas, abas antes do
  // conteúdo das abas, conteúdo das abas antes do rodapé.
  assert.ok(preSendIndex < tabsIndex)
  assert.ok(tabsIndex < architectureIndex)
  assert.ok(architectureIndex < footerIndex)

  // getPreSendAssessmentCardHtml() continua sendo chamada exatamente como
  // antes — nenhuma mudança de gate/condição/ação nesta fase.
  assert.match(render, /getPreSendAssessmentCardHtml\(\)/)
})

test('a barra de abas é extraída para sua própria função, sem duplicar a composição now/analysis/client', () => {
  const start = contentScript.indexOf('function getSellerAreaTabsBarHtml()')
  const end = contentScript.indexOf(
    'function getSellerInformationArchitectureHtml()',
    start,
  )
  const block = contentScript.slice(start, end)

  assert.notEqual(start, -1)
  assert.match(block, /role="tablist"/)
  assert.match(block, /getSellerAreaTabHtml\('now', 'Agora'\)/)
  assert.match(block, /getSellerAreaTabHtml\('analysis', 'Análise'\)/)
  assert.match(block, /getSellerAreaTabHtml\('client', 'Cliente'\)/)

  const architectureStart = contentScript.indexOf(
    'function getSellerInformationArchitectureHtml()',
  )
  const architectureEnd = contentScript.indexOf(
    'function setActiveSellerArea',
    architectureStart,
  )
  const architectureBlock = contentScript.slice(
    architectureStart,
    architectureEnd,
  )

  // A composição now/analysis/client (contrato já coberto por
  // seller-workspace-final-ux.test.mjs) continua intacta; só a barra de
  // abas (role="tablist") saiu de dentro dela.
  assert.doesNotMatch(architectureBlock, /role="tablist"/)
  assert.match(
    architectureBlock,
    /const nowHtml =\s*getNowAttentionSnapshotHtml\(\)\s*\+\s*\(getCompanionLeadSummaryCardHtml\(\)/,
  )
})
