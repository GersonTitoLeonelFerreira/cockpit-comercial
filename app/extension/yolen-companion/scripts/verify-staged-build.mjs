#!/usr/bin/env node
// Verificação de frescor do pacote que o navegador realmente carrega.
//
// Problema real: source atualizado → main atualizada → Firefox recarregado a
// partir de dist/yolen-companion/firefox/prod/staging/ → dist antigo →
// produto aparentemente sem mudança. Este verificador compara o staging com
// o que as FONTES ATUAIS produziriam e falha (exit 1) quando o pacote está
// velho. Ele não tem uma segunda implementação do build: o conteúdo esperado
// de cada arquivo vem das mesmas funções canônicas que o build usa para
// escrever o staging (build-package.mjs → expectedStagedEntryContent /
// expectedBuildIdentity):
//   - manifest.json transformado para o alvo/ambiente (PROD sem hosts de
//     desenvolvimento, ícones vinculados, ajustes de loja);
//   - feature flag efetiva do ManyChat (fonte selecionada por ambiente);
//   - ícones redimensionados a partir de assets/yolen-mark.png;
//   - todos os arquivos de runtime copiados;
//   - identidade de build (versão, commit, alterações locais, fingerprint).
// Também detecta staging editado à mão depois do build (fingerprint) e
// arquivos que não pertencem ao pacote.
//
// Uso: node app/extension/yolen-companion/scripts/verify-staged-build.mjs [firefox|chrome] [prod|dev]

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  BUILD_IDENTITY_JSON,
  BUILD_IDENTITY_PATHNAME,
  EXPECTED_MANYCHAT_CAPTURE_ENABLED_BY_ENVIRONMENT,
  EXTENSION_ROOT,
  FEATURE_FLAGS_PATHNAME,
  REPO_ROOT,
  TARGETS,
  computeSourceFingerprint,
  expectedBuildIdentity,
  expectedStagedEntryContent,
  featureFlagSourceForEnvironment,
  getTargetZipEntries,
  parseBuildIdentitySource,
  parseManyChatCaptureEnabledFromSource,
  readSourceGitIdentity,
  readSourceManifest,
  renderBuildIdentitySource,
  stagingDirFor,
} from './build-package.mjs'

export { stagingDirFor }

function describeMismatch(entry, environment) {
  if (entry === 'manifest.json') {
    return `manifest.json do staging difere do manifest ${environment} que as fontes atuais geram.`
  }

  if (entry === FEATURE_FLAGS_PATHNAME) {
    return `Feature flag efetiva do staging (${FEATURE_FLAGS_PATHNAME}) difere da fonte selecionada para ${environment} (${featureFlagSourceForEnvironment(environment)}).`
  }

  if (entry.startsWith('assets/icons/')) {
    return `Ícone gerado difere do que assets/yolen-mark.png atual produz: ${entry}`
  }

  return `Arquivo do staging difere do código-fonte atual: ${entry}`
}

function listStagedFiles(stagingDir) {
  return readdirSync(stagingDir, { recursive: true, withFileTypes: true })
    .filter((dirent) => dirent.isFile())
    .map((dirent) => relative(stagingDir, join(dirent.parentPath ?? dirent.path, dirent.name)).split(sep).join('/'))
}

export function verifyStagedBuild({
  targetName = 'firefox',
  environment = 'prod',
  extensionRoot = EXTENSION_ROOT,
  repoRoot = REPO_ROOT,
  stagingDir = stagingDirFor(targetName, environment),
} = {}) {
  if (!TARGETS[targetName]) {
    throw new Error(`Alvo desconhecido: ${targetName}`)
  }

  const problems = []

  const identityPath = join(stagingDir, BUILD_IDENTITY_PATHNAME)

  if (!existsSync(identityPath)) {
    return {
      fresh: false,
      stagingDir,
      identity: null,
      expectedIdentity: null,
      problems: [`Staging sem identidade de build (${identityPath}). Rode o build.`],
    }
  }

  const stagedIdentitySource = readFileSync(identityPath, 'utf8')
  const identity = parseBuildIdentitySource(stagedIdentitySource)

  if (!identity) {
    return {
      fresh: false,
      stagingDir,
      identity: null,
      expectedIdentity: null,
      problems: ['Identidade de build ilegível no staging.'],
    }
  }

  const git = readSourceGitIdentity({ repoRoot, extensionRoot })
  const sourceManifest = readSourceManifest(extensionRoot)

  if (identity.version !== sourceManifest.version) {
    problems.push(`Versão do pacote ${identity.version} != manifest atual ${sourceManifest.version}.`)
  }

  if (git.commit && identity.commit !== git.commit) {
    problems.push(`Commit do pacote ${identity.commit_short} != HEAD atual ${git.commit_short}.`)
  }

  const entries = getTargetZipEntries(targetName)
  const expectedContents = new Map()

  for (const entry of entries) {
    if (entry === BUILD_IDENTITY_PATHNAME) {
      continue
    }

    let expected

    try {
      expected = expectedStagedEntryContent({
        entry,
        targetName,
        environment,
        sourceManifest,
        extensionRoot,
      })
    } catch (error) {
      problems.push(`Não foi possível calcular o conteúdo esperado de ${entry} a partir das fontes atuais: ${error.message}`)
      continue
    }

    expectedContents.set(entry, expected)

    const staged = join(stagingDir, entry)

    if (!existsSync(staged)) {
      problems.push(`Arquivo ausente no staging: ${entry}`)
      continue
    }

    if (!readFileSync(staged).equals(expected)) {
      problems.push(describeMismatch(entry, environment))
    }
  }

  // Valor efetivo da flag dentro do pacote, por ambiente (nunca só a fonte).
  const stagedFlagPath = join(stagingDir, FEATURE_FLAGS_PATHNAME)

  if (existsSync(stagedFlagPath)) {
    let effective = null

    try {
      effective = parseManyChatCaptureEnabledFromSource(readFileSync(stagedFlagPath, 'utf8'))
    } catch (error) {
      problems.push(`Feature flag efetiva ilegível no staging: ${error.message}`)
    }

    const required = EXPECTED_MANYCHAT_CAPTURE_ENABLED_BY_ENVIRONMENT[environment]

    if (effective !== null && effective !== required) {
      problems.push(`MANYCHAT_CAPTURE_ENABLED efetivo no staging é ${effective}; ${environment} exige ${required}.`)
    }
  }

  // Identidade que um build das fontes atuais carimbaria.
  let expectedIdentity = null

  if (expectedContents.size === entries.length - 1) {
    expectedIdentity = expectedBuildIdentity({
      targetName,
      environment,
      sourceManifest,
      extensionRoot,
      repoRoot,
      contents: expectedContents,
    })

    if (renderBuildIdentitySource(expectedIdentity) !== stagedIdentitySource) {
      problems.push(
        `Identidade de build do staging (build ${identity.build_id}) difere da que as fontes atuais gerariam (build ${expectedIdentity.build_id}).`,
      )
    }
  }

  const missing = entries.filter((entry) => !existsSync(join(stagingDir, entry)))

  if (missing.length === 0) {
    const fingerprint = computeSourceFingerprint(stagingDir, entries)

    if (fingerprint !== identity.source_fingerprint) {
      problems.push('Fingerprint do staging não corresponde ao gravado no build (staging alterado depois do build).')
    }
  }

  const allowed = new Set([...entries, BUILD_IDENTITY_JSON])

  for (const file of listStagedFiles(stagingDir)) {
    if (!allowed.has(file)) {
      problems.push(`Arquivo inesperado no staging (não pertence ao pacote): ${file}`)
    }
  }

  return {
    fresh: problems.length === 0,
    stagingDir,
    identity,
    expectedIdentity,
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
    console.log('  estado: ATUAL — o staging corresponde ao que as fontes atuais produzem (manifest, feature flag, ícones, arquivos e identidade).')
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
