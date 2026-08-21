// Testes de E2 (Trilha E, prioridade 2) para a autenticação/sessão de
// src/background.js — comportamento não coberto antes da E2 (a auditoria
// E1 apontou isso como lacuna: "autenticação client-side... zero testes").
//
// background.js roda de verdade (código-fonte real, sem nenhuma alteração)
// dentro de uma sandbox node:vm com `browser`/`storage.local`/`fetch`
// falsos — ver e2-test-support/load-background-script.mjs.

import assert from 'node:assert/strict'
import test from 'node:test'

import { loadBackgroundScript } from './e2-test-support/load-background-script.mjs'

const SESSION_KEY = 'yolen_companion_session'

function futureIso(secondsFromNow) {
  return new Date(Date.now() + secondsFromNow * 1000).toISOString()
}

function pastIso(secondsAgo) {
  return new Date(Date.now() - secondsAgo * 1000).toISOString()
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
// GET_ME
// ---------------------------------------------------------------------

test('background/GET_ME: sem sessão em cache retorna NO_COMPANION_SESSION (401)', async () => {
  const bg = loadBackgroundScript({})

  const response = await bg.sendMessage({ source: 'YOLEN_COMPANION', action: 'GET_ME' })

  assert.equal(response.ok, false)
  assert.equal(response.statusCode, 401)
  assert.equal(response.payload.status, 'NO_COMPANION_SESSION')
})

test('background/GET_ME: com sessão válida em cache retorna a sessão (do cache)', async () => {
  const bg = loadBackgroundScript({ initialStorage: { [SESSION_KEY]: validSession() } })

  const response = await bg.sendMessage({ source: 'YOLEN_COMPANION', action: 'GET_ME' })

  assert.equal(response.ok, true)
  assert.equal(response.payload.companion_token, 'fake.token.value')
  assert.equal(response.fromCache, true)
})

test('background/GET_ME: sessão EXPIRADA em cache é tratada como ausente e é removida do storage', async () => {
  const expired = validSession({
    payload: {
      ok: true,
      companion_token: 'fake.token.value',
      expires_at: pastIso(60),
    },
  })
  const bg = loadBackgroundScript({ initialStorage: { [SESSION_KEY]: expired } })

  const response = await bg.sendMessage({ source: 'YOLEN_COMPANION', action: 'GET_ME' })

  assert.equal(response.ok, false)
  assert.equal(response.statusCode, 401)
  assert.equal(response.payload.status, 'NO_COMPANION_SESSION')
  assert.equal(bg.storage[SESSION_KEY], undefined, 'sessão expirada deveria ser removida do storage')
})

test('background/GET_ME: sessão sem companion_token é tratada como inválida', async () => {
  const invalid = validSession({ payload: { ok: true, companion_token: '', expires_at: futureIso(3600) } })
  const bg = loadBackgroundScript({ initialStorage: { [SESSION_KEY]: invalid } })

  const response = await bg.sendMessage({ source: 'YOLEN_COMPANION', action: 'GET_ME' })

  assert.equal(response.ok, false)
  assert.equal(response.payload.status, 'NO_COMPANION_SESSION')
})

test('background/GET_ME: sessão com payload.ok=false é tratada como inválida mesmo com token presente', async () => {
  const invalid = validSession({ payload: { ok: false, companion_token: 'fake.token.value', expires_at: futureIso(3600) } })
  const bg = loadBackgroundScript({ initialStorage: { [SESSION_KEY]: invalid } })

  const response = await bg.sendMessage({ source: 'YOLEN_COMPANION', action: 'GET_ME' })

  assert.equal(response.ok, false)
  assert.equal(response.payload.status, 'NO_COMPANION_SESSION')
})

// ---------------------------------------------------------------------
// SET_SESSION
// ---------------------------------------------------------------------

test('background/SET_SESSION: sessão válida é armazenada e pode ser lida depois via GET_ME', async () => {
  const bg = loadBackgroundScript({})

  const setResponse = await bg.sendMessage({
    source: 'YOLEN_COMPANION',
    action: 'SET_SESSION',
    payload: { session: validSession() },
  })

  assert.equal(setResponse.ok, true)
  assert.equal(setResponse.payload.status, 'SESSION_STORED')

  const getResponse = await bg.sendMessage({ source: 'YOLEN_COMPANION', action: 'GET_ME' })
  assert.equal(getResponse.ok, true)
})

test('background/SET_SESSION: sessão inválida é ignorada e NÃO sobrescreve nenhuma sessão anterior', async () => {
  const bg = loadBackgroundScript({ initialStorage: { [SESSION_KEY]: validSession() } })

  const setResponse = await bg.sendMessage({
    source: 'YOLEN_COMPANION',
    action: 'SET_SESSION',
    payload: { session: { ok: false } },
  })

  assert.equal(setResponse.ok, false)
  assert.equal(setResponse.payload.status, 'SESSION_IGNORED_INVALID')

  const getResponse = await bg.sendMessage({ source: 'YOLEN_COMPANION', action: 'GET_ME' })
  assert.equal(getResponse.ok, true, 'sessão anterior válida deveria continuar em cache')
})

// ---------------------------------------------------------------------
// CLEAR_SESSION
// ---------------------------------------------------------------------

test('background/CLEAR_SESSION: remove a sessão do storage', async () => {
  const bg = loadBackgroundScript({ initialStorage: { [SESSION_KEY]: validSession() } })

  const clearResponse = await bg.sendMessage({ source: 'YOLEN_COMPANION', action: 'CLEAR_SESSION' })
  assert.equal(clearResponse.payload.status, 'SESSION_CLEARED')

  const getResponse = await bg.sendMessage({ source: 'YOLEN_COMPANION', action: 'GET_ME' })
  assert.equal(getResponse.ok, false)
  assert.equal(getResponse.payload.status, 'NO_COMPANION_SESSION')
})

// ---------------------------------------------------------------------
// Ponte da página da Yolen (SESSION_UPDATE)
// ---------------------------------------------------------------------

test('background/SESSION_UPDATE (bridge): sessão válida vinda da ponte é armazenada', async () => {
  const bg = loadBackgroundScript({})

  const response = await bg.sendMessage({
    source: 'YOLEN_COMPANION_BRIDGE',
    action: 'SESSION_UPDATE',
    session: validSession(),
  })

  assert.equal(response.ok, true)
  assert.equal(response.payload.status, 'SESSION_STORED')
})

test('background/SESSION_UPDATE (bridge): sessão inválida vinda da ponte é ignorada', async () => {
  const bg = loadBackgroundScript({})

  const response = await bg.sendMessage({
    source: 'YOLEN_COMPANION_BRIDGE',
    action: 'SESSION_UPDATE',
    session: { ok: false },
  })

  assert.equal(response.ok, false)
  assert.equal(response.payload.status, 'SESSION_IGNORED_INVALID')
})

// ---------------------------------------------------------------------
// Roteamento de mensagens desconhecidas / malformadas
// ---------------------------------------------------------------------

test('background: mensagem vazia/nula responde 400', async () => {
  const bg = loadBackgroundScript({})

  const response = await bg.sendMessage(null)

  assert.equal(response.ok, false)
  assert.equal(response.statusCode, 400)
})

test('background: origem (source) não reconhecida responde 400', async () => {
  const bg = loadBackgroundScript({})

  const response = await bg.sendMessage({ source: 'ALGO_DESCONHECIDO', action: 'GET_ME' })

  assert.equal(response.ok, false)
  assert.equal(response.statusCode, 400)
})

test('background: ação não reconhecida dentro de YOLEN_COMPANION responde 400', async () => {
  const bg = loadBackgroundScript({})

  const response = await bg.sendMessage({ source: 'YOLEN_COMPANION', action: 'ACAO_INEXISTENTE' })

  assert.equal(response.ok, false)
  assert.equal(response.statusCode, 400)
})
