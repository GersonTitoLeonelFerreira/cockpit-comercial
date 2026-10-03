// Rodada 10 (HML), item F2: o Copiloto Comercial da página do lead chama
// esta rota, que usa a IA paga. Com a leitura completa ligada (HML), ela
// responde sem chamar a IA nem ler o banco: a análise vem da leitura do
// Companion. Desligada, segue o caminho de hoje. Clientes falsos.

import assert from 'node:assert/strict'
import { register } from 'node:module'
import test, { mock } from 'node:test'
import { fileURLToPath } from 'node:url'

register(
  fileURLToPath(new URL('../../../lib/companion/e2-test-support/route-alias-resolve-loader.mjs', import.meta.url)),
  import.meta.url,
)

process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://fake.supabase.test'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'fake-anon-key'

const calls = []

// Rodada 17: sessão configurável (padrão: sem sessão, como antes). A RPC e o
// modelo do Copiloto ficam registrados em `calls`.
const session = { user: null, activeCompanyId: null }

mock.module('next/headers', {
  namedExports: {
    cookies: async () => ({
      get(name) {
        return name === 'cockpit_active_company_id' && session.activeCompanyId
          ? { value: session.activeCompanyId }
          : undefined
      },
      getAll() {
        return []
      },
    }),
  },
})

mock.module('@supabase/ssr', {
  namedExports: {
    createServerClient: () => {
      calls.push('createServerClient')
      return {
        auth: {
          async getUser() {
            calls.push('auth.getUser')
            return session.user
              ? { data: { user: session.user }, error: null }
              : { data: null, error: { message: 'sem sessão' } }
          },
        },
        async rpc(name) {
          calls.push(`rpc:${name}`)
          return { data: null, error: { message: 'banco falso' } }
        },
      }
    },
  },
})

mock.module(new URL('../../../lib/ai/sales-copilot.ts', import.meta.url).href, {
  namedExports: {
    analyzeConversationWithCopilotDetailed: async () => {
      calls.push('copilot')
      throw new Error('o modelo não pode ser chamado no teste')
    },
  },
})

const { POST } = await import('./route.ts')

const body = () =>
  new Request('http://localhost/api/ai/analyze-conversation', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ cycle_id: '9c000000-0000-4000-8000-0000000000c1', conversation_text: 'Conversa sintética.' }),
  })

async function withEnv(env, run) {
  const saved = {
    COMPANION_FULL_READING_PANEL: process.env.COMPANION_FULL_READING_PANEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    COMPANION_FULL_READING_SELLER_IDS: process.env.COMPANION_FULL_READING_SELLER_IDS,
  }

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }

  const fetchCalls = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (...args) => {
    fetchCalls.push(String(args[0]))
    throw new Error('rede bloqueada no teste')
  }

  calls.length = 0

  try {
    return await run(fetchCalls)
  } finally {
    globalThis.fetch = originalFetch

    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test('F2: com a flag no preview, a rota não chama a IA nem lê o banco e aponta a leitura do Companion', () =>
  withEnv({ COMPANION_FULL_READING_PANEL: 'on', VERCEL_ENV: 'preview' }, async (fetchCalls) => {
    const response = await POST(body())
    const payload = await response.json()

    assert.equal(response.status, 409)
    assert.equal(payload.ok, false)
    assert.match(payload.error, /leitura do Companion/)
    assert.doesNotMatch(payload.error, /[A-Z]{3,}_[A-Z_]+/)
    assert.deepEqual(calls, [])
    assert.deepEqual(fetchCalls, [])
  }))

test('F3: flag desligada (ou fora do preview) — o caminho de hoje (sessão do Yolen primeiro)', async () => {
  for (const env of [
    { COMPANION_FULL_READING_PANEL: undefined, VERCEL_ENV: 'preview' },
    { COMPANION_FULL_READING_PANEL: 'on', VERCEL_ENV: 'production' },
  ]) {
    await withEnv(env, async () => {
      const response = await POST(body())
      const payload = await response.json()

      assert.notEqual(response.status, 409)
      assert.doesNotMatch(String(payload.error), /leitura do Companion/)
      assert.ok(calls.includes('auth.getUser'))
    })
  }
})

// ---------------------------------------------------------------------
// Rodada 17 (botão de produção, parte 3): além da trava global (preview,
// antes de tudo), uma trava por usuário da sessão logo depois de ler a
// sessão, antes de qualquer RPC ou chamada a modelo. Produção: só quem está
// em COMPANION_FULL_READING_SELLER_IDS recebe o 409.
// ---------------------------------------------------------------------

const SESSION_USER = '9c000000-0000-4000-8000-0000000000a1'
const OTHER_USER = '9c000000-0000-4000-8000-0000000000a2'
const COMPANY = '9c000000-0000-4000-8000-000000000001'

async function withSession(user, run) {
  session.user = user ? { id: user } : null
  session.activeCompanyId = COMPANY

  try {
    return await run()
  } finally {
    session.user = null
    session.activeCompanyId = null
  }
}

const invalidBody = () =>
  new Request('http://localhost/api/ai/analyze-conversation', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ conversation_text: '' }),
  })

test('R17 Copiloto: em preview com a flag, o 409 vem antes de tudo — antes da validação do corpo e da sessão', () =>
  withEnv({ COMPANION_FULL_READING_PANEL: 'on', VERCEL_ENV: 'preview', COMPANION_FULL_READING_SELLER_IDS: OTHER_USER }, () =>
    withSession(SESSION_USER, async () => {
      const response = await POST(invalidBody())
      const payload = await response.json()

      assert.equal(response.status, 409)
      assert.match(payload.error, /leitura do Companion/)
      assert.deepEqual(calls, [])
    })))

test('R17 Copiloto: produção com o usuário da sessão na lista — 409 depois da sessão, sem RPC nem modelo', () =>
  withEnv({
    COMPANION_FULL_READING_PANEL: 'on',
    VERCEL_ENV: 'production',
    COMPANION_FULL_READING_SELLER_IDS: ` ${OTHER_USER}, ${SESSION_USER.toUpperCase()} `,
  }, (fetchCalls) =>
    withSession(SESSION_USER, async () => {
      const response = await POST(body())
      const payload = await response.json()

      assert.equal(response.status, 409)
      assert.equal(payload.ok, false)
      assert.equal(payload.error, 'Na homologação, a análise desta conversa vem da leitura do Companion.')
      assert.deepEqual(calls, ['createServerClient', 'auth.getUser'])
      assert.deepEqual(fetchCalls, [])
    })))

test('R17 Copiloto: produção com o usuário fora da lista (ou lista vazia) — segue como hoje até a RPC', async () => {
  for (const list of [OTHER_USER, '', undefined]) {
    await withEnv({ COMPANION_FULL_READING_PANEL: 'on', VERCEL_ENV: 'production', COMPANION_FULL_READING_SELLER_IDS: list }, () =>
      withSession(SESSION_USER, async () => {
        const response = await POST(body())
        const payload = await response.json()

        assert.notEqual(response.status, 409, String(list))
        assert.doesNotMatch(String(payload.error), /leitura do Companion/)
        assert.ok(calls.includes('rpc:rpc_get_cycle_ai_context_for_company'), String(list))
      }))
  }
})

test('R17 Copiloto: produção sem usuário na sessão — exatamente como hoje (sessão recusada, sem 409)', () =>
  withEnv({ COMPANION_FULL_READING_PANEL: 'on', VERCEL_ENV: 'production', COMPANION_FULL_READING_SELLER_IDS: SESSION_USER }, () =>
    withSession(null, async () => {
      const response = await POST(body())
      const payload = await response.json()

      assert.equal(response.status, 500)
      assert.equal(payload.error, 'Não autenticado.')
      assert.deepEqual(calls, ['createServerClient', 'auth.getUser'])
    })))

test('R17 Copiloto: flag desligada em produção, mesmo com o usuário na lista — segue como hoje', () =>
  withEnv({ COMPANION_FULL_READING_PANEL: undefined, VERCEL_ENV: 'production', COMPANION_FULL_READING_SELLER_IDS: SESSION_USER }, () =>
    withSession(SESSION_USER, async () => {
      const response = await POST(body())

      assert.notEqual(response.status, 409)
      assert.ok(calls.includes('rpc:rpc_get_cycle_ai_context_for_company'))
    })))
