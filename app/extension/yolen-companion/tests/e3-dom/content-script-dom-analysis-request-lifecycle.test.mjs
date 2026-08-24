import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMessageHtml,
  buildWhatsAppPageHtml,
  defaultLeadResolution,
  loadContentScript,
  resolveLeadCalls,
  ingestCalls,
  analysisCalls,
  waitFor,
} from '../e3-test-support/load-content-script.mjs'

// ---------------------------------------------------------------------------
// Fase 12A — loading preso sem via de escape. analyzeCurrentConversation()
// nunca pode deixar conversationAnalysisLoading travado em `true` quando não
// existe request ativo (promise perdida/nunca resolvida, resposta antiga
// descartada, ou troca de conversa). Watchdog: ANALYSIS_REQUEST_WATCHDOG_MS
// em content-script.js — o override
// window.__yolenCompanionAnalysisWatchdogMsForTests existe só para permitir
// testar o watchdog real (mesmo setTimeout, mesma lógica de ownership via
// isAnalysisResponseStillCurrent) sem esperar 60s reais por teste; em
// produção esse override nunca é definido.
// ---------------------------------------------------------------------------

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

async function clickAnalyzeAndWaitForRequest({ document, calls, cycleId }) {
  await waitFor(() => Boolean(getAnalyzeButton(document)))

  const before = analysisCalls(calls).filter(
    (call) => call.payload?.cycle_id === cycleId,
  ).length

  getAnalyzeButton(document).dispatchEvent(
    new document.defaultView.Event('click', { bubbles: true }),
  )

  await waitFor(
    () =>
      analysisCalls(calls).filter(
        (call) => call.payload?.cycle_id === cycleId,
      ).length > before,
  )
}

function setWatchdogOverride(document, ms) {
  document.defaultView.__yolenCompanionAnalysisWatchdogMsForTests = ms
}

function analysisResultOk({ summary = 'RESUMO OK' } = {}) {
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

test('promise nunca resolve — watchdog tira a UI de loading', async () => {
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
    // Nunca resolve — simula exatamente a promise perdida observada no
    // Firefox (loading preso sem nenhum request novo em voo).
    analysisResult: () => new Promise(() => {}),
  })

  await waitFor(
    () => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0,
  )

  setWatchdogOverride(document, 250)

  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })

  // Durante o loading, o painel não pode ficar sem controle nenhum.
  assert.ok(
    getAnalyzeButton(document),
    'deveria existir um botão de retry visível durante o loading',
  )

  await waitFor(
    () =>
      getAnalysisErrorText(document)?.includes(
        'demorou mais que o esperado',
      ),
    { timeoutMs: 4000 },
  )

  // Depois do watchdog, o painel volta a ter o botão normal de análise.
  assert.ok(
    getAnalyzeButton(document),
    'watchdog deveria deixar o botão de tentar novamente disponível',
  )
})

test('resposta antiga chega depois que uma análise mais nova começou — não sobrescreve', async () => {
  let releaseOld
  const oldGate = new Promise((resolve) => {
    releaseOld = resolve
  })

  let callCount = 0

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
      callCount += 1

      if (callCount === 1) {
        await oldGate
        return analysisResultOk({ summary: 'RESUMO ANTIGO NÃO PODE APARECER' })
      }

      return analysisResultOk({ summary: 'RESUMO NOVO' })
    },
  })

  await waitFor(
    () => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0,
  )

  // Primeira tentativa: fica presa aguardando oldGate.
  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })

  // Segunda tentativa (retry durante loading) já invalida a primeira via
  // requestSequence e resolve imediatamente com o resumo novo.
  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })

  await waitFor(
    () => getPanel(document)?.textContent?.includes('RESUMO NOVO'),
  )

  // Só depois a resposta antiga finalmente chega.
  releaseOld()
  await new Promise((resolve) => setTimeout(resolve, 300))

  const panelText = getPanel(document)?.textContent ?? ''
  assert.match(panelText, /RESUMO NOVO/)
  assert.doesNotMatch(panelText, /RESUMO ANTIGO NÃO PODE APARECER/)
})

test('resposta antiga é descartada — não deixa loading preso', async () => {
  let releaseOld
  const oldGate = new Promise((resolve) => {
    releaseOld = resolve
  })

  let callCount = 0

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
      callCount += 1

      if (callCount === 1) {
        await oldGate
        // A resposta antiga chega como erro — não pode nem sobrescrever o
        // sucesso da tentativa nova, nem deixar algo preso.
        return { ok: false, error: 'FALHA ANTIGA NÃO PODE APARECER' }
      }

      return analysisResultOk({ summary: 'RESUMO NOVO OK' })
    },
  })

  await waitFor(
    () => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0,
  )

  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })
  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })

  await waitFor(
    () => getPanel(document)?.textContent?.includes('RESUMO NOVO OK'),
  )

  releaseOld()
  await new Promise((resolve) => setTimeout(resolve, 300))

  // A tentativa nova já tinha terminado (loading false); a antiga, ao ser
  // descartada, não pode reabrir loading nem aplicar o erro dela.
  assert.equal(getAnalysisErrorText(document), null)
  assert.doesNotMatch(
    getPanel(document)?.textContent ?? '',
    /FALHA ANTIGA NÃO PODE APARECER/,
  )
  assert.ok(getAnalyzeButton(document))
})

test('nova análise completa normalmente — loading false e resultado aplicado', async () => {
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
    analysisResult: analysisResultOk({ summary: 'RESUMO FELIZ' }),
  })

  await waitFor(
    () => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0,
  )

  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })

  await waitFor(
    () => getPanel(document)?.textContent?.includes('RESUMO FELIZ'),
  )

  assert.equal(getAnalysisErrorText(document), null)
  assert.ok(getAnalyzeButton(document))
})

test('request falha — loading false e retry disponível', async () => {
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
    analysisResult: { ok: false, error: 'Falha simulada do provedor.' },
  })

  await waitFor(
    () => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0,
  )

  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })

  await waitFor(
    () => getAnalysisErrorText(document) !== null,
  )

  assert.match(
    getAnalysisErrorText(document) ?? '',
    /Falha simulada do provedor\./,
  )
  assert.ok(
    getAnalyzeButton(document),
    'retry deveria estar disponível depois de uma falha',
  )
})

test('durante loading existe controle visível de recuperação — painel nunca fica morto', async () => {
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
    analysisResult: () => new Promise(() => {}),
  })

  await waitFor(
    () => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0,
  )

  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })

  const button = getAnalyzeButton(document)

  assert.ok(button, 'painel não pode ficar sem nenhuma ação durante loading')
  assert.match(button.textContent ?? '', /Tentar novamente/)

  const panelText = getPanel(document)?.textContent ?? ''
  assert.match(panelText, /Analisando/)
})

test('A→B durante análise — loading de A não aparece em B e resposta tardia de A não altera B', async () => {
  let releaseA
  const gateA = new Promise((resolve) => {
    releaseA = resolve
  })

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
    analysisResult: async (requestPayload) => {
      if (requestPayload.cycle_id === CYCLE_A) {
        await gateA
        return analysisResultOk({ summary: 'RESUMO DE A NÃO PODE APARECER EM B' })
      }

      return analysisResultOk({ summary: 'RESUMO DE B' })
    },
  })

  await waitFor(
    () => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0,
  )
  const resolveLeadCountAfterA = resolveLeadCalls(calls).length

  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_A })

  // Troca para B enquanto a análise de A ainda está presa em gateA.
  switchConversationDom(document, {
    headerTitle: CONVERSATION_B_TITLE,
    messageId: 'msg-b1',
    prePlainText: '[11:00, 21/08/2026] Cliente B: ',
    text: 'Bom dia, preciso de ajuda para agendar uma visita.',
  })

  await waitFor(
    () => resolveLeadCalls(calls).length > resolveLeadCountAfterA,
  )

  // B não pode nascer preso em loading nem mostrar nada de A.
  assert.equal(getAnalysisErrorText(document), null)
  assert.doesNotMatch(
    getPanel(document)?.textContent ?? '',
    /RESUMO DE A NÃO PODE APARECER EM B/,
  )

  await clickAnalyzeAndWaitForRequest({ document, calls, cycleId: CYCLE_B })

  await waitFor(
    () => getPanel(document)?.textContent?.includes('RESUMO DE B'),
  )

  // A resposta tardia de A finalmente chega — não pode alterar o painel de B.
  releaseA()
  await new Promise((resolve) => setTimeout(resolve, 300))

  const panelText = getPanel(document)?.textContent ?? ''
  assert.match(panelText, /RESUMO DE B/)
  assert.doesNotMatch(panelText, /RESUMO DE A NÃO PODE APARECER EM B/)
})
