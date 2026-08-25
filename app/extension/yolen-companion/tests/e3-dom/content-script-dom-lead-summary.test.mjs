// Teste de DOM real (jsdom + node:vm) do resumo central da reconstrução
// do Companion. O resumo é criado pela Yolen; o vendedor apenas decide
// quando persistir o working summary atual.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMessageHtml,
  buildWhatsAppPageHtml,
  defaultLeadResolution,
  defaultLeadSummary,
  leadSummaryCalls,
  loadContentScript,
  saveLeadSummaryCalls,
  waitFor,
} from '../e3-test-support/load-content-script.mjs'

const HEADER_TITLE = '+55 11 98888-7777'

function initialPageHtml() {
  return buildWhatsAppPageHtml({
    headerTitle: HEADER_TITLE,
    messagesHtml: buildMessageHtml({
      id: 'msg-1',
      prePlainText: '[10:15, 21/08/2026] Cliente Teste: ',
      text: 'Ola, bom dia',
    }),
  })
}

function automaticSummaryResult({
  workingSummary = 'Larissa já conhece a proposta da Yolen e apresentou objeção de investimento.',
  source = 'legacy_history_plus_conversation',
  savedSummary = null,
  hasUnsavedChanges = true,
} = {}) {
  return defaultLeadSummary({
    data: {
      summary: savedSummary,
      working_summary: workingSummary,
      working_summary_source: source,
      has_unsaved_changes: hasUnsavedChanges,
      current_message_watermark: 'wm-current',
      legacy_history_count: 10,
      legacy_history_distinct_count: 8,
      messages_used_count: 2,
    },
  })
}

test('após vincular o lead, o RESUMO ATUAL automático aparece na tela principal', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    leadSummaryResult: automaticSummaryResult(),
  })

  await waitFor(() => leadSummaryCalls(calls).length > 0)

  const call = leadSummaryCalls(calls).at(0)
  assert.equal(call.payload.cycle_id, 'cycle-1')
  assert.ok(typeof call.payload.conversation_key === 'string' && call.payload.conversation_key.length > 0)

  await waitFor(() => {
    const card = document.querySelector('.yolen-lead-summary-card')
    return Boolean(card && card.textContent.includes('Resumo atual'))
  })

  const card = document.querySelector('.yolen-lead-summary-card')
  assert.ok(card)
  assert.match(card.textContent, /Larissa já conhece a proposta da Yolen/)
  assert.match(card.textContent, /Histórico da Yolen \+ conversa atual/)

  // Continua fora de qualquer aba escondida e antes do workspace seller-facing.
  assert.equal(card.closest('[data-yolen-seller-panel]'), null)
  assert.equal(card.closest('[hidden]'), null)

  const workspace = document.querySelector('.yolen-seller-workspace')
  assert.ok(workspace)

  const DOCUMENT_POSITION_FOLLOWING = document.defaultView.Node.DOCUMENT_POSITION_FOLLOWING
  assert.ok(card.compareDocumentPosition(workspace) & DOCUMENT_POSITION_FOLLOWING)

  // Não existe editor manual. O input hidden serve apenas de ponte para o
  // handler já existente que salva o working summary por clique explícito.
  assert.equal(card.querySelector('textarea'), null)
  const hiddenSummary = card.querySelector('input[type="hidden"][data-yolen-textarea="lead-summary"]')
  assert.ok(hiddenSummary)
  assert.equal(
    hiddenSummary.value,
    'Larissa já conhece a proposta da Yolen e apresentou objeção de investimento.',
  )

  const button = card.querySelector('[data-yolen-action="save-lead-summary"]')
  assert.ok(button)
  assert.match(button.textContent, /Salvar resumo na Yolen/)

  // AGORA antigo não concorre visualmente com o novo resumo.
  const oldNowPanel = document.querySelector('[data-yolen-seller-panel="now"]')
  assert.ok(oldNowPanel)
  assert.match(oldNowPanel.getAttribute('style') ?? '', /^$/)
  assert.match(card.innerHTML, /yolen-seller-panel\[data-yolen-seller-panel="now"\]/)
})

test('antes de resolver o lead, o card do resumo não aparece', async () => {
  const { document } = loadContentScript({
    initialHtml: initialPageHtml(),
  })

  const card = document.querySelector('.yolen-lead-summary-card')
  assert.equal(card, null)
})

test('sem resumo canônico, histórico antigo pode gerar working summary automaticamente', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    leadSummaryResult: automaticSummaryResult({
      workingSummary:
        'O cliente já discutiu a solução anteriormente. A conversa atual não altera os pontos comerciais registrados.',
      source: 'legacy_history',
    }),
  })

  await waitFor(() => leadSummaryCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('.yolen-lead-summary-card')))

  const card = document.querySelector('.yolen-lead-summary-card')
  assert.match(card.textContent, /já discutiu a solução anteriormente/)
  assert.doesNotMatch(card.textContent, /Ainda não existe resumo salvo/i)
  assert.doesNotMatch(card.textContent, /Escreva ou ajuste/i)
})

test('falha ao atualizar o resumo mostra erro e botão de nova tentativa', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    leadSummaryResult: { ok: false, error: 'Falha simulada de rede.' },
  })

  await waitFor(() => leadSummaryCalls(calls).length > 0)

  await waitFor(() => {
    const card = document.querySelector('.yolen-lead-summary-card')
    return Boolean(card && card.querySelector('.yolen-lead-summary--error'))
  })

  const card = document.querySelector('.yolen-lead-summary-card')
  assert.match(card.textContent, /Falha simulada de rede\./)
  assert.ok(card.querySelector('[data-yolen-action="refresh"]'))
  assert.ok(document.querySelector('.yolen-contact-card'))
})

test('salvar envia o working summary automático; nunca há SAVE sem clique', async () => {
  const workingSummary =
    'Resumo automático consolidado com histórico da Yolen e conversa atual.'

  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    leadSummaryResult: automaticSummaryResult({ workingSummary }),
  })

  await waitFor(() => leadSummaryCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('[data-yolen-action="save-lead-summary"]')))

  assert.equal(saveLeadSummaryCalls(calls).length, 0)
  assert.equal(document.querySelector('.yolen-lead-summary-card textarea'), null)

  document.querySelector('[data-yolen-action="save-lead-summary"]').click()

  await waitFor(() => saveLeadSummaryCalls(calls).length > 0)

  const saveCall = saveLeadSummaryCalls(calls).at(0)
  assert.equal(saveCall.payload.summary, workingSummary)
  assert.equal(saveCall.payload.cycle_id, 'cycle-1')
})

const CONVERSATION_A_TITLE = '+55 11 98888-7777'
const CONVERSATION_B_TITLE = '+55 21 97777-6666'
const CYCLE_A = 'cycle-a'
const CYCLE_B = 'cycle-b'

function onlyDigits(value) {
  return String(value).replace(/\D/g, '')
}

function leadResolutionFor(cycleId, phone) {
  return defaultLeadResolution({
    phone,
    cycle: { id: cycleId, status: 'contato', owner_user_id: 'user-1' },
  })
}

test('A→B nunca mantém working summary da conversa anterior', async () => {
  const phoneA = onlyDigits(CONVERSATION_A_TITLE)
  const phoneB = onlyDigits(CONVERSATION_B_TITLE)

  const { document, calls } = loadContentScript({
    initialHtml: buildWhatsAppPageHtml({
      headerTitle: CONVERSATION_A_TITLE,
      messagesHtml: buildMessageHtml({
        id: 'msg-a1',
        prePlainText: '[10:15, 21/08/2026] Cliente A: ',
        text: 'Mensagem da conversa A',
      }),
    }),
    resolutionsByPhone: {
      [phoneA]: leadResolutionFor(CYCLE_A, phoneA),
      [phoneB]: leadResolutionFor(CYCLE_B, phoneB),
    },
    leadSummaryResult: (_callNumber, requestPayload) => {
      if (requestPayload.cycle_id === CYCLE_A) {
        return automaticSummaryResult({
          workingSummary: 'Resumo automático da conversa A.',
          source: 'legacy_history',
        })
      }

      return { ok: false, error: 'Falha simulada na conversa B.' }
    },
  })

  await waitFor(() => leadSummaryCalls(calls).some((call) => call.payload.cycle_id === CYCLE_A))
  await waitFor(() => {
    const card = document.querySelector('.yolen-lead-summary-card')
    return Boolean(card && card.textContent.includes('Resumo automático da conversa A.'))
  })

  const conversationBody = document.getElementById('conversation-body')
  const headerTitleSpan = document.querySelector('header span[title]')

  headerTitleSpan.setAttribute('title', CONVERSATION_B_TITLE)
  headerTitleSpan.textContent = CONVERSATION_B_TITLE
  conversationBody.innerHTML = buildMessageHtml({
    id: 'msg-b1',
    prePlainText: '[11:30, 21/08/2026] Cliente B: ',
    text: 'Mensagem da conversa B',
  })

  await waitFor(() => leadSummaryCalls(calls).some((call) => call.payload.cycle_id === CYCLE_B))
  await waitFor(() => {
    const card = document.querySelector('.yolen-lead-summary-card')
    return Boolean(card && card.querySelector('.yolen-lead-summary--error'))
  })

  const card = document.querySelector('.yolen-lead-summary-card')
  assert.doesNotMatch(card.textContent, /Resumo automático da conversa A/)
  assert.match(card.textContent, /Falha simulada na conversa B\./)
})
