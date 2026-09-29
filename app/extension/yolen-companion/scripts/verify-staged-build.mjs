#!/usr/bin/env node
// Verificação de frescor do pacote que o navegador realmente carrega.
//
// Problema real: source atualizado → main atualizada → Firefox recarregado a
// partir de dist/yolen-companion/firefox/prod/staging/ → dist antigo →
// produto aparentemente sem mudança. Este verificador compara o staging com
// o checkout atual e falha (exit 1) quando o pacote está velho:
//   - commit do pacote != HEAD atual;
//   - versão do pacote != manifest.json de origem;
//   - algum arquivo de runtime copiado difere do código-fonte atual;
//   - fingerprint do staging não bate com o gravado no build (staging
//     editado à mão depois do build).
//
// Uso: node app/extension/yolen-companion/scripts/verify-staged-build.mjs [firefox|chrome] [prod|dev]

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  BUILD_IDENTITY_PATHNAME,
  EXTENSION_ROOT,
  FEATURE_FLAGS_PATHNAME,
  OUTPUT_ROOT,
  TARGETS,
  computeSourceFingerprint,
  getTargetZipEntries,
  parseBuildIdentitySource,
  readSourceGitIdentity,
  readSourceManifest,
} from './build-package.mjs'

// Arquivos cujo conteúdo no pacote é gerado/transformado por design.
const GENERATED_ENTRIES = new Set([
  'manifest.json',
  BUILD_IDENTITY_PATHNAME,
  FEATURE_FLAGS_PATHNAME,
])

export function stagingDirFor(targetName, environment) {
  return environment === 'prod'
    ? join(OUTPUT_ROOT, targetName, 'prod', 'staging')
    : join(OUTPUT_ROOT, targetName, 'staging')
}

export function verifyStagedBuild({ targetName = 'firefox', environment = 'prod' } = {}) {
  if (!TARGETS[targetName]) {
    throw new Error(`Alvo desconhecido: ${targetName}`)
  }

  const stagingDir = stagingDirFor(targetName, environment)
  const problems = []

  const identityPath = join(stagingDir, BUILD_IDENTITY_PATHNAME)

  if (!existsSync(identityPath)) {
    return {
      fresh: false,
      stagingDir,
      identity: null,
      problems: [`Staging sem identidade de build (${identityPath}). Rode o build.`],
    }
  }

  const identity = parseBuildIdentitySource(readFileSync(identityPath, 'utf8'))

  if (!identity) {
    return {
      fresh: false,
      stagingDir,
      identity: null,
      problems: ['Identidade de build ilegível no staging.'],
    }
  }

  const git = readSourceGitIdentity()
  const manifest = readSourceManifest()

  if (identity.version !== manifest.version) {
    problems.push(`Versão do pacote ${identity.version} != manifest atual ${manifest.version}.`)
  }

  if (git.commit && identity.commit !== git.commit) {
    problems.push(`Commit do pacote ${identity.commit_short} != HEAD atual ${git.commit_short}.`)
  }

  const entries = getTargetZipEntries(targetName)

  for (const entry of entries) {
    if (GENERATED_ENTRIES.has(entry) || entry.startsWith('assets/icons/')) {
      continue
    }

    const staged = join(stagingDir, entry)
    const source = join(EXTENSION_ROOT, entry)

    if (!existsSync(staged)) {
      problems.push(`Arquivo ausente no staging: ${entry}`)
      continue
    }

    if (existsSync(source) && !readFileSync(staged).equals(readFileSync(source))) {
      problems.push(`Arquivo do staging difere do código-fonte atual: ${entry}`)
    }
  }

  const fingerprint = computeSourceFingerprint(stagingDir, entries)

  if (fingerprint !== identity.source_fingerprint) {
    problems.push('Fingerprint do staging não corresponde ao gravado no build (staging alterado depois do build).')
  }

  return {
    fresh: problems.length === 0,
    stagingDir,
    identity,
    problems,
  }
}

function main() {
  const [targetName = 'firefox', environment = 'prod'] = process.argv.slice(2)
  const result = verifyStagedBuild({ targetName, environment })

  const label = result.identity
    ? `v${result.identity.version} · commit ${result.identity.commit_short}${result.identity.dirty ? ' (+ alterações locais)' : ''} · build ${result.identity.build_id}`
    : 'sem identidade'

  console.log(`[${targetName}/${environment}] ${result.stagingDir}`)
  console.log(`  identidade: ${label}`)

  if (result.fresh) {
    console.log('  estado: ATUAL — o staging corresponde ao checkout atual.')
    return
  }

  console.log('  estado: DESATUALIZADO')
  for (const problem of result.problems) {
    console.log(`    - ${problem}`)
  }
  process.exitCode = 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}
