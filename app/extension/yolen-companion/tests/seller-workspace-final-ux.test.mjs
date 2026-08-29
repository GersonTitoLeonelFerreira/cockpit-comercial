import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [contentScript, summaryView, sellerRuntime, styles] = await Promise.all([
  readFile('app/extension/yolen-companion/src/content-script.js', 'utf8'),
  readFile('app/extension/yolen-companion/src/companion-lead-summary-view.js', 'utf8'),
  readFile('app/extension/yolen-companion/src/seller-message-runtime.js', 'utf8'),
  readFile('app/extension/yolen-companion/src/styles.css', 'utf8'),
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

  assert.match(
    block,
    /const nowHtml =\s*getNowAttentionSnapshotHtml\(\)\s*\+\s*\(getCompanionLeadSummaryCardHtml\(\)/,
  )
  assert.match(block, /const analysisHtml =\s*getDetailedAnalysisAreaHtml\(\)/)
  assert.match(block, /getClientInformationAreaHtml\(\)/)
  assert.match(block, /getConversationRegistrationCardHtml\(\)/)
  assert.match(block, /getLeadEnrichmentCandidatesHtml\(\)/)
  assert.doesNotMatch(block, /getAnalysisCardHtml\(\)/)
  assert.match(block, /data-yolen-ux-build="UX7"/)
})

test('AGORA mostra no máximo um alerta relevante, sem duplicar o diagnóstico de ANÁLISE', () => {
  const attentionStart = contentScript.indexOf(
    'function getNowAttentionSnapshotHtml()',
  )
  const attentionEnd = contentScript.indexOf(
    'function getSellerInformationArchitectureHtml()',
    attentionStart,
  )
  const attentionBlock = contentScript.slice(attentionStart, attentionEnd)

  assert.notEqual(attentionStart, -1)
  assert.notEqual(attentionEnd, -1)
  assert.match(
    attentionBlock,
    /sellerInformationViewTools\.renderNowAttentionSnapshot\(/,
  )
  assert.doesNotMatch(
    attentionBlock,
    /renderAnalysisArea|getDetailedAnalysisAreaHtml/,
  )
})

test('AGORA só retém a incerteza informativa e nunca reutiliza decisão stale', () => {
  const start = contentScript.indexOf(
    'function getNowAttentionSnapshotHtml()',
  )
  const end = contentScript.indexOf(
    'function getSellerInformationArchitectureHtml()',
    start,
  )
  const block =
    contentScript.slice(start, end)

  assert.match(
    block,
    /state\.conversationAnalysisLoading/,
  )
  assert.match(
    block,
    /state\.conversationAnalysisError/,
  )
  assert.match(
    block,
    /isCurrentAnalysisOutdated\(\)/,
  )
  assert.match(
    block,
    /getLastKnownClientCommercialReading\(\)/,
  )
  assert.match(
    block,
    /retainedAttention\?\.source !==\s*'commercial_intent_uncertain'/,
  )
  assert.doesNotMatch(
    block,
    /retainedAttention\?\.source !==\s*'improvement'/,
  )
})

test('erro e loading da análise profunda nunca bloqueiam nem aparecem em AGORA', () => {
  const summaryCardStart = contentScript.indexOf(
    'function getCompanionLeadSummaryCardHtml()',
  )
  const summaryCardEnd = contentScript.indexOf(
    '\n  }',
    summaryCardStart,
  )
  const summaryCardBlock = contentScript.slice(
    summaryCardStart,
    summaryCardEnd,
  )

  assert.notEqual(summaryCardStart, -1)

  // AGORA (getCompanionLeadSummaryCardHtml) só depende do status do
  // resumo salvo — nunca do estado da análise profunda/deep analysis.
  assert.doesNotMatch(
    summaryCardBlock,
    /conversationAnalysisLoading|conversationAnalysisError|deepAnalysisStatus|getDeepAnalysisStatusBlockHtml|getInlineSpinnerHtml/,
  )

  // companion-lead-summary-view.js (o único módulo que desenha o conteúdo
  // de AGORA) não conhece nenhum estado de análise profunda.
  assert.doesNotMatch(
    summaryView,
    /deep.?analysis|analysis.?job|conversationAnalysis/i,
  )
})

test('abas AGORA ANÁLISE CLIENTE permanecem no fluxo e não flutuam sobre o conteúdo', () => {
  const start = styles.indexOf(
    '.yolen-seller-workspace--ux7 .yolen-seller-tabs {',
  )
  const end = styles.indexOf('}', start)
  const block = styles.slice(start, end)

  assert.notEqual(start, -1)
  assert.match(block, /position:\s*static/)
  assert.doesNotMatch(block, /position:\s*sticky/)
  assert.doesNotMatch(block, /top:\s*62px/)
  assert.doesNotMatch(block, /z-index:\s*8/)
  assert.doesNotMatch(block, /backdrop-filter/)
})

test('accordions do CLIENTE são controlados pelo Companion e não pelo toggle nativo', () => {
  const start = contentScript.indexOf(
    "document.addEventListener(\n    'click',",
  )
  const end = contentScript.indexOf(
    'for (const eventName of [',
    start,
  )
  const block =
    contentScript.slice(start, end)

  assert.notEqual(start, -1)
  assert.match(
    contentScript,
    /const controlledOpenClientIntelligenceGroups =\s*new Set\(\)/,
  )
  assert.match(
    block,
    /event\.preventDefault\(\)/,
  )
  assert.match(
    block,
    /clientDetails\.open =\s*nextOpen/,
  )
  assert.match(
    block,
    /controlledOpenClientIntelligenceGroups\.add/,
  )
  assert.match(
    block,
    /controlledOpenClientIntelligenceGroups\.delete/,
  )
  assert.match(
    contentScript,
    /controlledOpenClientIntelligenceGroups\.clear\(\)/,
  )
})
test('abas seller-facing nunca usam focus que pode rolar o painel', () => {
  const start = contentScript.indexOf(
    'function setActiveSellerArea(',
  )
  const end = contentScript.indexOf(
    'function handleSellerAreaKeyboard(',
    start,
  )
  const block =
    contentScript.slice(start, end)

  assert.notEqual(start, -1)

  assert.match(
    block,
    /preventScroll:\s*true/,
  )

  assert.match(
    block,
    /panel\.scrollTop\s*=\s*scrollTop/,
  )

  const wiringStart =
    contentScript.indexOf(
      "querySelectorAll(\n        '[data-yolen-seller-area]'",
    )

  const wiringEnd =
    contentScript.indexOf(
      "querySelectorAll(\n        '[data-yolen-action=\"refresh\"]'",
      wiringStart,
    )

  const wiring =
    contentScript.slice(
      wiringStart,
      wiringEnd,
    )

  assert.doesNotMatch(
    wiring,
    /\{\s*focus:\s*true\s*\}/,
  )
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
