// Pacote de estabilização P0 (FNC-03, FNC-04, MSG-01) — suporte comum dos
// testes focais. Tudo aqui é mecânica física de navegador/canal que o jsdom
// não reproduz sozinho; nenhuma regra de produto é simulada.
//
// - realClick(): um clique de mouse real é pointerdown → mousedown → foco
//   do elemento focável → pointerup → mouseup → click. Os testes E3 antigos
//   só despachavam `click`, e por isso nunca passavam pelos locks
//   pointerdown→click dos runtimes de estabilidade nem pelo evento `focus`.
// - installControlledPolling(): captura os intervalos recorrentes do Core
//   (ticker de AGORA/ANÁLISE/CLIENTE e refresh de sessão, 60 s) para o teste
//   disparar um ciclo de polling sem esperar um minuto de relógio.
// - appendIncomingMessage()/mutateHostWithoutMessage(): mensagem nova
//   confirmada vs. mutação do DOM do canal que não é mensagem (presença,
//   rascunho, relayout), nos dois canais.

import {
  buildMessageHtml,
} from './load-content-script.mjs'
import {
  manyChatMessageHtml,
} from './load-manychat-composition.mjs'

export const POLLING_INTERVAL_MS = 60000

export function realClick(runtime, target) {
  const window = runtime.window
  const PointerCtor = window.PointerEvent ?? window.MouseEvent
  const init = { bubbles: true, cancelable: true, composed: true, button: 0 }

  target.dispatchEvent(new PointerCtor('pointerdown', init))
  target.dispatchEvent(new window.MouseEvent('mousedown', init))

  // O navegador foca o elemento focável no mousedown (botões, abas,
  // campos). O jsdom não faz isso sozinho.
  if (typeof target.focus === 'function' && target.isConnected) {
    target.focus()
  }

  target.dispatchEvent(new PointerCtor('pointerup', init))
  target.dispatchEvent(new window.MouseEvent('mouseup', init))
  target.dispatchEvent(new window.MouseEvent('click', init))
}

// beforeLoad: intercepta setInterval >= 60 s da janela do canal. O callback
// real continua registrado (nada é desligado); o teste só ganha um gatilho
// explícito para rodar o mesmo callback agora.
export function installControlledPolling(dom) {
  const window = dom.window
  const nativeSetInterval = window.setInterval.bind(window)
  const pollingCallbacks = []

  window.setInterval = (callback, delay, ...args) => {
    if (Number(delay) >= POLLING_INTERVAL_MS && typeof callback === 'function') {
      pollingCallbacks.push(() => callback(...args))
    }

    return nativeSetInterval(callback, delay, ...args)
  }

  window.__yolenTestRunPolling = () => {
    for (const callback of pollingCallbacks) callback()
    return pollingCallbacks.length
  }
}

export function runPolling(runtime) {
  return runtime.window.__yolenTestRunPolling()
}

export function pinAutomaticAnalysisDelay(dom, ms) {
  dom.window.__yolenCompanionAutomaticAnalysisMsForTests = ms
}

export function appendIncomingMessage(runtime, { mid, text }) {
  const document = runtime.document

  if (runtime.channel === 'whatsapp') {
    const body = document.querySelector('#conversation-body')
    body.insertAdjacentHTML(
      'beforeend',
      buildMessageHtml({ id: mid, prePlainText: '[20:31, 14/09/2026] Cliente: ', text }),
    )
    return
  }

  const list = document.querySelector('div[data-test-id="chat-messages-list"]')
  list.insertAdjacentHTML(
    'beforeend',
    manyChatMessageHtml({ mid, text, classes: '_typeIn_x', title: '2026-09-14T20:31:00' }),
  )
}

// Mutação do DOM do canal que NÃO é mensagem: presença / "digitando…" /
// prévia na lista lateral / relayout. No WhatsApp o adapter observa o
// documento inteiro: a mutação fica fora do cabeçalho da conversa (que a
// identifica). No ManyChat o leitor observa a lista de mensagens: a mutação
// é um indicador dentro dela que não é mensagem. Nenhuma mensagem nova,
// editada ou apagada.
export function mutateHostWithoutMessage(runtime, label = 'online') {
  const document = runtime.document
  let indicator = document.querySelector('[data-yolen-test-host-presence]')

  if (!indicator) {
    indicator = document.createElement('div')
    indicator.setAttribute('data-yolen-test-host-presence', '')
    const host =
      runtime.channel === 'whatsapp'
        ? document.querySelector('#app')
        : document.querySelector('div[data-test-id="chat-messages-list"]')
    host.appendChild(indicator)
  }

  indicator.textContent = label
}

export function countCalls(runtime, action) {
  return runtime.calls.filter((call) => call.action === action).length
}

export function callCounts(runtime) {
  return {
    GET_ME: countCalls(runtime, 'GET_ME'),
    RESOLVE_LEAD: countCalls(runtime, 'RESOLVE_LEAD'),
    ANALYZE_CONVERSATION: countCalls(runtime, 'ANALYZE_CONVERSATION'),
    LOAD_LEAD_SUMMARY: countCalls(runtime, 'LOAD_LEAD_SUMMARY'),
  }
}

// Espera o fim das filas dos runtimes de estabilidade (microtask,
// setTimeout 0 do editable-field e dois frames da restauração de scroll).
export async function settleStabilityQueues(runtime) {
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => runtime.window.requestAnimationFrame(() => resolve()))
  await new Promise((resolve) => runtime.window.requestAnimationFrame(() => resolve()))
  await new Promise((resolve) => setTimeout(resolve, 20))
}
