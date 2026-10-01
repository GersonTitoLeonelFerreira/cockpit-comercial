// MENSAGEM com a leitura completa (HML). Com a leitura, o objetivo e a
// mensagem do motor antigo não aparecem: "não enviar" vira aviso + seção
// da análise; "responder" traz o objetivo e a mensagem da leitura; "Gerar
// mensagem" chama a rota nova (Claude simulado aqui). Texto do modelo só
// por textContent. Textos sintéticos.

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
    notice: null,
    section_text: 'Oi! O acesso já está liberado no app. Qualquer dúvida me chama.',
    recommended_objective: 'Confirmar que o acesso ao app foi liberado.',
    suggested_message: 'Oi! O acesso já está liberado no app. Qualquer dúvida me chama.',
    run_id: 'run-1',
    ...overrides,
  }
}

test('leitura "não enviar": aviso + seção, sem objetivo nem mensagem antigos; Gerar continua disponível', async () => {
  const harness = createHarness()

  harness.controller.syncFullReading(PAYLOAD, noSendView())
  await settle()

  const box = harness.document.querySelector('[data-yolen-seller-message-box]')

  assert.ok(box)
  assert.equal(
    box.querySelector('[data-yolen-fr-text="notice"]').textContent,
    'A leitura recomenda não enviar nada agora',
  )
  assert.equal(
    box.querySelector('[data-yolen-fr-text="section"]').textContent,
    'Não enviar nada agora. A cliente não deixou pergunta.',
  )
  assert.equal(box.querySelectorAll('[data-yolen-seller-message-preset]').length, 0)
  assert.doesNotMatch(box.textContent, /Recomendado pela Yolen/)
  assert.equal(box.querySelector('[data-yolen-full-reading-message-result]'), null)
  assert.ok(box.querySelector('[data-yolen-seller-message-intent]'))

  const generate = box.querySelector('[data-yolen-seller-message-action="generate"]')

  assert.ok(generate)
  assert.equal(generate.disabled, true)
  assert.deepEqual(harness.runtimeCalls, [])
})

test('leitura "responder": objetivo recomendado = acao_resumo e mensagem pronta da leitura', async () => {
  const harness = createHarness()

  harness.controller.syncFullReading(PAYLOAD, sendView())
  await settle()

  const box = harness.document.querySelector('[data-yolen-seller-message-box]')
  const preset = box.querySelector('[data-yolen-seller-message-preset="0"]')

  assert.match(preset.textContent, /^Recomendado pela leitura completa · Confirmar que o acesso ao app foi liberado\.$/)
  assert.equal(
    box.querySelector('[data-yolen-fr-text="message"]').textContent,
    'Oi! O acesso já está liberado no app. Qualquer dúvida me chama.',
  )
  assert.match(box.textContent, /Mensagem sugerida pela leitura/)

  // Incluir no WhatsApp: nunca envia, só preenche o campo vazio.
  box.querySelector('[data-yolen-seller-message-action="insert"]').click()
  await settle()

  assert.equal(harness.composer.textContent, 'Oi! O acesso já está liberado no app. Qualquer dúvida me chama.')
  assert.deepEqual(harness.runtimeCalls, [])
})

test('"Gerar mensagem" com a leitura chama a rota nova com o objetivo do vendedor (nunca o motor antigo)', async () => {
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
  assert.equal(
    harness.document.querySelector('[data-yolen-fr-text="message"]').textContent,
    'Oi! Seu acesso já está liberado.',
  )
  assert.equal(harness.runtimeCalls.some((call) => call.action === 'LOAD_METHOD_GUIDANCE'), false)
})

test('texto do modelo nunca vira HTML', async () => {
  const harness = createHarness()

  harness.controller.syncFullReading(PAYLOAD, sendView({
    section_text: `Seção ${HOSTILE}`,
    recommended_objective: `Objetivo ${HOSTILE}`,
    suggested_message: `Mensagem ${HOSTILE}`,
  }))
  await settle()

  const box = harness.document.querySelector('[data-yolen-seller-message-box]')

  assert.equal(box.querySelectorAll('img').length, 0)
  assert.match(box.querySelector('[data-yolen-fr-text="message"]').textContent, /<img src=x/)
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
