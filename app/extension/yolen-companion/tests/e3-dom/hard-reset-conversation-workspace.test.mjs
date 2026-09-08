// MUDANÇA DE DIREÇÃO — HARD CONTEXT BOUNDARY.
//
// Regra de produto (autoridade): ao trocar de conversa no WhatsApp,
// TODO o contexto comercial visível da conversa anterior precisa ser
// invalidado IMEDIATAMENTE — antes de classificar a nova conversa e
// antes de reconstruir o Companion. É aceitável mostrar loading/vazio
// durante a reconstrução; é INACEITÁVEL mostrar dados da conversa
// anterior, mesmo que só durante o carregamento da nova.
//
// hardResetConversationWorkspace() é a fronteira única entre conversas
// (substituiu clearLeadStateForNewConversation()): além de zerar todo o
// estado comercial (lead, resumo, análise, cliente, mensagem seller) e
// os mecanismos de estabilidade (region-action-lock, panelRegionPendingHtml,
// cache de HTML por região), ela força um renderPanel() imediato que
// IGNORA isRegionInteractionActive() (lock OU foco em campo editável) —
// nenhuma proteção de estabilidade pode impedir o reset numa troca real
// de conversationKey. Preservação de foco/scroll/lock/pending/drafts só
// vale DENTRO da mesma conversationKey.

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
const CYCLE_B = 'cycle-conversation-b'
const CYCLE_C = 'cycle-conversation-c'
const SUMMARY_A = 'Cliente A perguntou sobre o preço do plano.'
const SUMMARY_B = 'Cliente B pediu desconto no plano anual.'
const SUMMARY_C = 'Cliente C pediu para remarcar a demonstração.'
const MARKER_A = 'MENSAGEM_EXCLUSIVA_DA_CONVERSA_A_NAO_PODE_APARECER_DEPOIS'
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

function panelText(document) {
  return document.getElementById('yolen-companion-panel')?.textContent || ''
}

function isAnyRegionLocked(document) {
  return Boolean(document.querySelector('[data-yolen-region-action-lock="true"]'))
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
    withStabilityRuntimes: true,
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
  await waitFor(() => Boolean(document.querySelector('[data-yolen-seller-message-action="copy"]')))

  return { document, calls, window }
}

test('1) A com intent/mensagem/botões -> GRUPO: nenhum texto de A no Companion', async () => {
  const { document } = await setupAActiveWithMessage()

  switchToGroup(document, 'Grupo da Equipe')
  await sleep(700)

  assert.equal(hasMount(document), false)
  assert.equal(hasBox(document), false)
  assert.doesNotMatch(panelText(document), new RegExp(MARKER_A))
  assert.doesNotMatch(panelText(document), /Quero responder sobre o preço/)
})

test('2) A -> SELF: nenhum texto de A', async () => {
  const { document } = await setupAActiveWithMessage()

  switchToSelf(document)
  await sleep(700)

  assert.equal(hasMount(document), false)
  assert.equal(hasBox(document), false)
  assert.doesNotMatch(panelText(document), new RegExp(MARKER_A))
})

test('3) A -> B SOFT_DELETED: nenhum texto de A enquanto B resolve, e nenhum depois', async () => {
  let releaseB
  const bPending = new Promise((resolve) => {
    releaseB = resolve
  })

  const { document, calls } = await setupAActiveWithMessage({
    resolutionsByPhone: {
      [PHONE_B]: async () => {
        await bPending
        return defaultLeadResolution({
          phone: PHONE_B,
          status: 'SOFT_DELETED',
          lead: { id: 'lead-b', name: 'Cliente B Arquivado', phone: PHONE_B, email: null, cpf_cnpj: null, deleted_at: '2026-01-01T00:00:00.000Z' },
          cycle: null,
        })
      },
    },
  })

  switchTo(document, TITLE_B)
  await sleep(700)

  // Enquanto B ainda resolve (a Promise segue presa), o hard reset já
  // precisa ter apagado tudo de A.
  assert.equal(hasMount(document), false, 'nenhum mount seller pode sobreviver enquanto B ainda resolve')
  assert.doesNotMatch(panelText(document), new RegExp(MARKER_A), 'nenhum texto de A enquanto B resolve')

  releaseB()
  await waitFor(() => resolveLeadCalls(calls).some((call) => call.payload.phone === PHONE_B))
  await sleep(30)

  assert.equal(hasMount(document), false, 'B é SOFT_DELETED — continua sem mount')
  assert.doesNotMatch(panelText(document), new RegExp(MARKER_A), 'nenhum texto de A depois que B termina de resolver')
})

test('4) A -> B ativo: nenhum conteúdo de A antes da resposta de B; só B depois', async () => {
  let releaseSummaryB
  const summaryBPending = new Promise((resolve) => {
    releaseSummaryB = resolve
  })

  const { document, calls } = await setupAActiveWithMessage({
    resolutionsByPhone: {
      [PHONE_B]: defaultLeadResolution({ phone: PHONE_B, cycle: { id: CYCLE_B, status: 'contato', owner_user_id: 'user-1' } }),
    },
    leadSummaryResult: async (_count, payload) => {
      if (payload?.cycle_id === CYCLE_B) {
        await summaryBPending
        return summaryPayload(CYCLE_B, `whatsapp:${PHONE_B}`, SUMMARY_B)
      }
      return summaryPayload(CYCLE_A, `whatsapp:${PHONE_A}`, SUMMARY_A)
    },
  })

  switchTo(document, TITLE_B)
  await sleep(700)

  // B ainda não tem resumo pronto (Promise presa) — nenhum conteúdo de A
  // pode ter sobrevivido ao reset, mesmo em loading.
  assert.equal(hasMount(document), false, 'sem summary pronto de B ainda não há mount — mas também não pode haver o de A')
  assert.doesNotMatch(panelText(document), new RegExp(MARKER_A))
  assert.doesNotMatch(panelText(document), /Cliente A perguntou/)

  releaseSummaryB()
  await waitFor(() => leadSummaryCalls(calls).some((call) => call.payload?.cycle_id === CYCLE_B))
  await sleep(50)

  switchToTab(document, 'now')
  await waitFor(() => document.querySelector('.yolen-lead-summary-card')?.textContent.includes(SUMMARY_B))
  assert.doesNotMatch(panelText(document), new RegExp(MARKER_A))
})

test('5) A -> B -> C rápido: nenhum frame observável mostra A; final mostra somente C', async () => {
  const { document, calls } = await setupAActiveWithMessage({
    resolutionsByPhone: {
      [PHONE_B]: defaultLeadResolution({ phone: PHONE_B, cycle: { id: CYCLE_B, status: 'contato', owner_user_id: 'user-1' } }),
      [PHONE_C]: defaultLeadResolution({ phone: PHONE_C, cycle: { id: CYCLE_C, status: 'contato', owner_user_id: 'user-1' } }),
    },
    leadSummaryResult: (_count, payload) => {
      if (payload?.cycle_id === CYCLE_B) return summaryPayload(CYCLE_B, `whatsapp:${PHONE_B}`, SUMMARY_B)
      if (payload?.cycle_id === CYCLE_C) return summaryPayload(CYCLE_C, `whatsapp:${PHONE_C}`, SUMMARY_C)
      return summaryPayload(CYCLE_A, `whatsapp:${PHONE_A}`, SUMMARY_A)
    },
  })

  // Troca rápida: sai de A para B, espera só o debounce do observer (não
  // a resolução/resumo de B, que fica pra trás), e já sai de B para C
  // antes de B ter tido qualquer chance de assentar de verdade.
  switchTo(document, TITLE_B)
  await sleep(700)
  assert.doesNotMatch(panelText(document), new RegExp(MARKER_A), 'nenhum frame pode mostrar A depois que a troca para B assentou')

  switchTo(document, TITLE_C)
  await sleep(700)
  assert.doesNotMatch(panelText(document), new RegExp(MARKER_A), 'nenhum frame pode mostrar A depois que a troca para C assentou')
  assert.doesNotMatch(panelText(document), /Cliente B pediu desconto/, 'B nunca chegou a resolver/resumir — não pode aparecer nem de relance')

  await waitFor(() => resolveLeadCalls(calls).some((call) => call.payload.phone === PHONE_C))
  await waitFor(() => leadSummaryCalls(calls).some((call) => call.payload?.cycle_id === CYCLE_C))
  await sleep(50)

  switchToTab(document, 'now')
  await waitFor(() => document.querySelector('.yolen-lead-summary-card')?.textContent.includes(SUMMARY_C))

  assert.doesNotMatch(panelText(document), new RegExp(MARKER_A))
  assert.doesNotMatch(panelText(document), /Cliente B pediu desconto/)
})

test('6) GRUPO -> contato C com telefone: C é resolvido do zero normalmente', async () => {
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
  assert.equal(hasMount(document), false)

  switchTo(document, TITLE_C)
  await waitFor(() => resolveLeadCalls(calls).some((call) => call.payload.phone === PHONE_C))
  await waitFor(() => leadSummaryCalls(calls).some((call) => call.payload?.cycle_id === CYCLE_C))
  await sleep(50)

  switchToTab(document, 'now')
  await waitFor(() => document.querySelector('.yolen-lead-summary-card')?.textContent.includes(SUMMARY_C))

  assert.doesNotMatch(panelText(document), new RegExp(MARKER_A))
})

test('7) troca com regionActionLock=true + textarea focado + pendingRegionHtml existente: hard reset acontece mesmo assim', async () => {
  // Cenário real (não seller-message, que já é destruído incondicionalmente
  // por SellerMessageRuntime.clear()): o formulário de criação de lead
  // (região contact-card) tem um input de verdade que sobrevive a esse
  // clear() — o alvo certo para provar que FOCO sozinho (sem lock nenhum)
  // já bastava para reter o DOM antigo antes desta correção.
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    resolutionsByPhone: {
      [PHONE_A]: defaultLeadResolution({ phone: PHONE_A, status: 'NOT_FOUND', lead: null, cycle: null }),
      [PHONE_B]: defaultLeadResolution({ phone: PHONE_B, status: 'NOT_FOUND', lead: null, cycle: null }),
    },
    withStabilityRuntimes: true,
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('[data-yolen-lead-create-form]')))

  // 1) Foco no input de nome do formulário de criação de lead de A,
  // digitando um rascunho — isRegionInteractionActive() por FOCO, sem
  // nenhum lock envolvido.
  const nameInput = document.querySelector('[name="yolen-lead-name"]')
  nameInput.focus()
  dispatch(nameInput, 'focusin')
  nameInput.value = 'Rascunho que não pode vazar para a próxima conversa'
  dispatch(nameInput, 'input')

  // 2) Trava a região (pointerdown sem click) no próprio botão de
  // submeter — igual ao diagnóstico real de region-action-lock.
  const submitButton = document.querySelector('.yolen-lead-create-submit')
  assert.ok(submitButton)
  dispatch(submitButton, 'pointerdown')
  assert.equal(isAnyRegionLocked(document), true, 'pointerdown precisa travar a região')

  // 3) Gera panelRegionPendingHtml de verdade: uma atualização em segundo
  // plano NA MESMA conversa (o refresh liga/desliga leadResolutionLoading,
  // mudando o HTML calculado) tenta re-renderizar a região travada —
  // protegida por lock E foco, o novo HTML fica retido.
  dispatch(document.querySelector('[data-yolen-action="refresh"]'), 'click')
  await waitFor(() => resolveLeadCalls(calls).length > 1)
  await sleep(30)

  assert.equal(isAnyRegionLocked(document), true, 'o lock continua ativo antes da troca de conversa')
  assert.equal(
    document.querySelector('.yolen-lead-create-submit'),
    submitButton,
    'o botão precisa ter continuado protegido (mesmo node) durante a atualização em segundo plano da MESMA conversa',
  )

  // Troca REAL de conversa com as três proteções ainda ativas.
  switchTo(document, TITLE_B)
  await sleep(700)

  assert.equal(isAnyRegionLocked(document), false, 'a troca real de conversa precisa descartar o lock mesmo com foco e pending html ativos')

  const nameInputAfter = document.querySelector('[name="yolen-lead-name"]')

  assert.notEqual(
    nameInputAfter,
    nameInput,
    'o formulário antigo (ainda focado) precisa ter sido substituído pelo hard reset, não retido pela proteção de foco',
  )
  assert.doesNotMatch(
    panelText(document),
    /Rascunho que não pode vazar/,
    'o rascunho digitado na conversa anterior não pode vazar para a nova conversa',
  )
})

test('8) dentro da MESMA conversa, preservação de foco/scroll continua funcionando (nenhuma regressão)', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    resolutionsByPhone: {
      [PHONE_A]: defaultLeadResolution({ phone: PHONE_A, status: 'NOT_FOUND', lead: null, cycle: null }),
    },
    withStabilityRuntimes: true,
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('[data-yolen-lead-create-form]')))

  const nameInput = document.querySelector('[name="yolen-lead-name"]')
  nameInput.focus()
  dispatch(nameInput, 'focusin')
  nameInput.value = 'Rascunho em andamento'
  dispatch(nameInput, 'input')

  // Atualização em segundo plano NA MESMA conversa (não é troca de
  // conversationKey) — hardResetConversationWorkspace() não pode disparar
  // aqui; o campo com foco precisa continuar sendo o MESMO node, com o
  // valor digitado intacto.
  dispatch(document.querySelector('[data-yolen-action="refresh"]'), 'click')
  await waitFor(() => resolveLeadCalls(calls).length > 1)
  await sleep(30)

  assert.equal(
    document.querySelector('[name="yolen-lead-name"]'),
    nameInput,
    'o input não pode ter sido substituído por uma atualização de fundo da MESMA conversa',
  )
  assert.equal(document.querySelector('[name="yolen-lead-name"]').value, 'Rascunho em andamento')
})
