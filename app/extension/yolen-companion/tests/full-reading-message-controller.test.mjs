// MENSAGEM com a leitura completa (HML, rodada 6). Com a leitura, o
// objetivo e a mensagem do motor antigo não aparecem. "responder" abre a
// "Mensagem pronta" (Para: objetivo, campo editável, Incluir/Copiar);
// "não enviar" vira "Nada a enviar agora" + motivo. "Escrever com outro
// objetivo" fica recolhido e chama a rota nova (Claude simulado aqui). O
// objetivo nunca aparece duas vezes. Texto do modelo só por textContent ou
// value. Textos sintéticos.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'

const readSrc = (name) =>
  readFileSync(fileURLToPath(new URL(`../src/${name}`, import.meta.url)), 'utf8')

const controllerSource = readSrc('companion-message-controller.js')
const adapterSource = readSrc('whatsapp-adapter.js')

const PAYLOAD = {
  cycle_id: '20000000-0000-4000-8000-000000000001',
  conversation_key: 'whatsapp:5511900000000',
}

const HOSTILE = '<img src=x onerror="alert(1)">'

function createHarness({ generation = { status: 'ready', message: 'Oi! Seu acesso já está liberado.' } } = {}) {
  const dom = new JSDOM(
    `<!doctype html><html><body>
      <div id="main"><footer><div contenteditable="true" role="textbox"></div></footer></div>
      <div data-yolen-seller-message-mount></div>
    </body></html>`,
    { url: 'https://web.whatsapp.com/', pretendToBeVisual: true },
  )

  const runtimeCalls = []
  const composer = dom.window.document.querySelector('#main footer [contenteditable="true"]')

  dom.window.document.execCommand = (command, _showUi, value) => {
    if (command !== 'insertText') {
      return false
    }

    composer.textContent = value
    composer.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }))
    return true
  }

  const sandbox = {
    window: dom.window,
    chrome: {
      runtime: {
        async sendMessage(message) {
          runtimeCalls.push(message)
          return { ok: true, payload: { ok: true, data: generation } }
        },
      },
    },
    document: dom.window.document,
    navigator: dom.window.navigator,
    MutationObserver: dom.window.MutationObserver,
    InputEvent: dom.window.InputEvent,
    Promise,
    Map,
    Math,
    String,
  }
  sandbox.globalThis = sandbox

  vm.createContext(sandbox)
  vm.runInContext(adapterSource, sandbox, { filename: 'whatsapp-adapter.js' })
  vm.runInContext(controllerSource, sandbox, { filename: 'companion-message-controller.js' })

  const adapter = sandbox.YolenCompanionWhatsAppAdapter.create()
  const controller = sandbox.YolenCompanionMessageController.create({
    insertIntoComposer: adapter.insertTextIntoEmptyComposer,
    getBaseUrl: () => 'https://preview.example',
    platformDisplayName: adapter.platform.displayName,
  })

  return {
    controller,
    composer,
    document: dom.window.document,
    window: dom.window,
    runtimeCalls,
  }
}

async function settle() {
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function noSendView(overrides = {}) {
  return {
    mode: 'no_send',
    objective: null,
    no_send_reason: 'A cliente não deixou pergunta.',
    notice: 'A leitura recomenda não enviar nada agora',
    section_text: 'Não enviar nada agora. A cliente não deixou pergunta.',
    recommended_objective: null,
    suggested_message: null,
    run_id: 'run-1',
    ...overrides,
  }
}

function sendView(overrides = {}) {
  return {
    mode: 'send',
    objective: 'Confirmar que o acesso ao app foi liberado.',
    no_send_reason: null,
    notice: null,
    section_text: 'Oi! O acesso já está liberado no app. Qualquer dúvida me chama.',
    recommended_objective: 'Confirmar que o acesso ao app foi liberado.',
    suggested_message: 'Oi! O acesso já está liberado no app. Qualquer dúvida me chama.',
    run_id: 'run-1',
    ...overrides,
  }
}

const EMOJI = /\p{Extended_Pictographic}/u

test('leitura "não enviar": "Nada a enviar agora" + motivo; "Escrever mesmo assim" recolhido', async () => {
  const harness = createHarness()

  harness.controller.syncFullReading(PAYLOAD, noSendView())
  await settle()

  const box = harness.document.querySelector('[data-yolen-seller-message-box]')
  const card = box.querySelector('[data-yolen-fr-card="no_send"]')

  assert.ok(card)
  assert.equal(card.querySelector('.yolen-fr-title').textContent, 'Nada a enviar agora')
  assert.equal(box.querySelector('[data-yolen-fr-text="reason"]').textContent, 'A cliente não deixou pergunta.')
  assert.equal(box.querySelector('[data-yolen-full-reading-message-result]'), null)
  assert.equal(box.querySelectorAll('[data-yolen-seller-message-preset]').length, 0)
  assert.doesNotMatch(box.textContent, /Recomendado pela Yolen|Objetivo da mensagem/)

  const custom = box.querySelector('details[data-yolen-fr-custom]')

  assert.equal(custom.open, false)
  assert.equal(custom.querySelector('summary').textContent, 'Escrever mesmo assim')
  assert.ok(custom.querySelector('[data-yolen-seller-message-intent]'))

  const generate = custom.querySelector('[data-yolen-seller-message-action="generate"]')

  assert.equal(generate.disabled, true)
  assert.deepEqual(harness.runtimeCalls, [])
})

test('leitura "responder": "Mensagem pronta" com "Para:", campo editável, Incluir e Copiar; objetivo uma vez só', async () => {
  const harness = createHarness()

  harness.controller.syncFullReading(PAYLOAD, sendView())
  await settle()

  const box = harness.document.querySelector('[data-yolen-seller-message-box]')
  const card = box.querySelector('[data-yolen-fr-card="message"]')

  assert.equal(card.querySelector('.yolen-fr-label').textContent, 'Mensagem pronta')
  assert.equal(card.querySelector('.yolen-fr-pill').textContent, 'Da leitura')
  assert.equal(card.querySelector('.yolen-fr-for').textContent, 'Para: confirmar que o acesso ao app foi liberado')

  const draft = card.querySelector('textarea[data-yolen-fr-draft]')

  assert.equal(draft.value, 'Oi! O acesso já está liberado no app. Qualquer dúvida me chama.')
  assert.equal(card.querySelector('[data-yolen-seller-message-action="insert"]').textContent, 'Incluir no WhatsApp')
  assert.equal(card.querySelector('[data-yolen-seller-message-action="copy"]').textContent, 'Copiar')
  assert.equal(card.querySelector('.yolen-fr-note').textContent, 'A Yolen não envia sozinha. Revise antes de mandar.')

  // O objetivo aparece uma vez (no "Para:"), nunca como atalho.
  assert.equal(box.textContent.split('cesso ao app foi liberado').length - 1, 1)
  assert.equal(box.querySelectorAll('[data-yolen-seller-message-preset]').length, 0)
  assert.equal(box.querySelector('details[data-yolen-fr-custom] summary').textContent, 'Escrever com outro objetivo')
  assert.doesNotMatch(box.textContent, EMOJI)

  for (const button of box.querySelectorAll('button')) {
    assert.equal(button.type, 'button')
  }

  // Incluir no WhatsApp: nunca envia, só preenche o campo vazio.
  card.querySelector('[data-yolen-seller-message-action="insert"]').click()
  await settle()

  assert.equal(harness.composer.textContent, 'Oi! O acesso já está liberado no app. Qualquer dúvida me chama.')
  assert.deepEqual(harness.runtimeCalls, [])
})

test('a edição do vendedor é a mensagem incluída, e um render de fundo não apaga o que ele escreveu', async () => {
  const harness = createHarness()

  harness.controller.syncFullReading(PAYLOAD, sendView())
  await settle()

  const draft = harness.document.querySelector('[data-yolen-fr-draft]')

  draft.value = 'Oi! Já liberei seu acesso, me avisa se der certo.'
  draft.dispatchEvent(new harness.window.Event('input', { bubbles: true }))

  // Polling/AGORA chamam de novo com a mesma leitura.
  harness.controller.syncFullReading(PAYLOAD, sendView())
  harness.controller.render()
  await settle()

  const same = harness.document.querySelector('[data-yolen-fr-draft]')

  assert.equal(same, draft)
  assert.equal(same.value, 'Oi! Já liberei seu acesso, me avisa se der certo.')

  same.closest('[data-yolen-seller-message-box]').querySelector('[data-yolen-seller-message-action="insert"]').click()
  await settle()

  assert.equal(harness.composer.textContent, 'Oi! Já liberei seu acesso, me avisa se der certo.')
})

test('"Escrever com outro objetivo" chama a rota nova com o objetivo do vendedor (nunca o motor antigo)', async () => {
  const harness = createHarness()

  harness.controller.syncFullReading(PAYLOAD, noSendView())
  await settle()

  const field = harness.document.querySelector('[data-yolen-seller-message-intent]')

  field.value = 'Quero avisar que o acesso foi liberado.'
  field.dispatchEvent(new harness.window.Event('input', { bubbles: true }))

  harness.document.querySelector('[data-yolen-seller-message-action="generate"]').click()
  await settle()
  await settle()

  assert.equal(harness.runtimeCalls.length, 1)
  assert.equal(harness.runtimeCalls[0].action, 'GENERATE_FULL_READING_MESSAGE')
  assert.deepEqual(JSON.parse(JSON.stringify(harness.runtimeCalls[0].payload)), {
    cycle_id: PAYLOAD.cycle_id,
    conversation_key: PAYLOAD.conversation_key,
    seller_intent: 'Quero avisar que o acesso foi liberado.',
  })

  const card = harness.document.querySelector('[data-yolen-fr-card="message"]')

  assert.equal(card.querySelector('[data-yolen-fr-draft]').value, 'Oi! Seu acesso já está liberado.')
  assert.equal(card.querySelector('.yolen-fr-pill').textContent, 'Outro objetivo')
  assert.equal(card.querySelector('.yolen-fr-for').textContent, 'Para: quero avisar que o acesso foi liberado')
  // "Nada a enviar agora" continua acima: a leitura não muda.
  assert.ok(harness.document.querySelector('[data-yolen-fr-card="no_send"]'))
  assert.equal(harness.runtimeCalls.some((call) => call.action === 'LOAD_METHOD_GUIDANCE'), false)
})

test('texto do modelo nunca vira HTML', async () => {
  const harness = createHarness()

  harness.controller.syncFullReading(PAYLOAD, sendView({
    section_text: `Seção ${HOSTILE}`,
    objective: `Objetivo ${HOSTILE}`,
    recommended_objective: `Objetivo ${HOSTILE}`,
    suggested_message: `Mensagem ${HOSTILE}`,
  }))
  await settle()

  const box = harness.document.querySelector('[data-yolen-seller-message-box]')

  assert.equal(box.querySelectorAll('img').length, 0)
  assert.match(box.querySelector('[data-yolen-fr-draft]').value, /<img src=x/)
  assert.match(box.querySelector('[data-yolen-fr-text="objective"]').textContent, /<img src=x/)

  const noSend = createHarness()

  noSend.controller.syncFullReading(PAYLOAD, noSendView({ no_send_reason: `Motivo ${HOSTILE}` }))
  await settle()

  assert.equal(noSend.document.querySelectorAll('img').length, 0)
  assert.match(noSend.document.querySelector('[data-yolen-fr-text="reason"]').textContent, /<img src=x/)
})

test('sem leitura (null) o modo leitura sai e nada da leitura fica na tela', async () => {
  const harness = createHarness()

  harness.controller.syncFullReading(PAYLOAD, noSendView())
  await settle()
  assert.ok(harness.document.querySelector('[data-yolen-full-reading-message-notice]'))

  harness.controller.syncFullReading(PAYLOAD, null)
  await settle()

  assert.equal(harness.document.querySelector('[data-yolen-full-reading-message-notice]'), null)
  assert.equal(harness.document.querySelector('[data-yolen-seller-message-box]'), null)
})

test('com a leitura, o coaching antigo não vira objetivo recomendado', async () => {
  const harness = createHarness()

  harness.controller.syncAnalysisViewModel(PAYLOAD, {
    coaching_diagnosis: {
      status: 'ready',
      chosen_technique: { id: 'technique.contextual_reengagement' },
      next_action: 'Retomar perguntando se o interesse continua.',
    },
  })
  harness.controller.syncFullReading(PAYLOAD, noSendView())
  await settle()

  const box = harness.document.querySelector('[data-yolen-seller-message-box]')

  assert.doesNotMatch(box.textContent, /interesse continua|microcompromisso|Recomendado pela Yolen/)
})
