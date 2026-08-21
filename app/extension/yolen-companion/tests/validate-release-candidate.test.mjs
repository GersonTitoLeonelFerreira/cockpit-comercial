import assert from 'node:assert/strict'
import test from 'node:test'

import {
  checkSizeLimits,
  classifyReleaseCandidate,
  findForbiddenEntries,
  MAX_ENTRY_UNCOMPRESSED_BYTES,
  MAX_ZIP_BYTES,
} from '../scripts/validate-release-candidate.mjs'

test('findForbiddenEntries não sinaliza um pacote limpo', () => {
  const entries = [
    'manifest.json',
    'src/background.js',
    'src/content-script.js',
    'assets/icons/icon-16.png',
  ]

  assert.deepEqual(findForbiddenEntries(entries), [])
})

test('findForbiddenEntries sinaliza tests/, .env, source map e node_modules', () => {
  const entries = [
    'tests/foo.test.mjs',
    'src/foo.test.mjs',
    '.env',
    '.env.local',
    'src/background.js.map',
    'node_modules/left-pad/index.js',
    '.git/config',
    'scripts/build-package.mjs',
    'README.md',
  ]

  const findings = findForbiddenEntries(entries)
  const flaggedEntries = findings.map((finding) => finding.entry)

  for (const entry of entries) {
    assert.ok(flaggedEntries.includes(entry), `esperava ${entry} sinalizado como indevido`)
  }
})

test('findForbiddenEntries não confunde nomes legítimos com "secret"', () => {
  assert.deepEqual(findForbiddenEntries(['src/background.js']), [])
})

test('checkSizeLimits passa dentro dos limites', () => {
  const result = checkSizeLimits({
    zipBytes: 1024,
    entrySizes: [
      { name: 'manifest.json', size: 500 },
      { name: 'src/content-script.js', size: 200_000 },
    ],
  })

  assert.equal(result.pass, true)
  assert.deepEqual(result.violations, [])
})

test('checkSizeLimits falha quando o zip excede o limite', () => {
  const result = checkSizeLimits({
    zipBytes: MAX_ZIP_BYTES + 1,
    entrySizes: [],
  })

  assert.equal(result.pass, false)
  assert.equal(result.violations.length, 1)
})

test('checkSizeLimits falha quando um arquivo interno excede o limite', () => {
  const result = checkSizeLimits({
    zipBytes: 1024,
    entrySizes: [{ name: 'src/enorme.js', size: MAX_ENTRY_UNCOMPRESSED_BYTES + 1 }],
  })

  assert.equal(result.pass, false)
  assert.match(result.violations[0], /src\/enorme\.js/)
})

test('classifyReleaseCandidate: build inválido nunca vira RC nem build interno válido', () => {
  const result = classifyReleaseCandidate({ technicalPass: false, localhostDetected: true })
  assert.equal(result.classification, 'BUILD_INVALID')
  assert.equal(result.storeEligible, false)

  const resultNoLocalhost = classifyReleaseCandidate({ technicalPass: false, localhostDetected: false })
  assert.equal(resultNoLocalhost.classification, 'BUILD_INVALID')
  assert.equal(resultNoLocalhost.storeEligible, false)
})

test('classifyReleaseCandidate: técnico OK + localhost presente = INTERNAL_DEV_ONLY, nunca elegível para loja', () => {
  const result = classifyReleaseCandidate({ technicalPass: true, localhostDetected: true })
  assert.equal(result.classification, 'INTERNAL_DEV_ONLY')
  assert.equal(result.storeEligible, false)
})

test('classifyReleaseCandidate: técnico OK + sem localhost = elegível para loja', () => {
  const result = classifyReleaseCandidate({ technicalPass: true, localhostDetected: false })
  assert.equal(result.classification, 'STORE_ELIGIBLE_CANDIDATE')
  assert.equal(result.storeEligible, true)
})

test('classificação atual do pacote D1/D2 deve ser sempre INTERNAL_DEV_ONLY (localhost ainda não removido)', () => {
  // Trava de regressão: enquanto o D3 não for executado e autorizado, o
  // manifest de origem inclui localhost:3000, então mesmo um build
  // tecnicamente perfeito nunca deve se autoclassificar como elegível
  // para loja.
  const result = classifyReleaseCandidate({ technicalPass: true, localhostDetected: true })
  assert.notEqual(result.classification, 'STORE_ELIGIBLE_CANDIDATE')
  assert.equal(result.storeEligible, false)
})
