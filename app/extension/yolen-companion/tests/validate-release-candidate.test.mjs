import assert from 'node:assert/strict'
import test from 'node:test'

import {
  checkSizeLimits,
  classifyReleaseCandidate,
  findForbiddenEntries,
  manyChatCaptureFlagCorrect,
  MAX_ENTRY_UNCOMPRESSED_BYTES,
  MAX_ZIP_BYTES,
} from '../scripts/validate-release-candidate.mjs'
import {
  featureFlagSourceForEnvironment,
  parseManyChatCaptureEnabledFromSource,
  FEATURE_FLAGS_SOURCE_DEFAULT,
  FEATURE_FLAGS_SOURCE_E2E,
} from '../scripts/build-package.mjs'

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

// ---------------------------------------------------------------------
// STEP 2B.1 — parser determinístico de MANYCHAT_CAPTURE_ENABLED (nunca
// `content.includes('true')`).
// ---------------------------------------------------------------------

test('parseManyChatCaptureEnabledFromSource lê false corretamente', () => {
  assert.equal(
    parseManyChatCaptureEnabledFromSource('const MANYCHAT_CAPTURE_ENABLED = false\n'),
    false,
  )
})

test('parseManyChatCaptureEnabledFromSource lê true corretamente', () => {
  assert.equal(
    parseManyChatCaptureEnabledFromSource('const MANYCHAT_CAPTURE_ENABLED = true\n'),
    true,
  )
})

test('parseManyChatCaptureEnabledFromSource rejeita ausência da declaração', () => {
  assert.throws(
    () => parseManyChatCaptureEnabledFromSource('const OUTRA_FLAG = false\n'),
    /não encontrado/i,
  )
})

test('parseManyChatCaptureEnabledFromSource rejeita valor inválido', () => {
  assert.throws(
    () => parseManyChatCaptureEnabledFromSource('const MANYCHAT_CAPTURE_ENABLED = "true"\n'),
    /valor inválido/i,
  )
})

test('parseManyChatCaptureEnabledFromSource rejeita definição ambígua/múltipla, mesmo quando os valores concordam', () => {
  assert.throws(
    () =>
      parseManyChatCaptureEnabledFromSource(
        'const MANYCHAT_CAPTURE_ENABLED = false\nconst MANYCHAT_CAPTURE_ENABLED = false\n',
      ),
    /ambígua/i,
  )
})

test('parseManyChatCaptureEnabledFromSource ignora menções em comentário de linha (nunca conta como segunda declaração)', () => {
  assert.equal(
    parseManyChatCaptureEnabledFromSource(
      '// MANYCHAT_CAPTURE_ENABLED = true está errado aqui\nconst MANYCHAT_CAPTURE_ENABLED = false\n',
    ),
    false,
  )
})

test('parseManyChatCaptureEnabledFromSource ignora a chave curta de um objeto (não é uma declaração)', () => {
  assert.equal(
    parseManyChatCaptureEnabledFromSource(
      'const MANYCHAT_CAPTURE_ENABLED = false\nconst api = { MANYCHAT_CAPTURE_ENABLED }\n',
    ),
    false,
  )
})

// ---------------------------------------------------------------------
// STEP 2B.1 — seleção explícita de fonte por ambiente.
// ---------------------------------------------------------------------

test('featureFlagSourceForEnvironment: dev usa a fonte normal', () => {
  assert.equal(featureFlagSourceForEnvironment('dev'), FEATURE_FLAGS_SOURCE_DEFAULT)
})

test('featureFlagSourceForEnvironment: prod usa a fonte normal', () => {
  assert.equal(featureFlagSourceForEnvironment('prod'), FEATURE_FLAGS_SOURCE_DEFAULT)
})

test('featureFlagSourceForEnvironment: e2e usa a fonte exclusiva e2e', () => {
  assert.equal(featureFlagSourceForEnvironment('e2e'), FEATURE_FLAGS_SOURCE_E2E)
})

test('featureFlagSourceForEnvironment: qualquer outro ambiente lança', () => {
  assert.throws(() => featureFlagSourceForEnvironment('staging'), /ambiente desconhecido/i)
  assert.throws(() => featureFlagSourceForEnvironment(''), /ambiente desconhecido/i)
  assert.throws(() => featureFlagSourceForEnvironment(undefined), /ambiente desconhecido/i)
})

// ---------------------------------------------------------------------
// STEP 2B.1 — manyChatCaptureFlagCorrect (predicado puro usado pelo check
// `manychat_capture_flag_correct`).
// ---------------------------------------------------------------------

test('manyChatCaptureFlagCorrect: dev/prod só aceitam false; e2e só aceita true', () => {
  assert.equal(manyChatCaptureFlagCorrect(false, 'dev'), true)
  assert.equal(manyChatCaptureFlagCorrect(true, 'dev'), false)
  assert.equal(manyChatCaptureFlagCorrect(false, 'prod'), true)
  assert.equal(manyChatCaptureFlagCorrect(true, 'prod'), false)
  assert.equal(manyChatCaptureFlagCorrect(true, 'e2e'), true)
  assert.equal(manyChatCaptureFlagCorrect(false, 'e2e'), false)
})

test('manyChatCaptureFlagCorrect: ambiente desconhecido lança', () => {
  assert.throws(() => manyChatCaptureFlagCorrect(true, 'staging'), /ambiente desconhecido/i)
})

// ---------------------------------------------------------------------
// STEP 2B.1 — classificação e2e nunca pode ser STORE_ELIGIBLE_CANDIDATE.
// ---------------------------------------------------------------------

test('classifyReleaseCandidate: isE2E com técnico OK classifica E2E_INTERNAL_ONLY, storeEligible false', () => {
  const result = classifyReleaseCandidate({ technicalPass: true, localhostDetected: true, isE2E: true })
  assert.equal(result.classification, 'E2E_INTERNAL_ONLY')
  assert.equal(result.storeEligible, false)
})

test('classifyReleaseCandidate: isE2E omitido preserva exatamente o comportamento anterior (dev/prod)', () => {
  const result = classifyReleaseCandidate({ technicalPass: true, localhostDetected: false })
  assert.equal(result.classification, 'STORE_ELIGIBLE_CANDIDATE')
  assert.equal(result.storeEligible, true)
})

test('classifyReleaseCandidate: isE2E=true NUNCA é STORE_ELIGIBLE_CANDIDATE, mesmo sem localhost e com técnico perfeito', () => {
  const result = classifyReleaseCandidate({ technicalPass: true, localhostDetected: false, isE2E: true })
  assert.notEqual(result.classification, 'STORE_ELIGIBLE_CANDIDATE')
  assert.equal(result.storeEligible, false)
})

// ---------------------------------------------------------------------
// STEP 2B.1, seção 22 — testes de segurança negativa. Nunca editam os
// arquivos-fonte: só encadeiam os predicados puros já testados acima para
// provar que os três cenários de vazamento são estruturalmente impossíveis
// de passar despercebidos pela classificação.
// ---------------------------------------------------------------------

test('SEGURANÇA NEGATIVA: PROD com flag efetiva TRUE nunca passa — check falha e a classificação vira BUILD_INVALID', () => {
  const flagCheckPasses = manyChatCaptureFlagCorrect(true, 'prod')
  assert.equal(flagCheckPasses, false, 'o check manychat_capture_flag_correct precisa falhar para prod+true')

  // Um check falhando derruba technicalPass do pacote inteiro (ver
  // runChecksForTarget: pass = checks.every(c => c.pass)).
  const result = classifyReleaseCandidate({ technicalPass: false, localhostDetected: false })
  assert.equal(result.classification, 'BUILD_INVALID')
  assert.equal(result.storeEligible, false)
})

test('SEGURANÇA NEGATIVA: DEV com flag efetiva TRUE nunca passa — check falha e a classificação vira BUILD_INVALID', () => {
  const flagCheckPasses = manyChatCaptureFlagCorrect(true, 'dev')
  assert.equal(flagCheckPasses, false, 'o check manychat_capture_flag_correct precisa falhar para dev+true')

  const result = classifyReleaseCandidate({ technicalPass: false, localhostDetected: true })
  assert.equal(result.classification, 'BUILD_INVALID')
  assert.equal(result.storeEligible, false)
})

test('SEGURANÇA NEGATIVA: E2E com flag efetiva FALSE nunca passa — check falha e a classificação vira BUILD_INVALID', () => {
  const flagCheckPasses = manyChatCaptureFlagCorrect(false, 'e2e')
  assert.equal(flagCheckPasses, false, 'o check manychat_capture_flag_correct precisa falhar para e2e+false')

  const result = classifyReleaseCandidate({ technicalPass: false, localhostDetected: true, isE2E: true })
  assert.equal(result.classification, 'BUILD_INVALID')
  assert.equal(result.storeEligible, false)
})

test('SEGURANÇA NEGATIVA: nenhuma combinação de entradas faz classifyReleaseCandidate(isE2E=true) devolver storeEligible=true', () => {
  for (const technicalPass of [true, false]) {
    for (const localhostDetected of [true, false]) {
      const result = classifyReleaseCandidate({ technicalPass, localhostDetected, isE2E: true })
      assert.equal(
        result.storeEligible,
        false,
        `isE2E=true com technicalPass=${technicalPass}/localhostDetected=${localhostDetected} nunca pode ser storeEligible=true`,
      )
      assert.notEqual(result.classification, 'STORE_ELIGIBLE_CANDIDATE')
    }
  }
})
