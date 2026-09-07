// P0 — Stale seller message em contexto não elegível (PR #271).
//
// Regressão real de smoke (Firefox): LEAD A ativo/vinculado -> mensagem A
// pronta -> GRUPO -> LEAD B sem ciclo elegível (SOFT_DELETED/arquivado). O
// card superior atualiza corretamente nas duas trocas, mas a aba MENSAGEM
// retinha objetivo/intent/mensagem/botões de A.
//
// Causa raiz (dois defeitos estruturais, confirmados por leitura de
// código antes de qualquer correção):
//   A) loadCompanionLeadSummaryForCurrentCycle() nunca notificava
//      SellerMessageRuntime.clear() no branch sem cycle_id/conversationKey
//      (SOFT_DELETED, NOT_FOUND, LEAD_WITHOUT_CYCLE).
//   B) getSellerMessageAreaHtml() era 100% estático — o content-script não
//      tinha NENHUMA autoridade própria de elegibilidade; toda a defesa
//      dependia de seller-message-runtime.js lembrar de se limpar, sem
//      nenhuma defesa em profundidade.
//
// Correção: (1) o branch sem cycle_id passa a chamar
// SellerMessageRuntime.clear() explicitamente; (2) o mount
// [data-yolen-seller-message-mount] só existe no HTML quando
// isSellerMessageMountEligible() é verdadeiro — hasSellerMessageCommercialContext()
// decide se a conversa PODE ter um composer (conectado, não grupo/self,
// cycle+conversationKey de captura resolvidos); isSellerMessageMountEligible()
// exige, além disso, que o resumo já esteja 'ready' E pertença EXATAMENTE
// ao cycle/conversationKey atuais (getCaptureConversationKey(), não
// state.conversationKey). Isso é defesa em profundidade: mesmo que um
// futuro chamador esqueça de limpar o runtime, não há mount no DOM para
// um composer antigo reaparecer.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMessageHtml,
  defaultLeadResolution,
  leadSummaryCalls,
  loadContentScript,
  resolveLeadCalls,
  waitFor,
} from '../e3-test-support/load-content-script.mjs'

const TITLE_A = '+55 11 98888-7777'
const TITLE_B = '+55 21 97777-6666'
const TITLE_C = '+55 31 96666-5555'
const PHONE_A = '5511988887777'
const PHONE_B = '5521977776666'
const PHONE_C = '5531966665555'
const CYCLE_A = 'cycle-conversation-a'
const CYCLE_C = 'cycle-conversation-c'
const SUMMARY_A = 'Cliente A perguntou sobre o preço do plano.'
const SUMMARY_C = 'Cliente C pediu para remarcar a demonstração.'
const MARKER_A = 'MENSAGEM_EXCLUSIVA_DA_CONVERSA_A_NAO_PODE_APARECER_DEPOIS'
const MARKER_C = 'MENSAGEM_EXCLUSIVA_DA_CONVERSA_C'
const SELF_TITLE = 'Gerson Ferreira (você)'

function summaryPayload(cycleId, conversationKey, summary) {
  return {
    ok: true,
    data: {
      identity: { company_id: 'company-1', lead_id: 'lead-1', cycle_id: cycleId, conversation_key: conversationKey },
      summary: { summary, version: 1, updated_at: '2026-08-25T12:00:00.000Z' },
      working_summary: summary,
    },
  }
}

function initialPageHtml() {
  const messagesHtml = buildMessageHtml({
    id: 'msg-a1',
    prePlainText: '[10:15, 21/08/2026] Cliente A: ',
    text: 'Quanto custa o plano?',
  })

  return `<!doctype html><html><body>
    <div id="app">
      <div id="main">
        <header><span title="${TITLE_A}">${TITLE_A}</span></header>
        <div id="conversation-body">${messagesHtml}</div>
        <footer><div contenteditable="true" role="textbox"></div></footer>
      </div>
    </div>
  </body></html>`
}

function dispatch(target, type, init = {}) {
  const view = target.defaultView ?? target.ownerDocument?.defaultView
  const EventCtor =
    'key' in init ? (view?.KeyboardEvent ?? KeyboardEvent) : (target.Event ?? view?.Event ?? Event)
  target.dispatchEvent(new EventCtor(type, { bubbles: true, cancelable: true, ...init }))
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function switchToTab(document, area) {
  dispatch(document.querySelector(`[data-yolen-seller-area="${area}"]`), 'click')
}

function replaceHeader(document, innerHtml) {
  const header = document.querySelector('#main header')
  header.innerHTML = innerHtml
  dispatch(header, 'click')
}

function switchTo(document, title) {
  replaceHeader(document, `<span title="${title}">${title}</span>`)
}

function switchToGroup(document, title) {
  replaceHeader(document, `<div aria-label="Conversa em grupo"></div><span title="${title}">${title}</span>`)
}

function switchToSelf(document) {
  replaceHeader(document, `<span title="${SELF_TITLE}">${SELF_TITLE}</span>`)
}

function hasMount(document) {
  return Boolean(document.querySelector('[data-yolen-seller-message-mount]'))
}

function hasBox(document) {
  return Boolean(document.querySelector('[data-yolen-seller-message-box]'))
}

function messagePanelHtml(document) {
  return document.querySelector('[data-yolen-seller-panel="message"]')?.innerHTML || ''
}

async function setupAActiveWithMessage(overrides = {}) {
  const { document, calls, window } = loadContentScript({
    initialHtml: initialPageHtml(),
    resolutionsByPhone: {
      [PHONE_A]: defaultLeadResolution({ phone: PHONE_A, cycle: { id: CYCLE_A, status: 'contato', owner_user_id: 'user-1' } }),
      ...overrides.resolutionsByPhone,
    },
    leadSummaryResult: overrides.leadSummaryResult ?? summaryPayload(CYCLE_A, `whatsapp:${PHONE_A}`, SUMMARY_A),
    messageGenerationResult: overrides.messageGenerationResult ?? { status: 'ready', message: MARKER_A, error: null },
    withSellerMessageRuntime: true,
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => leadSummaryCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('[data-yolen-seller-area="message"]')))

  switchToTab(document, 'message')
  await waitFor(() => Boolean(document.querySelector('[data-yolen-seller-message-intent]')))

  const intentField = document.querySelector('[data-yolen-seller-message-intent]')
  intentField.value = 'Quero responder sobre o preço.'
  dispatch(intentField, 'input')
  dispatch(document.querySelector('[data-yolen-seller-message-action="generate"]'), 'click')

  await waitFor(() => document.querySelector('.yolen-message-result-text')?.textContent === MARKER_A)

  return { document, calls, window }
}

test('A) lead A ativo + summary ready + mensagem A -> grupo: mount, box e mensagem A desaparecem', async () => {
  const { document } = await setupAActiveWithMessage()

  switchToGroup(document, 'Grupo da Equipe')
  await sleep(700)

  switchToTab(document, 'message')
  await sleep(30)

  assert.equal(hasMount(document), false)
  assert.equal(hasBox(document), false)
  assert.doesNotMatch(messagePanelHtml(document), new RegExp(MARKER_A))
})

test(
  // Nome próximo ao pedido: "seller message from active lead never survives group -> soft-deleted transition".
  'B) [regressão do smoke real] mensagem de lead ativo nunca sobrevive à transição grupo -> lead SOFT_DELETED',
  async () => {
    const { document, calls } = await setupAActiveWithMessage({
      resolutionsByPhone: {
        [PHONE_B]: defaultLeadResolution({
          phone: PHONE_B,
          status: 'SOFT_DELETED',
          lead: { id: 'lead-b', name: 'Cliente B Arquivado', phone: PHONE_B, email: null, cpf_cnpj: null, deleted_at: '2026-01-01T00:00:00.000Z' },
          cycle: null,
          flags: { is_owned_by_me: false, is_pool: false, is_closed: true },
        }),
      },
    })

    switchToGroup(document, 'Grupo da Equipe')
    await sleep(700)

    switchTo(document, TITLE_B)
    await waitFor(() => resolveLeadCalls(calls).some((call) => call.payload.phone === PHONE_B))
    await sleep(700)

    switchToTab(document, 'message')
    await sleep(30)

    assert.equal(hasMount(document), false, 'nenhum mount seller')
    const panelHtml = messagePanelHtml(document)
    assert.doesNotMatch(panelHtml, new RegExp(MARKER_A), 'nenhuma mensagem de A')
    assert.doesNotMatch(panelHtml, /Quero responder sobre o preço\./, 'nenhuma intenção de A')
    assert.equal(document.querySelector('[data-yolen-seller-message-action="insert"]'), null)
    assert.equal(document.querySelector('[data-yolen-seller-message-action="copy"]'), null)
  },
)

test('C) lead A ativo -> B LEAD_WITHOUT_CYCLE: nenhum mount seller, nenhuma mensagem A', async () => {
  const { document, calls } = await setupAActiveWithMessage({
    resolutionsByPhone: {
      [PHONE_B]: defaultLeadResolution({
        phone: PHONE_B,
        status: 'LEAD_WITHOUT_CYCLE',
        lead: { id: 'lead-b', name: 'Cliente B Sem Ciclo', phone: PHONE_B, email: null, cpf_cnpj: null, deleted_at: null },
        cycle: null,
      }),
    },
  })

  switchTo(document, TITLE_B)
  await waitFor(() => resolveLeadCalls(calls).some((call) => call.payload.phone === PHONE_B))
  await sleep(700)

  switchToTab(document, 'message')
  await sleep(30)

  assert.equal(hasMount(document), false)
  assert.doesNotMatch(messagePanelHtml(document), new RegExp(MARKER_A))
})

test('D) lead A ativo -> B NOT_FOUND: nenhum mount seller, nenhuma mensagem A', async () => {
  const { document, calls } = await setupAActiveWithMessage({
    resolutionsByPhone: {
      [PHONE_B]: defaultLeadResolution({ phone: PHONE_B, status: 'NOT_FOUND', lead: null, cycle: null }),
    },
  })

  switchTo(document, TITLE_B)
  await waitFor(() => resolveLeadCalls(calls).some((call) => call.payload.phone === PHONE_B))
  await sleep(700)

  switchToTab(document, 'message')
  await sleep(30)

  assert.equal(hasMount(document), false)
  assert.doesNotMatch(messagePanelHtml(document), new RegExp(MARKER_A))
})

test('E) lead A ativo -> self: nenhum mount seller, nenhuma mensagem A', async () => {
  const { document } = await setupAActiveWithMessage()

  switchToSelf(document)
  await sleep(700)

  switchToTab(document, 'message')
  await sleep(30)

  assert.equal(hasMount(document), false)
  assert.doesNotMatch(messagePanelHtml(document), new RegExp(MARKER_A))
})

test('F) grupo -> lead C ativo -> summary C ready: mount reaparece e sincroniza somente C', async () => {
  const { document, calls } = await setupAActiveWithMessage({
    resolutionsByPhone: {
      [PHONE_C]: defaultLeadResolution({ phone: PHONE_C, cycle: { id: CYCLE_C, status: 'contato', owner_user_id: 'user-1' } }),
    },
    leadSummaryResult: (_count, payload) =>
      payload?.cycle_id === CYCLE_C
        ? summaryPayload(CYCLE_C, `whatsapp:${PHONE_C}`, SUMMARY_C)
        : summaryPayload(CYCLE_A, `whatsapp:${PHONE_A}`, SUMMARY_A),
  })

  switchToGroup(document, 'Grupo da Equipe')
  await sleep(700)

  switchTo(document, TITLE_C)
  await waitFor(() => resolveLeadCalls(calls).some((call) => call.payload.phone === PHONE_C))
  await waitFor(() => leadSummaryCalls(calls).some((call) => call.payload?.cycle_id === CYCLE_C))
  await sleep(50)

  switchToTab(document, 'message')
  await waitFor(() => hasMount(document))

  assert.equal(hasMount(document), true)
  assert.doesNotMatch(messagePanelHtml(document), new RegExp(MARKER_A))
})

test('G) SOFT_DELETED -> lead C ativo -> summary C ready: mount reaparece, somente C aparece', async () => {
  const { document, calls } = await setupAActiveWithMessage({
    resolutionsByPhone: {
      [PHONE_B]: defaultLeadResolution({
        phone: PHONE_B,
        status: 'SOFT_DELETED',
        lead: { id: 'lead-b', name: 'Cliente B Arquivado', phone: PHONE_B, email: null, cpf_cnpj: null, deleted_at: '2026-01-01T00:00:00.000Z' },
        cycle: null,
      }),
      [PHONE_C]: defaultLeadResolution({ phone: PHONE_C, cycle: { id: CYCLE_C, status: 'contato', owner_user_id: 'user-1' } }),
    },
    leadSummaryResult: (_count, payload) =>
      payload?.cycle_id === CYCLE_C
        ? summaryPayload(CYCLE_C, `whatsapp:${PHONE_C}`, SUMMARY_C)
        : summaryPayload(CYCLE_A, `whatsapp:${PHONE_A}`, SUMMARY_A),
  })

  switchTo(document, TITLE_B)
  await waitFor(() => resolveLeadCalls(calls).some((call) => call.payload.phone === PHONE_B))
  await sleep(700)

  switchTo(document, TITLE_C)
  await waitFor(() => resolveLeadCalls(calls).some((call) => call.payload.phone === PHONE_C))
  await waitFor(() => leadSummaryCalls(calls).some((call) => call.payload?.cycle_id === CYCLE_C))
  await sleep(50)

  switchToTab(document, 'message')
  await waitFor(() => hasMount(document))

  assert.equal(hasMount(document), true)
  assert.doesNotMatch(messagePanelHtml(document), new RegExp(MARKER_A))
})

test('H) summary de contexto elegível está loading: mount some temporariamente, mas nenhum clear global apaga o intent legítimo da mesma conversa', async () => {
  let callCount = 0
  let resolveSecondSummary

  const { document } = await setupAActiveWithMessage({
    leadSummaryResult: () => {
      callCount += 1

      if (callCount === 1) {
        return summaryPayload(CYCLE_A, `whatsapp:${PHONE_A}`, SUMMARY_A)
      }

      return new Promise((resolve) => {
        resolveSecondSummary = () => resolve(summaryPayload(CYCLE_A, `whatsapp:${PHONE_A}`, SUMMARY_A))
      })
    },
  })

  // Um refresh manual da MESMA conversa reabre o carregamento do resumo
  // (companionLeadSummary.status volta a 'loading') sem que nada tenha
  // mudado de conversa/cycle.
  dispatch(document.querySelector('[data-yolen-action="refresh"]'), 'click')
  await waitFor(() => Boolean(resolveSecondSummary))
  await sleep(30)

  switchToTab(document, 'message')
  await sleep(30)
  assert.equal(hasMount(document), false, 'enquanto loading, o mount não aparece ainda')

  resolveSecondSummary()
  await sleep(50)

  switchToTab(document, 'message')
  await waitFor(() => hasMount(document))
  await waitFor(() => Boolean(document.querySelector('[data-yolen-seller-message-intent]')))

  assert.equal(
    document.querySelector('[data-yolen-seller-message-intent]').value,
    'Quero responder sobre o preço.',
    'o intent digitado antes do refresh sobrevive — a transição loading->ready da MESMA conversa não pode ter disparado um clear global',
  )
})

test('I) resposta tardia de summary de um cycle anterior nunca aparece depois que o cycle atual já mudou', async () => {
  let resolveSummaryForA

  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    resolutionsByPhone: {
      [PHONE_A]: defaultLeadResolution({ phone: PHONE_A, cycle: { id: CYCLE_A, status: 'contato', owner_user_id: 'user-1' } }),
      [PHONE_C]: defaultLeadResolution({ phone: PHONE_C, cycle: { id: CYCLE_C, status: 'contato', owner_user_id: 'user-1' } }),
    },
    leadSummaryResult: (_count, payload) => {
      if (payload?.cycle_id === CYCLE_A) {
        return new Promise((resolve) => {
          resolveSummaryForA = () => resolve(summaryPayload(CYCLE_A, `whatsapp:${PHONE_A}`, SUMMARY_A))
        })
      }

      return summaryPayload(CYCLE_C, `whatsapp:${PHONE_C}`, SUMMARY_C)
    },
    messageGenerationResult: { status: 'ready', message: MARKER_A, error: null },
    withSellerMessageRuntime: true,
  })

  await waitFor(() => resolveLeadCalls(calls).some((call) => call.payload.phone === PHONE_A))
  await waitFor(() => Boolean(resolveSummaryForA))

  // Troca para C ANTES da resposta atrasada do resumo de A chegar.
  switchTo(document, TITLE_C)
  await waitFor(() => resolveLeadCalls(calls).some((call) => call.payload.phone === PHONE_C))
  await waitFor(() => leadSummaryCalls(calls).some((call) => call.payload?.cycle_id === CYCLE_C))
  await sleep(50)

  // Só agora a resposta atrasada do resumo de A (cycle antigo) chega.
  resolveSummaryForA()
  await sleep(50)

  switchToTab(document, 'message')
  await sleep(30)

  assert.doesNotMatch(
    messagePanelHtml(document),
    new RegExp(SUMMARY_A),
    'o resumo de um cycle antigo não pode aparecer depois que o cycle atual já é outro (companionLeadSummaryCycleId não bate mais)',
  )
})

test('J) resposta tardia de summary é rejeitada quando a conversationKey de captura já não corresponde (mesmo cycle_id, conversa diferente)', async () => {
  let resolveSummaryForA

  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    resolutionsByPhone: {
      [PHONE_A]: defaultLeadResolution({ phone: PHONE_A, cycle: { id: CYCLE_A, status: 'contato', owner_user_id: 'user-1' } }),
      // Mesmo cycle_id de A (representa um cycle compartilhado/mesclado),
      // mas telefone/conversationKey de captura diferentes.
      [PHONE_C]: defaultLeadResolution({ phone: PHONE_C, cycle: { id: CYCLE_A, status: 'contato', owner_user_id: 'user-1' } }),
    },
    leadSummaryResult: (_count, payload) => {
      if (payload?.conversation_key?.includes(PHONE_A)) {
        return new Promise((resolve) => {
          resolveSummaryForA = () => resolve(summaryPayload(CYCLE_A, `whatsapp:${PHONE_A}`, SUMMARY_A))
        })
      }

      return summaryPayload(CYCLE_A, `whatsapp:${PHONE_C}`, SUMMARY_C)
    },
    messageGenerationResult: { status: 'ready', message: MARKER_A, error: null },
    withSellerMessageRuntime: true,
  })

  await waitFor(() => resolveLeadCalls(calls).some((call) => call.payload.phone === PHONE_A))
  await waitFor(() => Boolean(resolveSummaryForA))

  switchTo(document, TITLE_C)
  await waitFor(() => resolveLeadCalls(calls).some((call) => call.payload.phone === PHONE_C))
  await waitFor(() => leadSummaryCalls(calls).some((call) => call.payload?.conversation_key?.includes(PHONE_C)))
  await sleep(50)

  resolveSummaryForA()
  await sleep(50)

  switchToTab(document, 'message')
  await sleep(30)

  assert.doesNotMatch(
    messagePanelHtml(document),
    new RegExp(SUMMARY_A),
    'o resumo de uma conversationKey de captura antiga não pode aparecer mesmo com o mesmo cycle_id',
  )
})

test('self detection: título real do smoke ("Gerson Ferreira (você)") continua sendo reconhecido como auto-conversa', async () => {
  const { document } = await setupAActiveWithMessage()

  switchToSelf(document)
  await sleep(700)

  // Prova indireta, pela superfície pública: se isSelfConversationTitle()
  // não reconhecesse mais esse título, o mount/mensagem de A
  // continuariam visíveis (mesma prova do cenário E, título exato do
  // smoke real reportado).
  switchToTab(document, 'message')
  await sleep(30)

  assert.equal(hasMount(document), false)
  assert.doesNotMatch(messagePanelHtml(document), new RegExp(MARKER_A))
})
