import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'

const SRC_DIR = fileURLToPath(new URL('../../src/', import.meta.url))
const RUNTIME_SOURCE = readFileSync(
  `${SRC_DIR}ux8-interaction-consistency-runtime.js`,
  'utf8',
)
const MANIFEST_PATH = fileURLToPath(
  new URL('../../manifest.json', import.meta.url),
)

function runRuntime(html) {
  const dom = new JSDOM(html, {
    url: 'https://web.whatsapp.com/',
    pretendToBeVisual: true,
  })
  const sandbox = {
    window: dom.window,
    document: dom.window.document,
    MutationObserver: dom.window.MutationObserver,
    queueMicrotask,
    console,
  }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  vm.runInContext(
    RUNTIME_SOURCE,
    sandbox,
    {
      filename:
        'ux8-interaction-consistency-runtime.js',
    },
  )

  return {
    dom,
    document: dom.window.document,
  }
}

async function flushDom() {
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await Promise.resolve()
}

test('manifest carrega o guard UX8 depois do seller-message e antes do content-script', () => {
  const manifest = JSON.parse(
    readFileSync(MANIFEST_PATH, 'utf8'),
  )
  const scripts =
    manifest.content_scripts.find((entry) =>
      entry.matches?.includes(
        'https://web.whatsapp.com/*',
      ),
    )?.js ?? []

  const sellerMessageIndex = scripts.indexOf(
    'src/seller-message-runtime.js',
  )
  const guardIndex = scripts.indexOf(
    'src/ux8-interaction-consistency-runtime.js',
  )
  const contentScriptIndex = scripts.indexOf(
    'src/content-script.js',
  )

  assert.ok(sellerMessageIndex >= 0)
  assert.ok(guardIndex > sellerMessageIndex)
  assert.ok(contentScriptIndex > guardIndex)
})

test('click em outra aba libera textarea focada e lock antigo antes do handler da tab', () => {
  const { dom, document } = runRuntime(`
    <!doctype html><html><body>
      <aside id="yolen-companion-panel" data-yolen-ux-build="UX8">
        <div data-yolen-region="seller-area-tabs">
          <button type="button" data-yolen-seller-area="message" aria-selected="true">Mensagem</button>
          <button type="button" data-yolen-seller-area="client" aria-selected="false">Cliente</button>
        </div>
        <div data-yolen-workspace-body>
          <div data-yolen-region="seller-information-architecture" data-yolen-region-action-lock="true">
            <section data-yolen-seller-panel="message">
              <textarea data-yolen-seller-message-intent></textarea>
            </section>
          </div>
        </div>
      </aside>
    </body></html>
  `)

  const textarea = document.querySelector(
    '[data-yolen-seller-message-intent]',
  )
  const clientTab = document.querySelector(
    '[data-yolen-seller-area="client"]',
  )
  const sellerRegion = document.querySelector(
    '[data-yolen-region="seller-information-architecture"]',
  )

  textarea.focus()
  assert.equal(document.activeElement, textarea)

  let activeAtTargetHandler = null
  clientTab.addEventListener('click', () => {
    activeAtTargetHandler = document.activeElement
  })

  clientTab.dispatchEvent(
    new dom.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    }),
  )

  assert.notEqual(
    activeAtTargetHandler,
    textarea,
    'o handler real da tab não pode enxergar a textarea antiga ainda focada',
  )
  assert.notEqual(document.activeElement, textarea)
  assert.equal(
    sellerRegion.dataset.yolenRegionActionLock,
    undefined,
    'troca deliberada de aba libera lock visual antigo',
  )
})

test('clicar na própria aba ativa não tira foco de um campo que o vendedor está editando', () => {
  const { dom, document } = runRuntime(`
    <!doctype html><html><body>
      <aside id="yolen-companion-panel" data-yolen-ux-build="UX8">
        <div data-yolen-region="seller-area-tabs">
          <button type="button" data-yolen-seller-area="message" aria-selected="true">Mensagem</button>
        </div>
        <div data-yolen-workspace-body>
          <div data-yolen-region="seller-information-architecture">
            <textarea data-yolen-seller-message-intent></textarea>
          </div>
        </div>
      </aside>
    </body></html>
  `)

  const textarea = document.querySelector(
    '[data-yolen-seller-message-intent]',
  )
  const messageTab = document.querySelector(
    '[data-yolen-seller-area="message"]',
  )

  textarea.focus()
  messageTab.dispatchEvent(
    new dom.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    }),
  )

  assert.equal(document.activeElement, textarea)
})

test('UX8 remove composer fora do mount dedicado e preserva composer dentro de MENSAGEM', async () => {
  const { document } = runRuntime(`
    <!doctype html><html><body>
      <aside id="yolen-companion-panel" data-yolen-ux-build="UX8">
        <div data-yolen-region="seller-information-architecture">
          <div data-yolen-method-guidance-slot></div>
          <div data-yolen-seller-message-box id="legacy-fallback"></div>
        </div>
      </aside>
    </body></html>
  `)

  await flushDom()

  assert.equal(
    document.getElementById('legacy-fallback'),
    null,
    'UX8 nunca mantém composer no guidanceSlot/AGORA quando o mount dedicado está ausente',
  )

  const panel = document.getElementById(
    'yolen-companion-panel',
  )
  const mount = document.createElement('div')
  mount.setAttribute(
    'data-yolen-seller-message-mount',
    '',
  )
  const validBox = document.createElement('div')
  validBox.id = 'valid-message-box'
  validBox.setAttribute(
    'data-yolen-seller-message-box',
    '',
  )
  mount.appendChild(validBox)
  panel.appendChild(mount)

  await flushDom()

  assert.equal(
    document.getElementById('valid-message-box'),
    validBox,
  )
  assert.equal(validBox.parentElement, mount)
})

test('guard não interfere no fallback legado quando o shell UX8 não está ativo', async () => {
  const { document } = runRuntime(`
    <!doctype html><html><body>
      <aside id="yolen-companion-panel">
        <div data-yolen-method-guidance-slot></div>
        <div data-yolen-seller-message-box id="legacy-box"></div>
      </aside>
    </body></html>
  `)

  await flushDom()

  assert.ok(document.getElementById('legacy-box'))
})
