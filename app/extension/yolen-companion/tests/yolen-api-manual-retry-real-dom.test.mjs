// FASE 16.9 — hotfix de runtime real (Firefox).
//
// yolen-api-failed-job-first-retry.test.mjs já cobria o retry manual, mas
// roda num contexto `vm` sem `document`/`MutationObserver` — nesse
// ambiente, installImmediateMessageMutationGuard() nunca instala o
// observer e messageDomRevision NUNCA muda, então isFreshnessStillCurrent()
// sempre "passava" por construção. Numa aba real do WhatsApp Web o DOM de
// mensagens remonta/vira continuamente (indicador de digitação, confirmação
// de leitura, timestamps), então a guarda quase sempre falhava exatamente
// durante a janela de rede do ANALYZE_CONVERSATION — e o retry manual (ou o
// polling de status) nunca chegava a acontecer, apesar do clique do
// vendedor. Este arquivo carrega yolen-api.js com um `document`/
// `MutationObserver` reais (jsdom) e mutila o DOM DURANTE cada chamada de
// rede para provar que:
//   A) retry manual ignora freshness efêmera de DOM;
//   B) identidade de job/conversa é preservada através do retry;
//   C) não há retry duplicado;
//   D) failed -> queued/running;
//   F) succeeded autoritativo ainda promove o resultado seller-facing;
//   G) superseded REAL do backend continua respeitado;
//   e que staleness semântica (message_watermark) — a única forma válida
//   de considerar um succeeded como stale — continua funcionando mesmo
//   sem depender mais do DOM.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'

const source = fs.readFileSync(
  new URL('../src/yolen-api.js', import.meta.url),
  'utf8',
)

const CONVERSATION_KEY = 'phone:5511953442244'
const CYCLE_ID = '78138694-ee53-44c9-81f5-94ce41abba74'

function loadApiWithRealDom({
  analyzeStatus = 'failed',
  retryStatus = 'queued',
  mutateDomDuring = [],
  statusResponder = null,
  analysisJobId = 'a'.repeat(64),
  messageWatermark = 'wm-1',
} = {}) {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="app"></div></body></html>',
    { url: 'https://web.whatsapp.com/' },
  )

  const { window } = dom
  const calls = []

  function mutateWhatsAppDom() {
    const bubble = window.document.createElement('div')
    bubble.setAttribute(
      'data-pre-plain-text',
      '[10:00, 01/01/2026] Cliente: ',
    )
    window.document
      .getElementById('app')
      .appendChild(bubble)
    window.document
      .getElementById('app')
      .removeChild(bubble)
  }

  // jsdom entrega o callback do MutationObserver como microtask. Um
  // `setTimeout` (macrotask) garante que ele já rodou antes de resolvermos
  // a promise do sendMessage — exatamente a janela real em que o WhatsApp
  // remonta o DOM enquanto uma requisição de rede está em voo.
  async function letMutationObserverFlush() {
    await new Promise((resolve) => {
      window.setTimeout(resolve, 0)
    })
  }

  const browser = {
    runtime: {
      async sendMessage(message) {
        calls.push(message)

        if (mutateDomDuring.includes(message.action)) {
          mutateWhatsAppDom()
          await letMutationObserverFlush()
        }

        if (message.action === 'ANALYZE_CONVERSATION') {
          return {
            ok: true,
            statusCode: 200,
            payload: {
              ok: true,
              data: {
                deep_analysis: {
                  analysis_job_id: analysisJobId,
                  status: analyzeStatus,
                  message_watermark: messageWatermark,
                },
              },
            },
          }
        }

        if (message.action === 'RETRY_ANALYSIS_JOB') {
          return {
            ok: true,
            statusCode: 200,
            payload: {
              ok: true,
              data: {
                analysis_job_id: analysisJobId,
                status: retryStatus,
                message_watermark: messageWatermark,
              },
            },
          }
        }

        if (message.action === 'GET_ANALYSIS_JOB_STATUS') {
          if (typeof statusResponder === 'function') {
            return statusResponder(message)
          }

          return {
            ok: true,
            statusCode: 200,
            payload: {
              ok: true,
              data: {
                analysis_job_id: analysisJobId,
                status: 'running',
                cycle_id: CYCLE_ID,
                conversation_key: CONVERSATION_KEY,
                message_watermark: messageWatermark,
                candidate_state_version: null,
                failure_code: null,
                result: null,
                result_generated_at: null,
              },
            },
          }
        }

        if (message.action === 'INGEST_CAPTURE_MESSAGES') {
          return {
            ok: true,
            statusCode: 200,
            payload: {
              ok: true,
              message_results: [],
            },
          }
        }

        throw new Error(`ação inesperada: ${message.action}`)
      },
    },
  }

  const sandbox = {
    window,
    document: window.document,
    MutationObserver: window.MutationObserver,
    browser,
    console,
  }

  sandbox.globalThis = sandbox

  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, {
    filename: 'yolen-api.js',
  })

  return {
    api: window.YolenCompanionApi,
    calls,
    analysisJobId,
    mutateWhatsAppDom,
  }
}

test('A: retry manual ignora freshness efêmera de DOM durante o round-trip (reproduz o bug real do Firefox)', async () => {
  const { api, calls, analysisJobId } = loadApiWithRealDom({
    analyzeStatus: 'failed',
    retryStatus: 'queued',
    mutateDomDuring: ['ANALYZE_CONVERSATION'],
  })

  const result = await api.analyzeConversation({
    conversation_key: CONVERSATION_KEY,
    retry_failed_job: true,
    message_snapshot_hash: 'wm-1',
  })

  assert.deepEqual(
    calls.map((call) => call.action),
    ['ANALYZE_CONVERSATION', 'RETRY_ANALYSIS_JOB'],
    'o DOM ter mudado durante ANALYZE_CONVERSATION não pode impedir o retry explícito',
  )

  assert.equal(
    result.payload.data.deep_analysis.status,
    'queued',
  )
  assert.equal(
    result.payload.data.deep_analysis.analysis_job_id,
    analysisJobId,
  )
})

test('B: identidade do job é preservada do retry até o polling, mesmo com DOM mudando entre as chamadas', async () => {
  const { api, calls, analysisJobId } = loadApiWithRealDom({
    analyzeStatus: 'failed',
    retryStatus: 'running',
    mutateDomDuring: ['ANALYZE_CONVERSATION', 'GET_ANALYSIS_JOB_STATUS'],
  })

  const analyzeResult = await api.analyzeConversation({
    conversation_key: CONVERSATION_KEY,
    retry_failed_job: true,
    message_snapshot_hash: 'wm-1',
  })

  assert.equal(
    analyzeResult.payload.data.deep_analysis.analysis_job_id,
    analysisJobId,
  )
  assert.equal(
    analyzeResult.payload.data.deep_analysis.status,
    'running',
  )

  const statusResult = await api.getAnalysisJobStatus({
    analysis_job_id: analysisJobId,
  })

  assert.equal(
    statusResult.payload.data.analysis_job_id,
    analysisJobId,
  )
  assert.equal(
    statusResult.payload.data.status,
    'running',
    'polling não pode inventar um status superseded local só porque o DOM mudou',
  )
  assert.equal(
    calls.filter((call) => call.action === 'RETRY_ANALYSIS_JOB').length,
    1,
  )
})

test('C: não duplica RETRY_ANALYSIS_JOB quando o job já não está mais failed', async () => {
  const { api, calls } = loadApiWithRealDom({
    analyzeStatus: 'queued',
  })

  const result = await api.analyzeConversation({
    conversation_key: CONVERSATION_KEY,
    retry_failed_job: true,
    message_snapshot_hash: 'wm-1',
  })

  assert.deepEqual(
    calls.map((call) => call.action),
    ['ANALYZE_CONVERSATION'],
  )
  assert.equal(
    result.payload.data.deep_analysis.status,
    'queued',
  )
})

test('C.2: análise automática (sem intenção explícita do vendedor) não dispara retry paralelo', async () => {
  const { api, calls } = loadApiWithRealDom({
    analyzeStatus: 'failed',
    mutateDomDuring: ['ANALYZE_CONVERSATION'],
  })

  const result = await api.analyzeConversation({
    conversation_key: CONVERSATION_KEY,
    message_snapshot_hash: 'wm-1',
  })

  assert.deepEqual(
    calls.map((call) => call.action),
    ['ANALYZE_CONVERSATION'],
  )
  assert.equal(
    result.payload.data.deep_analysis.status,
    'failed',
  )
})

test('D: backend failed -> running (não só queued) após retry explícito', async () => {
  const { api, calls } = loadApiWithRealDom({
    analyzeStatus: 'failed',
    retryStatus: 'running',
    mutateDomDuring: ['ANALYZE_CONVERSATION'],
  })

  const result = await api.analyzeConversation({
    conversation_key: CONVERSATION_KEY,
    retry_failed_job: true,
    message_snapshot_hash: 'wm-1',
  })

  assert.deepEqual(
    calls.map((call) => call.action),
    ['ANALYZE_CONVERSATION', 'RETRY_ANALYSIS_JOB'],
  )
  assert.equal(
    result.payload.data.deep_analysis.status,
    'running',
  )
})

test('F: status succeeded autoritativo é promovido para o formato seller-facing mesmo com DOM mudando durante o poll de um clique explícito', async () => {
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

  const { api, calls, analysisJobId } = loadApiWithRealDom({
    analyzeStatus: 'queued',
    mutateDomDuring: ['GET_ANALYSIS_JOB_STATUS'],
    statusResponder: () => ({
      ok: true,
      statusCode: 200,
      payload: {
        ok: true,
        data: {
          analysis_job_id: analysisJobId,
          status: 'succeeded',
          cycle_id: CYCLE_ID,
          conversation_key: CONVERSATION_KEY,
          message_watermark: 'wm-1',
          candidate_state_version: 9,
          failure_code: null,
          result: deepResult,
          result_generated_at: '2026-09-13T00:30:00.000Z',
        },
      },
    }),
  })

  // force_reanalysis:true é o que content-script.js sempre envia para
  // qualquer clique manual do vendedor (Analisar agora/Atualizar análise),
  // não só para o caso específico de retry de um job failed — é isso que
  // marca este job como freshness.explicitSellerIntent=true.
  await api.analyzeConversation({
    conversation_key: CONVERSATION_KEY,
    message_snapshot_hash: 'wm-1',
    force_reanalysis: true,
  })

  const statusResult = await api.getAnalysisJobStatus({
    analysis_job_id: analysisJobId,
  })

  assert.equal(
    statusResult.payload.data.status,
    'succeeded',
  )
  assert.equal(
    statusResult.payload.data.result.interpretation
      .current_moment.summary,
    deepResult.summary,
  )
  assert.equal(
    calls.filter((call) => call.action === 'RETRY_ANALYSIS_JOB').length,
    0,
    'succeeded sem force_reanalysis não deve disparar retry',
  )
})

test('G: superseded REAL do backend continua respeitado (não é confundido com o antigo superseded local)', async () => {
  const { api, analysisJobId } = loadApiWithRealDom({
    analyzeStatus: 'queued',
    statusResponder: (message) => ({
      ok: true,
      statusCode: 200,
      payload: {
        ok: true,
        data: {
          analysis_job_id: message.payload.analysis_job_id,
          status: 'superseded',
          cycle_id: CYCLE_ID,
          conversation_key: CONVERSATION_KEY,
          message_watermark: 'wm-2',
          candidate_state_version: null,
          failure_code: null,
          result: null,
          result_generated_at: null,
        },
      },
    }),
  })

  await api.analyzeConversation({
    conversation_key: CONVERSATION_KEY,
    message_snapshot_hash: 'wm-1',
  })

  const statusResult = await api.getAnalysisJobStatus({
    analysis_job_id: analysisJobId,
  })

  assert.equal(
    statusResult.payload.data.status,
    'superseded',
  )
  assert.equal(
    statusResult.payload.data.cycle_id,
    CYCLE_ID,
    'superseded real do backend preserva cycle_id/conversation_key — só o superseded sintético local não tinha esses campos',
  )
})

test('staleness semântica continua funcionando: succeeded com message_watermark divergente ainda vira superseded', async () => {
  const { api, analysisJobId } = loadApiWithRealDom({
    analyzeStatus: 'queued',
    messageWatermark: 'wm-1',
    statusResponder: () => ({
      ok: true,
      statusCode: 200,
      payload: {
        ok: true,
        data: {
          analysis_job_id: analysisJobId,
          status: 'succeeded',
          cycle_id: CYCLE_ID,
          conversation_key: CONVERSATION_KEY,
          // Watermark diferente do que foi registrado no analyzeConversation
          // original: este succeeded pertence a um snapshot de mensagens
          // mais antigo — staleness real, não ephemeral de DOM.
          message_watermark: 'wm-DIFFERENTE',
          candidate_state_version: 9,
          failure_code: null,
          result: {
            contract_version: 'phase12a-deep-seller-v1',
            commercial_relevance: 'commercial',
            commercial_reading: {},
          },
          result_generated_at: '2026-09-13T00:30:00.000Z',
        },
      },
    }),
  })

  await api.analyzeConversation({
    conversation_key: CONVERSATION_KEY,
    message_snapshot_hash: 'wm-1',
  })

  const statusResult = await api.getAnalysisJobStatus({
    analysis_job_id: analysisJobId,
  })

  assert.equal(
    statusResult.payload.data.status,
    'superseded',
  )
})

test('regressão: polling de job PURAMENTE automático (sem clique explícito) continua protegido de ruído efêmero de DOM', async () => {
  const { api, calls, analysisJobId, mutateWhatsAppDom } =
    loadApiWithRealDom({
      analyzeStatus: 'queued',
    })

  await api.analyzeConversation({
    conversation_key: CONVERSATION_KEY,
    message_snapshot_hash: 'wm-1',
  })

  const remoteReadsBefore = calls.filter(
    (call) => call.action === 'GET_ANALYSIS_JOB_STATUS',
  ).length

  mutateWhatsAppDom()
  await new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

  const statusResult = await api.getAnalysisJobStatus({
    analysis_job_id: analysisJobId,
  })

  assert.equal(
    statusResult.payload.data.status,
    'superseded',
    'sem clique explícito, a janela DOM->debounce continua protegida (mesma regra de deep-analysis-freshness.test.mjs)',
  )
  assert.equal(
    calls.filter((call) => call.action === 'GET_ANALYSIS_JOB_STATUS')
      .length,
    remoteReadsBefore,
    'job automaticamente stale é barrado antes do read remoto, sem gastar uma chamada de rede',
  )
})

test('intenção explícita ignora só o DOM: staleness SEMÂNTICA (conteúdo real mudou) continua barrando mesmo um clique manual', async () => {
  const { api, analysisJobId } = loadApiWithRealDom({
    analyzeStatus: 'queued',
  })

  await api.ingestCapturedMessages({
    contract_version: 'pt4-c-v4',
    cycle_id: CYCLE_ID,
    conversation_key: CONVERSATION_KEY,
    observed_at: '2026-09-13T10:00:01.000Z',
    messages: [
      {
        message_key: 'm1',
        direction: 'incoming',
        occurred_at: '2026-09-13T10:00:00.000Z',
        content_type: 'text',
        text_content: 'Mensagem original',
        is_deleted: false,
      },
    ],
  })

  await api.analyzeConversation({
    conversation_key: CONVERSATION_KEY,
    message_snapshot_hash: 'wm-1',
    force_reanalysis: true,
  })

  // Conteúdo real da conversa mudou depois que a análise foi pedida —
  // diferente de virtualização, isto é uma mudança semântica genuína.
  await api.ingestCapturedMessages({
    contract_version: 'pt4-c-v4',
    cycle_id: CYCLE_ID,
    conversation_key: CONVERSATION_KEY,
    observed_at: '2026-09-13T10:00:05.000Z',
    messages: [
      {
        message_key: 'm1',
        direction: 'incoming',
        occurred_at: '2026-09-13T10:00:00.000Z',
        content_type: 'text',
        text_content: 'Mensagem original',
        is_deleted: false,
      },
      {
        message_key: 'm2',
        direction: 'incoming',
        occurred_at: '2026-09-13T10:00:06.000Z',
        content_type: 'text',
        text_content: 'Mensagem nova enquanto a análise estava em voo',
        is_deleted: false,
      },
    ],
  })

  const statusResult = await api.getAnalysisJobStatus({
    analysis_job_id: analysisJobId,
  })

  assert.equal(
    statusResult.payload.data.status,
    'superseded',
    'intenção explícita ignora apenas a freshness efêmera de DOM — mudança real de conteúdo continua valendo',
  )
})
