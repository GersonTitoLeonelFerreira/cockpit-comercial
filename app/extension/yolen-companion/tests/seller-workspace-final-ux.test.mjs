import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [contentScript, summaryView, sellerRuntime] = await Promise.all([
  readFile('app/extension/yolen-companion/src/content-script.js', 'utf8'),
  readFile('app/extension/yolen-companion/src/companion-lead-summary-view.js', 'utf8'),
  readFile('app/extension/yolen-companion/src/seller-message-runtime.js', 'utf8'),
])

test('UX7 dá responsabilidade única para AGORA ANÁLISE CLIENTE', () => {
  const start = contentScript.indexOf(
    'function getSellerInformationArchitectureHtml()',
  )
  const end = contentScript.indexOf(
    'function setActiveSellerArea',
    start,
  )
  const block = contentScript.slice(start, end)

  assert.match(block, /const nowHtml =\s*getCompanionLeadSummaryCardHtml\(\)/)
  assert.match(block, /const analysisHtml =\s*getDetailedAnalysisAreaHtml\(\)/)
  assert.match(block, /getClientInformationAreaHtml\(\)/)
  assert.match(block, /getConversationRegistrationCardHtml\(\)/)
  assert.match(block, /getLeadEnrichmentCandidatesHtml\(\)/)
  assert.doesNotMatch(block, /getAnalysisCardHtml\(\)/)
  assert.match(block, /data-yolen-ux-build="UX7"/)
})

test('AGORA não é escondido e possui composer contextual', () => {
  assert.doesNotMatch(
    summaryView,
    /yolen-seller-panel\[data-yolen-seller-panel="now"\]\{display:none!important;\}/,
  )
  assert.match(summaryView, /data-yolen-seller-message-mount/)
  assert.match(sellerRuntime, /\[data-yolen-seller-message-mount\]/)
})

test('resumo e utilidades deixam de competir como regiões top-level', () => {
  const start = contentScript.indexOf('function renderPanel()')
  const end = contentScript.indexOf('function escapeHtml', start)
  const render = contentScript.slice(start, end)

  assert.doesNotMatch(render, /'lead-summary-card'/)
  assert.doesNotMatch(render, /'registration-card'/)
  assert.doesNotMatch(render, /'lead-enrichment'/)
  assert.match(render, /'seller-information-architecture'/)
  assert.match(render, /'pre-send-assessment'/)
})
