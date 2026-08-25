import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import vm from 'node:vm'

const source = readFileSync(
  fileURLToPath(
    new URL('../src/lead-method-guidance-runtime.js', import.meta.url),
  ),
  'utf8',
)

function createHarness() {
  let summaryText = 'Resumo inicial do relacionamento comercial.'
  let summaryLoadCount = 0
  let guidanceFetchCount = 0
  let failGuidance = false
  const listeners = new Map()

  const api = {
    __leadMethodGuidanceWrapped: false,
    getBaseUrl() {
      return 'https://preview.example.com'
    },
    async getMe() {
      return {
        ok: true,
        payload: {
          companion_token: 'token-de-teste',
        },
      }
    },
    async loadLeadSummary() {
      summaryLoadCount += 1
      return {
        ok: true,
        payload: {
          ok: true,
          data: {
            working_summary: summaryText,
          },
        },
      }
    },
  }

  const sandbox = {
    YolenCompanionApi: api,
    document: {
      addEventListener(type, listener) {
        listeners.set(type, listener)
      },
    },
    async fetch() {
      guidanceFetchCount += 1

      if (failGuidance) {
        return {
          ok: false,
          async json() {
            return {
              ok: false,
              error: 'Falha simulada',
            }
          },
        }
      }

      return {
        ok: true,
        async json() {
          return {
            ok: true,
            data: {
              status: 'ready',
              method_name: 'Método Yolen',
              method_config_version_id: 'config-1',
              stage_key: 'diagnostico',
              stage_name: 'Diagnóstico',
              stage_reason: 'Ainda falta confirmar o impacto.',
              next_step:
                'Confirme com a cliente qual impacto a perda de follow-ups gera hoje e obtenha um exemplo concreto antes de voltar à proposta.',
              error: null,
            },
          }
        },
      }
    },
    console,
    Map,
    Math,
    Promise,
    String,
  }
  sandbox.globalThis = sandbox

  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, {
    filename: 'lead-method-guidance-runtime.js',
  })

  return {
    api,
    listeners,
    setSummary(value) {
      summaryText = value
    },
    setFailGuidance(value) {
      failGuidance = value
    },
    get summaryLoadCount() {
      return summaryLoadCount
    },
    get guidanceFetchCount() {
      return guidanceFetchCount
    },
  }
}

const payload = {
  cycle_id: 'cycle-1',
  conversation_key: 'whatsapp:5511999999999',
}

test('mesmo resumo reutiliza a orientação do método sem nova chamada de IA', async () => {
  const harness = createHarness()

  const first = await harness.api.loadLeadSummary(payload)
  const second = await harness.api.loadLeadSummary(payload)

  assert.equal(harness.summaryLoadCount, 2)
  assert.equal(harness.guidanceFetchCount, 1)
  assert.equal(first.payload.data.method_guidance.status, 'ready')
  assert.equal(second.payload.data.method_guidance.next_step, first.payload.data.method_guidance.next_step)
})

test('resumo alterado gera nova orientação para o novo contexto', async () => {
  const harness = createHarness()

  await harness.api.loadLeadSummary(payload)
  harness.setSummary('Resumo atualizado com nova objeção de investimento.')
  await harness.api.loadLeadSummary(payload)

  assert.equal(harness.guidanceFetchCount, 2)
})

test('falha no próximo passo não apaga nem transforma o resumo em erro', async () => {
  const harness = createHarness()
  harness.setFailGuidance(true)

  const result = await harness.api.loadLeadSummary(payload)

  assert.equal(result.ok, true)
  assert.equal(result.payload.data.working_summary, 'Resumo inicial do relacionamento comercial.')
  assert.equal(result.payload.data.method_guidance.status, 'error')
})

test('refresh explícito invalida orientação cacheada', async () => {
  const harness = createHarness()

  await harness.api.loadLeadSummary(payload)
  const clickListener = harness.listeners.get('click')

  clickListener({
    target: {
      closest(selector) {
        return selector === '[data-yolen-action="refresh"]' ? {} : null
      },
    },
  })

  await harness.api.loadLeadSummary(payload)

  assert.equal(harness.guidanceFetchCount, 2)
})
