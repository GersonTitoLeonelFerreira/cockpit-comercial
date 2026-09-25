import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import vm from 'node:vm'

const source = readFileSync(
  fileURLToPath(
    new URL('../src/lead-summary-runtime-cache.js', import.meta.url),
  ),
  'utf8',
)

function createHarness() {
  let visibleText = 'Mensagem inicial'
  let loadCount = 0
  let saveCount = 0
  let confirmCount = 0
  let captureCount = 0
  let methodClearCount = 0
  let sellerClearCount = 0

  const messageNode = {
    textContent: visibleText,
    getAttribute(name) {
      return name === 'data-pre-plain-text'
        ? '[10:00, 25/08/2026] Cliente: '
        : null
    },
    closest() {
      return {
        getAttribute(name) {
          return name === 'data-id' ? 'msg-1' : null
        },
      }
    },
  }

  const main = {
    querySelectorAll() {
      messageNode.textContent = visibleText
      return [messageNode]
    },
  }

  const api = {
    async loadLeadSummary() {
      loadCount += 1
      return {
        ok: true,
        payload: {
          ok: true,
          data: {
            working_summary: `Resumo ${loadCount}`,
          },
        },
      }
    },
    async saveLeadSummary(payload) {
      saveCount += 1
      return {
        ok: true,
        payload: {
          ok: true,
          data: {
            summary: {
              summary: payload.summary,
              version: saveCount,
            },
          },
        },
      }
    },
    async previewConversationRegistration() {
      return {
        ok: true,
        payload: {
          ok: true,
          data: {
            already_registered: true,
          },
        },
      }
    },
    async confirmConversationRegistration() {
      confirmCount += 1
      return {
        ok: true,
        payload: {
          ok: true,
          data: {
            registration_id: 'registration-1',
          },
        },
      }
    },
    async ingestCapturedMessages() {
      captureCount += 1
      return {
        ok: true,
        payload: {
          ok: true,
        },
      }
    },
  }

  const sandbox = {
    YolenCompanionApi: api,
    YolenCompanionLeadMethodGuidanceRuntime: {
      clear() {
        methodClearCount += 1
      },
    },
    YolenCompanionSellerMessageRuntime: {
      clear() {
        sellerClearCount += 1
      },
    },
    document: {
      querySelector(selector) {
        return selector === '#main' ? main : null
      },
    },
    console,
    Promise,
    Map,
    Math,
    String,
  }
  sandbox.globalThis = sandbox

  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, {
    filename: 'lead-summary-runtime-cache.js',
  })

  return {
    api,
    setVisibleText(value) {
      visibleText = value
    },
    get loadCount() {
      return loadCount
    },
    get saveCount() {
      return saveCount
    },
    get confirmCount() {
      return confirmCount
    },
    get captureCount() {
      return captureCount
    },
    get methodClearCount() {
      return methodClearCount
    },
    get sellerClearCount() {
      return sellerClearCount
    },
  }
}

const payload = {
  cycle_id: 'cycle-1',
  conversation_key: 'whatsapp:5511999999999',
}

test('não recompõe o resumo ao reabrir o mesmo snapshot', async () => {
  const harness = createHarness()

  const first = await harness.api.loadLeadSummary(payload)
  const second = await harness.api.loadLeadSummary(payload)

  assert.equal(harness.loadCount, 1)
  assert.equal(first.payload.data.working_summary, 'Resumo 1')
  assert.equal(second.payload.data.working_summary, 'Resumo 1')
})

test('mensagem visível nova muda o snapshot e permite nova composição', async () => {
  const harness = createHarness()

  await harness.api.loadLeadSummary(payload)
  harness.setVisibleText('Mensagem nova do cliente')
  const refreshed = await harness.api.loadLeadSummary(payload)

  assert.equal(harness.loadCount, 2)
  assert.equal(refreshed.payload.data.working_summary, 'Resumo 2')
})

test('requisições simultâneas do mesmo snapshot compartilham a mesma composição', async () => {
  const harness = createHarness()

  const [first, second] = await Promise.all([
    harness.api.loadLeadSummary(payload),
    harness.api.loadLeadSummary(payload),
  ])

  assert.equal(harness.loadCount, 1)
  assert.equal(first.payload.data.working_summary, second.payload.data.working_summary)
})

test('salvar substitui o cache pelo resumo confirmado sem recompor', async () => {
  const harness = createHarness()

  await harness.api.loadLeadSummary(payload)
  const saved = await harness.api.saveLeadSummary({
    ...payload,
    summary: 'Resumo confirmado pelo vendedor',
  })
  const reopened = await harness.api.loadLeadSummary(payload)

  assert.equal(harness.saveCount, 1)
  assert.equal(harness.loadCount, 1)
  assert.equal(
    saved.payload.data.summary.summary,
    'Resumo confirmado pelo vendedor',
  )
  assert.equal(
    reopened.payload.data.summary.summary,
    'Resumo confirmado pelo vendedor',
  )
  assert.equal(harness.methodClearCount, 1)
  assert.equal(harness.sellerClearCount, 0)
})

test('registro confirmado invalida resumo e caches derivados', async () => {
  const harness = createHarness()

  await harness.api.loadLeadSummary(payload)
  await harness.api.confirmConversationRegistration(payload)
  const refreshed = await harness.api.loadLeadSummary(payload)

  assert.equal(harness.confirmCount, 1)
  assert.equal(harness.loadCount, 2)
  assert.equal(
    refreshed.payload.data.working_summary,
    'Resumo 2',
  )
  assert.equal(harness.methodClearCount, 1)
  assert.equal(harness.sellerClearCount, 1)
})

test('registro já existente recuperado no preview também invalida cache', async () => {
  const harness = createHarness()

  await harness.api.loadLeadSummary(payload)
  await harness.api.previewConversationRegistration(payload)
  await harness.api.loadLeadSummary(payload)

  assert.equal(harness.loadCount, 2)
  assert.equal(harness.methodClearCount, 1)
  assert.equal(harness.sellerClearCount, 1)
})

test('captura confirmada invalida resumo stale mesmo sem mudança no DOM', async () => {
  const harness = createHarness()

  await harness.api.loadLeadSummary(payload)
  await harness.api.ingestCapturedMessages(payload)
  const refreshed = await harness.api.loadLeadSummary(payload)

  assert.equal(harness.captureCount, 1)
  assert.equal(harness.loadCount, 2)
  assert.equal(
    refreshed.payload.data.working_summary,
    'Resumo 2',
  )
  assert.equal(harness.methodClearCount, 1)
  assert.equal(harness.sellerClearCount, 1)
})
