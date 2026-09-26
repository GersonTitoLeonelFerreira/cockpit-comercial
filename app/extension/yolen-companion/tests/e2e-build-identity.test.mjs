// FASE 10 — LIVE-01: o live test exibiu "Yolen · lead não encontrado nesta
// empresa", texto que só existe no runtime ManyChat legado (removido em
// 6d77bddf). Um pacote E2E de um commit anterior (ex.: 24f25c71) era
// indistinguível do pacote aprovado: mesmo nome "Yolen Companion [E2E]",
// mesma versão, mesmo id do Firefox e mesmo caminho relativo
// dist/yolen-companion/e2e/firefox/staging/manifest.json. O pacote E2E
// precisa se identificar pelo commit de origem — visível no
// about:debugging e conferido pelo validador E2E.

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { E2E_NAME, toE2EManifest } from '../scripts/build-package.mjs'

const sourceManifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'))

test('pacotes E2E de commits diferentes nunca têm a mesma identidade visível', () => {
  for (const target of ['firefox', 'chrome']) {
    const approved = toE2EManifest(sourceManifest, target, { sourceCommit: '9e6a22c0' })
    const stale = toE2EManifest(sourceManifest, target, { sourceCommit: '24f25c71' })

    assert.notEqual(approved.name, stale.name, `${target}: nome do pacote E2E não identifica o commit de origem`)
    assert.ok(approved.name.startsWith(E2E_NAME), `${target}: continua identificado como build interno`)
    assert.match(approved.name, /9e6a22c0/)
    assert.match(stale.name, /24f25c71/)
  }
})

test('sem commit explícito, o pacote E2E se identifica pelo HEAD atual do checkout', () => {
  const head = execFileSync('git', ['rev-parse', '--short=8', 'HEAD'], { encoding: 'utf8' }).trim()
  const manifest = toE2EManifest(sourceManifest, 'firefox')

  assert.match(manifest.name, new RegExp(head))
})
