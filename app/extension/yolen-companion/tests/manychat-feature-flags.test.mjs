import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const flags = require('../src/manychat-feature-flags.js')
const e2eFlags = require('../src/manychat-feature-flags.e2e.js')

test('kill switch de captura ManyChat vem desligado por padrão', () => {
  assert.equal(flags.MANYCHAT_CAPTURE_ENABLED, false)
})

// STEP 2B.1: a fonte-de-flags exclusiva do canal E2E é um módulo distinto
// do normal — nunca o mesmo arquivo com um valor trocado em memória. Isso
// prova que dev/prod (que sempre requerem o arquivo normal) e e2e (que só
// build-package.mjs --e2e seleciona) não podem colidir por acidente de
// import.
test('fonte de flags E2E liga a captura ManyChat e se declara com BUILD_CHANNEL="e2e"', () => {
  assert.equal(e2eFlags.MANYCHAT_CAPTURE_ENABLED, true)
  assert.equal(e2eFlags.BUILD_CHANNEL, 'e2e')
})

test('objeto de flags normal e objeto de flags E2E são instâncias distintas, nunca o mesmo objeto', () => {
  assert.notEqual(flags, e2eFlags)
  assert.notEqual(flags.MANYCHAT_CAPTURE_ENABLED, e2eFlags.MANYCHAT_CAPTURE_ENABLED)
})

test('fonte de flags normal nunca expõe BUILD_CHANNEL (marcador é exclusivo do E2E)', () => {
  assert.equal(Object.prototype.hasOwnProperty.call(flags, 'BUILD_CHANNEL'), false)
})
