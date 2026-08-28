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

function flushAsyncWork() {
  return new Promise((resolve) => setImmediate(resolve))
}

function createHarness() {
  let summaryText = 'Resumo inicial do relacionamento comercial.'
  let summaryLoadCount = 0
  let guidanceFetchCount = 0
  let failGuidance = false
  let lastGuidanceMessage = null
  const listeners = new Map()

  const api = {
    __leadMethodGuidanceWrapped: false,
    getBaseUrl() {
      return 'https://preview.example.com'
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
    YolenCompanionLeadSummaryView: {
      renderMethodGuidance() {
        return '<div>guidance</div>'
      },
    },
    browser: {
      runtime: {
        async sendMessage(message) {
          guidanceFetchCount += 1
          lastGuidanceMessage = message

          if (failGuidance) {
            return {
              ok: false,
              statusCode: 503,
              payload: {
                ok: false,
                code: 'METHOD_GUIDANCE_TEMPORARY_FAILURE',
                retryable: true,
                error: 'Falha simulada',
              },
            }
          }

          return {
            ok: true,
            statusCode: 200,
            payload: {
              ok: true,
              data: {
                status: 'ready',
                method_name: 'Metodo ATO',
                method_config_version_id: 'config-1',
                stage_key: 'tour',
                stage_name: 'Tour',
                stage_reason: 'Ainda falta confirmar o impacto.',
                next_step:
                  'Confirme com a cliente qual impacto a perda de follow-ups gera hoje e obtenha um exemplo concreto antes de voltar à proposta.',
                error: null,
              },
            },
          }
        },
      },
    },
    document: {
      addEventListener(type, listener) {
        listeners.set(type, listener)
      },
      querySelector() {
        return null
      },
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
    get lastGuidanceMessage() {
      return lastGuidanceMessage
    },
  }
}

const payload = {
  cycle_id: 'cycle-1',
  conversation_key: 'whatsapp:5511999999999',
}

test('resumo volta imediatamente enquanto o próximo passo é calculado em paralelo', async () => {
  const harness = createHarness()

  const result = await harness.api.loadLeadSummary(payload)

  assert.equal(result.ok, true)
  assert.equal(
    result.payload.data.working_summary,
    'Resumo inicial do relacionamento comercial.',
  )
  assert.equal(result.payload.data.method_guidance.status, 'loading')

  await flushAsyncWork()

  assert.equal(result.payload.data.method_guidance.status, 'ready')
  assert.equal(harness.guidanceFetchCount, 1)
})

test('orientação usa o background autenticado em vez de fetch direto do content-script', async () => {
  const harness = createHarness()

  await harness.api.loadLeadSummary(payload)
  await flushAsyncWork()

  assert.deepEqual(
    JSON.parse(JSON.stringify(harness.lastGuidanceMessage)),
    {
      source: 'YOLEN_COMPANION',
      action: 'LOAD_METHOD_GUIDANCE',
      baseUrl: 'https://preview.example.com',
      payload: {
        cycle_id: 'cycle-1',
        conversation_key: 'whatsapp:5511999999999',
        working_summary: 'Resumo inicial do relacionamento comercial.',
      },
    },
  )
})

test('mesmo resumo reutiliza somente orientação pronta sem nova chamada de IA', async () => {
  const harness = createHarness()

  const first = await harness.api.loadLeadSummary(payload)
  await flushAsyncWork()
  const second = await harness.api.loadLeadSummary(payload)

  assert.equal(harness.summaryLoadCount, 2)
  assert.equal(harness.guidanceFetchCount, 1)
  assert.equal(first.payload.data.method_guidance.status, 'ready')
  assert.equal(
    second.payload.data.method_guidance.next_step,
    first.payload.data.method_guidance.next_step,
  )
})

test('resumo alterado gera nova orientação para o novo contexto', async () => {
  const harness = createHarness()

  await harness.api.loadLeadSummary(payload)
  await flushAsyncWork()
  harness.setSummary('Resumo atualizado com nova objeção de investimento.')
  await harness.api.loadLeadSummary(payload)
  await flushAsyncWork()

  assert.equal(harness.guidanceFetchCount, 2)
})

test('falha no próximo passo não apaga o resumo nem entra em cache', async () => {
  const harness = createHarness()
  harness.setFailGuidance(true)

  const first = await harness.api.loadLeadSummary(payload)

  assert.equal(first.ok, true)
  assert.equal(
    first.payload.data.working_summary,
    'Resumo inicial do relacionamento comercial.',
  )
  assert.equal(first.payload.data.method_guidance.status, 'loading')

  await flushAsyncWork()

  assert.equal(first.payload.data.method_guidance.status, 'error')
  assert.equal(
    first.payload.data.method_guidance.error_code,
    'METHOD_GUIDANCE_TEMPORARY_FAILURE',
  )

  harness.setFailGuidance(false)

  const second = await harness.api.loadLeadSummary(payload)
  assert.equal(second.payload.data.method_guidance.status, 'loading')

  await flushAsyncWork()

  assert.equal(second.payload.data.method_guidance.status, 'ready')
  assert.equal(harness.guidanceFetchCount, 2)
})

test('botão de tentar novamente refaz uma orientação que falhou', async () => {
  const harness = createHarness()
  harness.setFailGuidance(true)

  const result = await harness.api.loadLeadSummary(payload)
  await flushAsyncWork()

  assert.equal(result.payload.data.method_guidance.status, 'error')
  assert.equal(harness.guidanceFetchCount, 1)

  harness.setFailGuidance(false)

  const clickListener = harness.listeners.get('click')
  clickListener({
    preventDefault() {},
    target: {
      closest(selector) {
        return selector === '[data-yolen-action="retry-method-guidance"]'
          ? {}
          : null
      },
    },
  })

  assert.equal(result.payload.data.method_guidance.status, 'loading')

  await flushAsyncWork()

  assert.equal(result.payload.data.method_guidance.status, 'ready')
  assert.equal(harness.guidanceFetchCount, 2)
})

test('refresh explícito invalida orientação pronta cacheada', async () => {
  const harness = createHarness()

  await harness.api.loadLeadSummary(payload)
  await flushAsyncWork()
  const clickListener = harness.listeners.get('click')

  clickListener({
    target: {
      closest(selector) {
        return selector === '[data-yolen-action="refresh"]' ? {} : null
      },
    },
  })

  await harness.api.loadLeadSummary(payload)
  await flushAsyncWork()

  assert.equal(harness.guidanceFetchCount, 2)
})
