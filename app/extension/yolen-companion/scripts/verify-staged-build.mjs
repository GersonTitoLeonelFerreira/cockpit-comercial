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
//
// Canal homolog: além de tudo acima, exige YOLEN_COMPANION_HOMOLOG_BASE_URL
// (a mesma origem usada no build) e prova, a partir do staging real, que o
// manifest só tem o host exato do preview (permissão, bridge, page bridge),
// que a configuração canônica do canal aponta só para esse backend, que o
// background carrega essa configuração primeiro, que a flag do ManyChat é
// false e que a identidade do pacote é firefox|chrome-homolog com esse
// backend. Um staging gerado para OUTRO preview é DESATUALIZADO.
//
// Variante homolog-manychat: as mesmas provas do canal homolog (mesmo
// backend, mesmo id Firefox), com MANYCHAT_CAPTURE_ENABLED efetivo = true,
// nome "[HML + ManyChat]" e identidade firefox|chrome-homolog-manychat.
//
// Uso: node app/extension/yolen-companion/scripts/verify-staged-build.mjs [firefox|chrome] [prod|dev|homolog|homolog-manychat]

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  BUILD_IDENTITY_JSON,
  BUILD_IDENTITY_PATHNAME,
  CHANNEL_HOSTS,
  COMPANION_ENVIRONMENT_PATHNAME,
  FIREFOX_HOMOLOG_GECKO_ID,
  HOMOLOG_BASE_URL_ENV,
  HOMOLOG_MANYCHAT_ENVIRONMENT,
  HOMOLOG_MANYCHAT_NAME,
  HOMOLOG_NAME,
  assertCompanionEnvironmentSourceIsSafe,
  companionEnvironmentFor,
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
  isHomologEnvironment,
  parseBuildIdentitySource,
  parseCompanionEnvironmentSource,
  parseHomologBaseUrl,
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

  if (entry === COMPANION_ENVIRONMENT_PATHNAME) {
    return `Configuração do canal no staging (${COMPANION_ENVIRONMENT_PATHNAME}) difere da que o canal ${environment} exige (backend/origens autorizadas).`
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

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

// Fatos do staging homolog lidos dos ARQUIVOS REAIS (não das funções de
// build): o que o navegador vai de fato carregar.
function inspectHomologStaging({ stagingDir, targetName, environment, baseUrl, identity }) {
  const manyChatVariant = environment === HOMOLOG_MANYCHAT_ENVIRONMENT
  const expectedManyChat = EXPECTED_MANYCHAT_CAPTURE_ENABLED_BY_ENVIRONMENT[environment]
  const problems = []
  const previewPattern = `${baseUrl}/*`
  const manifest = readJson(join(stagingDir, 'manifest.json'))
  const envPath = join(stagingDir, COMPANION_ENVIRONMENT_PATHNAME)
  const stagedEnvironment = existsSync(envPath)
    ? parseCompanionEnvironmentSource(readFileSync(envPath, 'utf8'))
    : null

  if (stagedEnvironment?.api_base_url && stagedEnvironment.api_base_url !== baseUrl) {
    problems.push(
      `Staging HML foi gerado para ${stagedEnvironment.api_base_url}, mas ${HOMOLOG_BASE_URL_ENV}=${baseUrl}. Rode o build homolog de novo.`,
    )
  }

  const bridge = manifest?.content_scripts?.find((block) => block.js?.includes('src/yolen-bridge.js'))
  const pageBridge = manifest?.web_accessible_resources?.find((block) =>
    block.resources?.includes('src/yolen-page-bridge.js'),
  )
  const hosts = [...(manifest?.host_permissions ?? [])].sort()
  const expectedHosts = [...CHANNEL_HOSTS, previewPattern].sort()

  const backgroundLoadsEnvironmentFirst =
    targetName === 'firefox'
      ? manifest?.background?.scripts?.[0] === COMPANION_ENVIRONMENT_PATHNAME
      : /importScripts\(\s*'companion-environment\.js'/.test(
          existsSync(join(stagingDir, 'src/background-service-worker.js'))
            ? readFileSync(join(stagingDir, 'src/background-service-worker.js'), 'utf8')
            : '',
        )

  const contentScriptsLoadEnvironment = (manifest?.content_scripts ?? [])
    .filter((block) => block.js?.includes('src/yolen-api.js') || block.js?.includes('src/yolen-bridge.js'))
    .every((block) => {
      const index = block.js.indexOf(COMPANION_ENVIRONMENT_PATHNAME)
      const consumer = Math.max(block.js.indexOf('src/yolen-api.js'), block.js.indexOf('src/yolen-bridge.js'))
      return index !== -1 && index < consumer
    })

  const flagPath = join(stagingDir, FEATURE_FLAGS_PATHNAME)
  let manyChatCaptureEnabled = null
  try {
    manyChatCaptureEnabled = parseManyChatCaptureEnabledFromSource(readFileSync(flagPath, 'utf8'))
  } catch {
    manyChatCaptureEnabled = null
  }

  const facts = {
    environment: stagedEnvironment?.channel ?? null,
    api_base_url: stagedEnvironment?.api_base_url ?? null,
    allowed_base_urls: stagedEnvironment?.allowed_base_urls ?? null,
    backend_match_required: stagedEnvironment?.backend_match_required ?? null,
    host_permissions: hosts,
    bridge_matches: bridge?.matches ?? null,
    page_bridge_matches: pageBridge?.matches ?? null,
    background_loads_environment_first: backgroundLoadsEnvironmentFirst,
    content_scripts_load_environment: contentScriptsLoadEnvironment,
    manychat_capture_enabled: manyChatCaptureEnabled,
    extension_name: manifest?.name ?? null,
    gecko_id: manifest?.browser_specific_settings?.gecko?.id ?? null,
    identity_environment: identity?.environment ?? null,
    identity_api_base_url: identity?.api_base_url ?? null,
  }

  const expectations = [
    [facts.environment === 'homolog', `Canal do staging é "${facts.environment}", esperado "homolog".`],
    [facts.api_base_url === baseUrl, `Backend do staging é ${facts.api_base_url}, esperado ${baseUrl}.`],
    [
      JSON.stringify(facts.allowed_base_urls) === JSON.stringify([baseUrl]),
      `Origens autorizadas do staging: ${JSON.stringify(facts.allowed_base_urls)}; homolog aceita só ${baseUrl}.`,
    ],
    [facts.backend_match_required === true, 'Staging homolog não exige conferência de commit com o backend.'],
    [
      JSON.stringify(hosts) === JSON.stringify(expectedHosts),
      `host_permissions do staging ${JSON.stringify(hosts)} != ${JSON.stringify(expectedHosts)}.`,
    ],
    [
      JSON.stringify(facts.bridge_matches) === JSON.stringify([previewPattern]),
      `Bridge da Yolen no staging casa ${JSON.stringify(facts.bridge_matches)}, esperado só ${previewPattern}.`,
    ],
    [
      JSON.stringify(facts.page_bridge_matches) === JSON.stringify([previewPattern]),
      `Page bridge no staging casa ${JSON.stringify(facts.page_bridge_matches)}, esperado só ${previewPattern}.`,
    ],
    [backgroundLoadsEnvironmentFirst, 'Background do staging não carrega a configuração do canal antes de tudo.'],
    [contentScriptsLoadEnvironment, 'Content scripts do staging não carregam a configuração do canal antes de yolen-api/bridge.'],
    [
      manyChatCaptureEnabled === expectedManyChat,
      `MANYCHAT_CAPTURE_ENABLED efetivo do staging ${environment} é ${manyChatCaptureEnabled}; esperado ${expectedManyChat}.`,
    ],
    [
      stagedEnvironment?.variant === (manyChatVariant ? 'manychat' : undefined),
      `Variante do canal no staging é ${JSON.stringify(stagedEnvironment?.variant)}, esperado ${manyChatVariant ? '"manychat"' : 'nenhuma'}.`,
    ],
    [
      facts.extension_name === (manyChatVariant ? HOMOLOG_MANYCHAT_NAME : HOMOLOG_NAME),
      `Nome da extensão no staging é ${JSON.stringify(facts.extension_name)}.`,
    ],
    [
      targetName !== 'firefox' || facts.gecko_id === FIREFOX_HOMOLOG_GECKO_ID,
      `Id Firefox do staging é ${facts.gecko_id}, esperado ${FIREFOX_HOMOLOG_GECKO_ID} (substitui a HML).`,
    ],
    [facts.identity_environment === `${targetName}-${environment}`, `Identidade do pacote é ${facts.identity_environment}.`],
    [facts.identity_api_base_url === baseUrl, `Identidade do pacote aponta ${facts.identity_api_base_url}.`],
  ]

  for (const [ok, message] of expectations) {
    if (!ok) {
      problems.push(message)
    }
  }

  return { problems, facts }
}

export function verifyStagedBuild({
  targetName = 'firefox',
  environment = 'prod',
  extensionRoot = EXTENSION_ROOT,
  repoRoot = REPO_ROOT,
  stagingDir = stagingDirFor(targetName, environment),
  homologBaseUrl = null,
} = {}) {
  if (!TARGETS[targetName]) {
    throw new Error(`Alvo desconhecido: ${targetName}`)
  }

  const problems = []

  // Canal homolog (e variante ManyChat): sem a MESMA origem do build não há
  // o que comparar.
  let baseUrl = null
  if (isHomologEnvironment(environment)) {
    try {
      baseUrl = parseHomologBaseUrl(homologBaseUrl)
    } catch (error) {
      return { fresh: false, stagingDir, identity: null, expectedIdentity: null, homolog: null, problems: [error.message] }
    }
  } else {
    // Ambiente desconhecido falha alto.
    companionEnvironmentFor(environment)
  }

  try {
    assertCompanionEnvironmentSourceIsSafe({ extensionRoot })
  } catch (error) {
    problems.push(error.message)
  }

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
        homologBaseUrl: baseUrl,
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
      homologBaseUrl: baseUrl,
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

  const homolog = isHomologEnvironment(environment)
    ? inspectHomologStaging({ stagingDir, targetName, environment, baseUrl, identity })
    : null

  if (homolog) {
    problems.unshift(...homolog.problems)
  }

  return {
    fresh: problems.length === 0,
    stagingDir,
    identity,
    expectedIdentity,
    homolog: homolog?.facts ?? null,
    problems,
  }
}

function main() {
  const [targetName = 'firefox', environment = 'prod'] = process.argv.slice(2)
  const result = verifyStagedBuild({
    targetName,
    environment,
    homologBaseUrl: isHomologEnvironment(environment) ? process.env[HOMOLOG_BASE_URL_ENV] : null,
  })

  const label = result.identity
    ? `v${result.identity.version} · commit ${result.identity.commit_short}${result.identity.dirty ? ' (+ alterações locais)' : ''} · build ${result.identity.build_id}`
    : 'sem identidade'

  console.log(`[${targetName}/${environment}] ${result.stagingDir}`)
  console.log(`  identidade: ${label}`)

  if (result.homolog) {
    const facts = result.homolog
    const commit = result.identity?.commit_short ?? '????????'
    console.log(`  canal: ${facts.environment} · backend configurado: ${facts.api_base_url}`)
    console.log(`  origens autorizadas: ${JSON.stringify(facts.allowed_base_urls)} · conferência de commit com o backend: ${facts.backend_match_required}`)
    console.log(`  host_permissions: ${JSON.stringify(facts.host_permissions)}`)
    console.log(`  bridge: ${JSON.stringify(facts.bridge_matches)} · page bridge: ${JSON.stringify(facts.page_bridge_matches)}`)
    console.log(`  background carrega a configuração primeiro: ${facts.background_loads_environment_first} · content scripts: ${facts.content_scripts_load_environment}`)
    console.log(`  MANYCHAT_CAPTURE_ENABLED: ${facts.manychat_capture_enabled} · extensão: ${facts.extension_name}${facts.gecko_id ? ` (${facts.gecko_id})` : ''}`)
    const headerLabel = environment === HOMOLOG_MANYCHAT_ENVIRONMENT ? 'HML + ManyChat' : 'HML'
    console.log(`  cabeçalho esperado: "${headerLabel} · v${result.identity?.version} · ${commit}" / "Backend · ${commit}" (backend no mesmo commit)`)
  }

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
