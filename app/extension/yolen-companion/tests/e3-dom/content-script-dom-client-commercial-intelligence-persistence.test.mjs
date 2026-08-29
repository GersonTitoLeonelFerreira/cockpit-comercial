// FASE 13 Frente 2 — CLIENTE: inteligência comercial + relacionamento real.
//
// Causa raiz provada nesta frente: getActiveCommercialReading() lê
// state.conversationAnalysis, e toda nova tentativa de analyzeCurrentConversation()
// (automática por nova mensagem, ou manual) zera esse campo de imediato,
// antes mesmo de saber se a nova tentativa vai suceder. Sem nenhum
// tratamento, isso faz CLIENTE perder uma inteligência comercial já válida
// assim que uma re-análise em segundo plano começa — e, se essa nova
// tentativa falhar, a perda vira permanente até a próxima análise bem-
// sucedida, mesmo sem nenhuma mensagem nova que invalidasse o que já se
// sabia sobre o cliente.
//
// Corrigido via rememberLastKnownClientCommercialReadingIfPresent/
// getLastKnownClientCommercialReading em content-script.js: CLIENTE passa a
// ter memória própria da última leitura comercial promovida com sucesso,
// independente do ciclo de vida por tentativa de conversationAnalysis — mas
// ainda sujeita à mesma proteção contra desatualização por fingerprint que
// o resultado ao vivo já tinha, e sempre zerada por
// clearLeadStateForNewConversation() numa troca real de conversa. ANÁLISE/
// AGORA continuam sem nenhuma mudança de comportamento (getActiveCommercialReading()
// não foi alterado).
//
// Segue o mesmo harness real (node:vm + jsdom) usado pelos outros testes de
// DOM da E3 — carrega content-script.js de verdade, sem modificá-lo, e
// observa apenas a superfície pública real (DOM resultante + chamadas a
// chrome.runtime.sendMessage).

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMessageHtml,
  buildWhatsAppPageHtml,
  defaultLeadResolution,
  loadContentScript,
  resolveLeadCalls,
  ingestCalls,
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

function leadResolutionFor(cycleId, phone) {
  return defaultLeadResolution({
    phone,
    cycle: {
      id: cycleId,
      status: 'contato',
      owner_user_id: 'user-1',
    },
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

function evidence(summary) {
  return {
    summary,
    evidence_message_ids: ['msg-a1'],
    memory_ids: [],
  }
}

function deepReadingWithNeed(needSummary) {
  return {
    contract_version: 'commercial-reading-v1',
    analysis_status: 'complete',
    analysis_limitations: [],
    commercial_role: 'buyer',
    commercial_relevance: 'commercial',
    conversation_summary: {
      current_state: evidence('Estado profundo comercial.'),
    },
    customer: {
      objectives: [],
      problems: [],
      impacts: [],
      needs: [evidence(needSummary)],
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
      configured: false,
      name: null,
      stages: [],
      current_stage: null,
      adherence: 'not_configured',
      deviations: [],
    },
    seller_strengths: [],
    improvement_points: [],
    service_risks: [],
  }
}

function deepOutputWithNeed(needSummary) {
  return {
    contract_version: 'phase12a-deep-seller-v1',
    engine_source: 'stateful',
    commercial_relevance: 'commercial',
    commercial_role: 'buyer',
    summary: 'Cliente pediu desconto no plano anual.',
    commercial_reading: deepReadingWithNeed(needSummary),
    recommended_next_approach: 'Aprofundar valor antes de negociar.',
    recommended_question: 'Qual impacto isso gera hoje?',
    suggested_message: 'Consigo 10% no plano anual, fechamos hoje?',
  }
}

function analysisResultWithDeepJob({ analysisJobId, deepStatus = 'queued', watermark }) {
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

function failedStatus({ analysisJobId, watermark }) {
  return {
    ok: true,
    data: {
      analysis_job_id: analysisJobId,
      status: 'failed',
      message_watermark: watermark,
      result: null,
    },
  }
}

function getAnalyzeButton(document) {
  return document
    .getElementById('yolen-companion-panel')
    ?.querySelector('[data-yolen-action="analyze-conversation"]')
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

function clickSellerArea(document, area) {
  document
    .querySelector(`[data-yolen-seller-area="${area}"]`)
    ?.dispatchEvent(
      new document.defaultView.Event('click', { bubbles: true }),
    )
}

async function openSellerPanel(document, area) {
  clickSellerArea(document, area)

  await waitFor(
    () => !document.querySelector(`[data-yolen-seller-panel="${area}"]`)?.hidden,
  )
}

function getSellerPanelText(document, area) {
  return (
    document.querySelector(`[data-yolen-seller-panel="${area}"]`)
      ?.textContent ?? ''
  )
}

function isClientAreaEmpty(document) {
  return Boolean(document.querySelector('[data-yolen-client-empty]'))
}

test('CLIENTE mantém a inteligência comercial já conhecida enquanto uma nova análise está em voo', async () => {
  let analyzeCallCount = 0

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
    analysisResult: async () => {
      analyzeCallCount += 1

      return analysisResultWithDeepJob({
        analysisJobId: analyzeCallCount === 1 ? 'a'.repeat(64) : 'b'.repeat(64),
        watermark: analyzeCallCount === 1 ? 'wm-1' : 'wm-2',
      })
    },
    analysisJobStatusResult: async (requestPayload) => {
      if (requestPayload.analysis_job_id === 'a'.repeat(64)) {
        return succeededStatus({
          analysisJobId: 'a'.repeat(64),
          watermark: 'wm-1',
          result: deepOutputWithNeed('NECESSIDADE ORIGINAL CONHECIDA'),
        })
      }

      // Job da segunda tentativa nunca resolve dentro da janela do teste —
      // simula a análise em voo (queued/running) que hoje já zera
      // conversationAnalysis de imediato ao ser disparada.
      return new Promise(() => {})
    },
  })

  await waitFor(
    () => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0,
  )

  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })

  await openSellerPanel(document, 'client')
  await waitFor(
    () => getSellerPanelText(document, 'client').includes('NECESSIDADE ORIGINAL CONHECIDA'),
    { timeoutMs: 8000 },
  )

  // Segunda tentativa (nova análise automática/manual) — o job nunca
  // resolve, então isto exercita exatamente a janela em que
  // conversationAnalysis já foi zerado mas nenhum resultado novo chegou.
  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })
  await waitFor(() => analyzeCallCount === 2)

  await new Promise((resolve) => setTimeout(resolve, 300))

  assert.match(
    getSellerPanelText(document, 'client'),
    /NECESSIDADE ORIGINAL CONHECIDA/,
    'CLIENTE não deveria perder a inteligência comercial só porque uma nova análise está em voo',
  )
  assert.equal(
    isClientAreaEmpty(document),
    false,
  )
})

test('CLIENTE mantém a inteligência comercial já conhecida quando uma nova análise falha', async () => {
  let analyzeCallCount = 0

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
    analysisResult: async () => {
      analyzeCallCount += 1

      return analysisResultWithDeepJob({
        analysisJobId: analyzeCallCount === 1 ? 'a'.repeat(64) : 'b'.repeat(64),
        watermark: analyzeCallCount === 1 ? 'wm-1' : 'wm-2',
      })
    },
    analysisJobStatusResult: async (requestPayload) => {
      if (requestPayload.analysis_job_id === 'a'.repeat(64)) {
        return succeededStatus({
          analysisJobId: 'a'.repeat(64),
          watermark: 'wm-1',
          result: deepOutputWithNeed('NECESSIDADE ORIGINAL CONHECIDA'),
        })
      }

      return failedStatus({
        analysisJobId: 'b'.repeat(64),
        watermark: 'wm-2',
      })
    },
  })

  await waitFor(
    () => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0,
  )

  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })

  await openSellerPanel(document, 'client')
  await waitFor(
    () => getSellerPanelText(document, 'client').includes('NECESSIDADE ORIGINAL CONHECIDA'),
    { timeoutMs: 8000 },
  )

  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })

  // ANÁLISE precisa continuar mostrando o erro real da tentativa nova —
  // esta correção não pode esconder falhas reais da aba ANÁLISE.
  await waitFor(() => {
    const analysisText =
      document.querySelector('[data-yolen-seller-panel="analysis"]')
        ?.textContent ?? ''

    return analysisText.includes(
      'Não foi possível concluir a leitura comercial da Yolen.',
    )
  })

  assert.match(
    getSellerPanelText(document, 'client'),
    /NECESSIDADE ORIGINAL CONHECIDA/,
    'CLIENTE não deveria perder inteligência comercial válida por causa de uma falha em uma tentativa de análise mais nova',
  )
})

test('CLIENTE nunca herda a inteligência comercial da conversa anterior ao trocar de A para B', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: pageHtmlFor({
      headerTitle: CONVERSATION_A_TITLE,
      messageId: 'msg-a1',
      prePlainText: '[10:00, 21/08/2026] Cliente A: ',
      text: 'Olá, quero saber mais sobre o plano mensal.',
    }),
    resolutionsByPhone: {
      [PHONE_A]: leadResolutionFor(CYCLE_A, PHONE_A),
      [PHONE_B]: leadResolutionFor(CYCLE_B, PHONE_B),
    },
    analysisResult: analysisResultWithDeepJob({
      analysisJobId: 'a'.repeat(64),
      watermark: 'wm-1',
    }),
    analysisJobStatusResult: succeededStatus({
      analysisJobId: 'a'.repeat(64),
      watermark: 'wm-1',
      result: deepOutputWithNeed('CONHECIMENTO EXCLUSIVO DE A'),
    }),
  })

  await waitFor(
    () => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0,
  )

  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })

  await openSellerPanel(document, 'client')
  await waitFor(
    () => getSellerPanelText(document, 'client').includes('CONHECIMENTO EXCLUSIVO DE A'),
    { timeoutMs: 8000 },
  )

  const resolveLeadCountBeforeSwitch = resolveLeadCalls(calls).length

  const conversationBody = document.getElementById('conversation-body')
  const headerTitleSpan = document.querySelector('header span[title]')

  headerTitleSpan.setAttribute('title', CONVERSATION_B_TITLE)
  headerTitleSpan.textContent = CONVERSATION_B_TITLE
  conversationBody.innerHTML = buildMessageHtml({
    id: 'msg-b1',
    prePlainText: '[12:00, 21/08/2026] Cliente B: ',
    text: 'Oi, tudo bem?',
  })

  await waitFor(
    () => resolveLeadCalls(calls).length > resolveLeadCountBeforeSwitch,
  )

  await waitFor(() => {
    const ingests = ingestCalls(calls)
    return ingests.at(-1)?.payload.messages.some(
      (message) => message.message_key?.includes('msg-b1'),
    )
  })

  await openSellerPanel(document, 'client')

  const clientTextForB = getSellerPanelText(document, 'client')

  assert.doesNotMatch(
    clientTextForB,
    /CONHECIMENTO EXCLUSIVO DE A/,
    'CLIENTE de B nunca pode mostrar a inteligência comercial de A',
  )
})

test('CLIENTE deixa de apresentar a inteligência comercial como atual assim que uma nova mensagem a torna desatualizada', async () => {
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
      analysisJobId: 'a'.repeat(64),
      watermark: 'wm-1',
    }),
    analysisJobStatusResult: succeededStatus({
      analysisJobId: 'a'.repeat(64),
      watermark: 'wm-1',
      result: deepOutputWithNeed('NECESSIDADE ORIGINAL CONHECIDA'),
    }),
  })

  await waitFor(
    () => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0,
  )

  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })

  await openSellerPanel(document, 'client')
  await waitFor(
    () => getSellerPanelText(document, 'client').includes('NECESSIDADE ORIGINAL CONHECIDA'),
    { timeoutMs: 8000 },
  )

  const ingestCountBeforeNewMessage = ingestCalls(calls).length

  // Mensagem nova chega, mas a nova análise automática (8s de debounce)
  // ainda não teve tempo de rodar — este é exatamente o intervalo em que o
  // snapshot de CLIENTE precisa parar de ser mostrado como atual, mesmo
  // sem nenhuma falha/erro envolvida: novas mensagens reais invalidam o
  // fingerprint capturado, e isCurrentAnalysisOutdated()/
  // getLastKnownClientCommercialReading() precisam concordar sobre isso.
  document.getElementById('conversation-body').innerHTML = buildMessageHtml({
    id: 'msg-a2',
    prePlainText: '[11:00, 21/08/2026] Cliente A: ',
    text: 'Ainda aqui, alguma novidade sobre o desconto?',
  })

  await waitFor(
    () => ingestCalls(calls).length > ingestCountBeforeNewMessage,
  )

  assert.doesNotMatch(
    getSellerPanelText(document, 'client'),
    /NECESSIDADE ORIGINAL CONHECIDA/,
    'CLIENTE não pode apresentar uma leitura comercial desatualizada como se fosse atual só porque ela ficou memorizada',
  )
})

// Reauditoria do Controle Mestre — BLOCKER: o snapshot era identificado só
// por fingerprint, sem cycle_id/conversation_key/company_id. Isso resolve
// A→B (troca real de conversa, via clearLeadStateForNewConversation), mas
// não cobre a MESMA conversation_key sendo resolvida para um cycle_id
// diferente — cenário real via resolveCurrentLead() (ex.: botão global
// "Atualizar", que rechama loadYolenSession()+resolveCurrentLead() para a
// conversa aberta) sem nenhuma mudança de header/mensagens, então o
// fingerprint continua idêntico e o snapshot antigo ficaria elegível para
// o ciclo novo.
function getRefreshButton(document) {
  return document
    .getElementById('yolen-companion-panel')
    ?.querySelector('[data-yolen-action="refresh"]')
}

test('CLIENTE nunca mostra a inteligência comercial de um ciclo antigo quando a mesma conversa resolve para um ciclo novo', async () => {
  // Não depende de quantas vezes RESOLVE_LEAD é chamado antes do clique em
  // "Atualizar" (pode haver mais de uma chamada legítima na resolução
  // inicial) — só do momento em que o teste explicitamente sinaliza a
  // troca de ciclo, imediatamente antes do clique.
  let activeCycleId = CYCLE_A

  const { document, calls } = loadContentScript({
    initialHtml: pageHtmlFor({
      headerTitle: CONVERSATION_A_TITLE,
      messageId: 'msg-a1',
      prePlainText: '[10:00, 21/08/2026] Cliente A: ',
      text: 'Olá, quero saber mais sobre o plano mensal.',
    }),
    resolutionsByPhone: {
      [PHONE_A]: () => leadResolutionFor(activeCycleId, PHONE_A),
    },
    analysisResult: analysisResultWithDeepJob({
      analysisJobId: 'a'.repeat(64),
      watermark: 'wm-1',
    }),
    analysisJobStatusResult: async (requestPayload) => {
      if (requestPayload.analysis_job_id === 'a'.repeat(64)) {
        return succeededStatus({
          analysisJobId: 'a'.repeat(64),
          watermark: 'wm-1',
          result: deepOutputWithNeed('CONHECIMENTO DO CICLO A'),
        })
      }

      // Job do ciclo B nunca resolve dentro da janela do teste — prova
      // que a proteção não espera nenhuma análise de B terminar.
      return new Promise(() => {})
    },
  })

  await waitFor(
    () => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0,
  )

  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })

  await openSellerPanel(document, 'client')
  await waitFor(
    () => getSellerPanelText(document, 'client').includes('CONHECIMENTO DO CICLO A'),
    { timeoutMs: 8000 },
  )

  // Mesma conversation_key, mesmo header, mensagens inalteradas — só o
  // ciclo por trás da resolução muda, via o botão global "Atualizar".
  const resolveLeadCountBeforeRefresh =
    resolveLeadCalls(calls).length

  activeCycleId = CYCLE_B

  const refreshButton = getRefreshButton(document)
  assert.ok(refreshButton, 'esperava o botão global de atualizar no painel')

  refreshButton.dispatchEvent(
    new document.defaultView.Event('click', { bubbles: true }),
  )

  await waitFor(
    () => resolveLeadCalls(calls).length > resolveLeadCountBeforeRefresh,
  )

  // A chamada já foi registrada em `calls`, mas o handler assíncrono do
  // mock ainda precisa resolver e o resultado ainda precisa ser aplicado a
  // `state` — mesmo padrão de assentamento usado pelos outros testes deste
  // arquivo/pasta (ex.: "resolveStatusA1()" em content-script-dom-deep-
  // analysis-delivery.test.mjs).
  await new Promise((resolve) => setTimeout(resolve, 300))

  // A resolução para cycle-B já chegou (aguardado acima); nenhuma análise
  // de cycle-B terminou ainda (o mock trava em voo) — o conhecimento do
  // ciclo A precisa já estar inelegível neste exato momento, sem esperar
  // nada mais.
  await openSellerPanel(document, 'client')

  assert.doesNotMatch(
    getSellerPanelText(document, 'client'),
    /CONHECIMENTO DO CICLO A/,
    'CLIENTE não pode continuar mostrando conhecimento do ciclo antigo quando a mesma conversa já resolveu para um ciclo novo',
  )
})

test('CLIENTE nunca mostra a inteligência comercial de outra empresa quando a mesma sessão resolve para uma empresa diferente', async () => {
  let getMeCallCount = 0

  // Não depende de quantas vezes GET_ME é chamado antes do clique em
  // "Atualizar" — só do momento em que o teste explicitamente sinaliza a
  // troca de empresa ativa, imediatamente antes do clique.
  let activeCompanyId = 'company-1'

  function getMeResponse(companyId) {
    return {
      ok: true,
      statusCode: 200,
      origin: 'https://cockpit-comercial-vocn.vercel.app',
      payload: {
        ok: true,
        user: { full_name: 'Vendedor Teste' },
        active_company: { id: companyId, name: 'Empresa Teste', role: 'member' },
      },
    }
  }

  const { document, calls } = loadContentScript({
    initialHtml: pageHtmlFor({
      headerTitle: CONVERSATION_A_TITLE,
      messageId: 'msg-a1',
      prePlainText: '[10:00, 21/08/2026] Cliente A: ',
      text: 'Olá, quero saber mais sobre o plano mensal.',
    }),
    getMeResult: () => {
      getMeCallCount += 1
      return getMeResponse(activeCompanyId)
    },
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
      result: deepOutputWithNeed('CONHECIMENTO DA EMPRESA 1'),
    }),
  })

  await waitFor(
    () => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0,
  )

  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })

  await openSellerPanel(document, 'client')
  await waitFor(
    () => getSellerPanelText(document, 'client').includes('CONHECIMENTO DA EMPRESA 1'),
    { timeoutMs: 8000 },
  )

  const refreshButton = getRefreshButton(document)
  assert.ok(refreshButton, 'esperava o botão global de atualizar no painel')

  const resolveLeadCountBeforeRefresh = resolveLeadCalls(calls).length
  const getMeCallCountBeforeRefresh = getMeCallCount

  activeCompanyId = 'company-2'

  refreshButton.dispatchEvent(
    new document.defaultView.Event('click', { bubbles: true }),
  )

  await waitFor(() => getMeCallCount > getMeCallCountBeforeRefresh)
  await waitFor(
    () => resolveLeadCalls(calls).length > resolveLeadCountBeforeRefresh,
  )

  await new Promise((resolve) => setTimeout(resolve, 300))

  await openSellerPanel(document, 'client')

  assert.doesNotMatch(
    getSellerPanelText(document, 'client'),
    /CONHECIMENTO DA EMPRESA 1/,
    'CLIENTE não pode continuar mostrando conhecimento comercial de uma empresa que não é mais a empresa ativa da sessão',
  )
})
