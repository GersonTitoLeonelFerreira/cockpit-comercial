// Variante HOMOLOG + ManyChat (`--homolog-manychat`): o MESMO pacote HML
// (mesmo backend de preview, mesmas validações, mesmo id Firefox), com a
// captura do ManyChat ligada. Um pacote só para WhatsApp e ManyChat.
//
//   1. Flag true SÓ nesta variante; a fonte normal continua false e dev,
//      prod, homolog e e2e não mudam.
//   2. Backend = o preview configurado (mesmas validações do homolog;
//      nunca produção), conferência de commit ligada, tráfego do ManyChat
//      só para o preview.
//   3. Saída própria (staging, zip, resumo) e verificador que entende a
//      variante — e nunca aceita um staging homolog como homolog-manychat
//      (nem o contrário).

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  CHANNEL_HOSTS,
  COMPANION_ENVIRONMENT_PATHNAME,
  EXPECTED_MANYCHAT_CAPTURE_ENABLED_BY_ENVIRONMENT,
  EXTENSION_ROOT,
  FEATURE_FLAGS_PATHNAME,
  FEATURE_FLAGS_SOURCE_DEFAULT,
  FEATURE_FLAGS_SOURCE_E2E,
  FIREFOX_E2E_GECKO_ID,
  FIREFOX_HOMOLOG_GECKO_ID,
  HOMOLOG_BASE_URL_ENV,
  HOMOLOG_MANYCHAT_ENVIRONMENT,
  HOMOLOG_MANYCHAT_NAME,
  HOMOLOG_NAME,
  PRODUCTION_BASE_URL,
  PRODUCTION_ORIGINS,
  assertFeatureFlagSourcesAreSafe,
  companionEnvironmentFor,
  featureFlagSourceForEnvironment,
  isHomologEnvironment,
  manifestForEnvironment,
  parseBuildCliArgs,
  parseCompanionEnvironmentSource,
  parseManyChatCaptureEnabledFromSource,
  readSourceManifest,
  renderCompanionEnvironmentSource,
  stageTarget,
  stagingDirFor,
  zipFileName,
} from '../scripts/build-package.mjs'
import { verifyStagedBuild } from '../scripts/verify-staged-build.mjs'
import {
  createFakeFetchQueue,
  jsonResponse,
  loadBackgroundScript,
} from './e2-test-support/load-background-script.mjs'

const PREVIEW = 'https://cockpit-comercial-vocn-git-claude-companion-full-reading-yolen.vercel.app'
const OTHER_PREVIEW = 'https://cockpit-comercial-vocn-git-outra-branch-abc123-yolen.vercel.app'
const PREVIEW_IDENTITY = { environment: 'preview', commit: 'a'.repeat(40), commit_short: 'aaaaaaaa' }
const SESSION_KEY = 'yolen_companion_session'
const MANYCHAT = HOMOLOG_MANYCHAT_ENVIRONMENT
const BUILD_SCRIPT = fileURLToPath(new URL('../scripts/build-package.mjs', import.meta.url))
const VERIFY_SCRIPT = fileURLToPath(new URL('../scripts/verify-staged-build.mjs', import.meta.url))
const PACKAGE_JSON = JSON.parse(readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8'))

const sourceManifest = readSourceManifest()

function session(origin) {
  return {
    ok: true,
    statusCode: 200,
    origin,
    capturedAt: new Date().toISOString(),
    payload: {
      ok: true,
      companion_token: 'fake.token.value',
      expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      user: { id: 'user-1', full_name: 'Vendedor Teste' },
      active_company: { id: 'company-1', name: 'Empresa Teste' },
    },
  }
}

function runCli(script, args, envOverrides) {
  const env = { ...process.env, ...envOverrides }
  for (const [key, value] of Object.entries(envOverrides)) {
    if (value === undefined) delete env[key]
  }
  return spawnSync(process.execPath, [script, ...args], { env, encoding: 'utf8' })
}

function isolatedCopy() {
  const root = mkdtempSync(join(tmpdir(), 'yolen-homolog-manychat-'))
  const extensionRoot = join(root, 'extension')

  cpSync(EXTENSION_ROOT, extensionRoot, {
    recursive: true,
    filter: (source) => !/[\\/](tests|node_modules)([\\/]|$)/.test(source.slice(EXTENSION_ROOT.length)),
  })

  return {
    root,
    extensionRoot,
    stagingDir: (environment) => join(root, 'dist', 'firefox', environment, 'staging'),
  }
}

function build(copy, environment, homologBaseUrl = PREVIEW) {
  return stageTarget({
    targetName: 'firefox',
    environment,
    sourceManifest: readSourceManifest(copy.extensionRoot),
    extensionRoot: copy.extensionRoot,
    repoRoot: copy.root,
    stagingDir: copy.stagingDir(environment),
    homologBaseUrl,
  })
}

function verify(copy, { environment, stagingEnvironment = environment, homologBaseUrl = PREVIEW }) {
  return verifyStagedBuild({
    targetName: 'firefox',
    environment,
    extensionRoot: copy.extensionRoot,
    repoRoot: copy.root,
    stagingDir: copy.stagingDir(stagingEnvironment),
    homologBaseUrl,
  })
}

// ---------------------------------------------------------------------------
// 1. Flag true só nesta variante
// ---------------------------------------------------------------------------

test('flag do ManyChat: true só em homolog-manychat (e e2e); dev, prod e homolog continuam false', () => {
  assert.equal(featureFlagSourceForEnvironment(MANYCHAT), FEATURE_FLAGS_SOURCE_E2E)
  assert.equal(featureFlagSourceForEnvironment('homolog'), FEATURE_FLAGS_SOURCE_DEFAULT)
  assert.equal(featureFlagSourceForEnvironment('prod'), FEATURE_FLAGS_SOURCE_DEFAULT)
  assert.equal(featureFlagSourceForEnvironment('dev'), FEATURE_FLAGS_SOURCE_DEFAULT)
  assert.equal(featureFlagSourceForEnvironment('e2e'), FEATURE_FLAGS_SOURCE_E2E)

  assert.deepEqual(EXPECTED_MANYCHAT_CAPTURE_ENABLED_BY_ENVIRONMENT, {
    dev: false,
    prod: false,
    homolog: false,
    e2e: true,
    [MANYCHAT]: true,
  })

  // A fonte normal nunca é editada: continua false, e a guarda de fonte passa.
  const normal = readFileSync(join(EXTENSION_ROOT, FEATURE_FLAGS_SOURCE_DEFAULT), 'utf8')
  assert.equal(parseManyChatCaptureEnabledFromSource(normal), false)
  assert.doesNotThrow(() => assertFeatureFlagSourcesAreSafe())
})

test('staging homolog-manychat empacota a flag true (valor efetivo relido do pacote); homolog continua false', () => {
  const copy = isolatedCopy()

  try {
    const manyChat = build(copy, MANYCHAT)
    const homolog = build(copy, 'homolog')

    assert.equal(manyChat.effectiveManyChatCaptureEnabled, true)
    assert.equal(homolog.effectiveManyChatCaptureEnabled, false)

    // Mesmo pathname que o manifest carrega, com o conteúdo da fonte e2e.
    assert.deepEqual(
      readFileSync(join(copy.stagingDir(MANYCHAT), FEATURE_FLAGS_PATHNAME)),
      readFileSync(join(copy.extensionRoot, FEATURE_FLAGS_SOURCE_E2E)),
    )
    assert.deepEqual(
      readFileSync(join(copy.stagingDir('homolog'), FEATURE_FLAGS_PATHNAME)),
      readFileSync(join(copy.extensionRoot, FEATURE_FLAGS_SOURCE_DEFAULT)),
    )
  } finally {
    rmSync(copy.root, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// 2. Backend = preview, mesmas validações do homolog
// ---------------------------------------------------------------------------

test('backend: mesmo canal homolog apontando só para o preview, com conferência de commit', () => {
  assert.equal(isHomologEnvironment(MANYCHAT), true)
  assert.equal(isHomologEnvironment('homolog'), true)
  assert.equal(isHomologEnvironment('prod'), false)

  assert.deepEqual(companionEnvironmentFor(MANYCHAT, { homologBaseUrl: PREVIEW }), {
    channel: 'homolog',
    api_base_url: PREVIEW,
    allowed_base_urls: [PREVIEW],
    backend_match_required: true,
    variant: 'manychat',
  })

  // Mesmas validações do homolog: sem URL, HTTP, caminho, wildcard ou produção falham.
  for (const invalid of [undefined, '', 'http://example.vercel.app', `${PREVIEW}/api`, 'https://*.vercel.app', ...PRODUCTION_ORIGINS]) {
    assert.throws(() => companionEnvironmentFor(MANYCHAT, { homologBaseUrl: invalid }), new RegExp(HOMOLOG_BASE_URL_ENV))
    assert.throws(() => manifestForEnvironment(sourceManifest, 'firefox', MANYCHAT, { homologBaseUrl: invalid }))
  }
})

test('manifest homolog-manychat: host exato do preview, hosts do ManyChat, mesmo id Firefox da HML e nome explícito', () => {
  const manifest = manifestForEnvironment(sourceManifest, 'firefox', MANYCHAT, { homologBaseUrl: PREVIEW })
  const homolog = manifestForEnvironment(sourceManifest, 'firefox', 'homolog', { homologBaseUrl: PREVIEW })

  assert.equal(manifest.name, HOMOLOG_MANYCHAT_NAME)
  assert.match(manifest.name, /ManyChat/)
  assert.match(manifest.description, /ManyChat ligada/)
  assert.equal(manifest.browser_specific_settings.gecko.id, FIREFOX_HOMOLOG_GECKO_ID)
  assert.notEqual(manifest.browser_specific_settings.gecko.id, FIREFOX_E2E_GECKO_ID)
  assert.deepEqual([...manifest.host_permissions].sort(), [...CHANNEL_HOSTS, `${PREVIEW}/*`].sort())
  assert.equal(PRODUCTION_ORIGINS.some((origin) => JSON.stringify(manifest).includes(origin)), false)
  assert.equal(/localhost/.test(JSON.stringify(manifest)), false)

  // Só nome e descrição diferem do manifest HML: mesmos scripts do ManyChat,
  // mesmas permissões, mesma bridge.
  assert.deepEqual(
    { ...manifest, name: null, description: null },
    { ...homolog, name: null, description: null },
  )
  assert.ok(manifest.content_scripts.some((block) => block.matches.includes('https://app.manychat.com/*') && block.js.includes('src/manychat-content-script.js')))
})

test('tráfego do ManyChat (busca e vínculo de lead, captura) vai só ao preview, e só depois de o backend se declarar preview', async () => {
  const { fetchFn, calls } = createFakeFetchQueue([
    () => jsonResponse(200, PREVIEW_IDENTITY),
    () => jsonResponse(200, { ok: true, data: { leads: [] } }),
    () => jsonResponse(200, { ok: true }),
  ])
  const bg = loadBackgroundScript({
    fetchFn,
    environmentSource: renderCompanionEnvironmentSource(companionEnvironmentFor(MANYCHAT, { homologBaseUrl: PREVIEW })),
    initialStorage: { [SESSION_KEY]: session(PREVIEW) },
  })

  await bg.sendMessage({ source: 'YOLEN_COMPANION', action: 'SEARCH_LINKABLE_LEADS', baseUrl: PREVIEW, payload: { query: 'Maria' } })
  // Mesmo que o content script peça produção, a variante não sai do preview.
  await bg.sendMessage({
    source: 'YOLEN_COMPANION',
    action: 'FIRST_LINK_EXTERNAL_IDENTITY',
    baseUrl: PRODUCTION_BASE_URL,
    payload: { platform: 'manychat', platform_contact_key: `manychat:contact:v1:sha256:${'c'.repeat(64)}`, lead_id: 'lead-1' },
  })

  assert.deepEqual(calls.map((call) => call.url), [
    `${PREVIEW}/api/companion/build-identity`,
    `${PREVIEW}/api/companion/link-lead/search`,
    `${PREVIEW}/api/companion/link-lead`,
  ])
  assert.equal(calls[0].init.headers, undefined, 'conferência de ambiente sem token')
  assert.equal(calls[1].init.headers.Authorization, 'Bearer fake.token.value')

  // Backend que se declara produção nunca recebe token.
  const refusal = createFakeFetchQueue([
    () => jsonResponse(200, { environment: 'production', commit: 'b'.repeat(40), commit_short: 'bbbbbbbb' }),
  ])
  const refusing = loadBackgroundScript({
    fetchFn: refusal.fetchFn,
    environmentSource: renderCompanionEnvironmentSource(companionEnvironmentFor(MANYCHAT, { homologBaseUrl: PREVIEW })),
    initialStorage: { [SESSION_KEY]: session(PREVIEW) },
  })
  const refused = await refusing.sendMessage({ source: 'YOLEN_COMPANION', action: 'SEARCH_LINKABLE_LEADS', baseUrl: PREVIEW, payload: { query: 'Maria' } })
  assert.equal(refused.payload.status, 'HOMOLOG_BACKEND_NOT_PREVIEW')
  assert.ok(refusal.calls.every((call) => call.init.headers === undefined))
})

// ---------------------------------------------------------------------------
// 3. Saída própria e verificador
// ---------------------------------------------------------------------------

test('saída própria: staging, zip e identidade separados de homolog, prod e e2e', () => {
  const manyChatStaging = stagingDirFor('firefox', MANYCHAT)

  assert.equal(manyChatStaging.endsWith(join('dist', 'yolen-companion', 'firefox', 'homolog-manychat', 'staging')), true)
  for (const other of ['homolog', 'prod', 'dev', 'e2e']) {
    assert.notEqual(manyChatStaging, stagingDirFor('firefox', other))
  }

  assert.equal(zipFileName('firefox', MANYCHAT, '1.5.2'), 'yolen-companion-firefox-homolog-manychat-v1.5.2.zip')
  assert.equal(zipFileName('firefox', 'homolog', '1.5.2'), 'yolen-companion-firefox-homolog-v1.5.2.zip')

  const copy = isolatedCopy()
  try {
    const built = build(copy, MANYCHAT)
    assert.equal(built.buildIdentity.environment, 'firefox-homolog-manychat')
    assert.equal(built.buildIdentity.api_base_url, PREVIEW)
    assert.deepEqual(
      parseCompanionEnvironmentSource(readFileSync(join(copy.stagingDir(MANYCHAT), COMPANION_ENVIRONMENT_PATHNAME), 'utf8')),
      companionEnvironmentFor(MANYCHAT, { homologBaseUrl: PREVIEW }),
    )
  } finally {
    rmSync(copy.root, { recursive: true, force: true })
  }
})

test('verificador: ATUAL para homolog-manychat; nunca aceita staging homolog como a variante (nem o contrário), outro preview ou flag adulterada', () => {
  const copy = isolatedCopy()

  try {
    build(copy, MANYCHAT)
    build(copy, 'homolog')

    const fresh = verify(copy, { environment: MANYCHAT })
    assert.deepEqual(fresh.problems, [])
    assert.equal(fresh.fresh, true)
    assert.equal(fresh.homolog.environment, 'homolog')
    assert.equal(fresh.homolog.api_base_url, PREVIEW)
    assert.equal(fresh.homolog.backend_match_required, true)
    assert.equal(fresh.homolog.manychat_capture_enabled, true)
    assert.equal(fresh.homolog.extension_name, HOMOLOG_MANYCHAT_NAME)
    assert.equal(fresh.homolog.gecko_id, FIREFOX_HOMOLOG_GECKO_ID)
    assert.equal(fresh.homolog.identity_environment, 'firefox-homolog-manychat')

    // O homolog normal continua ATUAL e com a flag false.
    const homolog = verify(copy, { environment: 'homolog' })
    assert.deepEqual(homolog.problems, [])
    assert.equal(homolog.homolog.manychat_capture_enabled, false)
    assert.equal(homolog.homolog.extension_name, HOMOLOG_NAME)

    // Staging homolog verificado como a variante (e vice-versa): DESATUALIZADO.
    const homologAsManyChat = verify(copy, { environment: MANYCHAT, stagingEnvironment: 'homolog' })
    assert.equal(homologAsManyChat.fresh, false)
    assert.ok(homologAsManyChat.problems.some((problem) => /MANYCHAT_CAPTURE_ENABLED efetivo/.test(problem)))
    const manyChatAsHomolog = verify(copy, { environment: 'homolog', stagingEnvironment: MANYCHAT })
    assert.equal(manyChatAsHomolog.fresh, false)
    assert.ok(manyChatAsHomolog.problems.some((problem) => /MANYCHAT_CAPTURE_ENABLED efetivo/.test(problem)))

    // Sem a URL ou com outro preview: DESATUALIZADO.
    assert.match(verify(copy, { environment: MANYCHAT, homologBaseUrl: null }).problems.join(' | '), /ausente/)
    assert.equal(verify(copy, { environment: MANYCHAT, homologBaseUrl: OTHER_PREVIEW }).fresh, false)

    // Flag adulterada dentro do staging: DESATUALIZADO.
    const flagPath = join(copy.stagingDir(MANYCHAT), FEATURE_FLAGS_PATHNAME)
    const original = readFileSync(flagPath, 'utf8')
    writeFileSync(flagPath, original.replace('const MANYCHAT_CAPTURE_ENABLED = true', 'const MANYCHAT_CAPTURE_ENABLED = false'))
    const tampered = verify(copy, { environment: MANYCHAT })
    assert.equal(tampered.fresh, false)
    assert.ok(tampered.problems.some((problem) => /MANYCHAT_CAPTURE_ENABLED efetivo/.test(problem)))
    writeFileSync(flagPath, original)
    assert.equal(verify(copy, { environment: MANYCHAT }).fresh, true)
  } finally {
    rmSync(copy.root, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// Linha de comando e builds padrão inalterados
// ---------------------------------------------------------------------------

test('linha de comando: --homolog-manychat é explícito; sem argumento, --homolog e --e2e não mudam', () => {
  assert.deepEqual(parseBuildCliArgs(['node', 'build']), { e2e: false, homolog: false, homologManyChat: false })
  assert.deepEqual(parseBuildCliArgs(['node', 'build', '--homolog']), { e2e: false, homolog: true, homologManyChat: false })
  assert.deepEqual(parseBuildCliArgs(['node', 'build', '--e2e']), { e2e: true, homolog: false, homologManyChat: false })
  assert.deepEqual(parseBuildCliArgs(['node', 'build', '--homolog-manychat']), { e2e: false, homolog: false, homologManyChat: true })
  assert.throws(() => parseBuildCliArgs(['node', 'build', '--homolog', '--homolog-manychat']), /desconhecido/)
  assert.throws(() => parseBuildCliArgs(['node', 'build', '--manychat']), /desconhecido/)

  // Build e verificador sem a URL (ou com produção) falham antes de gerar qualquer coisa.
  const noUrl = runCli(BUILD_SCRIPT, ['--homolog-manychat'], { [HOMOLOG_BASE_URL_ENV]: undefined })
  assert.notEqual(noUrl.status, 0)
  assert.match(noUrl.stderr, /ausente/)
  const production = runCli(BUILD_SCRIPT, ['--homolog-manychat'], { [HOMOLOG_BASE_URL_ENV]: PRODUCTION_BASE_URL })
  assert.notEqual(production.status, 0)
  assert.match(production.stderr, /produção/)
  const verifyNoUrl = runCli(VERIFY_SCRIPT, ['firefox', MANYCHAT], { [HOMOLOG_BASE_URL_ENV]: undefined })
  assert.notEqual(verifyNoUrl.status, 0)

  assert.equal(
    PACKAGE_JSON.scripts['build:companion-extension:homolog-manychat'],
    'node app/extension/yolen-companion/scripts/build-package.mjs --homolog-manychat',
  )
  assert.equal(
    PACKAGE_JSON.scripts['verify:companion-firefox-homolog-manychat'],
    'node app/extension/yolen-companion/scripts/verify-staged-build.mjs firefox homolog-manychat',
  )
  assert.equal(PACKAGE_JSON.scripts['build:companion-extension'], 'node app/extension/yolen-companion/scripts/build-package.mjs')
  assert.equal(PACKAGE_JSON.scripts['build:companion-extension:homolog'], 'node app/extension/yolen-companion/scripts/build-package.mjs --homolog')
})

test('builds padrão inalterados: dev e prod sem ManyChat e sem variante; homolog sem variante; e2e com o próprio id', () => {
  assert.deepEqual(companionEnvironmentFor('homolog', { homologBaseUrl: PREVIEW }), {
    channel: 'homolog',
    api_base_url: PREVIEW,
    allowed_base_urls: [PREVIEW],
    backend_match_required: true,
  })
  assert.equal(companionEnvironmentFor('prod').variant, undefined)
  assert.equal(companionEnvironmentFor('dev').variant, undefined)
  assert.equal(companionEnvironmentFor('e2e').variant, undefined)

  assert.equal(manifestForEnvironment(sourceManifest, 'firefox', 'homolog', { homologBaseUrl: PREVIEW }).name, HOMOLOG_NAME)
  assert.equal(manifestForEnvironment(sourceManifest, 'firefox', 'e2e').browser_specific_settings.gecko.id, FIREFOX_E2E_GECKO_ID)
  assert.equal(manifestForEnvironment(sourceManifest, 'firefox', 'prod').name, sourceManifest.name)

  const copy = isolatedCopy()
  try {
    for (const environment of ['dev', 'prod']) {
      const built = stageTarget({
        targetName: 'firefox',
        environment,
        sourceManifest: readSourceManifest(copy.extensionRoot),
        extensionRoot: copy.extensionRoot,
        repoRoot: copy.root,
        stagingDir: copy.stagingDir(environment),
      })
      assert.equal(built.effectiveManyChatCaptureEnabled, false, `${environment} nunca liga o ManyChat`)
      assert.equal(built.companionEnvironment.api_base_url, PRODUCTION_BASE_URL)
    }
  } finally {
    rmSync(copy.root, { recursive: true, force: true })
  }
})
