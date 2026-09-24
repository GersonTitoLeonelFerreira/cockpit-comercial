// FASE 4B.1 — fronteira canônica de conversa (contrato v1.1.0 §20, gate A16).
//
// Carrega companion-conversation-boundary.js diretamente (sem DOM) e prova:
// geração monotônica, tokens imutáveis, invalidação por fronteira mesmo com
// a MESMA conversationKey (A → B → A), invalidação por troca de empresa,
// isolamento entre instâncias, neutralidade de plataforma e o wiring
// estático em content-script.js, manifest.json, build-package.mjs e no
// harness E3.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const EXTENSION_ROOT = fileURLToPath(new URL('../', import.meta.url))
const MODULE_PATH = `${EXTENSION_ROOT}src/companion-conversation-boundary.js`

const { createConversationBoundary } = require(MODULE_PATH)

const moduleSource = readFileSync(MODULE_PATH, 'utf8')
const contentScript = readFileSync(`${EXTENSION_ROOT}src/content-script.js`, 'utf8')
const manifest = JSON.parse(readFileSync(`${EXTENSION_ROOT}manifest.json`, 'utf8'))
const buildScript = readFileSync(`${EXTENSION_ROOT}scripts/build-package.mjs`, 'utf8')
const harness = readFileSync(`${EXTENSION_ROOT}tests/e3-test-support/load-content-script.mjs`, 'utf8')

function functionBlock(source, signature) {
  const start = source.indexOf(signature)
  assert.notEqual(start, -1, `${signature} não encontrado`)
  const next = source.indexOf('\n  function ', start + signature.length)
  const nextAsync = source.indexOf('\n  async function ', start + signature.length)
  const candidates = [next, nextAsync].filter((index) => index !== -1)
  return source.slice(start, candidates.length ? Math.min(...candidates) : undefined)
}

test('contexto inicial: generation 0, conversationKey null, companyId null', () => {
  const boundary = createConversationBoundary()
  assert.deepEqual({ ...boundary.getContext() }, {
    generation: 0,
    conversationKey: null,
    companyId: null,
  })
})

test('advanceBoundary incrementa generation', () => {
  const boundary = createConversationBoundary()
  assert.equal(boundary.advanceBoundary().generation, 1)
  assert.equal(boundary.advanceBoundary().generation, 2)
  assert.equal(boundary.getContext().generation, 2)
})

test('advanceBoundary atualiza conversationKey', () => {
  const boundary = createConversationBoundary()
  boundary.advanceBoundary({ conversationKey: 'A' })
  assert.equal(boundary.getContext().conversationKey, 'A')
  boundary.advanceBoundary({ conversationKey: null })
  assert.equal(boundary.getContext().conversationKey, null)
})

test('advanceBoundary atualiza companyId', () => {
  const boundary = createConversationBoundary()
  boundary.advanceBoundary({ companyId: 'company-1' })
  assert.equal(boundary.getContext().companyId, 'company-1')
})

test('advanceBoundary com a MESMA conversationKey também incrementa generation e invalida token', () => {
  const boundary = createConversationBoundary()
  boundary.advanceBoundary({ conversationKey: 'x', companyId: 'company-1' })
  const token = boundary.captureToken()
  const next = boundary.advanceBoundary({ conversationKey: 'x', companyId: 'company-1' })
  assert.equal(next.generation, token.generation + 1)
  assert.equal(next.conversationKey, token.conversationKey)
  assert.equal(boundary.isTokenCurrent(token), false)
})

test('captureToken retorna snapshot frozen', () => {
  const boundary = createConversationBoundary()
  boundary.advanceBoundary({ conversationKey: 'A', companyId: 'company-1' })
  const token = boundary.captureToken()
  assert.ok(Object.isFrozen(token))
  assert.throws(() => {
    'use strict'
    token.generation = 99
  })
  assert.deepEqual({ ...token }, { generation: 1, conversationKey: 'A', companyId: 'company-1' })
})

test('isTokenCurrent é true antes de qualquer nova fronteira', () => {
  const boundary = createConversationBoundary()
  boundary.advanceBoundary({ conversationKey: 'A', companyId: 'company-1' })
  const token = boundary.captureToken()
  assert.equal(boundary.isTokenCurrent(token), true)
})

test('isTokenCurrent é false depois de advanceBoundary', () => {
  const boundary = createConversationBoundary()
  boundary.advanceBoundary({ conversationKey: 'A', companyId: 'company-1' })
  const token = boundary.captureToken()
  boundary.advanceBoundary({ conversationKey: 'B', companyId: 'company-1' })
  assert.equal(boundary.isTokenCurrent(token), false)
  assert.equal(boundary.isTokenCurrent(null), false)
  assert.equal(boundary.isTokenCurrent(undefined), false)
})

test('A → B → A: token do primeiro A é stale no segundo A', () => {
  const boundary =
    createConversationBoundary()

  boundary.advanceBoundary({
    conversationKey: 'A',
    companyId: 'company-1',
  })

  const oldAToken =
    boundary.captureToken()

  boundary.advanceBoundary({
    conversationKey: 'B',
    companyId: 'company-1',
  })

  boundary.advanceBoundary({
    conversationKey: 'A',
    companyId: 'company-1',
  })

  assert.equal(
    boundary.isTokenCurrent(oldAToken),
    false,
  )

  assert.equal(boundary.getContext().conversationKey, oldAToken.conversationKey)
  assert.equal(boundary.isTokenCurrent(boundary.captureToken()), true)
})

test('mudança de company com a mesma conversationKey invalida token', () => {
  const boundary = createConversationBoundary()
  boundary.advanceBoundary({ conversationKey: 'A', companyId: 'company-1' })
  const token = boundary.captureToken()
  boundary.advanceBoundary({ conversationKey: 'A', companyId: 'company-2' })
  assert.equal(boundary.isTokenCurrent(token), false)

  // Mesmo um token forjado com a geração atual não vale para outra empresa.
  const forged = Object.freeze({ ...boundary.captureToken(), companyId: 'company-1' })
  assert.equal(boundary.isTokenCurrent(forged), false)
})

test('duas instâncias são isoladas', () => {
  const first = createConversationBoundary()
  const second = createConversationBoundary()
  first.advanceBoundary({ conversationKey: 'A', companyId: 'company-1' })
  first.advanceBoundary({ conversationKey: 'B', companyId: 'company-1' })
  assert.deepEqual({ ...second.getContext() }, { generation: 0, conversationKey: null, companyId: null })

  const secondToken = second.captureToken()
  first.advanceBoundary()
  assert.equal(second.isTokenCurrent(secondToken), true)
})

test('advanceBoundary sem propriedades mantém keys atuais e incrementa generation', () => {
  const boundary = createConversationBoundary({ conversationKey: 'A', companyId: 'company-1' })
  const next = boundary.advanceBoundary()
  assert.deepEqual({ ...next }, { generation: 1, conversationKey: 'A', companyId: 'company-1' })
  const again = boundary.advanceBoundary({})
  assert.deepEqual({ ...again }, { generation: 2, conversationKey: 'A', companyId: 'company-1' })
})

test('snapshots de contexto e API são frozen; valores vazios normalizam para null', () => {
  const boundary = createConversationBoundary({ conversationKey: '', companyId: 42 })
  const context = boundary.getContext()
  assert.ok(Object.isFrozen(context))
  assert.ok(Object.isFrozen(boundary))
  assert.equal(context.conversationKey, null)
  assert.equal(context.companyId, null)
  assert.ok(Object.isFrozen(boundary.advanceBoundary({ conversationKey: 'A' })))
})

test('módulo é platform-neutral: sem DOM, extensão ou termos de plataforma', () => {
  const forbidden = [
    'web.whatsapp.com',
    'app.manychat.com',
    'WhatsApp',
    'ManyChat',
    'subscriber_id',
    'wa_id',
    'JID',
    'React Fiber',
    'document',
    'querySelector',
    'MutationObserver',
    'chrome',
    'browser',
  ]
  for (const term of forbidden) {
    assert.ok(!moduleSource.includes(term), `companion-conversation-boundary.js contém "${term}"`)
  }
})

test('wiring: content-script cria a boundary e a avança no hard reset e na troca de empresa', () => {
  assert.match(contentScript, /YolenCompanionConversationBoundary/)
  assert.match(contentScript, /createConversationBoundary\(\)/)
  assert.match(contentScript, /Módulo da fronteira canônica de conversa do Companion não carregado\./)

  const hardReset = functionBlock(contentScript, 'function hardResetConversationWorkspace()')
  assert.match(hardReset, /conversationBoundary\.advanceBoundary\(\{/)
  assert.match(hardReset, /workspaceState\.resetActiveArea\(\)/)

  const session = functionBlock(contentScript, 'async function loadYolenSession(')
  const companyChangedStart = session.indexOf('if (companyChanged) {')
  assert.notEqual(companyChangedStart, -1)
  const companyChangedBlock = session.slice(companyChangedStart, session.indexOf('\n      }', companyChangedStart))
  assert.match(companyChangedBlock, /conversationBoundary\.advanceBoundary\(\{/)
  assert.match(companyChangedBlock, /companyId:\s*nextCompanyId/)
})

test('manifest do WhatsApp carrega a boundary antes do workspace runtime e do content-script', () => {
  const scripts = manifest.content_scripts.find((entry) => entry.js?.includes('src/content-script.js')).js
  const boundaryIndex = scripts.indexOf('src/companion-conversation-boundary.js')
  const workspaceIndex = scripts.indexOf('src/companion-workspace-runtime.js')
  const contentScriptIndex = scripts.indexOf('src/content-script.js')
  assert.ok(boundaryIndex >= 0, 'boundary ausente do content_script do WhatsApp')
  assert.ok(boundaryIndex < workspaceIndex, 'boundary precisa carregar antes do workspace runtime')
  assert.ok(workspaceIndex < contentScriptIndex, 'workspace runtime precisa carregar antes do content-script')

  const others = manifest.content_scripts.filter((entry) => !entry.js?.includes('src/content-script.js'))
  for (const entry of others) {
    assert.ok(!entry.js?.includes('src/companion-conversation-boundary.js'), 'boundary não entra em outros content_scripts nesta fase')
  }
})

test('build allowlist e harness E3 incluem a boundary antes do workspace runtime', () => {
  assert.ok(buildScript.includes("'src/companion-conversation-boundary.js'"))

  const boundaryIndex = harness.indexOf("'companion-conversation-boundary.js'")
  const workspaceIndex = harness.indexOf("'companion-workspace-runtime.js'")
  assert.notEqual(boundaryIndex, -1, 'harness não carrega a boundary')
  assert.ok(boundaryIndex < workspaceIndex, 'harness precisa carregar a boundary antes do workspace runtime')
})

test('resolveCurrentLead usa generation da boundary no stale guard e no single-flight', () => {
  const start = contentScript.indexOf('  async function resolveCurrentLead()')
  const end = contentScript.indexOf('\n  const LEAD_CREATION_RESOLVE_RETRY_DELAYS_MS', start)
  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  const block = contentScript.slice(start, end)

  assert.match(
    block,
    /const boundaryTokenAtRequest =\s*conversationBoundary\.captureToken\(\)/,
  )
  assert.match(
    block,
    /const resolutionInFlightKey = \[\s*boundaryTokenAtRequest\.generation,\s*keyAtRequest,?\s*\]\.join\('::'\)/,
  )
  assert.match(
    block,
    /leadResolutionInFlightKeys\.has\(\s*resolutionInFlightKey,?\s*\)/,
  )
  assert.match(
    block,
    /leadResolutionInFlightKeys\.add\(\s*resolutionInFlightKey,?\s*\)/,
  )
  assert.match(
    block,
    /leadResolutionInFlightKeys\.delete\(\s*resolutionInFlightKey,?\s*\)/,
  )
  assert.doesNotMatch(
    block,
    /leadResolutionInFlightKeys\.(?:has|add|delete)\(\s*keyAtRequest,?\s*\)/,
  )

  const guardStart = block.indexOf('const requestStillCurrent = () => {')
  assert.notEqual(guardStart, -1)
  const guard = block.slice(guardStart, block.indexOf('\n    }', guardStart))
  assert.match(
    guard,
    /conversationBoundary\s*\.isTokenCurrent\(\s*boundaryTokenAtRequest,?\s*\)/,
  )
  assert.match(guard, /state\.conversationPhone ===\s*phoneAtRequest/)
  assert.match(guard, /state\.conversationKey ===\s*keyAtRequest/)
})
