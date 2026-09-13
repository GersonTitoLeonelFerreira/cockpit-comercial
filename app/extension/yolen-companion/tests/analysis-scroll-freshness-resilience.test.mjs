import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const tools = require('../src/capture-resilience-null-base.js')

const JOB_ID = 'a'.repeat(64)
const CONVERSATION_KEY = 'phone:5511953442244'
const WATERMARK = '235:6f3cd7f8'

function createTarget({
  analyzeResult,
  statusResult,
  runtimeHandler,
}) {
  const runtimeCalls = []

  const companionApi = {
    getBaseUrl() {
      return 'http://localhost:3000'
    },
    async analyzeConversation() {
      return structuredClone(analyzeResult)
    },
    async getAnalysisJobStatus() {
      return structuredClone(statusResult)
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
  }

  const target = {
    YolenCompanionApi: companionApi,
    browser: {
      runtime: {
        async sendMessage(message) {
          runtimeCalls.push(message)
          return runtimeHandler(message)
        },
      },
    },
  }

  return {
    target,
    companionApi,
    runtimeCalls,
  }
}

function buildAnalysisResult(status = 'queued') {
  return {
    ok: true,
    payload: {
      ok: true,
      data: {
        engine_source: 'stateful',
        suggestion: {
          summary: 'Leitura anterior',
          next_action_date: null,
          recommended_status: null,
        },
        coaching: {},
        deep_analysis: {
          analysis_job_id: JOB_ID,
          status,
          message_watermark: WATERMARK,
        },
      },
    },
  }
}

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

function buildAuthoritativeStatus(status, result = null) {
  return {
    ok: true,
    statusCode: 200,
    payload: {
      ok: true,
      data: {
        analysis_job_id: JOB_ID,
        status,
        cycle_id: '78138694-ee53-44c9-81f5-94ce41abba74',
        conversation_key: CONVERSATION_KEY,
        message_watermark: WATERMARK,
        candidate_state_version:
          status === 'succeeded' ? 9 : null,
        failure_code: null,
        result,
        result_generated_at:
          status === 'succeeded'
            ? '2026-09-13T00:30:00.000Z'
            : null,
      },
    },
  }
}

test('scroll/virtualização não transforma status backend running em superseded', async () => {
  const synthetic = buildSyntheticSuperseded()

  const {
    target,
    companionApi,
    runtimeCalls,
  } = createTarget({
    analyzeResult: buildAnalysisResult('queued'),
    statusResult: synthetic,
    runtimeHandler(message) {
      assert.equal(
        message.action,
        'GET_ANALYSIS_JOB_STATUS',
      )
      return buildAuthoritativeStatus('running')
    },
  })

  tools.installAnalysisScrollFreshnessHotfix(target)

  await companionApi.analyzeConversation({
    conversation_key: CONVERSATION_KEY,
    message_snapshot_hash: WATERMARK,
  })

  const result =
    await companionApi.getAnalysisJobStatus({
      analysis_job_id: JOB_ID,
    })

  assert.equal(
    result.payload.data.status,
    'running',
  )
  assert.equal(runtimeCalls.length, 1)
  assert.equal(
    runtimeCalls[0].baseUrl,
    'http://localhost:3000',
  )
})

test('Atualizar análise reabre succeeded mesmo se o DOM mudou durante a requisição', async () => {
  const {
    target,
    companionApi,
    runtimeCalls,
  } = createTarget({
    analyzeResult: buildAnalysisResult('succeeded'),
    statusResult: buildAuthoritativeStatus('succeeded'),
    runtimeHandler(message) {
      assert.equal(
        message.action,
        'RETRY_ANALYSIS_JOB',
      )
      assert.equal(
        message.payload.allow_succeeded,
        true,
      )

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
    },
  })

  tools.installAnalysisScrollFreshnessHotfix(target)

  const result =
    await companionApi.analyzeConversation({
      conversation_key: CONVERSATION_KEY,
      message_snapshot_hash: WATERMARK,
      force_reanalysis: true,
    })

  assert.equal(
    result.payload.data.deep_analysis.status,
    'queued',
  )
  assert.equal(runtimeCalls.length, 1)
})

test('status succeeded autoritativo ainda promove o deep result para a UI seller-facing', async () => {
  const deepResult = {
    contract_version: 'phase12a-deep-seller-v1',
    engine_source: 'stateful',
    commercial_relevance: 'commercial',
    commercial_role: 'buyer',
    summary: 'Cliente pediu agendamento de Pilates.',
    commercial_reading: {
      contract_version: 'commercial-reading-v1',
      analysis_status: 'complete',
    },
    recommended_next_approach:
      'Confirmar disponibilidade para sexta às 18h.',
    recommended_question: null,
    suggested_message:
      'Vou confirmar a disponibilidade de sexta às 18h para vocês duas.',
  }

  const {
    target,
    companionApi,
  } = createTarget({
    analyzeResult: buildAnalysisResult('queued'),
    statusResult: buildSyntheticSuperseded(),
    runtimeHandler() {
      return buildAuthoritativeStatus(
        'succeeded',
        deepResult,
      )
    },
  })

  tools.installAnalysisScrollFreshnessHotfix(target)

  const analysisResult =
    await companionApi.analyzeConversation({
      conversation_key: CONVERSATION_KEY,
      message_snapshot_hash: WATERMARK,
    })

  const statusResult =
    await companionApi.getAnalysisJobStatus({
      analysis_job_id: JOB_ID,
    })

  assert.equal(
    statusResult.payload.data.status,
    'succeeded',
  )
  assert.equal(
    statusResult.payload.data.result
      .interpretation.current_moment.summary,
    deepResult.summary,
  )
  assert.equal(
    analysisResult.payload.data.engine_source,
    'stateful',
  )
  assert.equal(
    analysisResult.payload.data.suggestion.next_action,
    deepResult.recommended_next_approach,
  )
  assert.equal(
    analysisResult.payload.data.coaching.suggested_message,
    deepResult.suggested_message,
  )
})

test('superseded real do backend continua sendo respeitado', async () => {
  const realSuperseded =
    buildAuthoritativeStatus('superseded')

  const {
    target,
    companionApi,
    runtimeCalls,
  } = createTarget({
    analyzeResult: buildAnalysisResult('queued'),
    statusResult: realSuperseded,
    runtimeHandler() {
      throw new Error(
        'não deveria consultar novamente',
      )
    },
  })

  tools.installAnalysisScrollFreshnessHotfix(target)

  await companionApi.analyzeConversation({
    conversation_key: CONVERSATION_KEY,
    message_snapshot_hash: WATERMARK,
  })

  const result =
    await companionApi.getAnalysisJobStatus({
      analysis_job_id: JOB_ID,
    })

  assert.equal(
    result.payload.data.status,
    'superseded',
  )
  assert.equal(runtimeCalls.length, 0)
})
