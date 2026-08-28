import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMessageHtml,
  buildWhatsAppPageHtml,
  defaultLeadResolution,
  loadContentScript,
  resolveLeadCalls,
  ingestCalls,
  analysisJobStatusCalls,
  waitFor,
} from '../e3-test-support/load-content-script.mjs'

const CONVERSATION_A_TITLE = '+55 11 98888-7777'
const CONVERSATION_B_TITLE = '+55 21 97777-6666'

const CYCLE_A = 'cycle-a'
const CYCLE_B = 'cycle-b'

function onlyDigits(value) {
  return String(value).replace(/\D/g, '')
}

const PHONE_A = onlyDigits(CONVERSATION_A_TITLE)
const PHONE_B = onlyDigits(CONVERSATION_B_TITLE)

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

function switchConversationDom(document, {
  headerTitle,
  messageId,
  prePlainText,
  text,
}) {
  const conversationBody = document.getElementById('conversation-body')
  const headerTitleSpan = document.querySelector('header span[title]')

  headerTitleSpan.setAttribute('title', headerTitle)
  headerTitleSpan.textContent = headerTitle
  conversationBody.innerHTML = buildMessageHtml({
    id: messageId,
    prePlainText,
    text,
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

function getAnalysisErrorText(document) {
  return (
    getPanel(document)
      ?.querySelector('[data-yolen-analysis-error]')
      ?.textContent
      ?.trim() ?? null
  )
}

function getDeepAnalysisStatusText(document) {
  return (
    getPanel(document)
      ?.querySelector(
        '.yolen-deep-analysis-status .yolen-decision-copy',
      )
      ?.textContent
      ?.trim() ?? null
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

async function goToConversationB({
  document,
  calls,
  resolveLeadCountBefore,
  title,
  messageId,
  prePlainText,
  text,
}) {
  switchConversationDom(document, {
    headerTitle: title,
    messageId,
    prePlainText,
    text,
  })

  await waitFor(
    () => resolveLeadCalls(calls).length > resolveLeadCountBefore,
  )

  await waitFor(() => {
    const ingests = ingestCalls(calls)
    return ingests.at(-1)?.payload.messages.some(
      (message) => message.message_key?.includes(messageId),
    )
  })
}

function evidence(summary) {
  return {
    summary,
    evidence_message_ids: ['msg-a1'],
    memory_ids: [],
  }
}

function deepReading(relevance = 'commercial') {
  const commercial = relevance === 'commercial'

  return {
    contract_version: 'commercial-reading-v1',
    analysis_status: 'complete',
    analysis_limitations: [],
    commercial_role: commercial ? 'buyer' : 'unknown',
    commercial_relevance: relevance,
    conversation_summary: {
      current_state: evidence(
        commercial
          ? 'Estado profundo comercial.'
          : 'Conversa sem evidência comercial.',
      ),
    },
    customer: {
      objectives: [],
      problems: [],
      impacts: [],
      needs: commercial
        ? [evidence('Necessidade profunda do cliente.')]
        : [],
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
      communication: {
        patterns: [],
        events: [],
      },
    },
    commercial_evolution: [],
    method: {
      configured: commercial,
      name: commercial ? 'Método Deep' : null,
      stages: [],
      current_stage: null,
      adherence: {
        status: commercial ? 'on_method' : 'insufficient_evidence',
        summary: commercial
          ? 'Aderência profunda confirmada.'
          : 'Sem evidência suficiente.',
        deviation_stage_order: null,
        what_happened: null,
        missing_information: [],
        why_it_matters: null,
        evidence_message_ids: [],
        memory_ids: [],
      },
      recovery_guidance: null,
    },
    seller_strengths: commercial
      ? [{
          kind: 'good_discovery',
          summary: 'Acerto profundo do vendedor.',
          why_it_matters: 'Mantém o diagnóstico consistente.',
          evidence_message_ids: ['msg-a1'],
          memory_ids: [],
        }]
      : [],
    improvement_points: [],
    risks: {
      customer_objections: [],
      service_risks: [],
    },
    best_approach: {
      decision: commercial ? 'deepen_discovery' : 'no_intervention',
      reason: commercial
        ? 'Aprofundar antes de negociar.'
        : 'Nenhuma intervenção comercial necessária.',
      channel: commercial ? 'text' : 'none',
      evidence_message_ids: [],
      memory_ids: [],
    },
    communication: {
      intervention_needed: commercial,
      recommended_question: commercial
        ? 'Qual impacto isso gera hoje?'
        : null,
      recommended_message: commercial
        ? 'Mensagem profunda para o cliente.'
        : null,
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
  }
}

function deepOutput(overrides = {}) {
  const relevance =
    overrides.commercial_relevance ??
    'commercial'

  const base = {
    contract_version: 'phase12a-deep-seller-v1',
    engine_source: 'stateful',
    commercial_relevance: relevance,
    commercial_role: relevance === 'commercial' ? 'buyer' : 'unknown',
    summary: relevance === 'commercial'
      ? 'Cliente pediu desconto no plano anual.'
      : 'Conversa sem evidência comercial relevante.',
    commercial_reading: deepReading(relevance),
    recommended_next_approach: relevance === 'commercial'
      ? 'Aprofundar valor antes de negociar.'
      : 'Não realizar intervenção comercial.',
    recommended_question: relevance === 'commercial'
      ? 'Qual impacto isso gera hoje?'
      : null,
    suggested_message: relevance === 'commercial'
      ? 'Consigo 10% no plano anual, fechamos hoje?'
      : null,
  }

  return {
    ...base,
    ...overrides,
    commercial_reading:
      overrides.commercial_reading ??
      base.commercial_reading,
  }
}

// Fase 12A — V2 como único motor: a resposta rápida real para uma empresa
// no modo 'active' nunca inclui suggestion/coaching (V1) junto com
// deep_analysis — o servidor retorna direto para a chamada V1 quando o
// job em segundo plano existe. `summary` é mantido como parâmetro só para
// compatibilidade dos testes que ainda o passam; não aparece mais na
// resposta rápida.
function analysisResultWithDeepJob({
  analysisJobId,
  deepStatus = 'queued',
  watermark = 'wm-1',
}) {
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

function succeededStatus(result, watermark = 'wm-1') {
  return {
    ok: true,
    data: {
      analysis_job_id: 'a'.repeat(64),
      status: 'succeeded',
      message_watermark: watermark,
      result,
    },
  }
}

test('queued → succeeded: sem V1, painel fica em loading até o V2 concluir e então aplica o resultado', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: pageHtmlFor({
      headerTitle: CONVERSATION_A_TITLE,
      messageId: 'msg-a1',
      prePlainText: '[10:00, 21/08/2026] Cliente A: ',
      text: 'Olá, quero saber mais sobre o plano mensal e o plano anual.',
    }),
    resolutionsByPhone: {
      [PHONE_A]: leadResolutionFor(CYCLE_A, PHONE_A),
    },
    analysisResult: analysisResultWithDeepJob({
      analysisJobId: 'a'.repeat(64),
    }),
    analysisJobStatusResult: succeededStatus(deepOutput()),
  })

  await waitFor(
    () => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0,
  )
  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })

  // Fase 12A — V2 como único motor: a resposta rápida não trouxe nenhuma
  // suggestion V1 (a fixture não tem esse campo) — o painel precisa
  // continuar em "Analisando" até o job do V2 resolver.
  await waitFor(
    () => getDeepAnalysisStatusText(document) === 'Análise aprofundada em andamento',
  )
  assert.equal(getAnalysisErrorText(document), null)
  assert.match(
    getPanel(document)?.textContent ?? '',
    /Analisando/,
  )

  await waitFor(
    () =>
      getDeepAnalysisStatusText(document)?.includes('Leitura aprofundada:') &&
      getDeepAnalysisStatusText(document)?.includes('Consigo 10% no plano anual'),
    { timeoutMs: 8000 },
  )

  // O sucesso do V2 é quem tira o painel do loading e aplica o resultado
  // único — sem V1 concorrente, sem promoção de um resultado sobre outro.
  assert.equal(getAnalysisErrorText(document), null)
  assert.ok(getAnalyzeButton(document))
  assert.doesNotMatch(
    getAnalyzeButton(document)?.textContent ?? '',
    /Tentar novamente/,
  )

  assert.ok(analysisJobStatusCalls(calls).length >= 1)
  assert.deepEqual(
    Object.keys(analysisJobStatusCalls(calls)[0].payload),
    ['analysis_job_id'],
  )
})

test('succeeded promove commercial_reading real para ANÁLISE e CLIENTE', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: pageHtmlFor({
      headerTitle: CONVERSATION_A_TITLE,
      messageId: 'msg-a1',
      prePlainText: '[10:00, 21/08/2026] Cliente A: ',
      text: 'Quero entender melhor a solução e o impacto no follow-up.',
    }),
    resolutionsByPhone: {
      [PHONE_A]: leadResolutionFor(CYCLE_A, PHONE_A),
    },
    analysisResult: analysisResultWithDeepJob({
      summary: 'RESUMO RAPIDO A',
      analysisJobId: 'a'.repeat(64),
    }),
    analysisJobStatusResult: succeededStatus(deepOutput()),
  })

  await waitFor(
    () => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0,
  )
  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })
  await waitFor(
    () => getDeepAnalysisStatusText(document)?.includes('Leitura aprofundada:'),
    { timeoutMs: 8000 },
  )

  const analysisButton = document.querySelector('[data-yolen-seller-area="analysis"]')
  analysisButton?.dispatchEvent(
    new document.defaultView.Event('click', { bubbles: true }),
  )

  await waitFor(
    () => !document.querySelector('[data-yolen-seller-panel="analysis"]')?.hidden,
  )

  const analysisText =
    document.querySelector('[data-yolen-seller-panel="analysis"]')?.textContent ?? ''

  assert.match(analysisText, /Método Deep/)
  assert.match(analysisText, /Acerto profundo/)

  const clientButton = document.querySelector('[data-yolen-seller-area="client"]')
  clientButton?.dispatchEvent(
    new document.defaultView.Event('click', { bubbles: true }),
  )

  await waitFor(
    () => !document.querySelector('[data-yolen-seller-panel="client"]')?.hidden,
  )

  const clientText =
    document.querySelector('[data-yolen-seller-panel="client"]')?.textContent ?? ''

  assert.match(clientText, /Necessidade profunda/)
})

test('failed: mostra falha e nunca expõe internals ao vendedor', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: pageHtmlFor({
      headerTitle: CONVERSATION_A_TITLE,
      messageId: 'msg-a1',
      prePlainText: '[10:00, 21/08/2026] Cliente A: ',
      text: 'Olá, quero saber mais sobre o plano mensal.',
    }),
    resolutionsByPhone: {
      [PHONE_A]: leadResolutionFor(CYCLE_A, PHONE_A),
    },
    analysisResult: analysisResultWithDeepJob({
      summary: 'RESUMO RAPIDO A',
      analysisJobId: 'a'.repeat(64),
    }),
    analysisJobStatusResult: {
      ok: true,
      data: {
        analysis_job_id: 'a'.repeat(64),
        status: 'failed',
        message_watermark: 'wm-1',
        result: null,
      },
    },
  })

  await waitFor(
    () => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0,
  )
  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })

  await waitFor(
    () => getDeepAnalysisStatusText(document)?.includes('Falha na análise aprofundada'),
    { timeoutMs: 8000 },
  )

  // Fase 12A — V2 como único motor: sem V1 por baixo, uma falha do V2 tem
  // que virar erro explícito de primeiro nível com retry disponível — não
  // pode ficar só como um indicador secundário na aba ANÁLISE enquanto o
  // resto do painel finge que está tudo bem.
  await waitFor(() => getAnalysisErrorText(document) !== null)
  assert.match(
    getAnalysisErrorText(document) ?? '',
    /Não foi possível concluir a leitura comercial da Yolen\. Tente novamente\./,
  )
  assert.ok(
    getAnalyzeButton(document),
    'retry deveria estar disponível depois de uma falha do V2',
  )

  const panelHtml = getPanel(document)?.innerHTML ?? ''
  assert.doesNotMatch(panelHtml, new RegExp('a'.repeat(64)))
  assert.doesNotMatch(panelHtml, /wm-1/)
  assert.doesNotMatch(panelHtml, /queue|worker|watermark|candidate/i)
})

test('superseded: nunca aparece como resultado corrente', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: pageHtmlFor({
      headerTitle: CONVERSATION_A_TITLE,
      messageId: 'msg-a1',
      prePlainText: '[10:00, 21/08/2026] Cliente A: ',
      text: 'Olá, quero saber mais sobre o plano mensal.',
    }),
    resolutionsByPhone: {
      [PHONE_A]: leadResolutionFor(CYCLE_A, PHONE_A),
    },
    analysisResult: analysisResultWithDeepJob({
      summary: 'RESUMO RAPIDO A',
      analysisJobId: 'a'.repeat(64),
    }),
    analysisJobStatusResult: {
      ok: true,
      data: {
        analysis_job_id: 'a'.repeat(64),
        status: 'superseded',
        message_watermark: 'wm-1',
        result: null,
      },
    },
  })

  await waitFor(
    () => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0,
  )
  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })

  await waitFor(() => analysisJobStatusCalls(calls).length > 0)
  await new Promise((resolve) => setTimeout(resolve, 300))

  assert.equal(getDeepAnalysisStatusText(document), null)
})

test('deep pendente de A nunca contamina conversa B', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: pageHtmlFor({
      headerTitle: CONVERSATION_A_TITLE,
      messageId: 'msg-a1',
      prePlainText: '[10:00, 21/08/2026] Cliente A: ',
      text: 'Olá, quero saber mais sobre o plano mensal e o plano anual.',
    }),
    resolutionsByPhone: {
      [PHONE_A]: leadResolutionFor(CYCLE_A, PHONE_A),
      [PHONE_B]: leadResolutionFor(CYCLE_B, PHONE_B),
    },
    analysisResult: async (requestPayload) => {
      if (requestPayload.cycle_id === CYCLE_A) {
        return analysisResultWithDeepJob({
          summary: 'RESUMO RAPIDO A',
          analysisJobId: 'a'.repeat(64),
        })
      }

      return {
        ok: true,
        data: {
          engine_source: 'v1',
          suggestion: {
            summary: 'RESUMO RAPIDO B',
            recommended_status: 'contato',
            tags: [],
          },
          coaching: {},
        },
      }
    },
    analysisJobStatusResult: succeededStatus(deepOutput()),
  })

  await waitFor(
    () => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0,
  )
  const resolveLeadCountAfterA = resolveLeadCalls(calls).length

  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })
  await waitFor(
    () => getDeepAnalysisStatusText(document) === 'Análise aprofundada em andamento',
  )

  await goToConversationB({
    document,
    calls,
    resolveLeadCountBefore: resolveLeadCountAfterA,
    title: CONVERSATION_B_TITLE,
    messageId: 'msg-b1',
    prePlainText: '[11:00, 21/08/2026] Cliente B: ',
    text: 'Bom dia, preciso de ajuda para agendar uma visita.',
  })

  assert.equal(getDeepAnalysisStatusText(document), null)
  await new Promise((resolve) => setTimeout(resolve, 2000))
  assert.equal(getDeepAnalysisStatusText(document), null)

  const panelHtml = getPanel(document)?.innerHTML ?? ''
  assert.doesNotMatch(panelHtml, /Consigo 10% no plano anual/)
})

test('A1 antigo nunca sobrescreve deep A2 mais novo na mesma conversa', async () => {
  let analyzeCallCount = 0
  let resolveStatusA1

  const statusA1Gate = new Promise((resolve) => {
    resolveStatusA1 = resolve
  })

  const { document, calls } = loadContentScript({
    initialHtml: pageHtmlFor({
      headerTitle: CONVERSATION_A_TITLE,
      messageId: 'msg-a1',
      prePlainText: '[10:00, 21/08/2026] Cliente A: ',
      text: 'Olá, quero saber mais sobre o plano mensal e o plano anual.',
    }),
    resolutionsByPhone: {
      [PHONE_A]: leadResolutionFor(CYCLE_A, PHONE_A),
    },
    analysisResult: async () => {
      analyzeCallCount += 1

      return analysisResultWithDeepJob({
        summary: analyzeCallCount === 1
          ? 'RESUMO RAPIDO A1'
          : 'RESUMO RAPIDO A2',
        analysisJobId: analyzeCallCount === 1
          ? 'a'.repeat(64)
          : 'c'.repeat(64),
        watermark: analyzeCallCount === 1
          ? 'wm-1'
          : 'wm-2',
      })
    },
    analysisJobStatusResult: async (requestPayload) => {
      if (requestPayload.analysis_job_id === 'a'.repeat(64)) {
        await statusA1Gate
        return {
          ok: true,
          data: {
            analysis_job_id: 'a'.repeat(64),
            status: 'succeeded',
            message_watermark: 'wm-1',
            result: deepOutput({
              suggested_message: 'MENSAGEM DO JOB ANTIGO',
            }),
          },
        }
      }

      return {
        ok: true,
        data: {
          analysis_job_id: 'c'.repeat(64),
          status: 'succeeded',
          message_watermark: 'wm-2',
          result: deepOutput({
            suggested_message: 'MENSAGEM DO JOB NOVO',
          }),
        },
      }
    },
  })

  await waitFor(
    () => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0,
  )

  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })
  await waitFor(
    () => getDeepAnalysisStatusText(document) === 'Análise aprofundada em andamento',
  )
  await waitFor(
    () => analysisJobStatusCalls(calls).some(
      (call) => call.payload.analysis_job_id === 'a'.repeat(64),
    ),
  )

  document.getElementById('conversation-body').innerHTML = buildMessageHtml({
    id: 'msg-a2',
    prePlainText: '[11:00, 21/08/2026] Cliente A: ',
    text: 'Ainda aqui, alguma novidade?',
  })

  await waitFor(
    () => ingestCalls(calls).some(
      (call) => call.payload.messages.some(
        (message) => message.message_key?.includes('msg-a2'),
      ),
    ),
  )

  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })

  await waitFor(
    () => getDeepAnalysisStatusText(document)?.includes('MENSAGEM DO JOB NOVO'),
    { timeoutMs: 8000 },
  )

  resolveStatusA1()
  await new Promise((resolve) => setTimeout(resolve, 300))

  assert.ok(
    getDeepAnalysisStatusText(document)?.includes('MENSAGEM DO JOB NOVO'),
  )
  assert.ok(
    !getDeepAnalysisStatusText(document)?.includes('MENSAGEM DO JOB ANTIGO'),
  )
})

test('mutação de mensagem enquanto poll está em voo invalida succeeded antes do próximo debounce', async () => {
  let releaseStatus
  const statusGate = new Promise((resolve) => {
    releaseStatus = resolve
  })

  const { document, calls } = loadContentScript({
    initialHtml: pageHtmlFor({
      headerTitle: CONVERSATION_A_TITLE,
      messageId: 'msg-a1',
      prePlainText: '[10:00, 21/08/2026] Cliente A: ',
      text: 'Quero saber mais sobre o plano anual.',
    }),
    resolutionsByPhone: {
      [PHONE_A]: leadResolutionFor(CYCLE_A, PHONE_A),
    },
    analysisResult: analysisResultWithDeepJob({
      summary: 'RESUMO RAPIDO A',
      analysisJobId: 'a'.repeat(64),
    }),
    analysisJobStatusResult: async () => {
      await statusGate
      return succeededStatus(
        deepOutput({
          suggested_message: 'STALE NÃO PODE APARECER',
        }),
      )
    },
  })

  await waitFor(
    () => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0,
  )
  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })
  await waitFor(
    () => getDeepAnalysisStatusText(document) === 'Análise aprofundada em andamento',
  )
  await waitFor(() => analysisJobStatusCalls(calls).length > 0)

  const messageText = document.querySelector(
    '[data-pre-plain-text] [data-testid="selectable-text"] > span',
  )
  messageText.textContent = 'Mensagem editada antes do próximo debounce.'

  /* Não esperamos uma nova análise. A mutação DOM por si só deve retirar
   * imediatamente a autoridade de A1 enquanto o status HTTP ainda está em voo. */
  releaseStatus()
  await new Promise((resolve) => setTimeout(resolve, 500))

  const panelHtml = getPanel(document)?.innerHTML ?? ''
  assert.doesNotMatch(panelHtml, /STALE NÃO PODE APARECER/)
})

test('non-commercial deep substitui atomicamente mensagem/CTA comercial antigo', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: pageHtmlFor({
      headerTitle: CONVERSATION_A_TITLE,
      messageId: 'msg-a1',
      prePlainText: '[10:00, 21/08/2026] Cliente A: ',
      text: 'Oi, tudo bem? Só passando pra dizer oi.',
    }),
    resolutionsByPhone: {
      [PHONE_A]: leadResolutionFor(CYCLE_A, PHONE_A),
    },
    analysisResult: {
      ok: true,
      data: {
        engine_source: 'v1',
        suggestion: {
          summary: 'V1 COMERCIAL ANTIGO',
          next_action: 'CTA ANTIGO NÃO PODE SOBREVIVER',
          next_action_date: '2026-08-24',
          recommended_status: 'negociacao',
          tags: [],
        },
        coaching: {
          suggested_message: 'MENSAGEM V1 ANTIGA NÃO PODE SOBREVIVER',
        },
        deep_analysis: {
          analysis_job_id: 'a'.repeat(64),
          status: 'queued',
          message_watermark: 'wm-1',
        },
      },
    },
    analysisJobStatusResult: succeededStatus(
      deepOutput({
        commercial_relevance: 'non_commercial',
        commercial_role: 'unknown',
        summary: 'Conversa pessoal sem evidência comercial.',
        commercial_reading: deepReading('non_commercial'),
        recommended_next_approach: 'Não realizar intervenção comercial.',
        recommended_question: null,
        suggested_message: null,
      }),
    ),
  })

  await waitFor(
    () => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0,
  )
  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })

  await waitFor(
    () => getDeepAnalysisStatusText(document)?.includes(
      'nenhuma intervenção comercial necessária',
    ),
    { timeoutMs: 8000 },
  )

  const panelText = getPanel(document)?.textContent ?? ''
  assert.doesNotMatch(panelText, /CTA ANTIGO NÃO PODE SOBREVIVER/)
  assert.doesNotMatch(panelText, /MENSAGEM V1 ANTIGA NÃO PODE SOBREVIVER/)
})

// ---------------------------------------------------------------------------
// Fase 12A — wiring da memória comercial persistente (CLIENTE) a partir do
// deep result. CLIENTE = memória persistente, AGORA = momento atual: uma
// sessão non_commercial/uncertain não pode esconder memória já conhecida.
// ---------------------------------------------------------------------------

function clickSellerArea(document, area) {
  document
    .querySelector(`[data-yolen-seller-area="${area}"]`)
    ?.dispatchEvent(
      new document.defaultView.Event('click', { bubbles: true }),
    )
}

function getSellerPanelText(document, area) {
  return (
    document
      .querySelector(`[data-yolen-seller-panel="${area}"]`)
      ?.textContent ?? ''
  )
}

async function openSellerPanel(document, area) {
  clickSellerArea(document, area)

  await waitFor(
    () =>
      !document.querySelector(`[data-yolen-seller-panel="${area}"]`)?.hidden,
  )
}

function preservedMemoryDeepOutput() {
  const baseReading = deepReading('non_commercial')

  return deepOutput({
    commercial_relevance: 'non_commercial',
    commercial_role: 'unknown',
    summary: 'Cliente mandou apenas "Bom dia" — sem retomada explícita da proposta anterior.',
    recommended_next_approach:
      'Confirmar com o cliente se ele ainda quer retomar a proposta anterior.',
    recommended_question: null,
    suggested_message: null,
    commercial_reading: {
      ...baseReading,
      customer: {
        ...baseReading.customer,
        needs: [
          evidence('Cliente busca reduzir leads sem retorno.'),
        ],
      },
    },
  })
}

test('non_commercial atual preserva memória do CLIENTE e mantém AGORA neutro', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: pageHtmlFor({
      headerTitle: CONVERSATION_A_TITLE,
      messageId: 'msg-a1',
      prePlainText: '[10:00, 21/08/2026] Cliente A: ',
      text: 'Bom dia',
    }),
    resolutionsByPhone: {
      [PHONE_A]: leadResolutionFor(CYCLE_A, PHONE_A),
    },
    analysisResult: analysisResultWithDeepJob({
      summary: 'RESUMO RAPIDO A',
      analysisJobId: 'a'.repeat(64),
    }),
    analysisJobStatusResult: succeededStatus(
      preservedMemoryDeepOutput(),
    ),
  })

  await waitFor(
    () => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0,
  )
  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })

  await waitFor(
    () =>
      getDeepAnalysisStatusText(document)?.includes(
        'nenhuma intervenção comercial necessária',
      ),
    { timeoutMs: 8000 },
  )

  // AGORA (área "now") continua neutro — nenhuma ação comercial inventada
  // a partir de uma mensagem neutra.
  await openSellerPanel(document, 'now')
  const nowText = getSellerPanelText(document, 'now')
  assert.match(nowText, /Conversa sem evidência comercial relevante/)
  assert.ok(
    document.querySelector('[data-yolen-now-neutral]'),
    'card "Agora" deveria estar marcado como neutro',
  )

  // CLIENTE continua mostrando a inteligência comercial já consolidada,
  // mesmo com a sessão atual sendo non_commercial.
  await openSellerPanel(document, 'client')
  const clientText = getSellerPanelText(document, 'client')
  assert.match(clientText, /Cliente busca reduzir leads sem retorno/)
})

test('deep succeeded sem commercial_reading válido não é usado — CLIENTE não inventa conteúdo', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: pageHtmlFor({
      headerTitle: CONVERSATION_A_TITLE,
      messageId: 'msg-a1',
      prePlainText: '[10:00, 21/08/2026] Cliente A: ',
      text: 'Olá, quero saber mais sobre o plano mensal.',
    }),
    resolutionsByPhone: {
      [PHONE_A]: leadResolutionFor(CYCLE_A, PHONE_A),
    },
    analysisResult: analysisResultWithDeepJob({
      summary: 'RESUMO RAPIDO A',
      analysisJobId: 'a'.repeat(64),
    }),
    analysisJobStatusResult: {
      ok: true,
      data: {
        analysis_job_id: 'a'.repeat(64),
        status: 'succeeded',
        message_watermark: 'wm-1',
        result: {
          contract_version: 'phase12a-deep-seller-v1',
          engine_source: 'stateful',
          commercial_relevance: 'commercial',
          commercial_role: 'buyer',
          summary: 'Resumo profundo sem leitura comercial anexada.',
          recommended_next_approach: 'Aprofundar descoberta.',
          recommended_question: null,
          suggested_message: null,
          // commercial_reading ausente/malformado de propósito.
        },
      },
    },
  })

  await waitFor(
    () => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0,
  )
  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })

  await waitFor(
    () =>
      getDeepAnalysisStatusText(document) ===
      'Análise aprofundada em andamento',
  )

  // yolen-api.js (promoteDeepSellerResult) rejeita esse payload como
  // INVALID_DEEP_SELLER_RESULT por faltar commercial_reading — o poller
  // trata isso como falha transitória e continua tentando (mesmo payload
  // inválido a cada tick), nunca promovendo engine_source para 'stateful'.
  // CLIENTE precisa continuar sem inventar conteúdo enquanto isso.
  await new Promise((resolve) => setTimeout(resolve, 2500))

  assert.equal(
    getDeepAnalysisStatusText(document),
    'Análise aprofundada em andamento',
  )

  // CLIENTE nunca inventa memória comercial a partir de um payload
  // inválido — o card de relacionamento (dado real, não-comercial, vindo
  // do fixture do lead) pode continuar aparecendo normalmente; o que não
  // pode aparecer é conteúdo comercial fabricado a partir do deep result.
  await openSellerPanel(document, 'client')
  const clientText = getSellerPanelText(document, 'client')
  assert.doesNotMatch(
    clientText,
    /Resumo profundo sem leitura comercial anexada/,
  )
  assert.doesNotMatch(clientText, /Aprofundar descoberta/)
})

test('troca de conversa após deep succeeded — memória do CLIENTE de A nunca aparece em B', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: pageHtmlFor({
      headerTitle: CONVERSATION_A_TITLE,
      messageId: 'msg-a1',
      prePlainText: '[10:00, 21/08/2026] Cliente A: ',
      text: 'Quero entender melhor a solução e o impacto no follow-up.',
    }),
    resolutionsByPhone: {
      [PHONE_A]: leadResolutionFor(CYCLE_A, PHONE_A),
      [PHONE_B]: leadResolutionFor(CYCLE_B, PHONE_B),
    },
    analysisResult: async (requestPayload) => {
      if (requestPayload.cycle_id === CYCLE_A) {
        return analysisResultWithDeepJob({
          summary: 'RESUMO RAPIDO A',
          analysisJobId: 'a'.repeat(64),
        })
      }

      return {
        ok: true,
        data: {
          engine_source: 'v1',
          suggestion: {
            summary: 'RESUMO RAPIDO B',
            recommended_status: 'contato',
            tags: [],
          },
          coaching: {},
        },
      }
    },
    analysisJobStatusResult: succeededStatus(deepOutput()),
  })

  await waitFor(
    () => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0,
  )
  const resolveLeadCountAfterA = resolveLeadCalls(calls).length

  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })
  await waitFor(
    () => getDeepAnalysisStatusText(document)?.includes('Leitura aprofundada:'),
    { timeoutMs: 8000 },
  )

  await openSellerPanel(document, 'client')
  assert.match(
    getSellerPanelText(document, 'client'),
    /Necessidade profunda/,
  )

  await goToConversationB({
    document,
    calls,
    resolveLeadCountBefore: resolveLeadCountAfterA,
    title: CONVERSATION_B_TITLE,
    messageId: 'msg-b1',
    prePlainText: '[11:00, 21/08/2026] Cliente B: ',
    text: 'Bom dia, preciso de ajuda para agendar uma visita.',
  })

  assert.equal(getDeepAnalysisStatusText(document), null)

  const panelHtml = getPanel(document)?.innerHTML ?? ''
  assert.doesNotMatch(panelHtml, /Necessidade profunda/)

  await openSellerPanel(document, 'client')
  assert.doesNotMatch(
    getSellerPanelText(document, 'client'),
    /Necessidade profunda/,
  )
})
