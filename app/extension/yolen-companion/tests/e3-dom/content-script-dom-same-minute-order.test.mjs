// Ordem dentro do mesmo minuto (caso real da Júlia, HML).
//
// O WhatsApp só mostra minuto. A captura desempatava o minuto pela chave da
// mensagem: as recebidas (3A…) vinham sempre antes das enviadas pelo
// WhatsApp Web (3EB0…), e o ledger gravava nessa ordem. Aqui a conversa real
// da tela alterna vendedora/cliente no mesmo minuto, com um PDF só de anexo
// no meio, e a captura precisa sair exatamente na ordem do DOM. Textos
// sintéticos, nenhum texto de cliente real.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildWhatsAppPageHtml,
  ingestCalls,
  loadContentScript,
  waitFor,
} from '../e3-test-support/load-content-script.mjs'

const HEADER_TITLE = '+55 11 98888-7777'
const FILE_NAME = 'grade-sintetica.pdf'

function textBubble({ id, direction, text }) {
  return `
    <div class="message-${direction}" data-id="${id}">
      <div data-pre-plain-text="[17:39, 29/09/2026] ${direction === 'out' ? 'Vendedora' : 'Cliente'}: ">
        <span data-testid="selectable-text">${text}</span>
      </div>
    </div>
  `
}

// Bolha só de anexo no formato real: data-id no wrapper, classe de direção
// num filho, horário no cartão.
function attachmentBubble({ id }) {
  return `
    <div data-id="${id}">
      <div class="message-out">
        <div class="document-card">
          <span>${FILE_NAME}</span>
          <span>1 página • PDF • 221 kB</span>
        </div>
        <span class="message-time">17:39</span>
      </div>
    </div>
  `
}

// Ordem da tela; em ordem alfabética de chave a cliente ficaria toda antes.
const DOM_ORDER = [
  { id: '3EB0C0000000000000000A', direction: 'out', text: 'vendedora 1' },
  { id: '3EB0A0000000000000000B', direction: 'out', text: 'vendedora 2' },
  { id: '3AB00000000000000000', direction: 'in', text: 'cliente 1' },
  { id: '3EB0D0000000000000000C', attachment: true },
  { id: '3EB0B0000000000000000D', direction: 'out', text: 'vendedora 3' },
  { id: '3AA00000000000000000', direction: 'in', text: 'cliente 2' },
]

test('mesmo minuto: a captura envia as mensagens na ordem do DOM, com o anexo no lugar dele', async () => {
  const messagesHtml =
    DOM_ORDER.map((entry) =>
      entry.attachment
        ? attachmentBubble(entry)
        : textBubble(entry),
    ).join('')

  const { calls } = loadContentScript({
    initialHtml: buildWhatsAppPageHtml({
      headerTitle: HEADER_TITLE,
      messagesHtml,
    }),
  })

  const captured = await waitFor(() => {
    const messages =
      ingestCalls(calls).at(-1)?.payload?.messages ?? []

    return DOM_ORDER.every((entry) =>
      messages.some((message) => message.message_key === entry.id),
    )
      ? messages
      : false
  })

  // Objeto criado no realm do vm: compara por valor serializado.
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        captured
          .filter((message) =>
            DOM_ORDER.some((entry) => entry.id === message.message_key),
          )
          .map((message) => message.message_key),
      ),
    ),
    DOM_ORDER.map((entry) => entry.id),
  )

  const attachment =
    captured.find((message) => message.message_key === '3EB0D0000000000000000C')

  assert.equal(attachment.direction, 'outgoing')
  assert.equal(attachment.text_content, `[Arquivo: ${FILE_NAME}]`)
})
