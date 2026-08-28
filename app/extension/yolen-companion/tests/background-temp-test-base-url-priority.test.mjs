// FAIL de integração real (Etapa 1, "Resumo persistente do lead"):
// mesmo com TEMP_TEST_BASE_URL corrigido para o alias certo desta branch,
// o vendedor continuava recebendo "Não foi possível carregar o resumo
// salvo na Yolen." — porque a sessão do Companion já capturada (fluxo
// normal de login, sempre em produção) fixava `cachedSession.origin` em
// produção, e requestYolenWithToken() dava prioridade a essa origem sobre
// TEMP_TEST_BASE_URL. Confirmado nos logs reais do Vercel: todo o
// tráfego do Companion (resolve-lead, client-context, capture/messages...)
// ia para o deploy de `main`, nunca para o preview desta branch.
//
// Este teste prova, com background.js real (mesmo harness de
// background-session-auth.test.mjs), que uma sessão já capturada em
// produção é redirecionada para TEMP_TEST_BASE_URL quando ele está
// definido — sem exigir que o vendedor reconecte manualmente.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  createFakeFetchQueue,
  jsonResponse,
  loadBackgroundScript,
} from './e2-test-support/load-background-script.mjs'

const backgroundSource = readFileSync(
  new URL('../src/background.js', import.meta.url),
  'utf8',
)

const tempTestBaseUrlMatch = backgroundSource.match(
  /const TEMP_TEST_BASE_URL =\s*\n?\s*'([^']+)'/,
)

const PRODUCTION_BASE_URL = 'https://cockpit-comercial-vocn.vercel.app'
const SESSION_KEY = 'yolen_companion_session'

assert.ok(tempTestBaseUrlMatch, 'TEMP_TEST_BASE_URL não encontrado em background.js')

const TEMP_TEST_BASE_URL = tempTestBaseUrlMatch[1]

function futureIso(secondsFromNow) {
  return new Date(Date.now() + secondsFromNow * 1000).toISOString()
}

function sessionCapturedAt(origin) {
  return {
    ok: true,
    statusCode: 200,
    origin,
    capturedAt: new Date().toISOString(),
    payload: {
      ok: true,
      companion_token: 'fake.token.value',
      expires_at: futureIso(6 * 60 * 60),
    },
  }
}

test('TEMP_TEST_BASE_URL está definido e é diferente de produção (senão este teste não prova nada)', () => {
  assert.notEqual(TEMP_TEST_BASE_URL, PRODUCTION_BASE_URL)
  assert.match(TEMP_TEST_BASE_URL, /^https:\/\/.+\.vercel\.app$/)
})

test('sessão já capturada em PRODUÇÃO é roteada para o preview (TEMP_TEST_BASE_URL vence a origem da sessão)', async () => {
  const { fetchFn, calls } = createFakeFetchQueue([
    () => jsonResponse(200, { ok: true, data: { identity: {}, summary: null } }),
  ])

  const bg = loadBackgroundScript({
    fetchFn,
    initialStorage: {
      [SESSION_KEY]: sessionCapturedAt(PRODUCTION_BASE_URL),
    },
  })

  const response = await bg.sendMessage({
    source: 'YOLEN_COMPANION',
    action: 'LOAD_LEAD_SUMMARY',
    baseUrl: PRODUCTION_BASE_URL,
    payload: { cycle_id: 'cycle-1', conversation_key: 'whatsapp:+5511999990000' },
  })

  assert.equal(calls.length, 1)
  assert.ok(
    calls[0].url.startsWith(TEMP_TEST_BASE_URL),
    `esperava a requisição para ${TEMP_TEST_BASE_URL}, foi para ${calls[0].url}`,
  )
  assert.ok(!calls[0].url.startsWith(PRODUCTION_BASE_URL))
  assert.equal(response.ok, true)
})

test('sessão já capturada em produção também é roteada para o preview no SAVE (não só na busca)', async () => {
  const { fetchFn, calls } = createFakeFetchQueue([
    () =>
      jsonResponse(200, {
        ok: true,
        data: { identity: {}, summary: { summary: 'x', version: 1, updated_at: null } },
      }),
  ])

  const bg = loadBackgroundScript({
    fetchFn,
    initialStorage: {
      [SESSION_KEY]: sessionCapturedAt(PRODUCTION_BASE_URL),
    },
  })

  await bg.sendMessage({
    source: 'YOLEN_COMPANION',
    action: 'SAVE_LEAD_SUMMARY',
    baseUrl: PRODUCTION_BASE_URL,
    payload: {
      cycle_id: 'cycle-1',
      conversation_key: 'whatsapp:+5511999990000',
      summary: 'Resumo de teste.',
      expected_version: null,
    },
  })

  assert.equal(calls.length, 1)
  assert.ok(calls[0].url.startsWith(TEMP_TEST_BASE_URL))
})
