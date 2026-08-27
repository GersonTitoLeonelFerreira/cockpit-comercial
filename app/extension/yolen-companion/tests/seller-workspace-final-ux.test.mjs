import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [contentScript, sellerRuntime, styles] = await Promise.all([
  readFile('app/extension/yolen-companion/src/content-script.js', 'utf8'),
  readFile('app/extension/yolen-companion/src/seller-message-runtime.js', 'utf8'),
  readFile('app/extension/yolen-companion/src/styles.css', 'utf8'),
])

test('AGORA / ANÁLISE / CLIENTE são a superfície primária e lazy', () => {
  assert.match(contentScript, /function getActiveSellerAreaContentHtml\(\)/)
  assert.match(
    contentScript,
    /activeSellerArea === 'analysis'[\s\S]*?getDetailedAnalysisAreaHtml\(\)[\s\S]*?activeSellerArea === 'client'[\s\S]*?getClientInformationAreaHtml\(\)/,
  )
  assert.doesNotMatch(
    contentScript,
    /getSellerAreaPanelHtml\(\s*'now'[\s\S]*getSellerAreaPanelHtml\(\s*'analysis'[\s\S]*getSellerAreaPanelHtml\(\s*'client'/,
  )
})

test('cards legados não ocupam mais o fluxo principal', () => {
  const renderStart = contentScript.indexOf('function renderPanel()')
  const renderEnd = contentScript.indexOf('function escapeHtml', renderStart)
  const renderBlock = contentScript.slice(renderStart, renderEnd)

  assert.doesNotMatch(renderBlock, /'registration-card'/)
  assert.doesNotMatch(renderBlock, /'lead-enrichment'/)
  assert.doesNotMatch(renderBlock, /'pre-send-assessment'/)
  assert.doesNotMatch(renderBlock, /'lead-summary-card'/)
  assert.match(renderBlock, /'seller-information-architecture'/)
})

test('composer seller-facing monta explicitamente dentro de AGORA', () => {
  assert.match(contentScript, /data-yolen-seller-message-mount/)
  assert.match(sellerRuntime, /\[data-yolen-seller-message-mount\]/)
  assert.match(sellerRuntime, /dedicatedMount\.appendChild\(box\)/)
})

test('ferramentas históricas ficam em CLIENTE e não somem do produto', () => {
  assert.match(
    contentScript,
    /function getClientOperationalToolsHtml\(\)[\s\S]*getLeadEnrichmentCandidatesHtml\(\)[\s\S]*getConversationRegistrationCardHtml\(\)[\s\S]*getLeadMemoryUtilityHtml\(\)/,
  )
})

test('shell final possui barra compacta e navegação sticky', () => {
  assert.match(styles, /\.yolen-context-bar/)
  assert.match(styles, /\.yolen-seller-tabs\s*\{[\s\S]*position:\s*sticky/)
  assert.match(styles, /\.yolen-now-hero/)
})
