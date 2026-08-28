import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import vm from 'node:vm'

const source = readFileSync(
  fileURLToPath(
    new URL('../src/lead-resolution-runtime-cache.js', import.meta.url),
  ),
  'utf8',
)

function createHarness() {
  let resolveCount = 0
  let clearSessionCount = 0
  const listeners = new Map()

  const api = {
    async resolveLead(payload) {
      resolveCount += 1
      return {
        ok: true,
        payload: {
          status: 'OWNED_BY_ME',
          lead: { id: 'lead-1', name: payload.display_name || 'Lead' },
          cycle: { id: 'cycle-1' },
        },
      }
    },
    async clearSession() {
      clearSessionCount += 1
      return { ok: true }
    },
  }

  const sandbox = {
    YolenCompanionApi: api,
    document: {
      addEventListener(type, listener) {
        listeners.set(type, listener)
      },
    },
    console,
    Map,
    Promise,
    String,
  }
  sandbox.globalThis = sandbox

  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, {
    filename: 'lead-resolution-runtime-cache.js',
  })

  return {
    api,
    listeners,
    get resolveCount() {
      return resolveCount
    },
    get clearSessionCount() {
      return clearSessionCount
    },
  }
}

test('lead já resolvido pelo mesmo telefone não consulta novamente', async () => {
  const harness = createHarness()

  const first = await harness.api.resolveLead({
    phone: '+55 11 99999-9999',
    display_name: 'Larissa',
  })

  const second = await harness.api.resolveLead({
    phone: '5511999999999',
    display_name: 'Larissa dos Santos',
  })

  assert.equal(harness.resolveCount, 1)
  assert.equal(second, first)
})

test('outro telefone continua fazendo resolução própria', async () => {
  const harness = createHarness()

  await harness.api.resolveLead({ phone: '5511999999999', display_name: 'Larissa' })
  await harness.api.resolveLead({ phone: '5521999999999', display_name: 'Mayara' })

  assert.equal(harness.resolveCount, 2)
})

test('refresh explícito limpa o cache e permite nova consulta', async () => {
  const harness = createHarness()

  await harness.api.resolveLead({ phone: '5511999999999', display_name: 'Larissa' })

  const clickListener = harness.listeners.get('click')
  assert.equal(typeof clickListener, 'function')

  clickListener({
    target: {
      closest(selector) {
        return selector === '[data-yolen-action="refresh"]' ? {} : null
      },
    },
  })

  await harness.api.resolveLead({ phone: '5511999999999', display_name: 'Larissa' })

  assert.equal(harness.resolveCount, 2)
})

test('clearSession também invalida resolução anterior', async () => {
  const harness = createHarness()

  await harness.api.resolveLead({ phone: '5511999999999', display_name: 'Larissa' })
  await harness.api.clearSession()
  await harness.api.resolveLead({ phone: '5511999999999', display_name: 'Larissa' })

  assert.equal(harness.clearSessionCount, 1)
  assert.equal(harness.resolveCount, 2)
})
