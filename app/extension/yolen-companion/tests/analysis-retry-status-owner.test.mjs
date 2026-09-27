// FASE 5 — dono único da política de retry/status da análise.
//
// Até a FASE 4, a mesma regra de retry (`RETRY_ANALYSIS_JOB`) e a
// reconsulta autoritativa de status estavam espalhadas em quatro camadas
// que reatribuíam `YolenCompanionApi.analyzeConversation` /
// `getAnalysisJobStatus` por monkey-patch (yolen-api.js,
// ux8-interaction-consistency-runtime.js, capture-resilience-null-base.js e
// phase16-9-runtime-guard.js, reinstalada ainda por
// companion-reasoning-view.js). A composição efetiva de produção era:
// retry explícito sempre reabre o job, independentemente de revisão local
// do DOM/captura, e status é sempre autoritativo do backend (o superseded
// sintético local era reconsultado). Estes testes fixam esse comportamento
// efetivo no dono único (yolen-api.js) e provam que nenhum runtime do
// manifest WhatsApp reatribui a API.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const EXTENSION_ROOT = new URL('../', import.meta.url)

const SOURCE = readFileSync(
  new URL('src/yolen-api.js', EXTENSION_ROOT),
  'utf8',
)

const JOB_ID = 'a'.repeat(64)
const CONVERSATION_KEY = 'phone:5511953442244'
const WATERMARK = '235:6f3cd7f8'

function deepSellerResult() {
  return {
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
}

function analysisResponse(status, watermark = WATERMARK) {
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
          message_watermark: watermark,
        },
      },
    },
  }
}

function statusResponse(status, {
  watermark = WATERMARK,
  result = null,
} = {}) {
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
        message_watermark: watermark,
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

function retryResponse(status = 'queued', watermark = WATERMARK) {
  return {
    ok: true,
    payload: {
      ok: true,
      data: {
        analysis_job_id: JOB_ID,
        status,
        message_watermark: watermark,
      },
    },
  }
}

function captureMessage(text) {
  return {
    contract_version: 'pt4-c-v4',
    cycle_id: 'aaaaaaaa-0000-4000-8000-0000000000d1',
    conversation_key: CONVERSATION_KEY,
    observed_at: '2026-08-23T10:00:01.000Z',
    messages: [
      {
        message_key: 'm1',
        direction: 'incoming',
        occurred_at: '2026-08-23T10:00:00.000Z',
        content_type: 'text',
        text_content: text,
        audio_transcription: null,
        is_deleted: false,
      },
    ],
  }
}

// Carrega yolen-api.js num realm isolado. `lexicalBrowser` reproduz o
// Firefox/WebExtension, em que `browser` é binding do realm isolado e não
// propriedade de window/globalThis.
function loadApi({
  onAnalyze,
  onStatus,
  onRetry,
  lexicalBrowser = false,
} = {}) {
  const calls = []
  let mutationObserversCreated = 0

  const runtime = {
    async sendMessage(request) {
      calls.push(request)

      if (request.action === 'ANALYZE_CONVERSATION') {
        return onAnalyze(request, calls)
      }

      if (request.action === 'GET_ANALYSIS_JOB_STATUS') {
        return onStatus(request, calls)
      }

      if (request.action === 'RETRY_ANALYSIS_JOB') {
        return onRetry(request, calls)
      }

      return {
        ok: true,
        payload: {
          ok: true,
          message_results: [],
        },
      }
    },
  }

  const window = {}

  class CountingMutationObserver {
    constructor() {
      mutationObserversCreated += 1
    }

    observe() {}
  }

  const sandbox = {
    window,
    document: {
      documentElement: {},
    },
    MutationObserver: CountingMutationObserver,
    console: {
      log() {},
      warn() {},
      error() {},
    },
    browser: lexicalBrowser ? undefined : { runtime },
    chrome: undefined,
  }

  vm.createContext(sandbox)

  if (lexicalBrowser) {
    sandbox.__testRuntime = runtime
    vm.runInContext(
      `{
        const browser = { runtime: __testRuntime }
        ${SOURCE}
      }`,
      sandbox,
    )
  } else {
    vm.runInContext(SOURCE, sandbox)
  }

  return {
    api: window.YolenCompanionApi,
    calls,
    window,
    sandbox,
    getMutationObserversCreated: () =>
      mutationObserversCreated,
  }
}

const countCalls = (calls, action) =>
  calls.filter((call) => call.action === action).length

test('retry manual reabre job failed sem depender de freshness local e envia só analysis_job_id', async () => {
  let runtimeRef = null

  const runtime = loadApi({
    async onAnalyze() {
      // A captura muda durante a própria requisição (virtualização/scroll
      // do WhatsApp ou nova ingestão): o clique explícito não pode ficar
      // refém disso.
      await runtimeRef.api.ingestCapturedMessages(
        captureMessage('mensagem que chegou durante a requisição'),
      )

      return analysisResponse('failed')
    },
    onRetry: () => retryResponse('queued'),
  })

  runtimeRef = runtime

  await runtime.api.ingestCapturedMessages(
    captureMessage('Olá'),
  )

  const result = await runtime.api.analyzeConversation({
    conversation_key: CONVERSATION_KEY,
    message_snapshot_hash: WATERMARK,
    retry_failed_job: true,
  })

  const retryCalls = runtime.calls.filter(
    (call) => call.action === 'RETRY_ANALYSIS_JOB',
  )

  assert.equal(retryCalls.length, 1)
  assert.deepEqual(
    Object.keys(retryCalls[0].payload),
    ['analysis_job_id'],
  )
  assert.equal(retryCalls[0].payload.analysis_job_id, JOB_ID)
  assert.equal(
    result.payload.data.deep_analysis.status,
    'queued',
  )

  const analyzeCall = runtime.calls.find(
    (call) => call.action === 'ANALYZE_CONVERSATION',
  )

  assert.equal(
    Object.hasOwn(analyzeCall.payload, 'retry_failed_job'),
    false,
    'flag local de retry nunca vai ao backend',
  )
})

test('retry manual reabre job failed mesmo sem conversation_key no payload', async () => {
  const runtime = loadApi({
    onAnalyze: () => analysisResponse('failed'),
    onRetry: () => retryResponse('queued'),
  })

  const result = await runtime.api.analyzeConversation({
    retry_failed_job: true,
  })

  assert.equal(
    countCalls(runtime.calls, 'RETRY_ANALYSIS_JOB'),
    1,
  )
  assert.equal(
    result.payload.data.deep_analysis.status,
    'queued',
  )
})

test('retry explícito é único: backend que ainda devolve failed não gera retries em cascata', async () => {
  const runtime = loadApi({
    onAnalyze: () => analysisResponse('failed'),
    onRetry: () => ({
      ok: true,
      payload: {
        ok: false,
        code: 'RETRY_NOT_ALLOWED',
      },
    }),
  })

  const result = await runtime.api.analyzeConversation({
    conversation_key: CONVERSATION_KEY,
    message_snapshot_hash: WATERMARK,
    retry_failed_job: true,
  })

  assert.equal(
    countCalls(runtime.calls, 'RETRY_ANALYSIS_JOB'),
    1,
  )
  assert.equal(
    result.payload.data.deep_analysis.status,
    'failed',
  )
})

test('retry manual usa browser lexical do realm isolado do Firefox', async () => {
  const runtime = loadApi({
    lexicalBrowser: true,
    onAnalyze: () => analysisResponse('failed'),
    onRetry: () => retryResponse('queued'),
  })

  assert.equal(
    runtime.sandbox.browser,
    undefined,
    'o teste não pode mascarar o caso real expondo browser no global',
  )

  const result = await runtime.api.analyzeConversation({
    conversation_key: CONVERSATION_KEY,
    retry_failed_job: true,
  })

  const retryCall = runtime.calls.find(
    (call) => call.action === 'RETRY_ANALYSIS_JOB',
  )

  assert.ok(retryCall)
  assert.equal(retryCall.baseUrl, runtime.api.getBaseUrl())
  assert.equal(
    result.payload.data.deep_analysis.status,
    'queued',
  )
})

test('análise automática ou job já reaberto não dispara retry', async () => {
  const automatic = loadApi({
    onAnalyze: () => analysisResponse('failed'),
    onRetry: () => retryResponse('queued'),
  })

  const automaticResult =
    await automatic.api.analyzeConversation({
      conversation_key: CONVERSATION_KEY,
      message_snapshot_hash: WATERMARK,
    })

  assert.equal(
    countCalls(automatic.calls, 'RETRY_ANALYSIS_JOB'),
    0,
  )
  assert.equal(
    automaticResult.payload.data.deep_analysis.status,
    'failed',
  )

  const alreadyQueued = loadApi({
    onAnalyze: () => analysisResponse('queued'),
    onRetry: () => retryResponse('queued'),
  })

  const queuedResult =
    await alreadyQueued.api.analyzeConversation({
      conversation_key: CONVERSATION_KEY,
      retry_failed_job: true,
    })

  assert.equal(
    countCalls(alreadyQueued.calls, 'RETRY_ANALYSIS_JOB'),
    0,
  )
  assert.equal(
    queuedResult.payload.data.deep_analysis.status,
    'queued',
  )
})

test('Atualizar análise reabre succeeded com allow_succeeded mesmo se a captura mudou durante a requisição', async () => {
  let runtimeRef = null

  const runtime = loadApi({
    async onAnalyze() {
      await runtimeRef.api.ingestCapturedMessages(
        captureMessage('mudou durante a requisição'),
      )

      return analysisResponse('succeeded')
    },
    onRetry: () => retryResponse('queued'),
  })

  runtimeRef = runtime

  const result = await runtime.api.analyzeConversation({
    conversation_key: CONVERSATION_KEY,
    message_snapshot_hash: WATERMARK,
    force_reanalysis: true,
  })

  const retryCalls = runtime.calls.filter(
    (call) => call.action === 'RETRY_ANALYSIS_JOB',
  )

  assert.equal(retryCalls.length, 1)
  // Objeto criado no realm do vm: compara por valor serializado.
  assert.deepEqual(JSON.parse(JSON.stringify(retryCalls[0].payload)), {
    analysis_job_id: JOB_ID,
    allow_succeeded: true,
  })
  assert.equal(
    result.payload.data.deep_analysis.status,
    'queued',
  )
})

test('status running do backend nunca vira superseded por mudança local de captura', async () => {
  const runtime = loadApi({
    onAnalyze: () => analysisResponse('queued'),
    onStatus: () => statusResponse('running'),
  })

  await runtime.api.ingestCapturedMessages(captureMessage('Olá'))

  await runtime.api.analyzeConversation({
    conversation_key: CONVERSATION_KEY,
    message_snapshot_hash: WATERMARK,
  })

  await runtime.api.ingestCapturedMessages(
    captureMessage('Olá (editado)'),
  )

  const result = await runtime.api.getAnalysisJobStatus({
    analysis_job_id: JOB_ID,
  })

  assert.equal(result.payload.data.status, 'running')
  assert.equal(
    countCalls(runtime.calls, 'GET_ANALYSIS_JOB_STATUS'),
    1,
  )
})

test('status succeeded autoritativo promove o deep result para a UI seller-facing', async () => {
  const deepResult = deepSellerResult()

  const runtime = loadApi({
    onAnalyze: () => analysisResponse('queued'),
    onStatus: () =>
      statusResponse('succeeded', {
        result: deepResult,
      }),
  })

  const analysisResult = await runtime.api.analyzeConversation({
    conversation_key: CONVERSATION_KEY,
    message_snapshot_hash: WATERMARK,
  })

  const statusResult = await runtime.api.getAnalysisJobStatus({
    analysis_job_id: JOB_ID,
  })

  assert.equal(statusResult.payload.data.status, 'succeeded')
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

test('job reaberto por Atualizar análise é promovido com o watermark devolvido pelo retry', async () => {
  const deepResult = deepSellerResult()
  const NEW_WATERMARK = '236:0a1b2c3d'

  const runtime = loadApi({
    onAnalyze: () => analysisResponse('succeeded'),
    onRetry: () => retryResponse('queued', NEW_WATERMARK),
    onStatus: () =>
      statusResponse('succeeded', {
        watermark: NEW_WATERMARK,
        result: deepResult,
      }),
  })

  const analysisResult = await runtime.api.analyzeConversation({
    conversation_key: CONVERSATION_KEY,
    message_snapshot_hash: WATERMARK,
    force_reanalysis: true,
  })

  const statusResult = await runtime.api.getAnalysisJobStatus({
    analysis_job_id: JOB_ID,
  })

  assert.equal(statusResult.payload.data.status, 'succeeded')
  assert.equal(
    analysisResult.payload.data.suggestion.next_action,
    deepResult.recommended_next_approach,
  )
})

test('superseded real do backend continua sendo respeitado', async () => {
  const runtime = loadApi({
    onAnalyze: () => analysisResponse('queued'),
    onStatus: () => statusResponse('superseded'),
  })

  await runtime.api.analyzeConversation({
    conversation_key: CONVERSATION_KEY,
    message_snapshot_hash: WATERMARK,
  })

  const result = await runtime.api.getAnalysisJobStatus({
    analysis_job_id: JOB_ID,
  })

  assert.equal(result.payload.data.status, 'superseded')
  assert.equal(
    countCalls(runtime.calls, 'GET_ANALYSIS_JOB_STATUS'),
    1,
  )
})

test('transporte não observa o DOM da plataforma', () => {
  const runtime = loadApi({
    onAnalyze: () => analysisResponse('queued'),
  })

  assert.equal(runtime.getMutationObserversCreated(), 0)
  assert.doesNotMatch(SOURCE, /data-pre-plain-text/)
  assert.doesNotMatch(SOURCE, /MutationObserver/)
})

test('nenhum runtime do manifest WhatsApp reatribui a API de análise', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('manifest.json', EXTENSION_ROOT), 'utf8'),
  )

  const whatsAppScripts = manifest.content_scripts.find(
    (entry) =>
      entry.matches.some((match) =>
        match.includes('web.whatsapp.com'),
      ),
  )

  assert.ok(whatsAppScripts)

  for (const file of whatsAppScripts.js) {
    const source = readFileSync(
      new URL(file, EXTENSION_ROOT),
      'utf8',
    )

    assert.doesNotMatch(
      source,
      /\.(analyzeConversation|getAnalysisJobStatus)\s*=(?!=)/,
      `${file} não pode reatribuir analyzeConversation/getAnalysisJobStatus`,
    )
  }
})
