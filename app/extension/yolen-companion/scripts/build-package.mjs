#!/usr/bin/env node
// Empacotamento reproduzível do Yolen Companion para Chrome e Firefox.
//
// Escopo (D1 — Fundação isolada de Release Engineering):
//   - Copia, a partir de uma allowlist EXPLÍCITA, somente os arquivos que o
//     manifest.json já declara como necessários em runtime.
//   - Nunca faz `cp -r`/glob da pasta da extensão: `tests/`, arquivos locais,
//     `.env` e qualquer artefato temporário são estruturalmente impossíveis
//     de entrar no pacote, porque nunca são lidos por este script.
//   - Gera os tamanhos de ícone (16/32/48/128) a partir do
//     assets/yolen-mark.png existente, sem redesenhar a identidade visual.
//
// Escopo (D3 — Separação DEV/PROD e Release Candidate de loja):
//   - `manifest.json` continua sendo a ÚNICA fonte de verdade de
//     desenvolvimento — nunca é editado por este script. Toda a diferença
//     entre DEV e PROD acontece em memória, em `toProductionManifest()`,
//     durante o build.
//   - Cada navegador agora gera DOIS pacotes: `dev` (comportamento do D1,
//     inalterado — ainda inclui `localhost:3000`, sem `icons` vinculados)
//     e `prod` (sem nenhum host de desenvolvimento, com `icons` vinculados
//     aos PNGs gerados, e com os ajustes específicos de loja por
//     navegador — ver `toProductionManifest`). Os nomes de arquivo e a
//     estrutura de diretórios dos pacotes `dev` não mudam em relação ao
//     D1/D2, para não quebrar nada que já dependa deles; os pacotes `prod`
//     usam um sufixo `-prod-` próprio, para que um nunca seja confundido
//     com o outro (ver também `build-summary.json`, que grava o campo
//     `environment` de cada pacote).
//
// Este script não depende de nenhum pacote npm novo: usa apenas módulos
// nativos do Node (fs, path, zlib, crypto) e o binário `zip` do sistema
// operacional para gerar o arquivo final.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { resizePngSquare } from './lib/png-resize.mjs'

export const EXTENSION_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const REPO_ROOT = join(EXTENSION_ROOT, '..', '..', '..')
export const OUTPUT_ROOT = join(REPO_ROOT, 'dist', 'yolen-companion')

// Timestamp fixo aplicado a todos os arquivos do pacote antes de zipar, para
// que o mesmo conteúdo sempre produza os mesmos bytes de saída dentro do
// MESMO ambiente/execução do `zip`. Reprodutibilidade byte-a-byte entre
// máquinas/implementações diferentes de `zip` ainda não foi validada — ver
// README.md, seção "Reprodutibilidade".
const REPRODUCIBLE_MTIME = new Date('2020-01-01T00:00:00Z')

export const ICON_SIZES = [16, 32, 48, 128]

// Allowlist explícita: todo arquivo compartilhado pelos dois pacotes.
// Cada entrada aqui corresponde a um arquivo que o manifest.json de
// desenvolvimento já declara em content_scripts, web_accessible_resources
// ou background. Nada é incluído "por estar na pasta".
export const SHARED_RUNTIME_FILES = [
  'assets/yolen-mark.png',
  'src/background.js',
  'src/capture-batch.js',
  'src/capture-resilience-null-base.js',
  'src/capture-resilience.js',
  'src/capture-transport.js',
  'src/companion-client-context-view.js',
  'src/companion-lead-summary-view.js',
  'src/companion-reasoning-view.js',
  'src/companion-seller-information-view.js',
  'src/content-script.js',
  'src/conversation-registration-tools.js',
  'src/editable-field-stability-runtime.js',
  'src/lead-automation.css',
  'src/lead-automation.js',
  'src/lead-enrichment.js',
  'src/lead-resolution-runtime-cache.js',
  'src/lead-summary-expand-state.js',
  'src/lead-summary-runtime-cache.js',
  'src/message-mutations.js',
  'src/panel-stability-runtime.js',
  'src/seller-message-runtime.js',
  'src/styles.css',
  'src/ux8-interaction-consistency-runtime.js',
  'src/whatsapp-audio-bridge.js',
  'src/whatsapp-identity-bridge.js',
  'src/yolen-api.js',
  'src/yolen-bridge.js',
  'src/yolen-page-bridge.js',
]

// Só é necessário no pacote Chrome: é o arquivo referenciado por
// background.service_worker (que por sua vez faz importScripts dos dois
// arquivos de background já listados acima).
export const CHROME_ONLY_FILES = ['src/background-service-worker.js']

export const TARGETS = {
  chrome: {
    files: [...SHARED_RUNTIME_FILES, ...CHROME_ONLY_FILES],
    adaptManifest(manifest) {
      const clone = structuredClone(manifest)
      delete clone.background.scripts
      return clone
    },
  },
  firefox: {
    files: [...SHARED_RUNTIME_FILES],
    adaptManifest(manifest) {
      const clone = structuredClone(manifest)
      delete clone.background.service_worker
      return clone
    },
  },
}

export const PRODUCTION_HOSTS = ['https://cockpit-comercial-vocn.vercel.app/*']

export const FIREFOX_STRICT_MIN_VERSION = '128.0'
export const CHROME_MIN_VERSION = '111'

function productionMatches(matches) {
  return matches.filter((match) => !match.includes('localhost'))
}

export function toProductionManifest(sourceManifest, targetName) {
  const manifest = TARGETS[targetName].adaptManifest(sourceManifest)

  manifest.host_permissions = productionMatches(manifest.host_permissions || [])

  for (const block of manifest.content_scripts || []) {
    block.matches = productionMatches(block.matches || [])
  }

  for (const block of manifest.web_accessible_resources || []) {
    block.matches = productionMatches(block.matches || [])
  }

  manifest.icons = Object.fromEntries(
    ICON_SIZES.map((size) => [String(size), `assets/icons/icon-${size}.png`]),
  )

  if (targetName === 'firefox') {
    manifest.browser_specific_settings = {
      ...(manifest.browser_specific_settings || {}),
      gecko: {
        ...(manifest.browser_specific_settings?.gecko || {}),
        strict_min_version: FIREFOX_STRICT_MIN_VERSION,
      },
    }
  } else {
    delete manifest.browser_specific_settings
    manifest.minimum_chrome_version = CHROME_MIN_VERSION
  }

  return manifest
}

export function readSourceManifest() {
  return JSON.parse(readFileSync(join(EXTENSION_ROOT, 'manifest.json'), 'utf8'))
}

function runtimeFilesFromManifest(manifest) {
  const result = new Set()

  for (const file of manifest.background?.scripts || []) {
    result.add(file)
  }

  if (manifest.background?.service_worker) {
    result.add(manifest.background.service_worker)
  }

  for (const block of manifest.content_scripts || []) {
    for (const file of block.js || []) {
      result.add(file)
    }

    for (const file of block.css || []) {
      result.add(file)
    }
  }

  for (const block of manifest.web_accessible_resources || []) {
    for (const file of block.resources || []) {
      result.add(file)
    }
  }

  return result
}

export function assertAllowlistMatchesManifest(manifest) {
  const referenced = runtimeFilesFromManifest(manifest)
  const allowlisted = new Set([
    ...SHARED_RUNTIME_FILES,
    ...CHROME_ONLY_FILES,
  ])

  const missing = [...referenced].filter((file) => !allowlisted.has(file))
  const extra = [...allowlisted].filter((file) => !referenced.has(file))

  if (missing.length > 0 || extra.length > 0) {
    const details = [
      ...missing.map((file) => `  - referenciado no manifest mas ausente na allowlist: ${file}`),
      ...extra.map((file) => `  - presente na allowlist mas ausente no manifest: ${file}`),
    ].join('\n')

    throw new Error(
      `Allowlist de empacotamento desalinhada com manifest.json:\n${details}\nAtualize scripts/build-package.mjs antes de gerar o pacote.`,
    )
  }
}

function ensureFileExists(file) {
  const absolute = join(EXTENSION_ROOT, file)

  if (!existsSync(absolute)) {
    throw new Error(`Arquivo obrigatório do pacote não encontrado: ${file}`)
  }
}

function copyRuntimeFile(file, destinationRoot) {
  const source = join(EXTENSION_ROOT, file)
  const destination = join(destinationRoot, file)

  mkdirSync(dirname(destination), { recursive: true })
  copyFileSync(source, destination)
  utimesSync(destination, REPRODUCIBLE_MTIME, REPRODUCIBLE_MTIME)
}

function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  utimesSync(file, REPRODUCIBLE_MTIME, REPRODUCIBLE_MTIME)
}

function sha256(file) {
  const hash = createHash('sha256')
  hash.update(readFileSync(file))
  return hash.digest('hex')
}

export function zipFileName(targetName, environment, version) {
  const prodSuffix = environment === 'prod' ? '-prod' : ''
  return `yolen-companion-${targetName}${prodSuffix}-v${version}.zip`
}

function buildTarget({ targetName, environment, sourceManifest }) {
  const target = TARGETS[targetName]
  const manifest = environment === 'prod'
    ? toProductionManifest(sourceManifest, targetName)
    : target.adaptManifest(sourceManifest)

  const workingRoot = join(OUTPUT_ROOT, '_work', `${targetName}-${environment}`)
  rmSync(workingRoot, { recursive: true, force: true })
  mkdirSync(workingRoot, { recursive: true })

  for (const file of target.files) {
    ensureFileExists(file)
    copyRuntimeFile(file, workingRoot)
  }

  if (environment === 'prod') {
    const sourceIcon = readFileSync(join(EXTENSION_ROOT, 'assets', 'yolen-mark.png'))

    for (const size of ICON_SIZES) {
      const iconPath = join(workingRoot, 'assets', 'icons', `icon-${size}.png`)
      mkdirSync(dirname(iconPath), { recursive: true })
      writeFileSync(iconPath, resizePngSquare(sourceIcon, size))
      utimesSync(iconPath, REPRODUCIBLE_MTIME, REPRODUCIBLE_MTIME)
    }
  }

  writeJson(join(workingRoot, 'manifest.json'), manifest)

  const zipName = zipFileName(targetName, environment, sourceManifest.version)
  const zipPath = join(OUTPUT_ROOT, zipName)
  rmSync(zipPath, { force: true })

  execFileSync('zip', ['-X', '-q', '-r', zipPath, '.'], {
    cwd: workingRoot,
    stdio: 'inherit',
  })

  return {
    target: targetName,
    environment,
    zip: zipName,
    sha256: sha256(zipPath),
  }
}

export function buildAll() {
  const sourceManifest = readSourceManifest()
  assertAllowlistMatchesManifest(sourceManifest)

  rmSync(OUTPUT_ROOT, { recursive: true, force: true })
  mkdirSync(OUTPUT_ROOT, { recursive: true })

  const results = []

  for (const targetName of Object.keys(TARGETS)) {
    for (const environment of ['dev', 'prod']) {
      results.push(
        buildTarget({
          targetName,
          environment,
          sourceManifest,
        }),
      )
    }
  }

  writeJson(join(OUTPUT_ROOT, 'build-summary.json'), {
    extension_version: sourceManifest.version,
    generated_at: new Date().toISOString(),
    results,
  })

  rmSync(join(OUTPUT_ROOT, '_work'), { recursive: true, force: true })

  return results
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const results = buildAll()

  for (const result of results) {
    console.log(
      `${result.target}/${result.environment}: ${result.zip} (${result.sha256})`,
    )
  }
}
