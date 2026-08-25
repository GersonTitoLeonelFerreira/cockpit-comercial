// Teste de DOM real (jsdom + node:vm) que prova que renderPanel() de
// content-script.js de verdade monta o bloco "Resumo salvo na Yolen" na
// tela principal — não apenas dentro de uma aba escondida. Mesmo harness
// real já usado por content-script-dom-client-relationship.test.mjs:
// carrega content-script.js sem modificá-lo e observa só o DOM resultante
// e as chamadas a `chrome.runtime.sendMessage`.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMessageHtml,
  buildWhatsAppPageHtml,
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

test('após vincular o lead, o card "Resumo salvo na Yolen" aparece na tela principal (não dentro de uma aba escondida)', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    leadSummaryResult: defaultLeadSummary({
      data: {
        summary: {
          summary: 'Larissa perde oportunidades por falta de follow-up.',
          version: 2,
          updated_at: '2026-08-25T12:00:00.000Z',
        },
      },
    }),
  })

  await waitFor(() => leadSummaryCalls(calls).length > 0)

  const call = leadSummaryCalls(calls).at(0)
  assert.equal(call.payload.cycle_id, 'cycle-1')
  assert.ok(typeof call.payload.conversation_key === 'string' && call.payload.conversation_key.length > 0)

  await waitFor(() => {
    const card = document.querySelector('.yolen-lead-summary-card')
    return Boolean(card && card.textContent.includes('Resumo salvo na Yolen'))
  })

  const card = document.querySelector('.yolen-lead-summary-card')
  assert.ok(card, 'esperava o card do resumo persistente no DOM')
  assert.match(card.textContent, /Larissa perde oportunidades por falta de follow-up\./)
  assert.match(card.textContent, /Versão 2/)

  // Prova que o card NÃO está preso dentro de uma aba escondida (a árvore
  // com abas marca painéis inativos com o atributo `hidden`) — ele fica
  // sempre visível na tela principal, fora de [data-yolen-seller-panel].
  assert.equal(card.closest('[data-yolen-seller-panel]'), null)
  assert.equal(card.closest('[hidden]'), null)

  // Também aparece antes da área de "inteligência antiga" (abas
  // Agora/Análise/Cliente) no DOM.
  const workspace = document.querySelector('.yolen-seller-workspace')
  assert.ok(workspace)

  const DOCUMENT_POSITION_FOLLOWING = document.defaultView.Node.DOCUMENT_POSITION_FOLLOWING

  assert.ok(
    card.compareDocumentPosition(workspace) & DOCUMENT_POSITION_FOLLOWING,
    'esperava o card do resumo antes da área seller-facing antiga',
  )

  const textarea = card.querySelector('[data-yolen-textarea="lead-summary"]')
  const button = card.querySelector('[data-yolen-action="save-lead-summary"]')
  assert.ok(textarea, 'esperava o campo manual temporário da Etapa 1')
  assert.ok(button, 'esperava o botão "Salvar resumo na Yolen"')
  assert.match(button.textContent, /Salvar resumo na Yolen/)
})

test('antes de resolver o lead, o card do resumo não aparece', async () => {
  const { document } = loadContentScript({
    initialHtml: initialPageHtml(),
  })

  const card = document.querySelector('.yolen-lead-summary-card')
  assert.equal(card, null)
})

test('lead sem resumo salvo mostra o estado vazio correto, sem inventar nada', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    leadSummaryResult: defaultLeadSummary(),
  })

  await waitFor(() => leadSummaryCalls(calls).length > 0)

  await waitFor(() => Boolean(document.querySelector('.yolen-lead-summary-card')))

  const card = document.querySelector('.yolen-lead-summary-card')
  assert.match(card.textContent, /Ainda não existe resumo salvo para este lead\./)
  assert.doesNotMatch(card.textContent, /sem evidência comercial/i)
})

test('falha ao buscar o resumo mostra o estado de erro em vez de travar o painel', async () => {
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

  // O restante do painel continua funcional mesmo com essa seção em erro.
  assert.ok(document.querySelector('.yolen-contact-card'))
})

test('clicar em "Salvar resumo na Yolen" dispara SAVE_LEAD_SUMMARY com o texto do campo manual, nunca automaticamente', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    leadSummaryResult: defaultLeadSummary(),
  })

  await waitFor(() => leadSummaryCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('[data-yolen-action="save-lead-summary"]')))

  assert.equal(saveLeadSummaryCalls(calls).length, 0, 'nenhum SAVE deve ocorrer sem clique explícito')

  const textarea = document.querySelector('[data-yolen-textarea="lead-summary"]')
  textarea.value = 'Resumo digitado manualmente pelo vendedor para teste da Etapa 1.'

  document.querySelector('[data-yolen-action="save-lead-summary"]').click()

  await waitFor(() => saveLeadSummaryCalls(calls).length > 0)

  const saveCall = saveLeadSummaryCalls(calls).at(0)
  assert.equal(saveCall.payload.summary, 'Resumo digitado manualmente pelo vendedor para teste da Etapa 1.')
  assert.equal(saveCall.payload.cycle_id, 'cycle-1')

  await waitFor(() => {
    const card = document.querySelector('.yolen-lead-summary-card')
    return Boolean(card && card.textContent.includes('Resumo digitado manualmente'))
  })
})
