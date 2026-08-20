#!/usr/bin/env node
// Validador de Release Candidate do Yolen Companion (D2, estendido no D3).
//
// Roda o build reproduzível (D1/D3) do zero e inspeciona byte a byte os
// QUATRO pacotes gerados (Chrome/Firefox × dev/prod), aplicando um conjunto
// determinístico de verificações técnicas por combinação. Não decide
// sozinho se um pacote pode ir para loja: a classificação
// `STORE_ELIGIBLE_CANDIDATE` só é atingida quando TODAS as verificações
// técnicas passam E nenhum host de desenvolvimento sobrevive em nenhum
// campo do manifest E os ícones estão declarados/válidos E o background e
// as configurações específicas do navegador estão corretos — nunca só pela
// ausência de `localhost`. Ver `classifyReleaseCandidate`.
//
// Não depende de nenhum pacote npm novo: usa apenas módulos nativos do Node
// e os binários `zip`/`unzip` do sistema operacional (os mesmos já usados
// pelo build).

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ENVIRONMENTS,
  EXTENSION_ROOT,
  FIREFOX_STRICT_MIN_VERSION,
  ICON_SIZES,
  OUTPUT_ROOT,
  PRODUCTION_HOSTS,
  REPO_ROOT,
  TARGETS,
  assertAllowlistMatchesManifest,
  getTargetZipEntries,
  readSourceManifest,
  sha256,
  toProductionManifest,
  zipFileName,
} from './build-package.mjs'
import { decodePng } from './lib/png-resize.mjs'

const BUILD_SCRIPT = join(EXTENSION_ROOT, 'scripts', 'build-package.mjs')

// Limites de tamanho: generosos o bastante para não travar um build
// legítimo, mas suficientes para pegar algo inflado por engano (ex.: um
// asset gigante ou uma dependência inteira entrando sem querer no pacote).
export const MAX_ZIP_BYTES = 8 * 1024 * 1024 // 8 MiB
export const MAX_ENTRY_UNCOMPRESSED_BYTES = 4 * 1024 * 1024 // 4 MiB por arquivo dentro do zip

// Qualquer entrada do zip que bata em um destes padrões é, por definição,
// algo que não deveria estar num pacote de distribuição — mesmo que a
// allowlist do build já torne isso estruturalmente improvável, esta é uma
// segunda linha de defesa que inspeciona o artefato final de verdade.
export const FORBIDDEN_ENTRY_PATTERNS = [
  { pattern: /(^|\/)tests?\//i, reason: 'diretório de testes' },
  { pattern: /\.test\.[cm]?[jt]sx?$/i, reason: 'arquivo de teste' },
  { pattern: /(^|\/)\.env(\.|$)/i, reason: 'arquivo de ambiente (.env)' },
  { pattern: /\.map$/i, reason: 'source map' },
  { pattern: /(^|\/)\.git(\/|$)/i, reason: 'metadado git' },
  { pattern: /(^|\/)node_modules\//i, reason: 'node_modules' },
  { pattern: /\.ds_store$/i, reason: 'artefato de SO (.DS_Store)' },
  { pattern: /\.swp$/i, reason: 'arquivo temporário de editor' },
  { pattern: /secret/i, reason: 'nome sugere segredo' },
  { pattern: /\.pem$/i, reason: 'chave/certificado' },
  { pattern: /(^|\/)scripts\//i, reason: 'scripts de build não pertencem ao pacote de runtime' },
  { pattern: /(^|\/)readme\.md$/i, reason: 'documentação de release não pertence ao pacote de runtime' },
  { pattern: /(^|\/)changelog\.md$/i, reason: 'documentação de release não pertence ao pacote de runtime' },
]

export function findForbiddenEntries(entries) {
  const findings = []
  for (const entry of entries) {
    for (const { pattern, reason } of FORBIDDEN_ENTRY_PATTERNS) {
      if (pattern.test(entry)) {
        findings.push({ entry, reason })
      }
    }
  }
  return findings
}

export function checkSizeLimits({ zipBytes, entrySizes }) {
  const violations = []

  if (zipBytes > MAX_ZIP_BYTES) {
    violations.push(`pacote com ${zipBytes} bytes excede o limite de ${MAX_ZIP_BYTES} bytes`)
  }

  for (const { name, size } of entrySizes) {
    if (size > MAX_ENTRY_UNCOMPRESSED_BYTES) {
      violations.push(`${name} com ${size} bytes excede o limite de ${MAX_ENTRY_UNCOMPRESSED_BYTES} bytes por arquivo`)
    }
  }

  return { pass: violations.length === 0, violations }
}

// Predicados puros usados pelas verificações por pacote (`runChecksForTarget`)
// e reutilizados diretamente nos testes determinísticos do D3 — permitem
// provar, sem rodar o build/zip completo, que manifests adulterados (host
// de dev reintroduzido, ícone removido, background trocado) fazem essas
// verificações falharem, o que por sua vez derruba `STORE_ELIGIBLE_CANDIDATE`.
export function manifestHasDevHosts(manifest) {
  return /localhost/i.test(JSON.stringify(manifest ?? {}))
}

export function manifestBackgroundMatches(actualManifest, expectedManifest) {
  return (
    actualManifest?.background != null &&
    JSON.stringify(actualManifest.background) === JSON.stringify(expectedManifest.background)
  )
}

export function manifestIconsMatch(actualManifest, expectedManifest) {
  return JSON.stringify(actualManifest?.icons ?? null) === JSON.stringify(expectedManifest.icons ?? null)
}

export function manifestHostsAndPermissionsMatch(actualManifest, expectedManifest) {
  const expectedHosts = [...(expectedManifest.host_permissions ?? [])].sort()
  const actualHosts = [...(actualManifest?.host_permissions ?? [])].sort()
  const expectedPermissions = [...(expectedManifest.permissions ?? [])].sort()
  const actualPermissions = [...(actualManifest?.permissions ?? [])].sort()
  return (
    JSON.stringify(actualHosts) === JSON.stringify(expectedHosts) &&
    JSON.stringify(actualPermissions) === JSON.stringify(expectedPermissions)
  )
}

export function firefoxGeckoSettingsValid(actualManifest, expectedStrictMinVersion) {
  const gecko = actualManifest?.browser_specific_settings?.gecko
  return typeof gecko?.id === 'string' && gecko.id.length > 0 && gecko?.strict_min_version === expectedStrictMinVersion
}

export function manifestMatchesExpectedTransform(actualManifest, expectedManifest) {
  return actualManifest != null && JSON.stringify(actualManifest) === JSON.stringify(expectedManifest)
}

// Classificação por combinação (navegador × ambiente). `STORE_ELIGIBLE_CANDIDATE`
// NUNCA depende só da ausência de `localhost`: `technicalPass` já é o "E"
// lógico de TODAS as verificações da combinação (arquivos obrigatórios,
// manifest válido, background correto, ícones declarados e válidos,
// configuração do Firefox quando aplicável, hosts/permissões sem nada
// inesperado, versão consistente, sem artefato indevido, dentro dos
// limites de tamanho — ver `runChecksForTarget`). `localhostDetected` é só
// mais um fator que essa mesma combinação de checks já cobre para pacotes
// prod; para pacotes dev ele é esperado e não entra em `checks`.
export function classifyReleaseCandidate({ technicalPass, localhostDetected }) {
  if (!technicalPass) {
    return {
      classification: 'BUILD_INVALID',
      storeEligible: false,
      label: 'Build inválido — uma ou mais verificações técnicas falharam. Não é um build interno válido nem um RC técnico.',
    }
  }

  if (localhostDetected) {
    return {
      classification: 'INTERNAL_DEV_ONLY',
      storeEligible: false,
      label:
        'Release Candidate técnico (uso interno) — todas as verificações técnicas passaram, mas o pacote ainda contém ' +
        'http://localhost:3000/* herdado do manifest de desenvolvimento. NÃO elegível para submissão à Chrome Web Store ' +
        'ou à AMO.',
    }
  }

  return {
    classification: 'STORE_ELIGIBLE_CANDIDATE',
    storeEligible: true,
    label:
      'Release Candidate tecnicamente pronto para submissão à loja: todas as verificações técnicas passaram (arquivos, ' +
      'manifest, background, ícones, hosts/permissões, configuração específica do navegador) e nenhum host de ' +
      'desenvolvimento foi detectado. Isso significa tecnicamente preparado para submissão — não que a extensão já foi ' +
      'publicada ou aprovada pela loja.',
  }
}

function runBuild() {
  try {
    execFileSync('node', [BUILD_SCRIPT], { stdio: 'pipe' })
    return { pass: true }
  } catch (error) {
    return { pass: false, details: error.stderr?.toString() || error.message }
  }
}

function listZipEntries(zipPath) {
  return execFileSync('unzip', ['-Z1', zipPath])
    .toString('utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .sort()
}

function extractEntry(zipPath, entryName) {
  return execFileSync('unzip', ['-p', zipPath, entryName])
}

function check(id, description, pass, details) {
  return { id, description, pass, details: details ?? null }
}

function validateManifestShape(manifest) {
  const problems = []
  if (manifest.manifest_version !== 3) problems.push('manifest_version deveria ser 3')
  if (typeof manifest.name !== 'string' || manifest.name.length === 0) problems.push('name ausente/vazio')
  if (typeof manifest.version !== 'string' || manifest.version.length === 0) problems.push('version ausente/vazio')
  if (typeof manifest.description !== 'string' || manifest.description.length === 0) problems.push('description ausente/vazio')
  if (typeof manifest.background !== 'object' || manifest.background === null) problems.push('background ausente')
  return problems
}

function runChecksForTarget(targetName, environment, sourceManifest, globalAllowlistCoherent) {
  const isProd = environment === 'prod'
  const zipPath = join(OUTPUT_ROOT, zipFileName(targetName, environment, sourceManifest.version))
  const checks = []

  const zipExists = existsSync(zipPath)
  checks.push(check('package_generated', `Pacote ${targetName}/${environment} foi gerado`, zipExists, zipPath))
  if (!zipExists) {
    return { target: targetName, environment, zipPath, checks, localhostDetected: null, pass: false }
  }

  const zipBytes = statSync(zipPath).size
  const actualEntries = listZipEntries(zipPath)
  const expectedEntries = getTargetZipEntries(targetName)

  const missing = expectedEntries.filter((entry) => !actualEntries.includes(entry))
  const unexpected = actualEntries.filter((entry) => !expectedEntries.includes(entry))
  checks.push(
    check(
      'required_files_present',
      'Arquivos obrigatórios presentes e nenhum arquivo fora da allowlist',
      missing.length === 0 && unexpected.length === 0,
      { missing, unexpected },
    ),
  )

  const forbidden = findForbiddenEntries(actualEntries)
  checks.push(
    check(
      'no_disallowed_artifacts',
      'Nenhum tests/, .env, source map, segredo ou artefato indevido no pacote',
      forbidden.length === 0,
      forbidden,
    ),
  )

  checks.push(
    check('allowlist_coherent', 'Allowlist do build coerente com manifest.json de origem', globalAllowlistCoherent),
  )

  let manifest = null
  let manifestProblems = ['manifest.json ausente no pacote']
  if (actualEntries.includes('manifest.json')) {
    try {
      manifest = JSON.parse(extractEntry(zipPath, 'manifest.json').toString('utf8'))
      manifestProblems = validateManifestShape(manifest)
    } catch (error) {
      manifestProblems = [`manifest.json inválido: ${error.message}`]
    }
  }
  checks.push(check('manifest_valid', 'manifest.json do pacote é válido', manifestProblems.length === 0, manifestProblems))

  // Fonte única de verdade sobre "o que deveria estar neste manifest":
  // a mesma transformação que o build usou para gerá-lo (dev = adaptManifest
  // do alvo; prod = toProductionManifest). Comparar contra ela evita que o
  // validador duplique regras de transformação que possam divergir do build.
  const expectedManifest = isProd
    ? toProductionManifest(sourceManifest, targetName)
    : TARGETS[targetName].adaptManifest(sourceManifest)

  const backgroundMatches = manifestBackgroundMatches(manifest, expectedManifest)
  const backgroundLabel =
    targetName === 'chrome'
      ? 'Pacote Chrome contém somente background.service_worker'
      : 'Pacote Firefox contém somente background.scripts'
  checks.push(
    check('background_adapted_for_target', backgroundLabel, backgroundMatches, {
      expected: expectedManifest.background,
      actual: manifest?.background ?? null,
    }),
  )

  const versionInFilename = zipPath.endsWith(`-v${sourceManifest.version}.zip`)
  const versionMatchesManifest = manifest?.version === sourceManifest.version
  checks.push(
    check(
      'version_consistent',
      'Versão do pacote consistente com a versão declarada em manifest.json',
      versionInFilename && versionMatchesManifest,
      { versionInFilename, packageVersion: manifest?.version, sourceVersion: sourceManifest.version },
    ),
  )

  const iconFileProblems = []
  for (const size of ICON_SIZES) {
    const entryName = `assets/icons/icon-${size}.png`
    if (!actualEntries.includes(entryName)) {
      iconFileProblems.push(`${entryName} ausente`)
      continue
    }
    try {
      const decoded = decodePng(extractEntry(zipPath, entryName))
      if (decoded.width !== size || decoded.height !== size) {
        iconFileProblems.push(`${entryName} com dimensões ${decoded.width}x${decoded.height}, esperado ${size}x${size}`)
      }
    } catch (error) {
      iconFileProblems.push(`${entryName} não é um PNG válido: ${error.message}`)
    }
  }
  checks.push(
    check(
      'icon_files_valid',
      'Arquivos de ícone gerados são PNGs válidos nos tamanhos esperados (16/32/48/128)',
      iconFileProblems.length === 0,
      iconFileProblems,
    ),
  )

  // Vínculo do `icons` no manifest é dependente do ambiente: pacotes prod
  // DEVEM declarar `icons` apontando para os PNGs acima; pacotes dev
  // continuam sem declarar (comportamento inalterado desde o D1/D2).
  const iconsMatch = manifestIconsMatch(manifest, expectedManifest)
  checks.push(
    check(
      'icons_declared_correctly',
      isProd
        ? 'manifest de produção declara `icons` apontando para os PNGs gerados'
        : 'manifest de desenvolvimento não declara `icons` (vínculo é exclusivo dos pacotes prod)',
      iconsMatch,
      { expected: expectedManifest.icons ?? null, actual: manifest?.icons ?? null },
    ),
  )

  const localhostDetected = manifestHasDevHosts(manifest)

  if (isProd) {
    checks.push(
      check(
        'no_dev_hosts_anywhere',
        'Nenhum host de desenvolvimento (localhost) em host_permissions, content_scripts.matches ou web_accessible_resources.matches',
        !localhostDetected,
      ),
    )

    checks.push(
      check(
        'no_unexpected_hosts_or_permissions',
        'host_permissions contém apenas hosts de produção esperados e nenhuma permissão inesperada',
        manifestHostsAndPermissionsMatch(manifest, expectedManifest),
        {
          expectedHosts: [...PRODUCTION_HOSTS].sort(),
          actualHosts: [...(manifest?.host_permissions ?? [])].sort(),
          expectedPermissions: [...(expectedManifest.permissions ?? [])].sort(),
          actualPermissions: [...(manifest?.permissions ?? [])].sort(),
        },
      ),
    )

    if (targetName === 'firefox') {
      checks.push(
        check(
          'firefox_gecko_settings_valid',
          `browser_specific_settings.gecko válido, com strict_min_version definido (esperado ${FIREFOX_STRICT_MIN_VERSION})`,
          firefoxGeckoSettingsValid(manifest, FIREFOX_STRICT_MIN_VERSION),
          { actual: manifest?.browser_specific_settings?.gecko ?? null, expectedStrictMinVersion: FIREFOX_STRICT_MIN_VERSION },
        ),
      )
    } else if (targetName === 'chrome') {
      checks.push(
        check(
          'chrome_no_gecko_settings',
          'Pacote Chrome não carrega configuração exclusiva do Firefox (browser_specific_settings)',
          manifest?.browser_specific_settings === undefined,
          { actual: manifest?.browser_specific_settings ?? null },
        ),
      )
    }

    checks.push(
      check(
        'production_manifest_matches_expected_transform',
        'Manifest de produção é exatamente igual à transformação DEV → PROD esperada (nenhuma diferença não prevista)',
        manifestMatchesExpectedTransform(manifest, expectedManifest),
        { expected: expectedManifest, actual: manifest },
      ),
    )
  }

  const entryBuffers = actualEntries.map((name) => ({ name, buffer: extractEntry(zipPath, name) }))
  const entryHashes = entryBuffers.map(({ name, buffer }) => ({
    name,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  }))
  checks.push(check('content_hashes_recorded', 'Hash sha256 do pacote e de cada arquivo interno registrados no relatório', true))

  const entrySizes = entryBuffers.map(({ name, buffer }) => ({ name, size: buffer.length }))
  const sizeCheck = checkSizeLimits({ zipBytes, entrySizes })
  checks.push(check('size_within_limits', 'Pacote e arquivos internos dentro dos limites de tamanho', sizeCheck.pass, sizeCheck.violations))

  const pass = checks.every((c) => c.pass)

  return {
    target: targetName,
    environment,
    zipPath,
    zipBytes,
    zipSha256: sha256(zipPath),
    entries: actualEntries,
    entryHashes,
    localhostDetected,
    checks,
    pass,
  }
}

function main() {
  console.log('== Validador de Release Candidate — Yolen Companion (D2/D3) ==\n')

  console.log('[1/2] Rodando build reproduzível (D1/D3)...')
  const buildResult = runBuild()
  console.log(buildResult.pass ? '  build OK' : `  build FALHOU:\n${buildResult.details}`)

  const sourceManifest = readSourceManifest()

  let allowlistCoherent = true
  let allowlistDetails = null
  try {
    assertAllowlistMatchesManifest(sourceManifest)
  } catch (error) {
    allowlistCoherent = false
    allowlistDetails = error.message
  }

  console.log('\n[2/2] Inspecionando pacotes gerados (Chrome/Firefox × dev/prod)...')
  const rawResults = buildResult.pass
    ? Object.keys(TARGETS).flatMap((targetName) =>
        ENVIRONMENTS.map((environment) => runChecksForTarget(targetName, environment, sourceManifest, allowlistCoherent)),
      )
    : []

  const results = rawResults.map((result) => {
    const technicalPass = result.pass
    const { classification, storeEligible, label } = classifyReleaseCandidate({
      technicalPass,
      localhostDetected: result.localhostDetected,
    })
    return { ...result, technicalPass, classification, storeEligible, label }
  })

  const overallTechnicalPass =
    buildResult.pass && allowlistCoherent && results.length > 0 && results.every((r) => r.technicalPass)

  const report = {
    version: sourceManifest.version,
    generatedAt: new Date().toISOString(),
    buildSucceeded: buildResult.pass,
    buildDetails: buildResult.pass ? null : buildResult.details,
    globalChecks: [check('allowlist_coherent', 'Allowlist do build coerente com manifest.json de origem', allowlistCoherent, allowlistDetails)],
    overallTechnicalPass,
    results: Object.fromEntries(
      results.map((result) => [
        `${result.target}-${result.environment}`,
        {
          target: result.target,
          environment: result.environment,
          zipPath: result.zipPath.replace(`${REPO_ROOT}/`, ''),
          zipBytes: result.zipBytes,
          zipSha256: result.zipSha256,
          localhostDetected: result.localhostDetected,
          technicalPass: result.technicalPass,
          classification: result.classification,
          storeEligible: result.storeEligible,
          label: result.label,
          checks: result.checks,
          entryHashes: result.entryHashes,
        },
      ]),
    ),
  }

  mkdirSync(OUTPUT_ROOT, { recursive: true })
  const reportPath = join(OUTPUT_ROOT, 'release-candidate-report.json')
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)

  console.log('\n== Resultado por pacote ==')
  for (const result of results) {
    console.log(`\n[${result.target}/${result.environment}] ${result.pass ? 'PASS' : 'FAIL'}`)
    for (const c of result.checks) {
      console.log(`  ${c.pass ? '✓' : '✗'} ${c.id}: ${c.description}`)
      if (!c.pass) {
        console.log(`      detalhes: ${JSON.stringify(c.details)}`)
      }
    }
  }

  console.log(`\nAllowlist coerente com manifest.json: ${allowlistCoherent ? 'sim' : `NÃO — ${allowlistDetails}`}`)

  console.log('\n== Classificação ==')
  for (const result of results) {
    const label = `${result.target[0].toUpperCase()}${result.target.slice(1)} ${result.environment.toUpperCase()}`
    console.log(`${label}: ${result.classification}`)
  }

  console.log(`\nValidação técnica geral: ${overallTechnicalPass ? 'PASS' : 'FAIL'}`)
  console.log(`\nRelatório completo: ${reportPath.replace(`${REPO_ROOT}/`, '')}`)

  process.exit(overallTechnicalPass ? 0 : 1)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}
