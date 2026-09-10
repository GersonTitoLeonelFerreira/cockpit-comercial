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

// FASE 16.5 (recalibração seller-facing do AGORA): getNowAttentionSnapshotHtml
// não reconstrói mais a decisão a partir da leitura crua — ela consome o
// AGORA seller-facing view model já pronto (Decision State, FASE 16.3E,
// traduzido por app/lib/server/agora-view-model.ts e buscado por
// loadAgoraDecisionStateForCurrentCycle). Os dois testes abaixo foram
// atualizados para o novo formato — a mesma garantia semântica (no máximo
// um card duplicando ANÁLISE nunca acontece; decisão de uma conversa
// trocada nunca fica visível) continua valendo, só a implementação mudou.
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
    /sellerInformationViewTools\.renderAgoraViewModelSnapshot\(/,
  )
  assert.doesNotMatch(
    attentionBlock,
    /renderAnalysisArea|getDetailedAnalysisAreaHtml/,
  )
})

test('AGORA só renderiza a decisão do ciclo/conversa atuais, nunca uma decisão stale', () => {
  const start = contentScript.indexOf(
    'function getNowAttentionSnapshotHtml()',
  )
  const end = contentScript.indexOf(
    'function getSellerInformationArchitectureHtml()',
    start,
  )
  const block =
    contentScript.slice(start, end)

  // Só renderiza quando o AGORA seller-facing view model está pronto.
  assert.match(
    block,
    /state\.agoraDecisionState\?\.status !== 'ready'/,
  )

  // E só quando ele pertence ao MESMO ciclo/conversa atualmente ativos —
  // o mesmo guard de escopo que impede uma troca de conversa (A→B) de
  // deixar visível a decisão da conversa anterior (mandato §24/§25).
  assert.match(
    block,
    /state\.agoraDecisionStateCycleId ===\s*cycleId/,
  )
  assert.match(
    block,
    /state\.agoraDecisionStateConversationKey ===\s*conversationKey/,
  )
})

test(
  'loadAgoraDecisionStateForCurrentCycle rejeita uma resposta stale mesmo quando ciclo/conversa batem (achado do Codex, PR #283)',
  () => {
    // Identidade de escopo (cycleId/conversationKey) sozinha não prova
    // que uma resposta em voo é a mais recente: uma requisição disparada
    // ANTES de uma reanálise começar pode resolver DEPOIS da requisição
    // que a própria reanálise disparou ao terminar, para o MESMO ciclo/
    // conversa — sem um token de geração monotônico, a resposta antiga
    // sobrescreveria o resultado fresco.
    const start = contentScript.indexOf(
      'async function loadAgoraDecisionStateForCurrentCycle(',
    )
    const end = contentScript.indexOf(
      '\n  }\n\n  // Carrega o working summary factual do lead.',
      start,
    )
    const block = contentScript.slice(start, end)

    assert.notEqual(start, -1)
    assert.notEqual(end, -1)

    assert.match(
      block,
      /requestSequence =\s*\n?\s*\+\+agoraDecisionStateRequestSequence/,
    )
    assert.match(
      block,
      /requestSequence ===\s*\n?\s*agoraDecisionStateRequestSequence/,
    )
  },
)

test(
  'AGORA é atualizado quando uma nova mensagem é capturada, não só quando uma nova análise termina (achado do Codex, PR #283, rodada 2)',
  () => {
    // Um sinal operacional (ex.: cliente passou a aguardar resposta)
    // pode mudar com uma mensagem nova sem que nenhuma análise semântica
    // rode — sem este refresh, AGORA ficaria presa na decisão anterior
    // até a próxima reanálise bem-sucedida, que pode nunca acontecer se
    // o vendedor não reanalisar manualmente.
    const start = contentScript.indexOf(
      'function notifyCaptureIngestedForClientContext(',
    )
    const end = contentScript.indexOf(
      'async function loadCompanionClientContextForCurrentCycle(',
      start,
    )
    const block = contentScript.slice(start, end)

    assert.notEqual(start, -1)
    assert.notEqual(end, -1)

    assert.match(
      block,
      /loadAgoraDecisionStateForCurrentCycle\(\{\s*\n?\s*force: true,/,
    )
  },
)

test(
  'AGORA é atualizado periodicamente enquanto o painel está aberto, não só em eventos discretos (achado do Codex, PR #283, rodada 2)',
  () => {
    // Decision State é uma fotografia do servidor, não recalculada ao
    // vivo no cliente (ao contrário do client-context) — sem um refetch
    // periódico, um SLA que evolui de médio para alto (ou uma espera que
    // cruza o limiar de atenção) puramente pela passagem do tempo,
    // deixaria AGORA presa na decisão antiga indefinidamente.
    const start = contentScript.indexOf(
      'function startCompanionClientContextTicker(',
    )
    const end = contentScript.indexOf(
      'function getDetailedAnalysisAreaHtml(',
      start,
    )
    const block = contentScript.slice(start, end)

    assert.notEqual(start, -1)
    assert.notEqual(end, -1)

    assert.match(
      block,
      /state\.agoraDecisionState\s*\n?\s*\?\.status === 'ready'/,
    )
    assert.match(
      block,
      /loadAgoraDecisionStateForCurrentCycle\(\{\s*\n?\s*force: true,/,
    )
  },
)

// FASE 16.6 — mesmo raciocínio do teste acima, agora para o ANÁLISE
// seller-facing view model (Integrated Commercial Context, FASE 16.4):
// também é uma fotografia do servidor, também precisa de refetch
// periódico enquanto o painel está aberto.
test(
  'ANÁLISE é atualizado periodicamente enquanto o painel está aberto, não só em eventos discretos (FASE 16.6)',
  () => {
    const start = contentScript.indexOf(
      'function startCompanionClientContextTicker(',
    )
    const end = contentScript.indexOf(
      'function getDetailedAnalysisAreaHtml(',
      start,
    )
    const block = contentScript.slice(start, end)

    assert.notEqual(start, -1)
    assert.notEqual(end, -1)

    assert.match(
      block,
      /state\.analysisViewModel\s*\n?\s*\?\.status === 'ready'/,
    )
    assert.match(
      block,
      /loadAnalysisViewModelForCurrentCycle\(\{\s*\n?\s*force: true,/,
    )
  },
)

test(
  'AGORA inclui a empresa ativa na ownership da requisição, não só ciclo/conversa (achado do Codex, PR #283, rodada 3)',
  () => {
    // Uma troca de empresa ativa (loadYolenSession) enquanto o mesmo chat
    // do WhatsApp permanece selecionado não muda, por si só,
    // cycleId/conversationKey — sem capturar e checar também a empresa,
    // uma resposta em voo (ou um cache "já pronto") da empresa ANTERIOR
    // continuaria válida para a empresa nova.
    const start = contentScript.indexOf(
      'async function loadAgoraDecisionStateForCurrentCycle(',
    )
    const end = contentScript.indexOf(
      '\n  }\n\n  // Carrega o working summary factual do lead.',
      start,
    )
    const block = contentScript.slice(start, end)

    assert.notEqual(start, -1)
    assert.notEqual(end, -1)

    assert.match(
      block,
      /companyIdAtRequest =\s*\n?\s*state\.companyId \|\|\s*\n?\s*null/,
    )
    assert.match(
      block,
      /agoraDecisionStateCompanyId ===\s*\n?\s*companyIdAtRequest/,
    )
    assert.match(
      block,
      /companyIdAtRequest ===\s*\n?\s*\(\s*\n?\s*state\.companyId \|\|\s*\n?\s*null\s*\n?\s*\)/,
    )
  },
)

test(
  'troca de empresa ativa zera o AGORA em cache, para nunca renderizar decisão comercial da empresa anterior (achado do Codex, PR #283, rodada 3)',
  () => {
    const start = contentScript.indexOf(
      'async function loadYolenSession(options = {})',
    )
    const end = contentScript.indexOf(
      'async function waitForVisibleAudioTargetsForRestore()',
      start,
    )
    const block = contentScript.slice(start, end)

    assert.notEqual(start, -1)
    assert.notEqual(end, -1)

    const companyChangedIndex = block.indexOf('companyChanged')
    assert.notEqual(companyChangedIndex, -1)

    const spreadBlock = block.slice(companyChangedIndex)

    assert.match(
      spreadBlock,
      /agoraDecisionState:\s*\{\s*\n?\s*status:\s*'idle',/,
    )
    assert.match(
      spreadBlock,
      /agoraDecisionStateCycleId:\s*null,/,
    )
    assert.match(
      spreadBlock,
      /agoraDecisionStateConversationKey:\s*null,/,
    )
    assert.match(
      spreadBlock,
      /agoraDecisionStateCompanyId:\s*null,/,
    )
  },
)

test(
  'rail minimizado escolhe o primeiro sinal acionável (primary, com fallback para secondary) e nunca promove um sinal no_intervention (achado do Codex, PR #283, rodada 3)',
  () => {
    // Dois casos reais em que ler só `primary` desalinhava o rail da aba
    // AGORA expandida: (a) a decisão principal suprimida mas um sinal
    // secundário real sobrevive (ex.: customer_waiting); (b) um `primary`
    // não-suprimido com kind 'wait' — mapeado para o status
    // 'no_intervention', sem ser uma recomendação de ação.
    const helperStart = contentScript.indexOf(
      'function pickActionableAgoraSignal(agoraData)',
    )
    const helperEnd = contentScript.indexOf(
      'function getCollapsedCompanionAttentionSnapshot()',
      helperStart,
    )
    const helperBlock = contentScript.slice(helperStart, helperEnd)

    assert.notEqual(helperStart, -1)
    assert.notEqual(helperEnd, -1)

    assert.match(
      helperBlock,
      /primary\.status !== 'no_intervention'/,
    )
    assert.match(
      helperBlock,
      /secondary\.find\(\s*\n?\s*\(signal\) =>\s*\n?\s*signal &&\s*\n?\s*signal\.status !== 'no_intervention',/,
    )

    const railStart = contentScript.indexOf(
      'function getCollapsedCompanionAttentionSnapshot()',
    )
    const railEnd = contentScript.indexOf(
      '// B5_MINIMIZED_INTELLIGENCE_END',
      railStart,
    )
    const railBlock = contentScript.slice(railStart, railEnd)

    assert.notEqual(railStart, -1)
    assert.notEqual(railEnd, -1)

    assert.match(
      railBlock,
      /pickActionableAgoraSignal\(\s*\n?\s*state\.agoraDecisionState\.data,/,
    )
    assert.doesNotMatch(
      railBlock,
      /state\.agoraDecisionState\.data\?\.primary/,
    )
  },
)

test(
  'chave do alerta reconhecido no rail é estável entre atualizações periódicas, sem depender de reference_time (achado do Codex, PR #283, rodada 3)',
  () => {
    // O refresh periódico (startCompanionClientContextTicker, a cada
    // 60s) recalcula Decision State e produz um reference_time novo
    // mesmo quando o sinal em si não mudou — incluir reference_time na
    // chave fazia a chave divergir de lastAcknowledgedCollapsedAttentionKey
    // a cada tick e reacender o ponto de notificação sem nenhuma mudança
    // real no sinal.
    const railStart = contentScript.indexOf(
      'function getCollapsedCompanionAttentionSnapshot()',
    )
    const railEnd = contentScript.indexOf(
      '// B5_MINIMIZED_INTELLIGENCE_END',
      railStart,
    )
    const railBlock = contentScript.slice(railStart, railEnd)

    assert.notEqual(railStart, -1)
    assert.notEqual(railEnd, -1)

    assert.doesNotMatch(
      railBlock,
      /reference_time/,
    )

    assert.match(
      railBlock,
      /agoraSignal\.provenance\?\.decision_kind/,
    )
    assert.match(
      railBlock,
      /agoraSignal\.provenance\?\.source/,
    )
  },
)

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

  // UX8 (FASE B.1): #yolen-companion-panel não é mais o elemento rolável
  // (.yolen-workspace-body é) — a restauração de posição no fallback de
  // foco precisa passar pelo helper canônico getWorkspaceScrollContainer,
  // nunca escrever panel.scrollTop diretamente.
  assert.match(
    block,
    /getWorkspaceScrollContainer\(\s*panel,?\s*\)/,
  )
  assert.match(
    block,
    /scrollContainer\.scrollTop\s*=\s*scrollTop/,
  )
  assert.doesNotMatch(
    block,
    /panel\.scrollTop\s*=/,
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

test('painel desativa scroll anchoring automático do navegador', () => {
  const start = styles.indexOf(
    '#yolen-companion-panel {',
  )
  const end = styles.indexOf(
    '}',
    start,
  )
  const block =
    styles.slice(start, end)

  assert.notEqual(start, -1)
  assert.match(
    block,
    /overflow-anchor:\s*none/,
  )
})

test('AGORA não é escondido, e o composer contextual pertence exclusivamente à aba MENSAGEM (UX8 FASE C)', () => {
  assert.doesNotMatch(
    summaryView,
    /yolen-seller-panel\[data-yolen-seller-panel="now"\]\{display:none!important;\}/,
  )

  // FASE C: companion-lead-summary-view.js (AGORA) não emite mais o
  // mount do composer — só o input hidden do working summary, que
  // seller-message-runtime.js continua validando de qualquer lugar do
  // documento (inclusive dentro de um painel [hidden]).
  assert.doesNotMatch(summaryView, /data-yolen-seller-message-mount/)
  assert.match(summaryView, /data-yolen-textarea="lead-summary"/)

  // O único mount agora nasce em getSellerMessageAreaHtml()
  // (content-script.js), dentro da 4ª superfície ('message').
  assert.match(
    contentScript,
    /function getSellerMessageAreaHtml\(\)/,
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
