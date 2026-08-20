#!/usr/bin/env node
// Validador de Release Candidate do Yolen Companion (D2).
//
// Roda o build reproduzível (D1) do zero e inspeciona byte a byte os
// pacotes Chrome/Firefox gerados, aplicando um conjunto determinístico de
// verificações técnicas. Não decide sozinho se o pacote pode ir para loja:
// enquanto o manifest.json de origem incluir `http://localhost:3000/*`
// (host de desenvolvimento), a classificação final é sempre
// INTERNAL_DEV_ONLY, mesmo que todas as verificações técnicas passem — essa
// separação definitiva é escopo do D3, ainda não autorizado.
//
// Não depende de nenhum pacote npm novo: usa apenas módulos nativos do Node
// e os binários `zip`/`unzip` do sistema operacional (o mesmo binário
// `zip` já usado pelo build em D1).

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  EXTENSION_ROOT,
  OUTPUT_ROOT,
  REPO_ROOT,
  TARGETS,
  assertAllowlistMatchesManifest,
  getTargetZipEntries,
  readSourceManifest,
  sha256,
} from './build-package.mjs'
import { decodePng } from './lib/png-resize.mjs'

const BUILD_SCRIPT = join(EXTENSION_ROOT, 'scripts', 'build-package.mjs')
const ICON_SIZES = [16, 32, 48, 128]

// Limites de tamanho: generosos o bastante para não travar um build
// legítimo, mas suficientes para pegar algo inflado por engano (ex.: um
// asset gigante ou uma dependência inteira entrando sem querer no pacote).
export const MAX_ZIP_BYTES = 8 * 1024 * 1024 // 8 MiB
export const MAX_ENTRY_UNCOMPRESSED_BYTES = 4 * 1024 * 1024 // 4 MiB por arquivo dentro do zip

// Qualquer entrada do zip que bata em um destes padrões é, por definição,
// algo que não deveria estar num pacote de distribuição — mesmo que a
// allowlist do build (D1) já torne isso estruturalmente improvável, esta é
// uma segunda linha de defesa que inspeciona o artefato final de verdade.
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

// Classificação exigida pelo Controle Mestre: a presença de localhost no
// pacote NUNCA vira "falha técnica" (é esperada até o D3), mas também
// nunca autoriza publicação em loja. As três classificações são
// mutuamente exclusivas e cobrem exatamente os três estados citados na
// autorização do D2.
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
        'ou à AMO enquanto o D3 (separação definitiva dev/prod) não for executado e autorizado.',
    }
  }

  return {
    classification: 'STORE_ELIGIBLE_CANDIDATE',
    storeEligible: true,
    label: 'Release Candidate tecnicamente elegível para submissão à loja (nenhum host de desenvolvimento detectado).',
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

function runChecksForTarget(targetName, sourceManifest, globalAllowlistCoherent) {
  const zipPath = join(OUTPUT_ROOT, `yolen-companion-${targetName}-v${sourceManifest.version}.zip`)
  const checks = []

  const zipExists = existsSync(zipPath)
  checks.push(check('package_generated', `Pacote ${targetName} foi gerado`, zipExists, zipPath))
  if (!zipExists) {
    return { target: targetName, zipPath, checks, pass: false }
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

  const expectedBackground = manifest ? TARGETS[targetName].adaptManifest(sourceManifest).background : null
  const backgroundMatches =
    manifest?.background != null && JSON.stringify(manifest.background) === JSON.stringify(expectedBackground)
  const backgroundLabel =
    targetName === 'chrome'
      ? 'Pacote Chrome contém somente background.service_worker'
      : 'Pacote Firefox contém somente background.scripts'
  checks.push(
    check('background_adapted_for_target', backgroundLabel, backgroundMatches, {
      expected: expectedBackground,
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

  const iconProblems = []
  for (const size of ICON_SIZES) {
    const entryName = `assets/icons/icon-${size}.png`
    if (!actualEntries.includes(entryName)) {
      iconProblems.push(`${entryName} ausente`)
      continue
    }
    try {
      const decoded = decodePng(extractEntry(zipPath, entryName))
      if (decoded.width !== size || decoded.height !== size) {
        iconProblems.push(`${entryName} com dimensões ${decoded.width}x${decoded.height}, esperado ${size}x${size}`)
      }
    } catch (error) {
      iconProblems.push(`${entryName} não é um PNG válido: ${error.message}`)
    }
  }
  checks.push(check('icons_valid', 'Ícones gerados são PNGs válidos nos tamanhos esperados (16/32/48/128)', iconProblems.length === 0, iconProblems))

  const entryBuffers = actualEntries.map((name) => ({ name, buffer: extractEntry(zipPath, name) }))
  const entryHashes = entryBuffers.map(({ name, buffer }) => ({
    name,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  }))
  checks.push(check('content_hashes_recorded', 'Hash sha256 do pacote e de cada arquivo interno registrados no relatório', true))

  const entrySizes = entryBuffers.map(({ name, buffer }) => ({ name, size: buffer.length }))
  const sizeCheck = checkSizeLimits({ zipBytes, entrySizes })
  checks.push(check('size_within_limits', 'Pacote e arquivos internos dentro dos limites de tamanho', sizeCheck.pass, sizeCheck.violations))

  const manifestText = manifest ? JSON.stringify(manifest) : ''
  const localhostDetected = /localhost/i.test(manifestText)

  const pass = checks.every((c) => c.pass)

  return {
    target: targetName,
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
  console.log('== Validador de Release Candidate — Yolen Companion (D2) ==\n')

  console.log('[1/2] Rodando build reproduzível (D1)...')
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

  console.log('\n[2/2] Inspecionando pacotes gerados...')
  const targetResults = buildResult.pass
    ? Object.keys(TARGETS).map((targetName) => runChecksForTarget(targetName, sourceManifest, allowlistCoherent))
    : []

  const technicalPass =
    buildResult.pass && allowlistCoherent && targetResults.length > 0 && targetResults.every((t) => t.pass)

  const localhostDetected = targetResults.some((t) => t.localhostDetected)
  const { classification, storeEligible, label } = classifyReleaseCandidate({ technicalPass, localhostDetected })

  const report = {
    version: sourceManifest.version,
    generatedAt: new Date().toISOString(),
    buildSucceeded: buildResult.pass,
    buildDetails: buildResult.pass ? null : buildResult.details,
    globalChecks: [check('allowlist_coherent', 'Allowlist do build coerente com manifest.json de origem', allowlistCoherent, allowlistDetails)],
    technicalPass,
    localhostDetected,
    classification,
    storeEligible,
    label,
    targets: Object.fromEntries(
      targetResults.map((result) => [
        result.target,
        {
          zipPath: result.zipPath.replace(`${REPO_ROOT}/`, ''),
          zipBytes: result.zipBytes,
          zipSha256: result.zipSha256,
          localhostDetected: result.localhostDetected,
          pass: result.pass,
          checks: result.checks,
          entryHashes: result.entryHashes,
        },
      ]),
    ),
  }

  mkdirSync(OUTPUT_ROOT, { recursive: true })
  const reportPath = join(OUTPUT_ROOT, 'release-candidate-report.json')
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)

  console.log('\n== Resultado ==')
  for (const result of targetResults) {
    console.log(`\n[${result.target}] ${result.pass ? 'PASS' : 'FAIL'}`)
    for (const c of result.checks) {
      console.log(`  ${c.pass ? '✓' : '✗'} ${c.id}: ${c.description}`)
      if (!c.pass) {
        console.log(`      detalhes: ${JSON.stringify(c.details)}`)
      }
    }
  }

  console.log(`\nAllowlist coerente com manifest.json: ${allowlistCoherent ? 'sim' : `NÃO — ${allowlistDetails}`}`)
  console.log(`\nValidação técnica geral: ${technicalPass ? 'PASS' : 'FAIL'}`)
  console.log(`Classificação: ${classification}`)
  console.log(`Elegível para loja: ${storeEligible ? 'sim' : 'não'}`)
  console.log(`\n${label}`)
  console.log(`\nRelatório completo: ${reportPath.replace(`${REPO_ROOT}/`, '')}`)

  process.exit(technicalPass ? 0 : 1)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}
