import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import vm from 'node:vm'

const SRC_DIR = fileURLToPath(
  new URL('../src/', import.meta.url),
)

const readSource = (name) =>
  readFileSync(`${SRC_DIR}${name}`, 'utf8')

const JOB_ID = 'b'.repeat(64)
const CONVERSATION_KEY = 'phone:5511953442244'
const WATERMARK = '235:6f3cd7f8'

function buildSyntheticSuperseded() {
  return {
    ok: true,
    statusCode: 200,
    payload: {
      ok: true,
      data: {
        analysis_job_id: JOB_ID,
        status: 'superseded',
        message_watermark: WATERMARK,
        candidate_state_version: null,
        failure_code: null,
        result: null,
        result_generated_at: null,
      },
    },
  }
}

test('bootstrap instala freshness guard quando globalThis e window são realms diferentes', async () => {
  const runtimeCalls = []

  const windowObject = {
    YolenCompanionApi: {
      getBaseUrl() {
        return 'http://localhost:3000'
      },
      async analyzeConversation() {
        return {
          ok: true,
          payload: {
            ok: true,
            data: {
              engine_source: 'stateful',
              suggestion: {},
              coaching: {},
              deep_analysis: {
                analysis_job_id: JOB_ID,
                status: 'succeeded',
                message_watermark: WATERMARK,
              },
            },
          },
        }
      },
      async getAnalysisJobStatus() {
        return buildSyntheticSuperseded()
      },
      async ingestCapturedMessages() {
        return {
          ok: true,
          payload: {
            ok: true,
            message_results: [],
          },
        }
      },
    },
  }

  const sandbox = {
    window: windowObject,
    browser: {
      runtime: {
        async sendMessage(message) {
          runtimeCalls.push(message)

          if (
            message.action ===
            'RETRY_ANALYSIS_JOB'
          ) {
            return {
              ok: true,
              payload: {
                ok: true,
                data: {
                  analysis_job_id: JOB_ID,
                  status: 'queued',
                  message_watermark: WATERMARK,
                },
              },
            }
          }

          if (
            message.action ===
            'GET_ANALYSIS_JOB_STATUS'
          ) {
            return {
              ok: true,
              statusCode: 200,
              payload: {
                ok: true,
                data: {
                  analysis_job_id: JOB_ID,
                  status: 'running',
                  cycle_id:
                    '78138694-ee53-44c9-81f5-94ce41abba74',
                  conversation_key:
                    CONVERSATION_KEY,
                  message_watermark:
                    WATERMARK,
                  candidate_state_version:
                    null,
                  failure_code: null,
                  result: null,
                  result_generated_at: null,
                },
              },
            }
          }

          throw new Error(
            `ação inesperada: ${message.action}`,
          )
        },
      },
    },
    console,
  }

  sandbox.globalThis = sandbox
  sandbox.YolenCompanionSellerInformationView = {
    escapeHtml(value) {
      return String(value ?? '')
    },
    renderAgoraViewModelSnapshot() {
      return ''
    },
    renderAnalysisViewModel() {
      return ''
    },
    renderCustomerViewModel() {
      return ''
    },
  }

  vm.createContext(sandbox)

  vm.runInContext(
    readSource(
      'capture-resilience-null-base.js',
    ),
    sandbox,
    {
      filename:
        'capture-resilience-null-base.js',
    },
  )

  // Prova que o bootstrap antigo NÃO instalou sozinho neste realm:
  // globalThis possui browser/runtime, enquanto a API está em window.
  assert.equal(
    runtimeCalls.length,
    0,
  )

  vm.runInContext(
    readSource(
      'companion-reasoning-view.js',
    ),
    sandbox,
    {
      filename:
        'companion-reasoning-view.js',
    },
  )

  const refresh =
    await windowObject
      .YolenCompanionApi
      .analyzeConversation({
        conversation_key:
          CONVERSATION_KEY,
        message_snapshot_hash:
          WATERMARK,
        force_reanalysis: true,
      })

  assert.equal(
    refresh.payload.data.deep_analysis.status,
    'queued',
  )
  assert.equal(
    runtimeCalls[0]?.action,
    'RETRY_ANALYSIS_JOB',
  )

  const status =
    await windowObject
      .YolenCompanionApi
      .getAnalysisJobStatus({
        analysis_job_id: JOB_ID,
      })

  assert.equal(
    status.payload.data.status,
    'running',
  )
  assert.equal(
    runtimeCalls[1]?.action,
    'GET_ANALYSIS_JOB_STATUS',
  )
})
