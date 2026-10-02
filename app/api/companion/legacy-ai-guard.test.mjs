// Rodada 7 (economia de créditos): com a leitura completa ligada
// (COMPANION_FULL_READING_PANEL=on e VERCEL_ENV=preview), nenhuma chamada
// de IA do caminho antigo acontece. Cada rota/consumidor antigo responde
// sem tocar no banco, na fila, na rede (toda IA passa por fetch) nem no
// provedor de IA — os mocks contam as chamadas. Com a flag desligada, a
// mesma requisição passa da trava como hoje.

import assert from 'node:assert/strict'
import { register } from 'node:module'
import test, { mock } from 'node:test'
import { fileURLToPath } from 'node:url'

register(
  fileURLToPath(new URL('../../lib/companion/e2-test-support/route-alias-resolve-loader.mjs', import.meta.url)),
  import.meta.url,
)

import {
  bearerHeader,
  buildToken,
  installFakeSupabaseEnv,
} from '../../lib/companion/e2-test-support/fake-companion-token.mjs'

installFakeSupabaseEnv()

const calls = {
  createClient: 0,
  queueSend: 0,
  aiProviderCreated: 0,
  aiProviderCalled: 0,
  statefulWorker: 0,
  shadowWorker: 0,
  shadowEnqueue: 0,
  registrationSummary: 0,
  fetch: 0,
}

function resetCalls() {
  for (const key of Object.keys(calls)) {
    calls[key] = 0
  }
}

// Banco falso: qualquer consulta responde erro (com a flag desligada a rota
// segue e falha adiante — basta provar que passou da trava).
function failingQuery() {
  const result = { data: null, error: { message: 'banco falso', code: 'FAKE' } }
  const builder = new Proxy(function noop() {}, {
    get(_target, property) {
      if (property === 'then') {
        return (resolve) => resolve(result)
      }

      return () => builder
    },
    apply() {
      return builder
    },
  })

  return builder
}

mock.module('@supabase/supabase-js', {
  namedExports: {
    createClient: () => {
      calls.createClient += 1
      return { from: () => failingQuery(), rpc: () => failingQuery() }
    },
  },
})

mock.module('@vercel/queue', {
  namedExports: {
    send: async () => {
      calls.queueSend += 1
    },
    handleCallback: (handler) => async (message, metadata = { deliveryCount: 1 }) => handler(message, metadata),
  },
})

const lib = (path) => new URL(`../../lib/${path}`, import.meta.url).href

mock.module(lib('companion/companion-ai-provider.ts'), {
  namedExports: {
    resolveCompanionAIProviderName: () => 'anthropic',
    createCompanionAIProvider: () => {
      calls.aiProviderCreated += 1
      return async () => {
        calls.aiProviderCalled += 1
        return { content: '{}' }
      }
    },
  },
})

class FakeRetryError extends Error {}
class FakeInvalidMessageError extends Error {}

mock.module(lib('server/stateful-copilot-background-worker.ts'), {
  namedExports: {
    StatefulCopilotBackgroundRetryError: FakeRetryError,
    StatefulCopilotBackgroundInvalidMessageError: FakeInvalidMessageError,
    buildStatefulCopilotBackgroundRuntimeOptions: () => ({}),
    processStatefulCopilotBackgroundMessage: async () => {
      calls.statefulWorker += 1
    },
  },
})

mock.module(lib('server/message-intelligence-shadow-worker.ts'), {
  namedExports: {
    processMessageIntelligenceShadowMessage: async () => {
      calls.shadowWorker += 1
    },
  },
})

mock.module(lib('server/message-intelligence-shadow-enqueue.ts'), {
  namedExports: {
    enqueueMessageIntelligenceShadowRunV1: async () => {
      calls.shadowEnqueue += 1
      return { status: 'skipped' }
    },
  },
})

mock.module(lib('companion/register-conversation-summary.ts'), {
  namedExports: {
    CONVERSATION_REGISTRATION_OPENAI_CHAT_COMPLETIONS_URL: 'https://example.invalid',
    buildConversationRegistrationPrompt: () => '',
    generateConversationRegistrationSummary: async () => {
      calls.registrationSummary += 1
      return { summary_text: 'x' }
    },
  },
})

const realFetch = globalThis.fetch

globalThis.fetch = async () => {
  calls.fetch += 1
  return new Response('{}', { status: 500 })
}

process.env.COMPANION_V2_PREVIEW_ENABLED = 'true'

const routes = {
  analyze: (await import('./analyze-conversation/route.ts')).POST,
  retry: (await import('./analysis-job-retry/route.ts')).POST,
  leadSummary: (await import('./lead-summary/route.ts')).POST,
  methodGuidance: (await import('./method-guidance/route.ts')).POST,
  registerPreview: (await import('./register-conversation/preview/route.ts')).POST,
  diagnosticPreview: (await import('./v2/diagnostic-preview/route.ts')).POST,
}

const consumers = {
  deepAnalysis: (await import('../queues/companion-deep-analysis-v3/route.ts')).POST,
  shadow: (await import('../queues/message-intelligence-shadow-v1/route.ts')).POST,
}

test.after(() => {
  globalThis.fetch = realFetch
})

const COMPANY = '70000000-0000-4000-8000-000000000001'
const USER = '70000000-0000-4000-8000-0000000000a1'
const CYCLE = '70000000-0000-4000-8000-0000000000c1'

const BODIES = {
  analyze: {
    cycle_id: CYCLE,
    conversation_key: 'phone:5511900000000',
    device_key: 'device-1',
    messages: [{ id: 'm1', direction: 'incoming', text: 'Oi, quero saber o preço do plano.', timestamp: '2026-10-01T12:00:00.000Z' }],
    conversation_text: 'Cliente: Oi, quero saber o preço do plano.',
  },
  retry: { analysis_job_id: '70000000-0000-4000-8000-0000000000f1' },
  leadSummary: { cycle_id: CYCLE, conversation_key: 'phone:5511900000000' },
  methodGuidance: { cycle_id: CYCLE, conversation_key: 'phone:5511900000000', operation: 'guidance', working_summary: 'Resumo.' },
  registerPreview: { cycle_id: CYCLE, conversation_key: 'phone:5511900000000' },
  diagnosticPreview: { cycle_id: CYCLE, conversation_key: 'phone:5511900000000' },
}

function request(body) {
  return new Request('https://preview.example/api/companion/x', {
    method: 'POST',
    headers: {
      ...bearerHeader(buildToken({ sub: USER, companyId: COMPANY })),
      'content-type': 'application/json',
      origin: 'https://web.whatsapp.com',
    },
    body: JSON.stringify(body),
  })
}

async function withFlag(values, run) {
  const previous = {
    COMPANION_FULL_READING_PANEL: process.env.COMPANION_FULL_READING_PANEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
  }

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }

  try {
    return await run()
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

const FLAG_ON = { COMPANION_FULL_READING_PANEL: 'on', VERCEL_ENV: 'preview' }

const totalAiActivity = () =>
  calls.createClient +
  calls.queueSend +
  calls.aiProviderCreated +
  calls.aiProviderCalled +
  calls.statefulWorker +
  calls.shadowWorker +
  calls.shadowEnqueue +
  calls.registrationSummary +
  calls.fetch

test('flag ligada: nenhuma rota antiga de IA chama a IA, a fila, a rede ou o banco (409 LEGACY_AI_DISABLED)', () =>
  withFlag(FLAG_ON, async () => {
    for (const [name, POST] of Object.entries(routes)) {
      resetCalls()

      const response = await POST(request(BODIES[name]))
      const payload = await response.json()

      assert.equal(response.status, 409, name)
      assert.equal(payload.code, 'LEGACY_AI_DISABLED', name)
      assert.equal(payload.ok, false, name)
      assert.deepEqual({ ...calls }, Object.fromEntries(Object.keys(calls).map((key) => [key, 0])), name)
    }
  }))

test('flag ligada: os consumidores das filas antigas reconhecem a mensagem sem rodar a IA', () =>
  withFlag(FLAG_ON, async () => {
    resetCalls()

    await consumers.deepAnalysis({ analysis_job_id: 'x' }, { deliveryCount: 1 })
    await consumers.shadow({ run_id: 'x' })

    assert.equal(totalAiActivity(), 0)
  }))

test('flag ligada sem sessão: a trava não muda a resposta de sessão inválida (401)', () =>
  withFlag(FLAG_ON, async () => {
    for (const [name, POST] of Object.entries(routes)) {
      const response = await POST(new Request('https://preview.example/api/companion/x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(BODIES[name]),
      }))

      assert.equal(response.status, 401, name)
    }
  }))

for (const [label, env] of [
  ['flag desligada', { COMPANION_FULL_READING_PANEL: undefined, VERCEL_ENV: 'preview' }],
  ['flag ligada fora do preview', { COMPANION_FULL_READING_PANEL: 'on', VERCEL_ENV: 'production' }],
]) {
  test(`${label}: tudo igual a hoje — as rotas antigas passam da trava e os consumidores processam`, () =>
    withFlag(env, async () => {
      for (const [name, POST] of Object.entries(routes)) {
        resetCalls()

        const response = await POST(request(BODIES[name]))
        const payload = await response.json().catch(() => ({}))

        assert.notEqual(payload.code, 'LEGACY_AI_DISABLED', name)
        // Seguiu adiante: abriu o banco (a trava não interceptou).
        assert.ok(calls.createClient >= 1, `${name}: o banco devia ter sido aberto`)
      }

      resetCalls()
      await consumers.deepAnalysis({ analysis_job_id: 'x' }, { deliveryCount: 1 })
      await consumers.shadow({ run_id: 'x' })

      assert.equal(calls.statefulWorker, 1)
      assert.equal(calls.shadowWorker, 1)
    }))
}
