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
  siblingCard = false,
  distantSiblingCard = false,
  attachmentOnlyCard = false,
} = {}) {
  const captionHtml = caption
    ? `<span data-testid="selectable-text" class="selectable-text copyable-text"><span>${caption}</span></span>`
    : ''

  if (attachmentOnlyCard) {
    return `
      <div class="message-out" data-id="${id}">
        <div class="document-card">
          <span>${FILE_NAME}</span>
          <span>1 página • PDF • 221 kB</span>
        </div>
        <span class="message-time">10:31</span>
      </div>
    `
  }

  if (distantSiblingCard) {
    return `
      <div class="message-out" data-id="${id}">
        <div class="document-card">
          <span>${FILE_NAME}</span>
        </div>
        <div class="level-1">
          <div class="level-2">
            <div class="level-3">
              <div class="level-4">
                <div class="level-5">
                  <div class="level-6">
                    <div class="level-7">
                      <div class="level-8">
                        ${captionHtml}
                        <div data-pre-plain-text="[10:31, 12/09/2026] Rayane: "></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `
  }

  if (siblingCard) {
    return `
      <div class="message-out" data-id="${id}">
        <div class="bubble-shell">
          <div class="document-card">
            <span>${FILE_NAME}</span>
          </div>
          ${captionHtml}
          <div data-pre-plain-text="[10:31, 12/09/2026] Rayane: "></div>
        </div>
      </div>
    `
  }

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

test('content-script captura documento quando cartão real é irmão do data-pre-plain-text', async () => {
  const initialHtml = buildWhatsAppPageHtml({
    headerTitle: HEADER_TITLE,
    messagesHtml: buildDocumentMessageHtml({
      id: 'msg-pdf-sibling',
      siblingCard: true,
    }),
  })

  const { calls } = loadContentScript({
    initialHtml,
  })

  const captured = await waitFor(() => {
    const message = findCapturedMessage(
      calls,
      'msg-pdf-sibling',
    )

    return message?.text_content ===
      `[Arquivo: ${FILE_NAME}]`
      ? message
      : false
  })

  assert.equal(captured.direction, 'outgoing')
  assert.equal(captured.content_type, 'text')
  assert.equal(captured.is_deleted, false)
})

test('content-script captura documento quando cartão está fora do limite ancestral do adapter canônico', async () => {
  const initialHtml = buildWhatsAppPageHtml({
    headerTitle: HEADER_TITLE,
    messagesHtml: buildDocumentMessageHtml({
      id: 'msg-pdf-distant-sibling',
      distantSiblingCard: true,
    }),
  })

  const { calls } = loadContentScript({
    initialHtml,
  })

  const captured = await waitFor(() => {
    const message = findCapturedMessage(
      calls,
      'msg-pdf-distant-sibling',
    )

    return message?.text_content ===
      `[Arquivo: ${FILE_NAME}]`
      ? message
      : false
  })

  assert.equal(captured.direction, 'outgoing')
  assert.equal(captured.content_type, 'text')
  assert.equal(captured.is_deleted, false)
})

test('runtime final captura cartão PDF sem data-pre-plain-text usando data cronológica dos vizinhos', async () => {
  const messagesHtml = [
    `
      <div class="message-in" data-id="msg-before-pdf">
        <div data-pre-plain-text="[10:22, 12/09/2026] Cliente: ">
          <span data-testid="selectable-text">me manda a grade das aulas coletivas pf?</span>
        </div>
      </div>
    `,
    buildDocumentMessageHtml({
      id: 'msg-pdf-without-preplain',
      attachmentOnlyCard: true,
    }),
    `
      <div class="message-in" data-id="msg-after-pdf">
        <div data-pre-plain-text="[14:40, 12/09/2026] Cliente: ">
          <span data-testid="selectable-text">Olá eu e minha amiga gostariamos de fazer a aula experimental</span>
        </div>
      </div>
    `,
  ].join('')

  const initialHtml = buildWhatsAppPageHtml({
    headerTitle: HEADER_TITLE,
    messagesHtml,
  })

  // Q6 (FASE 5): a bolha só de anexo é normalizada em memória pelo adapter
  // WhatsApp da composição real do manifest — sem runtime extra e sem nó
  // sintético no DOM.
  const { calls, document } = loadContentScript({
    initialHtml,
  })

  const captured = await waitFor(() => {
    const message = findCapturedMessage(
      calls,
      'msg-pdf-without-preplain',
    )

    return message?.text_content ===
      `[Arquivo: ${FILE_NAME}]`
      ? message
      : false
  })

  assert.equal(captured.direction, 'outgoing')
  assert.equal(captured.content_type, 'text')
  assert.equal(captured.is_deleted, false)
  // 10:31 do cartão + 12/09/2026 dos vizinhos, no fuso local do navegador
  // (o WhatsApp exibe horário local). Antes, o valor fixo '...T13:31:00Z'
  // só batia num runner em UTC−3.
  assert.equal(
    captured.occurred_at,
    new Date(2026, 8, 12, 10, 31).toISOString(),
  )
  assert.equal(
    document.querySelectorAll(
      '[data-yolen-attachment-evidence], [data-yolen-phase16-9-attachment-message], [data-yolen-attachment-synthetic-message], [data-yolen-attachment-bubble-bridge]',
    ).length,
    0,
    'nenhum nó sintético é escrito no DOM do WhatsApp',
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

test('content-script preserva legenda quando cartão e legenda são irmãos do nó canônico', async () => {
  const initialHtml = buildWhatsAppPageHtml({
    headerTitle: HEADER_TITLE,
    messagesHtml: buildDocumentMessageHtml({
      id: 'msg-pdf-caption-sibling',
      caption: 'Segue a grade atualizada.',
      siblingCard: true,
    }),
  })

  const { calls } = loadContentScript({
    initialHtml,
  })

  const captured = await waitFor(() => {
    const message = findCapturedMessage(
      calls,
      'msg-pdf-caption-sibling',
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
