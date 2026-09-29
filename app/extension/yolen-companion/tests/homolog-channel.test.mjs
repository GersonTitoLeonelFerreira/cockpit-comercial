// Canal HOMOLOG: extensão e backend do MESMO HEAD, sem editar a fonte.
//
// Cobre os cenários A–H e K da homologação (I/J — conferência de commit no
// cabeçalho — ficam em e3-dom/homolog-build-match-header.test.mjs, com a
// composição real do painel):
//   A. PROD aponta só para produção.
//   B. HML aponta só para o backend configurado.
//   C. HML sem URL falha.
//   D. HML com HTTP ou URL inválida falha.
//   E. Manifest HML tem o host EXATO do preview.
//   F. PROD não aceita o preview.
//   G. Bridge HML reconhece o preview.
//   H. Sessão HML nunca cai silenciosamente para produção.
//   K. Verificador acusa staging HML desatualizado / de outro preview.

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

import { JSDOM } from 'jsdom'

import {
  CHANNEL_HOSTS,
  COMPANION_ENVIRONMENT_PATHNAME,
  EXTENSION_ROOT,
  FIREFOX_HOMOLOG_GECKO_ID,
  HOMOLOG_BASE_URL_ENV,
  PRODUCTION_BASE_URL,
  assertCompanionEnvironmentSourceIsSafe,
  companionEnvironmentFor,
  expectedStagedEntryContent,
  manifestForEnvironment,
  parseCompanionEnvironmentSource,
  parseHomologBaseUrl,
  readSourceManifest,
  renderCompanionEnvironmentSource,
  stageTarget,
  stagingDirFor,
  toProductionManifest,
} from '../scripts/build-package.mjs'
import { verifyStagedBuild } from '../scripts/verify-staged-build.mjs'
import {
  createFakeFetchQueue,
  jsonResponse,
  loadBackgroundScript,
} from './e2-test-support/load-background-script.mjs'

const PREVIEW = 'https://cockpit-comercial-vocn-git-claude-companion-sales-51296a-yolen.vercel.app'
const OTHER_PREVIEW = 'https://cockpit-comercial-vocn-git-outra-branch-abc123-yolen.vercel.app'
const LOCALHOST = 'http://localhost:3000'
const PREVIEW_IDENTITY = { environment: 'preview', commit: 'a'.repeat(40), commit_short: 'aaaaaaaa' }
const SESSION_KEY = 'yolen_companion_session'
const SRC = (file) => readFileSync(join(EXTENSION_ROOT, 'src', file), 'utf8')
const BUILD_SCRIPT = fileURLToPath(new URL('../scripts/build-package.mjs', import.meta.url))
const VERIFY_SCRIPT = fileURLToPath(new URL('../scripts/verify-staged-build.mjs', import.meta.url))

const sourceManifest = readSourceManifest()

const environmentSource = (environment, homologBaseUrl = null) =>
  renderCompanionEnvironmentSource(companionEnvironmentFor(environment, { homologBaseUrl }))

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

function yolenHostPatterns(manifest) {
  return [
    ...(manifest.host_permissions ?? []),
    ...(manifest.content_scripts ?? []).flatMap((block) => block.matches ?? []),
    ...(manifest.web_accessible_resources ?? []).flatMap((block) => block.matches ?? []),
  ].filter((pattern) => !CHANNEL_HOSTS.includes(pattern))
}

function bridgeMatches(manifest) {
  return manifest.content_scripts.find((block) => block.js.includes('src/yolen-bridge.js')).matches
}

function pageBridgeMatches(manifest) {
  return manifest.web_accessible_resources.find((block) => block.resources.includes('src/yolen-page-bridge.js'))
    .matches
}

function runCli(script, args, envOverrides) {
  const env = { ...process.env, ...envOverrides }
  for (const [key, value] of Object.entries(envOverrides)) {
    if (value === undefined) delete env[key]
  }
  return spawnSync(process.execPath, [script, ...args], { env, encoding: 'utf8' })
}

function isolatedCopy() {
  const root = mkdtempSync(join(tmpdir(), 'yolen-homolog-'))
  const extensionRoot = join(root, 'extension')

  cpSync(EXTENSION_ROOT, extensionRoot, {
    recursive: true,
    filter: (source) => !/[\\/](tests|node_modules)([\\/]|$)/.test(source.slice(EXTENSION_ROOT.length)),
  })

  return {
    root,
    extensionRoot,
    stagingDir: join(root, 'dist', 'firefox', 'homolog', 'staging'),
  }
}

function buildHomolog(copy, homologBaseUrl) {
  return stageTarget({
    targetName: 'firefox',
    environment: 'homolog',
    sourceManifest: readSourceManifest(copy.extensionRoot),
    extensionRoot: copy.extensionRoot,
    repoRoot: copy.root,
    stagingDir: copy.stagingDir,
    homologBaseUrl,
  })
}

function verifyHomolog(copy, homologBaseUrl) {
  return verifyStagedBuild({
    targetName: 'firefox',
    environment: 'homolog',
    extensionRoot: copy.extensionRoot,
    repoRoot: copy.root,
    stagingDir: copy.stagingDir,
    homologBaseUrl,
  })
}

// ---------------------------------------------------------------------------
// Configuração canônica e fonte segura
// ---------------------------------------------------------------------------

test('fonte versionada da configuração do canal é o canal dev (produção + localhost), nunca um preview', () => {
  assert.doesNotThrow(() => assertCompanionEnvironmentSourceIsSafe())
  assert.deepEqual(parseCompanionEnvironmentSource(SRC('companion-environment.js')), {
    channel: 'dev',
    api_base_url: PRODUCTION_BASE_URL,
    allowed_base_urls: [PRODUCTION_BASE_URL, LOCALHOST],
    backend_match_required: false,
  })

  for (const file of ['background.js', 'yolen-api.js', 'yolen-bridge.js', 'yolen-page-bridge.js', 'companion-core.js']) {
    assert.doesNotMatch(SRC(file), /cockpit-comercial-vocn-git-/, `${file} não pode fixar host de preview`)
  }
  assert.doesNotMatch(SRC('yolen-bridge.js'), /cockpit-comercial-vocn\.vercel\.app/)
  assert.doesNotMatch(SRC('yolen-page-bridge.js'), /cockpit-comercial-vocn\.vercel\.app/)
})

test('fonte editada à mão para apontar um preview derruba o build e o verificador', () => {
  const copy = isolatedCopy()

  try {
    const path = join(copy.extensionRoot, COMPANION_ENVIRONMENT_PATHNAME)
    writeFileSync(path, readFileSync(path, 'utf8').replace(`"api_base_url": "${PRODUCTION_BASE_URL}"`, `"api_base_url": "${PREVIEW}"`))

    assert.throws(() => assertCompanionEnvironmentSourceIsSafe({ extensionRoot: copy.extensionRoot }), /editado à mão/)
  } finally {
    rmSync(copy.root, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// A. PROD aponta só para produção
// ---------------------------------------------------------------------------

test('A) PROD: configuração, manifest e background apontam só para produção', async () => {
  assert.deepEqual(companionEnvironmentFor('prod'), {
    channel: 'prod',
    api_base_url: PRODUCTION_BASE_URL,
    allowed_base_urls: [PRODUCTION_BASE_URL],
    backend_match_required: false,
  })

  for (const targetName of ['firefox', 'chrome']) {
    const staged = parseCompanionEnvironmentSource(
      expectedStagedEntryContent({ entry: COMPANION_ENVIRONMENT_PATHNAME, targetName, environment: 'prod', sourceManifest }).toString('utf8'),
    )
    assert.deepEqual(staged.allowed_base_urls, [PRODUCTION_BASE_URL])

    const manifest = toProductionManifest(sourceManifest, targetName)
    assert.deepEqual([...new Set(yolenHostPatterns(manifest))], [`${PRODUCTION_BASE_URL}/*`])
    assert.deepEqual(bridgeMatches(manifest), [`${PRODUCTION_BASE_URL}/*`])
    assert.deepEqual(pageBridgeMatches(manifest), [`${PRODUCTION_BASE_URL}/*`])
  }

  // Sessão com origem localhost num pacote PROD: tráfego vai para produção.
  const { fetchFn, calls } = createFakeFetchQueue([() => jsonResponse(200, { ok: true })])
  const bg = loadBackgroundScript({
    fetchFn,
    environmentSource: environmentSource('prod'),
    initialStorage: { [SESSION_KEY]: session(LOCALHOST) },
  })

  await bg.sendMessage({ source: 'YOLEN_COMPANION', action: 'RESOLVE_LEAD', baseUrl: LOCALHOST, payload: { phone: '5511999990000' } })
  assert.equal(calls[0].url, `${PRODUCTION_BASE_URL}/api/companion/resolve-lead`)

  const bridge = await bg.sendMessage({ source: 'YOLEN_COMPANION_BRIDGE', action: 'SESSION_UPDATE', session: session(LOCALHOST) }, { url: `${LOCALHOST}/` })
  assert.equal(bridge.payload.status, 'SESSION_IGNORED_ORIGIN')
})

// ---------------------------------------------------------------------------
// B. HML aponta só para o backend configurado
// ---------------------------------------------------------------------------

test('B) HML: configuração canônica e tráfego autenticado vão só para o preview configurado', async () => {
  assert.deepEqual(companionEnvironmentFor('homolog', { homologBaseUrl: PREVIEW }), {
    channel: 'homolog',
    api_base_url: PREVIEW,
    allowed_base_urls: [PREVIEW],
    backend_match_required: true,
  })

  const { fetchFn, calls } = createFakeFetchQueue([
    () => jsonResponse(200, PREVIEW_IDENTITY),
    () => jsonResponse(200, { ok: true }),
    () => jsonResponse(200, { ok: true, data: { identity: {}, summary: null } }),
  ])
  const bg = loadBackgroundScript({
    fetchFn,
    environmentSource: environmentSource('homolog', PREVIEW),
    initialStorage: { [SESSION_KEY]: session(PREVIEW) },
  })

  await bg.sendMessage({ source: 'YOLEN_COMPANION', action: 'RESOLVE_LEAD', baseUrl: PREVIEW, payload: { phone: '5511999990000' } })
  // Mesmo que o content script peça produção, o canal HML não sai do preview.
  await bg.sendMessage({ source: 'YOLEN_COMPANION', action: 'LOAD_LEAD_SUMMARY', baseUrl: PRODUCTION_BASE_URL, payload: { cycle_id: 'c1' } })

  // Primeiro o backend se declara preview (sem token); só então o token sai.
  assert.deepEqual(calls.map((call) => call.url), [
    `${PREVIEW}/api/companion/build-identity`,
    `${PREVIEW}/api/companion/resolve-lead`,
    `${PREVIEW}/api/companion/lead-summary`,
  ])
  assert.equal(calls[0].init.headers, undefined)
  assert.equal(calls[1].init.headers.Authorization, 'Bearer fake.token.value')
})

// ---------------------------------------------------------------------------
// C/D. Build HML sem URL, com HTTP ou URL inválida falha
// ---------------------------------------------------------------------------

test('C) HML sem URL do backend falha — função, staging e linha de comando', () => {
  for (const value of [undefined, null, '', '   ']) {
    assert.throws(() => parseHomologBaseUrl(value), /YOLEN_COMPANION_HOMOLOG_BASE_URL ausente/)
  }

  const copy = isolatedCopy()
  try {
    assert.throws(() => buildHomolog(copy, undefined), /ausente/)
    assert.equal(existsSync(copy.stagingDir), false, 'nenhum staging pode ser escrito sem a URL')
  } finally {
    rmSync(copy.root, { recursive: true, force: true })
  }

  const cli = runCli(BUILD_SCRIPT, ['--homolog'], { [HOMOLOG_BASE_URL_ENV]: undefined })
  assert.notEqual(cli.status, 0)
  assert.match(cli.stderr, /YOLEN_COMPANION_HOMOLOG_BASE_URL ausente/)

  const verify = runCli(VERIFY_SCRIPT, ['firefox', 'homolog'], { [HOMOLOG_BASE_URL_ENV]: undefined })
  assert.notEqual(verify.status, 0)
  assert.match(verify.stdout, /DESATUALIZADO[\s\S]*ausente/)
})

test('D) HML com HTTP, URL inválida, caminho, porta, wildcard ou produção falha', () => {
  const invalid = [
    ['http://cockpit-comercial-vocn-git-x-yolen.vercel.app', /HTTPS/],
    ['not a url', /não é uma URL/],
    ['cockpit-comercial-vocn-git-x-yolen.vercel.app', /não é uma URL/],
    [`${PREVIEW}/cockpit`, /origem exata/],
    [`${PREVIEW}?x=1`, /origem exata/],
    [`${PREVIEW}#frag`, /origem exata/],
    ['https://cockpit-comercial-vocn-git-x-yolen.vercel.app:8443', /origem exata/],
    ['https://user:secret@cockpit-comercial-vocn-git-x-yolen.vercel.app', /origem exata/],
    ['https://*.vercel.app', /wildcard/],
    [PRODUCTION_BASE_URL, /produção/],
    // Aliases de produção do mesmo projeto Vercel.
    ['https://cockpit-comercial-vocn-yolen.vercel.app', /produção/],
    ['https://cockpit-comercial-vocn-git-main-yolen.vercel.app/', /produção/],
  ]

  for (const [value, expected] of invalid) {
    assert.throws(() => parseHomologBaseUrl(value), expected, value)
    assert.throws(() => manifestForEnvironment(sourceManifest, 'firefox', 'homolog', { homologBaseUrl: value }), expected, value)
  }

  // Barra final é aceita e normalizada para a origem.
  assert.equal(parseHomologBaseUrl(`${PREVIEW}/`), PREVIEW)

  const cli = runCli(BUILD_SCRIPT, ['--homolog'], { [HOMOLOG_BASE_URL_ENV]: 'http://cockpit-comercial-vocn-git-x-yolen.vercel.app' })
  assert.notEqual(cli.status, 0)
  assert.match(cli.stderr, /precisa ser HTTPS/)
})

// ---------------------------------------------------------------------------
// E. Manifest HML com o host exato do preview
// ---------------------------------------------------------------------------

test('E) manifest HML: só o host EXATO do preview (permissão, bridge, page bridge), sem produção/localhost/wildcard', () => {
  for (const targetName of ['firefox', 'chrome']) {
    const manifest = manifestForEnvironment(sourceManifest, targetName, 'homolog', { homologBaseUrl: PREVIEW })

    assert.deepEqual([...manifest.host_permissions].sort(), [...CHANNEL_HOSTS, `${PREVIEW}/*`].sort())
    assert.deepEqual([...new Set(yolenHostPatterns(manifest))], [`${PREVIEW}/*`])
    assert.deepEqual(bridgeMatches(manifest), [`${PREVIEW}/*`])
    assert.deepEqual(pageBridgeMatches(manifest), [`${PREVIEW}/*`])

    const serialized = JSON.stringify(manifest)
    assert.equal(serialized.includes(PRODUCTION_BASE_URL), false)
    assert.doesNotMatch(serialized, /localhost|\*\.vercel\.app|\*\./)
    assert.equal(manifest.name, 'Yolen Companion [HML]')
    assert.equal(manifest.version, sourceManifest.version)

    const environmentFirst =
      targetName === 'firefox' ? manifest.background.scripts[0] : null
    if (targetName === 'firefox') {
      assert.equal(environmentFirst, COMPANION_ENVIRONMENT_PATHNAME)
      assert.equal(manifest.browser_specific_settings.gecko.id, FIREFOX_HOMOLOG_GECKO_ID)
    } else {
      assert.equal(manifest.browser_specific_settings, undefined)
    }

    for (const block of manifest.content_scripts.filter((entry) => entry.js.includes('src/yolen-api.js') || entry.js.includes('src/yolen-bridge.js'))) {
      assert.ok(block.js.indexOf(COMPANION_ENVIRONMENT_PATHNAME) !== -1, 'bloco sem a configuração do canal')
    }
  }

  // Outro preview → outro manifest (nunca um host genérico).
  const other = manifestForEnvironment(sourceManifest, 'firefox', 'homolog', { homologBaseUrl: OTHER_PREVIEW })
  assert.deepEqual(bridgeMatches(other), [`${OTHER_PREVIEW}/*`])
  assert.equal(JSON.stringify(other).includes(PREVIEW), false)
})

// ---------------------------------------------------------------------------
// F. PROD não aceita o preview
// ---------------------------------------------------------------------------

test('F) PROD não aceita o preview: manifest, configuração, sessão da ponte e sessão em cache', async () => {
  for (const targetName of ['firefox', 'chrome']) {
    assert.equal(JSON.stringify(toProductionManifest(sourceManifest, targetName)).includes('cockpit-comercial-vocn-git-'), false)
  }
  assert.equal(companionEnvironmentFor('prod').allowed_base_urls.includes(PREVIEW), false)

  const { fetchFn, calls } = createFakeFetchQueue([() => jsonResponse(200, { ok: true })])
  const bg = loadBackgroundScript({
    fetchFn,
    environmentSource: environmentSource('prod'),
    initialStorage: { [SESSION_KEY]: session(PREVIEW) },
  })

  const bridge = await bg.sendMessage({ source: 'YOLEN_COMPANION_BRIDGE', action: 'SESSION_UPDATE', session: session(PREVIEW) }, { url: `${PREVIEW}/cockpit` })
  assert.equal(bridge.ok, false)
  assert.equal(bridge.payload.status, 'SESSION_IGNORED_ORIGIN')

  await bg.sendMessage({ source: 'YOLEN_COMPANION', action: 'RESOLVE_LEAD', baseUrl: PREVIEW, payload: { phone: '5511999990000' } })
  assert.equal(calls[0].url, `${PRODUCTION_BASE_URL}/api/companion/resolve-lead`)

  const bridgeRun = await runYolenBridge({ origin: PREVIEW, environment: environmentSource('prod') })
  assert.equal(bridgeRun.fetches.length, 0)
  assert.equal(bridgeRun.sessions.length, 0)
  assert.equal(bridgeRun.pageBridgeScript, null)
})

// ---------------------------------------------------------------------------
// G. Bridge HML reconhece o preview
// ---------------------------------------------------------------------------

async function runYolenBridge({ origin, environment }) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: `${origin}/cockpit` })
  const fetches = []
  const sessions = []

  const sandbox = {
    window: dom.window,
    document: dom.window.document,
    console,
    fetch: async (url, init) => {
      fetches.push({ url, init })
      return { ok: true, status: 200, json: async () => ({ ok: true, companion_token: 't', expires_at: new Date(Date.now() + 3600000).toISOString() }) }
    },
    browser: {
      runtime: {
        sendMessage: async (message) => {
          sessions.push(message)
          return { ok: true }
        },
        getURL: (path) => `moz-extension://fake/${path}`,
      },
    },
  }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)

  if (environment) {
    vm.runInContext(environment, sandbox, { filename: 'companion-environment.js' })
  }
  vm.runInContext(SRC('yolen-bridge.js'), sandbox, { filename: 'yolen-bridge.js' })
  await new Promise((resolve) => setTimeout(resolve, 20))

  const script = dom.window.document.getElementById('yolen-page-bridge-script')

  return {
    fetches,
    sessions,
    pageBridgeScript: script ? { src: script.src, allowed: script.dataset.yolenAllowedOrigins } : null,
  }
}

async function runPageBridge({ origin, allowedOrigins }) {
  const fetches = []
  const posted = []
  const sandbox = {
    console,
    document: { currentScript: allowedOrigins === undefined ? null : { dataset: { yolenAllowedOrigins: allowedOrigins } } },
    window: {
      location: { origin, pathname: '/cockpit' },
      postMessage: (data, targetOrigin) => posted.push({ data, targetOrigin }),
      setInterval: () => 0,
    },
    fetch: async (url) => {
      fetches.push(url)
      return { ok: true, status: 200, json: async () => ({ ok: true, companion_token: 't' }) }
    },
  }
  vm.createContext(sandbox)
  vm.runInContext(SRC('yolen-page-bridge.js'), sandbox, { filename: 'yolen-page-bridge.js' })
  await new Promise((resolve) => setTimeout(resolve, 20))
  return { fetches, posted }
}

test('G) bridge HML reconhece o preview: captura a sessão com a origem do preview e injeta o page bridge com essa origem', async () => {
  const run = await runYolenBridge({ origin: PREVIEW, environment: environmentSource('homolog', PREVIEW) })

  assert.deepEqual(run.fetches.map((call) => call.url), ['/api/companion/connect'])
  assert.equal(run.fetches[0].init.credentials, 'include')
  assert.equal(run.sessions.length, 1)
  assert.equal(run.sessions[0].source, 'YOLEN_COMPANION_BRIDGE')
  assert.equal(run.sessions[0].action, 'SESSION_UPDATE')
  assert.equal(run.sessions[0].session.origin, PREVIEW)
  assert.equal(run.pageBridgeScript.allowed, PREVIEW)
  assert.equal(run.pageBridgeScript.src, 'moz-extension://fake/src/yolen-page-bridge.js')

  // Mesma bridge HML em produção ou em outro preview: não faz nada.
  for (const origin of [PRODUCTION_BASE_URL, OTHER_PREVIEW]) {
    const other = await runYolenBridge({ origin, environment: environmentSource('homolog', PREVIEW) })
    assert.equal(other.fetches.length, 0, origin)
    assert.equal(other.sessions.length, 0, origin)
    assert.equal(other.pageBridgeScript, null, origin)
  }

  // Sem configuração carregada, a bridge não reconhece nenhuma origem.
  const unconfigured = await runYolenBridge({ origin: PREVIEW, environment: null })
  assert.equal(unconfigured.fetches.length, 0)

  // Page bridge: só age na origem entregue pela bridge do content script.
  const page = await runPageBridge({ origin: PREVIEW, allowedOrigins: PREVIEW })
  assert.deepEqual(page.fetches, ['/api/companion/connect'])
  assert.equal(page.posted[0].data.session.origin, PREVIEW)
  assert.equal(page.posted[0].targetOrigin, PREVIEW)

  assert.equal((await runPageBridge({ origin: PREVIEW, allowedOrigins: PRODUCTION_BASE_URL })).fetches.length, 0)
  assert.equal((await runPageBridge({ origin: PREVIEW, allowedOrigins: undefined })).fetches.length, 0)

  // Background HML aceita a sessão da ponte do preview.
  const bg = loadBackgroundScript({ environmentSource: environmentSource('homolog', PREVIEW) })
  const stored = await bg.sendMessage({ source: 'YOLEN_COMPANION_BRIDGE', action: 'SESSION_UPDATE', session: session(PREVIEW) }, { url: `${PREVIEW}/cockpit` })
  assert.equal(stored.payload.status, 'SESSION_STORED')
  assert.equal(bg.storage[SESSION_KEY].origin, PREVIEW)

  // Origem declarada diferente da página que enviou: ignorada.
  const spoofed = await bg.sendMessage({ source: 'YOLEN_COMPANION_BRIDGE', action: 'SESSION_UPDATE', session: session(PREVIEW) }, { url: `${OTHER_PREVIEW}/` })
  assert.equal(spoofed.payload.status, 'SESSION_IGNORED_ORIGIN')
})

// ---------------------------------------------------------------------------
// H. Sessão HML nunca cai silenciosamente para produção
// ---------------------------------------------------------------------------

function loadYolenApi({ environment, respond }) {
  const sent = []
  const sandbox = {
    console,
    window: {},
    browser: {
      runtime: {
        sendMessage: async (message) => {
          sent.push(message)
          return respond(message)
        },
      },
    },
    setTimeout,
    clearTimeout,
    Promise,
  }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  vm.runInContext(environment, sandbox, { filename: 'companion-environment.js' })
  vm.runInContext(SRC('yolen-api.js'), sandbox, { filename: 'yolen-api.js' })
  return { api: sandbox.window.YolenCompanionApi, sent }
}

test('H) sessão HML nunca cai para produção: sessão de produção, baseUrl de produção, reconexão e identidade', async () => {
  // Background: sessão em cache com origem de PRODUÇÃO num pacote HML.
  const { fetchFn, calls } = createFakeFetchQueue([
    () => jsonResponse(200, PREVIEW_IDENTITY),
    () => jsonResponse(200, { ok: true, user: { full_name: 'Vendedor' }, active_company: { id: 'company-1', name: 'Empresa' } }),
    () => jsonResponse(200, { ok: true }),
    () => jsonResponse(200, PREVIEW_IDENTITY),
  ])
  const prodSession = session(PRODUCTION_BASE_URL)
  prodSession.payload.active_company = { id: 'company-1', name: 'Empresa sem nome' }
  const bg = loadBackgroundScript({
    fetchFn,
    environmentSource: environmentSource('homolog', PREVIEW),
    initialStorage: { [SESSION_KEY]: prodSession },
  })

  // GET_ME com identidade incompleta faz refresh em /me: no preview.
  await bg.sendMessage({ source: 'YOLEN_COMPANION', action: 'GET_ME', baseUrl: PRODUCTION_BASE_URL })
  await bg.sendMessage({ source: 'YOLEN_COMPANION', action: 'ANALYZE_CONVERSATION', baseUrl: PRODUCTION_BASE_URL, payload: {} })
  const identity = await bg.sendMessage({ source: 'YOLEN_COMPANION', action: 'GET_BACKEND_BUILD_IDENTITY' })

  // A confirmação de preview vale para as requisições seguintes.
  assert.deepEqual(calls.map((call) => call.url), [
    `${PREVIEW}/api/companion/build-identity`,
    `${PREVIEW}/api/companion/me`,
    `${PREVIEW}/api/companion/analyze-conversation`,
    `${PREVIEW}/api/companion/build-identity`,
  ])
  assert.equal(calls.some((call) => call.url.startsWith(PRODUCTION_BASE_URL)), false)
  assert.equal(identity.payload.commit_short, 'aaaaaaaa')
  assert.equal(identity.payload.base_url, PREVIEW)
  assert.equal(calls[3].init.credentials, 'omit')
  assert.equal(calls[3].init.headers, undefined, 'identidade do backend nunca leva token')

  // Sem sessão: nenhuma requisição (nunca "tenta produção").
  const empty = createFakeFetchQueue([])
  const bgEmpty = loadBackgroundScript({ fetchFn: empty.fetchFn, environmentSource: environmentSource('homolog', PREVIEW) })
  const noSession = await bgEmpty.sendMessage({ source: 'YOLEN_COMPANION', action: 'RESOLVE_LEAD', baseUrl: PRODUCTION_BASE_URL, payload: {} })
  assert.equal(noSession.payload.status, 'NO_COMPANION_SESSION')
  assert.equal(empty.calls.length, 0)

  // Content script (yolen-api): sessão com origem de produção não muda a base.
  const { api, sent } = loadYolenApi({
    environment: environmentSource('homolog', PREVIEW),
    respond: (message) =>
      message.action === 'GET_ME'
        ? { ok: true, statusCode: 200, origin: PRODUCTION_BASE_URL, payload: { ok: true } }
        : { ok: true, statusCode: 200, payload: { ok: true } },
  })

  assert.equal(api.getBaseUrl(), PREVIEW)
  await api.getMe()
  assert.equal(api.getBaseUrl(), PREVIEW)
  await api.setSession(session(PRODUCTION_BASE_URL))
  assert.equal(api.getBaseUrl(), PREVIEW)
  await api.getBackendBuildIdentity()
  assert.ok(sent.every((message) => message.baseUrl === PREVIEW), JSON.stringify(sent.map((m) => m.baseUrl)))
  assert.equal(sent.at(-1).action, 'GET_BACKEND_BUILD_IDENTITY')
  assert.equal(api.getCompanionEnvironment().channel, 'homolog')

  // Reconexão/reload: sessão do preview continua no preview.
  await api.setSession(session(PREVIEW))
  assert.equal(api.getBaseUrl(), PREVIEW)
})

test('H) identidade do backend indisponível ou sem commit válido nunca vira "compatível"', async () => {
  const cases = [
    [() => jsonResponse(200, { environment: 'preview', commit: null, commit_short: null }), 200],
    [() => jsonResponse(200, { environment: 'preview', commit: 'not-a-sha' }), 200],
    [() => jsonResponse(404, null), 404],
  ]

  for (const [responder, status] of cases) {
    const { fetchFn } = createFakeFetchQueue([responder])
    const bg = loadBackgroundScript({ fetchFn, environmentSource: environmentSource('homolog', PREVIEW) })
    const result = await bg.sendMessage({ source: 'YOLEN_COMPANION', action: 'GET_BACKEND_BUILD_IDENTITY' })
    assert.equal(result.ok, false)
    assert.equal(result.statusCode, status)
    assert.equal(result.payload.commit, null)
  }

  const bg = loadBackgroundScript({
    fetchFn: async () => {
      throw new Error('offline')
    },
    environmentSource: environmentSource('homolog', PREVIEW),
  })
  const offline = await bg.sendMessage({ source: 'YOLEN_COMPANION', action: 'GET_BACKEND_BUILD_IDENTITY' })
  assert.equal(offline.ok, false)
  assert.equal(offline.payload.commit, null)
})

test('H) backend HML que se declara PRODUÇÃO (ou não confirma preview) nunca recebe token', async () => {
  const cases = [
    [() => jsonResponse(200, { environment: 'production', commit: 'b'.repeat(40), commit_short: 'bbbbbbbb' }), /PRODUÇÃO/],
    [() => jsonResponse(200, { environment: null, commit: 'b'.repeat(40), commit_short: 'bbbbbbbb' }), /não confirmado como preview/],
    [() => jsonResponse(503, null), /não confirmado como preview/],
  ]

  for (const [identityResponder, expectedError] of cases) {
    const { fetchFn, calls } = createFakeFetchQueue([identityResponder, identityResponder])
    const bg = loadBackgroundScript({
      fetchFn,
      environmentSource: environmentSource('homolog', PREVIEW),
      initialStorage: { [SESSION_KEY]: session(PREVIEW) },
    })

    const refused = await bg.sendMessage({ source: 'YOLEN_COMPANION', action: 'RESOLVE_LEAD', baseUrl: PREVIEW, payload: { phone: '5511999990000' } })
    assert.equal(refused.ok, false)
    assert.equal(refused.payload.status, 'HOMOLOG_BACKEND_NOT_PREVIEW')
    assert.match(refused.payload.error, expectedError)

    // Falha não é memorizada: a próxima requisição confere de novo.
    await bg.sendMessage({ source: 'YOLEN_COMPANION', action: 'RESOLVE_LEAD', baseUrl: PREVIEW, payload: { phone: '5511999990000' } })

    assert.deepEqual(calls.map((call) => call.url), [
      `${PREVIEW}/api/companion/build-identity`,
      `${PREVIEW}/api/companion/build-identity`,
    ])
    assert.ok(calls.every((call) => call.init.headers === undefined), 'nenhum token enviado')
  }

  // PROD nunca faz essa conferência (canal sem backend_match_required).
  const { fetchFn, calls } = createFakeFetchQueue([() => jsonResponse(200, { ok: true })])
  const prod = loadBackgroundScript({
    fetchFn,
    environmentSource: environmentSource('prod'),
    initialStorage: { [SESSION_KEY]: session(PRODUCTION_BASE_URL) },
  })
  await prod.sendMessage({ source: 'YOLEN_COMPANION', action: 'RESOLVE_LEAD', payload: { phone: '5511999990000' } })
  assert.deepEqual(calls.map((call) => call.url), [`${PRODUCTION_BASE_URL}/api/companion/resolve-lead`])
})

// ---------------------------------------------------------------------------
// K. Verificador HML
// ---------------------------------------------------------------------------

test('K) verificador HML: ATUAL no mesmo preview; DESATUALIZADO sem URL, com outro preview, fonte alterada ou staging editado', () => {
  const copy = isolatedCopy()

  try {
    assert.equal(stagingDirFor('firefox', 'homolog').endsWith(join('dist', 'yolen-companion', 'firefox', 'homolog', 'staging')), true)
    assert.notEqual(stagingDirFor('firefox', 'homolog'), stagingDirFor('firefox', 'prod'))

    const built = buildHomolog(copy, PREVIEW)
    assert.equal(built.effectiveManyChatCaptureEnabled, false)
    assert.equal(built.buildIdentity.environment, 'firefox-homolog')
    assert.equal(built.buildIdentity.api_base_url, PREVIEW)

    const fresh = verifyHomolog(copy, PREVIEW)
    assert.deepEqual(fresh.problems, [])
    assert.equal(fresh.fresh, true)
    assert.deepEqual(fresh.homolog, {
      environment: 'homolog',
      api_base_url: PREVIEW,
      allowed_base_urls: [PREVIEW],
      backend_match_required: true,
      host_permissions: [...CHANNEL_HOSTS, `${PREVIEW}/*`].sort(),
      bridge_matches: [`${PREVIEW}/*`],
      page_bridge_matches: [`${PREVIEW}/*`],
      background_loads_environment_first: true,
      content_scripts_load_environment: true,
      manychat_capture_enabled: false,
      extension_name: 'Yolen Companion [HML]',
      gecko_id: FIREFOX_HOMOLOG_GECKO_ID,
      identity_environment: 'firefox-homolog',
      identity_api_base_url: PREVIEW,
    })

    // Sem a URL: não há o que comparar.
    const missing = verifyHomolog(copy, undefined)
    assert.equal(missing.fresh, false)
    assert.match(missing.problems.join(' | '), /ausente/)

    // Staging gerado para PREVIEW, verificado para OUTRO preview.
    const otherPreview = verifyHomolog(copy, OTHER_PREVIEW)
    assert.equal(otherPreview.fresh, false)
    assert.match(otherPreview.problems[0], new RegExp(`gerado para ${PREVIEW.replace(/\./g, '\\.')}`))
    assert.ok(otherPreview.problems.some((problem) => /manifest\.json do staging difere/.test(problem)))
    assert.ok(otherPreview.problems.some((problem) => /Configuração do canal no staging/.test(problem)))

    // Fonte de runtime alterada sem rebuild.
    const corePath = join(copy.extensionRoot, 'src', 'companion-core.js')
    const original = readFileSync(corePath)
    writeFileSync(corePath, `${original}\n// alteração local\n`)
    assert.match(verifyHomolog(copy, PREVIEW).problems.join(' | '), /src\/companion-core\.js/)
    writeFileSync(corePath, original)
    assert.equal(verifyHomolog(copy, PREVIEW).fresh, true)

    // Configuração do canal editada à mão DENTRO do staging.
    const stagedEnv = join(copy.stagingDir, COMPANION_ENVIRONMENT_PATHNAME)
    const stagedOriginal = readFileSync(stagedEnv, 'utf8')
    writeFileSync(stagedEnv, stagedOriginal.replaceAll(PREVIEW, OTHER_PREVIEW))
    const tampered = verifyHomolog(copy, PREVIEW)
    assert.equal(tampered.fresh, false)
    assert.ok(tampered.problems.some((problem) => /Fingerprint do staging/.test(problem)))
    assert.ok(tampered.problems.some((problem) => /gerado para/.test(problem)))
    writeFileSync(stagedEnv, stagedOriginal)

    // Rebuild para o outro preview: ATUAL para ele, DESATUALIZADO para o antigo.
    buildHomolog(copy, OTHER_PREVIEW)
    assert.deepEqual(verifyHomolog(copy, OTHER_PREVIEW).problems, [])
    assert.equal(verifyHomolog(copy, PREVIEW).fresh, false)
  } finally {
    rmSync(copy.root, { recursive: true, force: true })
  }
})

test('K) staging HML nunca é aceito como PROD nem vice-versa', () => {
  const copy = isolatedCopy()

  try {
    buildHomolog(copy, PREVIEW)
    const asProd = verifyStagedBuild({
      targetName: 'firefox',
      environment: 'prod',
      extensionRoot: copy.extensionRoot,
      repoRoot: copy.root,
      stagingDir: copy.stagingDir,
    })
    assert.equal(asProd.fresh, false)
    assert.ok(asProd.problems.some((problem) => /manifest\.json do staging difere do manifest prod/.test(problem)))
  } finally {
    rmSync(copy.root, { recursive: true, force: true })
  }
})
