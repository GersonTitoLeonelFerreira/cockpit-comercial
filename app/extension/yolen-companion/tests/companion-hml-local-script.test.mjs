// npm run companion:hml-local — build local da extensão HML para o Firefox.
// Build simulado em pastas temporárias: o teste prova a cópia completa
// (arquivos com a mesma data e o mesmo tamanho também são trocados; o que
// sumiu do staging some do destino) e o commit impresso no fim.

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  DEFAULT_HOMOLOG_BASE_URL,
  TARGET_DIR_NAME,
  readBuildIdentityCommit,
  runHmlLocal,
  stagingDirFor,
} from '../../../../scripts/companion-hml-local.mjs'

const FIXED_DATE = new Date('2020-01-01T00:00:00Z')

function writeFixed(path, content) {
  writeFileSync(path, content)
  utimesSync(path, FIXED_DATE, FIXED_DATE)
}

function identitySource(commit) {
  return `;(function () {\n  const identity = Object.freeze({\n    "version": "1.5.2",\n    "commit": "${commit}",\n    "commit_short": "${commit.slice(0, 8)}"\n  })\n})()\n`
}

function fakeBuild(commit, files) {
  return ({ repoRoot }) => {
    const staging = stagingDirFor(repoRoot)
    rmSync(staging, { recursive: true, force: true })
    mkdirSync(join(staging, 'src'), { recursive: true })
    writeFixed(join(staging, 'src', 'build-identity.js'), identitySource(commit))

    for (const [name, content] of Object.entries(files)) {
      writeFixed(join(staging, name), content)
    }
  }
}

test('companion:hml-local: apaga o destino, copia o staging inteiro e imprime o commit', () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'hml-local-'))
  const logs = []
  const builds = []

  try {
    const first = runHmlLocal({
      repoRoot,
      env: {},
      runBuild: (args) => {
        builds.push(args.baseUrl)
        fakeBuild('a'.repeat(40), { 'manifest.json': 'AAAA', 'velho.js': 'x' })(args)
      },
      log: (line) => logs.push(line),
    })

    assert.equal(first.commit, 'a'.repeat(40))
    assert.equal(builds[0], DEFAULT_HOMOLOG_BASE_URL)

    const target = join(repoRoot, TARGET_DIR_NAME)
    assert.equal(readFileSync(join(target, 'manifest.json'), 'utf8'), 'AAAA')

    // Segundo build: mesmo tamanho e mesma data fixa, conteúdo diferente; um
    // arquivo deixou de existir. Sincronização por data/tamanho falharia aqui.
    const second = runHmlLocal({
      repoRoot,
      env: { YOLEN_COMPANION_HOMOLOG_BASE_URL: 'https://outro-preview.example' },
      runBuild: (args) => {
        builds.push(args.baseUrl)
        fakeBuild('b'.repeat(40), { 'manifest.json': 'BBBB' })(args)
      },
      log: (line) => logs.push(line),
    })

    assert.equal(builds[1], 'https://outro-preview.example')
    assert.equal(statSync(join(stagingDirFor(repoRoot), 'manifest.json')).mtime.getTime(), FIXED_DATE.getTime())
    assert.equal(readFileSync(join(target, 'manifest.json'), 'utf8'), 'BBBB')
    assert.equal(existsSync(join(target, 'velho.js')), false)
    assert.equal(second.commit, 'b'.repeat(40))
    assert.equal(readBuildIdentityCommit(target), 'b'.repeat(40))
    assert.equal(logs.at(-1), `Commit gravado em ${TARGET_DIR_NAME}/src/build-identity.js: ${'b'.repeat(40)}`)
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
})

test('companion:hml-local: build que falha não apaga o destino', () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'hml-local-'))

  try {
    mkdirSync(join(repoRoot, TARGET_DIR_NAME))
    writeFileSync(join(repoRoot, TARGET_DIR_NAME, 'manifest.json'), 'antigo')

    assert.throws(
      () => runHmlLocal({
        repoRoot,
        env: {},
        runBuild: () => {
          throw new Error('O build --homolog-manychat falhou (código 1).')
        },
        log: () => {},
      }),
      /falhou/,
    )

    assert.equal(readFileSync(join(repoRoot, TARGET_DIR_NAME, 'manifest.json'), 'utf8'), 'antigo')
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
})

test('companion:hml-local está no package.json e o destino no .gitignore', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8'))
  const gitignore = readFileSync(new URL('../../../../.gitignore', import.meta.url), 'utf8')

  assert.equal(pkg.scripts['companion:hml-local'], 'node scripts/companion-hml-local.mjs')
  assert.match(gitignore, /^\/yolen-firefox-dev\/$/m)
})
