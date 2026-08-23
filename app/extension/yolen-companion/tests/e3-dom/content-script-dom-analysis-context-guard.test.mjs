// Testes de comportamento REAL de content-script.js (não modificado neste
// arquivo — só lido, como os demais testes e3-dom) para o guard de
// identidade de contexto em analyzeCurrentConversation(): uma resposta de
// análise (rápida ou atrasada) só pode ser aplicada ao estado seller-facing
// se ela ainda pertencer à conversa/ciclo atualmente visível.
//
// Este arquivo é INDEPENDENTE do teste adversarial existente
// (content-script-dom-stale-analysis-cross-conversation-race.test.mjs,
// de outra frente) — cobre o mesmo BLOCKER, mas com sua própria bateria de
// cenários e fixtures.

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
const CONVERSATION_C_TITLE = '+55 31 96666-5555'

const CYCLE_A = 'cycle-a'
const CYCLE_B = 'cycle-b'
const CYCLE_C = 'cycle-c'

function onlyDigits(value) {
  return String(value).replace(/\D/g, '')
}

const PHONE_A = onlyDigits(CONVERSATION_A_TITLE)
const PHONE_B = onlyDigits(CONVERSATION_B_TITLE)
const PHONE_C = onlyDigits(CONVERSATION_C_TITLE)

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

function getMomentTitleText(document) {
  return getPanel(document)?.querySelector('.yolen-decision-title')?.textContent?.trim() ?? null
}

function analysisTelemetryCallsFor(calls, cycleId) {
  return calls.filter(
    (call) =>
      call.action === 'REGISTER_ACTION_EVENT' &&
      call.payload?.cycle_id === cycleId &&
      call.payload?.action_type === 'suggestion_shown',
  )
}

function analysisResultPayload(summary) {
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
    },
  }
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

// ---------------------------------------------------------------------
// 1) A inicia -> B abre -> A termina (resposta atrasada de A nunca
//    contamina B). 2) A inicia -> B abre -> B termina -> A termina depois
//    (resultado antigo não vence o mais novo). Cobertos juntos porque o
//    segundo é a continuação natural do primeiro.
// ---------------------------------------------------------------------

test('resposta atrasada da conversa A nunca sobrescreve a análise já aplicada da conversa B', async () => {
  let resolveAnalysisA
  const analysisAGate = new Promise((resolve) => {
    resolveAnalysisA = resolve
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
      [PHONE_B]: leadResolutionFor(CYCLE_B, PHONE_B),
    },
    analysisResult: async (requestPayload) => {
      if (requestPayload.cycle_id === CYCLE_A) {
        await analysisAGate
        return analysisResultPayload('RESUMO DA CONVERSA A')
      }

      if (requestPayload.cycle_id === CYCLE_B) {
        return analysisResultPayload('RESUMO DA CONVERSA B')
      }

      return { ok: false, error: `cycle inesperado: ${requestPayload.cycle_id}` }
    },
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0)
  const resolveLeadCountAfterA = resolveLeadCalls(calls).length

  // A inicia a análise e fica presa em analysisAGate (resposta "atrasada").
  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })

  // Vendedor troca para B antes da resposta de A chegar.
  await goToConversationB({
    document,
    calls,
    resolveLeadCountBefore: resolveLeadCountAfterA,
    title: CONVERSATION_B_TITLE,
    messageId: 'msg-b1',
    prePlainText: '[11:00, 21/08/2026] Cliente B: ',
    text: 'Bom dia, preciso de ajuda para agendar uma visita.',
  })

  // B faz sua própria análise, que responde rápido.
  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_B })
  await waitFor(() => getMomentTitleText(document) === 'RESUMO DA CONVERSA B')

  // Só agora a resposta atrasada de A é liberada.
  resolveAnalysisA()

  // Dá tempo da resposta de A ser processada (se o guard falhar, ela
  // sobrescreveria o texto de B pouco depois deste ponto).
  await new Promise((resolve) => setTimeout(resolve, 200))

  assert.equal(
    getMomentTitleText(document),
    'RESUMO DA CONVERSA B',
    'a análise atrasada de A não pode sobrescrever a análise já aplicada de B',
  )

  // A telemetria de "suggestion_shown" também nunca deve ter sido
  // registrada para o ciclo de A (ela só dispara depois que o guard
  // libera a resposta como "ainda atual").
  assert.equal(
    analysisTelemetryCallsFor(calls, CYCLE_A).length,
    0,
    'nenhuma telemetria de sugestão exibida deve existir para a conversa A depois da troca',
  )
  assert.equal(analysisTelemetryCallsFor(calls, CYCLE_B).length, 1)
})

// ---------------------------------------------------------------------
// 3) fingerprint de B permanece B — o analyzedConversationFingerprint não
// fica preso ao fingerprint da conversa A quando a resposta atrasada
// chega. Verificamos indiretamente: depois do cenário acima, "Atualizar
// análise" (o botão só muda de rótulo quando a análise aplicada é
// considerada atual para a conversa em tela) continua íntegro para B.
// ---------------------------------------------------------------------

test('depois da resposta atrasada de A, o botão de análise de B continua consistente (fingerprint não contaminado)', async () => {
  let resolveAnalysisA
  const analysisAGate = new Promise((resolve) => {
    resolveAnalysisA = resolve
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
      [PHONE_B]: leadResolutionFor(CYCLE_B, PHONE_B),
    },
    analysisResult: async (requestPayload) => {
      if (requestPayload.cycle_id === CYCLE_A) {
        await analysisAGate
        return analysisResultPayload('RESUMO DA CONVERSA A')
      }

      return analysisResultPayload('RESUMO DA CONVERSA B')
    },
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0)
  const resolveLeadCountAfterA = resolveLeadCalls(calls).length

  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })

  await goToConversationB({
    document,
    calls,
    resolveLeadCountBefore: resolveLeadCountAfterA,
    title: CONVERSATION_B_TITLE,
    messageId: 'msg-b1',
    prePlainText: '[11:00, 21/08/2026] Cliente B: ',
    text: 'Bom dia, preciso de ajuda para agendar uma visita.',
  })

  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_B })
  await waitFor(() => getMomentTitleText(document) === 'RESUMO DA CONVERSA B')

  resolveAnalysisA()
  await new Promise((resolve) => setTimeout(resolve, 200))

  // Sem mensagens novas em B desde a análise aplicada, a análise de B
  // segue "atual": o rótulo do botão deve ser "Atualizar análise" (não
  // "A conversa mudou..."), e o texto de momento continua sendo o de B.
  const analyzeButton = getAnalyzeButton(document)
  assert.equal(analyzeButton?.textContent?.trim(), 'Atualizar análise')
  assert.equal(getMomentTitleText(document), 'RESUMO DA CONVERSA B')
})

// ---------------------------------------------------------------------
// 8) Voltar para A mostra somente estado válido de A (nunca resíduo de B
// nem da própria resposta atrasada de A aplicada fora de hora).
// ---------------------------------------------------------------------

test('A -> B -> C -> volta para A: A nunca herda estado de B ou C', async () => {
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
      [PHONE_C]: leadResolutionFor(CYCLE_C, PHONE_C),
    },
    analysisResult: async (requestPayload) => {
      if (requestPayload.cycle_id === CYCLE_A) return analysisResultPayload('RESUMO DA CONVERSA A')
      if (requestPayload.cycle_id === CYCLE_B) return analysisResultPayload('RESUMO DA CONVERSA B')
      if (requestPayload.cycle_id === CYCLE_C) return analysisResultPayload('RESUMO DA CONVERSA C')
      return { ok: false, error: 'cycle inesperado' }
    },
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0)
  let resolveLeadCount = resolveLeadCalls(calls).length

  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })
  await waitFor(() => getMomentTitleText(document) === 'RESUMO DA CONVERSA A')

  await goToConversationB({
    document,
    calls,
    resolveLeadCountBefore: resolveLeadCount,
    title: CONVERSATION_B_TITLE,
    messageId: 'msg-b1',
    prePlainText: '[11:00, 21/08/2026] Cliente B: ',
    text: 'Bom dia, preciso de ajuda para agendar uma visita.',
  })
  resolveLeadCount = resolveLeadCalls(calls).length

  // B nunca deve mostrar o resumo de A (nem o botão de análise ainda
  // reflete um resultado — a troca reseta o estado de análise).
  assert.notEqual(getMomentTitleText(document), 'RESUMO DA CONVERSA A')

  await goToConversationB({
    document,
    calls,
    resolveLeadCountBefore: resolveLeadCount,
    title: CONVERSATION_C_TITLE,
    messageId: 'msg-c1',
    prePlainText: '[12:00, 21/08/2026] Cliente C: ',
    text: 'Oi, ainda estou decidindo entre os planos disponíveis.',
  })
  resolveLeadCount = resolveLeadCalls(calls).length

  assert.notEqual(getMomentTitleText(document), 'RESUMO DA CONVERSA A')
  assert.notEqual(getMomentTitleText(document), 'RESUMO DA CONVERSA B')

  await goToConversationB({
    document,
    calls,
    resolveLeadCountBefore: resolveLeadCount,
    title: CONVERSATION_A_TITLE,
    messageId: 'msg-a2',
    prePlainText: '[13:00, 21/08/2026] Cliente A: ',
    text: 'Voltando aqui: qual o prazo de resposta?',
  })

  // De volta a A: nenhum resíduo de B ou C.
  assert.notEqual(getMomentTitleText(document), 'RESUMO DA CONVERSA B')
  assert.notEqual(getMomentTitleText(document), 'RESUMO DA CONVERSA C')

  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })
  await waitFor(() => getMomentTitleText(document) === 'RESUMO DA CONVERSA A')
})

// ---------------------------------------------------------------------
// 9) Resultado antigo não vence resultado mais novo, mesmo dentro da
// MESMA conversa (duas análises da conversa A em sequência; a primeira
// resposta, atrasada, chega depois da segunda já ter sido aplicada).
// ---------------------------------------------------------------------

test('dentro da mesma conversa, uma resposta antiga presa nunca sobrescreve uma resposta mais nova já aplicada', async () => {
  // Cenário realista (alcançável pela UI real, sem burlar nenhum guard
  // existente): o botão "Analisar agora" some enquanto
  // conversationAnalysisLoading é true, então duas análises da MESMA
  // conversa só podem ficar "em voo" ao mesmo tempo se o vendedor sair da
  // conversa (o que zera conversationAnalysisLoading via
  // clearLeadStateForNewConversation, reexibindo o botão) e voltar antes
  // da primeira resposta ter chegado. A primeira análise de A continua
  // presa (ainda não resolveu); ao voltar para A, o vendedor dispara uma
  // SEGUNDA análise, que responde rápido; só depois a primeira,
  // antiquíssima, finalmente chega. A identidade (cycle_id/
  // conversation_key) é a MESMA nos dois casos — só o número de sequência
  // da requisição consegue distinguir "antigo" de "novo" aqui.
  let resolveFirstAnalysis
  const firstAnalysisGate = new Promise((resolve) => {
    resolveFirstAnalysis = resolve
  })

  let callCountForA = 0

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
      if (requestPayload.cycle_id !== CYCLE_A) {
        return analysisResultPayload('IRRELEVANTE')
      }

      callCountForA += 1

      if (callCountForA === 1) {
        await firstAnalysisGate
        return analysisResultPayload('RESUMO ANTIGO')
      }

      return analysisResultPayload('RESUMO NOVO')
    },
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0)
  let resolveLeadCount = resolveLeadCalls(calls).length

  // Primeira análise de A: fica presa em firstAnalysisGate.
  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })

  // Sai rapidamente para B (isso reseta conversationAnalysisLoading via
  // clearLeadStateForNewConversation, mesmo com a 1ª análise de A ainda
  // pendente) e volta para A — o botão "Analisar agora" reaparece.
  await goToConversationB({
    document,
    calls,
    resolveLeadCountBefore: resolveLeadCount,
    title: CONVERSATION_B_TITLE,
    messageId: 'msg-b1',
    prePlainText: '[11:00, 21/08/2026] Cliente B: ',
    text: 'Bom dia, preciso de ajuda para agendar uma visita.',
  })
  resolveLeadCount = resolveLeadCalls(calls).length

  await goToConversationB({
    document,
    calls,
    resolveLeadCountBefore: resolveLeadCount,
    title: CONVERSATION_A_TITLE,
    messageId: 'msg-a2',
    prePlainText: '[12:00, 21/08/2026] Cliente A: ',
    text: 'Ainda estou aqui, alguma novidade sobre o plano?',
  })

  // Segunda análise de A: dispara e responde rápido ("RESUMO NOVO").
  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })
  await waitFor(() => getMomentTitleText(document) === 'RESUMO NOVO')

  // Só agora a primeiríssima resposta (presa desde o início do teste)
  // finalmente chega — mesma conversa, mesmo cycle_id, mas uma
  // requisição muito mais antiga.
  resolveFirstAnalysis()
  await new Promise((resolve) => setTimeout(resolve, 200))

  assert.equal(
    getMomentTitleText(document),
    'RESUMO NOVO',
    'a resposta presa da 1ª análise de A não pode vencer a 2ª análise, já aplicada, da mesma conversa',
  )
})

// ---------------------------------------------------------------------
// non-commercial: uma conversa pessoal/ambígua não ganha CTA comercial
// contaminado por uma resposta atrasada de uma conversa comercial.
// ---------------------------------------------------------------------

test('resposta comercial atrasada de A não injeta CTA comercial na conversa pessoal B', async () => {
  let resolveAnalysisA
  const analysisAGate = new Promise((resolve) => {
    resolveAnalysisA = resolve
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
      [PHONE_B]: leadResolutionFor(CYCLE_B, PHONE_B),
    },
    analysisResult: async (requestPayload) => {
      if (requestPayload.cycle_id === CYCLE_A) {
        await analysisAGate
        return {
          ok: true,
          data: {
            engine_source: 'v1',
            suggestion: {
              summary: 'RESUMO COMERCIAL DE A',
              recommended_status: 'negociacao',
              tags: ['commercial_relevance:commercial'],
            },
            coaching: {},
          },
        }
      }

      return {
        ok: true,
        data: {
          engine_source: 'v1',
          suggestion: {
            summary: 'CONVERSA PESSOAL DE B',
            recommended_status: 'contato',
            tags: ['commercial_relevance:non_commercial'],
          },
          coaching: {},
        },
      }
    },
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0)
  const resolveLeadCountAfterA = resolveLeadCalls(calls).length

  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })

  await goToConversationB({
    document,
    calls,
    resolveLeadCountBefore: resolveLeadCountAfterA,
    title: CONVERSATION_B_TITLE,
    messageId: 'msg-b1',
    prePlainText: '[11:00, 21/08/2026] Cliente B: ',
    text: 'Oi, tudo bem? Só passando para dizer oi.',
  })

  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_B })
  await waitFor(() => getMomentTitleText(document) === 'CONVERSA PESSOAL DE B')

  resolveAnalysisA()
  await new Promise((resolve) => setTimeout(resolve, 200))

  const panelHtml = getPanel(document)?.innerHTML ?? ''

  assert.equal(getMomentTitleText(document), 'CONVERSA PESSOAL DE B')
  assert.doesNotMatch(
    panelHtml,
    /RESUMO COMERCIAL DE A/,
    'a análise comercial atrasada de A nunca deve aparecer na conversa pessoal B',
  )
})
