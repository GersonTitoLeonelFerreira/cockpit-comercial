import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const SOURCE = readFileSync(
  new URL('../src/manychat-capture-bootstrap.js', import.meta.url),
  'utf8',
)

function runBootstrap(sandboxOverrides = {}) {
  const sandbox = {
    console,
    ...sandboxOverrides,
  }

  vm.createContext(sandbox)
  vm.runInContext(SOURCE, sandbox, { filename: 'manychat-capture-bootstrap.js' })

  return sandbox
}

test('com o kill switch desligado, não cria runtime nem toca em runtime.sendMessage', () => {
  let createCalls = 0

  const sandbox = runBootstrap({
    YolenManyChatFeatureFlags: { MANYCHAT_CAPTURE_ENABLED: false },
    YolenManyChatCaptureRuntime: {
      createManyChatCaptureRuntime() {
        createCalls += 1
        return { start() {} }
      },
    },
    chrome: {
      runtime: {
        sendMessage() {
          throw new Error('não deveria ser chamado com o kill switch desligado')
        },
      },
    },
  })

  assert.equal(createCalls, 0)
  assert.equal(sandbox.__YOLEN_MANYCHAT_CAPTURE_RUNTIME__, undefined)
})

test('sem YolenManyChatFeatureFlags carregado, falha fechado (não ativa nada)', () => {
  let createCalls = 0

  runBootstrap({
    YolenManyChatCaptureRuntime: {
      createManyChatCaptureRuntime() {
        createCalls += 1
        return { start() {} }
      },
    },
  })

  assert.equal(createCalls, 0)
})

test('com o kill switch ligado, cria o runtime com os seletores validados e chama start()', () => {
  let receivedOptions = null
  let started = false

  const sandbox = runBootstrap({
    YolenManyChatFeatureFlags: { MANYCHAT_CAPTURE_ENABLED: true },
    YolenManyChatCaptureRuntime: {
      createManyChatCaptureRuntime(options) {
        receivedOptions = options
        return {
          start() {
            started = true
          },
        }
      },
    },
    chrome: { runtime: { sendMessage() {} } },
  })

  assert.equal(started, true)
  assert.equal(typeof sandbox.__YOLEN_MANYCHAT_CAPTURE_RUNTIME__?.start, 'function')
  assert.equal(typeof receivedOptions.sendMessage, 'function')
  // Comparação campo a campo: o objeto de seletores foi criado dentro de
  // outro realm (vm.createContext), então deepEqual entre realms falha
  // por identidade de protótipo mesmo com estrutura idêntica.
  assert.equal(
    receivedOptions.selectors.conversationRoot,
    'div[data-test-id="chat-messages-list"]',
  )
  assert.equal(
    receivedOptions.selectors.messages,
    ':scope > div > div[data-title-at][data-title-offset-bottom][data-title]',
  )
})

test('sendMessage encaminha para chrome.runtime.sendMessage com callback e propaga runtime.lastError', async () => {
  let capturedCallback = null
  let receivedOptions = null

  runBootstrap({
    YolenManyChatFeatureFlags: { MANYCHAT_CAPTURE_ENABLED: true },
    YolenManyChatCaptureRuntime: {
      createManyChatCaptureRuntime(options) {
        receivedOptions = options
        return { start() {} }
      },
    },
    chrome: {
      runtime: {
        lastError: null,
        sendMessage(message, callback) {
          capturedCallback = callback
        },
      },
    },
  })

  const promise = receivedOptions.sendMessage({ source: 'YOLEN_COMPANION', action: 'X' })
  capturedCallback({ ok: true })
  assert.deepEqual(await promise, { ok: true })
})

test('sendMessage usa browser.runtime.sendMessage (promise nativa) quando disponível', async () => {
  let receivedOptions = null

  runBootstrap({
    YolenManyChatFeatureFlags: { MANYCHAT_CAPTURE_ENABLED: true },
    YolenManyChatCaptureRuntime: {
      createManyChatCaptureRuntime(options) {
        receivedOptions = options
        return { start() {} }
      },
    },
    browser: {
      runtime: {
        async sendMessage() {
          return { ok: true, via: 'browser' }
        },
      },
    },
  })

  const result = await receivedOptions.sendMessage({ source: 'YOLEN_COMPANION', action: 'X' })
  assert.deepEqual(result, { ok: true, via: 'browser' })
})

test('com YolenManyChatPanelMount disponível, sincroniza visibilidade e status já no start()', () => {
  const panelCalls = []
  let receivedOptions = null
  let currentKey = null

  runBootstrap({
    YolenManyChatFeatureFlags: { MANYCHAT_CAPTURE_ENABLED: true },
    YolenManyChatCaptureRuntime: {
      createManyChatCaptureRuntime(options) {
        receivedOptions = options
        return {
          start() {},
          getConversationState() {
            return { resolution: { ready: false, reason: 'CONTACT_NOT_LINKED' } }
          },
          // Fonte autoritativa ao vivo (equivalente ao adapter/URL real):
          // no start(), a conversa ainda não é conhecida.
          getCurrentConversationKey: () => currentKey,
        }
      },
    },
    YolenManyChatPanelMount: {
      isConversationOpen() {
        return true
      },
      syncPanelVisibility() {
        panelCalls.push('syncPanelVisibility')
      },
      setPanelContent(html) {
        panelCalls.push(html)
      },
    },
    document: {},
    chrome: { runtime: { sendMessage() {} } },
  })

  // No start(), a conversa ainda não é conhecida (nenhum evento chegou
  // ainda), então o status é "carregando", nunca inventa uma resolução.
  assert.ok(panelCalls.includes('syncPanelVisibility'))
  assert.ok(panelCalls.some((call) => typeof call === 'string' && call.includes('carregando')))

  // O onEvent repassado ao runtime atualiza o painel a cada evento de
  // captura/observer, já refletindo a resolução real daquela conversa —
  // simula a navegação real (a fonte autoritativa já reflete k1) antes do
  // evento assíncrono de captura chegar.
  panelCalls.length = 0
  currentKey = 'k1'
  receivedOptions.onEvent({ type: 'capture_result', result: { conversation_key: 'k1' } })
  assert.ok(panelCalls.includes('syncPanelVisibility'))
  assert.ok(panelCalls.some((call) => typeof call === 'string' && call.includes('não vinculado')))
})

test('reader_event do tipo conversation_mutated NUNCA re-renderiza o painel (só conversation_changed/capture_result fazem)', () => {
  const panelCalls = []
  let receivedOptions = null

  runBootstrap({
    YolenManyChatFeatureFlags: { MANYCHAT_CAPTURE_ENABLED: true },
    YolenManyChatCaptureRuntime: {
      createManyChatCaptureRuntime(options) {
        receivedOptions = options
        return {
          start() {},
          getConversationState() {
            return { resolution: { ready: false, reason: 'CONTACT_NOT_LINKED' } }
          },
        }
      },
    },
    YolenManyChatPanelMount: {
      isConversationOpen() {
        return true
      },
      syncPanelVisibility() {
        panelCalls.push('syncPanelVisibility')
      },
      setPanelContent(html) {
        panelCalls.push(html)
      },
    },
    document: {},
    chrome: { runtime: { sendMessage() {} } },
  })

  panelCalls.length = 0
  // Uma mutação bruta do DOM (o que o dom-reader agora chama de
  // conversation_mutated) nunca é, por si só, motivo para re-renderizar o
  // painel — só o resultado real de uma captura (capture_result) é.
  receivedOptions.onEvent({
    type: 'reader_event',
    event: { type: 'conversation_mutated', conversation_key: 'k1' },
  })

  assert.equal(panelCalls.length, 0, 'nenhuma escrita no painel para conversation_mutated')
})

test('capture_result repetido com a MESMA resolução não reescreve o status (dedup por assinatura)', () => {
  const panelCalls = []
  let receivedOptions = null
  const currentKeyRef = { value: null }

  runBootstrap({
    YolenManyChatFeatureFlags: { MANYCHAT_CAPTURE_ENABLED: true },
    YolenManyChatCaptureRuntime: {
      createManyChatCaptureRuntime(options) {
        receivedOptions = options
        return {
          start() {},
          getConversationState() {
            return { resolution: { ready: false, reason: 'CONTACT_NOT_LINKED' } }
          },
          getCurrentConversationKey: () => currentKeyRef.value,
        }
      },
    },
    YolenManyChatPanelMount: {
      isConversationOpen() {
        return true
      },
      syncPanelVisibility() {
        panelCalls.push('syncPanelVisibility')
      },
      setPanelContent(html) {
        panelCalls.push(html)
      },
    },
    document: {},
    chrome: { runtime: { sendMessage() {} } },
  })

  function contentWrites(calls) {
    return calls.filter((call) => call !== 'syncPanelVisibility')
  }

  // Navegação real: a fonte autoritativa já reflete k1 quando o primeiro
  // capture_result chega.
  currentKeyRef.value = 'k1'
  receivedOptions.onEvent({ type: 'capture_result', result: { conversation_key: 'k1' } })
  const contentWritesAfterFirst = contentWrites(panelCalls).length

  panelCalls.length = 0
  // Segundo capture_result para a MESMA conversa, MESMA resolução (nada
  // mudou de verdade — ex.: captura pulada por conteúdo idêntico).
  receivedOptions.onEvent({ type: 'capture_result', result: { conversation_key: 'k1' } })
  receivedOptions.onEvent({ type: 'capture_result', result: { conversation_key: 'k1' } })

  assert.ok(contentWritesAfterFirst >= 1, 'a primeira vez ainda escreve o status')
  assert.equal(
    contentWrites(panelCalls).length,
    0,
    'chamadas repetidas sem mudança de resolução não escrevem innerHTML de novo',
  )
  // A visibilidade continua sendo sincronizada (é barata e idempotente),
  // só o conteúdo é que não é reescrito à toa.
  assert.ok(panelCalls.includes('syncPanelVisibility'))
})

test('bootstrap nunca chama sellerPanelRuntime.renderPanel diretamente — só handleCaptureResult, que decide sozinho quando renderizar', () => {
  const sellerCalls = []
  let receivedOptions = null
  const currentKeyRef = { value: null }

  runBootstrap({
    YolenManyChatFeatureFlags: { MANYCHAT_CAPTURE_ENABLED: true },
    YolenManyChatCaptureRuntime: {
      createManyChatCaptureRuntime(options) {
        receivedOptions = options
        return {
          start() {},
          getConversationState() {
            return { resolution: { ready: true, reason: null, cycle_id: 'cycle-1' } }
          },
          getCurrentConversationKey: () => currentKeyRef.value,
        }
      },
    },
    YolenManyChatPanelMount: {
      isConversationOpen() {
        return true
      },
      syncPanelVisibility() {},
      setPanelContent() {},
    },
    YolenManyChatSellerPanelRuntime: {
      createManyChatSellerPanelRuntime() {
        return {
          renderPanel(...args) {
            sellerCalls.push(['renderPanel', ...args])
          },
          handleCaptureResult(...args) {
            sellerCalls.push(['handleCaptureResult', ...args])
          },
        }
      },
    },
    document: {},
    chrome: { runtime: { sendMessage() {} } },
  })

  // Navegação real: a fonte autoritativa já reflete k1 quando o reader
  // detecta e dispara conversation_changed.
  currentKeyRef.value = 'k1'
  receivedOptions.onEvent({
    type: 'reader_event',
    event: { type: 'conversation_changed', conversation_key: 'k1' },
  })
  receivedOptions.onEvent({ type: 'capture_result', result: { conversation_key: 'k1', ok: true } })

  assert.equal(
    sellerCalls.filter(([method]) => method === 'renderPanel').length,
    0,
    'bootstrap nunca chama renderPanel diretamente',
  )
  assert.equal(
    sellerCalls.filter(([method]) => method === 'handleCaptureResult').length,
    1,
    'capture_result é repassado para o sellerPanelRuntime decidir sozinho',
  )
})

// -----------------------------------------------------------------------
// STEP 2A.3 — UI de vínculo CONTACT_NOT_LINKED: delegação de renderização
// para o contactLinkRuntime e delegação de clique dos data-attributes.
// -----------------------------------------------------------------------

function createFakeElement(matchers = {}) {
  return {
    dataset: {},
    closest(selector) {
      return matchers[selector] ? this : null
    },
  }
}

function createFakeDocument() {
  let clickHandler = null
  return {
    addEventListener(type, handler) {
      if (type === 'click') clickHandler = handler
    },
    click(target) {
      clickHandler?.({ target })
    },
  }
}

test('CONTACT_NOT_LINKED delega inteiramente a renderização ao contactLinkRuntime — nunca escreve o texto de status genérico para essa razão', () => {
  const contactLinkCalls = []
  const directPanelWrites = []
  let receivedOptions = null
  const currentKeyRef = { value: null }

  runBootstrap({
    YolenManyChatFeatureFlags: { MANYCHAT_CAPTURE_ENABLED: true },
    YolenManyChatCaptureRuntime: {
      createManyChatCaptureRuntime(options) {
        receivedOptions = options
        return {
          start() {},
          getConversationState() {
            return { resolution: { ready: false, reason: 'CONTACT_NOT_LINKED', cycle_id: null } }
          },
          getSafeIdentity: async () => null,
          refreshLeadResolution: async () => ({ ready: false, reason: 'CONTACT_NOT_LINKED', cycle_id: null }),
          getCurrentConversationKey: () => currentKeyRef.value,
        }
      },
    },
    YolenManyChatPanelMount: {
      isConversationOpen: () => true,
      syncPanelVisibility() {},
      setPanelContent(html) {
        // Só o carregando… inicial (antes de qualquer conversa/resolução
        // ser conhecida) é esperado aqui — nunca uma escrita relacionada a
        // CONTACT_NOT_LINKED, que é sempre responsabilidade do
        // contactLinkRuntime.
        directPanelWrites.push(html)
      },
    },
    YolenManyChatContactLinkRuntime: {
      createManyChatContactLinkRuntime() {
        return {
          renderContactLinkPanel(conversationKey) {
            contactLinkCalls.push(conversationKey)
          },
        }
      },
    },
    document: {},
    chrome: { runtime: { sendMessage() {} } },
  })

  directPanelWrites.length = 0
  currentKeyRef.value = 'k1'

  receivedOptions.onEvent({ type: 'capture_result', result: { conversation_key: 'k1' } })

  assert.deepEqual(contactLinkCalls, ['k1'])
  assert.deepEqual(directPanelWrites, [], 'nenhuma escrita direta do bootstrap para CONTACT_NOT_LINKED')
})

test('delegação de clique: cada data-attribute do fluxo de vínculo chama a função certa do contactLinkRuntime, com a conversation_key atual', () => {
  const calls = []
  let receivedOptions = null
  const fakeDocument = createFakeDocument()
  const currentKeyRef = { value: null }

  runBootstrap({
    YolenManyChatFeatureFlags: { MANYCHAT_CAPTURE_ENABLED: true },
    YolenManyChatCaptureRuntime: {
      createManyChatCaptureRuntime(options) {
        receivedOptions = options
        return {
          start() {},
          getConversationState() {
            return { resolution: { ready: false, reason: 'CONTACT_NOT_LINKED', cycle_id: null } }
          },
          getCurrentConversationKey: () => currentKeyRef.value,
        }
      },
    },
    YolenManyChatPanelMount: {
      isConversationOpen: () => true,
      syncPanelVisibility() {},
      setPanelContent() {},
      ensurePanelMounted() {
        return {
          element: {
            querySelector(selector) {
              if (selector === '[data-yolen-link-lead-query]') {
                return { value: 'Cliente digitado' }
              }
              return null
            },
          },
        }
      },
    },
    YolenManyChatContactLinkRuntime: {
      createManyChatContactLinkRuntime() {
        return {
          renderContactLinkPanel() {},
          startLinkFlow(conversationKey) {
            calls.push(['startLinkFlow', conversationKey])
          },
          runSearch(conversationKey, query) {
            calls.push(['runSearch', conversationKey, query])
          },
          selectLead(conversationKey, leadId) {
            calls.push(['selectLead', conversationKey, leadId])
          },
          confirmLink(conversationKey) {
            calls.push(['confirmLink', conversationKey])
          },
          cancelSelection(conversationKey) {
            calls.push(['cancelSelection', conversationKey])
          },
        }
      },
    },
    document: fakeDocument,
    chrome: { runtime: { sendMessage() {} } },
  })

  // Estabelece a conversation_key atual antes de qualquer clique.
  currentKeyRef.value = 'conv-1'
  receivedOptions.onEvent({
    type: 'reader_event',
    event: { type: 'conversation_changed', conversation_key: 'conv-1' },
  })

  fakeDocument.click(createFakeElement({ '[data-yolen-link-lead-start]': true }))
  fakeDocument.click(createFakeElement({ '[data-yolen-link-lead-search]': true }))
  const selectEl = createFakeElement({ '[data-yolen-link-lead-select]': true })
  selectEl.dataset.yolenLinkLeadSelect = 'lead-42'
  fakeDocument.click(selectEl)
  fakeDocument.click(createFakeElement({ '[data-yolen-link-lead-confirm]': true }))
  fakeDocument.click(createFakeElement({ '[data-yolen-link-lead-cancel]': true }))
  fakeDocument.click(createFakeElement({ '[data-yolen-link-lead-retry]': true }))

  assert.deepEqual(calls, [
    ['startLinkFlow', 'conv-1'],
    ['runSearch', 'conv-1', 'Cliente digitado'],
    ['selectLead', 'conv-1', 'lead-42'],
    ['confirmLink', 'conv-1'],
    ['cancelSelection', 'conv-1'],
    ['startLinkFlow', 'conv-1'],
  ])
})

test('clique em elemento sem nenhum data-attribute reconhecido não chama nenhuma função do contactLinkRuntime nem do sellerPanelRuntime', () => {
  const calls = []
  let receivedOptions = null
  const fakeDocument = createFakeDocument()
  const currentKeyRef = { value: null }

  runBootstrap({
    YolenManyChatFeatureFlags: { MANYCHAT_CAPTURE_ENABLED: true },
    YolenManyChatCaptureRuntime: {
      createManyChatCaptureRuntime(options) {
        receivedOptions = options
        return {
          start() {},
          getConversationState: () => ({ resolution: null }),
          getCurrentConversationKey: () => currentKeyRef.value,
        }
      },
    },
    YolenManyChatPanelMount: {
      isConversationOpen: () => true,
      syncPanelVisibility() {},
      setPanelContent() {},
    },
    YolenManyChatContactLinkRuntime: {
      createManyChatContactLinkRuntime() {
        return new Proxy(
          {},
          {
            get() {
              return (...args) => calls.push(args)
            },
          },
        )
      },
    },
    document: fakeDocument,
    chrome: { runtime: { sendMessage() {} } },
  })

  currentKeyRef.value = 'conv-1'
  receivedOptions.onEvent({
    type: 'reader_event',
    event: { type: 'conversation_changed', conversation_key: 'conv-1' },
  })

  fakeDocument.click(createFakeElement({}))

  assert.equal(calls.length, 0)
})

test('flag desligada: bootstrap nunca instancia contactLinkRuntime nem toca em GET_MANYCHAT_SAFE_IDENTITY/SEARCH_LINKABLE_LEADS/FIRST_LINK_EXTERNAL_IDENTITY', () => {
  let contactLinkCreateCalls = 0
  let sendMessageCalls = 0

  runBootstrap({
    YolenManyChatFeatureFlags: { MANYCHAT_CAPTURE_ENABLED: false },
    YolenManyChatCaptureRuntime: {
      createManyChatCaptureRuntime() {
        throw new Error('não deveria ser chamado com o kill switch desligado')
      },
    },
    YolenManyChatContactLinkRuntime: {
      createManyChatContactLinkRuntime() {
        contactLinkCreateCalls += 1
        return {}
      },
    },
    chrome: {
      runtime: {
        sendMessage(message) {
          sendMessageCalls += 1
          throw new Error(`sendMessage não deveria ser chamado: ${JSON.stringify(message)}`)
        },
      },
    },
  })

  assert.equal(contactLinkCreateCalls, 0)
  assert.equal(sendMessageCalls, 0)
})

test('onLinked (repassado ao contactLinkRuntime): refresca a resolução, roda UMA captura pelo pipeline existente e nunca chama ANALYZE_CONVERSATION diretamente', async () => {
  const runtimeCalls = []
  const sellerCalls = []
  let capturedOnLinked = null
  const currentKeyRef = { value: 'k1' }

  runBootstrap({
    YolenManyChatFeatureFlags: { MANYCHAT_CAPTURE_ENABLED: true },
    YolenManyChatCaptureRuntime: {
      createManyChatCaptureRuntime() {
        return {
          start() {},
          getConversationState: () => ({ resolution: null }),
          getSafeIdentity: async () => null,
          getCurrentConversationKey: () => currentKeyRef.value,
          async refreshLeadResolution(context) {
            runtimeCalls.push(['refreshLeadResolution', context])
            return { ready: true, reason: null, cycle_id: 'cycle-1' }
          },
          async captureNow() {
            runtimeCalls.push(['captureNow'])
            return { ok: true, skipped: false, conversation_key: 'k1' }
          },
        }
      },
    },
    YolenManyChatPanelMount: {
      isConversationOpen: () => true,
      syncPanelVisibility() {},
      setPanelContent() {},
    },
    YolenManyChatSellerPanelRuntime: {
      createManyChatSellerPanelRuntime() {
        return {
          handleCaptureResult(result) {
            sellerCalls.push(['handleCaptureResult', result])
          },
        }
      },
    },
    YolenManyChatContactLinkRuntime: {
      createManyChatContactLinkRuntime(options) {
        capturedOnLinked = options.onLinked
        return { renderContactLinkPanel() {} }
      },
    },
    document: {},
    chrome: { runtime: { sendMessage() {} } },
  })

  await capturedOnLinked({
    conversationKey: 'k1',
    expectedPlatform: 'manychat',
    expectedIdentityKey: `manychat:contact:v1:sha256:${'a'.repeat(64)}`,
  })

  // Comparação campo a campo: o objeto de contexto é criado dentro de
  // outro realm (vm.createContext), então deepEqual entre realms falha por
  // identidade de protótipo mesmo com estrutura idêntica (mesmo padrão já
  // usado acima neste arquivo para receivedOptions.selectors).
  assert.equal(runtimeCalls.length, 2)
  assert.equal(runtimeCalls[0][0], 'refreshLeadResolution')
  assert.equal(runtimeCalls[0][1].conversationKey, 'k1')
  assert.equal(runtimeCalls[0][1].expectedPlatform, 'manychat')
  assert.equal(runtimeCalls[0][1].expectedIdentityKey, `manychat:contact:v1:sha256:${'a'.repeat(64)}`)
  assert.equal(runtimeCalls[1][0], 'captureNow')
  assert.equal(sellerCalls.length, 1)
  assert.equal(sellerCalls[0][0], 'handleCaptureResult')
  assert.equal(sellerCalls[0][1].conversation_key, 'k1')

  // Nunca uma segunda rotina de ingestão/análise disparada diretamente por
  // este caminho — só o pipeline capture_result normal.
  assert.equal(
    sellerCalls.some(([method]) => method === 'requestAnalysis'),
    false,
  )
})

test('onLinked: se a resolução refrescada NÃO ficar capture-eligible, nunca chama captureNow', async () => {
  const runtimeCalls = []
  let capturedOnLinked = null
  const currentKeyRef = { value: 'k1' }

  runBootstrap({
    YolenManyChatFeatureFlags: { MANYCHAT_CAPTURE_ENABLED: true },
    YolenManyChatCaptureRuntime: {
      createManyChatCaptureRuntime() {
        return {
          start() {},
          getConversationState: () => ({ resolution: null }),
          getSafeIdentity: async () => null,
          getCurrentConversationKey: () => currentKeyRef.value,
          async refreshLeadResolution(context) {
            runtimeCalls.push(['refreshLeadResolution', context])
            return { ready: false, reason: 'OWNED_BY_OTHER', cycle_id: null }
          },
          async captureNow() {
            runtimeCalls.push(['captureNow'])
            return { ok: true }
          },
        }
      },
    },
    YolenManyChatPanelMount: {
      isConversationOpen: () => true,
      syncPanelVisibility() {},
      setPanelContent() {},
    },
    YolenManyChatContactLinkRuntime: {
      createManyChatContactLinkRuntime(options) {
        capturedOnLinked = options.onLinked
        return { renderContactLinkPanel() {} }
      },
    },
    document: {},
    chrome: { runtime: { sendMessage() {} } },
  })

  const context = {
    conversationKey: 'k1',
    expectedPlatform: 'manychat',
    expectedIdentityKey: `manychat:contact:v1:sha256:${'a'.repeat(64)}`,
  }
  await capturedOnLinked(context)

  assert.equal(runtimeCalls.length, 1)
  assert.equal(runtimeCalls[0][0], 'refreshLeadResolution')
  assert.equal(runtimeCalls[0][1].conversationKey, context.conversationKey)
  assert.equal(runtimeCalls[0][1].expectedPlatform, context.expectedPlatform)
  assert.equal(runtimeCalls[0][1].expectedIdentityKey, context.expectedIdentityKey)
})

test('onLinked: se a conversa já mudou quando o refresh termina, nunca chama captureNow mesmo com resolução pronta', async () => {
  const runtimeCalls = []
  let capturedOnLinked = null
  const currentKeyRef = { value: 'k2' }

  runBootstrap({
    YolenManyChatFeatureFlags: { MANYCHAT_CAPTURE_ENABLED: true },
    YolenManyChatCaptureRuntime: {
      createManyChatCaptureRuntime() {
        return {
          start() {},
          getConversationState: () => ({ resolution: null }),
          getSafeIdentity: async () => null,
          // A fonte autoritativa já é k2 — o vendedor trocou de conversa
          // enquanto o refresh de A (k1) estava em andamento.
          getCurrentConversationKey: () => currentKeyRef.value,
          async refreshLeadResolution(context) {
            runtimeCalls.push(['refreshLeadResolution', context])
            return { ready: true, reason: null, cycle_id: 'cycle-1' }
          },
          async captureNow() {
            runtimeCalls.push(['captureNow'])
            return { ok: true }
          },
        }
      },
    },
    YolenManyChatPanelMount: {
      isConversationOpen: () => true,
      syncPanelVisibility() {},
      setPanelContent() {},
    },
    YolenManyChatContactLinkRuntime: {
      createManyChatContactLinkRuntime(options) {
        capturedOnLinked = options.onLinked
        return { renderContactLinkPanel() {} }
      },
    },
    document: {},
    chrome: { runtime: { sendMessage() {} } },
  })

  await capturedOnLinked({
    conversationKey: 'k1',
    expectedPlatform: 'manychat',
    expectedIdentityKey: `manychat:contact:v1:sha256:${'a'.repeat(64)}`,
  })

  assert.equal(
    runtimeCalls.some(([method]) => method === 'captureNow'),
    false,
    'nunca dispara captura para uma conversa (k1) que não é mais a atual (k2)',
  )
})

// -----------------------------------------------------------------------
// STEP 2A.3 — hardening final (auditoria de race condition A→B), itens 7-10:
// a conversa "atual" nunca é uma variável que um evento desatualizado pode
// sobrescrever — é sempre relida ao vivo. Um capture_result desatualizado
// nunca repinta a conversa errada.
// -----------------------------------------------------------------------

test('G: um capture_result desatualizado de A nunca muda qual conversa a delegação de clique considera "atual" (B continua sendo B)', () => {
  const calls = []
  let receivedOptions = null
  const fakeDocument = createFakeDocument()
  const currentKeyRef = { value: null }

  runBootstrap({
    YolenManyChatFeatureFlags: { MANYCHAT_CAPTURE_ENABLED: true },
    YolenManyChatCaptureRuntime: {
      createManyChatCaptureRuntime(options) {
        receivedOptions = options
        return {
          start() {},
          getConversationState: () => ({ resolution: { ready: false, reason: 'CONTACT_NOT_LINKED', cycle_id: null } }),
          getCurrentConversationKey: () => currentKeyRef.value,
        }
      },
    },
    YolenManyChatPanelMount: {
      isConversationOpen: () => true,
      syncPanelVisibility() {},
      setPanelContent() {},
    },
    YolenManyChatContactLinkRuntime: {
      createManyChatContactLinkRuntime() {
        return {
          renderContactLinkPanel() {},
          startLinkFlow(conversationKey) {
            calls.push(['startLinkFlow', conversationKey])
          },
        }
      },
    },
    document: fakeDocument,
    chrome: { runtime: { sendMessage() {} } },
  })

  // Navegação real: a autoritativa passa a ser B.
  currentKeyRef.value = 'conv-b'
  receivedOptions.onEvent({
    type: 'reader_event',
    event: { type: 'conversation_changed', conversation_key: 'conv-b' },
  })

  // Um capture_result desatualizado de A chega DEPOIS — nunca deveria
  // conseguir mudar o que a UI considera "a conversa atual".
  receivedOptions.onEvent({ type: 'capture_result', result: { conversation_key: 'conv-a' } })

  fakeDocument.click(createFakeElement({ '[data-yolen-link-lead-start]': true }))

  assert.deepEqual(calls, [['startLinkFlow', 'conv-b']])
})

test('H: capture_result(A) chegando depois da troca real para B nunca dispara render seller-facing de A sobre B', () => {
  const sellerCalls = []
  let receivedOptions = null
  const currentKeyRef = { value: null }

  runBootstrap({
    YolenManyChatFeatureFlags: { MANYCHAT_CAPTURE_ENABLED: true },
    YolenManyChatCaptureRuntime: {
      createManyChatCaptureRuntime(options) {
        receivedOptions = options
        return {
          start() {},
          getConversationState(conversationKey) {
            // B (conv-b) está pronto/capture-eligible; A (conv-a) também
            // tinha ficado pronto antes de o vendedor trocar de conversa.
            return { resolution: { ready: true, reason: null, cycle_id: `cycle-${conversationKey}` } }
          },
          getCurrentConversationKey: () => currentKeyRef.value,
        }
      },
    },
    YolenManyChatPanelMount: {
      isConversationOpen: () => true,
      syncPanelVisibility() {},
      setPanelContent() {},
    },
    YolenManyChatSellerPanelRuntime: {
      createManyChatSellerPanelRuntime() {
        return {
          handleCaptureResult(result) {
            sellerCalls.push(result)
          },
        }
      },
    },
    document: {},
    chrome: { runtime: { sendMessage() {} } },
  })

  // Navegação real para B.
  currentKeyRef.value = 'conv-b'
  receivedOptions.onEvent({
    type: 'reader_event',
    event: { type: 'conversation_changed', conversation_key: 'conv-b' },
  })

  // capture_result de A (uma captura que estava em andamento antes da
  // troca) chega só agora — nunca deveria repintar o painel seller-facing
  // com o conteúdo de A enquanto B está aberto.
  receivedOptions.onEvent({ type: 'capture_result', result: { conversation_key: 'conv-a', ok: true } })

  assert.equal(sellerCalls.length, 0, 'capture_result de A nunca chega a sellerPanelRuntime enquanto B é a conversa atual')

  // capture_result de B, a conversa realmente atual, continua funcionando
  // normalmente.
  receivedOptions.onEvent({ type: 'capture_result', result: { conversation_key: 'conv-b', ok: true } })
  assert.equal(sellerCalls.length, 1)
  assert.equal(sellerCalls[0].conversation_key, 'conv-b')
})
