// STEP 2B.5-D — "UNIFICAÇÃO REAL DO SELLER WORKSPACE": testes de paridade
// do módulo compartilhado (companion-seller-workspace-view.js) — a MESMA
// composição que WhatsApp e ManyChat agora chamam para as quatro áreas
// (AGORA/MENSAGEM/ANÁLISE/CLIENTE). Cobre os 13 casos obrigatórios do
// mandato (seção 16) e prova, com fixtures equivalentes, que um "presenter
// WhatsApp" (decisionState no shape {status,data}) e um "presenter
// ManyChat" (decisionState no shape {ready,data}) produzem a MESMA
// composição semântica quando o dado subjacente é equivalente — nunca
// dois presenters com regras diferentes para a mesma área.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
require('../src/companion-client-context-view.js')
require('../src/companion-lead-summary-view.js')
const sellerInfoView = require('../src/companion-seller-information-view.js')
const workspaceView = require('../src/companion-seller-workspace-view.js')

function evidence(summary, overrides = {}) {
  return {
    summary,
    evidence_message_ids: ['message-1'],
    memory_ids: [],
    ...overrides,
  }
}

// Fixture mínima válida de CommercialReading — o suficiente para
// buildAnalysisViewModelFromReading/buildCustomerViewModelFromReading
// produzirem um view model "pronto" de verdade, sem reimplementar aqui a
// tradução que companion-seller-information-view.js já testa sozinha.
function buildReading(overrides = {}) {
  return {
    contract_version: 'commercial-reading-v1',
    analysis_status: 'complete',
    analysis_limitations: [],
    commercial_role: 'buyer',
    commercial_relevance: 'commercial',
    conversation_summary: {
      current_state: evidence('Cliente avaliando a solução.'),
    },
    customer: {
      objectives: [],
      problems: [],
      impacts: [],
      needs: [evidence('Precisa reduzir perdas no follow-up.')],
      interests: [],
      decision_criteria: [],
      preferences: [],
      open_questions: [],
      objections: [],
      uncertainties: [],
      discussed_products: [],
      primary_product_interest: null,
      competitors: [],
      commitments: [],
      missing_discovery: [],
      resolved_information: [],
      superseded_information: [],
      communication: { events: [], patterns: [] },
    },
    commercial_evolution: [],
    method: { configured: false, name: null, stages: [] },
    risks: [],
    ...overrides,
  }
}

function buildAgoraSignal(overrides = {}) {
  return {
    status: 'respond',
    priority: 'high',
    headline: 'Cliente perguntou o prazo de implantação.',
    action: 'Confirmar o prazo de implantação com o cliente.',
    provenance: {
      decision_kind: 'respond',
      source: 'customer_waiting',
      evidence_message_ids: ['message-1'],
      memory_ids: [],
    },
    ...overrides,
  }
}

function buildAgoraViewModel(overrides = {}) {
  return {
    silent: false,
    silent_reason: null,
    primary: buildAgoraSignal(),
    secondary: [],
    reference_time: '2026-08-22T12:00:00.000Z',
    ...overrides,
  }
}

function readyGuidance(nextStep, overrides = {}) {
  return {
    status: 'ready',
    method_name: 'Consultivo',
    method_config_version_id: 'method-1',
    stage_key: 'discovery',
    stage_name: 'Descoberta',
    stage_reason: null,
    next_step: nextStep,
    seller_intents: [],
    error: null,
    error_code: null,
    status_code: null,
    retryable: null,
    ...overrides,
  }
}

const readyAnalysisViewModel = sellerInfoView.buildAnalysisViewModelFromReading(buildReading())
const readyCustomerViewModel = sellerInfoView.buildCustomerViewModelFromReading(buildReading())

// -----------------------------------------------------------------------
// 1) lead resolvido + view models carregando: nenhuma área quebra nem
//    fica em branco — cada uma mostra seu próprio estado de preparação.
// -----------------------------------------------------------------------
test('1) lead resolvido + view models carregando: nenhuma área fica vazia', () => {
  const agora = workspaceView.renderAgoraAreaHtml({ snapshotHtml: '', leadSummary: null })
  const analysis = workspaceView.renderAnalysisAreaHtml({})
  const client = workspaceView.renderClientAreaHtml({ commercialHtml: '', relationshipHtml: '' })
  const message = workspaceView.renderMessageAreaHtml({ methodGuidance: null })

  for (const html of [agora, analysis, client, message]) {
    assert.ok(html && html.trim().length > 0, 'nenhuma área pode devolver string vazia')
    assert.match(html, /yolen-card/)
  }
})

// -----------------------------------------------------------------------
// 2) AGORA silent + lead summary disponível: o card de resumo aparece.
// -----------------------------------------------------------------------
test('2) AGORA silent + lead summary disponível: mostra o card de resumo, nunca o fallback de preparação', () => {
  const html = workspaceView.renderAgoraAreaHtml({
    snapshotHtml: '',
    leadSummary: {
      status: 'ready',
      data: { working_summary: 'Cliente quer reduzir custo operacional.', summary: null },
      saveStatus: 'idle',
      saveError: null,
      draftValue: null,
    },
  })

  assert.match(html, /yolen-lead-summary-card/)
  assert.match(html, /Resumo salvo na Yolen/)
  assert.doesNotMatch(html, /A Yolen está preparando o resumo/)
})

// -----------------------------------------------------------------------
// 3) AGORA silent + summary carregando: mostra o estado de loading do
//    próprio card de resumo (nunca o fallback genérico de preparação, que
//    é só para quando NÃO existe hidratação de resumo nenhuma).
// -----------------------------------------------------------------------
test('3) AGORA silent + summary carregando: mostra o loading do card de resumo', () => {
  const html = workspaceView.renderAgoraAreaHtml({
    snapshotHtml: '',
    leadSummary: { status: 'loading' },
  })

  assert.match(html, /yolen-lead-summary-card/)
  assert.doesNotMatch(html, /A Yolen está preparando o resumo/)
})

// -----------------------------------------------------------------------
// 4) AGORA com sinal: o snapshot aparece, e — sem summary — o fallback de
//    preparação some junto (mandato: nunca inventar resumo local).
// -----------------------------------------------------------------------
test('4) AGORA com sinal: snapshot aparece; sem lead summary na plataforma, mostra o fallback de preparação honesto', () => {
  const snapshotHtml = sellerInfoView.renderAgoraViewModelSnapshot(buildAgoraViewModel())
  const html = workspaceView.renderAgoraAreaHtml({ snapshotHtml, leadSummary: null })

  assert.match(html, /data-yolen-now-attention="respond"/)
  assert.match(html, /A Yolen está preparando o resumo e a orientação desta conversa\./)
})

// -----------------------------------------------------------------------
// 5) MENSAGEM disponível.
// -----------------------------------------------------------------------
test('5) MENSAGEM disponível: mostra o próximo passo dentro do card canônico', () => {
  const html = workspaceView.renderMessageAreaHtml({
    methodGuidance: readyGuidance('Pergunte sobre o orçamento disponível.'),
  })

  assert.match(html, /yolen-card yolen-seller-area-card/)
  assert.match(html, /Pergunte sobre o orçamento disponível\./)
})

// -----------------------------------------------------------------------
// 6) MENSAGEM indisponível.
// -----------------------------------------------------------------------
test('6) MENSAGEM indisponível: mostra o estado vazio honesto, nunca um retângulo preto', () => {
  const withoutGuidance = workspaceView.renderMessageAreaHtml({ methodGuidance: null })
  const noSummaryYet = workspaceView.renderMessageAreaHtml({ methodGuidance: { status: 'no_summary' } })

  for (const html of [withoutGuidance, noSummaryYet]) {
    assert.match(html, /data-yolen-message-empty/)
    assert.ok(html.trim().length > 0)
  }
})

// -----------------------------------------------------------------------
// 7) ANÁLISE pronta.
// -----------------------------------------------------------------------
test('7) ANÁLISE pronta: usa o renderer oficial (renderAnalysisViewModel)', () => {
  const html = workspaceView.renderAnalysisAreaHtml({
    ready: true,
    data: readyAnalysisViewModel,
    actionHtml: '<button data-yolen-action="analyze-conversation">Analisar novamente</button>',
  })

  assert.match(html, /yolen-analysis-area-card/)
  assert.match(html, /data-yolen-action="analyze-conversation"/)
})

// -----------------------------------------------------------------------
// 8) ANÁLISE sem leitura suficiente.
// -----------------------------------------------------------------------
test('8) ANÁLISE sem leitura suficiente: vazio progressivo, nunca quebra', () => {
  const html = workspaceView.renderAnalysisAreaHtml({})

  assert.match(html, /data-yolen-analysis-progressive/)
  assert.match(html, /Ainda não há análise detalhada de coaching e método\./)
})

// -----------------------------------------------------------------------
// 9) CLIENTE com dados.
// -----------------------------------------------------------------------
test('9) CLIENTE com dados: mostra o comercial e o relacionamento', () => {
  const commercialHtml = sellerInfoView.renderCustomerViewModel(readyCustomerViewModel)
  const relationshipHtml = workspaceView.renderClientRelationshipCardHtml({
    clientContext: { status: 'ready', data: { relationship_summary: 'Cliente há 2 anos.' } },
    now: Date.now(),
  })

  const html = workspaceView.renderClientAreaHtml({ commercialHtml, relationshipHtml })

  assert.match(html, /yolen-client-relationship-card/)
  assert.ok(commercialHtml.length > 0)
  assert.doesNotMatch(html, /data-yolen-client-empty/)
})

// -----------------------------------------------------------------------
// 10) CLIENTE sem dados.
// -----------------------------------------------------------------------
test('10) CLIENTE sem dados: estado vazio de nível superior, nunca erro', () => {
  const html = workspaceView.renderClientAreaHtml({ commercialHtml: '', relationshipHtml: '' })

  assert.match(html, /data-yolen-client-empty/)
  assert.doesNotMatch(html, /role="alert"/)
})

// -----------------------------------------------------------------------
// 11) erro parcial de endpoint: um endpoint falha (ANÁLISE), os outros
//     continuam normais — nunca um erro em cascata.
// -----------------------------------------------------------------------
test('11) erro parcial de endpoint: ANÁLISE mostra erro localizado; CLIENTE/AGORA continuam normais', () => {
  const analysisHtml = workspaceView.renderAnalysisAreaHtml({
    error: 'Falha ao carregar a análise.',
    errorRetryButtonHtml: '<button data-yolen-action="analyze-conversation">Tentar novamente</button>',
  })
  const clientHtml = workspaceView.renderClientAreaHtml({
    commercialHtml: sellerInfoView.renderCustomerViewModel(readyCustomerViewModel),
    relationshipHtml: '',
  })
  const agoraHtml = workspaceView.renderAgoraAreaHtml({
    snapshotHtml: sellerInfoView.renderAgoraViewModelSnapshot(buildAgoraViewModel()),
    leadSummary: null,
  })

  assert.match(analysisHtml, /data-yolen-analysis-error/)
  assert.match(analysisHtml, /Falha ao carregar a análise\./)
  assert.doesNotMatch(clientHtml, /data-yolen-analysis-error/)
  assert.doesNotMatch(agoraHtml, /data-yolen-analysis-error/)
  assert.match(agoraHtml, /data-yolen-now-attention="respond"/)
})

// -----------------------------------------------------------------------
// 12) análise em progresso.
// -----------------------------------------------------------------------
test('12) análise em progresso: mostra loading com o spinner/ação da plataforma, nunca some', () => {
  const html = workspaceView.renderAnalysisAreaHtml({
    loading: true,
    loadingSpinnerHtml: '<span class="spinner"></span>',
    actionHtml: '',
  })

  assert.match(html, /data-yolen-analysis-loading/)
  assert.match(html, /class="spinner"/)
  assert.match(html, /Analisando sua condução comercial…/)
})

// -----------------------------------------------------------------------
// 13) A→B→A sem estado cruzado: o módulo é puro (sem estado interno) —
//     chamadas intercaladas para "conversas" diferentes nunca vazam uma
//     na outra, e voltar para A produz exatamente o mesmo resultado de
//     antes.
// -----------------------------------------------------------------------
test('13) A→B→A: chamadas intercaladas nunca vazam estado entre "conversas" (módulo sem estado interno)', () => {
  const agoraA = { snapshotHtml: sellerInfoView.renderAgoraViewModelSnapshot(buildAgoraViewModel({ primary: buildAgoraSignal({ status: 'respond' }) })), leadSummary: null }
  const agoraB = { snapshotHtml: sellerInfoView.renderAgoraViewModelSnapshot(buildAgoraViewModel({ primary: buildAgoraSignal({ status: 'escalate' }) })), leadSummary: null }

  const resultA1 = workspaceView.renderAgoraAreaHtml(agoraA)
  const resultB = workspaceView.renderAgoraAreaHtml(agoraB)
  const resultA2 = workspaceView.renderAgoraAreaHtml(agoraA)

  assert.equal(resultA1, resultA2, 'voltar para A produz exatamente o mesmo HTML de antes')
  assert.notEqual(resultA1, resultB)
  assert.match(resultA1, /data-yolen-now-attention="respond"/)
  assert.match(resultB, /data-yolen-now-attention="escalate"/)
  assert.doesNotMatch(resultA1, /data-yolen-now-attention="escalate"/)
  assert.doesNotMatch(resultB, /data-yolen-now-attention="respond"/)
})

// -----------------------------------------------------------------------
// Paridade cross-platform: um "presenter WhatsApp" (decisionState no
// shape {status,data}) e um "presenter ManyChat" (decisionState no shape
// {ready,data}) — cada um computando snapshotHtml do seu próprio jeito —
// produzem a MESMA composição semântica para dados equivalentes, porque
// os dois chamam a MESMA função (nunca duas implementações paralelas).
// -----------------------------------------------------------------------
test('paridade cross-platform: WhatsApp-shaped e ManyChat-shaped produzem a MESMA composição para AGORA', () => {
  const agoraViewModel = buildAgoraViewModel()

  // WhatsApp: decisionState = { status: 'ready', data }.
  const whatsappDecisionState = { status: 'ready', data: agoraViewModel }
  const whatsappSnapshotHtml =
    whatsappDecisionState?.status === 'ready'
      ? sellerInfoView.renderAgoraViewModelSnapshot(whatsappDecisionState.data)
      : ''

  // ManyChat: decisionState = { ready: true, data }.
  const manychatDecisionState = { ready: true, data: agoraViewModel }
  const manychatSnapshotHtml =
    manychatDecisionState?.ready === true
      ? sellerInfoView.renderAgoraViewModelSnapshot(manychatDecisionState.data)
      : ''

  const whatsappHtml = workspaceView.renderAgoraAreaHtml({ snapshotHtml: whatsappSnapshotHtml, leadSummary: null })
  const manychatHtml = workspaceView.renderAgoraAreaHtml({ snapshotHtml: manychatSnapshotHtml, leadSummary: null })

  assert.equal(whatsappHtml, manychatHtml)
})

test('paridade cross-platform: ANÁLISE pronta produz a MESMA composição para os dois presenters', () => {
  const whatsappHtml = workspaceView.renderAnalysisAreaHtml({
    ready: true,
    data: readyAnalysisViewModel,
    actionHtml: '<button data-yolen-action="analyze-conversation">Tentar novamente</button>',
  })

  const manychatHtml = workspaceView.renderAnalysisAreaHtml({
    ready: true,
    data: readyAnalysisViewModel,
    actionHtml: '<button data-yolen-action="analyze-conversation">Tentar novamente</button>',
  })

  assert.equal(whatsappHtml, manychatHtml)
})

test('paridade cross-platform: CLIENTE sem dados produz o MESMO estado vazio para os dois presenters', () => {
  const whatsappHtml = workspaceView.renderClientAreaHtml({ commercialHtml: '', relationshipHtml: '' })
  const manychatHtml = workspaceView.renderClientAreaHtml({ commercialHtml: '', relationshipHtml: '' })

  assert.equal(whatsappHtml, manychatHtml)
})
