import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'

const source = readFileSync(
  fileURLToPath(
    new URL(
      '../src/seller-message-runtime.js',
      import.meta.url,
    ),
  ),
  'utf8',
)

test('mensagem só é gerada por ação explícita depois de uma intenção', () => {
  assert.match(
    source,
    /data-yolen-seller-message-action=\\?"generate\\?"/,
  )
  assert.match(source, /seller_intent:/)
  assert.match(source, /operation: 'generate_message'/)
  assert.match(source, /!state\.intent\.trim\(\)/)
})

test('atalhos apenas preenchem intenção e não disparam geração automática', () => {
  const presetBlock = source.slice(
    source.indexOf("if (presetButton)"),
    source.indexOf("const actionButton =", source.indexOf("if (presetButton)")),
  )

  assert.match(presetBlock, /state\.intent = presets\[index\]/)
  assert.doesNotMatch(presetBlock, /requestGeneration/)
})

test('resultado oferece incluir e copiar sem envio automático', () => {
  assert.match(source, /Incluir no WhatsApp/)
  assert.match(source, />Copiar</)
  assert.match(source, /navigator\.clipboard\.writeText/)
  assert.doesNotMatch(source, /sendButton\.click\(/)
  assert.doesNotMatch(source, /composer\.dispatchEvent\([^)]*submit/)
})

test('inserção protege rascunho já existente no WhatsApp', () => {
  assert.match(
    source,
    /O campo do WhatsApp já contém texto\./,
  )
  assert.match(source, /normalize\(composer\.textContent\)/)
})

function createRuntimeHarness({
  composerDraft = '',
  generatedMessage =
    'Podemos conversar amanhã para alinharmos os próximos detalhes?',
  loadLeadSummaryImpl = null,
  generationResponse = null,
} = {}) {
  const dom = new JSDOM(
    `<!doctype html><html><head></head><body>
      <div id="main">
        <footer><div contenteditable="true" role="textbox">${composerDraft}</div></footer>
      </div>
      <div data-yolen-method-guidance-slot>
        <div class="yolen-method-guidance-label">Orientação da Yolen</div>
      </div>
      <input data-yolen-textarea="lead-summary" value="Cliente aceitou continuar a conversa.">
    </body></html>`,
    {
      url: 'https://web.whatsapp.com/',
      pretendToBeVisual: true,
    },
  )

  const runtimeCalls = []
  const copied = []
  let insertCommandCount = 0

  Object.defineProperty(
    dom.window.navigator,
    'clipboard',
    {
      configurable: true,
      value: {
        async writeText(value) {
          copied.push(value)
        },
      },
    },
  )

  const composer = dom.window.document.querySelector(
    '#main footer [contenteditable="true"]',
  )

  dom.window.document.execCommand = (
    command,
    _showUi,
    value,
  ) => {
    insertCommandCount += 1

    if (command !== 'insertText') {
      return false
    }

    composer.textContent = value
    composer.dispatchEvent(
      new dom.window.InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: value,
      }),
    )
    return true
  }

  const api = {
    getBaseUrl() {
      return 'https://cockpit-comercial-vocn.vercel.app'
    },
    async loadLeadSummary(payload) {
      if (loadLeadSummaryImpl) {
        return loadLeadSummaryImpl(payload)
      }

      return {
        ok: true,
        payload: {
          ok: true,
          data: {
            working_summary:
              'Cliente aceitou continuar a conversa.',
            method_guidance: {
              status: 'ready',
              method_name: 'Método publicado',
              stage_name: 'Descoberta',
              next_step:
                'Entender melhor a necessidade.',
            },
          },
        },
      }
    },
  }

  const sandbox = {
    YolenCompanionApi: api,
    chrome: {
      runtime: {
        async sendMessage(message) {
          runtimeCalls.push(message)
          return {
            ok: true,
            payload: {
              ok: true,
              data:
                generationResponse ?? {
                  status: 'ready',
                  message: generatedMessage,
                  error: null,
                },
            },
          }
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
  vm.runInContext(source, sandbox, {
    filename: 'seller-message-runtime.js',
  })

  return {
    api,
    copied,
    composer,
    document: dom.window.document,
    runtimeCalls,
    get insertCommandCount() {
      return insertCommandCount
    },
  }
}

async function settleRuntime() {
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

async function generateMessage(harness) {
  await harness.api.loadLeadSummary({
    cycle_id: 'cycle-1',
    conversation_key: 'whatsapp:5511999999999',
  })
  await settleRuntime()

  const intent = harness.document.querySelector(
    '[data-yolen-seller-message-intent]',
  )
  intent.value = 'Quero marcar uma conversa amanhã.'
  intent.dispatchEvent(
    new harness.document.defaultView.Event(
      'input',
      { bubbles: true },
    ),
  )

  harness.document.querySelector(
    '[data-yolen-seller-message-action="generate"]',
  ).click()
  await settleRuntime()
}

test('Incluir no WhatsApp preenche o composer vazio e nunca envia', async () => {
  const harness = createRuntimeHarness()
  await generateMessage(harness)

  harness.document.querySelector(
    '[data-yolen-seller-message-action="insert"]',
  ).click()
  await settleRuntime()

  assert.match(
    harness.composer.textContent,
    /conversar amanhã/i,
  )
  assert.equal(harness.insertCommandCount, 1)
  assert.deepEqual(
    harness.runtimeCalls.map((call) => call.action),
    ['LOAD_METHOD_GUIDANCE'],
  )
})

test('Incluir no WhatsApp não sobrescreve composer com rascunho', async () => {
  const harness = createRuntimeHarness({
    composerDraft: 'Meu rascunho existente',
  })
  await generateMessage(harness)

  harness.document.querySelector(
    '[data-yolen-seller-message-action="insert"]',
  ).click()
  await settleRuntime()

  assert.equal(
    harness.composer.textContent,
    'Meu rascunho existente',
  )
  assert.equal(harness.insertCommandCount, 0)
  assert.match(
    harness.document.querySelector(
      '[data-yolen-seller-message-box]',
    ).textContent,
    /já contém texto/i,
  )
})

test('Copiar usa apenas o clipboard e preserva o composer', async () => {
  const harness = createRuntimeHarness()
  await generateMessage(harness)

  harness.document.querySelector(
    '[data-yolen-seller-message-action="copy"]',
  ).click()
  await settleRuntime()

  assert.deepEqual(harness.copied, [
    'Podemos conversar amanhã para alinharmos os próximos detalhes?',
  ])
  assert.equal(harness.composer.textContent, '')
  assert.equal(harness.insertCommandCount, 0)
})

test('silêncio válido (status=no_message) não vira erro e não insere nem copia nada', async () => {
  const harness = createRuntimeHarness({
    generationResponse: {
      status: 'no_message',
      message: null,
      error: null,
    },
  })
  await generateMessage(harness)

  const box = harness.document.querySelector(
    '[data-yolen-seller-message-box]',
  )

  assert.doesNotMatch(
    box.textContent,
    /não conseguiu produzir|não foi possível gerar/i,
  )
  assert.match(
    box.textContent,
    /não há uma mensagem necessária agora/i,
  )
  // UX8 FASE D: classes renomeadas para yolen-message-* — no_message
  // continua sem estado de erro nem bloco de ações (Incluir/Copiar).
  assert.doesNotMatch(
    box.innerHTML,
    /yolen-message-status--error/,
  )
  assert.doesNotMatch(
    box.innerHTML,
    /yolen-message-actions/,
  )

  assert.equal(harness.copied.length, 0)
  assert.equal(harness.insertCommandCount, 0)
  assert.equal(harness.composer.textContent, '')
})

test('resposta atrasada de outra conversa não substitui o cliente atual', async () => {
  const pending = new Map()
  const harness = createRuntimeHarness({
    loadLeadSummaryImpl(payload) {
      return new Promise((resolve) => {
        pending.set(payload.conversation_key, resolve)
      })
    },
  })
  const response = (summary) => ({
    ok: true,
    payload: {
      ok: true,
      data: {
        working_summary: summary,
        method_guidance: {
          status: 'not_applicable',
          method_name: 'Método publicado',
          stage_name: null,
          next_step: null,
        },
      },
    },
  })

  const firstLoad = harness.api.loadLeadSummary({
    cycle_id: 'cycle-1',
    conversation_key: 'whatsapp:cliente-a',
  })
  const secondLoad = harness.api.loadLeadSummary({
    cycle_id: 'cycle-1',
    conversation_key: 'whatsapp:cliente-b',
  })

  harness.document.querySelector(
    '[data-yolen-textarea="lead-summary"]',
  ).value = 'Resumo exclusivo do cliente B.'
  pending.get('whatsapp:cliente-b')(
    response('Resumo exclusivo do cliente B.'),
  )
  await secondLoad
  await settleRuntime()

  const intent = harness.document.querySelector(
    '[data-yolen-seller-message-intent]',
  )
  intent.value = 'Quero responder ao cliente B.'
  intent.dispatchEvent(
    new harness.document.defaultView.Event(
      'input',
      { bubbles: true },
    ),
  )

  pending.get('whatsapp:cliente-a')(
    response('Resumo exclusivo do cliente A.'),
  )
  await firstLoad
  await settleRuntime()

  assert.equal(
    harness.document.querySelector(
      '[data-yolen-seller-message-intent]',
    ).value,
    'Quero responder ao cliente B.',
  )

  harness.document.querySelector(
    '[data-yolen-seller-message-action="generate"]',
  ).click()
  await settleRuntime()

  assert.equal(
    harness.runtimeCalls[0].payload.conversation_key,
    'whatsapp:cliente-b',
  )
})


test('troca A -> B remove imediatamente a mensagem de A enquanto B ainda carrega', async () => {
  let resolveConversationB = null

  const response = (summary) => ({
    ok: true,
    payload: {
      ok: true,
      data: {
        working_summary: summary,
        method_guidance: {
          status: 'ready',
          method_name: 'Método publicado',
          stage_name: 'Descoberta',
          next_step:
            'Entender melhor a necessidade.',
        },
      },
    },
  })

  const harness = createRuntimeHarness({
    generatedMessage:
      'Oi Larissa! Posso te ajudar com as dúvidas sobre o sistema.',
    loadLeadSummaryImpl(payload) {
      if (
        payload.conversation_key ===
        'whatsapp:cliente-a'
      ) {
        return Promise.resolve(
          response(
            'Cliente aceitou continuar a conversa.',
          ),
        )
      }

      if (
        payload.conversation_key ===
        'whatsapp:cliente-b'
      ) {
        return new Promise((resolve) => {
          resolveConversationB = resolve
        })
      }

      throw new Error(
        'Conversa inesperada no teste.',
      )
    },
  })

  await harness.api.loadLeadSummary({
    cycle_id: 'cycle-a',
    conversation_key: 'whatsapp:cliente-a',
  })
  await settleRuntime()

  const intent = harness.document.querySelector(
    '[data-yolen-seller-message-intent]',
  )

  intent.value =
    'Quero responder as dúvidas da Larissa.'

  intent.dispatchEvent(
    new harness.document.defaultView.Event(
      'input',
      { bubbles: true },
    ),
  )

  harness.document.querySelector(
    '[data-yolen-seller-message-action="generate"]',
  ).click()

  await settleRuntime()

  assert.match(
    harness.document.querySelector(
      '[data-yolen-seller-message-box]',
    ).textContent,
    /Larissa/,
  )

  const loadConversationB =
    harness.api.loadLeadSummary({
      cycle_id: 'cycle-b',
      conversation_key: 'whatsapp:cliente-b',
    })

  // O contexto A desaparece SINCRONAMENTE, antes de B responder.
  assert.equal(
    harness.document.querySelector(
      '[data-yolen-seller-message-box]',
    ),
    null,
  )

  assert.equal(
    harness.document.querySelector(
      '[data-yolen-seller-message-action="generate"]',
    ),
    null,
  )

  harness.document.querySelector(
    '[data-yolen-textarea="lead-summary"]',
  ).value =
    'Resumo exclusivo do cliente B.'

  assert.equal(
    typeof resolveConversationB,
    'function',
  )

  resolveConversationB(
    response(
      'Resumo exclusivo do cliente B.',
    ),
  )

  await loadConversationB
  await settleRuntime()

  const boxB = harness.document.querySelector(
    '[data-yolen-seller-message-box]',
  )

  assert.ok(boxB)

  assert.doesNotMatch(
    boxB.textContent,
    /Larissa/,
  )

  assert.doesNotMatch(
    boxB.innerHTML,
    /data-yolen-seller-message-action="insert"/,
  )
})
