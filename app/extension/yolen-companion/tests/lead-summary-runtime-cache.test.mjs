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
  }

  const sandbox = {
    YolenCompanionApi: api,
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

test('salvar invalida o cache anterior da conversa', async () => {
  const harness = createHarness()

  await harness.api.loadLeadSummary(payload)
  await harness.api.saveLeadSummary({
    ...payload,
    summary: 'Resumo confirmado pelo vendedor',
  })
  await harness.api.loadLeadSummary(payload)

  assert.equal(harness.saveCount, 1)
  assert.equal(harness.loadCount, 2)
})
