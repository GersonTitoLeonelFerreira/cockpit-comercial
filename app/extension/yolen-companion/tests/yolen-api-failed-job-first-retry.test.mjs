import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const source =
  fs.readFileSync(
    new URL(
      '../src/yolen-api.js',
      import.meta.url,
    ),
    'utf8',
  )

function loadApi(
  responder,
) {
  const calls = []
  const window = {}

  const browser = {
    runtime: {
      async sendMessage(message) {
        calls.push(message)
        return responder(message)
      },
    },
  }

  vm.runInNewContext(
    source,
    {
      window,
      browser,
      console,
    },
  )

  return {
    api:
      window.YolenCompanionApi,
    calls,
  }
}

test(
  'retry explícito de job failed funciona no primeiro clique mesmo após reload/cache local vazio',
  async () => {
    const analysisJobId =
      'a'.repeat(64)

    const {
      api,
      calls,
    } = loadApi(
      async (message) => {
        if (
          message.action ===
          'ANALYZE_CONVERSATION'
        ) {
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
                    'failed',
                  message_watermark:
                    'wm-1',
                },
              },
            },
          }
        }

        if (
          message.action ===
          'RETRY_ANALYSIS_JOB'
        ) {
          return {
            ok: true,
            statusCode: 200,
            payload: {
              ok: true,
              data: {
                analysis_job_id:
                  analysisJobId,
                status:
                  'queued',
                message_watermark:
                  'wm-1',
              },
            },
          }
        }

        throw new Error(
          `ação inesperada: ${message.action}`,
        )
      },
    )

    const result =
      await api.analyzeConversation({
        cycle_id:
          'aaaaaaaa-0000-4000-8000-0000000000d1',
        conversation_key:
          'phone:5511999999999',
        conversation_text:
          'Cliente pediu informações sobre o plano mensal.',
        messages: [],
        source:
          'whatsapp',
        retry_failed_job:
          true,
        message_snapshot_hash:
          'wm-1',
      })

    assert.deepEqual(
      calls.map(
        (call) => call.action,
      ),
      [
        'ANALYZE_CONVERSATION',
        'RETRY_ANALYSIS_JOB',
      ],
    )

    assert.equal(
      calls[0].payload
        .retry_failed_job,
      undefined,
      'retry_failed_job é um sinal interno da extensão e não deve vazar para a rota normal de análise',
    )

    assert.deepEqual(
      calls[1].payload,
      {
        analysis_job_id:
          analysisJobId,
      },
    )

    assert.equal(
      result.payload.data
        .deep_analysis.status,
      'queued',
    )
  },
)
