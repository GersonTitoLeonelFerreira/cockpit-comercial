import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)
const tools = require('../src/message-mutations.js')

function createDom(body) {
  return new JSDOM(
    `<!doctype html><html><body>${body}</body></html>`,
    { url: 'https://web.whatsapp.com/' },
  )
}

test('materializa PDF sem texto comum como evidência capturável', () => {
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

  assert.equal(
    tools.materializeAttachmentEvidence(message),
    true,
  )

  const evidence = message.querySelector(
    '[data-yolen-attachment-evidence]',
  )

  assert.ok(evidence)
  assert.equal(
    evidence.getAttribute('data-testid'),
    'selectable-text',
  )
  assert.equal(
    evidence.textContent,
    '[Arquivo: GRADE ATUALIZADA EM 12-08-26 (1).pdf]',
  )
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

  tools.materializeAttachmentEvidence(message)

  const evidence = message.querySelector(
    '[data-yolen-attachment-evidence]',
  )

  assert.equal(
    evidence.textContent,
    'Segue a grade atualizada.\n[Arquivo: GRADE ATUALIZADA EM 12-08-26 (1).pdf]',
  )
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
    tools.materializeAttachmentEvidence(message),
    false,
  )
  assert.equal(
    message.querySelector(
      '[data-yolen-attachment-evidence]',
    ),
    null,
  )
})

test('adapter acompanha anexo inserido depois do carregamento sem duplicar evidência', async () => {
  const dom = createDom('<main id="root"></main>')

  const installed =
    tools.installAttachmentEvidenceAdapter(
      dom.window,
    )

  assert.ok(installed)

  dom.window.document.querySelector('#root').insertAdjacentHTML(
    'beforeend',
    `
      <div data-pre-plain-text="[10:31, 12/09/2026] Rayane: ">
        <div data-testid="document">
          <span title="proposta-comercial.pdf">proposta-comercial.pdf</span>
        </div>
      </div>
    `,
  )

  await new Promise((resolve) =>
    dom.window.setTimeout(resolve, 0),
  )

  const message = dom.window.document.querySelector(
    '[data-pre-plain-text]',
  )

  assert.equal(
    message.querySelectorAll(
      '[data-yolen-attachment-evidence]',
    ).length,
    1,
  )
  assert.equal(
    message.querySelector(
      '[data-yolen-attachment-evidence]',
    ).textContent,
    '[Arquivo: proposta-comercial.pdf]',
  )

  installed.scan()

  assert.equal(
    message.querySelectorAll(
      '[data-yolen-attachment-evidence]',
    ).length,
    1,
  )

  installed.observer.disconnect()
})
