// STEP 2B.5-D1 — "FECHAR PARIDADE REAL DO COMPANION": carrega o runtime
// REAL do ManyChat (manychat-seller-panel-runtime.js + manychat-panel-
// mount.js + manychat-composer.js) numa sandbox `node:vm` com um DOM real
// (jsdom), na MESMA linha de load-content-script.mjs (WhatsApp) — usado
// pelos testes de integração cross-channel (tests/companion-cross-channel-
// integration.test.mjs) para provar que os dois canais chegam à MESMA
// composição/estado partindo do MESMO fixture de backend, através da
// orquestração REAL de cada plataforma (nunca chamando o renderer puro
// compartilhado diretamente, o que só provaria o renderer, não a
// integração).

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'

const SRC_DIR = fileURLToPath(new URL('../../src/', import.meta.url))

function readSource(fileName) {
  return readFileSync(`${SRC_DIR}${fileName}`, 'utf8')
}

// MESMOS módulos puros/compartilhados que o WhatsApp carrega
// (load-content-script.mjs#DEPENDENCY_FILES), menos os que são
// exclusivamente do WhatsApp (yolen-api.js, message-mutations.js,
// conversation-registration-tools.js, capture-batch.js,
// capture-resilience*.js, lead-enrichment.js) — mais os módulos
// ManyChat-specific (manychat-panel-mount.js, manychat-composer.js) e o
// runtime em si.
const DEPENDENCY_FILES = [
  'companion-client-context-view.js',
  'companion-lead-summary-view.js',
  'companion-seller-information-view.js',
  'companion-reasoning-view.js',
  'companion-seller-workspace-view.js',
  'companion-workspace-runtime.js',
  'companion-lead-summary-controller.js',
  'companion-seller-message-engine.js',
  'companion-conversation-registration-controller.js',
  'lead-enrichment.js',
  'companion-lead-enrichment-controller.js',
  'manychat-panel-mount.js',
  'manychat-composer.js',
]

export function buildManyChatPageHtml() {
  return `<!doctype html><html><body>
    <div data-test-id="chat-messages-list"></div>
    <textarea></textarea>
  </body></html>`
}

// Carrega o runtime ManyChat de verdade e devolve uma API mínima para os
// testes de integração: refreshViewModels/requestAnalysis/etc. (a MESMA
// API pública de createManyChatSellerPanelRuntime), mais acesso ao DOM
// real (para ler o HTML pintado pelo panelMountApi e interagir com o
// composer via cliques reais).
export function loadManyChatRuntime({
  sendMessage,
  getCurrentConversationKey,
  getCycleId,
  getEnrichmentLedgerMessages,
  initialHtml = buildManyChatPageHtml(),
} = {}) {
  const dom = new JSDOM(initialHtml, { url: 'https://app.manychat.com/', pretendToBeVisual: true })

  const sandbox = {
    document: dom.window.document,
    MutationObserver: dom.window.MutationObserver,
    HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
    Event: dom.window.Event,
    InputEvent: dom.window.InputEvent,
    console,
    Promise,
    Map,
    Math,
    String,
    Boolean,
    Number,
    setTimeout,
    clearTimeout,
  }
  sandbox.globalThis = sandbox
  sandbox.window = sandbox

  vm.createContext(sandbox)

  for (const dependency of DEPENDENCY_FILES) {
    vm.runInContext(readSource(dependency), sandbox, { filename: dependency })
  }

  vm.runInContext(readSource('manychat-seller-panel-runtime.js'), sandbox, {
    filename: 'manychat-seller-panel-runtime.js',
  })

  const panelMountApi = sandbox.YolenManyChatPanelMount
  const composerApi = sandbox.YolenManyChatComposer
  const runtimeApi = sandbox.YolenManyChatSellerPanelRuntime

  const runtime = runtimeApi.createManyChatSellerPanelRuntime({
    sendMessage,
    panelMountApi,
    composerApi,
    getCurrentConversationKey,
    getCycleId,
    getEnrichmentLedgerMessages,
  })

  return {
    dom,
    document: dom.window.document,
    runtime,
    panelMountApi,
    composerApi,
    getPanelElement() {
      return dom.window.document.getElementById(panelMountApi.PANEL_ID)
    },
    getPanelHtml() {
      return this.getPanelElement()?.innerHTML ?? ''
    },
  }
}
