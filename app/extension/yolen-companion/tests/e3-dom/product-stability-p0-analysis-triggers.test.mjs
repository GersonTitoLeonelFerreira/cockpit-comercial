// Pacote de estabilização P0 — FNC-04: AGORA e ANÁLISE só mudam por
// evento comercial real.
//
// Política canônica (nos dois canais, mesmo Core):
// PODE invalidar/recalcular: mensagem nova confirmada (cliente/vendedor),
//   transcrição concluída, clique explícito em analisar, troca real de
//   conversa.
// NÃO PODE: rerender, resize, minimizar/expandir, troca visual de aba,
//   foco em campo/botão, remontagem do mesmo contexto, polling sem dado
//   novo, mutação do DOM do canal que não é mensagem.
// E, havendo informação comercial válida, uma atualização legítima em
// segundo plano a mantém visível (com indicação discreta), nunca
// "resultado válido → tela vazia/spinner → novo resultado".

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PARITY_CONVERSATIONS,
  PARITY_PHONE,
  panelOf,
  panelText,
  sleep,
  startParityChannel,
  startParityConversations,
  switchParityConversation,
  waitForBoth,
  waitForQuiet,
} from '../e3-test-support/cross-channel-parity.mjs'
import {
  defaultAgoraDecisionState,
  defaultClientContext,
  defaultLeadResolution,
} from '../e3-test-support/load-content-script.mjs'
import {
  appendIncomingMessage,
  callCounts,
  countCalls,
  installControlledPolling,
  mutateHostWithoutMessage,
  pinAutomaticAnalysisDelay,
  realClick,
  runPolling,
  settleStabilityQueues,
} from '../e3-test-support/product-stability.mjs'

const CHANNELS = ['whatsapp', 'manychat']
const NEVER_MS = 2 ** 31 - 1
const AGORA_HEADLINE = 'Responder a objeção de preço antes de seguir'
const ANALYSIS_HEADLINE = 'Leitura válida da condução comercial.'
const SUMMARY_TEXT = 'Cliente pediu a proposta do plano anual.'

const AGORA_READY = defaultAgoraDecisionState({
  silent: false,
  silent_reason: null,
  primary: {
    kind: 'respond_objection',
    priority: 'high',
    headline: AGORA_HEADLINE,
    explanation: 'O cliente questionou o valor do plano anual.',
    reason: 'objection_open',
    evidence_message_ids: ['m1'],
    cta: { kind: 'open_message', label: 'Preparar resposta' },
  },
  secondary: [],
})

const ANALYSIS_VIEW_MODEL_READY = {
  ok: true,
  data: {
    available: true,
    neutral: true,
    neutral_headline: ANALYSIS_HEADLINE,
    neutral_description: 'Cliente avaliando o plano anual.',
  },
}

function ownedResolution() {
  return defaultLeadResolution({
    status: 'OWNED_BY_ME',
    phone: PARITY_PHONE,
    lead: { id: 'lead-p0', name: 'Lead Estável', phone: PARITY_PHONE, email: null, cpf_cnpj: null, deleted_at: null },
    cycle: { id: 'cycle-p0', status: 'contato', owner_user_id: 'user-1' },
  })
}

function summaryResult(textForCall = () => SUMMARY_TEXT) {
  return async (count, request) => {
    const text = await textForCall(count)
    return {
      ok: true,
      data: {
        identity: { company_id: 'company-1', lead_id: 'lead-p0', cycle_id: request?.cycle_id, conversation_key: request?.conversation_key },
        summary: { summary: text, version: 1, updated_at: '2026-09-20T12:00:00.000Z' },
        working_summary: text,
      },
    }
  }
}

function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function start(channel, { backend = {}, automaticAnalysisMs = NEVER_MS, ...extra } = {}) {
  return startParityChannel(
    channel,
    {
      resolution: ownedResolution(),
      messages: [{ mid: 'm1', text: 'Quanto custa o plano anual com implantação?' }],
      backend: {
        decisionStateResult: AGORA_READY,
        clientContextResult: defaultClientContext(),
        leadSummaryResult: summaryResult(),
        analysisViewModelResult: ANALYSIS_VIEW_MODEL_READY,
        ...backend,
      },
    },
    {
      beforeLoad: ({ dom }) => {
        pinAutomaticAnalysisDelay(dom, automaticAnalysisMs)
        installControlledPolling(dom)
      },
      ...extra,
    },
  )
}

const workspaceLoaded = (runtime) => runtime.calls.some((call) => call.action === 'LOAD_CUSTOMER_VIEW_MODEL')

async function ready(runtime) {
  await waitForBoth([runtime], workspaceLoaded)
  await waitForBoth([runtime], (candidate) => panelText(candidate).includes(AGORA_HEADLINE))
  await waitForQuiet([runtime])
}

// Análise automática elegível que falha (ex.: timeout do backend): depois
// dela, nenhum gatilho proibido pode reiniciá-la.
async function readyAfterFailedAnalysis(channel) {
  const runtime = start(channel, {
    automaticAnalysisMs: 50,
    backend: { analysisResult: { ok: false, error: 'Falha controlada do cenário.' } },
  })
  await waitForBoth([runtime], workspaceLoaded)
  await waitForBoth([runtime], (candidate) => countCalls(candidate, 'ANALYZE_CONVERSATION') >= 1)
  await waitForBoth([runtime], (candidate) => Boolean(panelOf(candidate).querySelector('[data-yolen-analysis-error]')))
  await waitForQuiet([runtime], 1200)
  return runtime
}

function agoraArea(runtime) {
  return panelOf(runtime).querySelector('[data-yolen-seller-panel="now"]')
}

function analysisArea(runtime) {
  return panelOf(runtime).querySelector('[data-yolen-seller-panel="analysis"]')
}

for (const channel of CHANNELS) {
  test(`FNC-04 (${channel}): trocar de aba, focar campo/botão e minimizar/expandir não reexecutam sessão, resolução nem análise`, async () => {
    const runtime = await readyAfterFailedAnalysis(channel)
    const before = callCounts(runtime)

    for (const area of ['analysis', 'client', 'message', 'now']) {
      realClick(runtime, panelOf(runtime).querySelector(`[data-yolen-seller-area="${area}"]`))
      await settleStabilityQueues(runtime)
    }
    realClick(runtime, panelOf(runtime).querySelector('[data-yolen-action="collapse-companion"]'))
    await settleStabilityQueues(runtime)
    realClick(runtime, panelOf(runtime).querySelector('[data-yolen-action="expand-companion"]'))
    await settleStabilityQueues(runtime)

    // Foco em campo da própria página do canal (ex.: o vendedor clica no
    // campo de mensagem do WhatsApp/ManyChat) — não é retomada da janela.
    const hostField = runtime.document.querySelector(
      runtime.channel === 'whatsapp' ? '#main footer [contenteditable="true"]' : 'main footer textarea',
    )
    realClick(runtime, hostField)

    // Recuperação de runtime (350 ms) + debounce + atraso da análise.
    await sleep(1500)
    await waitForQuiet([runtime])
    assert.deepEqual(callCounts(runtime), before, 'nenhum gatilho visual pode chamar backend nem reiniciar a análise')
  })

  test(`FNC-04 (${channel}): mutação do DOM do canal sem mensagem nova (presença, relayout, resize) não reinicia a análise`, async () => {
    const runtime = await readyAfterFailedAnalysis(channel)
    const analyzeBefore = countCalls(runtime, 'ANALYZE_CONVERSATION')

    mutateHostWithoutMessage(runtime, 'online')
    await sleep(700)
    mutateHostWithoutMessage(runtime, 'digitando…')
    runtime.window.dispatchEvent(new runtime.window.Event('resize'))
    await sleep(700)
    mutateHostWithoutMessage(runtime, 'visto por último hoje')
    await sleep(1200)
    await waitForQuiet([runtime])

    assert.equal(countCalls(runtime, 'ANALYZE_CONVERSATION'), analyzeBefore, 'sem mensagem nova, a análise não recomeça')
    assert.ok(panelOf(runtime).querySelector('[data-yolen-analysis-error]'), 'o estado terminal continua o mesmo, com retry explícito')
  })

  test(`FNC-04 (${channel}): retomada real da janela sem mensagem nova não reinicia a análise`, async () => {
    const runtime = await readyAfterFailedAnalysis(channel)
    const analyzeBefore = countCalls(runtime, 'ANALYZE_CONVERSATION')

    runtime.window.dispatchEvent(new runtime.window.Event('blur'))
    runtime.window.dispatchEvent(new runtime.window.Event('focus'))
    runtime.document.dispatchEvent(new runtime.window.Event('visibilitychange'))
    await sleep(1500)
    await waitForQuiet([runtime])

    assert.equal(countCalls(runtime, 'ANALYZE_CONVERSATION'), analyzeBefore)
  })

  test(`FNC-04 (${channel}): evento comercial legítimo recalcula — mensagem nova do cliente e clique explícito`, async () => {
    const runtime = await readyAfterFailedAnalysis(channel)
    const analyzeBefore = countCalls(runtime, 'ANALYZE_CONVERSATION')

    appendIncomingMessage(runtime, { mid: 'm2', text: 'E se eu fechar hoje, tem desconto?' })
    await waitForBoth([runtime], (candidate) => countCalls(candidate, 'ANALYZE_CONVERSATION') === analyzeBefore + 1)
    await waitForBoth([runtime], (candidate) => Boolean(panelOf(candidate).querySelector('[data-yolen-analysis-error]')))
    await waitForQuiet([runtime], 1200)

    realClick(runtime, panelOf(runtime).querySelector('[data-yolen-seller-area="analysis"]'))
    await settleStabilityQueues(runtime)
    realClick(runtime, analysisArea(runtime).querySelector('[data-yolen-action="analyze-conversation"]'))
    await waitForBoth([runtime], (candidate) => countCalls(candidate, 'ANALYZE_CONVERSATION') === analyzeBefore + 2)
  })

  test(`FNC-04 (${channel}): polling sem dado novo não reanalisa e não apaga AGORA nem ANÁLISE`, async () => {
    const runtime = start(channel)
    await ready(runtime)
    const analysisBefore = analysisArea(runtime).innerHTML
    const analyzeBefore = countCalls(runtime, 'ANALYZE_CONVERSATION')

    for (let round = 0; round < 3; round += 1) {
      assert.ok(runPolling(runtime) > 0, 'pré-condição: polling do Core capturado')
      assert.ok(agoraArea(runtime).textContent.includes(AGORA_HEADLINE), `rodada ${round}: AGORA visível durante o polling`)
      assert.ok(analysisArea(runtime).textContent.includes(ANALYSIS_HEADLINE), `rodada ${round}: ANÁLISE visível durante o polling`)
      await waitForQuiet([runtime])
    }

    assert.equal(countCalls(runtime, 'ANALYZE_CONVERSATION'), analyzeBefore)
    assert.ok(agoraArea(runtime).textContent.includes(AGORA_HEADLINE))
    assert.equal(analysisArea(runtime).innerHTML, analysisBefore, 'mesmo dado → mesma ANÁLISE')
  })

  test(`FNC-04 (${channel}): recarga do resumo em segundo plano (mensagem nova) mantém o resumo válido do AGORA visível`, async () => {
    const reload = deferred()
    const runtime = start(channel, {
      backend: {
        leadSummaryResult: summaryResult(async (count) => {
          if (count > 1) await reload.promise
          return SUMMARY_TEXT
        }),
      },
    })
    await ready(runtime)
    await waitForBoth([runtime], (candidate) => agoraArea(candidate).textContent.includes(SUMMARY_TEXT))
    const summaryCallsBefore = countCalls(runtime, 'LOAD_LEAD_SUMMARY')

    appendIncomingMessage(runtime, { mid: 'm2', text: 'Pode me mandar a proposta ainda hoje?' })
    await waitForBoth([runtime], (candidate) => countCalls(candidate, 'LOAD_LEAD_SUMMARY') > summaryCallsBefore)
    await settleStabilityQueues(runtime)

    assert.ok(agoraArea(runtime).textContent.includes(SUMMARY_TEXT), 'o resumo válido continua no AGORA enquanto recarrega')
    assert.ok(panelOf(runtime).querySelector('[data-yolen-seller-message-mount]'), 'a MENSAGEM continua montada enquanto o resumo recarrega')

    reload.resolve()
    await waitForQuiet([runtime])
    assert.ok(agoraArea(runtime).textContent.includes(SUMMARY_TEXT))
  })

  test(`FNC-04 (${channel}): reanálise legítima mantém AGORA e ANÁLISE válidos visíveis, com indicação discreta de atualização`, async () => {
    const never = new Promise(() => {})
    const runtime = start(channel, { backend: { analysisResult: () => never } })
    await ready(runtime)
    realClick(runtime, panelOf(runtime).querySelector('[data-yolen-seller-area="analysis"]'))
    await settleStabilityQueues(runtime)
    await waitForBoth([runtime], (candidate) => analysisArea(candidate).textContent.includes(ANALYSIS_HEADLINE))
    const analyzeBefore = countCalls(runtime, 'ANALYZE_CONVERSATION')

    // Gatilho permitido: mensagem nova do cliente (análise automática).
    pinAutomaticAnalysisDelay(runtime.dom, 50)
    appendIncomingMessage(runtime, { mid: 'm2', text: 'Consegue parcelar em doze vezes?' })
    await waitForBoth([runtime], (candidate) => countCalls(candidate, 'ANALYZE_CONVERSATION') === analyzeBefore + 1)
    await settleStabilityQueues(runtime)

    assert.ok(agoraArea(runtime).textContent.includes(AGORA_HEADLINE), 'AGORA válido continua visível durante a reanálise')
    assert.ok(agoraArea(runtime).querySelector('[data-yolen-agora-updating]'), 'indicação discreta de atualização no AGORA (a decisão exibida não é apresentada como resultado da tentativa nova)')
    assert.ok(analysisArea(runtime).textContent.includes(ANALYSIS_HEADLINE), 'ANÁLISE válida continua visível durante a reanálise')
    assert.ok(analysisArea(runtime).querySelector('[data-yolen-analysis-loading]'), 'indicação discreta de atualização na ANÁLISE')
  })
}

// Troca real de conversa continua sendo gatilho permitido: A (análise
// falhou) → B (sem evidência de contato, nenhuma análise) → A: a conversa
// reaberta é analisada automaticamente uma vez, mesmo quando o conteúdo é
// idêntico ao da tentativa anterior de A.
for (const channel of CHANNELS) {
  test(`FNC-04 (${channel}): A → B → A — troca real de conversa continua podendo analisar A de novo`, async () => {
    const phoneA = PARITY_CONVERSATIONS.A.phone
    const resolutionA = defaultLeadResolution({
      status: 'OWNED_BY_ME',
      phone: phoneA,
      lead: { id: 'lead-cycle-conv-a', name: 'Lead Alfa', phone: phoneA, email: null, cpf_cnpj: null, deleted_at: null },
      cycle: { id: 'cycle-conv-a', status: 'contato', owner_user_id: 'user-1' },
    })
    const runtime = startParityConversations(
      channel,
      {
        A: { resolution: resolutionA, messages: [{ mid: 'm1', text: 'Quanto custa o plano anual com implantação?' }] },
        B: { evidence: 'none', messages: [{ mid: 'm1', text: 'Mensagem de uma conversa sem contato identificado.' }] },
      },
      {
        decisionStateResult: defaultAgoraDecisionState(),
        clientContextResult: defaultClientContext(),
        leadSummaryResult: summaryResult(),
        analysisResult: { ok: false, error: 'Falha controlada do cenário.' },
        beforeLoad: ({ dom }) => pinAutomaticAnalysisDelay(dom, 50),
      },
    )
    const analyzeForA = (candidate) =>
      candidate.calls.filter((call) => call.action === 'ANALYZE_CONVERSATION' && call.payload?.cycle_id === 'cycle-conv-a').length

    await waitForBoth([runtime], (candidate) => analyzeForA(candidate) === 1)
    await waitForQuiet([runtime], 1200)

    // Duas idas e voltas: a partir da segunda volta, A reabre com
    // exatamente o mesmo conteúdo que a tentativa anterior de A analisou.
    for (const expectedAnalyses of [2, 3]) {
      switchParityConversation(runtime, 'B')
      await waitForBoth([runtime], (candidate) => !panelText(candidate).includes('Lead Alfa'))
      await waitForQuiet([runtime], 1200)
      assert.equal(analyzeForA(runtime), expectedAnalyses - 1, 'B não analisa A')

      switchParityConversation(runtime, 'A')
      await waitForBoth([runtime], (candidate) => analyzeForA(candidate) === expectedAnalyses)
      await waitForQuiet([runtime], 1200)
    }
  })
}
