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

// Seleção de texto com o mouse num campo de texto, com a semântica do
// navegador que o jsdom não implementa (UI Events; no Firefox,
// nsIFrame::HandlePress/HandleRelease):
// - pointerdown cancelado suprime os eventos de mouse de compatibilidade;
// - a ação padrão do mousedown num campo de texto é focar, posicionar o
//   cursor e iniciar a seleção por arrasto; o arrasto (movimento com o
//   botão pressionado) estende a seleção a partir desse ponto;
// - com o mousedown cancelado (preventDefault) o arrasto nunca começa; no
//   mouseup o Firefox ainda posiciona o cursor no ponto de soltura — por
//   isso um clique simples continua funcionando e só a seleção falha.
// `from`/`to`: posição do texto sob o ponteiro ao pressionar e ao soltar.
export function mouseSelectText(runtime, field, { from, to }) {
  const window = runtime.window
  const PointerCtor = window.PointerEvent ?? window.MouseEvent
  const pressed = { bubbles: true, cancelable: true, composed: true, button: 0, buttons: 1 }
  const released = { ...pressed, buttons: 0 }

  const pointerDownAllowed = field.dispatchEvent(new PointerCtor('pointerdown', pressed))
  const mouseDownAllowed =
    pointerDownAllowed && field.dispatchEvent(new window.MouseEvent('mousedown', pressed))

  let dragging = false

  if (mouseDownAllowed) {
    field.focus()
    field.setSelectionRange(from, from)
    dragging = field.dispatchEvent(new window.Event('selectstart', { bubbles: true, cancelable: true }))
  }

  const step = to >= from ? 1 : -1

  for (let offset = from; offset !== to; ) {
    offset += step
    field.dispatchEvent(new PointerCtor('pointermove', pressed))

    if (pointerDownAllowed) {
      field.dispatchEvent(new window.MouseEvent('mousemove', pressed))
    }

    if (dragging) {
      field.setSelectionRange(Math.min(from, offset), Math.max(from, offset), offset < from ? 'backward' : 'forward')
    }
  }

  field.dispatchEvent(new PointerCtor('pointerup', released))
  const mouseUpAllowed =
    pointerDownAllowed && field.dispatchEvent(new window.MouseEvent('mouseup', released))

  if (!dragging && mouseUpAllowed && runtime.document.activeElement === field) {
    field.setSelectionRange(to, to)
  }

  field.dispatchEvent(new window.MouseEvent('click', released))
}

// Tecla com a ação padrão do navegador sobre o campo focado: texto
// digitado substitui a seleção; Backspace/Delete apagam a seleção (ou um
// caractere, se o cursor estiver colapsado). Dispara `input` como o
// navegador.
export function pressKeyInField(runtime, field, key) {
  const window = runtime.window
  const allowed = field.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))

  if (allowed) {
    let start = field.selectionStart
    let end = field.selectionEnd
    let inputType = 'insertText'
    let text = key

    if (key === 'Backspace' || key === 'Delete') {
      text = ''
      inputType = key === 'Backspace' ? 'deleteContentBackward' : 'deleteContentForward'

      if (start === end) {
        if (key === 'Backspace') start = Math.max(0, start - 1)
        else end = Math.min(field.value.length, end + 1)
      }
    }

    field.setRangeText(text, start, end, 'end')
    field.dispatchEvent(new window.InputEvent('input', { bubbles: true, inputType, data: text || null }))
  }

  field.dispatchEvent(new window.KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }))
}
