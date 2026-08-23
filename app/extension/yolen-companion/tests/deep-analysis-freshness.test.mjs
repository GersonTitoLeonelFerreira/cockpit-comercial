import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const SOURCE = await readFile(
  new URL('../src/yolen-api.js', import.meta.url),
  'utf8',
)

const JOB_ID = 'a'.repeat(64)
const CONVERSATION_KEY = 'whatsapp:+5511999999999'
const WATERMARK = 'wm-1'

function message(overrides = {}) {
  return {
    message_key: 'm1',
    direction: 'incoming',
    occurred_at: '2026-08-23T10:00:00.000Z',
    observed_at: '2026-08-23T10:00:01.000Z',
    base_version: null,
    content_type: 'text',
    text_content: 'Olá',
    audio_transcription: null,
    is_deleted: false,
    ...overrides,
  }
}

function capture(messages) {
  return {
    contract_version: 'pt4-c-v4',
    cycle_id: 'aaaaaaaa-0000-4000-8000-0000000000d1',
    conversation_key: CONVERSATION_KEY,
    observed_at: '2026-08-23T10:00:01.000Z',
    messages,
  }
}

function commercialReading(relevance = 'commercial') {
  return {
    contract_version: 'commercial-reading-v1',
    commercial_role: relevance === 'commercial' ? 'buyer' : 'unknown',
    commercial_relevance: relevance,
    method: {
      configured: relevance === 'commercial',
      name: relevance === 'commercial' ? 'Método Deep' : null,
    },
    customer: {
      needs: relevance === 'commercial'
        ? [{ summary: 'Necessidade profunda' }]
        : [],
    },
  }
}

function deepSellerResult(relevance = 'commercial') {
  return {
    contract_version: 'phase12a-deep-seller-v1',
    engine_source: 'stateful',
    commercial_relevance: relevance,
    commercial_role: relevance === 'commercial' ? 'buyer' : 'unknown',
    summary: relevance === 'commercial'
      ? 'Resumo profundo comercial'
      : 'Conversa sem evidência comercial',
    commercial_reading: commercialReading(relevance),
    recommended_next_approach: relevance === 'commercial'
      ? 'Aprofundar descoberta'
      : 'Não intervir comercialmente',
    recommended_question: relevance === 'commercial'
      ? 'Qual impacto isso gera hoje?'
      : null,
    suggested_message: relevance === 'commercial'
      ? 'Mensagem profunda sugerida'
      : null,
  }
}

function messageElement() {
  return {
    nodeType: 1,
    parentElement: null,
    closest(selector) {
      return selector === '[data-pre-plain-text]'
        ? this
        : null
    },
    matches(selector) {
      return selector === '[data-pre-plain-text]'
    },
    querySelector() {
      return null
    },
  }
}

function loadApi({
  analyzeResponder,
  statusResponder,
  retryResponder,
} = {}) {
  const calls = []
  let mutationCallback = null

  class FakeMutationObserver {
    constructor(callback) {
      mutationCallback = callback
    }

    observe() {}
  }

  const window = {}
  const document = {
    documentElement: {},
  }

  const chrome = {
    runtime: {
      async sendMessage(request) {
        calls.push(request)

        if (request.action === 'ANALYZE_CONVERSATION') {
          if (analyzeResponder) {
            return analyzeResponder(request, calls)
          }

          return {
            ok: true,
            payload: {
              ok: true,
              data: {
                engine_source: 'v1',
                suggestion: {
                  summary: 'Resumo rápido',
                  next_action: 'Ação rápida antiga',
                  next_action_date: '2026-08-24',
                  recommended_status: 'negociacao',
                },
                coaching: {
                  suggested_message: 'Mensagem rápida antiga',
                },
                deep_analysis: {
                  analysis_job_id: JOB_ID,
                  status: 'queued',
                  message_watermark: WATERMARK,
                },
              },
            },
          }
        }

        if (request.action === 'GET_ANALYSIS_JOB_STATUS') {
          if (statusResponder) {
            return statusResponder(request, calls)
          }

          return {
            ok: true,
            payload: {
              ok: true,
              data: {
                analysis_job_id: JOB_ID,
                status: 'succeeded',
                message_watermark: WATERMARK,
                result: deepSellerResult(),
              },
            },
          }
        }

        if (request.action === 'RETRY_ANALYSIS_JOB') {
          if (retryResponder) {
            return retryResponder(request, calls)
          }

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

        return {
          ok: true,
          payload: { ok: true },
        }
      },
    },
  }

  vm.runInNewContext(
    SOURCE,
    {
      window,
      document,
      MutationObserver: FakeMutationObserver,
      chrome,
      browser: undefined,
      console,
      Map,
      JSON,
      String,
      Error,
    },
  )

  return {
    api: window.YolenCompanionApi,
    calls,
    mutateMessageDom() {
      mutationCallback?.([
        {
          target: messageElement(),
          addedNodes: [],
          removedNodes: [],
        },
      ])
    },
  }
}

async function establishJob(runtime) {
  await runtime.api.ingestCapturedMessages(
    capture([message()]),
  )

  return runtime.api.analyzeConversation({
    conversation_key: CONVERSATION_KEY,
    message_snapshot_hash: WATERMARK,
  })
}

for (const [label, messages] of [
  [
    'nova mensagem',
    [
      message(),
      message({
        message_key: 'm2',
        text_content: 'Nova mensagem',
      }),
    ],
  ],
  [
    'edição',
    [message({ text_content: 'Olá editado' })],
  ],
  [
    'deleção',
    [message({ text_content: null, is_deleted: true })],
  ],
  [
    'transcrição de áudio',
    [message({
      content_type: 'audio',
      text_content: null,
      audio_transcription: 'Áudio transcrito',
    })],
  ],
]) {
  test(`stale: ${label} invalida succeeded antigo antes de aplicá-lo`, async () => {
    const runtime = loadApi()
    await establishJob(runtime)

    const remoteReadsBefore = runtime.calls.filter(
      (call) => call.action === 'GET_ANALYSIS_JOB_STATUS',
    ).length

    await runtime.api.ingestCapturedMessages(
      capture(messages),
    )

    const response = await runtime.api.getAnalysisJobStatus({
      analysis_job_id: JOB_ID,
    })

    assert.equal(response.payload.data.status, 'superseded')
    assert.equal(
      runtime.calls.filter(
        (call) => call.action === 'GET_ANALYSIS_JOB_STATUS',
      ).length,
      remoteReadsBefore,
      'job semanticamente stale deve ser barrado antes do read remoto',
    )
  })
}

test('stale: restore invalida o job anterior', async () => {
  const runtime = loadApi()
  await establishJob(runtime)

  await runtime.api.ingestCapturedMessages(
    capture([
      message({
        text_content: null,
        is_deleted: true,
      }),
    ]),
  )

  await runtime.api.ingestCapturedMessages(
    capture([
      message({
        text_content: 'Mensagem restaurada',
        is_deleted: false,
      }),
    ]),
  )

  const response = await runtime.api.getAnalysisJobStatus({
    analysis_job_id: JOB_ID,
  })

  assert.equal(response.payload.data.status, 'superseded')
})

test('stale window: mutação DOM invalida job antes do próximo ingest/debounce', async () => {
  const runtime = loadApi()
  await establishJob(runtime)

  runtime.mutateMessageDom()

  const response = await runtime.api.getAnalysisJobStatus({
    analysis_job_id: JOB_ID,
  })

  assert.equal(response.payload.data.status, 'superseded')
  assert.equal(
    runtime.calls.filter(
      (call) => call.action === 'GET_ANALYSIS_JOB_STATUS',
    ).length,
    0,
  )
})

test('poll fresco envia ao backend apenas analysis_job_id e promove DTO no objeto seller-facing compartilhado', async () => {
  const runtime = loadApi()
  const analyzeResponse = await establishJob(runtime)
  const analysisDataRef = analyzeResponse.payload.data

  const response = await runtime.api.getAnalysisJobStatus({
    analysis_job_id: JOB_ID,
    cycle_id: 'cliente-nao-controla',
    conversation_key: 'cliente-nao-controla',
  })

  assert.equal(response.payload.data.status, 'succeeded')

  const statusCall = runtime.calls.find(
    (call) => call.action === 'GET_ANALYSIS_JOB_STATUS',
  )
  assert.deepEqual(
    Object.keys(statusCall.payload),
    ['analysis_job_id'],
  )

  assert.equal(analysisDataRef.engine_source, 'stateful')
  assert.equal(
    analysisDataRef.commercial_reading.contract_version,
    'commercial-reading-v1',
  )
  assert.equal(
    analysisDataRef.commercial_reading.method.name,
    'Método Deep',
  )
  assert.equal(
    analysisDataRef.suggestion.next_action,
    'Aprofundar descoberta',
  )
  assert.equal(
    analysisDataRef.coaching.suggested_message,
    'Mensagem profunda sugerida',
  )

  /* compatibilidade local com o bloco mínimo do content-script atual */
  assert.equal(
    response.payload.data.result.interpretation.current_moment.summary,
    'Resumo profundo comercial',
  )
  assert.equal(
    response.payload.data.result.strategy.suggested_message,
    'Mensagem profunda sugerida',
  )
})

test('non-commercial substitui atomicamente CTA/next action antigos', async () => {
  const runtime = loadApi({
    statusResponder() {
      return {
        ok: true,
        payload: {
          ok: true,
          data: {
            analysis_job_id: JOB_ID,
            status: 'succeeded',
            message_watermark: WATERMARK,
            result: deepSellerResult('non_commercial'),
          },
        },
      }
    },
  })

  const analyzeResponse = await establishJob(runtime)
  const analysisDataRef = analyzeResponse.payload.data

  await runtime.api.getAnalysisJobStatus({
    analysis_job_id: JOB_ID,
  })

  assert.equal(analysisDataRef.engine_source, 'stateful')
  assert.equal(
    analysisDataRef.commercial_reading.commercial_relevance,
    'non_commercial',
  )
  assert.equal(analysisDataRef.suggestion.next_action, null)
  assert.equal(analysisDataRef.suggestion.next_action_date, null)
  assert.equal(analysisDataRef.suggestion.recommended_status, null)
  assert.equal(analysisDataRef.coaching.suggested_message, null)
})

test('failed observado só requeue no próximo analyze do mesmo snapshot; primeira falha não auto-retry', async () => {
  const runtime = loadApi({
    analyzeResponder() {
      return {
        ok: true,
        payload: {
          ok: true,
          data: {
            engine_source: 'v1',
            suggestion: { summary: 'rápido' },
            coaching: {},
            deep_analysis: {
              analysis_job_id: JOB_ID,
              status: 'failed',
              message_watermark: WATERMARK,
            },
          },
        },
      }
    },
  })

  await runtime.api.ingestCapturedMessages(
    capture([message()]),
  )

  const first = await runtime.api.analyzeConversation({
    conversation_key: CONVERSATION_KEY,
    message_snapshot_hash: WATERMARK,
  })

  assert.equal(first.payload.data.deep_analysis.status, 'failed')
  assert.equal(
    runtime.calls.filter(
      (call) => call.action === 'RETRY_ANALYSIS_JOB',
    ).length,
    0,
  )

  const second = await runtime.api.analyzeConversation({
    conversation_key: CONVERSATION_KEY,
    message_snapshot_hash: WATERMARK,
  })

  assert.equal(second.payload.data.deep_analysis.status, 'queued')
  assert.equal(
    runtime.calls.filter(
      (call) => call.action === 'RETRY_ANALYSIS_JOB',
    ).length,
    1,
  )
})

test('watermark divergente na resposta succeeded é descartado como superseded', async () => {
  const runtime = loadApi({
    statusResponder() {
      return {
        ok: true,
        payload: {
          ok: true,
          data: {
            analysis_job_id: JOB_ID,
            status: 'succeeded',
            message_watermark: 'outro-watermark',
            result: deepSellerResult(),
          },
        },
      }
    },
  })

  await establishJob(runtime)

  const response = await runtime.api.getAnalysisJobStatus({
    analysis_job_id: JOB_ID,
  })

  assert.equal(response.payload.data.status, 'superseded')
})
