// Testes de E2 (Trilha E, prioridade 2) para o transporte autenticado de
// src/background.js (`requestYolenWithToken`) — comportamento de rede
// (sucesso, falha, autenticação ausente, origem da baseUrl) que a
// auditoria E1 apontou como só coberto para `resolveLead` (via
// capture-resilience.test.mjs), não para o restante das ações.
//
// Mesma sandbox node:vm de background-session-auth.test.mjs — o código
// real de background.js roda sem nenhuma alteração.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createFakeFetchQueue,
  jsonResponse,
  loadBackgroundScript,
  rejectingFetch,
} from './e2-test-support/load-background-script.mjs'

const SESSION_KEY = 'yolen_companion_session'
const DEVICE_KEY_STORAGE_KEY = 'yolen_companion_device_key'

function futureIso(secondsFromNow) {
  return new Date(Date.now() + secondsFromNow * 1000).toISOString()
}

function validSession(overrides = {}) {
  return {
    ok: true,
    statusCode: 200,
    origin: 'https://cockpit-comercial-vocn.vercel.app',
    capturedAt: new Date().toISOString(),
    payload: {
      ok: true,
      companion_token: 'fake.token.value',
      expires_at: futureIso(6 * 60 * 60),
    },
    ...overrides,
  }
}

// ---------------------------------------------------------------------
// Ação autenticada sem sessão: nunca deve tentar rede
// ---------------------------------------------------------------------

test('background/RESOLVE_LEAD: sem sessão em cache retorna NO_COMPANION_SESSION e NÃO chama fetch', async () => {
  const fetchQueue = createFakeFetchQueue([])
  const bg = loadBackgroundScript({ fetchFn: fetchQueue.fetchFn })

  const response = await bg.sendMessage({
    source: 'YOLEN_COMPANION',
    action: 'RESOLVE_LEAD',
    payload: { phone: '11988887777' },
  })

  assert.equal(response.ok, false)
  assert.equal(response.statusCode, 401)
  assert.equal(response.payload.status, 'NO_COMPANION_SESSION')
  assert.equal(fetchQueue.calls.length, 0)
})

test('background/ANALYZE_CONVERSATION: sem sessão em cache retorna NO_COMPANION_SESSION e NÃO chama fetch', async () => {
  const fetchQueue = createFakeFetchQueue([])
  const bg = loadBackgroundScript({ fetchFn: fetchQueue.fetchFn })

  const response = await bg.sendMessage({
    source: 'YOLEN_COMPANION',
    action: 'ANALYZE_CONVERSATION',
    payload: { conversation_key: 'Cliente::11988887777' },
  })

  assert.equal(response.ok, false)
  assert.equal(response.statusCode, 401)
  assert.equal(fetchQueue.calls.length, 0)
})

// ---------------------------------------------------------------------
// Chamada autenticada bem-sucedida: header, corpo e endpoint corretos
// ---------------------------------------------------------------------

test('background/RESOLVE_LEAD: com sessão válida chama o endpoint certo com Bearer correto', async () => {
  const fetchQueue = createFakeFetchQueue([async () => jsonResponse(200, { ok: true, status: 'NOT_FOUND' })])
  const bg = loadBackgroundScript({
    fetchFn: fetchQueue.fetchFn,
    initialStorage: { [SESSION_KEY]: validSession() },
  })

  const response = await bg.sendMessage({
    source: 'YOLEN_COMPANION',
    action: 'RESOLVE_LEAD',
    payload: { phone: '11988887777' },
  })

  assert.equal(response.ok, true)
  assert.equal(fetchQueue.calls.length, 1)

  const call = fetchQueue.calls[0]

  assert.equal(
    call.url,
    'https://cockpit-comercial-vocn.vercel.app/api/companion/resolve-lead',
  )
  assert.equal(call.init.headers.Authorization, 'Bearer fake.token.value')
  assert.equal(JSON.parse(call.init.body).phone, '11988887777')
})

// ---------------------------------------------------------------------
// Falha de rede / resposta não-ok
// ---------------------------------------------------------------------

test('background: falha de rede (fetch rejeita) vira NETWORK_ERROR com statusCode 0', async () => {
  const bg = loadBackgroundScript({
    fetchFn: rejectingFetch(new TypeError('Failed to fetch')),
    initialStorage: { [SESSION_KEY]: validSession() },
  })

  const response = await bg.sendMessage({
    source: 'YOLEN_COMPANION',
    action: 'RESOLVE_LEAD',
    payload: { phone: '11988887777' },
  })

  assert.equal(response.ok, false)
  assert.equal(response.statusCode, 0)
  assert.equal(response.payload.status, 'NETWORK_ERROR')
})

test('background: resposta HTTP de erro (5xx) é repassada tal como veio, sem tentar de novo sozinho', async () => {
  const fetchQueue = createFakeFetchQueue([async () => jsonResponse(500, { ok: false, error: 'Erro interno' })])
  const bg = loadBackgroundScript({
    fetchFn: fetchQueue.fetchFn,
    initialStorage: { [SESSION_KEY]: validSession() },
  })

  const response = await bg.sendMessage({
    source: 'YOLEN_COMPANION',
    action: 'APPLY_SUGGESTION',
    payload: {},
  })

  assert.equal(response.ok, false)
  assert.equal(response.statusCode, 500)
  assert.equal(fetchQueue.calls.length, 1, 'background.js não deveria tentar retry sozinho — isso é feito pelo content-script')
})

test('background: resposta que não é JSON válido não derruba a chamada (payload vira null)', async () => {
  const fetchQueue = createFakeFetchQueue([
    async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token')
      },
    }),
  ])
  const bg = loadBackgroundScript({
    fetchFn: fetchQueue.fetchFn,
    initialStorage: { [SESSION_KEY]: validSession() },
  })

  const response = await bg.sendMessage({
    source: 'YOLEN_COMPANION',
    action: 'APPLY_SUGGESTION',
    payload: {},
  })

  assert.equal(response.ok, true)
  assert.equal(response.payload, null)
})

// ---------------------------------------------------------------------
// Origem da baseUrl: a origem que assinou a sessão tem prioridade
// ---------------------------------------------------------------------

test('background: origem autorizada da sessão prevalece sobre message.baseUrl', async () => {
  const fetchQueue = createFakeFetchQueue([async () => jsonResponse(200, { ok: true })])
  const bg = loadBackgroundScript({
    fetchFn: fetchQueue.fetchFn,
    initialStorage: {
      [SESSION_KEY]: validSession({ origin: 'https://cockpit-comercial-vocn.vercel.app' }),
    },
  })

  await bg.sendMessage({
    source: 'YOLEN_COMPANION',
    action: 'RESOLVE_LEAD',
    baseUrl: 'http://localhost:3000',
    payload: {},
  })

  assert.equal(
    fetchQueue.calls[0].url,
    'https://cockpit-comercial-vocn.vercel.app/api/companion/resolve-lead',
  )
})

test('background: origem de sessão não reconhecida cai para produção', async () => {
  const fetchQueue = createFakeFetchQueue([async () => jsonResponse(200, { ok: true })])
  const bg = loadBackgroundScript({
    fetchFn: fetchQueue.fetchFn,
    initialStorage: {
      [SESSION_KEY]: validSession({ origin: 'https://evil-preview-domain.example.com' }),
    },
  })

  await bg.sendMessage({
    source: 'YOLEN_COMPANION',
    action: 'RESOLVE_LEAD',
    payload: {},
  })

  assert.equal(
    fetchQueue.calls[0].url,
    'https://cockpit-comercial-vocn.vercel.app/api/companion/resolve-lead',
  )
})

// ---------------------------------------------------------------------
// device_key: gerado uma vez, reaproveitado e persistido
// ---------------------------------------------------------------------

test('background/INGEST_CAPTURE_MESSAGES: gera device_key uma vez e reaproveita nas chamadas seguintes', async () => {
  const fetchQueue = createFakeFetchQueue([
    async () => jsonResponse(200, { ok: true }),
    async () => jsonResponse(200, { ok: true }),
  ])
  const bg = loadBackgroundScript({
    fetchFn: fetchQueue.fetchFn,
    initialStorage: { [SESSION_KEY]: validSession() },
  })

  const payload = {
    cycle_id: 'aaaaaaaa-0000-4000-8000-000000000001',
    conversation_key: 'Cliente::11988887777',
    observed_at: new Date().toISOString(),
    messages: [],
  }

  await bg.sendMessage({ source: 'YOLEN_COMPANION', action: 'INGEST_CAPTURE_MESSAGES', payload })
  await bg.sendMessage({ source: 'YOLEN_COMPANION', action: 'INGEST_CAPTURE_MESSAGES', payload })

  const firstBody = JSON.parse(fetchQueue.calls[0].init.body)
  const secondBody = JSON.parse(fetchQueue.calls[1].init.body)

  assert.ok(firstBody.device_key, 'device_key deveria ter sido gerado')
  assert.equal(firstBody.device_key, secondBody.device_key, 'o mesmo device_key deveria ser reaproveitado')
  assert.equal(bg.storage[DEVICE_KEY_STORAGE_KEY], firstBody.device_key, 'device_key deveria ter sido persistido no storage')
})
