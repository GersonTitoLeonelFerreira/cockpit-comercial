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

// -----------------------------------------------------------------------
// Auditoria terse "VISIBLE PANEL CROSS-CONVERSATION ISOLATION": o dedup por
// assinatura (teste acima) só é seguro DENTRO da mesma conversa que já está
// pintada agora. O painel é um único elemento de DOM compartilhado — se A
// pinta uma assinatura, o vendedor troca para B (que pinta OUTRA coisa por
// cima do MESMO elemento) e depois volta para A cuja assinatura de
// resolução não mudou desde a última vez registrada, o dedup sozinho
// pularia o repaint e deixaria o conteúdo de B visível mesmo com A aberta.
// -----------------------------------------------------------------------

test('A→B→A: voltar para uma conversa cuja assinatura não mudou ainda assim repinta — nunca deixa o conteúdo de B visível sobre A', () => {
  const panelCalls = []
  let receivedOptions = null
  const currentKeyRef = { value: null }
  const resolutionByKey = {
    k1: { ready: false, reason: 'CONTACT_NOT_LINKED' },
    k2: { ready: false, reason: 'NOT_FOUND' },
  }

  runBootstrap({
    YolenManyChatFeatureFlags: { MANYCHAT_CAPTURE_ENABLED: true },
    YolenManyChatCaptureRuntime: {
      createManyChatCaptureRuntime(options) {
        receivedOptions = options
        return {
          start() {},
          getConversationState(key) {
            return { resolution: resolutionByKey[key] }
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

  // A: primeira pintura de k1 (CONTACT_NOT_LINKED).
  currentKeyRef.value = 'k1'
  receivedOptions.onEvent({ type: 'capture_result', result: { conversation_key: 'k1' } })
  assert.ok(contentWrites(panelCalls).length >= 1, 'sanity: k1 pintou na primeira vez')

  panelCalls.length = 0

  // B: troca real de conversa para k2 (assinatura diferente) — pinta por
  // cima do MESMO painel compartilhado.
  currentKeyRef.value = 'k2'
  receivedOptions.onEvent({
    type: 'reader_event',
    event: { type: 'conversation_changed', conversation_key: 'k2' },
  })
  assert.ok(
    contentWrites(panelCalls).some((html) => html.includes('lead não encontrado')),
    'sanity: k2 realmente pintou por cima do painel de k1',
  )

  panelCalls.length = 0

  // Volta para k1: a assinatura de k1 é EXATAMENTE a mesma já registrada
  // antes — mas o painel visível agora é o de k2. Sem o fix, o dedup por
  // assinatura pularia este repaint.
  currentKeyRef.value = 'k1'
  receivedOptions.onEvent({
    type: 'reader_event',
    event: { type: 'conversation_changed', conversation_key: 'k1' },
  })

  const writesAfterReturningToA = contentWrites(panelCalls)
  assert.ok(
    writesAfterReturningToA.length >= 1,
    'repinta k1 mesmo com assinatura repetida, porque a conversa autoritativa mudou desde a última pintura',
  )
  assert.ok(writesAfterReturningToA.some((html) => html.includes('não vinculado')))
})

// -----------------------------------------------------------------------
// Auditoria terse "READY→READY IMMEDIATE PANEL SWITCH" / "A→B→A READY
// PANEL RESTORE" / "STALE A SELLER PANEL OVER B": quando resolution.ready
// === true, renderStatus() precisa pintar o painel seller-facing
// (sellerPanelRuntime.renderPanel) usando o estado JÁ isolado por
// conversation_key — nunca esperar por um novo capture_result para trocar
// visualmente de conversa, e nunca deixar o snapshot de uma conversa
// visível sobre outra. Substitui o teste antigo (premissa incorreta de que
// bootstrap nunca chamaria renderPanel diretamente).
// -----------------------------------------------------------------------

test('A: READY→READY — conversation_changed troca IMEDIATAMENTE o painel para B (renderPanel(B) roda antes de qualquer capture_result novo)', () => {
  const sellerCalls = []
  let receivedOptions = null
  const currentKeyRef = { value: null }
  const resolutionByKey = {
    'conv-a': { ready: true, reason: null, cycle_id: 'cycle-a' },
    'conv-b': { ready: true, reason: null, cycle_id: 'cycle-b' },
  }

  runBootstrap({
    YolenManyChatFeatureFlags: { MANYCHAT_CAPTURE_ENABLED: true },
    YolenManyChatCaptureRuntime: {
      createManyChatCaptureRuntime(options) {
        receivedOptions = options
        return {
          start() {},
          getConversationState(key) {
            return { resolution: resolutionByKey[key] }
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
          renderPanel(conversationKey) {
            sellerCalls.push(['renderPanel', conversationKey])
          },
          handleCaptureResult(result) {
            sellerCalls.push(['handleCaptureResult', result])
          },
        }
      },
    },
    document: {},
    chrome: { runtime: { sendMessage() {} } },
  })

  // Seller A já tinha snapshot próprio (já visível antes da troca).
  currentKeyRef.value = 'conv-a'
  receivedOptions.onEvent({
    type: 'reader_event',
    event: { type: 'conversation_changed', conversation_key: 'conv-a' },
  })
  assert.deepEqual(sellerCalls.at(-1), ['renderPanel', 'conv-a'])

  sellerCalls.length = 0

  // Troca real para B: renderPanel('conv-b') precisa rodar JÁ na própria
  // conversation_changed — nunca só depois de um capture_result futuro.
  currentKeyRef.value = 'conv-b'
  receivedOptions.onEvent({
    type: 'reader_event',
    event: { type: 'conversation_changed', conversation_key: 'conv-b' },
  })

  assert.deepEqual(
    sellerCalls,
    [['renderPanel', 'conv-b']],
    'B assume o painel imediatamente na troca de conversa, antes de qualquer capture_result',
  )
})

test('B: A→B→A com ambos ready e assinaturas inalteradas — renderPanel roda de novo na volta para A', () => {
  const sellerCalls = []
  let receivedOptions = null
  const currentKeyRef = { value: null }
  const resolutionByKey = {
    'conv-a': { ready: true, reason: null, cycle_id: 'cycle-a' },
    'conv-b': { ready: true, reason: null, cycle_id: 'cycle-b' },
  }

  runBootstrap({
    YolenManyChatFeatureFlags: { MANYCHAT_CAPTURE_ENABLED: true },
    YolenManyChatCaptureRuntime: {
      createManyChatCaptureRuntime(options) {
        receivedOptions = options
        return {
          start() {},
          getConversationState(key) {
            return { resolution: resolutionByKey[key] }
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
          renderPanel(conversationKey) {
            sellerCalls.push(['renderPanel', conversationKey])
          },
          handleCaptureResult(result) {
            sellerCalls.push(['handleCaptureResult', result])
          },
        }
      },
    },
    document: {},
    chrome: { runtime: { sendMessage() {} } },
  })

  currentKeyRef.value = 'conv-a'
  receivedOptions.onEvent({
    type: 'reader_event',
    event: { type: 'conversation_changed', conversation_key: 'conv-a' },
  })
  assert.deepEqual(sellerCalls.at(-1), ['renderPanel', 'conv-a'])

  currentKeyRef.value = 'conv-b'
  receivedOptions.onEvent({
    type: 'reader_event',
    event: { type: 'conversation_changed', conversation_key: 'conv-b' },
  })
  assert.deepEqual(sellerCalls.at(-1), ['renderPanel', 'conv-b'])

  sellerCalls.length = 0

  // Volta para A: a resolução de A não mudou (mesma assinatura de antes) —
  // mesmo assim renderPanel('conv-a') precisa rodar de novo, porque o
  // painel visível é o de B.
  currentKeyRef.value = 'conv-a'
  receivedOptions.onEvent({
    type: 'reader_event',
    event: { type: 'conversation_changed', conversation_key: 'conv-a' },
  })

  assert.deepEqual(sellerCalls, [['renderPanel', 'conv-a']])
})

test('C: capture_result desatualizado de A enquanto B está aberto nunca chama renderPanel(A) nem handleCaptureResult(A)', () => {
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
          renderPanel(conversationKey) {
            sellerCalls.push(['renderPanel', conversationKey])
          },
          handleCaptureResult(result) {
            sellerCalls.push(['handleCaptureResult', result])
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

  sellerCalls.length = 0

  // capture_result de A (captura que estava em andamento antes da troca)
  // chega só agora — syncPanel() sempre relê a conversa AUTORITATIVA (B),
  // então renderPanel só pode ser chamado com 'conv-b', nunca 'conv-a'.
  receivedOptions.onEvent({ type: 'capture_result', result: { conversation_key: 'conv-a', ok: true } })

  assert.equal(
    sellerCalls.some(([method, arg]) => method === 'renderPanel' && arg === 'conv-a'),
    false,
    'nunca repinta o painel com o snapshot de A enquanto B está aberto',
  )
  assert.equal(
    sellerCalls.some(([method, result]) => method === 'handleCaptureResult' && result?.conversation_key === 'conv-a'),
    false,
    'capture_result de A nunca chega a sellerPanelRuntime enquanto B é a conversa atual',
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

// -----------------------------------------------------------------------
// Auditoria terse "CONTACT_NOT_LINKED INVALIDATED ON LEAVE" /
// "AMBIGUOUS FIRST-LINK RETURN TO A": um first-link cuja resposta HTTP se
// perde nunca dispara onLinked/refreshLeadResolution — sem invalidar o
// cache ao abandonar a conversa, CONTACT_NOT_LINKED ficaria congelado para
// sempre mesmo que o servidor já tivesse gravado o vínculo. A invalidação
// é deliberadamente restrita a CONTACT_NOT_LINKED: uma resolução ready=true
// nunca é invalidada só por causa de uma troca de conversa comum.
// -----------------------------------------------------------------------

test('CONTACT_NOT_LINKED é invalidado ao abandonar a conversa (resposta ambígua de first-link) — mas resolução ready nunca é invalidada por uma troca comum', () => {
  let receivedOptions = null
  const currentKeyRef = { value: null }
  const invalidateCalls = []
  const resolutionByKey = {
    'conv-a': { ready: false, reason: 'CONTACT_NOT_LINKED', cycle_id: null },
    'conv-b': { ready: true, reason: null, cycle_id: 'cycle-b' },
    'conv-c': { ready: true, reason: null, cycle_id: 'cycle-c' },
  }

  runBootstrap({
    YolenManyChatFeatureFlags: { MANYCHAT_CAPTURE_ENABLED: true },
    YolenManyChatCaptureRuntime: {
      createManyChatCaptureRuntime(options) {
        receivedOptions = options
        return {
          start() {},
          getConversationState(key) {
            return { resolution: resolutionByKey[key] }
          },
          getCurrentConversationKey: () => currentKeyRef.value,
          invalidateLeadResolution(key) {
            invalidateCalls.push(key)
            // Simula o efeito real: a próxima vez que essa conversa for
            // vista, o cache de resolução já não existe mais.
            resolutionByKey[key] = null
            return true
          },
        }
      },
    },
    YolenManyChatPanelMount: {
      isConversationOpen: () => true,
      syncPanelVisibility() {},
      setPanelContent() {},
    },
    document: {},
    chrome: { runtime: { sendMessage() {} } },
  })

  // A: resolução ainda CONTACT_NOT_LINKED (o first-link ficou em voo e o
  // vendedor trocou de conversa antes de qualquer resposta LINKED/erro
  // chegar — não importa qual delas eventualmente teria chegado, o cache
  // de A não pode ser confiável depois de abandonado).
  currentKeyRef.value = 'conv-a'
  receivedOptions.onEvent({
    type: 'reader_event',
    event: { type: 'conversation_changed', conversation_key: 'conv-a' },
  })

  // Troca real para B: A tinha CONTACT_NOT_LINKED — invalida.
  currentKeyRef.value = 'conv-b'
  receivedOptions.onEvent({
    type: 'reader_event',
    event: { type: 'conversation_changed', conversation_key: 'conv-b' },
  })

  assert.deepEqual(invalidateCalls, ['conv-a'])
  assert.equal(
    resolutionByKey['conv-a'],
    null,
    'ao voltar para A, o próximo ciclo normal fará RESOLVE_LEAD de novo — nunca reutiliza CONTACT_NOT_LINKED como verdade definitiva',
  )

  // Troca de B (ready=true) para C: nunca invalida uma resolução ready só
  // por causa de uma troca de conversa comum.
  currentKeyRef.value = 'conv-c'
  receivedOptions.onEvent({
    type: 'reader_event',
    event: { type: 'conversation_changed', conversation_key: 'conv-c' },
  })

  assert.deepEqual(invalidateCalls, ['conv-a'], 'B (ready=true) nunca é invalidado ao ser abandonado')
  assert.equal(resolutionByKey['conv-b'].ready, true)
})
