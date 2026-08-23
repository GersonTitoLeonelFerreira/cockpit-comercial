// Testes de comportamento REAL de content-script.js (não modificado neste
// arquivo — só lido, como os demais testes e3-dom) para a entrega do
// resultado da análise profunda ao seller-facing (Frente "Deep Result
// Delivery"): acompanhamento de analysis_job_id, polling com backoff,
// guard de contexto reaproveitado de analyzeCurrentConversation(), e as
// regras de não-contaminação entre conversas / não-degradação por job
// antigo.

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
    cycle: { id: cycleId, status: 'contato', owner_user_id: 'user-1' },
    ...overrides,
  })
}

function pageHtmlFor({ headerTitle, messageId, prePlainText, text }) {
  return buildWhatsAppPageHtml({
    headerTitle,
    messagesHtml: buildMessageHtml({ id: messageId, prePlainText, text }),
  })
}

function switchConversationDom(document, { headerTitle, messageId, prePlainText, text }) {
  const conversationBody = document.getElementById('conversation-body')
  const headerTitleSpan = document.querySelector('header span[title]')

  headerTitleSpan.setAttribute('title', headerTitle)
  headerTitleSpan.textContent = headerTitle
  conversationBody.innerHTML = buildMessageHtml({ id: messageId, prePlainText, text })
}

function getPanel(document) {
  return document.getElementById('yolen-companion-panel')
}

function getAnalyzeButton(document) {
  return getPanel(document)?.querySelector('[data-yolen-action="analyze-conversation"]')
}

function getDeepAnalysisStatusText(document) {
  return (
    getPanel(document)
      ?.querySelector('.yolen-deep-analysis-status .yolen-decision-copy')
      ?.textContent
      ?.trim() ?? null
  )
}

async function clickAnalyzeAndWaitForRequest({ document, calls, cycleId }) {
  await waitFor(() => Boolean(getAnalyzeButton(document)))
  const before = calls.filter(
    (call) => call.action === 'ANALYZE_CONVERSATION' && call.payload?.cycle_id === cycleId,
  ).length

  getAnalyzeButton(document).dispatchEvent(
    new document.defaultView.Event('click', { bubbles: true }),
  )

  await waitFor(
    () =>
      calls.filter(
        (call) => call.action === 'ANALYZE_CONVERSATION' && call.payload?.cycle_id === cycleId,
      ).length > before,
  )
}

async function goToConversationB({ document, calls, resolveLeadCountBefore, title, messageId, prePlainText, text }) {
  switchConversationDom(document, { headerTitle: title, messageId, prePlainText, text })
  await waitFor(() => resolveLeadCalls(calls).length > resolveLeadCountBefore)
  await waitFor(() => {
    const ingests = ingestCalls(calls)
    return ingests.at(-1)?.payload.messages.some((message) => message.message_key?.includes(messageId))
  })
}

function deepOutput(overrides = {}) {
  return {
    contract_version: 'phase-5.2-stateful-copilot-v3',
    commercial_relevance: 'commercial',
    interpretation: {
      current_moment: {
        summary: 'Cliente pediu desconto no plano anual.',
      },
    },
    strategy: {
      suggested_message: 'Consigo 10% no plano anual, fechamos hoje?',
    },
    ...overrides,
  }
}

function analysisResultWithDeepJob({ summary, analysisJobId, deepStatus = 'queued', watermark = 'wm-1' }) {
  return {
    ok: true,
    data: {
      engine_source: 'v1',
      suggestion: {
        summary,
        recommended_status: 'contato',
        tags: [],
      },
      coaching: {},
      deep_analysis: {
        analysis_job_id: analysisJobId,
        status: deepStatus,
        message_watermark: watermark,
      },
    },
  }
}

// ---------------------------------------------------------------------
// (1)/(7)/(8)/(9)/(10) queued -> polling com backoff -> succeeded atualiza
// a área ANÁLISE, sem bloquear a UI (o resumo rápido já aparece antes).
// ---------------------------------------------------------------------

test('deep_analysis queued: aparece "em andamento" e, ao concluir, a leitura aprofundada é mesclada sem bloquear a UI', async () => {
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
      summary: 'RESUMO RAPIDO A',
      analysisJobId: 'a'.repeat(64),
    }),
    analysisJobStatusResult: { ok: true, data: { status: 'succeeded', result: deepOutput() } },
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0)
  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })

  // O resumo rápido (v1) já apareceu — a UI nunca fica bloqueada esperando
  // a análise profunda.
  await waitFor(() => getDeepAnalysisStatusText(document) === 'Análise aprofundada em andamento')

  await waitFor(
    () =>
      getDeepAnalysisStatusText(document)?.includes('Leitura aprofundada:') &&
      getDeepAnalysisStatusText(document)?.includes('Consigo 10% no plano anual'),
    { timeoutMs: 8000 },
  )

  assert.ok(analysisJobStatusCalls(calls).length >= 1)
  assert.equal(analysisJobStatusCalls(calls)[0].payload.analysis_job_id, 'a'.repeat(64))
  assert.equal(analysisJobStatusCalls(calls)[0].payload.cycle_id, CYCLE_A)
})

// ---------------------------------------------------------------------
// (2) failed
// ---------------------------------------------------------------------

test('deep_analysis failed: mostra falha, nunca expõe job id/queue/worker/watermark ao vendedor', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: pageHtmlFor({
      headerTitle: CONVERSATION_A_TITLE,
      messageId: 'msg-a1',
      prePlainText: '[10:00, 21/08/2026] Cliente A: ',
      text: 'Olá, quero saber mais sobre o plano mensal.',
    }),
    resolutionsByPhone: { [PHONE_A]: leadResolutionFor(CYCLE_A, PHONE_A) },
    analysisResult: analysisResultWithDeepJob({
      summary: 'RESUMO RAPIDO A',
      analysisJobId: 'a'.repeat(64),
    }),
    analysisJobStatusResult: { ok: true, data: { status: 'failed', result: null } },
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0)
  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })

  await waitFor(
    () => getDeepAnalysisStatusText(document)?.includes('Falha na análise aprofundada'),
    { timeoutMs: 8000 },
  )

  const panelHtml = getPanel(document)?.innerHTML ?? ''
  assert.doesNotMatch(panelHtml, new RegExp('a'.repeat(64)))
  assert.doesNotMatch(panelHtml, /wm-1/)
  assert.doesNotMatch(panelHtml, /queue|worker|watermark|candidate/i)
})

// ---------------------------------------------------------------------
// (3)/(18) superseded nunca vira corrente
// ---------------------------------------------------------------------

test('deep_analysis superseded: nunca aparece como resultado, some silenciosamente', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: pageHtmlFor({
      headerTitle: CONVERSATION_A_TITLE,
      messageId: 'msg-a1',
      prePlainText: '[10:00, 21/08/2026] Cliente A: ',
      text: 'Olá, quero saber mais sobre o plano mensal.',
    }),
    resolutionsByPhone: { [PHONE_A]: leadResolutionFor(CYCLE_A, PHONE_A) },
    analysisResult: analysisResultWithDeepJob({
      summary: 'RESUMO RAPIDO A',
      analysisJobId: 'a'.repeat(64),
    }),
    analysisJobStatusResult: { ok: true, data: { status: 'superseded', result: null } },
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0)
  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })

  await waitFor(() => analysisJobStatusCalls(calls).length > 0)
  await new Promise((resolve) => setTimeout(resolve, 300))

  assert.equal(getDeepAnalysisStatusText(document), null)
})

// ---------------------------------------------------------------------
// (4)/(8)/(9)/(10)/(11) guard de contexto: job de A pendente, vendedor
// troca para B antes do poll resolver — B nunca recebe o resultado
// profundo de A (fingerprint/ANÁLISE/AGORA/CLIENTE/loading de B intactos).
// ---------------------------------------------------------------------

test('deep_analysis pendente de A nunca contamina a conversa B depois da troca', async () => {
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
          suggestion: { summary: 'RESUMO RAPIDO B', recommended_status: 'contato', tags: [] },
          coaching: {},
        },
      }
    },
    analysisJobStatusResult: { ok: true, data: { status: 'succeeded', result: deepOutput() } },
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0)
  const resolveLeadCountAfterA = resolveLeadCalls(calls).length

  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })
  // O job de A ficou "pendente" no painel antes da troca.
  await waitFor(() => getDeepAnalysisStatusText(document) === 'Análise aprofundada em andamento')

  await goToConversationB({
    document,
    calls,
    resolveLeadCountBefore: resolveLeadCountAfterA,
    title: CONVERSATION_B_TITLE,
    messageId: 'msg-b1',
    prePlainText: '[11:00, 21/08/2026] Cliente B: ',
    text: 'Bom dia, preciso de ajuda para agendar uma visita.',
  })

  // A troca já reseta o indicador de análise profunda de B para nada
  // (nenhum job de B foi criado ainda).
  assert.equal(getDeepAnalysisStatusText(document), null)

  // Dá tempo suficiente para o poll (ainda amarrado ao contexto antigo de
  // A) ter uma chance de resolver, se o guard falhasse.
  await new Promise((resolve) => setTimeout(resolve, 2000))

  assert.equal(
    getDeepAnalysisStatusText(document),
    null,
    'a leitura aprofundada de A nunca pode aparecer na conversa B',
  )

  const panelHtml = getPanel(document)?.innerHTML ?? ''
  assert.doesNotMatch(panelHtml, /Consigo 10% no plano anual/)
})

// ---------------------------------------------------------------------
// (6)/(23)/(24) mesma conversa: A1 pendente -> A2 inicia (novo clique,
// via "Analisar agora" — MESMO pipeline) -> A2 conclui primeiro -> A1
// conclui depois. A1 nunca pode degradar o resultado já aplicado de A2.
// ---------------------------------------------------------------------

test('dentro da mesma conversa, resultado profundo de um job antigo nunca sobrescreve o de um job mais novo já aplicado', async () => {
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
    resolutionsByPhone: { [PHONE_A]: leadResolutionFor(CYCLE_A, PHONE_A) },
    analysisResult: async () => {
      analyzeCallCount += 1

      if (analyzeCallCount === 1) {
        return analysisResultWithDeepJob({
          summary: 'RESUMO RAPIDO A1',
          analysisJobId: 'a'.repeat(64),
        })
      }

      return analysisResultWithDeepJob({
        summary: 'RESUMO RAPIDO A2',
        analysisJobId: 'c'.repeat(64),
      })
    },
    analysisJobStatusResult: async (requestPayload) => {
      if (requestPayload.analysis_job_id === 'a'.repeat(64)) {
        await statusA1Gate
        return { ok: true, data: { status: 'succeeded', result: deepOutput({ strategy: { suggested_message: 'MENSAGEM DO JOB ANTIGO' } }) } }
      }

      return { ok: true, data: { status: 'succeeded', result: deepOutput({ strategy: { suggested_message: 'MENSAGEM DO JOB NOVO' } }) } }
    },
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0)

  // Primeira análise (A1): job "a...a" fica pendente, preso em
  // statusA1Gate.
  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })
  await waitFor(() => getDeepAnalysisStatusText(document) === 'Análise aprofundada em andamento')
  await waitFor(() => analysisJobStatusCalls(calls).some((call) => call.payload.analysis_job_id === 'a'.repeat(64)))

  // Sai e volta para reabilitar o botão (mesma técnica real de UI usada
  // pelo guard já testado em PR anterior), e dispara a 2ª análise (A2),
  // que usa o MESMO pipeline "Analisar agora" -> analyze-conversation ->
  // deep job -> tracking -> guard -> render.
  const headerTitleSpan = document.querySelector('header span[title]')
  headerTitleSpan.setAttribute('title', CONVERSATION_A_TITLE)
  document.getElementById('conversation-body').innerHTML = buildMessageHtml({
    id: 'msg-a2',
    prePlainText: '[11:00, 21/08/2026] Cliente A: ',
    text: 'Ainda aqui, alguma novidade?',
  })

  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })

  await waitFor(
    () =>
      getDeepAnalysisStatusText(document)?.includes('MENSAGEM DO JOB NOVO'),
    { timeoutMs: 8000 },
  )

  // Só agora o job antigo (A1), preso desde o início, finalmente resolve.
  resolveStatusA1()
  await new Promise((resolve) => setTimeout(resolve, 300))

  assert.ok(
    getDeepAnalysisStatusText(document)?.includes('MENSAGEM DO JOB NOVO'),
    'o resultado do job antigo (A1) nunca pode degradar o resultado já aplicado do job novo (A2)',
  )
  assert.ok(
    !getDeepAnalysisStatusText(document)?.includes('MENSAGEM DO JOB ANTIGO'),
  )
})

// ---------------------------------------------------------------------
// (25)/(26)/(27) non-commercial: nenhum CTA, nenhuma mensagem sugerida,
// nenhuma next-action quando a relevância atual não justifica ação
// comercial.
// ---------------------------------------------------------------------

test('deep_analysis non_commercial: nenhuma mensagem sugerida nem CTA comercial aparece, mesmo se o backend enviar uma por engano', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: pageHtmlFor({
      headerTitle: CONVERSATION_A_TITLE,
      messageId: 'msg-a1',
      prePlainText: '[10:00, 21/08/2026] Cliente A: ',
      text: 'Oi, tudo bem? Só passando pra dizer oi.',
    }),
    resolutionsByPhone: { [PHONE_A]: leadResolutionFor(CYCLE_A, PHONE_A) },
    analysisResult: analysisResultWithDeepJob({
      summary: 'CONVERSA PESSOAL',
      analysisJobId: 'a'.repeat(64),
    }),
    analysisJobStatusResult: {
      ok: true,
      data: {
        status: 'succeeded',
        result: deepOutput({
          commercial_relevance: 'non_commercial',
          strategy: { suggested_message: 'MENSAGEM QUE NUNCA DEVE APARECER' },
        }),
      },
    },
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0)
  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })

  await waitFor(
    () => getDeepAnalysisStatusText(document)?.includes('nenhuma intervenção comercial necessária'),
    { timeoutMs: 8000 },
  )

  const panelHtml = getPanel(document)?.innerHTML ?? ''
  assert.doesNotMatch(panelHtml, /MENSAGEM QUE NUNCA DEVE APARECER/)
})
