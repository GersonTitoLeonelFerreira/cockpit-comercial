import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildWhatsAppPageHtml,
  ingestCalls,
  loadContentScript,
  waitFor,
} from '../e3-test-support/load-content-script.mjs'

const HEADER_TITLE = '+55 11 98888-7777'
const FILE_NAME = 'GRADE ATUALIZADA EM 12-08-26 (1).pdf'

function buildDocumentMessageHtml({
  id = 'msg-pdf-1',
  caption = null,
} = {}) {
  const captionHtml = caption
    ? `<span data-testid="selectable-text" class="selectable-text copyable-text"><span>${caption}</span></span>`
    : ''

  return `
    <div class="message-out" data-id="${id}">
      <div data-pre-plain-text="[10:31, 12/09/2026] Rayane: ">
        ${captionHtml}
        <div data-testid="document">
          <span title="${FILE_NAME}">${FILE_NAME}</span>
        </div>
      </div>
    </div>
  `
}

function findCapturedMessage(calls, id) {
  const messages = ingestCalls(calls).at(-1)?.payload?.messages ?? []

  return messages.find(
    (message) =>
      message.message_key === id ||
      message.message_key?.includes(id),
  )
}

test('content-script captura documento do WhatsApp que não possui selectable-text nativo', async () => {
  const initialHtml = buildWhatsAppPageHtml({
    headerTitle: HEADER_TITLE,
    messagesHtml: buildDocumentMessageHtml(),
  })

  const { calls } = loadContentScript({
    initialHtml,
  })

  const captured = await waitFor(() => {
    return findCapturedMessage(
      calls,
      'msg-pdf-1',
    )
  })

  assert.equal(captured.direction, 'outgoing')
  assert.equal(captured.content_type, 'text')
  assert.equal(captured.is_deleted, false)
  assert.equal(
    captured.text_content,
    `[Arquivo: ${FILE_NAME}]`,
  )
})

test('content-script preserva legenda e registra o documento como fato já entregue', async () => {
  const initialHtml = buildWhatsAppPageHtml({
    headerTitle: HEADER_TITLE,
    messagesHtml: buildDocumentMessageHtml({
      id: 'msg-pdf-caption',
      caption: 'Segue a grade atualizada.',
    }),
  })

  const { calls } = loadContentScript({
    initialHtml,
  })

  const captured = await waitFor(() => {
    const message = findCapturedMessage(
      calls,
      'msg-pdf-caption',
    )

    return message?.text_content?.includes(
      `[Arquivo: ${FILE_NAME}]`,
    )
      ? message
      : false
  })

  assert.equal(
    captured.text_content,
    `Segue a grade atualizada.\n[Arquivo: ${FILE_NAME}]`,
  )
})
