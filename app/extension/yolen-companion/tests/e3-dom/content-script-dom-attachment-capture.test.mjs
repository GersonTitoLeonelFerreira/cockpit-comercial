import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

import {
  buildWhatsAppPageHtml,
  ingestCalls,
  loadContentScript,
  waitFor,
} from '../e3-test-support/load-content-script.mjs'

const HEADER_TITLE = '+55 11 98888-7777'
const FILE_NAME = 'GRADE ATUALIZADA EM 12-08-26 (1).pdf'
const MESSAGE_MUTATIONS_SOURCE =
  fs.readFileSync(
    new URL(
      '../../src/message-mutations.js',
      import.meta.url,
    ),
    'utf8',
  )
const PHASE_16_9_RUNTIME_SOURCE =
  fs.readFileSync(
    new URL(
      '../../src/phase16-9-runtime-guard.js',
      import.meta.url,
    ),
    'utf8',
  )

function installPhase169RuntimeGuard(window) {
  // O manifest real carrega message-mutations.js antes do runtime guard e
  // ambos compartilham o mesmo isolated world. O harness E3, por outro lado,
  // executava o guard num segundo vm.Context sem expor esse helper; assim o
  // fallback do teste lia textContent cru e perdia o espaço representado por
  // <br>, algo que não corresponde ao runtime real do Firefox. Carregamos
  // somente a API pura de message-mutations (sem document/observer) e a
  // injetamos no mesmo contexto do guard para reproduzir a ordem real.
  const messageMutationsSandbox = {
    console,
  }

  messageMutationsSandbox.globalThis =
    messageMutationsSandbox

  vm.createContext(
    messageMutationsSandbox,
  )
  vm.runInContext(
    MESSAGE_MUTATIONS_SOURCE,
    messageMutationsSandbox,
    {
      filename:
        'message-mutations.js',
    },
  )

  const sandbox = {
    window,
    document: window.document,
    MutationObserver:
      window.MutationObserver,
    Node: window.Node,
    YolenCompanionMessageMutations:
      messageMutationsSandbox
        .YolenCompanionMessageMutations,
    console,
  }

  sandbox.globalThis = sandbox

  vm.createContext(sandbox)
  vm.runInContext(
    PHASE_16_9_RUNTIME_SOURCE,
    sandbox,
    {
      filename:
        'phase16-9-runtime-guard.js',
    },
  )
}

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

  const {
    calls,
    window,
  } = loadContentScript({
    initialHtml,
  })

  installPhase169RuntimeGuard(
    window,
  )

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
  assert.equal(captured.occurred_at, '2026-09-12T13:31:00.000Z')
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

test('runtime final preserva filename de PDF quebrado em múltiplas linhas e entrega no capture payload', async () => {
  const messagesHtml = [
    `
      <div class="message-in" data-id="msg-before-wrapped-pdf">
        <div data-pre-plain-text="[10:22, 12/09/2026] Cliente: ">
          <span data-testid="selectable-text">Pode enviar o material?</span>
        </div>
      </div>
    `,
    `
      <div class="message-out" data-id="msg-wrapped-pdf">
        <div class="document-card">
          <span>GRADE ATUALIZADA EM 12-08-26<br>(1).pdf</span>
          <span>1 página • PDF • 221 kB</span>
        </div>
        <span class="message-time">10:31</span>
      </div>
    `,
    `
      <div class="message-in" data-id="msg-after-wrapped-pdf">
        <div data-pre-plain-text="[14:40, 12/09/2026] Cliente: ">
          <span data-testid="selectable-text">Obrigada.</span>
        </div>
      </div>
    `,
  ].join('')

  const initialHtml = buildWhatsAppPageHtml({
    headerTitle: HEADER_TITLE,
    messagesHtml,
  })

  const {
    calls,
    window,
  } = loadContentScript({
    initialHtml,
  })

  installPhase169RuntimeGuard(
    window,
  )

  const captured = await waitFor(() => {
    const message = findCapturedMessage(
      calls,
      'msg-wrapped-pdf',
    )

    return message?.text_content ===
      `[Arquivo: ${FILE_NAME}]`
      ? message
      : false
  })

  assert.equal(captured.direction, 'outgoing')
  assert.equal(captured.content_type, 'text')
  assert.equal(captured.is_deleted, false)
  assert.equal(
    captured.text_content,
    `[Arquivo: ${FILE_NAME}]`,
  )
})
