// FASE 4B.2 — resolveCurrentLead() escopado pela geração da fronteira
// canônica de conversa (companion-conversation-boundary.js).
//
// Comportamento REAL de content-script.js observado só pela superfície
// pública (DOM do painel + chamadas RESOLVE_LEAD ao background falso):
//
//   A₁ resolve fica em voo
//   → abre B
//   → volta para A (A₂, nova geração, MESMA conversationKey e telefone)
//   → A₂ consegue iniciar o PRÓPRIO resolve antes de A₁ terminar
//   → A₂ aplica o resultado atual
//   → A₁ finalmente retorna e NÃO sobrescreve A₂.
//
// Com o single-flight antigo (indexado só por conversationKey) a segunda
// resolução de A ficava bloqueada enquanto A₁ estivesse em voo, e com o
// guard antigo (só telefone + chave) o resultado de A₁ pareceria atual em A₂.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMessageHtml,
  buildWhatsAppPageHtml,
  defaultLeadResolution,
  loadContentScript,
  resolveLeadCalls,
  waitFor,
} from '../e3-test-support/load-content-script.mjs'

const PHONE_A_TITLE = '+55 11 98888-7777'
const PHONE_B_TITLE = '+55 21 97777-6666'
const PHONE_A = '5511988887777'
const PHONE_B = '5521977776666'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function conversationMessagesHtml(id, author, text) {
  return buildMessageHtml({
    id,
    prePlainText: `[10:15, 21/08/2026] ${author}: `,
    text,
  })
}

function openConversation(document, { title, messageId, author, text }) {
  const headerTitleSpan = document.querySelector('header span[title]')
  headerTitleSpan.setAttribute('title', title)
  headerTitleSpan.textContent = title
  document.getElementById('conversation-body').innerHTML =
    conversationMessagesHtml(messageId, author, text)
}

function panelText(document) {
  return document.getElementById('yolen-companion-panel')?.textContent ?? ''
}

function callsForPhone(calls, phone) {
  return resolveLeadCalls(calls).filter((call) => call.payload?.phone === phone)
}

test('A → B → A: A₂ inicia o próprio resolve com A₁ em voo e o resultado antigo de A₁ não sobrescreve A₂', async () => {
  let releaseOldA
  const oldAResult = new Promise((resolve) => {
    releaseOldA = resolve
  })

  let phoneACallCount = 0

  const { document, calls } = loadContentScript({
    initialHtml: buildWhatsAppPageHtml({
      headerTitle: PHONE_A_TITLE,
      messagesHtml: conversationMessagesHtml('msg-a1', 'Cliente A', 'Mensagem da conversa A'),
    }),
    resolutionsByPhone: {
      [PHONE_A]: () => {
        phoneACallCount += 1

        if (phoneACallCount === 1) {
          // A₁: deliberadamente presa em voo até o fim do teste.
          return oldAResult
        }

        // A₂: responde imediatamente com o lead da geração atual.
        return defaultLeadResolution({
          phone: PHONE_A,
          lead: { id: 'lead-a', name: 'A_GERACAO_ATUAL', phone: PHONE_A, email: null, cpf_cnpj: null, deleted_at: null },
        })
      },
      [PHONE_B]: defaultLeadResolution({
        phone: PHONE_B,
        lead: { id: 'lead-b', name: 'LEAD_B', phone: PHONE_B, email: null, cpf_cnpj: null, deleted_at: null },
      }),
    },
  })

  // PASSO 1 — A₁ em voo.
  await waitFor(() => callsForPhone(calls, PHONE_A).length === 1)

  // PASSO 2 — abre B (A₁ continua presa).
  openConversation(document, {
    title: PHONE_B_TITLE,
    messageId: 'msg-b1',
    author: 'Cliente B',
    text: 'Mensagem da conversa B',
  })
  await waitFor(() => callsForPhone(calls, PHONE_B).length >= 1)
  assert.equal(callsForPhone(calls, PHONE_A).length, 1)

  // PASSO 3 — volta para A (A₂) ainda com A₁ em voo: a nova geração
  // precisa conseguir disparar o PRÓPRIO RESOLVE_LEAD.
  openConversation(document, {
    title: PHONE_A_TITLE,
    messageId: 'msg-a2',
    author: 'Cliente A',
    text: 'Mensagem da conversa A de novo',
  })
  await waitFor(() => callsForPhone(calls, PHONE_A).length === 2)

  // PASSO 4 — A₂ aplica o resultado atual.
  await waitFor(() => panelText(document).includes('A_GERACAO_ATUAL'))
  assert.ok(!panelText(document).includes('LEAD_B'), 'nada de B pode continuar visível em A₂')

  // PASSO 5 — libera A₁ tardiamente: o resultado antigo é descartado.
  releaseOldA(defaultLeadResolution({
    phone: PHONE_A,
    lead: { id: 'lead-a-old', name: 'A_GERACAO_ANTIGA', phone: PHONE_A, email: null, cpf_cnpj: null, deleted_at: null },
  }))
  await sleep(300)

  assert.ok(panelText(document).includes('A_GERACAO_ATUAL'), 'A₂ continua exibindo o lead da geração atual')
  assert.ok(!panelText(document).includes('A_GERACAO_ANTIGA'), 'o resultado de A₁ nunca pode sobrescrever A₂')
  assert.equal(callsForPhone(calls, PHONE_A).length, 2, 'nenhum request extra de A depois do retorno de A₁')
})
