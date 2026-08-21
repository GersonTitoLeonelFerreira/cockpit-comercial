// Cenário Q: teste de DOM real (Firefox/Chrome, via jsdom) da nova seção
// "Relacionamento" do Companion, adicionada por esta missão. Segue o mesmo
// harness real (node:vm + jsdom) já usado pelos outros testes de DOM da E3
// — carrega content-script.js de verdade, sem modificá-lo, e observa apenas
// a superfície pública real: o DOM resultante e as chamadas que ele faz a
// `chrome.runtime.sendMessage`.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMessageHtml,
  buildWhatsAppPageHtml,
  clientContextCalls,
  defaultClientContext,
  loadContentScript,
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

test('após resolver o lead, busca e renderiza o relacionamento com o cliente', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
  })

  await waitFor(() => clientContextCalls(calls).length > 0)

  const call = clientContextCalls(calls).at(0)

  assert.equal(call.payload.cycle_id, 'cycle-1')
  assert.ok(typeof call.payload.conversation_key === 'string' && call.payload.conversation_key.length > 0)

  await waitFor(() => {
    const card = document.querySelector('.yolen-client-relationship-card')
    return Boolean(card && card.textContent.includes('Relacionamento'))
  })

  const card = document.querySelector('.yolen-client-relationship-card')

  assert.ok(card, 'esperava o card de relacionamento no DOM')
  assert.match(card.textContent, /Primeiro contato/)
  assert.match(card.textContent, /Cliente aguardando você/)

  const waitingRow = document.querySelector('[data-yolen-waiting-state="customer_waiting_for_seller"]')

  assert.ok(waitingRow, 'esperava a linha de espera com o estado correto')
})

test('enquanto a resolução do lead ainda não terminou, nenhum card de relacionamento aparece', async () => {
  const { document } = loadContentScript({
    initialHtml: initialPageHtml(),
  })

  const card = document.querySelector('.yolen-client-relationship-card')

  assert.equal(card, null)
})

test('quando a busca do relacionamento falha, o card mostra o estado de erro em vez de travar o painel', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    clientContextResult: {
      ok: false,
      error: 'Não foi possível carregar o relacionamento com o cliente.',
    },
  })

  await waitFor(() => clientContextCalls(calls).length > 0)

  await waitFor(() => {
    const card = document.querySelector('.yolen-client-relationship-card')
    return Boolean(card && card.querySelector('.yolen-client-relationship--error'))
  })

  const card = document.querySelector('.yolen-client-relationship-card')

  assert.ok(card.querySelector('.yolen-client-relationship--error'))

  // O restante do painel continua funcional mesmo com essa seção em erro.
  assert.ok(document.querySelector('.yolen-contact-card'))
})

test('SLA configurado e estourado aparece no card com o rótulo de risco', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    clientContextResult: defaultClientContext({
      sla: {
        configured: true,
        applicable: true,
        stage: 'contato',
        stage_label: 'CONTATO',
        target_minutes: 60,
        warning_minutes: 120,
        danger_minutes: 240,
        elapsed_minutes: 300,
        risk: 'high',
      },
    }),
  })

  await waitFor(() => clientContextCalls(calls).length > 0)

  await waitFor(() => Boolean(document.querySelector('[data-yolen-sla-risk="high"]')))

  const slaRow = document.querySelector('[data-yolen-sla-risk="high"]')

  assert.match(slaRow.textContent, /Risco alto/)
})
