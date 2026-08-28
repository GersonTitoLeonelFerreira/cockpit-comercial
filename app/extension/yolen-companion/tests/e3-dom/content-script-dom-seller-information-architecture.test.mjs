import assert from 'node:assert/strict'
import test from 'node:test'

import {
  analysisCalls,
  buildMessageHtml,
  buildWhatsAppPageHtml,
  defaultClientContext,
  loadContentScript,
  resolveLeadCalls,
  waitFor,
} from '../e3-test-support/load-content-script.mjs'

const HEADER_TITLE = '+55 11 98888-7777'

function evidence(summary, overrides = {}) {
  return {
    summary,
    evidence_message_ids: ['message-1'],
    memory_ids: [],
    ...overrides,
  }
}

function buildRichReading(overrides = {}) {
  return {
    contract_version: 'commercial-reading-v1',
    analysis_status: 'complete',
    analysis_limitations: [],
    commercial_role: 'buyer',
    commercial_relevance: 'commercial',
    conversation_summary: {
      current_state: evidence('Cliente interessado, mas o impacto ainda não foi confirmado.'),
    },
    customer: {
      objectives: [evidence('Aumentar a conversão comercial.')],
      problems: [evidence('Leads ficam sem follow-up.')],
      impacts: [evidence('Oportunidades são perdidas.')],
      needs: [evidence('Precisa reduzir perdas no follow-up.')],
      interests: [
        evidence('Tem interesse em automação comercial.'),
        evidence('Busca visibilidade gerencial.'),
      ],
      decision_criteria: [evidence('Implantação simples.')],
      preferences: [evidence('Prefere mensagens objetivas.')],
      open_questions: [evidence('Qual é o prazo de implantação?')],
      objections: [evidence('Considera o preço alto.')],
      uncertainties: [evidence('Ainda não confirmou o decisor.')],
      discussed_products: [evidence('Demonstrou interesse na Yolen.', {
        canonical_product_id: 'product-yolen',
        name: 'Yolen',
        interest_level: 'primary',
      })],
      primary_product_interest: evidence('Demonstrou interesse na Yolen.', {
        canonical_product_id: 'product-yolen',
        name: 'Yolen',
        interest_level: 'primary',
      }),
      competitors: [
        evidence('Está comparando com a RD Station.', {
          name: 'RD Station',
          mention_type: 'named',
        }),
        evidence('Também avalia outra solução.', {
          name: null,
          mention_type: 'unnamed_alternative',
        }),
      ],
      commitments: [evidence('Demonstração confirmada.', {
        status: 'confirmed',
        scheduled_at: '2026-08-22T15:00:00-03:00',
        proposed_at: '2026-08-21T12:00:00-03:00',
      })],
      missing_discovery: [evidence('O impacto financeiro ainda precisa ser confirmado.', {
        topic: 'impact',
        memory_ids: ['missing-impact'],
      })],
      resolved_information: [evidence('Informação resolvida: orçamento confirmado.', {
        category: 'missing_discovery',
        memory_ids: ['missing-budget'],
      })],
      superseded_information: [evidence('Informação anterior substituída: preço era o critério principal.', {
        category: 'decision_criterion',
        memory_ids: ['criterion-old'],
      })],
      communication: {
        patterns: [evidence('Pediu dados em diferentes momentos.', {
          observation_type: 'pattern',
          behavior: 'requests_data_or_numbers',
        })],
        events: [evidence('Fez uma pergunta direta nesta mensagem.', {
          observation_type: 'event',
          behavior: 'direct_questions',
        })],
      },
    },
    commercial_evolution: [
      {
        label: 'Descoberta',
        status: 'partial',
        explanation: 'Necessidade confirmada; impacto em aberto.',
      },
    ],
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
        status: 'off_method',
        summary: 'A condução saiu do método no diagnóstico.',
        deviation_stage_order: 2,
        what_happened: 'O preço foi apresentado antes de confirmar o impacto.',
        missing_information: ['Impacto financeiro'],
        why_it_matters: 'Sem impacto, o valor parece abstrato.',
        evidence_message_ids: ['message-2'],
        memory_ids: [],
      },
      recovery_guidance: {
        objective: 'Retomar o diagnóstico.',
        missing_information: ['Urgência da decisão'],
        recommended_move: 'Perguntar sobre impacto e urgência.',
        optional_question: 'O que acontece se isso continuar por mais três meses?',
        evidence_message_ids: ['message-2'],
        memory_ids: [],
      },
    },
    seller_strengths: [
      {
        kind: 'good_discovery',
        summary: 'Você confirmou a necessidade antes de apresentar a solução.',
        why_it_matters: 'Evita uma proposta genérica.',
        evidence_message_ids: ['message-1', 'message-2'],
        memory_ids: [],
      },
    ],
    improvement_points: [
      {
        kind: 'premature_price',
        summary: 'Você apresentou preço antes de concluir o diagnóstico.',
        why_it_matters: 'O cliente ainda não percebeu todo o valor.',
        impact: 'A conversa pode ficar restrita à comparação de preço.',
        how_to_improve: 'Confirme o impacto antes de retomar a proposta.',
        evidence_message_ids: ['message-2'],
        memory_ids: [],
      },
    ],
    risks: {
      customer_objections: [
        {
          kind: 'price',
          severity: 'medium',
          summary: 'O cliente considera o preço alto.',
          evidence_message_ids: ['message-2'],
          memory_ids: [],
        },
      ],
      service_risks: [
        {
          kind: 'premature_price',
          severity: 'high',
          summary: 'Há risco de condução apressada.',
          evidence_message_ids: ['message-2'],
          memory_ids: [],
        },
      ],
    },
    best_approach: {
      decision: 'deepen_discovery',
      reason: 'Entender o impacto antes de continuar negociando.',
      channel: 'text',
      evidence_message_ids: ['message-2'],
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
    ...overrides,
  }
}

function analysisPayload(reading) {
  return {
    ok: true,
    data: {
      engine_source: 'stateful',
      commercial_reading: reading,
      suggestion: {
        summary: 'Aprofunde o diagnóstico.',
        recommended_status: 'contato',
        confidence: 0.9,
        next_action: 'Confirmar o impacto do problema.',
        next_action_date: null,
      },
      coaching: {
        suggested_message: 'Fallback legado que não deve substituir o V2.',
      },
    },
  }
}

function initialPageHtml() {
  return buildWhatsAppPageHtml({
    headerTitle: HEADER_TITLE,
    messagesHtml: [
      buildMessageHtml({
        id: 'msg-1',
        prePlainText: '[10:15, 21/08/2026] Cliente Teste: ',
        text: 'Preciso reduzir perdas no acompanhamento comercial e entender o prazo.',
      }),
      buildMessageHtml({
        id: 'msg-2',
        prePlainText: '[10:16, 21/08/2026] Vendedor Teste: ',
        text: 'Antes de avançarmos, qual impacto isso gera hoje para sua equipe?',
        direction: 'outgoing',
      }),
    ].join(''),
  })
}

async function analyze({ document, calls }) {
  const button = await waitFor(() =>
    document.querySelector('[data-yolen-action="analyze-conversation"]'),
  )

  button.click()
  await waitFor(() => analysisCalls(calls).length > 0)
}

test('AGORA é padrão e as três áreas têm navegação semântica por clique e teclado', async () => {
  const runtime = loadContentScript({
    initialHtml: initialPageHtml(),
    analysisResult: analysisPayload(buildRichReading()),
  })

  await waitFor(() => runtime.document.querySelector('[role="tablist"]'))

  const tabs = [...runtime.document.querySelectorAll('[role="tab"]')]
  assert.deepEqual(tabs.map((tab) => tab.textContent.trim()), ['Agora', 'Análise', 'Cliente'])
  assert.equal(tabs[0].getAttribute('aria-selected'), 'true')
  assert.equal(runtime.document.querySelector('[data-yolen-seller-panel="now"]').hidden, false)
  assert.equal(runtime.document.querySelector('[data-yolen-seller-panel="analysis"]').hidden, true)

  tabs[1].click()
  await waitFor(() =>
    runtime.document.querySelector('[data-yolen-seller-area="analysis"]')?.getAttribute('aria-selected') === 'true',
  )
  assert.equal(runtime.document.querySelector('[data-yolen-seller-panel="analysis"]').hidden, false)

  const activeAnalysisTab = runtime.document.querySelector('[data-yolen-seller-area="analysis"]')
  activeAnalysisTab.dispatchEvent(new runtime.dom.window.KeyboardEvent('keydown', {
    key: 'ArrowRight',
    bubbles: true,
  }))

  await waitFor(() =>
    runtime.document.querySelector('[data-yolen-seller-area="client"]')?.getAttribute('aria-selected') === 'true',
  )
  assert.equal(runtime.document.querySelector('[data-yolen-seller-panel="client"]').hidden, false)
})

test('V2 rico distribui prioridade, coaching, método, recovery e cliente nas áreas corretas', async () => {
  const runtime = loadContentScript({
    initialHtml: initialPageHtml(),
    analysisResult: analysisPayload(buildRichReading()),
    clientContextResult: defaultClientContext({
      timeline: [
        {
          type: 'message',
          occurred_at: '2026-08-22T09:42:00.000Z',
          label: 'Cliente pediu prazo de implantação.',
        },
      ],
      sla: {
        configured: true,
        applicable: true,
        stage: 'contato',
        stage_label: 'CONTATO',
        target_minutes: 60,
        warning_minutes: 120,
        danger_minutes: 240,
        elapsed_minutes: 300,
        risk: 'high',
      },
    }),
  })

  await analyze(runtime)
  await waitFor(() =>
    runtime.document.querySelector(
      '[data-yolen-analysis-section="strengths"]',
    ),
  )
  await waitFor(() =>
    runtime.document
      .querySelector('[data-yolen-seller-panel="now"]')
      ?.textContent.includes('Risco alto na etapa CONTATO'),
  )

  const nowPanel = runtime.document.querySelector('[data-yolen-seller-panel="now"]')
  assert.match(nowPanel.textContent, /Resumo/i)
  assert.match(nowPanel.textContent, /Risco alto na etapa CONTATO/)
  assert.equal(nowPanel.querySelectorAll('[data-yolen-now-attention]').length, 1)
  assert.doesNotMatch(
    nowPanel.textContent,
    /Método Consultivo|Fora do método|Acertos|Pontos de melhoria/,
  )
  // A mensagem automática antiga não ocupa mais o AGORA. A geração
  // seller-facing fica no composer contextual montado pela orientação.
  assert.doesNotMatch(
    nowPanel.textContent,
    /Fallback legado que não deve substituir o V2/,
  )
  assert.doesNotMatch(nowPanel.textContent, /Pergunta recomendada/)

  runtime.document.querySelector('[data-yolen-seller-area="analysis"]').click()
  await waitFor(() => !runtime.document.querySelector('[data-yolen-seller-panel="analysis"]').hidden)

  const analysisPanel = runtime.document.querySelector('[data-yolen-seller-panel="analysis"]')
  assert.match(analysisPanel.textContent, /Acertos/)
  assert.match(analysisPanel.textContent, /Evita uma proposta genérica/)
  assert.match(analysisPanel.textContent, /Pontos de melhoria/)
  assert.match(analysisPanel.textContent, /Por que isso importa/)
  assert.match(analysisPanel.textContent, /Impacto ou risco/)
  assert.match(analysisPanel.textContent, /Como corrigir/)
  assert.match(analysisPanel.textContent, /Método Consultivo/)
  assert.ok(analysisPanel.querySelector('[data-yolen-current-method-stage="true"]'))
  assert.ok(analysisPanel.querySelector('[data-yolen-method-adherence="off_method"]'))
  assert.ok(analysisPanel.querySelector('[data-yolen-method-recovery]'))
  assert.equal(analysisPanel.querySelector('[data-yolen-risk-group="customer"]'), null)
  assert.doesNotMatch(analysisPanel.textContent, /cliente considera o preço alto/i)
  assert.match(analysisPanel.querySelector('[data-yolen-risk-group="seller"]').textContent, /condução apressada/)

  runtime.document.querySelector('[data-yolen-seller-area="client"]').click()
  await waitFor(() => !runtime.document.querySelector('[data-yolen-seller-panel="client"]').hidden)
  await waitFor(() => runtime.document.querySelector('.yolen-client-relationship-card'))

  const clientPanel = runtime.document.querySelector('[data-yolen-seller-panel="client"]')
  assert.match(clientPanel.textContent, /Aumentar a conversão comercial/)
  assert.match(clientPanel.textContent, /O que ele quer/)
  assert.match(clientPanel.textContent, /Contexto e problema/)
  assert.match(clientPanel.textContent, /Como ele decide/)
  assert.match(clientPanel.textContent, /Comunicação observada/)
  assert.match(clientPanel.textContent, /Ainda precisamos descobrir/)
  assert.match(clientPanel.textContent, /Objeções atuais do cliente/)
  assert.match(clientPanel.textContent, /Considera o preço alto/)
  assert.match(clientPanel.textContent, /Compromissos comerciais/)
  assert.match(clientPanel.textContent, /Informações resolvidas e atualizadas/)
  assert.ok(clientPanel.querySelector('[data-yolen-client-product-source="catalog"]'))
  assert.ok(clientPanel.querySelector('[data-yolen-client-competitor-type="named"]'))
  assert.ok(clientPanel.querySelector('[data-yolen-client-competitor-type="unnamed_alternative"]'))
  assert.ok(clientPanel.querySelector('[data-yolen-client-communication="requests_data_or_numbers"]'))
  assert.ok(clientPanel.querySelector('[data-yolen-client-missing-topic="impact"]'))
  assert.match(clientPanel.textContent, /Relacionamento e histórico/)
  assert.match(clientPanel.textContent, /Cliente aguardando você/)
  assert.match(clientPanel.textContent, /Risco alto/)
  assert.match(clientPanel.textContent, /Ver histórico/)
  assert.ok(clientPanel.querySelector('details.yolen-client-timeline'))

  const wants = clientPanel.querySelector('[data-yolen-client-intelligence-group="wants"]')
  assert.equal(wants.open, false)
  wants.querySelector('summary').click()
  assert.equal(wants.open, true)
})

test('non-commercial neutraliza AGORA e ANÁLISE sem apagar fatos persistidos do cliente', async () => {
  const reading = buildRichReading({
    commercial_relevance: 'non_commercial',
    conversation_summary: {
      current_state: evidence('Conversa casual.'),
    },
  })

  const runtime = loadContentScript({
    initialHtml: initialPageHtml(),
    analysisResult: analysisPayload(reading),
  })

  await analyze(runtime)
  await waitFor(() =>
    runtime.document.querySelector(
      '[data-yolen-analysis-neutral]',
    ),
  )

  const nowPanel = runtime.document.querySelector('[data-yolen-seller-panel="now"]')
  assert.doesNotMatch(nowPanel.textContent, /Método Consultivo|Mensagem sugerida|Preço apresentado/)

  runtime.document.querySelector('[data-yolen-seller-area="analysis"]').click()
  const analysisPanel = runtime.document.querySelector('[data-yolen-seller-panel="analysis"]')
  assert.match(analysisPanel.textContent, /não possui análise comercial atual/i)
  assert.doesNotMatch(analysisPanel.textContent, /Pontos de melhoria|Método Consultivo/)

  runtime.document.querySelector('[data-yolen-seller-area="client"]').click()
  await waitFor(() => runtime.document.querySelector('.yolen-client-relationship-card'))
  const clientPanel = runtime.document.querySelector('[data-yolen-seller-panel="client"]')
  assert.match(clientPanel.textContent, /Aumentar a conversão comercial/)
  assert.match(clientPanel.textContent, /O impacto financeiro ainda precisa ser confirmado/)
  assert.match(clientPanel.textContent, /Precisa reduzir perdas no follow-up/)
  assert.match(clientPanel.textContent, /Relacionamento/)
})

test('V1 pobre usa progressive enhancement sem afirmar ausência de erro ou risco', async () => {
  const runtime = loadContentScript({
    initialHtml: initialPageHtml(),
    analysisResult: {
      ok: true,
      data: {
        engine_source: 'legacy',
        suggestion: {
          summary: 'Confirme o próximo passo com o cliente.',
          recommended_status: 'contato',
          confidence: 0.7,
          next_action: 'Retomar contato amanhã.',
        },
        coaching: {
          suggested_message: 'Posso retomar esse ponto amanhã?',
        },
      },
    },
  })

  await analyze(runtime)
  await waitFor(() => runtime.document.querySelector('[data-yolen-analysis-progressive]'))

  const nowPanel = runtime.document.querySelector('[data-yolen-seller-panel="now"]')
  assert.doesNotMatch(
    nowPanel.textContent,
    /Confirme o próximo passo com o cliente/,
  )

  runtime.document.querySelector('[data-yolen-seller-area="analysis"]').click()
  const analysisPanel = runtime.document.querySelector('[data-yolen-seller-panel="analysis"]')
  assert.match(
    analysisPanel.textContent,
    /Confirme o próximo passo com o cliente/,
  )
  assert.match(analysisPanel.textContent, /Ainda não há análise detalhada/)
  assert.doesNotMatch(analysisPanel.textContent, /nenhum erro|sem risco/i)
})

test('loading e error da análise aparecem sem quebrar a navegação', async () => {
  let releaseAnalysis
  const deferredAnalysis = new Promise((resolve) => {
    releaseAnalysis = resolve
  })

  const loadingRuntime = loadContentScript({
    initialHtml: initialPageHtml(),
    analysisResult: () => deferredAnalysis,
  })

  await analyze(loadingRuntime)
  loadingRuntime.document.querySelector('[data-yolen-seller-area="analysis"]').click()
  await waitFor(() => loadingRuntime.document.querySelector('[data-yolen-analysis-loading]'))
  assert.match(
    loadingRuntime.document.querySelector('[data-yolen-analysis-loading]').textContent,
    /Analisando sua condução comercial/,
  )

  releaseAnalysis(analysisPayload(buildRichReading()))
  await waitFor(() => loadingRuntime.document.querySelector('[data-yolen-analysis-section="strengths"]'))

  const errorRuntime = loadContentScript({
    initialHtml: initialPageHtml(),
    analysisResult: {
      ok: false,
      error: 'Falha controlada na análise.',
    },
  })

  await analyze(errorRuntime)
  errorRuntime.document.querySelector('[data-yolen-seller-area="analysis"]').click()
  await waitFor(() => errorRuntime.document.querySelector('[data-yolen-analysis-error]'))
  assert.match(errorRuntime.document.querySelector('[data-yolen-analysis-error]').textContent, /Falha controlada/)
  assert.equal(
    errorRuntime.document.querySelector('[data-yolen-analysis-error]').getAttribute('role'),
    'alert',
  )
  const previousAnalysisCalls = analysisCalls(errorRuntime.calls).length
  errorRuntime.document
    .querySelector('[data-yolen-seller-panel="analysis"] [data-yolen-action="analyze-conversation"]')
    .click()
  await waitFor(() => analysisCalls(errorRuntime.calls).length > previousAnalysisCalls)
  assert.ok(errorRuntime.document.querySelector('[data-yolen-seller-area="client"]'))
})

test('troca de conversa volta para AGORA e não mantém a área ativa anterior', async () => {
  const runtime = loadContentScript({
    initialHtml: initialPageHtml(),
  })

  await waitFor(() => resolveLeadCalls(runtime.calls).length > 0)
  runtime.document.querySelector('[data-yolen-seller-area="client"]').click()
  await waitFor(() =>
    runtime.document.querySelector('[data-yolen-seller-area="client"]')?.getAttribute('aria-selected') === 'true',
  )

  const previousResolveCount = resolveLeadCalls(runtime.calls).length
  const nextTitle = '+55 21 97777-6666'
  const title = runtime.document.querySelector('header span[title]')
  title.setAttribute('title', nextTitle)
  title.textContent = nextTitle
  runtime.document.getElementById('conversation-body').innerHTML = buildMessageHtml({
    id: 'msg-next',
    prePlainText: '[11:30, 21/08/2026] Cliente Dois: ',
    text: 'Quero entender como funciona a implantação para uma nova operação.',
  })

  await waitFor(() => resolveLeadCalls(runtime.calls).length > previousResolveCount)
  await waitFor(() =>
    runtime.document.querySelector('[data-yolen-seller-area="now"]')?.getAttribute('aria-selected') === 'true',
  )

  assert.equal(runtime.document.querySelector('[data-yolen-seller-panel="now"]').hidden, false)
  assert.equal(runtime.document.querySelector('[data-yolen-seller-panel="client"]').hidden, true)
})
