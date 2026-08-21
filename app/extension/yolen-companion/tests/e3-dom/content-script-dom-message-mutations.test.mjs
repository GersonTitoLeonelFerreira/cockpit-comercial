// Testes de comportamento REAL de app/extension/yolen-companion/src/content-script.js
// (não modificado — apenas carregado como está, via node:vm + jsdom) contra
// mutações de DOM que imitam o WhatsApp Web: mensagem inicial, mensagem
// editada, mensagem apagada e mensagem restaurada após apagada.
//
// Antes da E3, toda a cobertura de content-script.js era estrutural (regex
// sobre o texto-fonte, nunca comportamento real de DOM). Este arquivo fecha
// essa lacuna para o pipeline de captura de mensagens, observando apenas a
// superfície pública real do script: mutações que ele faz no DOM e chamadas
// que ele faz a `chrome.runtime.sendMessage`.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMessageHtml,
  buildWhatsAppPageHtml,
  ingestCalls,
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

function lastIngestedMessages(calls) {
  const ingests = ingestCalls(calls)
  assert.ok(ingests.length > 0, 'esperava ao menos uma chamada INGEST_CAPTURE_MESSAGES')
  return ingests.at(-1).payload.messages
}

function findMessage(messages, id) {
  const message = messages.find((candidate) => candidate.message_key === id || candidate.message_key?.includes(id))
  assert.ok(message, `mensagem "${id}" não encontrada no payload: ${JSON.stringify(messages)}`)
  return message
}

test('captura a mensagem inicial presente no DOM ao carregar', async () => {
  const { calls } = loadContentScript({ initialHtml: initialPageHtml() })

  await waitFor(() => ingestCalls(calls).length > 0)

  const messages = lastIngestedMessages(calls)
  const message = findMessage(messages, 'msg-1')

  assert.equal(message.is_deleted, false)
  assert.equal(message.text_content, 'Ola, bom dia')
  assert.equal(message.content_type, 'text')
  assert.equal(typeof message.occurred_at, 'string')
  assert.ok(message.occurred_at.length > 0)
})

test('captura o novo texto quando uma mensagem existente é editada no DOM', async () => {
  const { document, calls } = loadContentScript({ initialHtml: initialPageHtml() })

  await waitFor(() => ingestCalls(calls).length > 0)
  const initialCallCount = ingestCalls(calls).length

  const preNode = document.querySelector('[data-pre-plain-text]')
  const textSpan = preNode.querySelector('span > span')
  textSpan.textContent = 'Ola, bom dia! Mensagem editada'

  await waitFor(() => {
    const ingests = ingestCalls(calls)
    if (ingests.length <= initialCallCount) return false
    const messages = ingests.at(-1).payload.messages
    const message = messages.find((candidate) => candidate.message_key?.includes('msg-1'))
    return message?.text_content === 'Ola, bom dia! Mensagem editada' ? message : false
  })

  const messages = lastIngestedMessages(calls)
  const message = findMessage(messages, 'msg-1')
  assert.equal(message.text_content, 'Ola, bom dia! Mensagem editada')
  assert.equal(message.is_deleted, false)
})

test('marca a mensagem como apagada quando o DOM reflete o texto de "mensagem apagada"', async () => {
  const { document, calls } = loadContentScript({ initialHtml: initialPageHtml() })

  await waitFor(() => ingestCalls(calls).length > 0)
  const initialCallCount = ingestCalls(calls).length

  const preNode = document.querySelector('[data-pre-plain-text]')
  preNode.innerHTML = '<div>Esta mensagem foi apagada</div>'

  await waitFor(() => {
    const ingests = ingestCalls(calls)
    if (ingests.length <= initialCallCount) return false
    const messages = ingests.at(-1).payload.messages
    const message = messages.find((candidate) => candidate.message_key?.includes('msg-1'))
    return message?.is_deleted === true ? message : false
  })

  const messages = lastIngestedMessages(calls)
  const message = findMessage(messages, 'msg-1')
  assert.equal(message.is_deleted, true)
  assert.equal(message.text_content, null)
})

test('restaura a mensagem com o novo conteúdo quando o DOM deixa de mostrar o texto de apagada', async () => {
  const { document, calls } = loadContentScript({ initialHtml: initialPageHtml() })

  await waitFor(() => ingestCalls(calls).length > 0)

  const preNode = document.querySelector('[data-pre-plain-text]')
  preNode.innerHTML = '<div>Esta mensagem foi apagada</div>'

  await waitFor(() => {
    const messages = ingestCalls(calls).at(-1)?.payload.messages ?? []
    const message = messages.find((candidate) => candidate.message_key?.includes('msg-1'))
    return message?.is_deleted === true ? message : false
  })
  const callCountAfterDelete = ingestCalls(calls).length

  preNode.innerHTML =
    '<span data-testid="selectable-text" class="selectable-text copyable-text"><span>Ola, bom dia! Mensagem restaurada</span></span>'

  await waitFor(() => {
    const ingests = ingestCalls(calls)
    if (ingests.length <= callCountAfterDelete) return false
    const messages = ingests.at(-1).payload.messages
    const message = messages.find((candidate) => candidate.message_key?.includes('msg-1'))
    return message?.is_deleted === false && message?.text_content === 'Ola, bom dia! Mensagem restaurada'
      ? message
      : false
  })

  const messages = lastIngestedMessages(calls)
  const message = findMessage(messages, 'msg-1')
  assert.equal(message.is_deleted, false)
  assert.equal(message.text_content, 'Ola, bom dia! Mensagem restaurada')
})
