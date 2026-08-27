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
