import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const contentScript = await readFile(
  'app/extension/yolen-companion/src/content-script.js',
  'utf8',
)

test('UX5 preserva os renderers originais de AGORA ANÁLISE CLIENTE', () => {
  const start = contentScript.indexOf(
    'function getSellerInformationArchitectureHtml()',
  )
  const end = contentScript.indexOf(
    'function setActiveSellerArea',
    start,
  )
  const block = contentScript.slice(start, end)

  assert.match(block, /getSellerAreaPanelHtml\(\s*'now',\s*getAnalysisCardHtml\(\)/)
  assert.match(block, /getSellerAreaPanelHtml\(\s*'analysis',\s*getDetailedAnalysisAreaHtml\(\)/)
  assert.match(block, /getSellerAreaPanelHtml\(\s*'client',\s*getClientInformationAreaHtml\(\)/)
  assert.match(block, /data-yolen-ux-build="UX5"/)
})

test('UX5 apenas roteia regiões auxiliares para a aba pertinente', () => {
  const start = contentScript.indexOf('function renderPanel()')
  const end = contentScript.indexOf('function escapeHtml', start)
  const render = contentScript.slice(start, end)

  assert.match(
    render,
    /'seller-information-architecture',[\s\S]*getSellerInformationArchitectureHtml\(\)/,
  )
  assert.match(
    render,
    /'lead-summary-card',[\s\S]*activeSellerArea === 'now'[\s\S]*getCompanionLeadSummaryCardHtml\(\)/,
  )
  assert.match(
    render,
    /'registration-card',[\s\S]*activeSellerArea === 'client'[\s\S]*getConversationRegistrationCardHtml\(\)/,
  )
})


test('UX5 possui mount dedicado e estável para o composer de mensagem', async () => {
  const [summaryView, sellerRuntime] = await Promise.all([
    readFile(
      'app/extension/yolen-companion/src/companion-lead-summary-view.js',
      'utf8',
    ),
    readFile(
      'app/extension/yolen-companion/src/seller-message-runtime.js',
      'utf8',
    ),
  ])

  assert.match(summaryView, /data-yolen-seller-message-mount/)
  assert.match(sellerRuntime, /\[data-yolen-seller-message-mount\]/)
  assert.match(sellerRuntime, /dedicatedMount\.appendChild\(box\)/)
})


test('UX6 reexibe o AGORA real e remove o hide legado', async () => {
  const [summaryView, content] = await Promise.all([
    readFile(
      'app/extension/yolen-companion/src/companion-lead-summary-view.js',
      'utf8',
    ),
    readFile(
      'app/extension/yolen-companion/src/content-script.js',
      'utf8',
    ),
  ])

  assert.doesNotMatch(
    summaryView,
    /yolen-seller-panel\[data-yolen-seller-panel="now"\]\{display:none!important;\}/,
  )
  assert.match(content, /data-yolen-ux-build="UX6"/)
  assert.doesNotMatch(
    content.slice(
      content.indexOf('function getRichCommercialReadingCardHtml'),
      content.indexOf('function getDetailedAnalysisAreaHtml'),
    ),
    /getSuggestedMessageHtml\(\)/,
  )
})
