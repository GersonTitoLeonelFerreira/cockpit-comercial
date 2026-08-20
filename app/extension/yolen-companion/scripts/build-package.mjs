#!/usr/bin/env node
// Empacotamento reproduzível do Yolen Companion para Chrome e Firefox.
//
// Escopo (D1 — Fundação isolada de Release Engineering):
//   - Copia, a partir de uma allowlist EXPLÍCITA, somente os arquivos que o
//     manifest.json já declara como necessários em runtime.
//   - Nunca faz `cp -r`/glob da pasta da extensão: `tests/`, arquivos locais,
//     `.env` e qualquer artefato temporário são estruturalmente impossíveis
//     de entrar no pacote, porque nunca são lidos por este script.
//   - Gera duas saídas (Chrome e Firefox), cada uma com o `background`
//     adaptado para o motor de extensão correspondente. Nenhum outro campo
//     do manifest é alterado nesta fase.
//   - Gera os tamanhos de ícone (16/32/48/128) a partir do
//     assets/yolen-mark.png existente, sem redesenhar a identidade visual.
//     Os ícones ficam disponíveis em `assets/icons/` dentro do pacote, mas
//     NÃO são referenciados no manifest.json ainda — ligar `icons` ao
//     manifest é trabalho do D3 (junto da separação definitiva de host de
//     desenvolvimento).
//   - O pacote gerado aqui ainda inclui `http://localhost:3000/*` (herdado
//     do manifest.json de desenvolvimento) — ver README.md, seção
//     "Status do pacote (D1 = interno/dev)".
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

const EXTENSION_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const REPO_ROOT = join(EXTENSION_ROOT, '..', '..', '..')
const OUTPUT_ROOT = join(REPO_ROOT, 'dist', 'yolen-companion')

// Timestamp fixo aplicado a todos os arquivos do pacote antes de zipar, para
// que o mesmo conteúdo sempre produza os mesmos bytes de saída,
// independentemente de quando o build rodou.
const REPRODUCIBLE_MTIME = new Date('2020-01-01T00:00:00Z')

const ICON_SIZES = [16, 32, 48, 128]

// Allowlist explícita: todo arquivo compartilhado pelos dois pacotes.
// Cada entrada aqui corresponde a um arquivo que o manifest.json de
// desenvolvimento já declara em content_scripts, web_accessible_resources
// ou background. Nada é incluído "por estar na pasta".
const SHARED_RUNTIME_FILES = [
  'assets/yolen-mark.png',
  'src/background.js',
  'src/capture-batch.js',
  'src/capture-resilience-null-base.js',
  'src/capture-resilience.js',
  'src/capture-transport.js',
  'src/content-script.js',
  'src/lead-automation.css',
  'src/lead-automation.js',
  'src/lead-enrichment.js',
  'src/message-mutations.js',
  'src/styles.css',
  'src/whatsapp-audio-bridge.js',
  'src/yolen-api.js',
  'src/yolen-bridge.js',
  'src/yolen-page-bridge.js',
]

// Só é necessário no pacote Chrome: é o arquivo referenciado por
// background.service_worker (que por sua vez faz importScripts dos dois
// arquivos de background já listados acima).
const CHROME_ONLY_FILES = ['src/background-service-worker.js']

const TARGETS = {
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

function readSourceManifest() {
  const raw = readFileSync(join(EXTENSION_ROOT, 'manifest.json'), 'utf8')
  return JSON.parse(raw)
}

// Verificação de deriva: garante que a allowlist acima continua cobrindo
// exatamente os arquivos que o manifest.json de origem referencia. Se
// alguém adicionar um novo arquivo ao manifest sem atualizar este script
// (ou vice-versa), o build falha alto em vez de gerar um pacote incompleto
// silenciosamente.
function assertAllowlistMatchesManifest(manifest) {
  const referenced = new Set()

  for (const script of manifest.background?.scripts ?? []) referenced.add(script)
  if (manifest.background?.service_worker) referenced.add(manifest.background.service_worker)

  for (const block of manifest.content_scripts ?? []) {
    for (const js of block.js ?? []) referenced.add(js)
    for (const css of block.css ?? []) referenced.add(css)
  }

  for (const block of manifest.web_accessible_resources ?? []) {
    for (const resource of block.resources ?? []) referenced.add(resource)
  }

  const allowlisted = new Set([...SHARED_RUNTIME_FILES, ...CHROME_ONLY_FILES])

  const missingFromAllowlist = [...referenced].filter((file) => !allowlisted.has(file))
  const staleInAllowlist = [...allowlisted].filter((file) => !referenced.has(file))

  if (missingFromAllowlist.length > 0 || staleInAllowlist.length > 0) {
    const lines = ['Allowlist de empacotamento desalinhada com manifest.json:']
    if (missingFromAllowlist.length > 0) {
      lines.push(`  - referenciado no manifest mas ausente na allowlist: ${missingFromAllowlist.join(', ')}`)
    }
    if (staleInAllowlist.length > 0) {
      lines.push(`  - presente na allowlist mas não referenciado no manifest: ${staleInAllowlist.join(', ')}`)
    }
    lines.push('Atualize scripts/build-package.mjs antes de gerar o pacote.')
    throw new Error(lines.join('\n'))
  }
}

function stageFile(relativePath, stagingDir) {
  const source = join(EXTENSION_ROOT, relativePath)
  if (!existsSync(source)) {
    throw new Error(`Arquivo da allowlist não existe: ${relativePath}`)
  }
  const destination = join(stagingDir, relativePath)
  mkdirSync(dirname(destination), { recursive: true })
  copyFileSync(source, destination)
  utimesSync(destination, REPRODUCIBLE_MTIME, REPRODUCIBLE_MTIME)
}

function stageIcons(stagingDir) {
  const sourceIcon = readFileSync(join(EXTENSION_ROOT, 'assets', 'yolen-mark.png'))
  const iconsDir = join(stagingDir, 'assets', 'icons')
  mkdirSync(iconsDir, { recursive: true })

  for (const size of ICON_SIZES) {
    const resized = resizePngSquare(sourceIcon, size)
    const destination = join(iconsDir, `icon-${size}.png`)
    writeFileSync(destination, resized)
    utimesSync(destination, REPRODUCIBLE_MTIME, REPRODUCIBLE_MTIME)
  }
}

function stageManifest(manifest, stagingDir) {
  const destination = join(stagingDir, 'manifest.json')
  writeFileSync(destination, `${JSON.stringify(manifest, null, 2)}\n`)
  utimesSync(destination, REPRODUCIBLE_MTIME, REPRODUCIBLE_MTIME)
}

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

function createZip(stagingDir, zipPath, entries) {
  rmSync(zipPath, { force: true })
  mkdirSync(dirname(zipPath), { recursive: true })

  // -X: descarta atributos extras (uid/gid, timestamps estendidos).
  // -D: não cria entradas de diretório.
  // Lista de arquivos ordenada explicitamente para uma ordem determinística
  // dentro do zip, independente do sistema operacional.
  execFileSync('zip', ['-X', '-D', '-q', zipPath, ...entries], { cwd: stagingDir })
}

function buildTarget(targetName, sourceManifest) {
  const target = TARGETS[targetName]
  const stagingDir = join(OUTPUT_ROOT, targetName, 'staging')
  rmSync(stagingDir, { recursive: true, force: true })
  mkdirSync(stagingDir, { recursive: true })

  const sortedFiles = [...target.files].sort()
  for (const relativePath of sortedFiles) {
    stageFile(relativePath, stagingDir)
  }

  stageIcons(stagingDir)

  const adaptedManifest = target.adaptManifest(sourceManifest)
  stageManifest(adaptedManifest, stagingDir)

  const zipEntries = [
    'manifest.json',
    ...sortedFiles,
    ...ICON_SIZES.map((size) => `assets/icons/icon-${size}.png`),
  ].sort()

  const zipPath = join(
    OUTPUT_ROOT,
    `yolen-companion-${targetName}-v${sourceManifest.version}.zip`,
  )
  createZip(stagingDir, zipPath, zipEntries)

  return {
    target: targetName,
    zipPath,
    sha256: sha256(zipPath),
    entries: zipEntries,
  }
}

function main() {
  const sourceManifest = readSourceManifest()
  assertAllowlistMatchesManifest(sourceManifest)

  mkdirSync(OUTPUT_ROOT, { recursive: true })

  const results = Object.keys(TARGETS).map((targetName) => buildTarget(targetName, sourceManifest))

  const summary = {
    version: sourceManifest.version,
    generatedAt: new Date().toISOString(),
    note: 'Pacote D1 — ainda interno/dev (inclui host de desenvolvimento localhost:3000; separação definitiva é escopo do D3).',
    packages: results.map(({ target, zipPath, sha256: hash, entries }) => ({
      target,
      zipPath: zipPath.replace(`${REPO_ROOT}/`, ''),
      sha256: hash,
      fileCount: entries.length,
      entries,
    })),
  }

  writeFileSync(join(OUTPUT_ROOT, 'build-summary.json'), `${JSON.stringify(summary, null, 2)}\n`)

  for (const pkg of summary.packages) {
    console.log(`\n[${pkg.target}] ${pkg.zipPath}`)
    console.log(`  sha256: ${pkg.sha256}`)
    console.log(`  arquivos (${pkg.fileCount}):`)
    for (const entry of pkg.entries) {
      console.log(`    - ${entry}`)
    }
  }

  console.log(`\nResumo escrito em: ${join(OUTPUT_ROOT, 'build-summary.json').replace(`${REPO_ROOT}/`, '')}`)
}

main()
