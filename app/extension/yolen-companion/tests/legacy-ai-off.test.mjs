// Rodada 7 (economia de créditos): com a leitura completa no painel (HML,
// capability full_reading_panel do resolve-lead, só com a flag ligada), a
// extensão não dispara nenhuma chamada de IA do caminho antigo: análise
// stateful (automática, manual e retry), resumo do lead, geração antiga da
// MENSAGEM (method-guidance) e "Registrar conversa". Os controllers reais
// rodam com APIs falsas que contam as chamadas. Sem a flag, tudo igual.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)

const readSrc = (name) =>
  readFileSync(fileURLToPath(new URL(`../src/${name}`, import.meta.url)), 'utf8')

// ---------------------------------------------------------------------------
// Análise stateful (companion-analysis-controller.js)
// ---------------------------------------------------------------------------

function createAnalysisHarness({ legacyAiDisabled }) {
  const calls = { analyze: 0, status: 0 }
  const timers = []

  const window = {
    setTimeout(fn) {
      timers.push(fn)
      return timers.length
    },
    clearTimeout() {},
    YolenCompanionApi: {
      async analyzeConversation() {
        calls.analyze += 1
        return { ok: true, payload: { ok: true, data: { deep_analysis: { analysis_job_id: 'job-1', status: 'succeeded', message_watermark: 'wm' } } } }
      },
      async getAnalysisJobStatus() {
        calls.status += 1
        return { ok: true, payload: { ok: true, data: { analysis_job_id: 'job-1', status: 'succeeded', result: { summary: 'ok' } } } }
      },
      async loadDecisionState() { return { ok: false, payload: { ok: false } } },
      async loadAnalysisViewModel() { return { ok: false, payload: { ok: false } } },
    },
  }

  const sandbox = {
    window,
    Date,
    Promise,
    Map,
    Set,
    Math,
    JSON,
    Number,
    String,
    Object,
    Array,
    Error,
    console,
    YolenCompanionConversationRegistrationTools: {
      shouldApplyConversationRegistrationResult: () => true,
    },
  }
  sandbox.globalThis = sandbox

  vm.createContext(sandbox)
  vm.runInContext(readSrc('companion-analysis-controller.js'), sandbox, { filename: 'companion-analysis-controller.js' })

  const ctx = {
    state: {
      connected: true,
      isSelfConversation: false,
      companyId: 'company-a',
      leadResolutionOutcome: { workspace_ready: true },
    },
    isLegacyAiDisabled: () => legacyAiDisabled,
    messageLedgerMutationRevision: 0,
    messageLedgerRequiresRebase: false,
    analysisViewModelRequestSequence: 0,
    buildConversationFingerprint: (text) => `fp:${text}`,
    buildConversationTextFromMessages: (messages) => messages.map((message) => message.text).join('\n'),
    getCanonicalResolutionCycleId: () => 'cycle-1',
    getCaptureConversationKey: () => 'phone:5511900000000',
    getComposerText: () => '',
    getCurrentConversationFingerprint: () => 'fp:Oi, quero saber o preço.',
    getPendingAudioCountForCurrentConversation: () => 0,
    getSelectedChatActivitySnapshot: () => null,
    getStructuredMessagesForAnalysis: () => [{ direction: 'incoming', text: 'Oi, quero saber o preço.' }],
    registerSuggestionShownTelemetry: () => {},
    renderPanel: () => {},
    updatePreSendAssessmentFromDraft: () => {},
    rememberLastKnownClientCommercialReadingIfPresent: () => ({}),
    loadCustomerViewModelForCurrentCycle: async () => {},
  }

  const controller = sandbox.YolenCompanionAnalysisController.create(ctx)

  async function runTimers() {
    for (let round = 0; round < 5; round += 1) {
      const pending = timers.splice(0)

      for (const fn of pending) {
        await fn()
      }

      for (let index = 0; index < 20; index += 1) {
        await Promise.resolve()
      }
    }
  }

  return { calls, controller, ctx, runTimers }
}

test('análise antiga: com a leitura completa, nem manual, nem retry, nem automática chamam a fila de IA', async () => {
  const harness = createAnalysisHarness({ legacyAiDisabled: true })

  await harness.controller.analyzeCurrentConversation()
  await harness.controller.analyzeCurrentConversation({ retryFailedJob: true })
  await harness.controller.analyzeCurrentConversation({ automatic: true })
  harness.controller.scheduleAutomaticAnalysis({ reason: 'mensagem nova' })
  await harness.runTimers()

  assert.deepEqual(harness.calls, { analyze: 0, status: 0 })
  assert.equal(harness.ctx.state.conversationAnalysisLoading ?? false, false)
})

test('análise antiga: sem a leitura completa (flag desligada) continua como hoje', async () => {
  const harness = createAnalysisHarness({ legacyAiDisabled: false })

  await harness.controller.analyzeCurrentConversation()
  await harness.runTimers()

  assert.equal(harness.calls.analyze, 1)
})

// ---------------------------------------------------------------------------
// Resumo do lead (companion-lead-summary-controller.js)
// ---------------------------------------------------------------------------

function createSummaryHarness({ legacyAiDisabled }) {
  let state = {}
  let loads = 0

  globalThis.window = {
    YolenCompanionApi: {
      async loadLeadSummary() {
        loads += 1
        return { ok: true, payload: { ok: true, data: { working_summary: 'Resumo.' } } }
      },
    },
  }

  const controller = require('../src/companion-lead-summary-controller.js').create({
    getCanonicalResolutionCycleId: () => 'cycle-1',
    getCaptureConversationKey: () => 'phone:5511900000000',
    getLeadSummarySnapshotSignature: () => 'snapshot',
    leadSummaryViewTools: { renderLeadSummarySection: () => '' },
    messageController: { clear() {}, syncContext() {} },
    renderPanel() {},
    isLegacyAiDisabled: () => legacyAiDisabled,
    get state() {
      return state
    },
    set state(value) {
      state = value
    },
  })

  return { controller, getState: () => state, get loads() { return loads } }
}

test('resumo do lead: com a leitura completa não é pedido (nenhuma chamada de IA por carga do painel)', async () => {
  const harness = createSummaryHarness({ legacyAiDisabled: true })

  await harness.controller.loadCompanionLeadSummaryForCurrentCycle()
  await harness.controller.loadCompanionLeadSummaryForCurrentCycle()

  assert.equal(harness.loads, 0)
  assert.equal(harness.getState().companionLeadSummary?.status ?? 'idle', 'idle')
})

test('resumo do lead: sem a leitura completa, carrega como hoje', async () => {
  const harness = createSummaryHarness({ legacyAiDisabled: false })

  await harness.controller.loadCompanionLeadSummaryForCurrentCycle()

  assert.equal(harness.loads, 1)
  assert.equal(harness.getState().companionLeadSummary.status, 'ready')
})

// ---------------------------------------------------------------------------
// "Registrar conversa" (companion-conversation-registration-controller.js)
// ---------------------------------------------------------------------------

function createRegistrationHarness({ legacyAiDisabled }) {
  let previews = 0
  const state = { connected: true, isSelfConversation: false }

  globalThis.window = {
    YolenCompanionApi: {
      async previewConversationRegistration() {
        previews += 1
        return { ok: true, payload: { ok: true, data: { summary_text: 'Resumo.', confirmation_token: 't' } } }
      },
    },
  }

  require('../src/conversation-registration-tools.js')
  require('../src/companion-conversation-registration-controller.js')

  const controller = globalThis.YolenCompanionConversationRegistrationController.create({
    escapeHtml: (value) => String(value ?? ''),
    getCanonicalResolutionCycleId: () => 'cycle-1',
    getCaptureConversationKey: () => 'phone:5511900000000',
    renderPanel() {},
    isLegacyAiDisabled: () => legacyAiDisabled,
    get state() {
      return state
    },
    set state(value) {
      Object.assign(state, value)
    },
  })

  return { controller, get previews() { return previews } }
}

test('"Registrar conversa": com a leitura completa o card sai e nenhum resumo de IA é pedido', async () => {
  const harness = createRegistrationHarness({ legacyAiDisabled: true })

  assert.equal(harness.controller.getConversationRegistrationCardHtml(), '')
  await harness.controller.registerCurrentConversation()

  assert.equal(harness.previews, 0)
})

test('"Registrar conversa": sem a leitura completa o card continua', () => {
  const harness = createRegistrationHarness({ legacyAiDisabled: false })

  assert.match(harness.controller.getConversationRegistrationCardHtml(), /Registrar conversa/)
})

// ---------------------------------------------------------------------------
// MENSAGEM antiga (companion-message-controller.js → method-guidance)
// ---------------------------------------------------------------------------

function createMessageHarness({ legacyAiDisabled }) {
  const dom = new JSDOM(
    `<!doctype html><html><body>
      <div id="main"><footer><div contenteditable="true" role="textbox"></div></footer></div>
      <input data-yolen-textarea="lead-summary" value="Cliente pediu o preço.">
      <div data-yolen-seller-message-mount></div>
    </body></html>`,
    { url: 'https://web.whatsapp.com/', pretendToBeVisual: true },
  )

  const runtimeCalls = []

  const sandbox = {
    window: dom.window,
    chrome: {
      runtime: {
        async sendMessage(message) {
          runtimeCalls.push(message.action)
          return { ok: true, payload: { ok: true, data: { status: 'ready', message: 'Oi!' } } }
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
  vm.runInContext(readSrc('whatsapp-adapter.js'), sandbox, { filename: 'whatsapp-adapter.js' })
  vm.runInContext(readSrc('companion-message-controller.js'), sandbox, { filename: 'companion-message-controller.js' })

  const adapter = sandbox.YolenCompanionWhatsAppAdapter.create()
  const controller = sandbox.YolenCompanionMessageController.create({
    insertIntoComposer: adapter.insertTextIntoEmptyComposer,
    getBaseUrl: () => 'https://preview.example',
    platformDisplayName: adapter.platform.displayName,
    isLegacyAiDisabled: () => legacyAiDisabled,
  })

  return { controller, document: dom.window.document, window: dom.window, runtimeCalls }
}

async function settle() {
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

async function generateLegacy(harness) {
  harness.controller.syncContext(
    { cycle_id: 'cycle-1', conversation_key: 'whatsapp:5511900000000' },
    { working_summary: 'Cliente pediu o preço.' },
  )
  await settle()

  const intent = harness.document.querySelector('[data-yolen-seller-message-intent]')

  if (!intent) {
    return false
  }

  intent.value = 'Quero responder o preço.'
  intent.dispatchEvent(new harness.window.Event('input', { bubbles: true }))
  harness.document.querySelector('[data-yolen-seller-message-action="generate"]').click()
  await settle()
  await settle()

  return true
}

test('MENSAGEM antiga: com a leitura completa, "Gerar mensagem" do caminho antigo nunca chama method-guidance', async () => {
  const harness = createMessageHarness({ legacyAiDisabled: true })

  await generateLegacy(harness)

  assert.deepEqual(harness.runtimeCalls, [])
})

test('MENSAGEM antiga: sem a leitura completa, gera como hoje', async () => {
  const harness = createMessageHarness({ legacyAiDisabled: false })

  assert.equal(await generateLegacy(harness), true)
  assert.deepEqual(harness.runtimeCalls, ['LOAD_METHOD_GUIDANCE'])
})

// ---------------------------------------------------------------------------
// Core: de onde vem o modo, e nenhuma aba volta ao caminho antigo
// ---------------------------------------------------------------------------

test('core: o modo vem da capability full_reading_panel do resolve-lead (só com a flag) e trava os quatro gatilhos', () => {
  const core = readSrc('companion-core.js')
  const slice = (name, length = 2500) => core.slice(core.indexOf(name), core.indexOf(name) + length)

  const mode = slice('function isFullReadingPanelMode()', 600)

  assert.match(mode, /capabilities\s*\?\.full_reading_panel === true/)
  assert.match(core, /function isLegacyAiDisabled\(\) {\s*return isFullReadingPanelMode\(\)/)

  // Os controllers recebem a trava.
  assert.match(slice('const analysisControllerContext = {', 400), /get isLegacyAiDisabled\(\)/)
  assert.match(slice('const leadSummaryControllerContext = {', 1600), /get isLegacyAiDisabled\(\)/)
  assert.match(slice('const conversationRegistrationControllerContext = {', 400), /get isLegacyAiDisabled\(\)/)
  assert.match(core, /isLegacyAiDisabled: \(\) => isLegacyAiDisabled\(\)/)

  // "Atualizar análise" só pede a leitura completa.
  assert.match(slice('function handleAnalyzeActionClick()', 700), /if \(isLegacyAiDisabled\(\)\) {\s*return\s*}/)

  // Sem leitura pronta (rodando ou falha): aviso da leitura, nunca o antigo.
  assert.match(slice('function getNowAttentionSnapshotHtml()', 400), /isFullReadingPanelMode\(\)\s*\?\s*getFullReadingPendingHtml\('Agora'\)/)
  assert.match(slice('function getNowAttentionSnapshotHtml()', 3500), /fullReadingAgora\.main \|\| isFullReadingPanelMode\(\)\s*\?\s*''/)
  assert.match(slice('function getDetailedAnalysisAreaHtml()', 4000), /if \(isFullReadingPanelMode\(\)\) {\s*if \(!fullReadingAnalysis\) {\s*return getFullReadingPendingHtml\('Análise'\)/)
  assert.match(slice('function getClientInformationAreaHtml()', 6000), /} else if \(isFullReadingPanelMode\(\)\) {/)
  assert.match(slice('function getSellerMessageAreaHtml()', 1200), /renderFullReadingSlot\('message_notice', view\)/)
  assert.match(slice('function getFullReadingLeadSummaryCardHtml()', 500), /return isFullReadingPanelMode\(\)/)

  // Ícone minimizado: só a leitura.
  assert.match(core, /const fullReadingDrivesRail =\s*Boolean\(fullReadingAgora\?\.main\) \|\|\s*isFullReadingPanelMode\(\)/)
})

test('view: sem a mensagem da leitura, a MENSAGEM mostra o aviso dela; CLIENTE sem dados mostra o aviso', () => {
  const view = require('../src/companion-seller-information-view.js')
  const agora = {
    state: 'failed',
    notice: 'Leitura indisponível: créditos da IA esgotados',
    failure_code: 'PROVIDER_CREDIT_EXHAUSTED',
    view_key: 'k-credit',
    client: null,
    cliente: null,
  }

  for (const kind of ['message_notice', 'client']) {
    const dom = new JSDOM(`<!doctype html><div id="r">${view.renderFullReadingSlot(kind, agora)}</div>`)
    const root = dom.window.document.getElementById('r')

    assert.equal(view.hydrateFullReadingSlots(root, { agora }), 1, kind)
    assert.match(root.textContent, /Leitura indisponível: créditos da IA esgotados/, kind)
  }
})
