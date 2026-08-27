import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [
  contentScript,
  manifestText,
  background,
  connectPage,
  buildPackage,
] = await Promise.all([
  readFile('app/extension/yolen-companion/src/content-script.js', 'utf8'),
  readFile('app/extension/yolen-companion/manifest.json', 'utf8'),
  readFile('app/extension/yolen-companion/src/background.js', 'utf8'),
  readFile('app/companion/connect/page.tsx', 'utf8'),
  readFile('app/extension/yolen-companion/scripts/build-package.mjs', 'utf8'),
])

const manifest = JSON.parse(manifestText)
const preview =
  'https://cockpit-comercial-vocn-git-chatgpt-companion-ux-fi-09f56e-yolen.vercel.app'

test('seller workspace usa somente funções estáveis da baseline', () => {
  assert.match(
    contentScript,
    /function getSellerInformationArchitectureHtml\(\)[\s\S]*getAnalysisCardHtml\(\)[\s\S]*getCompanionLeadSummaryCardHtml\(\)/,
  )
  assert.match(
    contentScript,
    /activeSellerArea === 'analysis'[\s\S]*getDetailedAnalysisAreaHtml\(\)/,
  )
  assert.match(
    contentScript,
    /activeSellerArea === 'client'[\s\S]*getClientInformationAreaHtml\(\)/,
  )
  assert.doesNotMatch(contentScript, /getNowPrimaryWorkspaceHtml/)
  assert.doesNotMatch(contentScript, /const readingIsCurrent/)
})

test('cards legados saem do fluxo principal e ficam dentro das áreas', () => {
  const start = contentScript.indexOf('function renderPanel()')
  const end = contentScript.indexOf('function escapeHtml', start)
  const renderBlock = contentScript.slice(start, end)

  assert.doesNotMatch(renderBlock, /'registration-card'/)
  assert.doesNotMatch(renderBlock, /'lead-enrichment'/)
  assert.doesNotMatch(renderBlock, /'pre-send-assessment'/)
  assert.doesNotMatch(renderBlock, /'lead-summary-card'/)
  assert.match(renderBlock, /'seller-information-architecture'/)
})

test('preview de UX tem autoridade completa no pacote dev', () => {
  const host = preview + '/*'

  assert.ok(manifest.host_permissions.includes(host))

  const bridge = manifest.content_scripts.find((block) =>
    block.js?.includes('src/yolen-bridge.js'),
  )
  assert.ok(bridge?.matches?.includes(host))

  const pageBridge = manifest.web_accessible_resources.find((block) =>
    block.resources?.includes('src/yolen-page-bridge.js'),
  )
  assert.ok(pageBridge?.matches?.includes(host))

  assert.match(background, new RegExp(preview.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&')))
  assert.match(connectPage, new RegExp(preview.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&')))
})

test('preview continua sendo removido dos pacotes de produção', () => {
  assert.match(
    buildPackage,
    /DEV_HOST_PATTERN = \/localhost\|cockpit-comercial-vocn-git-\/i/,
  )
})
