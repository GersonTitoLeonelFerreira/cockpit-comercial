import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)

const view = require(
  '../src/companion-seller-information-view.js',
)

function evidence(summary, overrides = {}) {
  return {
    summary,
    evidence_message_ids: ['message-1'],
    memory_ids: [],
    ...overrides,
  }
}

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
      interests: [evidence('Tem interesse em automação comercial.')],
      decision_criteria: [evidence('Implantação simples.')],
      preferences: [evidence('Prefere mensagens objetivas.')],
      open_questions: [evidence('Qual é o prazo de implantação?')],
      objections: [evidence('Considera o preço alto.')],
      uncertainties: [evidence('Ainda não confirmou o decisor.')],
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
    method: {
      configured: true,
      name: 'Método Consultivo',
      stages: [
        {
          step_order: 1,
          stage_key: 'abertura',
          name: 'Abertura',
          status: 'completed',
          explanation: 'Contexto estabelecido.',
          evidence_message_ids: ['message-1'],
          memory_ids: [],
        },
        {
          step_order: 2,
          stage_key: 'diagnostico',
          name: 'Diagnóstico',
          status: 'active',
          explanation: 'Descoberta em andamento.',
          evidence_message_ids: ['message-2'],
          memory_ids: [],
        },
      ],
      current_stage: {
        step_order: 2,
        stage_key: 'diagnostico',
        name: 'Diagnóstico',
      },
      adherence: {
        status: 'on_method',
        summary: 'A condução segue o método.',
        deviation_stage_order: null,
        what_happened: null,
        missing_information: [],
        why_it_matters: null,
        evidence_message_ids: ['message-2'],
        memory_ids: [],
      },
      recovery_guidance: null,
    },
    seller_strengths: [
      {
        kind: 'good_discovery',
        summary: 'Você confirmou a necessidade antes de apresentar a solução.',
        why_it_matters: 'Evita uma proposta genérica.',
        evidence_message_ids: ['message-2', 'message-3'],
        memory_ids: ['memory-1'],
      },
    ],
    improvement_points: [
      {
        kind: 'premature_price',
        summary: 'Você apresentou preço antes de concluir o diagnóstico.',
        why_it_matters: 'O cliente ainda não percebeu todo o valor.',
        impact: 'A conversa pode ficar restrita à comparação de preço.',
        how_to_improve: 'Confirme o impacto do problema antes de retomar a proposta.',
        evidence_message_ids: ['message-4'],
        memory_ids: [],
      },
    ],
    risks: {
      customer_objections: [
        {
          kind: 'price',
          severity: 'medium',
          summary: 'O cliente considera o preço alto.',
          evidence_message_ids: ['message-5'],
          memory_ids: [],
        },
      ],
      service_risks: [],
    },
    best_approach: {
      decision: 'deepen_discovery',
      reason: 'Confirmar impacto antes de negociar.',
      channel: 'text',
      evidence_message_ids: ['message-4'],
      memory_ids: [],
    },
    communication: {
      intervention_needed: true,
      recommended_question: 'Qual impacto isso gera hoje?',
      recommended_message: 'Para eu orientar melhor, qual impacto isso gera hoje?',
    },
    operations: {
      crm: {
        should_change_crm_stage: false,
        recommended_status: null,
        rationale: null,
        requires_human_confirmation: true,
      },
      agenda: {
        should_change_agenda: false,
        expected_next_action_at: null,
        rationale: null,
        requires_human_confirmation: true,
      },
    },
    evidence_message_ids: [],
    memory_ids: [],
    ...overrides,
  }
}

// FASE 16.6 (recalibração seller-facing de ANÁLISE): `renderAnalysisArea`
// foi substituída por `renderAnalysisViewModel`, que consome o
// AnalysisViewModel já pronto (Integrated Commercial Context, FASE 16.4,
// traduzido por app/lib/server/analysis-view-model.ts) em vez de uma
// `CommercialReading` crua. Este helper simula, só para fins de teste da
// camada de apresentação, a MESMA tradução que o presenter real faz a
// partir de uma leitura — os testes abaixo continuam validando
// exclusivamente a RENDERIZAÇÃO (rótulos, escape de HTML, agrupamento),
// nunca a lógica de tradução em si (já coberta exaustivamente em
// app/lib/server/analysis-view-model.test.mjs).
function analysisViewModelFromReading(reading) {
  const neutral =
    reading.commercial_relevance !== 'commercial' ||
    reading.commercial_role !== 'buyer'

  if (neutral) {
    return {
      available: true,
      unavailable_reason: null,
      neutral: true,
      neutral_headline:
        reading.commercial_relevance === 'uncertain'
          ? 'Ainda não há evidência comercial suficiente.'
          : 'Conversa sem evidência comercial relevante.',
      neutral_description:
        reading.commercial_relevance === 'uncertain'
          ? 'Nenhuma leitura de venda será mostrada até o contexto ficar claro.'
          : 'Nenhuma leitura de venda desta conversa é necessária.',
      opportunity: null,
      current_moment: { is_active_session: null },
      risks: [],
      objections_open: [],
      commitments: [],
      seller_conduct: {
        method: { configured: false, name: null, stages: [], current_stage: null, adherence: null, recovery_guidance: null },
        stage_divergence: false,
      },
      strengths: [],
      improvements: [],
      continuity: { cycle_conversation_count: 0, cross_conversation_signals: [] },
      history: [],
      provenance: {},
    }
  }

  const risks = [
    ...reading.risks.customer_objections.map((risk) => ({ source: 'customer_objection', ...risk })),
    ...reading.risks.service_risks.map((risk) => ({ source: 'service_risk', ...risk })),
  ].filter((risk) => risk.severity !== 'low')

  return {
    available: true,
    unavailable_reason: null,
    neutral: false,
    neutral_headline: null,
    neutral_description: null,
    opportunity: {
      status: 'advancing',
      headline: reading.conversation_summary.current_state.summary,
      stage_name: reading.method.current_stage?.name ?? null,
    },
    current_moment: { is_active_session: true },
    risks,
    objections_open: [],
    commitments: [],
    seller_conduct: {
      method: reading.method,
      stage_divergence: false,
    },
    strengths: reading.seller_strengths.map((item) => ({ ...item, impact: null })),
    improvements: reading.improvement_points,
    continuity: { cycle_conversation_count: 0, cross_conversation_signals: [] },
    history: reading.commercial_evolution,
    provenance: {},
  }
}

test('sessões non-commercial e uncertain permanecem neutras', () => {
  const nonCommercial = buildReading({ commercial_relevance: 'non_commercial' })
  const uncertain = buildReading({ commercial_relevance: 'uncertain' })

  assert.equal(view.isNeutralCommercialSession(nonCommercial), true)
  assert.equal(view.isNeutralCommercialSession(uncertain), true)
  assert.match(view.getNeutralSessionCopy(nonCommercial).title, /sem evidência comercial relevante/i)
  assert.match(view.getNeutralSessionCopy(uncertain).title, /evidência comercial suficiente/i)
  assert.match(view.renderAnalysisViewModel(analysisViewModelFromReading(nonCommercial)), /sem evidência comercial relevante/i)
  assert.doesNotMatch(view.renderAnalysisViewModel(analysisViewModelFromReading(nonCommercial)), /Pontos de melhoria|Método Consultivo/)
})

test('coaching mostra acerto concreto, importância e evidência', () => {
  const html = view.renderAnalysisViewModel(analysisViewModelFromReading(buildReading()))

  assert.match(html, /Acertos/)
  assert.match(html, /Boa descoberta/)
  assert.match(html, /confirmou a necessidade/)
  assert.match(html, /Evita uma proposta genérica/)
  assert.match(html, /Evidência: 2 mensagens da conversa e 1 memória comercial/)
})

test('melhoria mostra ocorrência, importância, impacto e correção', () => {
  const html = view.renderAnalysisViewModel(analysisViewModelFromReading(buildReading()))

  assert.match(html, /Pontos de melhoria/)
  assert.match(html, /apresentou preço antes de concluir o diagnóstico/)
  assert.match(html, /Por que isso importa/)
  assert.match(html, /Impacto ou risco/)
  assert.match(html, /Como corrigir/)
  assert.match(html, /Confirme o impacto do problema/)
})

// FASE 16.9 — UX validada em Firefox, obrigatória: coaching vem primeiro
// em ANÁLISE, Pontos de melhoria antes de Acertos, detalhes de ambos
// recolhidos, e método recolhido por padrão.
test('FASE 16.9 — ANÁLISE mostra Pontos de melhoria antes de Acertos, ambos com detalhe recolhido', () => {
  const html = view.renderAnalysisViewModel(analysisViewModelFromReading(buildReading()))

  const improvementsIndex = html.indexOf('Pontos de melhoria')
  const strengthsIndex = html.indexOf('>Acertos<')

  assert.ok(improvementsIndex >= 0, 'Pontos de melhoria deveria aparecer em ANÁLISE')
  assert.ok(strengthsIndex >= 0, 'Acertos deveria aparecer em ANÁLISE')
  assert.ok(
    improvementsIndex < strengthsIndex,
    'Pontos de melhoria deveria vir antes de Acertos (coaching primeiro)',
  )

  // Título continua visível fora do <details>; explicação/impacto/
  // correção/evidência ficam recolhidos atrás de "Ver detalhes".
  const improvementTitleIndex = html.indexOf('apresentou preço antes de concluir o diagnóstico')
  const improvementDetailsSummaryIndex = html.indexOf('data-yolen-preserve-details="improvement-detail-0"')
  const improvementWhyIndex = html.indexOf('O cliente ainda não percebeu todo o valor')

  assert.ok(improvementTitleIndex >= 0 && improvementDetailsSummaryIndex >= 0 && improvementWhyIndex >= 0)
  assert.ok(improvementTitleIndex < improvementDetailsSummaryIndex)
  assert.ok(improvementDetailsSummaryIndex < improvementWhyIndex)

  const strengthDetailsSummaryIndex = html.indexOf('data-yolen-preserve-details="strength-detail-0"')
  assert.ok(strengthDetailsSummaryIndex >= 0)
})

test('FASE 16.9 — método comercial fica recolhido por padrão em ANÁLISE', () => {
  const html = view.renderAnalysisViewModel(analysisViewModelFromReading(buildReading()))

  const detailsOpenIndex = html.indexOf('<details class="yolen-seller-secondary-details" data-yolen-preserve-details="method">')
  const summaryIndex = html.indexOf('Ver método comercial')
  const methodNameIndex = html.indexOf('Método Consultivo')

  assert.ok(detailsOpenIndex >= 0, 'seção de método deveria estar dentro de um <details>')
  assert.ok(summaryIndex > detailsOpenIndex)
  assert.ok(methodNameIndex > summaryIndex, 'conteúdo do método deveria vir depois do <summary>, dentro do <details>')
})

test('método preserva seis status e destaca etapa atual', () => {
  const statuses = [
    'completed',
    'active',
    'partial',
    'not_started',
    'skipped',
    'not_applicable',
  ]

  const reading = buildReading()
  reading.method.stages = statuses.map((status, index) => ({
    step_order: index + 1,
    stage_key: `stage-${index + 1}`,
    name: `Etapa ${index + 1}`,
    status,
    explanation: `Explicação ${index + 1}`,
    evidence_message_ids: [],
    memory_ids: [],
  }))
  reading.method.current_stage = {
    step_order: 2,
    stage_key: 'stage-2',
    name: 'Etapa 2',
  }

  const html = view.renderAnalysisViewModel(analysisViewModelFromReading(reading))

  for (const status of statuses) {
    assert.match(html, new RegExp(`data-yolen-method-stage-status="${status}"`))
  }

  assert.match(html, /data-yolen-current-method-stage="true"/)
  assert.match(html, /Etapa atual/)
})

test('aderência traduz on_method e partially_on_method para linguagem humana', () => {
  const onMethod = view.renderAnalysisViewModel(analysisViewModelFromReading(buildReading()))
  assert.match(onMethod, /Dentro do método/)

  const reading = buildReading()
  reading.method.adherence.status = 'partially_on_method'
  reading.method.adherence.summary = 'Parte da descoberta ainda está incompleta.'

  const partial = view.renderAnalysisViewModel(analysisViewModelFromReading(reading))
  assert.match(partial, /Parcialmente dentro do método/)
  assert.match(partial, /descoberta ainda está incompleta/)
})

test('off_method mostra diagnóstico completo e recovery', () => {
  const reading = buildReading()
  reading.method.adherence = {
    status: 'off_method',
    summary: 'A condução saiu do método no diagnóstico.',
    deviation_stage_order: 2,
    what_happened: 'O preço foi apresentado antes de confirmar o impacto.',
    missing_information: ['Impacto financeiro'],
    why_it_matters: 'Sem impacto, o valor parece abstrato.',
    evidence_message_ids: ['message-4'],
    memory_ids: [],
  }
  reading.method.recovery_guidance = {
    objective: 'Retomar o diagnóstico.',
    missing_information: ['Urgência da decisão'],
    recommended_move: 'Perguntar sobre impacto e urgência.',
    optional_question: 'O que acontece se isso continuar por mais três meses?',
    evidence_message_ids: ['message-4'],
    memory_ids: [],
  }

  const html = view.renderAnalysisViewModel(analysisViewModelFromReading(reading))

  assert.match(html, /Fora do método/)
  assert.match(html, /Como voltar para o método/)
  assert.match(html, /Onde saiu/)
  assert.match(html, /Diagnóstico/)
  assert.match(html, /O que aconteceu/)
  assert.match(html, /Impacto financeiro/)
  assert.match(html, /Por que importa/)
  assert.match(html, /Perguntar sobre impacto e urgência/)
})

test('not_configured e insufficient_evidence não inventam erro ou metodologia', () => {
  const notConfigured = buildReading()
  notConfigured.method = {
    configured: false,
    name: null,
    stages: [],
    current_stage: null,
    adherence: {
      status: 'not_configured',
      summary: 'Método não configurado.',
      deviation_stage_order: null,
      what_happened: null,
      missing_information: [],
      why_it_matters: null,
      evidence_message_ids: [],
      memory_ids: [],
    },
    recovery_guidance: null,
  }

  const notConfiguredHtml = view.renderAnalysisViewModel(analysisViewModelFromReading(notConfigured))
  assert.match(notConfiguredHtml, /Método comercial não configurado/)
  assert.doesNotMatch(notConfiguredHtml, /Como voltar para o método/)

  const insufficient = buildReading()
  insufficient.method.adherence.status = 'insufficient_evidence'
  insufficient.method.adherence.summary = 'Poucas mensagens disponíveis.'

  const insufficientHtml = view.renderAnalysisViewModel(analysisViewModelFromReading(insufficient))
  assert.match(insufficientHtml, /Evidência insuficiente/)
  assert.match(insufficientHtml, /Não há evidência suficiente para avaliar esta etapa/)
  assert.doesNotMatch(insufficientHtml, /Fora do método/)
})

// FASE 16.6 — achado da auditoria: antes, ANÁLISE só mostrava
// `risks.service_risks` ("Risco na condução do vendedor") e nunca
// `risks.customer_objections`, mesmo sendo um risco estruturado com
// severidade (mandato §12: "resistência real" é um risco comercial
// legítimo). Agora os dois grupos aparecem, rotulados de forma
// distinta — e desde a FASE 16.7, objeção deixou de aparecer em
// CLIENTE por completo (mandato §17: objeção atual é conteúdo de
// ANÁLISE, nunca de CLIENTE — mesmo que já existisse evidência de
// severidade, o texto puro `customer.objections` duplicaria o mesmo
// fato que `risks.customer_objections` já cobre em ANÁLISE).
test('ANÁLISE mostra risco de objeção e risco de condução como grupos distintos; CLIENTE nunca mostra objeção', () => {
  const reading = buildReading()
  reading.risks.service_risks = [
    {
      kind: 'pressure',
      severity: 'high',
      summary: 'Há risco de pressão excessiva.',
      evidence_message_ids: ['message-6'],
      memory_ids: [],
    },
  ]

  const analysisHtml = view.renderAnalysisViewModel(analysisViewModelFromReading(reading))
  const clientHtml = view.renderCustomerViewModel(view.buildCustomerViewModelFromReading(reading))

  assert.match(analysisHtml, /data-yolen-risk-group="objection"/)
  assert.match(analysisHtml, /considera o preço alto/i)
  assert.match(analysisHtml, /data-yolen-risk-group="service"/)
  assert.match(analysisHtml, /Risco no atendimento/)
  assert.match(analysisHtml, /pressão excessiva/)
  assert.doesNotMatch(clientHtml, /Considera o preço alto/)
  assert.doesNotMatch(clientHtml, /Objeç/i)

  // Severidade traduzida para linguagem humana, nunca o enum técnico
  // exposto ao vendedor (mandato §21: "sem jargon interno").
  assert.match(analysisHtml, /Médio/)
  assert.match(analysisHtml, /Alto/)
  assert.doesNotMatch(analysisHtml, /"medium"|"high"/)
})

// FASE 16.7 — needs/interests/decision_criteria/open_questions viraram
// contexto secundário da oportunidade ou lacuna de descoberta (mandato
// §7/§13/§22); objeção nunca aparece (mandato §17).
test('Cliente agrupa somente dados existentes e mantém detalhe sob demanda', () => {
  const html = view.renderCustomerViewModel(view.buildCustomerViewModelFromReading(buildReading()))

  assert.match(html, /Contexto desta oportunidade/)
  assert.match(html, /Necessidades/)
  assert.match(html, /Critérios de decisão/)
  assert.match(html, /O que falta descobrir/)
  assert.match(html, /Qual é o prazo de implantação\?/)
  assert.doesNotMatch(html, /Objeç/i)
  assert.doesNotMatch(html, /data-yolen-client-field="discussed_products"/)
  assert.doesNotMatch(html, /data-yolen-client-field="missing_discovery"/)
  assert.doesNotMatch(html, /data-yolen-client-field="resolved_information"/)

  const empty = buildReading()
  empty.customer.needs = []
  empty.customer.interests = []
  empty.customer.decision_criteria = []
  empty.customer.preferences = []
  empty.customer.open_questions = []
  empty.customer.objections = []
  empty.customer.uncertainties = []

  assert.match(
    view.renderCustomerViewModel(view.buildCustomerViewModelFromReading(empty)),
    /data-yolen-customer-empty/,
  )
})

// FASE 16.5 (recalibração seller-facing do AGORA): resolveSellerAttentionSnapshot
// e renderNowAttentionSnapshot foram removidos — eram uma segunda
// implementação, independente e já divergente, da mesma priorização que
// Decision State (canonical-decision-state-source.ts, FASE 16.3E) já
// computa server-side (achado da auditoria da FASE 16.5). A lógica de
// candidato/prioridade agora vive só em
// app/lib/server/canonical-decision-state-source.ts (66 testes) e
// app/lib/server/agora-view-model.ts (39 testes) — este arquivo passou a
// testar só a RENDERIZAÇÃO do AgoraViewModel já pronto
// (renderAgoraViewModelSnapshot), não mais a decisão em si.

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

test('AGORA mostra somente o alerta primário quando não há secundários', () => {
  const agoraViewModel = buildAgoraViewModel({
    primary: buildAgoraSignal({
      status: 'escalate',
      priority: 'critical',
      headline: 'Oportunidade estagnada na etapa acima do limite de SLA.',
      action: 'Avaliar a oportunidade e decidir o próximo passo.',
      provenance: {
        decision_kind: 'escalate',
        source: 'client_sla',
        evidence_message_ids: [],
        memory_ids: [],
      },
    }),
  })

  const attention = view.renderAgoraViewModelSnapshot(agoraViewModel)

  assert.match(attention, /data-yolen-now-attention="escalate"/)
  assert.match(attention, /data-yolen-alert-priority="critical"/)
  assert.doesNotMatch(attention, /data-yolen-now-attention="off_method"/)
  assert.equal((attention.match(/data-yolen-now-attention=/g) || []).length, 1)
})

test('view model silencioso (nothing_to_do) não renderiza nenhum card, mesmo sem primary explícito', () => {
  assert.equal(
    view.renderAgoraViewModelSnapshot(
      buildAgoraViewModel({ silent: true, silent_reason: 'nothing_to_do', primary: null }),
    ),
    '',
  )
})

test('view model indisponível (unavailable, Decision State null) não renderiza nenhum card', () => {
  assert.equal(
    view.renderAgoraViewModelSnapshot(
      buildAgoraViewModel({ silent: true, silent_reason: 'unavailable', primary: null }),
    ),
    '',
  )
  assert.equal(view.renderAgoraViewModelSnapshot(null), '')
  assert.equal(view.renderAgoraViewModelSnapshot(undefined), '')
})

test('primary + até 2 secondary renderizam nessa ordem, sem inventar nem reordenar', () => {
  const agoraViewModel = buildAgoraViewModel({
    primary: buildAgoraSignal({
      status: 'handle_objection',
      priority: 'high',
      headline: 'Cliente acha o preço alto e ameaça desistir.',
      action: 'Tratar a objeção antes de avançar a conversa.',
    }),
    secondary: [
      buildAgoraSignal({
        status: 'follow_up',
        priority: 'high',
        headline: 'Envio da proposta revisada já venceu.',
        action: 'Confirmar com o cliente o andamento do compromisso.',
      }),
      buildAgoraSignal({
        status: 'deepen_discovery',
        priority: 'medium',
        headline: 'Etapa de diagnóstico pulada antes de apresentar o preço.',
        action: 'Retomar a descoberta antes de voltar a falar de preço.',
      }),
    ],
  })

  const html = view.renderAgoraViewModelSnapshot(agoraViewModel)

  assert.equal((html.match(/yolen-now-attention/g) || []).length > 0, true)
  assert.equal((html.match(/data-yolen-now-attention-variant="primary"/g) || []).length, 1)
  assert.equal((html.match(/data-yolen-now-attention-variant="secondary"/g) || []).length, 2)

  const primaryIndex = html.indexOf('Cliente acha o preço alto')
  const firstSecondaryIndex = html.indexOf('Envio da proposta revisada')
  const secondSecondaryIndex = html.indexOf('Etapa de diagnóstico pulada')

  assert.ok(primaryIndex >= 0 && firstSecondaryIndex > primaryIndex)
  assert.ok(secondSecondaryIndex > firstSecondaryIndex)
})

test('um terceiro secondary (não deveria acontecer, mas é defendido) nunca renderiza', () => {
  const agoraViewModel = buildAgoraViewModel({
    secondary: [
      buildAgoraSignal({ headline: 'Item 1' }),
      buildAgoraSignal({ headline: 'Item 2' }),
      buildAgoraSignal({ headline: 'Item 3' }),
    ],
  })

  const html = view.renderAgoraViewModelSnapshot(agoraViewModel)

  assert.equal((html.match(/data-yolen-now-attention-variant="secondary"/g) || []).length, 2)
  assert.doesNotMatch(html, /Item 3/)
})

test('give_space e escalate recebem tom visual distinto de respond/follow_up/handle_objection', () => {
  const giveSpaceHtml = view.renderAgoraViewModelSnapshot(
    buildAgoraViewModel({
      primary: buildAgoraSignal({
        status: 'give_space',
        priority: null,
        headline: 'Sessão atual não é comercial.',
        action: 'Responder no tom da conversa atual sem empurrar a venda.',
        provenance: { decision_kind: 'give_space', source: null, evidence_message_ids: [], memory_ids: [] },
      }),
    }),
  )
  assert.match(giveSpaceHtml, /yolen-now-attention--information/)

  const escalateHtml = view.renderAgoraViewModelSnapshot(
    buildAgoraViewModel({
      primary: buildAgoraSignal({
        status: 'escalate',
        priority: 'critical',
        headline: 'Oportunidade estagnada na etapa acima do limite de SLA.',
        action: 'Avaliar a oportunidade e decidir o próximo passo.',
      }),
    }),
  )
  assert.match(escalateHtml, /yolen-now-attention--risk/)

  const respondHtml = view.renderAgoraViewModelSnapshot(buildAgoraViewModel())
  assert.match(respondHtml, /yolen-now-attention--warning/)
})

// Achado do Codex (PR #283, rodada 1): `wait` mapeado para o status
// `follow_up` renderizava "Retomar contato" — o oposto do que a decisão
// `wait` significa (não agir/não comunicar agora). Prova fim-a-fim (view
// model → HTML renderizado) de que isso não volta a acontecer.
test('wait nunca renderiza "Retomar contato" nem tom de urgência — sempre "Nada a fazer agora", informativo', () => {
  const html = view.renderAgoraViewModelSnapshot(
    buildAgoraViewModel({
      primary: buildAgoraSignal({
        status: 'no_intervention',
        priority: null,
        headline: 'Cliente pediu um tempo para decidir.',
        action: 'Canal recomendado: wait.',
        provenance: { decision_kind: 'wait', source: null, evidence_message_ids: [], memory_ids: [] },
      }),
    }),
  )

  assert.doesNotMatch(html, /Retomar contato/)
  assert.match(html, /Nada a fazer agora/)
  assert.match(html, /yolen-now-attention--information/)
})

// Achado do Codex (PR #283, rodada 2): quando o presenter suprime a
// decisão principal (silent: false, primary: null, secondary não-vazio
// — ver agora-view-model.ts), renderAgoraViewModelSnapshot bailava cedo
// por checar `!agoraViewModel.primary`, descartando silenciosamente um
// sinal secundário real. Prova que o card secundário ainda renderiza
// nesse cenário.
test('view model com primary null mas secondary real (decisão principal suprimida) ainda renderiza o card secundário', () => {
  const html = view.renderAgoraViewModelSnapshot({
    silent: false,
    silent_reason: null,
    primary: null,
    secondary: [
      buildAgoraSignal({
        status: 'escalate',
        priority: 'critical',
        headline: 'Oportunidade estagnada na etapa acima do limite de SLA.',
        action: 'Avaliar a oportunidade e decidir o próximo passo.',
      }),
    ],
    reference_time: '2026-08-22T12:00:00.000Z',
  })

  assert.match(html, /Oportunidade estagnada na etapa acima do limite de SLA\./)
  assert.match(html, /data-yolen-now-attention-variant="secondary"/)
  assert.doesNotMatch(html, /data-yolen-now-attention-variant="primary"/)
})

test('todo conteúdo seller-facing escapa HTML não confiável', () => {
  const reading = buildReading()
  reading.seller_strengths[0].summary = '<img src=x onerror=alert(1)>'
  reading.customer.needs[0].summary = '<script>alert(1)</script>'

  const analysisHtml = view.renderAnalysisViewModel(analysisViewModelFromReading(reading))
  assert.doesNotMatch(analysisHtml, /<img/)
  assert.match(analysisHtml, /&lt;img/)

  const clientHtml = view.renderCustomerViewModel(view.buildCustomerViewModelFromReading(reading))
  assert.doesNotMatch(clientHtml, /<script>/)
  assert.match(clientHtml, /&lt;script&gt;/)
})
