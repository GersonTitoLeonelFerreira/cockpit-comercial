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

test('sessões non-commercial e uncertain permanecem neutras', () => {
  const nonCommercial = buildReading({ commercial_relevance: 'non_commercial' })
  const uncertain = buildReading({ commercial_relevance: 'uncertain' })

  assert.equal(view.isNeutralCommercialSession(nonCommercial), true)
  assert.equal(view.isNeutralCommercialSession(uncertain), true)
  assert.match(view.getNeutralSessionCopy(nonCommercial).title, /sem evidência comercial relevante/i)
  assert.match(view.getNeutralSessionCopy(uncertain).title, /evidência comercial suficiente/i)
  assert.match(view.renderAnalysisArea(nonCommercial), /não possui análise comercial atual/i)
  assert.doesNotMatch(view.renderAnalysisArea(nonCommercial), /Pontos de melhoria|Método Consultivo/)
})

test('coaching mostra acerto concreto, importância e evidência', () => {
  const html = view.renderAnalysisArea(buildReading())

  assert.match(html, /Acertos/)
  assert.match(html, /Boa descoberta/)
  assert.match(html, /confirmou a necessidade/)
  assert.match(html, /Evita uma proposta genérica/)
  assert.match(html, /Evidência: 2 mensagens da conversa e 1 memória comercial/)
})

test('melhoria mostra ocorrência, importância, impacto e correção', () => {
  const html = view.renderAnalysisArea(buildReading())

  assert.match(html, /Pontos de melhoria/)
  assert.match(html, /Preço apresentado cedo demais/)
  assert.match(html, /Por que isso importa/)
  assert.match(html, /Impacto ou risco/)
  assert.match(html, /Como corrigir/)
  assert.match(html, /Confirme o impacto do problema/)
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

  const html = view.renderAnalysisArea(reading)

  for (const status of statuses) {
    assert.match(html, new RegExp(`data-yolen-method-stage-status="${status}"`))
  }

  assert.match(html, /data-yolen-current-method-stage="true"/)
  assert.match(html, /Etapa atual/)
})

test('aderência traduz on_method e partially_on_method para linguagem humana', () => {
  const onMethod = view.renderAnalysisArea(buildReading())
  assert.match(onMethod, /Dentro do método/)

  const reading = buildReading()
  reading.method.adherence.status = 'partially_on_method'
  reading.method.adherence.summary = 'Parte da descoberta ainda está incompleta.'

  const partial = view.renderAnalysisArea(reading)
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

  const html = view.renderAnalysisArea(reading)

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

  const notConfiguredHtml = view.renderAnalysisArea(notConfigured)
  assert.match(notConfiguredHtml, /Método comercial não configurado/)
  assert.doesNotMatch(notConfiguredHtml, /Como voltar para o método/)

  const insufficient = buildReading()
  insufficient.method.adherence.status = 'insufficient_evidence'
  insufficient.method.adherence.summary = 'Poucas mensagens disponíveis.'

  const insufficientHtml = view.renderAnalysisArea(insufficient)
  assert.match(insufficientHtml, /Evidência insuficiente/)
  assert.match(insufficientHtml, /Não há evidência suficiente para avaliar esta etapa/)
  assert.doesNotMatch(insufficientHtml, /Fora do método/)
})

test('objeção fica em CLIENTE e ANÁLISE mostra somente risco da condução', () => {
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

  const analysisHtml = view.renderAnalysisArea(reading)
  const clientHtml = view.renderClientCommercialArea(reading)

  assert.doesNotMatch(analysisHtml, /data-yolen-risk-group="customer"/)
  assert.doesNotMatch(analysisHtml, /considera o preço alto/)
  assert.match(analysisHtml, /data-yolen-risk-group="seller"/)
  assert.match(analysisHtml, /Risco na condução do vendedor/)
  assert.match(analysisHtml, /pressão excessiva/)
  assert.match(clientHtml, /Objeções atuais do cliente/)
  assert.match(clientHtml, /Considera o preço alto/)
})

test('Cliente agrupa somente dados existentes e mantém detalhe sob demanda', () => {
  const html = view.renderClientCommercialArea(buildReading())

  assert.match(html, /O que ele quer/)
  assert.match(html, /Necessidades/)
  assert.match(html, /Critérios de decisão/)
  assert.match(html, /Outros pontos em aberto/)
  assert.match(html, /Perguntas em aberto/)
  assert.match(html, /Objeções atuais do cliente/)
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

  assert.equal(view.renderClientCommercialArea(empty), '')
})

test('AGORA mostra somente o alerta de maior prioridade e deixa o detalhe do método em ANÁLISE', () => {
  const reading = buildReading()
  reading.improvement_points = []
  reading.method.adherence.status = 'off_method'
  reading.method.adherence.summary = 'Preço antes do diagnóstico.'

  const contextState = {
    status: 'ready',
    data: {
      sla: {
        configured: true,
        applicable: true,
        risk: 'high',
        stage: 'contato',
        stage_label: 'Contato',
      },
    },
  }

  const method = view.renderNowMethodSnapshot(reading)
  const attention = view.renderNowAttentionSnapshot(reading, contextState)

  assert.match(method, /Diagnóstico · Ativa/)
  assert.doesNotMatch(method, /Fora do método/)
  assert.match(attention, /data-yolen-now-attention="sla"/)
  assert.match(attention, /data-yolen-alert-priority="critical"/)
  assert.doesNotMatch(attention, /data-yolen-now-attention="off_method"/)
  assert.doesNotMatch(attention, /considera o preço alto/)
  assert.equal((attention.match(/data-yolen-now-attention=/g) || []).length, 1)
})

function buildQuietReading(overrides = {}) {
  const reading = buildReading(overrides)
  reading.improvement_points = []
  reading.risks.service_risks = []
  reading.customer.open_questions = []
  reading.customer.objections = []
  reading.risks.customer_objections = []
  reading.best_approach.decision = 'deepen_discovery'
  reading.communication.intervention_needed = false
  reading.communication.recommended_question = null
  reading.communication.recommended_message = null
  return reading
}

function contextWith({
  waitingState = 'no_pending_response',
  waitingDurationMs = null,
  slaConfigured = false,
  slaRisk = null,
  elapsedMinutes = null,
  warningMinutes = null,
  dangerMinutes = null,
} = {}) {
  return {
    status: 'ready',
    data: {
      generated_at: '2026-08-22T12:00:00.000Z',
      waiting: {
        state: waitingState,
        waiting_duration_ms: waitingDurationMs,
      },
      sla: {
        configured: slaConfigured,
        applicable: true,
        risk: slaRisk,
        stage: 'contato',
        stage_label: 'Contato',
        elapsed_minutes: elapsedMinutes,
        target_minutes: 60,
        warning_minutes: warningMinutes,
        danger_minutes: dangerMinutes,
      },
    },
  }
}

test('resolvedor fica quieto sem sinal útil e cria um único alerta quando necessário', () => {
  const reading = buildQuietReading()

  assert.equal(view.resolveSellerAttentionSnapshot(reading, null), null)
  assert.equal(view.renderNowAttentionSnapshot(reading, null), '')

  reading.method.adherence.status = 'off_method'
  const attention = view.resolveSellerAttentionSnapshot(reading, null)

  assert.deepEqual(attention, {
    priority: 'high',
    source: 'off_method',
    label: 'Atenção · Método',
    copy: 'Você saiu do método.',
  })
})

test('crítico vence alto e médio independentemente da ordem dos sinais', () => {
  const reading = buildQuietReading()
  reading.method.adherence.status = 'off_method'
  reading.improvement_points = [
    {
      kind: 'insufficient_discovery',
      summary: 'Ainda falta aprofundar o impacto.',
    },
  ]
  reading.risks.service_risks = [
    {
      kind: 'promise_risk',
      severity: 'high',
      summary: 'A promessa apresentada não está sustentada.',
    },
  ]

  const attention = view.resolveSellerAttentionSnapshot(reading, null)

  assert.equal(attention.source, 'service_risk')
  assert.equal(attention.priority, 'critical')
  assert.match(attention.copy, /promessa apresentada/)
})

test('product_fit incerto aparece como contexto informativo e vence descoberta insuficiente moderada', () => {
  const reading = buildQuietReading()

  reading.customer.missing_discovery = [
    {
      topic: 'product_fit',
      summary:
        'Ainda não está comprovado se a cliente busca apenas informações sobre a aula ou se avalia algum plano da academia.',
      evidence_message_ids: ['message-1'],
      memory_ids: [],
    },
  ]

  reading.improvement_points = [
    {
      kind: 'insufficient_discovery',
      summary:
        'O vendedor ainda não perguntou sobre o interesse do cliente em planos ou outras preferências.',
    },
  ]

  const attention =
    view.resolveSellerAttentionSnapshot(
      reading,
      null,
    )

  assert.deepEqual(
    attention,
    {
      priority: 'medium',
      source:
        'commercial_intent_uncertain',
      label:
        'Intenção comercial ainda não confirmada',
      copy:
        'Ainda não está comprovado se a cliente busca apenas informações sobre a aula ou se avalia algum plano da academia.',
    },
  )

  const html =
    view.renderNowAttentionSnapshot(
      reading,
      null,
    )

  assert.match(
    html,
    /yolen-now-attention--information/,
  )

  assert.doesNotMatch(
    html,
    /Atenção na condução/,
  )
})

test('erro grave do vendedor continua vencendo incerteza informativa de product_fit', () => {
  const reading = buildQuietReading()

  reading.customer.missing_discovery = [
    {
      topic: 'product_fit',
      summary:
        'Ainda não está claro se existe intenção de compra.',
      evidence_message_ids: ['message-1'],
      memory_ids: [],
    },
  ]

  reading.improvement_points = [
    {
      kind: 'pressure',
      summary:
        'Você pressionou por uma resposta imediata.',
    },
  ]

  const attention =
    view.resolveSellerAttentionSnapshot(
      reading,
      null,
    )

  assert.equal(
    attention.source,
    'improvement',
  )
  assert.equal(
    attention.priority,
    'high',
  )
  assert.match(
    attention.label,
    /Atenção na condução/,
  )
})

test('aderência parcial, método não configurado e evidência insuficiente não viram falso alerta', () => {
  for (const status of [
    'partially_on_method',
    'not_configured',
    'insufficient_evidence',
  ]) {
    const reading = buildQuietReading()
    reading.method.adherence.status = status
    reading.method.configured = status !== 'not_configured'

    assert.equal(
      view.resolveSellerAttentionSnapshot(reading, null),
      null,
      status,
    )
  }
})

test('SLA usa apenas limites configurados e evolui de low para medium e high com o tick local', () => {
  const reading = buildQuietReading()
  const context = contextWith({
    slaConfigured: true,
    slaRisk: 'low',
    elapsedMinutes: 30,
    warningMinutes: 60,
    dangerMinutes: 120,
  })
  const generatedAt = new Date('2026-08-22T12:00:00.000Z').getTime()

  assert.equal(
    view.resolveSellerAttentionSnapshot(reading, context, { now: generatedAt }),
    null,
  )

  const medium = view.resolveSellerAttentionSnapshot(reading, context, {
    now: generatedAt + 30 * 60 * 1000,
  })
  assert.equal(medium.source, 'sla')
  assert.equal(medium.priority, 'high')

  const high = view.resolveSellerAttentionSnapshot(reading, context, {
    now: generatedAt + 90 * 60 * 1000,
  })
  assert.equal(high.source, 'sla')
  assert.equal(high.priority, 'critical')
})

test('espera sem SLA só chama atenção quando o cliente aguarda; vendedor aguardando e ciclo fechado ficam quietos', () => {
  const reading = buildQuietReading()
  const customerWaiting = contextWith({
    waitingState: 'customer_waiting_for_seller',
    waitingDurationMs: 2 * 60 * 60 * 1000,
  })
  const sellerWaiting = contextWith({
    waitingState: 'seller_waiting_for_customer',
    waitingDurationMs: 6 * 60 * 60 * 1000,
  })

  assert.equal(
    view.resolveSellerAttentionSnapshot(reading, customerWaiting)?.source,
    'waiting',
  )
  assert.equal(view.resolveSellerAttentionSnapshot(reading, sellerWaiting), null)
  assert.equal(
    view.resolveSellerAttentionSnapshot(reading, customerWaiting, { cycleClosed: true }),
    null,
  )
})

test('sem SLA configurado não inventa risco e espera curta permanece silenciosa', () => {
  const reading = buildQuietReading()
  const context = contextWith({
    waitingState: 'customer_waiting_for_seller',
    waitingDurationMs: 20 * 60 * 1000,
  })

  assert.equal(view.resolveSellerAttentionSnapshot(reading, context), null)
})

test('pergunta ignorada, objeção aberta e pressão recebem prioridades proporcionais', () => {
  const question = buildQuietReading()
  question.best_approach.decision = 'respond'
  question.customer.open_questions = [evidence('Qual é o prazo?')]
  assert.equal(
    view.resolveSellerAttentionSnapshot(question, null)?.source,
    'open_question',
  )

  const objection = buildQuietReading()
  objection.best_approach.decision = 'handle_objection'
  objection.customer.objections = [evidence('Está caro.')]
  assert.deepEqual(
    view.resolveSellerAttentionSnapshot(objection, null),
    {
      priority: 'medium',
      source: 'customer_objection',
      label: 'Atenção · Objeção aberta',
      copy: 'Há uma objeção relevante do cliente para tratar.',
    },
  )

  const pressure = buildQuietReading()
  pressure.improvement_points = [{
    kind: 'pressure',
    summary: 'Você pressionou por uma resposta imediata.',
  }]
  assert.equal(
    view.resolveSellerAttentionSnapshot(pressure, null)?.priority,
    'high',
  )
})

test('non-commercial e fallback V1 sem dados ricos nunca fabricam alerta', () => {
  const neutral = buildQuietReading({ commercial_relevance: 'non_commercial' })
  neutral.method.adherence.status = 'off_method'

  assert.equal(view.resolveSellerAttentionSnapshot(neutral, null), null)
  assert.equal(
    view.resolveSellerAttentionSnapshot({
      analysis_status: 'complete',
      commercial_role: 'buyer',
      commercial_relevance: 'commercial',
    }, null),
    null,
  )
})

test('todo conteúdo seller-facing escapa HTML não confiável', () => {
  const reading = buildReading()
  reading.seller_strengths[0].summary = '<img src=x onerror=alert(1)>'
  reading.customer.needs[0].summary = '<script>alert(1)</script>'

  assert.doesNotMatch(view.renderAnalysisArea(reading), /<img/)
  assert.match(view.renderAnalysisArea(reading), /&lt;img/)
  assert.doesNotMatch(view.renderClientCommercialArea(reading), /<script>/)
  assert.match(view.renderClientCommercialArea(reading), /&lt;script&gt;/)
})
