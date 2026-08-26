// Carrega panel-stability-runtime.js e editable-field-stability-runtime.js
// (nessa ordem, a mesma do manifest.json) numa sandbox `node:vm` com um DOM
// real fornecido por `jsdom` — o mesmo padrão usado por
// `load-content-script.mjs`, mas isolado só nos dois runtimes de
// estabilidade, sem precisar montar todo o content-script.js real.
//
// Os dois arquivos são IIFEs que se anexam a `document`/`root` assim que
// carregam: não exportam nada além do que já publicam de verdade em
// `root.YolenCompanionPanelStabilityRuntime` /
// `root.YolenCompanionEditableFieldStabilityRuntime`. Os testes observam
// exatamente essa superfície e o DOM resultante.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'

const SRC_DIR = fileURLToPath(new URL('../../src/', import.meta.url))

function readSource(fileName) {
  return readFileSync(`${SRC_DIR}${fileName}`, 'utf8')
}

export const PANEL_ID = 'yolen-companion-panel'

// HTML mínimo de um painel do Companion já montado, com os elementos que os
// dois runtimes de estabilidade reconhecem: o rótulo do lead (usado para
// detectar mudança real de conversa), o textarea de intenção da mensagem, um
// campo de formulário editável (Nome) e um botão de ação.
export function buildPanelHtml({
  leadName = 'Cliente A',
  intentValue = '',
  nameValue = '',
} = {}) {
  return `
    <div class="yolen-lead-name">${leadName}</div>
    <textarea data-yolen-seller-message-intent>${intentValue}</textarea>
    <input data-yolen-field="name" value="${nameValue}" />
    <button type="button" data-yolen-action="submit">Gerar mensagem</button>
    <div class="yolen-filler" style="height:4000px"></div>
  `
}

// `order` permite testar as duas ordens possíveis de patch (panel-stability
// antes ou depois do editable-field), já que a robustez à ordem é uma das
// coisas que este runtime precisa garantir.
export function loadStabilityRuntimes({
  order = [
    'panel-stability-runtime.js',
    'editable-field-stability-runtime.js',
  ],
  panelHtml,
  resolveLead,
} = {}) {
  const dom = new JSDOM(
    '<!doctype html><html><body></body></html>',
    { url: 'https://web.whatsapp.com/', pretendToBeVisual: true },
  )
  const window = dom.window

  if (panelHtml !== undefined) {
    const panel = window.document.createElement('div')
    panel.id = PANEL_ID
    panel.style.overflow = 'auto'
    panel.style.height = '600px'
    panel.innerHTML = panelHtml
    window.document.body.appendChild(panel)
  }

  const sandbox = {
    window,
    document: window.document,
    MutationObserver: window.MutationObserver,
    Element: window.Element,
    Node: window.Node,
    HTMLElement: window.HTMLElement,
    console,
    setTimeout,
    clearTimeout,
    Promise,
    queueMicrotask,
  }
  sandbox.globalThis = sandbox
  sandbox.requestAnimationFrame = (callback) =>
    window.requestAnimationFrame(callback)
  sandbox.cancelAnimationFrame = (handle) =>
    window.cancelAnimationFrame(handle)
  // panel-stability-runtime.js escuta 'focus'/'pageshow' no `root`
  // (globalThis, que na extensão real é a própria `window`). Delegamos para
  // a window real do jsdom para que `dispatch(window, 'focus')` etc chegue
  // até esses listeners.
  sandbox.addEventListener = (...args) => window.addEventListener(...args)
  sandbox.removeEventListener = (...args) => window.removeEventListener(...args)
  sandbox.dispatchEvent = (...args) => window.dispatchEvent(...args)

  if (resolveLead) {
    sandbox.YolenCompanionApi = { resolveLead }
  }

  vm.createContext(sandbox)

  for (const file of order) {
    vm.runInContext(readSource(file), sandbox, { filename: file })
  }

  return {
    dom,
    window,
    document: sandbox.document,
    sandbox,
    getPanel: () => sandbox.document.getElementById(PANEL_ID),
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Os dois runtimes restauram scroll/estado em cima de `queueMicrotask` +
// dois `requestAnimationFrame` encadeados (para sobreviver a reflows que só
// acontecem depois do primeiro frame). Um `setTimeout` curto real é a forma
// mais simples de esperar essas filas esvaziarem sem depender de instrumentar
// o próprio runtime.
export async function flushStabilityQueues(times = 3) {
  for (let i = 0; i < times; i += 1) {
    await sleep(20)
  }
}

export function dispatch(target, type, init = {}) {
  const EventCtor =
    target.defaultView?.Event ??
    target.ownerDocument?.defaultView?.Event ??
    Event
  target.dispatchEvent(
    new EventCtor(type, { bubbles: true, cancelable: true, ...init }),
  )
}
