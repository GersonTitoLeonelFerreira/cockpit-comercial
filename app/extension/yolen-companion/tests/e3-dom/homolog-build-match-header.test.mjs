// Canal HOMOLOG no painel real (composição WhatsApp do manifest, sources
// do staging homolog): o cabeçalho mostra o commit do pacote e o commit do
// backend configurado, e deixa explícito quando a análise NÃO vale como
// homologação.
//   I. Mesmo commit → "HML · v<versão> · <commit>" / "Backend · <commit>".
//   J. Commit diferente (ou backend sem commit, ou pacote com alterações
//      locais) → "BUILD INCOMPATÍVEL" / "Extensão: …" / "Backend: …".

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildIdentityFor,
  companionEnvironmentFor,
  readSourceManifest,
  renderBuildIdentitySource,
  renderCompanionEnvironmentSource,
} from '../../scripts/build-package.mjs'
import {
  buildWhatsAppPageHtml,
  loadContentScript,
  waitFor,
} from '../e3-test-support/load-content-script.mjs'

const PREVIEW = 'https://cockpit-comercial-vocn-git-claude-companion-sales-51296a-yolen.vercel.app'
const EXTENSION_COMMIT = 'ce50089a99b3bef6ab9deb9a348a7152439908c3'
const OTHER_COMMIT = '91c96775d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f'
const { version: VERSION } = readSourceManifest()

function homologSources({ commit = EXTENSION_COMMIT, dirty = false } = {}) {
  return {
    'companion-environment.js': renderCompanionEnvironmentSource(
      companionEnvironmentFor('homolog', { homologBaseUrl: PREVIEW }),
    ),
    'build-identity.js': renderBuildIdentitySource(
      buildIdentityFor({
        version: VERSION,
        environment: 'homolog',
        targetName: 'firefox',
        git: { commit, commit_short: commit.slice(0, 8), dirty },
        fingerprint: 'f'.repeat(16),
        apiBaseUrl: PREVIEW,
      }),
    ),
  }
}

function backendIdentity(commit, environment = 'preview') {
  return {
    GET_BACKEND_BUILD_IDENTITY: async () =>
      commit
        ? {
            ok: true,
            statusCode: 200,
            payload: { ok: true, base_url: PREVIEW, environment, commit, commit_short: commit.slice(0, 8) },
          }
        : {
            ok: false,
            statusCode: 0,
            payload: { ok: false, base_url: PREVIEW, environment: null, commit: null, commit_short: null },
          },
  }
}

function load({ sources, backendCommit, backendEnvironment }) {
  return loadContentScript({
    initialHtml: buildWhatsAppPageHtml({ headerTitle: '+55 11 98888-7777' }),
    sourceOverrides: sources,
    extraHandlers: backendCommit === undefined ? {} : backendIdentity(backendCommit, backendEnvironment),
    getMeResult: {
      ok: true,
      statusCode: 200,
      origin: PREVIEW,
      payload: {
        ok: true,
        user: { id: 'user-1', full_name: 'Vendedor Teste' },
        active_company: { id: 'company-1', name: 'Empresa Teste', role: 'member' },
      },
    },
  })
}

const text = (document, selector) => document.querySelector(selector)?.textContent ?? null

test('I) extensão e backend no MESMO commit: cabeçalho HML válido, sem alerta', async () => {
  const { document, calls } = load({ sources: homologSources(), backendCommit: EXTENSION_COMMIT })

  await waitFor(() => text(document, '[data-yolen-backend-identity]') === 'Backend · ce50089a')

  assert.equal(text(document, '[data-yolen-build-identity]'), `HML · v${VERSION} · ce50089a`)
  assert.equal(
    document.querySelector('[data-yolen-backend-identity]').getAttribute('data-yolen-backend-status'),
    'match',
  )
  assert.equal(document.querySelector('[data-yolen-build-mismatch]'), null)

  const identityCalls = calls.filter((call) => call.action === 'GET_BACKEND_BUILD_IDENTITY')
  assert.ok(identityCalls.length >= 1)
  assert.ok(identityCalls.every((call) => call.baseUrl === PREVIEW))
})

test('J) backend em outro commit: BUILD INCOMPATÍVEL com os dois commits e aviso de homologação inválida', async () => {
  const { document } = load({ sources: homologSources(), backendCommit: OTHER_COMMIT })

  await waitFor(() => document.querySelector('[data-yolen-build-mismatch]'))

  const alert = document.querySelector('[data-yolen-build-mismatch]')
  assert.equal(alert.getAttribute('role'), 'alert')
  assert.deepEqual(
    [...alert.children].map((node) => node.textContent),
    [
      'BUILD INCOMPATÍVEL',
      'Extensão: ce50089a',
      'Backend: 91c96775',
      'Esta análise NÃO vale como homologação.',
    ],
  )
  assert.equal(text(document, '[data-yolen-build-identity]'), `HML · v${VERSION} · ce50089a`)
  assert.equal(text(document, '[data-yolen-backend-identity]'), 'Backend · 91c96775')
  assert.equal(
    document.querySelector('[data-yolen-backend-identity]').getAttribute('data-yolen-backend-status'),
    'mismatch',
  )
})

test('J) backend sem commit confirmado ou pacote com alterações locais nunca vale como homologação', async () => {
  const unavailable = load({ sources: homologSources(), backendCommit: null })
  await waitFor(() => unavailable.document.querySelector('[data-yolen-build-mismatch]'))
  assert.deepEqual(
    [...unavailable.document.querySelector('[data-yolen-build-mismatch]').children].map((node) => node.textContent),
    ['BUILD NÃO CONFIRMADO', 'Extensão: ce50089a', 'Backend: indisponível', 'Esta análise NÃO vale como homologação.'],
  )

  const dirty = load({ sources: homologSources({ dirty: true }), backendCommit: EXTENSION_COMMIT })
  await waitFor(() => dirty.document.querySelector('[data-yolen-build-mismatch]'))
  assert.deepEqual(
    [...dirty.document.querySelector('[data-yolen-build-mismatch]').children].map((node) => node.textContent),
    ['BUILD INCOMPATÍVEL', 'Extensão: ce50089a+', 'Backend: ce50089a', 'Esta análise NÃO vale como homologação.'],
  )
})

test('J) backend que se declara produção nunca vale como homologação, mesmo no mesmo commit', async () => {
  const { document } = load({
    sources: homologSources(),
    backendCommit: EXTENSION_COMMIT,
    backendEnvironment: 'production',
  })

  await waitFor(() => document.querySelector('[data-yolen-build-mismatch]'))
  assert.deepEqual(
    [...document.querySelector('[data-yolen-build-mismatch]').children].map((node) => node.textContent),
    [
      'BACKEND NÃO É PREVIEW',
      'Extensão: ce50089a',
      'Backend: ce50089a (production)',
      'Esta análise NÃO vale como homologação.',
    ],
  )
  assert.equal(
    document.querySelector('[data-yolen-backend-identity]').getAttribute('data-yolen-backend-status'),
    'not_preview',
  )
})

test('fora do canal homolog o cabeçalho continua o de sempre e nunca consulta o backend', async () => {
  const { document, calls } = load({ sources: {}, backendCommit: undefined })

  await waitFor(() => text(document, '[data-yolen-build-identity]'))
  await waitFor(() => calls.some((call) => call.action === 'GET_ME'))

  assert.equal(text(document, '[data-yolen-build-identity]'), 'fonte')
  assert.equal(document.querySelector('[data-yolen-backend-identity]'), null)
  assert.equal(document.querySelector('[data-yolen-build-mismatch]'), null)
  assert.equal(calls.some((call) => call.action === 'GET_BACKEND_BUILD_IDENTITY'), false)
})
