// Rodada 16 (botão de produção, parte 2): POST/OPTIONS
// /api/companion/full-reading/message ("Gerar mensagem" da leitura).
//
// - COMPANION_FULL_READING_PANEL diferente de 'on': 404 (OPTIONS e POST),
//   como hoje.
// - Flag 'on': OPTIONS 204; POST checa o token (401) e depois a regra por
//   usuário. Desligada para o usuário (produção fora da lista): o mesmo 404,
//   sem consulta, gravação ou chamada a modelo.
// - Preview com a flag ligada: igual a hoje para qualquer usuário.
// Cliente do banco que registra qualquer acesso; fetch espionado (nenhuma
// chamada sai). Ids sintéticos.

import assert from 'node:assert/strict'
import { register } from 'node:module'
import test, { mock } from 'node:test'
import { fileURLToPath } from 'node:url'

register(
  fileURLToPath(new URL('../../../../lib/companion/e2-test-support/route-alias-resolve-loader.mjs', import.meta.url)),
  import.meta.url,
)

import { bearerHeader, buildExpiredToken, buildToken, installFakeSupabaseEnv } from '../../../../lib/companion/e2-test-support/fake-companion-token.mjs'

installFakeSupabaseEnv()

const box = { admin: null }

mock.module('@supabase/supabase-js', {
  namedExports: {
    createClient: () => box.admin,
  },
})

const { POST, OPTIONS } = await import('./route.ts')

const IDS = {
  company: '9d000000-0000-4000-8000-000000000001',
  me: '9d000000-0000-4000-8000-0000000000a1',
  other: '9d000000-0000-4000-8000-0000000000a2',
  cycle: '9d000000-0000-4000-8000-0000000000c1',
}

const BODY = {
  cycle_id: IDS.cycle,
  conversation_key: 'phone:5511900000099',
  seller_intent: 'Texto sintético do vendedor.',
}

// Registra qualquer acesso ao banco e recusa (o painel não grava nada aqui).
function recordingAdmin() {
  const touched = []

  const admin = new Proxy({}, {
    get(_target, property) {
      if (property === 'then') {
        return undefined
      }

      touched.push(String(property))
      throw new Error(`a rota tocou no banco (${String(property)})`)
    },
  })

  return { admin, touched }
}

function request({ token = buildToken({ sub: IDS.me, companyId: IDS.company }), method = 'POST' } = {}) {
  return new Request('http://localhost/api/companion/full-reading/message', {
    method,
    headers: {
      ...(token ? bearerHeader(token) : {}),
      'content-type': 'application/json',
      origin: 'moz-extension://teste',
    },
    body: method === 'POST' ? JSON.stringify(BODY) : undefined,
  })
}

async function withEnv(values, fn) {
  const keys = ['COMPANION_FULL_READING_PANEL', 'VERCEL_ENV', 'COMPANION_FULL_READING_SELLER_IDS', 'ANTHROPIC_API_KEY']
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
  const previousFetch = globalThis.fetch
  const calls = []

  for (const key of keys) {
    const value = key === 'ANTHROPIC_API_KEY' ? 'chave-sintetica-de-teste' : values[key]

    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }

  globalThis.fetch = async (url) => {
    calls.push(String(url))
    throw new Error('nenhuma chamada de rede é esperada')
  }

  const originalError = console.error
  console.error = () => {}

  try {
    return await fn(calls)
  } finally {
    console.error = originalError
    globalThis.fetch = previousFetch

    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

async function post(options) {
  const { admin, touched } = recordingAdmin()
  box.admin = admin

  const response = await POST(request(options))
  const text = await response.text()

  return { response, text, touched }
}

const PRODUCTION = { COMPANION_FULL_READING_PANEL: 'on', VERCEL_ENV: 'production' }

test('R16 MENSAGEM: produção com o usuário fora da lista (ou lista vazia) — 404 de hoje, sem consulta nem modelo', async () => {
  for (const list of [IDS.other, '', undefined]) {
    await withEnv({ ...PRODUCTION, COMPANION_FULL_READING_SELLER_IDS: list }, async (calls) => {
      const { response, text, touched } = await post()

      assert.equal(response.status, 404, String(list))
      assert.equal(text, 'Not Found')
      assert.deepEqual(touched, [])
      assert.deepEqual(calls, [])
    })
  }
})

test('R16 MENSAGEM: produção com o usuário do token na lista — passa da regra e segue a rota de hoje (OPTIONS 204)', async () => {
  await withEnv({ ...PRODUCTION, COMPANION_FULL_READING_SELLER_IDS: ` ${IDS.other}, ${IDS.me.toUpperCase()} ` }, async () => {
    assert.equal((await OPTIONS(request({ method: 'OPTIONS' }))).status, 204)

    // O banco falso recusa tudo: a rota chegou à checagem de acesso.
    const { response, touched } = await post()

    assert.notEqual(response.status, 404)
    assert.ok(touched.length > 0)
  })
})

test('R16 MENSAGEM: flag desligada — 404 em OPTIONS e POST, mesmo com o usuário na lista ou em preview', async () => {
  for (const env of [
    { COMPANION_FULL_READING_PANEL: undefined, VERCEL_ENV: 'production', COMPANION_FULL_READING_SELLER_IDS: IDS.me },
    { COMPANION_FULL_READING_PANEL: 'off', VERCEL_ENV: 'preview' },
    { COMPANION_FULL_READING_PANEL: 'ON', VERCEL_ENV: 'preview' },
  ]) {
    await withEnv(env, async (calls) => {
      assert.equal((await OPTIONS(request({ method: 'OPTIONS' }))).status, 404, JSON.stringify(env))

      const { response, touched } = await post()

      assert.equal(response.status, 404, JSON.stringify(env))
      assert.deepEqual(touched, [])
      assert.deepEqual(calls, [])
    })
  }
})

test('R16 MENSAGEM: flag on e token inválido — 401 (antes da regra por usuário), em produção e em preview', async () => {
  for (const env of [
    { ...PRODUCTION, COMPANION_FULL_READING_SELLER_IDS: IDS.me },
    { ...PRODUCTION },
    { COMPANION_FULL_READING_PANEL: 'on', VERCEL_ENV: 'preview' },
  ]) {
    await withEnv(env, async (calls) => {
      for (const token of [null, buildExpiredToken({ sub: IDS.me, companyId: IDS.company }), 'token-forjado']) {
        const { response, text, touched } = await post({ token })

        assert.equal(response.status, 401, JSON.stringify(env))
        assert.equal(JSON.parse(text).code, 'INVALID_COMPANION_SESSION')
        assert.deepEqual(touched, [])
      }

      assert.deepEqual(calls, [])
    })
  }
})

test('R16 MENSAGEM: preview com a flag ligada — igual a hoje para qualquer usuário, com ou sem lista', async () => {
  for (const list of [undefined, IDS.other]) {
    await withEnv({ COMPANION_FULL_READING_PANEL: 'on', VERCEL_ENV: 'preview', COMPANION_FULL_READING_SELLER_IDS: list }, async () => {
      assert.equal((await OPTIONS(request({ method: 'OPTIONS' }))).status, 204)

      const { response, touched } = await post()

      assert.notEqual(response.status, 404)
      assert.ok(touched.length > 0)
    })
  }
})
