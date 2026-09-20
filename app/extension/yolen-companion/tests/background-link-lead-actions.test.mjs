// STEP 2A.3 — testes de background.js para as duas novas actions do fluxo
// de vínculo ManyChat: SEARCH_LINKABLE_LEADS e FIRST_LINK_EXTERNAL_IDENTITY.
// Mesma sandbox node:vm de background-request-retry.test.mjs — o código
// real de background.js roda sem nenhuma alteração.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createFakeFetchQueue,
  jsonResponse,
  loadBackgroundScript,
} from './e2-test-support/load-background-script.mjs'

const SESSION_KEY = 'yolen_companion_session'

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

test('background/SEARCH_LINKABLE_LEADS: sem sessão em cache retorna NO_COMPANION_SESSION e NÃO chama fetch', async () => {
  const fetchQueue = createFakeFetchQueue([])
  const bg = loadBackgroundScript({ fetchFn: fetchQueue.fetchFn })

  const response = await bg.sendMessage({
    source: 'YOLEN_COMPANION',
    action: 'SEARCH_LINKABLE_LEADS',
    payload: { query: 'Cliente' },
  })

  assert.equal(response.ok, false)
  assert.equal(response.statusCode, 401)
  assert.equal(response.payload.status, 'NO_COMPANION_SESSION')
  assert.equal(fetchQueue.calls.length, 0)
})

test('background/SEARCH_LINKABLE_LEADS: com sessão válida chama POST /api/companion/link-lead/search com Bearer correto e o body exato', async () => {
  const fetchQueue = createFakeFetchQueue([
    async () => jsonResponse(200, { ok: true, leads: [] }),
  ])
  const bg = loadBackgroundScript({
    fetchFn: fetchQueue.fetchFn,
    initialStorage: { [SESSION_KEY]: validSession() },
  })

  const response = await bg.sendMessage({
    source: 'YOLEN_COMPANION',
    action: 'SEARCH_LINKABLE_LEADS',
    payload: { query: 'Cliente' },
  })

  assert.equal(response.ok, true)
  assert.equal(fetchQueue.calls.length, 1)

  const call = fetchQueue.calls[0]
  assert.equal(call.url, 'https://cockpit-comercial-vocn.vercel.app/api/companion/link-lead/search')
  assert.equal(call.init.method, 'POST')
  assert.equal(call.init.headers.Authorization, 'Bearer fake.token.value')
  assert.deepEqual(JSON.parse(call.init.body), { query: 'Cliente' })
})

test('background/FIRST_LINK_EXTERNAL_IDENTITY: sem sessão em cache retorna NO_COMPANION_SESSION e NÃO chama fetch', async () => {
  const fetchQueue = createFakeFetchQueue([])
  const bg = loadBackgroundScript({ fetchFn: fetchQueue.fetchFn })

  const response = await bg.sendMessage({
    source: 'YOLEN_COMPANION',
    action: 'FIRST_LINK_EXTERNAL_IDENTITY',
    payload: {
      platform: 'manychat',
      platform_contact_key: `manychat:contact:v1:sha256:${'a'.repeat(64)}`,
      lead_id: 'lead-1',
      confirmed: true,
      channel: null,
    },
  })

  assert.equal(response.ok, false)
  assert.equal(response.statusCode, 401)
  assert.equal(response.payload.status, 'NO_COMPANION_SESSION')
  assert.equal(fetchQueue.calls.length, 0)
})

test('background/FIRST_LINK_EXTERNAL_IDENTITY: com sessão válida chama POST /api/companion/link-lead com Bearer correto e repassa o body exatamente como veio (nunca injeta company_id/actor_user_id/identity_source)', async () => {
  const fetchQueue = createFakeFetchQueue([
    async () => jsonResponse(200, { ok: true, status: 'LINKED', lead_id: 'lead-1' }),
  ])
  const bg = loadBackgroundScript({
    fetchFn: fetchQueue.fetchFn,
    initialStorage: { [SESSION_KEY]: validSession() },
  })

  const payload = {
    platform: 'manychat',
    platform_contact_key: `manychat:contact:v1:sha256:${'a'.repeat(64)}`,
    lead_id: 'lead-1',
    confirmed: true,
    channel: null,
  }

  const response = await bg.sendMessage({
    source: 'YOLEN_COMPANION',
    action: 'FIRST_LINK_EXTERNAL_IDENTITY',
    payload,
  })

  assert.equal(response.ok, true)
  assert.equal(fetchQueue.calls.length, 1)

  const call = fetchQueue.calls[0]
  assert.equal(call.url, 'https://cockpit-comercial-vocn.vercel.app/api/companion/link-lead')
  assert.equal(call.init.method, 'POST')
  assert.equal(call.init.headers.Authorization, 'Bearer fake.token.value')

  const sentBody = JSON.parse(call.init.body)
  assert.deepEqual(sentBody, payload)
  assert.deepEqual(Object.keys(sentBody).sort(), Object.keys(payload).sort())
})

test('background: nenhuma action de background chama qualquer endpoint/rota de relink', async () => {
  const fetchQueue = createFakeFetchQueue([
    async () => jsonResponse(200, { ok: true, leads: [] }),
    async () => jsonResponse(200, { ok: true, status: 'LINKED' }),
  ])
  const bg = loadBackgroundScript({
    fetchFn: fetchQueue.fetchFn,
    initialStorage: { [SESSION_KEY]: validSession() },
  })

  await bg.sendMessage({
    source: 'YOLEN_COMPANION',
    action: 'SEARCH_LINKABLE_LEADS',
    payload: { query: 'Cliente' },
  })

  await bg.sendMessage({
    source: 'YOLEN_COMPANION',
    action: 'FIRST_LINK_EXTERNAL_IDENTITY',
    payload: {
      platform: 'manychat',
      platform_contact_key: `manychat:contact:v1:sha256:${'a'.repeat(64)}`,
      lead_id: 'lead-1',
      confirmed: true,
      channel: null,
    },
  })

  for (const call of fetchQueue.calls) {
    assert.equal(call.url.toLowerCase().includes('relink'), false)
  }
})
