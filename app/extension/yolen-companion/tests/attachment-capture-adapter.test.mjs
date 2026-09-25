import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)
const tools = require('../src/message-mutations.js')

// FASE 5 / Q6: a evidência do anexo é descrita EM MEMÓRIA
// (describeAttachmentEvidence / describeBubbleAttachmentEvidence /
// describeAttachmentOnlyBubble) — nenhum <span> sintético é escrito no DOM
// do WhatsApp. Cada teste também prova que o DOM não foi alterado.
function assertDomUntouched(root) {
  assert.equal(
    root.querySelectorAll('[data-yolen-attachment-evidence]').length,
    0,
  )
}

function createDom(body) {
  return new JSDOM(
    `<!doctype html><html><body>${body}</body></html>`,
    { url: 'https://web.whatsapp.com/' },
  )
}

test('descreve PDF sem texto comum como evidência capturável', () => {
  const dom = createDom(`
    <div data-pre-plain-text="[10:31, 12/09/2026] Rayane: ">
      <div data-testid="document">
        <span title="GRADE ATUALIZADA EM 12-08-26 (1).pdf">
          GRADE ATUALIZADA EM 12-08-26 (1).pdf
        </span>
      </div>
    </div>
  `)

  const message = dom.window.document.querySelector(
    '[data-pre-plain-text]',
  )

  const evidence = tools.describeAttachmentEvidence(message)

  assert.ok(evidence)
  assert.equal(
    evidence.evidenceText,
    '[Arquivo: GRADE ATUALIZADA EM 12-08-26 (1).pdf]',
  )
  assertDomUntouched(dom.window.document)
})

test('captura PDF renderizado como irmão do data-pre-plain-text', () => {
  const dom = createDom(`
    <div class="message-out" data-id="msg-sibling">
      <div class="bubble-shell">
        <div class="document-card">
          <span>GRADE ATUALIZADA EM 12-08-26 (1).pdf</span>
        </div>
        <div data-pre-plain-text="[10:31, 12/09/2026] Rayane: "></div>
      </div>
    </div>
  `)

  const message = dom.window.document.querySelector(
    '[data-pre-plain-text]',
  )

  assert.equal(
    tools.describeAttachmentEvidence(message)?.evidenceText,
    '[Arquivo: GRADE ATUALIZADA EM 12-08-26 (1).pdf]',
  )
  assertDomUntouched(dom.window.document)
})

test('preserva legenda e acrescenta o arquivo na mesma evidência', () => {
  const dom = createDom(`
    <div data-pre-plain-text="[10:31, 12/09/2026] Rayane: ">
      <span data-testid="selectable-text" class="selectable-text copyable-text">
        Segue a grade atualizada.
      </span>
      <div data-testid="document">
        <span title="GRADE ATUALIZADA EM 12-08-26 (1).pdf">
          GRADE ATUALIZADA EM 12-08-26 (1).pdf
        </span>
      </div>
    </div>
  `)

  const message = dom.window.document.querySelector(
    '[data-pre-plain-text]',
  )

  assert.equal(
    tools.describeAttachmentEvidence(message)?.evidenceText,
    'Segue a grade atualizada.\n[Arquivo: GRADE ATUALIZADA EM 12-08-26 (1).pdf]',
  )
  assertDomUntouched(dom.window.document)
})

test('preserva legenda quando legenda e cartão são irmãos do nó canônico', () => {
  const dom = createDom(`
    <div class="message-out" data-id="msg-caption-sibling">
      <div class="bubble-shell">
        <div data-testid="document">
          <span title="GRADE ATUALIZADA EM 12-08-26 (1).pdf">
            GRADE ATUALIZADA EM 12-08-26 (1).pdf
          </span>
        </div>
        <span data-testid="selectable-text" class="selectable-text copyable-text">
          Segue a grade atualizada.
        </span>
        <div data-pre-plain-text="[10:31, 12/09/2026] Rayane: "></div>
      </div>
    </div>
  `)

  const message = dom.window.document.querySelector(
    '[data-pre-plain-text]',
  )

  assert.equal(
    tools.describeAttachmentEvidence(message)?.evidenceText,
    'Segue a grade atualizada.\n[Arquivo: GRADE ATUALIZADA EM 12-08-26 (1).pdf]',
  )
  assertDomUntouched(dom.window.document)
})

test('não promove simples menção textual de arquivo para anexo enviado', () => {
  const dom = createDom(`
    <div data-pre-plain-text="[10:31, 12/09/2026] Cliente: ">
      <span
        data-testid="selectable-text"
        class="selectable-text copyable-text"
        title="grade.pdf"
      >
        Você consegue me mandar grade.pdf?
      </span>
    </div>
  `)

  const message = dom.window.document.querySelector(
    '[data-pre-plain-text]',
  )

  assert.equal(
    tools.describeAttachmentEvidence(message),
    null,
  )
  assert.equal(
    tools.describeBubbleAttachmentEvidence(message),
    null,
  )
  assertDomUntouched(dom.window.document)
})

test('não contamina mensagem vizinha com anexo de outra bolha', () => {
  const dom = createDom(`
    <section>
      <div class="message-out" data-id="msg-file">
        <div class="bubble-shell">
          <div class="document-card">
            <span>proposta-comercial.pdf</span>
          </div>
          <div data-pre-plain-text="[10:31, 12/09/2026] Rayane: "></div>
        </div>
      </div>
      <div class="message-in" data-id="msg-text">
        <div class="bubble-shell">
          <div data-pre-plain-text="[10:32, 12/09/2026] Cliente: ">
            <span data-testid="selectable-text" class="selectable-text copyable-text">
              Obrigado, recebi.
            </span>
          </div>
        </div>
      </div>
    </section>
  `)

  const messages = dom.window.document.querySelectorAll(
    '[data-pre-plain-text]',
  )

  assert.equal(
    tools.describeBubbleAttachmentEvidence(messages[0])?.evidenceText,
    '[Arquivo: proposta-comercial.pdf]',
  )
  assert.equal(
    tools.describeBubbleAttachmentEvidence(messages[1]),
    null,
  )
  assertDomUntouched(dom.window.document)
})

test('anexo irmão inserido depois do carregamento aparece na próxima leitura, sem duplicar nem escrever no DOM', () => {
  const dom = createDom(`
    <main id="root">
      <div class="message-out" data-id="msg-late">
        <div class="bubble-shell" id="bubble-late">
          <div data-pre-plain-text="[10:31, 12/09/2026] Rayane: "></div>
        </div>
      </div>
    </main>
  `)

  const message = dom.window.document.querySelector(
    '[data-pre-plain-text]',
  )

  assert.equal(tools.describeBubbleAttachmentEvidence(message), null)

  dom.window.document.querySelector('#bubble-late').insertAdjacentHTML(
    'afterbegin',
    `
      <div class="document-card">
        <span>proposta-comercial.pdf</span>
      </div>
    `,
  )

  const first = tools.describeBubbleAttachmentEvidence(message)
  const second = tools.describeBubbleAttachmentEvidence(message)

  assert.equal(first?.evidenceText, '[Arquivo: proposta-comercial.pdf]')
  assert.deepEqual(second, first)
  assertDomUntouched(dom.window.document)
})

test('cartão distante na mesma bolha é descrito pela bolha segura', () => {
  const dom = createDom(`
    <div class="message-out" data-id="msg-distant">
      <div class="document-card"><span>GRADE ATUALIZADA EM 12-08-26 (1).pdf</span></div>
      <div class="l1"><div class="l2"><div class="l3"><div class="l4"><div class="l5"><div class="l6"><div class="l7"><div class="l8">
        <span data-testid="selectable-text" class="selectable-text copyable-text">Segue a grade.</span>
        <div data-pre-plain-text="[10:31, 12/09/2026] Rayane: "></div>
      </div></div></div></div></div></div></div></div>
    </div>
  `)

  const message = dom.window.document.querySelector('[data-pre-plain-text]')

  assert.equal(tools.describeAttachmentEvidence(message), null)
  assert.equal(
    tools.describeBubbleAttachmentEvidence(message)?.evidenceText,
    'Segue a grade.\n[Arquivo: GRADE ATUALIZADA EM 12-08-26 (1).pdf]',
  )
  assertDomUntouched(dom.window.document)
})

test('bolha só de anexo exige arquivo, metadata ou marcador e horário', () => {
  const withMetadata = createDom(`
    <div class="message-out" data-id="msg-pdf">
      <div class="document-card">
        <span>GRADE ATUALIZADA EM 12-08-26 (1).pdf</span>
        <span>1 página • PDF • 221 kB</span>
      </div>
      <span class="message-time">10:31</span>
    </div>
  `)
  const withoutProof = createDom(`
    <div class="message-out" data-id="msg-mention">
      <span>grade.pdf</span>
      <span class="message-time">10:31</span>
    </div>
  `)

  assert.deepEqual(
    tools.describeAttachmentOnlyBubble(
      withMetadata.window.document.querySelector('[data-id]'),
    ),
    {
      fileName: 'GRADE ATUALIZADA EM 12-08-26 (1).pdf',
      time: '10:31',
      evidenceText: '[Arquivo: GRADE ATUALIZADA EM 12-08-26 (1).pdf]',
    },
  )
  assert.equal(
    tools.describeAttachmentOnlyBubble(
      withoutProof.window.document.querySelector('[data-id]'),
    ),
    null,
  )
})
