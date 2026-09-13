import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const source =
  fs.readFileSync(
    new URL(
      '../src/phase16-9-runtime-guard.js',
      import.meta.url,
    ),
    'utf8',
  )

function loadGuard() {
  const runtimeCalls = []

  const api = {
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
                'old-superseded-job',
              status:
                'superseded',
              message_watermark:
                'old-watermark',
            },
          },
        },
      }
    },
  }

  const window = {
    YolenCompanionApi: api,
    setTimeout() {
      return 1
    },
  }

  const document = {
    documentElement: {},
    querySelector() {
      return null
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
                'fresh-manual-job',
              status:
                'queued',
              message_watermark:
                'fresh-watermark',
            },
          },
        }
      },
    },
  }

  const sandbox = {
    window,
    document,
    browser,
    console,
    Promise,
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
    api,
    runtimeCalls,
  }
}

test(
  'refresh manual troca superseded terminal por novo job queued sem reabrir fotografia antiga',
  async () => {
    const {
      api,
      runtimeCalls,
    } = loadGuard()

    const result =
      await api.analyzeConversation({
        cycle_id:
          'cycle-1',
        conversation_key:
          'phone:5511999999999',
        force_reanalysis:
          true,
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
      runtimeCalls[0].payload
        .analysis_job_id,
      'old-superseded-job',
    )
    assert.equal(
      runtimeCalls[0].payload
        .allow_succeeded,
      true,
    )

    assert.equal(
      result.payload.data
        .deep_analysis.analysis_job_id,
      'fresh-manual-job',
    )
    assert.equal(
      result.payload.data
        .deep_analysis.status,
      'queued',
    )
    assert.equal(
      result.payload.data
        .deep_analysis.message_watermark,
      'fresh-watermark',
    )
  },
)

test(
  'superseded automático não cria refresh manual',
  async () => {
    const {
      api,
      runtimeCalls,
    } = loadGuard()

    const result =
      await api.analyzeConversation({
        cycle_id:
          'cycle-1',
        conversation_key:
          'phone:5511999999999',
        force_reanalysis:
          false,
      })

    assert.equal(
      runtimeCalls.length,
      0,
    )
    assert.equal(
      result.payload.data
        .deep_analysis.status,
      'superseded',
    )
  },
)
