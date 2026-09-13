import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'

const source =
  fs.readFileSync(
    new URL(
      '../src/phase16-9-runtime-guard.js',
      import.meta.url,
    ),
    'utf8',
  )

function loadGuard({
  analysisStatus = 'failed',
  retryStatus = 'queued',
} = {}) {
  const dom = new JSDOM(
    '<!doctype html><html><body></body></html>',
    {
      url: 'https://web.whatsapp.com/',
    },
  )

  const runtimeCalls = []
  const analysisJobId =
    'a'.repeat(64)

  dom.window.YolenCompanionApi = {
    getBaseUrl() {
      return 'http://localhost:3000'
    },
    async analyzeConversation() {
      return {
        ok: true,
        statusCode: 200,
        payload: {
          ok: true,
          data: {
            deep_analysis: {
              analysis_job_id:
                analysisJobId,
              status:
                analysisStatus,
              message_watermark:
                'wm-1',
            },
          },
        },
      }
    },
  }

  const browser = {
    runtime: {
      async sendMessage(message) {
        runtimeCalls.push(message)

        return {
          ok: true,
          statusCode: 200,
          payload: {
            ok: true,
            data: {
              analysis_job_id:
                analysisJobId,
              status:
                retryStatus,
              message_watermark:
                'wm-1',
            },
          },
        }
      },
    },
  }

  const sandbox = {
    window: dom.window,
    document: dom.window.document,
    MutationObserver:
      dom.window.MutationObserver,
    Node: dom.window.Node,
    browser,
    console,
  }

  sandbox.globalThis = sandbox

  vm.createContext(sandbox)
  vm.runInContext(
    source,
    sandbox,
    {
      filename:
        'phase16-9-runtime-guard.js',
    },
  )

  return {
    api:
      dom.window.YolenCompanionApi,
    runtimeCalls,
  }
}

test('retry manual reabre job failed sem depender de freshness do DOM', async () => {
  const {
    api,
    runtimeCalls,
  } = loadGuard()

  const result =
    await api.analyzeConversation({
      retry_failed_job: true,
    })

  assert.equal(
    runtimeCalls.length,
    1,
  )
  assert.equal(
    runtimeCalls[0].action,
    'RETRY_ANALYSIS_JOB',
  )
  assert.equal(
    result.payload.data
      .deep_analysis.status,
    'queued',
  )
})

test('análise automática não cria retry paralelo', async () => {
  const {
    api,
    runtimeCalls,
  } = loadGuard()

  const result =
    await api.analyzeConversation({
      automatic: true,
    })

  assert.equal(
    runtimeCalls.length,
    0,
  )
  assert.equal(
    result.payload.data
      .deep_analysis.status,
    'failed',
  )
})
