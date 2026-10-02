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

mock.module('next/headers', {
  namedExports: {
    cookies: async () => ({
      get() {
        return undefined
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
            return { data: null, error: { message: 'sem sessão' } }
          },
        },
      }
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
