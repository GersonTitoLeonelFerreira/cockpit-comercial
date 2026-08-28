import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import vm from 'node:vm'

function read(relativePath) {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    'utf8',
  )
}

test('renderer fica em silêncio comercial sem etapa nem retry', () => {
  const sandbox = {
    console,
    module: { exports: {} },
  }
  sandbox.globalThis = sandbox

  vm.createContext(sandbox)
  vm.runInContext(
    read('../src/companion-lead-summary-view.js'),
    sandbox,
  )

  const html = sandbox.module.exports.renderMethodGuidance({
    status: 'not_applicable',
    method_name: 'Metodo ATO',
    stage_name: null,
    next_step: null,
  })

  assert.match(
    html,
    /Sem próximo passo comercial neste momento\./,
  )
  assert.doesNotMatch(html, /Etapa:/)
  assert.doesNotMatch(html, /Tentar novamente/)
})

test('decisão not_applicable é cacheada para resumo inalterado', async () => {
  const listeners = new Map()
  let requestCount = 0

  const api = {
    __leadMethodGuidanceWrapped: false,
    getBaseUrl() {
      return 'https://preview.example.com'
    },
    async loadLeadSummary() {
      return {
        ok: true,
        payload: {
          ok: true,
          data: {
            working_summary:
              'A conversa atual trata de contratação e não envolve compra ou venda.',
          },
        },
      }
    },
  }

  const sandbox = {
    YolenCompanionApi: api,
    YolenCompanionLeadSummaryView: {
      renderMethodGuidance() {
        return ''
      },
    },
    browser: {
      runtime: {
        async sendMessage() {
          requestCount += 1
          return {
            ok: true,
            statusCode: 200,
            payload: {
              ok: true,
              data: {
                status: 'not_applicable',
                method_name: 'Metodo ATO',
                method_config_version_id: 'method-1',
                stage_key: null,
                stage_name: null,
                stage_reason: null,
                next_step: null,
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
  vm.runInContext(
    read('../src/lead-method-guidance-runtime.js'),
    sandbox,
  )

  const payload = {
    cycle_id: 'cycle-1',
    conversation_key: 'whatsapp:5511999999999',
  }

  const first = await api.loadLeadSummary(payload)
  await new Promise((resolve) => setImmediate(resolve))
  const second = await api.loadLeadSummary(payload)

  assert.equal(requestCount, 1)
  assert.equal(
    first.payload.data.method_guidance.status,
    'not_applicable',
  )
  assert.equal(
    second.payload.data.method_guidance.status,
    'not_applicable',
  )
})
