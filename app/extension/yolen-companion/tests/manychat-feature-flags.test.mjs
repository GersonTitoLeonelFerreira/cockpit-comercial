import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const flags = require('../src/manychat-feature-flags.js')

test('kill switch de captura ManyChat vem desligado por padrão', () => {
  assert.equal(flags.MANYCHAT_CAPTURE_ENABLED, false)
})
