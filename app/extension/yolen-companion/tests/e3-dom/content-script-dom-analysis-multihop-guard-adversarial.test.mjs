// Frente Paralela 3 (FASE 12A) — validação adversarial independente do
// sequence/context guard entregue pelo PR #208 (commit
// 8599d0a8c3b88917327556e789e2b32c9bca73dd).
//
// Cenário multi-hop pedido pelo Controle Mestre (seção 6, item 3):
// "A analisa -> B analisa -> C analisa -> respostas chegam fora de ordem
// (C, A, B)". Nenhum teste existente (nem os desta frente, nem os do
// PR #208) exercita três conversas com análises simultaneamente em voo e
// respostas chegando em ordem embaralhada.
//
// Este teste prova algo mais forte do que "a resposta errada não aparece
// na tela agora": prova que uma resposta descartada por pertencer a um
// contexto que não é mais o atual NUNCA é aplicada a `state` — nem sequer
// fica "esperando" para reaparecer quando o vendedor volta para a
// conversa original. Isso só é observável com 3+ contextos porque com
// apenas 2 (A/B) não dá para distinguir "a resposta de A nunca foi
// aplicada em lugar nenhum" de "a resposta de A foi aplicada só quando o
// vendedor está em A" sem uma terceira variável de controle.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMessageHtml,
  buildWhatsAppPageHtml,
  ingestCalls,
  loadContentScript,
  resolveLeadCalls,
  waitFor,
} from '../e3-test-support/load-content-script.mjs'

const TITLE_A = '+55 11 98888-7777'
const TITLE_B = '+55 21 97777-6666'
const TITLE_C = '+55 31 96666-5555'

const CYCLE_A = 'cycle-multihop-a'
const CYCLE_B = 'cycle-multihop-b'
const CYCLE_C = 'cycle-multihop-c'

const MARKER_A = 'MARCADOR_MULTIHOP_A'
const MARKER_B = 'MARCADOR_MULTIHOP_B'
const MARKER_C = 'MARCADOR_MULTIHOP_C'

function onlyDigits(value) {
  return String(value).replace(/\D/g, '')
}

function leadResolutionFor({ cycleId, phoneDigits }) {
  return {
    ok: true,
    status: 'OWNED_BY_ME',
    lead: {
      id: `lead-${cycleId}`,
      name: `Cliente ${cycleId}`,
      phone: phoneDigits,
      email: null,
      cpf_cnpj: null,
      deleted_at: null,
    },
    cycle: { id: cycleId, status: 'contato', owner_user_id: 'user-1' },
    actions: { can_analyze_conversation: true, can_apply_suggestion: true },
    flags: { is_owned_by_me: true, is_pool: false, is_closed: false },
    phone: phoneDigits,
  }
}

function successPayload(summary) {
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

function initialPageHtml() {
  return buildWhatsAppPageHtml({
    headerTitle: TITLE_A,
    messagesHtml: buildMessageHtml({
      id: 'msg-a1',
      prePlainText: '[09:00, 21/08/2026] Cliente A: ',
      text: 'Quero entender melhor as condições antes de decidir.',
    }),
  })
}

async function clickAnalyzeButton(document) {
  const button = await waitFor(() =>
    document.querySelector('[data-yolen-action="analyze-conversation"]'),
  )
  button.click()
}

async function switchConversationAndWait({ document, calls, title, messageId, prePlainText, text }) {
  const headerTitleSpan = document.querySelector('header span[title]')
  const conversationBody = document.getElementById('conversation-body')

  const resolveLeadCountBefore = resolveLeadCalls(calls).length

  headerTitleSpan.setAttribute('title', title)
  headerTitleSpan.textContent = title
  conversationBody.innerHTML = buildMessageHtml({ id: messageId, prePlainText, text })

  await waitFor(() => resolveLeadCalls(calls).length > resolveLeadCountBefore)
  await waitFor(() => {
    const lastIngest = ingestCalls(calls).at(-1)
    return Boolean(
      lastIngest?.payload.messages.some((message) => message.message_key?.includes(messageId)),
    )
  })
}

function nowPanelText(document) {
  return document.querySelector('.yolen-decision-title')?.textContent ?? ''
}

test(
  'A analisa -> B analisa -> C analisa -> respostas chegam fora de ordem (C, A, B): cada resultado só afeta seu próprio contexto, mesmo depois de voltar para ele',
  async () => {
    let resolveA
    let resolveB
    let resolveC
    const gateA = new Promise((resolve) => {
      resolveA = resolve
    })
    const gateB = new Promise((resolve) => {
      resolveB = resolve
    })
    const gateC = new Promise((resolve) => {
      resolveC = resolve
    })

    const { document, calls } = loadContentScript({
      initialHtml: initialPageHtml(),
      resolutionsByPhone: {
        [onlyDigits(TITLE_A)]: leadResolutionFor({ cycleId: CYCLE_A, phoneDigits: onlyDigits(TITLE_A) }),
        [onlyDigits(TITLE_B)]: leadResolutionFor({ cycleId: CYCLE_B, phoneDigits: onlyDigits(TITLE_B) }),
        [onlyDigits(TITLE_C)]: leadResolutionFor({ cycleId: CYCLE_C, phoneDigits: onlyDigits(TITLE_C) }),
      },
      analysisResult: (requestPayload) => {
        if (requestPayload?.cycle_id === CYCLE_A) return gateA
        if (requestPayload?.cycle_id === CYCLE_B) return gateB
        if (requestPayload?.cycle_id === CYCLE_C) return gateC
        return successPayload('IRRELEVANTE')
      },
    })

    // A analisa (fica presa).
    await clickAnalyzeButton(document)
    await waitFor(() =>
      calls.some((call) => call.action === 'ANALYZE_CONVERSATION' && call.payload?.cycle_id === CYCLE_A),
    )

    // Vai para B, analisa (fica presa).
    await switchConversationAndWait({
      document,
      calls,
      title: TITLE_B,
      messageId: 'msg-b1',
      prePlainText: '[09:10, 21/08/2026] Cliente B: ',
      text: 'Oi, queria saber o horário de atendimento.',
    })
    await clickAnalyzeButton(document)
    await waitFor(() =>
      calls.some((call) => call.action === 'ANALYZE_CONVERSATION' && call.payload?.cycle_id === CYCLE_B),
    )

    // Vai para C, analisa (fica presa).
    await switchConversationAndWait({
      document,
      calls,
      title: TITLE_C,
      messageId: 'msg-c1',
      prePlainText: '[09:20, 21/08/2026] Cliente C: ',
      text: 'Bom dia, gostaria de agendar uma visita.',
    })
    await clickAnalyzeButton(document)
    await waitFor(() =>
      calls.some((call) => call.action === 'ANALYZE_CONVERSATION' && call.payload?.cycle_id === CYCLE_C),
    )

    // Usuário permanece em C. As três respostas chegam fora de ordem: C,
    // depois A, depois B.
    resolveC(successPayload(MARKER_C))
    await waitFor(() => nowPanelText(document).includes(MARKER_C))

    resolveA(successPayload(MARKER_A))
    await new Promise((resolve) => setTimeout(resolve, 100))

    assert.doesNotMatch(
      nowPanelText(document),
      new RegExp(MARKER_A),
      'a resposta de A não pode aparecer na tela de C',
    )
    assert.match(
      nowPanelText(document),
      new RegExp(MARKER_C),
      'C deveria continuar mostrando o próprio resultado',
    )

    resolveB(successPayload(MARKER_B))
    await new Promise((resolve) => setTimeout(resolve, 100))

    assert.doesNotMatch(
      nowPanelText(document),
      new RegExp(MARKER_B),
      'a resposta de B não pode aparecer na tela de C',
    )
    assert.match(
      nowPanelText(document),
      new RegExp(MARKER_C),
      'C ainda deveria mostrar o próprio resultado depois das três respostas terem chegado',
    )

    // Agora a prova mais forte: as respostas de A e B foram descartadas
    // enquanto o vendedor estava em C. Elas NUNCA podem "reaparecer" só
    // porque o vendedor volta para a conversa original — se tivessem sido
    // aplicadas a um `state` global por engano (em vez de descartadas de
    // verdade), voltar para A/B revelaria o marcador.
    await switchConversationAndWait({
      document,
      calls,
      title: TITLE_A,
      messageId: 'msg-a2',
      prePlainText: '[09:30, 21/08/2026] Cliente A: ',
      text: 'Ainda aguardo retorno.',
    })

    assert.doesNotMatch(
      nowPanelText(document),
      new RegExp(MARKER_A),
      'a resposta descartada de A não pode reaparecer quando o vendedor volta para a conversa A',
    )
    assert.ok(
      document.querySelector('[data-yolen-action="analyze-conversation"]'),
      'A deveria voltar ao estado inicial (nunca analisado), não a um resultado fantasma',
    )

    await switchConversationAndWait({
      document,
      calls,
      title: TITLE_B,
      messageId: 'msg-b2',
      prePlainText: '[09:31, 21/08/2026] Cliente B: ',
      text: 'Alguma novidade sobre o horário?',
    })

    assert.doesNotMatch(
      nowPanelText(document),
      new RegExp(MARKER_B),
      'a resposta descartada de B não pode reaparecer quando o vendedor volta para a conversa B',
    )
    assert.ok(
      document.querySelector('[data-yolen-action="analyze-conversation"]'),
      'B deveria voltar ao estado inicial (nunca analisado), não a um resultado fantasma',
    )
  },
)
