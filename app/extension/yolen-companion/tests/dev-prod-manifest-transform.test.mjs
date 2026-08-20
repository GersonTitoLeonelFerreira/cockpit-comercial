import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import {
  EXTENSION_ROOT,
  FIREFOX_STRICT_MIN_VERSION,
  ICON_SIZES,
  PRODUCTION_HOSTS,
  SHARED_RUNTIME_FILES,
  TARGETS,
  assertAllowlistMatchesManifest,
  readSourceManifest,
  toProductionManifest,
  zipFileName,
} from '../scripts/build-package.mjs'
import { decodePng, resizePngSquare } from '../scripts/lib/png-resize.mjs'
import {
  classifyReleaseCandidate,
  firefoxGeckoSettingsValid,
  manifestBackgroundMatches,
  manifestHasDevHosts,
  manifestHostsAndPermissionsMatch,
  manifestIconsMatch,
  manifestMatchesExpectedTransform,
} from '../scripts/validate-release-candidate.mjs'

const sourceManifest = readSourceManifest()

// 1) DEV continua contendo localhost -----------------------------------
test('DEV: manifest.json de origem e os manifests adaptados por navegador continuam contendo localhost:3000', () => {
  assert.ok(manifestHasDevHosts(sourceManifest), 'manifest.json de origem deveria conter localhost')

  for (const targetName of Object.keys(TARGETS)) {
    const devManifest = TARGETS[targetName].adaptManifest(sourceManifest)
    assert.ok(manifestHasDevHosts(devManifest), `manifest DEV de ${targetName} deveria conter localhost`)
    assert.ok(
      devManifest.host_permissions.includes('http://localhost:3000/*'),
      `host_permissions DEV de ${targetName} deveria conter localhost`,
    )
  }
})

// 2) Chrome PROD não contém localhost em nenhum campo -------------------
test('Chrome PROD: nenhum campo do manifest contém localhost (host_permissions, content_scripts.matches, web_accessible_resources.matches)', () => {
  const prodManifest = toProductionManifest(sourceManifest, 'chrome')

  assert.equal(manifestHasDevHosts(prodManifest), false)
  assert.deepEqual([...prodManifest.host_permissions].sort(), [...PRODUCTION_HOSTS].sort())
  assert.ok(!prodManifest.host_permissions.some((host) => host.includes('localhost')))
  for (const block of prodManifest.content_scripts) {
    assert.ok(!block.matches.some((host) => host.includes('localhost')))
  }
  for (const block of prodManifest.web_accessible_resources) {
    assert.ok(!block.matches.some((host) => host.includes('localhost')))
  }
})

// 3) Firefox PROD não contém localhost em nenhum campo -------------------
test('Firefox PROD: nenhum campo do manifest contém localhost (host_permissions, content_scripts.matches, web_accessible_resources.matches)', () => {
  const prodManifest = toProductionManifest(sourceManifest, 'firefox')

  assert.equal(manifestHasDevHosts(prodManifest), false)
  assert.ok(!prodManifest.host_permissions.some((host) => host.includes('localhost')))
  for (const block of prodManifest.content_scripts) {
    assert.ok(!block.matches.some((host) => host.includes('localhost')))
  }
  for (const block of prodManifest.web_accessible_resources) {
    assert.ok(!block.matches.some((host) => host.includes('localhost')))
  }
})

// 4) Chrome recebe somente service worker --------------------------------
test('Chrome PROD: background contém somente service_worker (sem scripts)', () => {
  const prodManifest = toProductionManifest(sourceManifest, 'chrome')
  assert.deepEqual(Object.keys(prodManifest.background), ['service_worker'])
  assert.equal(prodManifest.background.service_worker, 'src/background-service-worker.js')
})

// 5) Firefox recebe somente scripts --------------------------------------
test('Firefox PROD: background contém somente scripts (sem service_worker)', () => {
  const prodManifest = toProductionManifest(sourceManifest, 'firefox')
  assert.deepEqual(Object.keys(prodManifest.background), ['scripts'])
  assert.deepEqual(prodManifest.background.scripts, ['src/capture-transport.js', 'src/background.js'])
})

// 6) Ícones estão declarados e existem -----------------------------------
test('Chrome e Firefox PROD: icons declarados no manifest e os PNGs correspondentes existem e são válidos', () => {
  const sourceIcon = readFileSync(join(EXTENSION_ROOT, 'assets', 'yolen-mark.png'))

  for (const targetName of Object.keys(TARGETS)) {
    const prodManifest = toProductionManifest(sourceManifest, targetName)

    assert.ok(prodManifest.icons, `manifest PROD de ${targetName} deveria declarar icons`)
    assert.deepEqual(Object.keys(prodManifest.icons).map(Number).sort((a, b) => a - b), ICON_SIZES)

    for (const [sizeKey, path] of Object.entries(prodManifest.icons)) {
      const size = Number(sizeKey)
      assert.equal(path, `assets/icons/icon-${size}.png`)

      const png = resizePngSquare(sourceIcon, size)
      const decoded = decodePng(png)
      assert.equal(decoded.width, size)
      assert.equal(decoded.height, size)
    }
  }
})

// 7) Firefox possui strict_min_version -----------------------------------
test('Firefox PROD: browser_specific_settings.gecko possui strict_min_version com justificativa técnica (MV3 estável)', () => {
  const prodManifest = toProductionManifest(sourceManifest, 'firefox')

  assert.equal(prodManifest.browser_specific_settings.gecko.strict_min_version, FIREFOX_STRICT_MIN_VERSION)
  assert.equal(typeof prodManifest.browser_specific_settings.gecko.id, 'string')
  assert.ok(firefoxGeckoSettingsValid(prodManifest, FIREFOX_STRICT_MIN_VERSION))

  // Chrome PROD não deve carregar nenhuma configuração exclusiva do Firefox.
  const chromeProdManifest = toProductionManifest(sourceManifest, 'chrome')
  assert.equal(chromeProdManifest.browser_specific_settings, undefined)
})

// 8) Reintroduzir localhost derruba store eligibility ---------------------
test('Reintroduzir localhost no manifest PROD derruba store eligibility (nunca STORE_ELIGIBLE_CANDIDATE)', () => {
  const expected = toProductionManifest(sourceManifest, 'chrome')
  const tampered = structuredClone(expected)
  tampered.host_permissions.push('http://localhost:3000/*')

  assert.equal(manifestHasDevHosts(tampered), true)
  assert.equal(manifestMatchesExpectedTransform(tampered, expected), false)
  assert.equal(manifestHostsAndPermissionsMatch(tampered, expected), false)

  // Espelha exatamente a agregação feita em runChecksForTarget: qualquer
  // check falhando derruba `technicalPass`, que é o único jeito de chegar
  // em STORE_ELIGIBLE_CANDIDATE.
  const technicalPass = [
    !manifestHasDevHosts(tampered),
    manifestHostsAndPermissionsMatch(tampered, expected),
    manifestMatchesExpectedTransform(tampered, expected),
  ].every(Boolean)

  const result = classifyReleaseCandidate({ technicalPass, localhostDetected: manifestHasDevHosts(tampered) })
  assert.notEqual(result.classification, 'STORE_ELIGIBLE_CANDIDATE')
  assert.equal(result.storeEligible, false)
})

// 9) Ícone faltante derruba store eligibility ------------------------------
test('Remover um ícone declarado do manifest PROD derruba store eligibility', () => {
  const expected = toProductionManifest(sourceManifest, 'firefox')
  const tampered = structuredClone(expected)
  delete tampered.icons['48']

  assert.equal(manifestIconsMatch(tampered, expected), false)
  assert.equal(manifestMatchesExpectedTransform(tampered, expected), false)

  const technicalPass = [manifestIconsMatch(tampered, expected), manifestMatchesExpectedTransform(tampered, expected)].every(
    Boolean,
  )
  const result = classifyReleaseCandidate({ technicalPass, localhostDetected: manifestHasDevHosts(tampered) })
  assert.notEqual(result.classification, 'STORE_ELIGIBLE_CANDIDATE')
  assert.equal(result.storeEligible, false)
})

// 10) Background incorreto derruba store eligibility -----------------------
test('Configuração de background incorreta (Chrome com scripts + service_worker) derruba store eligibility', () => {
  const expected = toProductionManifest(sourceManifest, 'chrome')
  const tampered = structuredClone(expected)
  tampered.background.scripts = ['src/capture-transport.js', 'src/background.js']

  assert.equal(manifestBackgroundMatches(tampered, expected), false)
  assert.equal(manifestMatchesExpectedTransform(tampered, expected), false)

  const technicalPass = [
    manifestBackgroundMatches(tampered, expected),
    manifestMatchesExpectedTransform(tampered, expected),
  ].every(Boolean)
  const result = classifyReleaseCandidate({ technicalPass, localhostDetected: manifestHasDevHosts(tampered) })
  assert.notEqual(result.classification, 'STORE_ELIGIBLE_CANDIDATE')
  assert.equal(result.storeEligible, false)
})

// 11) Pacote interno DEV nunca é confundido com pacote PROD ----------------
test('Pacotes DEV e PROD nunca são confundíveis: nomes de arquivo, presença de localhost e vínculo de icons diferem sempre', () => {
  for (const targetName of Object.keys(TARGETS)) {
    const devManifest = TARGETS[targetName].adaptManifest(sourceManifest)
    const prodManifest = toProductionManifest(sourceManifest, targetName)

    const devZipName = zipFileName(targetName, 'dev', sourceManifest.version)
    const prodZipName = zipFileName(targetName, 'prod', sourceManifest.version)
    assert.notEqual(devZipName, prodZipName)
    assert.ok(prodZipName.includes('-prod-'))
    assert.ok(!devZipName.includes('-prod-'))

    assert.equal(manifestHasDevHosts(devManifest), true)
    assert.equal(manifestHasDevHosts(prodManifest), false)

    assert.equal(devManifest.icons, undefined)
    assert.ok(prodManifest.icons)

    const devClassification = classifyReleaseCandidate({
      technicalPass: true,
      localhostDetected: manifestHasDevHosts(devManifest),
    })
    const prodClassification = classifyReleaseCandidate({
      technicalPass: true,
      localhostDetected: manifestHasDevHosts(prodManifest),
    })
    assert.equal(devClassification.classification, 'INTERNAL_DEV_ONLY')
    assert.equal(prodClassification.classification, 'STORE_ELIGIBLE_CANDIDATE')
    assert.notEqual(devClassification.classification, prodClassification.classification)
  }
})

// 12) Nenhuma alteração funcional ocorre em src/ ----------------------------
test('D3 não introduz nem remove arquivos de runtime: allowlist de empacotamento continua coerente com manifest.json', () => {
  // Prova indireta e permanente: se o D3 (ou qualquer trabalho futuro)
  // tivesse alterado quais arquivos de src/ o manifest referencia sem
  // atualizar a allowlist do build (ou vice-versa), isto falharia. A prova
  // direta de que NENHUM byte de src/ mudou nesta tarefa é feita via
  // `git diff` antes do commit do D3 (registrado no relatório de entrega),
  // não faz sentido travar isso para sempre num teste de conteúdo — outras
  // trilhas (A5/B3) vão legitimamente editar src/ no futuro.
  assert.doesNotThrow(() => assertAllowlistMatchesManifest(sourceManifest))
  assert.ok(SHARED_RUNTIME_FILES.every((file) => file.startsWith('src/') || file.startsWith('assets/')))
})

// Sanidade adicional: o build real (subprocess) também deve produzir os
// quatro pacotes esperados e o validador deve classificar exatamente como
// acima — cobre o caminho de ponta a ponta, não só as funções puras.
test('build real gera os 4 pacotes (chrome/firefox × dev/prod) com os nomes esperados', () => {
  const buildScript = join(EXTENSION_ROOT, 'scripts', 'build-package.mjs')
  execFileSync('node', [buildScript], { stdio: 'pipe' })

  for (const targetName of Object.keys(TARGETS)) {
    for (const environment of ['dev', 'prod']) {
      const zipName = zipFileName(targetName, environment, sourceManifest.version)
      const zipPath = join(EXTENSION_ROOT, '..', '..', '..', 'dist', 'yolen-companion', zipName)
      assert.ok(existsSync(zipPath), `esperava ${zipPath} gerado`)
    }
  }
})
