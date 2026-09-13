import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { JSDOM } from 'jsdom'

const RUNTIME_SOURCE = readFileSync(
  fileURLToPath(
    new URL(
      '../src/ux8-interaction-consistency-runtime.js',
      import.meta.url,
    ),
  ),
  'utf8',
)

const JOB_ID = 'a'.repeat(64)

function createWindow({
  analyzeStatus = 'failed',
  retryStatus = 'queued',
} = {}) {
  const dom = new JSDOM(
    '<!doctype html><html><body></body></html>',
    {
      url: 'https://web.whatsapp.com/',
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    },
  )

  const { window } = dom
  const runtimeCalls = []

  window.YolenCompanionApi = {
    getBaseUrl() {
      return 'http://localhost:3000'
    },
    async analyzeConversation() {
      return {
        ok: true,
        payload: {
          ok: true,
          data: {
            deep_analysis: {
              analysis_job_id: JOB_ID,
              status: analyzeStatus,
              message_watermark: 'wm-1',
            },
          },
        },
      }
    },
  }

  window.browser = {
    runtime: {
      async sendMessage(message) {
        runtimeCalls.push(message)

        return {
          ok: true,
          payload: {
            ok: true,
            data: {
              analysis_job_id: JOB_ID,
              status: retryStatus,
              message_watermark: 'wm-1',
            },
          },
        }
      },
    },
  }

  window.eval(RUNTIME_SOURCE)

  return {
    window,
    runtimeCalls,
  }
}

test(
  'retry manual reabre job failed mesmo quando o caminho anterior ainda devolve failed',
  async () => {
    const {
      window,
      runtimeCalls,
    } = createWindow()

    assert.equal(
      window
        .YolenCompanionUx8InteractionConsistencyRuntime
        .hasAnalysisRetryFallback(),
      true,
    )

    const result =
      await window
        .YolenCompanionApi
        .analyzeConversation({
          conversation_key:
            'phone:5511953442244',
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
      runtimeCalls[0].baseUrl,
      'http://localhost:3000',
    )
    assert.equal(
      runtimeCalls[0].payload
        ?.analysis_job_id,
      JOB_ID,
    )
    assert.equal(
      Object.keys(
        runtimeCalls[0].payload || {},
      ).length,
      1,
    )
    assert.equal(
      result.payload.data.deep_analysis.status,
      'queued',
    )
  },
)

test(
  'análise automática ou job já reaberto não dispara retry duplicado',
  async () => {
    const automatic =
      createWindow()

    const automaticResult =
      await automatic.window
        .YolenCompanionApi
        .analyzeConversation({
          conversation_key:
            'phone:5511953442244',
        })

    assert.equal(
      automatic.runtimeCalls.length,
      0,
    )
    assert.equal(
      automaticResult.payload.data.deep_analysis.status,
      'failed',
    )

    const alreadyQueued =
      createWindow({
        analyzeStatus: 'queued',
      })

    const queuedResult =
      await alreadyQueued.window
        .YolenCompanionApi
        .analyzeConversation({
          conversation_key:
            'phone:5511953442244',
          retry_failed_job: true,
        })

    assert.equal(
      alreadyQueued.runtimeCalls.length,
      0,
    )
    assert.equal(
      queuedResult.payload.data.deep_analysis.status,
      'queued',
    )
  },
)
