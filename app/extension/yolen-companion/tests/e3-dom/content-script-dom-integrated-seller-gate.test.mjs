// FASE 13 — FECHAMENTO FUNCIONAL DO COMPANION — FRENTE 3A (validação
// integrada preparatória: AGORA + ANÁLISE + CLIENTE).
//
// Este arquivo é auditoria + prova, não implementação: content-script.js e
// o harness compartilhado (load-content-script.mjs) NÃO são modificados
// aqui. Ele complementa, sem duplicar, a cobertura já existente em
// content-script-dom-deep-analysis-delivery.test.mjs,
// content-script-dom-seller-information-architecture.test.mjs,
// content-script-dom-analysis-context-guard.test.mjs,
// content-script-dom-analysis-request-lifecycle.test.mjs,
// content-script-dom-stale-analysis-cross-conversation-race.test.mjs,
// content-script-dom-client-relationship.test.mjs e
// content-script-dom-client-relationship-live-refresh.test.mjs, e no teste
// unitário tests/companion-seller-information-view.test.mjs.
//
// O que este arquivo prova, especificamente, que os testes acima não
// provam isoladamente:
//
// 1) Que AGORA, ANÁLISE e CLIENTE, exercitados através do pipeline REAL de
//    content-script.js (clique real -> ANALYZE_CONVERSATION -> poll real ->
//    GET_ANALYSIS_JOB_STATUS -> renderPanel real), nunca se contradizem
//    entre si a partir da MESMA leitura comercial: uma objeção aberta deve
//    aparecer como prioridade em AGORA, como conhecimento em CLIENTE, e
//    NUNCA como o conteúdo do cliente dentro de ANÁLISE (que mostra somente
//    risco de condução do vendedor) — o teste unitário citado acima prova
//    isso chamando sellerInformationViewTools diretamente; aqui provamos que
//    o mesmo é verdade quando as três áreas nascem do mesmo ciclo real de
//    análise em voo.
// 2) O estado vazio de nível superior de CLIENTE (`data-yolen-client-empty`,
//    produzido só por getClientInformationAreaHtml quando NEM leitura
//    comercial NEM relacionamento existem) — coberto até aqui só
//    indiretamente pelo estado vazio do sub-card de relacionamento
//    (`yolen-client-relationship--empty`), que é uma condição diferente.
// 3) Um único tick de erro de rede durante o polling de análise profunda
//    (GET_ANALYSIS_JOB_STATUS rejeitando uma vez) não vira falha terminal —
//    a UI permanece em loading e o próximo tick, bem-sucedido, ainda é
//    aplicado normalmente às três áreas. Nenhum teste existente localizado
//    nesta auditoria exercita essa rejeição especificamente dentro do loop
//    de poll (distinto de falha na chamada inicial ANALYZE_CONVERSATION,
//    essa sim já coberta por content-script-dom-analysis-request-lifecycle).
// 4) "Vendedor aguardando cliente" nunca produz urgência artificial em
//    AGORA, enquanto CLIENTE mostra a espera corretamente — exercitado aqui
//    através do wiring real de ponta a ponta (client-context real + leitura
//    comercial real), não só da função pura isolada.
// 5) Uma falha isolada em client-context (relacionamento) nunca derruba
//    ANÁLISE nem AGORA, que continuam funcionando a partir da leitura
//    comercial — e dentro do próprio CLIENTE, a falha do relacionamento
//    nunca apaga uma inteligência comercial válida que já exista (as duas
//    metades de getClientInformationAreaHtml são independentes).
//
// Gaps que dependem do PR #226 (Frente 2 — persistência de inteligência
// comercial em CLIENTE durante re-análise em voo/erro, cycle isolation,
// company isolation) NÃO são exercitados aqui — ver relatório da FRENTE 3A.
// Neste branch (main, sem o PR #226), CLIENTE usa getActiveCommercialReading()
// direto, então perde a inteligência comercial assim que uma nova análise
// começa (conversationAnalysis é zerado de imediato) — esse é exatamente o
// defeito que o PR #226 corrige, fora do escopo desta frente.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMessageHtml,
  buildWhatsAppPageHtml,
  defaultLeadResolution,
  defaultClientContext,
  loadContentScript,
  resolveLeadCalls,
  ingestCalls,
  analysisJobStatusCalls,
  waitFor,
} from '../e3-test-support/load-content-script.mjs'

const CONVERSATION_A_TITLE = '+55 11 98888-7777'
const CYCLE_A = 'cycle-a'

function onlyDigits(value) {
  return String(value).replace(/\D/g, '')
}

const PHONE_A = onlyDigits(CONVERSATION_A_TITLE)

function leadResolutionFor(cycleId, phone, overrides = {}) {
  return defaultLeadResolution({
    phone,
    cycle: {
      id: cycleId,
      status: 'contato',
      owner_user_id: 'user-1',
    },
    ...overrides,
  })
}

function pageHtmlFor({ headerTitle, messageId, prePlainText, text }) {
  return buildWhatsAppPageHtml({
    headerTitle,
    messagesHtml: buildMessageHtml({
      id: messageId,
      prePlainText,
      text,
    }),
  })
}

function getPanel(document) {
  return document.getElementById('yolen-companion-panel')
}

function getAnalyzeButton(document) {
  return getPanel(document)?.querySelector(
    '[data-yolen-action="analyze-conversation"]',
  )
}

async function clickAnalyzeAndWaitForRequest({ document, calls, cycleId }) {
  await waitFor(() => Boolean(getAnalyzeButton(document)))

  const before = calls.filter(
    (call) =>
      call.action === 'ANALYZE_CONVERSATION' &&
      call.payload?.cycle_id === cycleId,
  ).length

  getAnalyzeButton(document).dispatchEvent(
    new document.defaultView.Event('click', { bubbles: true }),
  )

  await waitFor(
    () =>
      calls.filter(
        (call) =>
          call.action === 'ANALYZE_CONVERSATION' &&
          call.payload?.cycle_id === cycleId,
      ).length > before,
  )
}

function openSellerArea(document, area) {
  document
    .querySelector(`[data-yolen-seller-area="${area}"]`)
    ?.dispatchEvent(
      new document.defaultView.Event('click', { bubbles: true }),
    )
}

async function waitForSellerAreaOpen(document, area) {
  openSellerArea(document, area)

  await waitFor(
    () =>
      !document.querySelector(`[data-yolen-seller-panel="${area}"]`)?.hidden,
  )
}

function getSellerPanelText(document, area) {
  return (
    document.querySelector(`[data-yolen-seller-panel="${area}"]`)
      ?.textContent ?? ''
  )
}

function isAnalysisAreaLoading(document) {
  return Boolean(
    document.querySelector(
      '[data-yolen-seller-panel="analysis"] [data-yolen-analysis-loading]',
    ),
  )
}

function isAnalysisAreaError(document) {
  return Boolean(
    document.querySelector(
      '[data-yolen-seller-panel="analysis"] [data-yolen-analysis-error]',
    ),
  )
}

function evidence(summary) {
  return {
    summary,
    evidence_message_ids: ['msg-a1'],
    memory_ids: [],
  }
}

// Leitura comercial rica com uma objeção aberta e nenhum outro sinal de
// atenção concorrente (sem SLA, sem risco de condução, sem off_method, sem
// pergunta em aberto) — isola deliberadamente a objeção como o único
// candidato possível de AGORA, para provar que as três áreas concordam
// sobre a MESMA objeção sem se contradizerem.
function objectionReading() {
  return {
    contract_version: 'commercial-reading-v1',
    analysis_status: 'complete',
    analysis_limitations: [],
    commercial_role: 'buyer',
    commercial_relevance: 'commercial',
    conversation_summary: {
      current_state: evidence('Cliente avaliando alternativas antes de decidir.'),
    },
    customer: {
      objectives: [],
      problems: [],
      impacts: [],
      needs: [],
      interests: [],
      decision_criteria: [],
      preferences: [],
      open_questions: [],
      objections: [evidence('OBJECAO_PRECO_ALTO_DEMAIS')],
      uncertainties: [],
      discussed_products: [],
      primary_product_interest: null,
      competitors: [],
      commitments: [],
      missing_discovery: [],
      resolved_information: [],
      superseded_information: [],
      communication: { patterns: [], events: [] },
    },
    commercial_evolution: [],
    method: {
      configured: false,
      name: null,
      stages: [],
      current_stage: null,
      adherence: { status: 'not_configured' },
      recovery_guidance: null,
    },
    seller_strengths: [],
    improvement_points: [],
    risks: { customer_objections: [], service_risks: [] },
    best_approach: {
      decision: 'handle_objection',
      reason: 'Objeção de preço precisa ser tratada antes de avançar.',
      channel: 'text',
      evidence_message_ids: [],
      memory_ids: [],
    },
    communication: {
      intervention_needed: true,
      recommended_question: null,
      recommended_message: null,
    },
    operations: {
      crm: { should_change_crm_stage: false, recommended_status: null, rationale: null, requires_human_confirmation: true },
      agenda: { should_change_agenda: false, expected_next_action_at: null, rationale: null, requires_human_confirmation: true },
    },
    evidence_message_ids: [],
    memory_ids: [],
  }
}

// Leitura comercial "quieta": comercial, sem nenhum sinal de atenção
// possível (sem objeção/pergunta/risco/off_method/SLA) — usada para isolar
// exclusivamente o comportamento de waiting em AGORA/CLIENTE.
function quietCommercialReading() {
  return {
    contract_version: 'commercial-reading-v1',
    analysis_status: 'complete',
    analysis_limitations: [],
    commercial_role: 'buyer',
    commercial_relevance: 'commercial',
    conversation_summary: {
      current_state: evidence('Conversa comercial em andamento, sem pendências.'),
    },
    customer: {
      objectives: [], problems: [], impacts: [], needs: [], interests: [],
      decision_criteria: [], preferences: [], open_questions: [], objections: [],
      uncertainties: [], discussed_products: [], primary_product_interest: null,
      competitors: [], commitments: [], missing_discovery: [],
      resolved_information: [], superseded_information: [],
      communication: { patterns: [], events: [] },
    },
    commercial_evolution: [],
    method: { configured: false, name: null, stages: [], current_stage: null, adherence: { status: 'not_configured' }, recovery_guidance: null },
    // Um acerto de coaching (seller_strengths) nunca é candidato a atenção
    // de AGORA (resolveSellerAttentionSnapshot só considera SLA/waiting/
    // service_risk/off_method/open_question/objeção/improvement) — serve
    // aqui só como marcador positivo e determinístico de que a promoção
    // terminou com sucesso e chegou a ANÁLISE, sem contaminar AGORA.
    seller_strengths: [{
      kind: 'good_discovery',
      summary: 'PONTO_QUIETO_SEM_ATENCAO',
      why_it_matters: 'Confirma que a leitura foi promovida sem gerar nenhum alerta.',
      evidence_message_ids: ['msg-a1'],
      memory_ids: [],
    }],
    improvement_points: [],
    risks: { customer_objections: [], service_risks: [] },
    best_approach: { decision: 'no_intervention', reason: 'Nada pendente.', channel: 'none', evidence_message_ids: [], memory_ids: [] },
    communication: { intervention_needed: false, recommended_question: null, recommended_message: null },
    operations: {
      crm: { should_change_crm_stage: false, recommended_status: null, rationale: null, requires_human_confirmation: true },
      agenda: { should_change_agenda: false, expected_next_action_at: null, rationale: null, requires_human_confirmation: true },
    },
    evidence_message_ids: [],
    memory_ids: [],
  }
}

function deepOutput(reading, overrides = {}) {
  return {
    contract_version: 'phase12a-deep-seller-v1',
    engine_source: 'stateful',
    commercial_relevance: 'commercial',
    commercial_role: 'buyer',
    summary: 'Resumo profundo da conversa.',
    commercial_reading: reading,
    recommended_next_approach: 'Ver leitura comercial.',
    recommended_question: null,
    suggested_message: null,
    ...overrides,
  }
}

function analysisResultWithDeepJob({ analysisJobId, deepStatus = 'queued', watermark = 'wm-1' }) {
  return {
    ok: true,
    data: {
      deep_analysis: {
        analysis_job_id: analysisJobId,
        status: deepStatus,
        message_watermark: watermark,
      },
    },
  }
}

function succeededStatus({ analysisJobId, watermark, result }) {
  return {
    ok: true,
    data: {
      analysis_job_id: analysisJobId,
      status: 'succeeded',
      message_watermark: watermark,
      result,
    },
  }
}

test(
  'AGORA, ANÁLISE e CLIENTE concordam sobre a mesma objeção e nunca a duplicam fora do lugar certo',
  async () => {
    const { document, calls } = loadContentScript({
      initialHtml: pageHtmlFor({
        headerTitle: CONVERSATION_A_TITLE,
        messageId: 'msg-a1',
        prePlainText: '[10:00, 21/08/2026] Cliente A: ',
        text: 'O preço ficou acima do que eu esperava.',
      }),
      resolutionsByPhone: {
        [PHONE_A]: leadResolutionFor(CYCLE_A, PHONE_A),
      },
      analysisResult: analysisResultWithDeepJob({
        analysisJobId: 'a'.repeat(64),
        watermark: 'wm-1',
      }),
      analysisJobStatusResult: succeededStatus({
        analysisJobId: 'a'.repeat(64),
        watermark: 'wm-1',
        result: deepOutput(objectionReading()),
      }),
    })

    await waitFor(
      () => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0,
    )

    await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })

    await waitForSellerAreaOpen(document, 'now')
    // AGORA nunca repete o texto literal da objeção — resolveSellerAttentionSnapshot
    // usa uma cópia fixa ("Há uma objeção relevante...") como o resumo de
    // atenção; o conteúdo da objeção em si só existe em CLIENTE. Por isso
    // esperamos pelo rótulo fixo, não pelo marcador.
    await waitFor(
      () => getSellerPanelText(document, 'now').includes('Atenção · Objeção aberta'),
      { timeoutMs: 8000 },
    )

    const nowText = getSellerPanelText(document, 'now')
    assert.match(
      nowText,
      /Atenção · Objeção aberta/,
      'AGORA precisa sinalizar a objeção como o item de maior prioridade',
    )
    assert.doesNotMatch(
      nowText,
      /OBJECAO_PRECO_ALTO_DEMAIS/,
      'AGORA não deve expor o texto literal da objeção do cliente — isso é conhecimento acumulado, exclusivo de CLIENTE',
    )

    await waitForSellerAreaOpen(document, 'analysis')
    const analysisText = getSellerPanelText(document, 'analysis')
    assert.doesNotMatch(
      analysisText,
      /OBJECAO_PRECO_ALTO_DEMAIS/,
      'ANÁLISE não pode repetir o conteúdo da objeção do cliente — ela mostra só risco de condução do vendedor',
    )

    await waitForSellerAreaOpen(document, 'client')
    const clientText = getSellerPanelText(document, 'client')
    assert.match(
      clientText,
      /OBJECAO_PRECO_ALTO_DEMAIS/,
      'CLIENTE precisa registrar a objeção como conhecimento comercial acumulado',
    )

    assert.doesNotMatch(
      clientText,
      /Atenção · Objeção aberta/,
      'CLIENTE não deveria repetir o texto de alerta de AGORA — são camadas diferentes (o que fazer vs o que sabemos)',
    )
  },
)

test(
  'CLIENTE mostra o estado vazio de nível superior (não erro) quando não há leitura comercial nem relacionamento',
  async () => {
    const { document, calls } = loadContentScript({
      initialHtml: pageHtmlFor({
        headerTitle: CONVERSATION_A_TITLE,
        messageId: 'msg-a1',
        prePlainText: '[10:00, 21/08/2026] Cliente A: ',
        text: 'Oi',
      }),
      resolutionsByPhone: {
        [PHONE_A]: leadResolutionFor(CYCLE_A, PHONE_A, {
          status: 'NOT_FOUND',
          lead: null,
          cycle: null,
        }),
      },
    })

    await waitFor(() => resolveLeadCalls(calls).length > 0)

    await waitForSellerAreaOpen(document, 'client')

    await waitFor(() =>
      Boolean(document.querySelector('[data-yolen-client-empty]')),
    )

    const clientText = getSellerPanelText(document, 'client')
    assert.match(
      clientText,
      /Ainda não há informações suficientes sobre este cliente\./,
    )
    assert.doesNotMatch(
      clientText,
      /erro|falha|Falha/i,
      'sem lead resolvido, CLIENTE deve mostrar o estado vazio real, nunca um texto de erro',
    )
  },
)

test(
  'um único tick de erro de rede no polling de análise profunda não vira falha terminal — próximo tick ainda é aplicado a AGORA/ANÁLISE/CLIENTE',
  async () => {
    let statusCallCount = 0

    const { document, calls } = loadContentScript({
      initialHtml: pageHtmlFor({
        headerTitle: CONVERSATION_A_TITLE,
        messageId: 'msg-a1',
        prePlainText: '[10:00, 21/08/2026] Cliente A: ',
        text: 'Quero saber mais sobre o plano.',
      }),
      resolutionsByPhone: {
        [PHONE_A]: leadResolutionFor(CYCLE_A, PHONE_A),
      },
      analysisResult: analysisResultWithDeepJob({
        analysisJobId: 'a'.repeat(64),
        watermark: 'wm-1',
      }),
      analysisJobStatusResult: async () => {
        statusCallCount += 1

        // Primeiro tick: falha de rede/servidor isolada (rejeita a
        // promise, como uma exceção real de fetch dentro de
        // getAnalysisJobStatus). runTick() precisa tratar isso como uma
        // falha transitória de UM tick, sem virar erro terminal
        // seller-facing — só o próximo tick do mesmo backoff aplica o
        // resultado.
        if (statusCallCount === 1) {
          throw new Error('Falha de rede simulada em um único tick do poll.')
        }

        return succeededStatus({
          analysisJobId: 'a'.repeat(64),
          watermark: 'wm-1',
          result: deepOutput(quietCommercialReading()),
        })
      },
    })

    await waitFor(
      () => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0,
    )

    await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })

    await waitFor(() => analysisJobStatusCalls(calls).length >= 1)

    await waitForSellerAreaOpen(document, 'analysis')

    // Logo após o primeiro tick (que falhou), a UI ainda precisa estar em
    // loading — nunca em erro terminal por causa de uma falha isolada.
    assert.ok(
      isAnalysisAreaLoading(document),
      'um único tick de rede ruim não pode tirar ANÁLISE do estado de loading',
    )
    assert.ok(
      !isAnalysisAreaError(document),
      'um único tick de rede ruim não pode virar erro terminal seller-facing',
    )

    // O próximo tick (backoff real de até 5s, ver DEEP_ANALYSIS_POLL_DELAYS_MS)
    // deve suceder e promover o resultado normalmente.
    await waitFor(
      () => getSellerPanelText(document, 'analysis').includes('PONTO_QUIETO_SEM_ATENCAO'),
      { timeoutMs: 8000 },
    )

    assert.ok(
      !isAnalysisAreaError(document),
      'depois da recuperação, ANÁLISE não deveria continuar marcada como erro',
    )
  },
)

test(
  'vendedor aguardando cliente nunca cria urgência artificial em AGORA, e CLIENTE mostra a espera corretamente',
  async () => {
    const { document, calls } = loadContentScript({
      initialHtml: pageHtmlFor({
        headerTitle: CONVERSATION_A_TITLE,
        messageId: 'msg-a1',
        prePlainText: '[10:00, 21/08/2026] Vendedor: ',
        text: 'Consigo esse desconto, fechamos hoje?',
        direction: 'outgoing',
      }),
      resolutionsByPhone: {
        [PHONE_A]: leadResolutionFor(CYCLE_A, PHONE_A),
      },
      clientContextResult: defaultClientContext({
        waiting: {
          state: 'seller_waiting_for_customer',
          waiting_since: '2026-08-22T09:42:00.000Z',
          waiting_duration_ms: 5 * 60 * 60 * 1000,
        },
        sla: {
          configured: false,
          applicable: true,
          stage: 'contato',
          stage_label: 'CONTATO',
          target_minutes: null,
          warning_minutes: null,
          danger_minutes: null,
          elapsed_minutes: 60,
          risk: null,
        },
      }),
      analysisResult: analysisResultWithDeepJob({
        analysisJobId: 'a'.repeat(64),
        watermark: 'wm-1',
      }),
      analysisJobStatusResult: succeededStatus({
        analysisJobId: 'a'.repeat(64),
        watermark: 'wm-1',
        result: deepOutput(quietCommercialReading()),
      }),
    })

    await waitFor(
      () => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0,
    )

    await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })

    // Assenta a análise (sucesso real, não loading/erro) ANTES de checar a
    // ausência de atenção em AGORA — senão "nenhum alerta" poderia ser um
    // falso positivo por a leitura ainda não ter chegado.
    await waitForSellerAreaOpen(document, 'analysis')
    await waitFor(
      () => getSellerPanelText(document, 'analysis').includes('PONTO_QUIETO_SEM_ATENCAO'),
      { timeoutMs: 8000 },
    )

    await waitForSellerAreaOpen(document, 'now')

    assert.equal(
      document.querySelector('[data-yolen-now-attention]'),
      null,
      'vendedor aguardando cliente não é um sinal de atenção — AGORA não pode criar urgência artificial',
    )

    await waitForSellerAreaOpen(document, 'client')
    await waitFor(() =>
      getSellerPanelText(document, 'client').includes('Aguardando resposta do cliente'),
    )
  },
)

test(
  'falha isolada em client-context não derruba ANÁLISE nem AGORA, e não apaga inteligência comercial já válida em CLIENTE',
  async () => {
    const { document, calls } = loadContentScript({
      initialHtml: pageHtmlFor({
        headerTitle: CONVERSATION_A_TITLE,
        messageId: 'msg-a1',
        prePlainText: '[10:00, 21/08/2026] Cliente A: ',
        text: 'O preço ficou acima do que eu esperava.',
      }),
      resolutionsByPhone: {
        [PHONE_A]: leadResolutionFor(CYCLE_A, PHONE_A),
      },
      clientContextResult: {
        ok: false,
        error: 'Falha simulada ao carregar relacionamento com o cliente.',
      },
      analysisResult: analysisResultWithDeepJob({
        analysisJobId: 'a'.repeat(64),
        watermark: 'wm-1',
      }),
      analysisJobStatusResult: succeededStatus({
        analysisJobId: 'a'.repeat(64),
        watermark: 'wm-1',
        result: deepOutput(objectionReading()),
      }),
    })

    await waitFor(
      () => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0,
    )

    await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })

    await waitForSellerAreaOpen(document, 'analysis')
    await waitFor(
      () => !isAnalysisAreaLoading(document) && !isAnalysisAreaError(document),
      { timeoutMs: 8000 },
    )
    assert.doesNotMatch(
      getSellerPanelText(document, 'analysis'),
      /Falha simulada ao carregar relacionamento/,
      'a falha de client-context não pode contaminar ANÁLISE, que não depende dela',
    )

    await waitForSellerAreaOpen(document, 'now')
    assert.doesNotMatch(
      getSellerPanelText(document, 'now'),
      /Falha simulada ao carregar relacionamento/,
      'a falha de client-context não pode contaminar AGORA com um erro seller-facing cru',
    )

    await waitForSellerAreaOpen(document, 'client')
    await waitFor(() =>
      getSellerPanelText(document, 'client').includes('OBJECAO_PRECO_ALTO_DEMAIS'),
    )

    const clientText = getSellerPanelText(document, 'client')
    assert.match(
      clientText,
      /OBJECAO_PRECO_ALTO_DEMAIS/,
      'a inteligência comercial (independente do relacionamento) precisa continuar visível em CLIENTE',
    )
    assert.match(
      clientText,
      /Falha simulada ao carregar relacionamento/,
      'o card de relacionamento, por sua vez, precisa mostrar seu próprio erro em vez de travar o painel inteiro',
    )
  },
)
