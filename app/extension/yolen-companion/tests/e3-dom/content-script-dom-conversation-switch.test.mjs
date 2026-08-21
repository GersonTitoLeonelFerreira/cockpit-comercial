// Testes de comportamento REAL de content-script.js (não modificado) para o
// cenário de "troca de conversa" no WhatsApp Web: o usuário sai de uma
// conversa e abre outra, e o DOM reflete isso trocando o cabeçalho e a lista
// de mensagens. Este era o segundo gap sinalizado pela auditoria E1 como
// nunca testado no nível de DOM (o primeiro, edição/exclusão/restauração de
// mensagens, foi coberto em content-script-dom-message-mutations.test.mjs).
//
// O que se espera do pipeline real (refreshConversationSnapshot em
// src/content-script.js): ao detectar que a chave da conversa mudou, ele
// reseta o "ledger" de mensagens da conversa anterior (resetConversationMessageLedger)
// e dispara uma nova resolução de lead (RESOLVE_LEAD) para o novo telefone.
// Aqui observamos isso apenas pela superfície pública real do script: as
// chamadas que ele faz a `chrome.runtime.sendMessage`.

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

const CONVERSATION_A_TITLE = '+55 11 98888-7777'
const CONVERSATION_B_TITLE = '+55 21 97777-6666'

function onlyDigits(value) {
  return String(value).replace(/\D/g, '')
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

test('ao trocar de conversa, resolve um novo lead para o telefone da nova conversa e reseta o ledger', async () => {
  const { document, calls } = loadContentScript({
    initialHtml: pageHtmlFor({
      headerTitle: CONVERSATION_A_TITLE,
      messageId: 'msg-a1',
      prePlainText: '[10:15, 21/08/2026] Cliente A: ',
      text: 'Mensagem da conversa A',
    }),
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0 && ingestCalls(calls).length > 0)

  const resolveLeadCountAfterA = resolveLeadCalls(calls).length
  const firstResolveLeadCall = resolveLeadCalls(calls).at(0)
  assert.equal(firstResolveLeadCall.payload.phone, onlyDigits(CONVERSATION_A_TITLE))

  const ingestsAfterA = ingestCalls(calls)
  const lastMessagesForA = ingestsAfterA.at(-1).payload.messages
  assert.ok(
    lastMessagesForA.some((message) => message.message_key?.includes('msg-a1')),
    'esperava a mensagem da conversa A no payload antes da troca',
  )

  const conversationBody = document.getElementById('conversation-body')
  const headerTitleSpan = document.querySelector('header span[title]')

  headerTitleSpan.setAttribute('title', CONVERSATION_B_TITLE)
  headerTitleSpan.textContent = CONVERSATION_B_TITLE
  conversationBody.innerHTML = buildMessageHtml({
    id: 'msg-b1',
    prePlainText: '[11:30, 21/08/2026] Cliente B: ',
    text: 'Mensagem da conversa B',
  })

  await waitFor(() => resolveLeadCalls(calls).length > resolveLeadCountAfterA)

  const resolveLeadCallsForB = resolveLeadCalls(calls)
  const lastResolveLeadCall = resolveLeadCallsForB.at(-1)
  assert.equal(lastResolveLeadCall.payload.phone, onlyDigits(CONVERSATION_B_TITLE))

  await waitFor(() => {
    const ingests = ingestCalls(calls)
    const lastMessages = ingests.at(-1)?.payload.messages ?? []
    return lastMessages.some((message) => message.message_key?.includes('msg-b1')) ? lastMessages : false
  })

  const finalMessages = ingestCalls(calls).at(-1).payload.messages
  assert.ok(
    finalMessages.some((message) => message.message_key?.includes('msg-b1')),
    'esperava a mensagem da conversa B no payload após a troca',
  )
  assert.ok(
    !finalMessages.some((message) => message.message_key?.includes('msg-a1')),
    'o ledger da conversa A não deveria vazar para o payload da conversa B após a troca (reset esperado)',
  )
})
