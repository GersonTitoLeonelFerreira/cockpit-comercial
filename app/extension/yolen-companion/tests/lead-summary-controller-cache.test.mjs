// FASE 5 — cache do working summary do lead no controller de resumo do
// Core (companion-lead-summary-controller.js). Antes era o wrapper
// lead-summary-runtime-cache.js sobre YolenCompanionApi.loadLeadSummary
// (chave derivada do DOM '#main' do WhatsApp, invalidação por wrappers de
// save/registro/captura). Agora a chave vem do ledger canônico do Core
// (getLeadSummarySnapshotSignature) e a invalidação é explícita.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const summaryControllerModule =
  require('../src/companion-lead-summary-controller.js')

const payload = {
  cycle_id: 'cycle-1',
  conversation_key: 'whatsapp:5511999999999',
}

function createHarness() {
  let snapshot = 'ledger-1'
  let loadCount = 0
  let saveCount = 0
  let sellerClearCount = 0
  let state = {}

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
    async saveLeadSummary(request) {
      saveCount += 1
      return {
        ok: true,
        payload: {
          ok: true,
          data: {
            summary: {
              summary: request.summary,
              version: saveCount,
            },
          },
        },
      }
    },
  }

  globalThis.window = { YolenCompanionApi: api }

  const controller = summaryControllerModule.create({
    getCanonicalResolutionCycleId: () => payload.cycle_id,
    getCaptureConversationKey: () => payload.conversation_key,
    getLeadSummarySnapshotSignature: () => snapshot,
    leadSummaryViewTools: {
      renderLeadSummarySection: () => '',
    },
    messageController: {
      clear() {
        sellerClearCount += 1
      },
      syncContext() {},
    },
    renderPanel() {},
    get state() {
      return state
    },
    set state(value) {
      state = value
    },
  })

  async function load() {
    await controller.loadCompanionLeadSummaryForCurrentCycle()
    return state.companionLeadSummary
  }

  return {
    controller,
    load,
    setSnapshot(value) {
      snapshot = value
    },
    get loadCount() {
      return loadCount
    },
    get saveCount() {
      return saveCount
    },
    get sellerClearCount() {
      return sellerClearCount
    },
  }
}

test.afterEach(() => {
  delete globalThis.window
})

test('não recompõe o resumo ao reabrir o mesmo snapshot', async () => {
  const harness = createHarness()

  const first = await harness.load()
  const second = await harness.load()

  assert.equal(harness.loadCount, 1)
  assert.equal(first.data.working_summary, 'Resumo 1')
  assert.equal(second.data.working_summary, 'Resumo 1')
})

test('mensagem nova no ledger muda o snapshot e permite nova composição', async () => {
  const harness = createHarness()

  await harness.load()
  harness.setSnapshot('ledger-2')
  const refreshed = await harness.load()

  assert.equal(harness.loadCount, 2)
  assert.equal(refreshed.data.working_summary, 'Resumo 2')
})

test('requisições simultâneas do mesmo snapshot compartilham a mesma composição', async () => {
  const cache = summaryControllerModule.createLeadSummaryCache()
  let loadCount = 0
  const loader = async () => {
    loadCount += 1
    return {
      ok: true,
      payload: { ok: true, data: { working_summary: 'Resumo' } },
    }
  }

  const [first, second] = await Promise.all([
    cache.load(payload, 'ledger-1', loader),
    cache.load(payload, 'ledger-1', loader),
  ])

  assert.equal(loadCount, 1)
  assert.equal(first, second)
})

test('resumo vazio não entra no cache', async () => {
  const cache = summaryControllerModule.createLeadSummaryCache()
  let loadCount = 0
  const loader = async () => {
    loadCount += 1
    return { ok: true, payload: { ok: true, data: { working_summary: '' } } }
  }

  await cache.load(payload, 'ledger-1', loader)
  await cache.load(payload, 'ledger-1', loader)

  assert.equal(loadCount, 2)
})

test('salvar substitui o cache pelo resumo confirmado sem recompor', async () => {
  const harness = createHarness()

  await harness.load()
  await harness.controller.handleSaveLeadSummaryClick(
    'Resumo confirmado pelo vendedor',
  )
  const reopened = await harness.load()

  assert.equal(harness.saveCount, 1)
  assert.equal(harness.loadCount, 1)
  assert.equal(
    reopened.data.summary.summary,
    'Resumo confirmado pelo vendedor',
  )
  assert.equal(harness.sellerClearCount, 0)
})

test('registro confirmado/recuperado invalida resumo e a mensagem derivada', async () => {
  const harness = createHarness()

  await harness.load()
  harness.controller.invalidateLeadSummaryForConversation(payload)
  const refreshed = await harness.load()

  assert.equal(harness.loadCount, 2)
  assert.equal(refreshed.data.working_summary, 'Resumo 2')
  assert.equal(harness.sellerClearCount, 1)
})

test('captura confirmada invalida resumo stale mesmo sem mudança de snapshot e preserva a intenção do vendedor', async () => {
  const harness = createHarness()

  await harness.load()
  harness.controller.invalidateLeadSummaryForConversation(payload, {
    clearMessage: false,
  })
  const refreshed = await harness.load()

  assert.equal(harness.loadCount, 2)
  assert.equal(refreshed.data.working_summary, 'Resumo 2')
  assert.equal(harness.sellerClearCount, 0)
})

test('registro e captura chamam a invalidação explícita do controller de resumo', () => {
  const registration = readFileSync(
    new URL(
      '../src/companion-conversation-registration-controller.js',
      import.meta.url,
    ),
    'utf8',
  )
  const core = readFileSync(
    new URL('../src/companion-core.js', import.meta.url),
    'utf8',
  )

  assert.equal(
    registration.match(/invalidateLeadSummaryForConversation\(\{/g)?.length,
    2,
    'preview já registrado + registro confirmado',
  )
  assert.match(
    core,
    /invalidateLeadSummaryForConversation\(\s*payload,\s*\{\s*clearMessage: false,/,
  )
})
