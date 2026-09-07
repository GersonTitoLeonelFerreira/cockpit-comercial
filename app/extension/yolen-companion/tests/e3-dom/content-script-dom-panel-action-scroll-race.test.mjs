// Regressão da causa raiz da Fase 13 (painel do Companion mudando de
// posição / pulando quando o vendedor clica em controles).
//
// A causa raiz NÃO era um erro simples de scrollTop: eram DUAS autoridades
// concorrentes decidindo sozinhas quando corrigir o scroll depois de uma
// mutação —
//
//   1) o handler de `click` de panel-stability-runtime.js, que disparava
//      restoreActionVisualAnchor() diretamente; e
//   2) o MutationObserver global de panel-stability-runtime.js, que tratava
//      QUALQUER childList mutation dentro do painel (inclusive a de uma
//      região alheia ao clique, ou a própria mutation resultante do flush
//      que content-script.js já ia aplicar sozinho) como motivo para
//      reiniciar uma cadeia de restauração nova — competindo com quem
//      realmente produziu a mutação.
//
// Mas o efeito mais visível e persistente ao vivo — sobrevivendo aos PRs
// #241/#242/#244/#245, que só refinaram QUAL elemento ancorar e QUANDO
// soltar a âncora quando ela desaparece — era mais sutil: a âncora
// (actionVisualAnchor) nunca EXPIRAVA. Uma vez capturada num pointerdown,
// ela continuava "dona" do scroll indefinidamente, até o vendedor fazer um
// gesto de uma lista fechada (wheel/touchmove/Tab/pointerdown fora da
// ação). Um scroll manual por barra de rolagem ou inércia de trackpad (que
// não disparam esses gestos a cada tick) e qualquer atualização de fundo
// chegando minutos depois do clique (poll de análise, resumo, timestamp)
// eram tratados como "não é navegação real" e reprimidos, puxando o painel
// de volta para o botão antigo.
//
// Este arquivo reproduz esse cenário através do content-script.js REAL
// (não uma simulação isolada de panel-stability-runtime.js) com os
// runtimes de estabilidade carregados na mesma ordem do manifest.json —
// pointerdown -> click -> handler real -> mudança de estado -> renderPanel()
// real -> substituição real de região -> MutationObserver -> microtasks ->
// frames de animação -> scroll.
//
// Limitação declarada (mandato, seção 11): este é o teste de integração
// mais próximo do Firefox real que a infraestrutura atual permite sem um
// navegador de verdade — jsdom + node:vm, sem layout real (por isso as
// posições de getBoundingClientRect() são simuladas via override, como já
// fazia panel-render-stability.test.mjs). Um jsdom verde aqui NÃO é prova
// de que o Firefox real está resolvido; é evidência de que a arquitetura
// (uma única autoridade de scroll, âncora com vida limitada à própria
// transição) para de brigar consigo mesma nesta simulação. A validação
// definitiva no Firefox real segue como responsabilidade da seção 14 do
// mandato (fora do alcance desta suíte).

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMessageHtml,
  buildWhatsAppPageHtml,
  defaultLeadResolution,
  loadContentScript,
  resolveLeadCalls,
  waitFor,
} from '../e3-test-support/load-content-script.mjs'

const HEADER_TITLE = '+55 11 98888-7777'
const PHONE_DIGITS = '5511988887777'

function initialPageHtml() {
  return buildWhatsAppPageHtml({
    headerTitle: HEADER_TITLE,
    messagesHtml: buildMessageHtml({
      id: 'msg-1',
      prePlainText: '[10:15, 21/08/2026] Cliente Teste: ',
      text: 'Ola, bom dia',
    }),
  })
}

function getPanel(document) {
  return document.getElementById('yolen-companion-panel')
}

function dispatch(target, type, init = {}) {
  const EventCtor =
    target.Event ??
    target.defaultView?.Event ??
    target.ownerDocument?.defaultView?.Event ??
    Event
  target.dispatchEvent(new EventCtor(type, { bubbles: true, cancelable: true, ...init }))
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// jsdom não faz layout: getBoundingClientRect() é sempre {0,0,0,0}. Para
// exercitar de verdade o mecanismo de âncora (que decide com base na
// posição na viewport), fixamos uma posição de documento sintética para o
// botão observado e derivamos o "top" na viewport a partir dela e do
// scrollTop atual do painel — o mesmo padrão já usado em
// panel-render-stability.test.mjs.
function mockActionRect(window, panel, selector, documentTop) {
  const original = window.Element.prototype.getBoundingClientRect

  window.Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
    if (this.matches?.(selector)) {
      const top = documentTop - panel.scrollTop
      return {
        x: 0,
        y: top,
        top,
        bottom: top + 40,
        left: 0,
        right: 120,
        width: 120,
        height: 40,
        toJSON() {
          return {}
        },
      }
    }

    return original.call(this)
  }

  return () => {
    window.Element.prototype.getBoundingClientRect = original
  }
}

function makeScrollable(panel, { scrollHeight = 4000, clientHeight = 600 } = {}) {
  Object.defineProperty(panel, 'scrollHeight', { get: () => scrollHeight, configurable: true })
  Object.defineProperty(panel, 'clientHeight', { get: () => clientHeight, configurable: true })
}

test('depois que a correção do próprio clique assenta, um scroll manual tardio não é revertido por uma atualização de fundo não relacionada', async () => {
  const { document, window, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    // Resolução consistente por telefone (não por chamada): evita que a
    // segunda resolução (disparada pelo próprio "refresh" que este teste
    // clica) devolva um resultado diferente do primeiro e acione, por
    // fora do que este teste quer exercitar, a rede de segurança de troca
    // real de conversa de panel-stability-runtime.js (comportamento à
    // parte, já presente antes desta missão).
    resolutionsByPhone: {
      [PHONE_DIGITS]: defaultLeadResolution({ phone: PHONE_DIGITS, status: 'NOT_FOUND', lead: null, cycle: null }),
    },
    withStabilityRuntimes: true,
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('[data-yolen-action="refresh"]')))
  // start() dispara vários renders assíncronos logo na carga (a própria
  // resolução inicial do lead já passa por estados intermediários). Cada um
  // deles agenda sua própria cadeia de restauração (queueMicrotask + rAFs).
  // Sem esperar essa sequência de largada assentar, o scrollTop que este
  // teste define a seguir pode ser sobrescrito por uma cadeia AINDA em voo
  // da carga inicial — uma corrida do próprio teste, não do runtime.
  await sleep(200)

  const panel = getPanel(document)
  makeScrollable(panel)

  const restoreRect = mockActionRect(
    window,
    panel,
    '[data-yolen-action="refresh"]',
    1800,
  )

  try {
    panel.scrollTop = 1375
    dispatch(panel, 'scroll')
    await sleep(30)

    const refreshButton = document.querySelector('[data-yolen-action="refresh"]')
    assert.equal(refreshButton.getBoundingClientRect().top, 425)

    // O clique real: pointerdown captura a âncora, o handler de negócio
    // real (o mesmo wireOnce('click', ...) de content-script.js) roda,
    // muda estado e chama renderPanel() de verdade.
    dispatch(refreshButton, 'pointerdown')
    dispatch(refreshButton, 'click')

    await waitFor(() => resolveLeadCalls(calls).length > 1)
    // Deixa a cadeia de assentamento da âncora (queueMicrotask + 2 rAF)
    // terminar — ela precisa se soltar sozinha ao final desta janela.
    await sleep(80)

    // A correção do próprio clique preservou a posição visual do botão.
    const refreshButtonAfterClick = document.querySelector('[data-yolen-action="refresh"]')
    assert.equal(
      refreshButtonAfterClick.getBoundingClientRect().top,
      425,
      'o próprio clique não pode ter deslocado visualmente o botão que o vendedor clicou',
    )

    // Agora o vendedor rola manualmente para outro ponto — sem wheel/
    // touchmove (o mesmo tipo de evento que uma barra de rolagem arrastada
    // ou inércia de trackpad produzem, sem os gestos que a lista fechada de
    // "isto é navegação real" reconhece).
    const scrollTopAfterManualScroll = 640
    panel.scrollTop = scrollTopAfterManualScroll
    dispatch(panel, 'scroll')
    await sleep(30)

    assert.equal(
      panel.scrollTop,
      scrollTopAfterManualScroll,
      'o scroll manual do vendedor precisa ser aceito imediatamente',
    )

    // Uma atualização de fundo TOTALMENTE alheia a esse clique chega agora
    // — outro refresh, disparando renderPanel() de novo. Antes da correção
    // da causa raiz, a âncora do clique anterior continuava viva (nada a
    // tinha liberado) e o MutationObserver reagia à mutation resultante
    // puxando o painel de volta para o botão antigo.
    dispatch(document.querySelector('[data-yolen-action="refresh"]'), 'click')
    await waitFor(() => resolveLeadCalls(calls).length > 2)
    await sleep(80)

    assert.equal(
      panel.scrollTop,
      scrollTopAfterManualScroll,
      'uma atualização de fundo não relacionada não pode puxar o painel de volta para um clique antigo já assentado',
    )
  } finally {
    restoreRect()
  }
})

test('durante a janela de assentamento do próprio clique, a correção por âncora ainda funciona (não é uma regressão do mecanismo)', async () => {
  const { document, window, calls } = loadContentScript({
    initialHtml: initialPageHtml(),
    resolutionsByPhone: {
      [PHONE_DIGITS]: defaultLeadResolution({ phone: PHONE_DIGITS, status: 'NOT_FOUND', lead: null, cycle: null }),
    },
    withStabilityRuntimes: true,
  })

  await waitFor(() => resolveLeadCalls(calls).length > 0)
  await waitFor(() => Boolean(document.querySelector('[data-yolen-action="refresh"]')))
  // start() dispara vários renders assíncronos logo na carga (a própria
  // resolução inicial do lead já passa por estados intermediários). Cada um
  // deles agenda sua própria cadeia de restauração (queueMicrotask + rAFs).
  // Sem esperar essa sequência de largada assentar, o scrollTop que este
  // teste define a seguir pode ser sobrescrito por uma cadeia AINDA em voo
  // da carga inicial — uma corrida do próprio teste, não do runtime.
  await sleep(200)

  const panel = getPanel(document)
  makeScrollable(panel)

  const restoreRect = mockActionRect(
    window,
    panel,
    '[data-yolen-action="refresh"]',
    1800,
  )

  try {
    panel.scrollTop = 1375
    dispatch(panel, 'scroll')
    await sleep(30)

    const refreshButton = document.querySelector('[data-yolen-action="refresh"]')
    assert.equal(refreshButton.getBoundingClientRect().top, 425)

    dispatch(refreshButton, 'pointerdown')
    dispatch(refreshButton, 'click')

    await waitFor(() => resolveLeadCalls(calls).length > 1)
    await sleep(80)

    assert.equal(
      document.querySelector('[data-yolen-action="refresh"]').getBoundingClientRect().top,
      425,
      'o botão clicado precisa continuar na mesma altura de viewport depois do próprio ciclo de render que ele causou',
    )
  } finally {
    restoreRect()
  }
})
