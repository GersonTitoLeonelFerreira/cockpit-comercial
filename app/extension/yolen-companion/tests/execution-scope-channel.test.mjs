// R10 — o pacote de cada canal só acompanha job/resultado do próprio
// ambiente: PROD ↔ production, HOMOLOG ↔ homolog. Uma resposta de outro
// ambiente é descartada no transporte (nunca promovida a resultado).
// Backend anterior ao R10 não informa escopo: legado = produção.

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const SOURCE = await readFile(new URL('../src/yolen-api.js', import.meta.url), 'utf8')

const JOB_ID = 'a'.repeat(64)
const WATERMARK = 'wm-1'

function deepSellerResult(summary) {
  return {
    contract_version: 'phase12a-deep-seller-v1',
    engine_source: 'stateful',
    commercial_relevance: 'commercial',
    commercial_role: 'buyer',
    summary,
    commercial_reading: {
      contract_version: 'commercial-reading-v1',
      commercial_role: 'buyer',
      commercial_relevance: 'commercial',
      method: { configured: false, name: null },
      customer: { needs: [] },
    },
    recommended_next_approach: 'Aprofundar descoberta',
    recommended_question: null,
    suggested_message: null,
  }
}

function loadApi(channel, { analyzeScope, statusScope }) {
  const window = {}
  const withScope = (data, scope) => (scope === undefined ? data : { ...data, execution_scope: scope })

  const chrome = {
    runtime: {
      async sendMessage(request) {
        if (request.action === 'ANALYZE_CONVERSATION') {
          return {
            ok: true,
            payload: {
              ok: true,
              data: {
                deep_analysis: withScope({ analysis_job_id: JOB_ID, status: 'queued', message_watermark: WATERMARK }, analyzeScope),
              },
            },
          }
        }

        if (request.action === 'GET_ANALYSIS_JOB_STATUS') {
          return {
            ok: true,
            payload: {
              ok: true,
              data: withScope({
                analysis_job_id: JOB_ID,
                status: 'succeeded',
                message_watermark: WATERMARK,
                result: deepSellerResult(`Leitura de ${statusScope ?? 'legado'}`),
              }, statusScope),
            },
          }
        }

        return { ok: true, payload: { ok: true } }
      },
    },
  }

  vm.runInNewContext(SOURCE, {
    window,
    document: { documentElement: {} },
    chrome,
    browser: undefined,
    console: { ...console, log: () => {} },
    Map,
    JSON,
    String,
    Error,
    YolenCompanionEnvironment: channel
      ? { channel, api_base_url: 'https://example.test', allowed_base_urls: ['https://example.test'], backend_match_required: channel === 'homolog' }
      : undefined,
  })

  return window.YolenCompanionApi
}

async function run(channel, scopes) {
  const api = loadApi(channel, scopes)
  const analyzed = await api.analyzeConversation({ conversation_key: 'whatsapp:+5544000023820', message_snapshot_hash: WATERMARK })
  const status = analyzed.ok ? await api.getAnalysisJobStatus({ analysis_job_id: JOB_ID }) : null
  return { api, analyzed, status }
}

test('HOMOLOG só acompanha job homolog; job/resultado de produção é descartado', async () => {
  const ok = await run('homolog', { analyzeScope: 'homolog', statusScope: 'homolog' })
  assert.equal(ok.api.getExpectedExecutionScope(), 'homolog')
  assert.equal(ok.analyzed.payload.data.deep_analysis.execution_scope, 'homolog')
  assert.equal(ok.status.payload.data.result.summary, 'Leitura de homolog')

  for (const analyzeScope of ['production', undefined]) {
    const rejected = await run('homolog', { analyzeScope, statusScope: 'homolog' })
    assert.equal(rejected.analyzed.ok, false)
    assert.equal(rejected.analyzed.payload.code, 'EXECUTION_SCOPE_MISMATCH')
    assert.equal(rejected.analyzed.payload.expected_execution_scope, 'homolog')
  }

  for (const statusScope of ['production', undefined]) {
    const rejected = await run('homolog', { analyzeScope: 'homolog', statusScope })
    assert.equal(rejected.status.ok, false, 'F: polling HML nunca aceita resultado de produção')
    assert.equal(rejected.status.payload.code, 'EXECUTION_SCOPE_MISMATCH')
    assert.equal(rejected.status.payload.data, undefined)
  }
})

test('PROD só acompanha job de produção; legado sem escopo é produção; job homolog é descartado', async () => {
  const legacy = await run('prod', { analyzeScope: undefined, statusScope: undefined })
  assert.equal(legacy.api.getExpectedExecutionScope(), 'production')
  assert.equal(legacy.analyzed.ok, true)
  assert.equal(legacy.status.payload.data.result.summary, 'Leitura de legado')

  const scoped = await run('prod', { analyzeScope: 'production', statusScope: 'production' })
  assert.equal(scoped.status.payload.data.result.summary, 'Leitura de production')

  const hmlJob = await run('prod', { analyzeScope: 'homolog', statusScope: 'homolog' })
  assert.equal(hmlJob.analyzed.payload.code, 'EXECUTION_SCOPE_MISMATCH')

  const hmlResult = await run('prod', { analyzeScope: 'production', statusScope: 'homolog' })
  assert.equal(hmlResult.status.payload.code, 'EXECUTION_SCOPE_MISMATCH', 'G: resultado HML nunca aparece no PROD')
})

test('dev/e2e não impõem escopo (backend local/preview de desenvolvimento)', async () => {
  for (const channel of ['dev', undefined]) {
    const { api, status } = await run(channel, { analyzeScope: 'homolog', statusScope: 'production' })
    assert.equal(api.getExpectedExecutionScope(), null)
    assert.equal(status.ok, true)
  }
})
