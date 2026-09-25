// FASE 5 — resiliência do botão "Analisar"/"Tentar novamente" quando um
// runtime de estabilidade do painel recria o nó sem o listener direto.
// Antes, ux8-interaction-consistency-runtime.js capturava a closure de
// análise interceptando EventTarget.prototype.addEventListener (monkey-patch
// de protótipo do DOM). Agora o Core é dono da ação e mantém uma delegação
// explícita no próprio painel, executada somente para botões não religados.
// Substitui tests/ux8-analysis-action-resilience.test.mjs, que exercitava o
// mecanismo antigo isoladamente.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  analysisCalls,
  buildMessageHtml,
  buildWhatsAppPageHtml,
  defaultLeadResolution,
  loadContentScript,
  waitFor,
} from '../e3-test-support/load-content-script.mjs'

const TITLE = '+55 11 97777-6666'
const PHONE = '5511977776666'
const CYCLE_ID = 'aaaaaaaa-0000-4000-8000-00000000a001'
const ANALYZE_SELECTOR = '[data-yolen-action="analyze-conversation"]'

function load() {
  return loadContentScript({
    initialHtml: buildWhatsAppPageHtml({
      headerTitle: TITLE,
      messagesHtml: buildMessageHtml({
        id: 'msg-1',
        prePlainText: '[10:00, 21/08/2026] Cliente: ',
        text: 'Quero saber o preço do plano anual.',
      }),
    }),
    resolutionsByPhone: {
      [PHONE]: defaultLeadResolution({
        phone: PHONE,
        cycle: { id: CYCLE_ID, status: 'contato', owner_user_id: 'user-1' },
      }),
    },
  })
}

function getPanel(document) {
  return document.getElementById('yolen-companion-panel')
}

function click(element) {
  element.dispatchEvent(
    new element.ownerDocument.defaultView.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    }),
  )
}

async function waitForAnalyzeButton(document) {
  return waitFor(() => getPanel(document)?.querySelector(ANALYZE_SELECTOR))
}

// Reproduz o efeito de uma reaplicação de HTML de região: um botão
// visualmente idêntico, sem propriedades JS e sem listener do Core.
function replaceWithUnwiredClone(button) {
  const clone = button.ownerDocument.createElement('div')
  clone.innerHTML = button.outerHTML
  const replacement = clone.firstElementChild
  button.replaceWith(replacement)
  return replacement
}

test('botão de análise recriado sem listener continua acionando a análise do Core', async () => {
  const { document, calls } = load()

  const original = await waitForAnalyzeButton(document)
  const replaced = replaceWithUnwiredClone(original)

  assert.notEqual(replaced, original)
  assert.equal(replaced.__yolenWiredEvents, undefined)

  const before = analysisCalls(calls).length
  click(replaced)

  await waitFor(() => analysisCalls(calls).length > before)
  assert.equal(analysisCalls(calls).length, before + 1)
})

test('botão ainda ligado pelo Core executa a análise uma única vez (sem delegação duplicada)', async () => {
  const { document, calls } = load()

  const button = await waitForAnalyzeButton(document)
  assert.ok(button.__yolenWiredEvents?.has('click'))

  const before = analysisCalls(calls).length
  click(button)

  await waitFor(() => analysisCalls(calls).length > before)
  await new Promise((resolve) => setTimeout(resolve, 200))
  assert.equal(analysisCalls(calls).length, before + 1)
})

test('cliques fora do botão de análise nunca disparam a análise', async () => {
  const { document, calls } = load()

  await waitForAnalyzeButton(document)
  const before = analysisCalls(calls).length

  click(getPanel(document))
  await new Promise((resolve) => setTimeout(resolve, 200))

  assert.equal(analysisCalls(calls).length, before)
})

test('nenhum runtime do WhatsApp intercepta EventTarget.prototype.addEventListener', async () => {
  const { window } = load()
  await waitForAnalyzeButton(window.document)

  assert.equal(
    window.EventTarget.prototype.addEventListener.name,
    'addEventListener',
  )
})
