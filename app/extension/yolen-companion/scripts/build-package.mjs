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

// Hosts que a extensão de fato precisa em produção. Qualquer host que não
// esteja nesta lista é, por definição, algo que não deveria sobreviver à
// transformação DEV → PROD (hoje, isso é só o host de desenvolvimento
// local, mas a lista existe para que a checagem seja "allowlist de hosts
// de produção", não apenas "blocklist de localhost").
export const PRODUCTION_HOSTS = [
  'https://web.whatsapp.com/*',
  'https://cockpit-comercial-vocn.vercel.app/*',
]

const DEV_HOST_PATTERN = /localhost/i

function isDevHost(entry) {
  return typeof entry === 'string' && DEV_HOST_PATTERN.test(entry)
}

// Remove o host de desenvolvimento de TODOS os campos do manifest onde ele
// aparece — não só de `host_permissions`. Isso é verificado de novo, de
// forma independente, em `assertNoDevHostsRemain` logo abaixo, e outra vez
// pelo validador de Release Candidate (D2/D3), varrendo o texto inteiro do
// manifest gerado.
function stripDevHosts(manifest) {
  const clone = structuredClone(manifest)

  if (Array.isArray(clone.host_permissions)) {
    clone.host_permissions = clone.host_permissions.filter((host) => !isDevHost(host))
  }

  for (const block of clone.content_scripts ?? []) {
    if (Array.isArray(block.matches)) {
      block.matches = block.matches.filter((host) => !isDevHost(host))
    }
  }

  for (const block of clone.web_accessible_resources ?? []) {
    if (Array.isArray(block.matches)) {
      block.matches = block.matches.filter((host) => !isDevHost(host))
    }
  }

  return clone
}

// Rede de segurança: depois de tirar os hosts de dev, (1) nenhum campo de
// match pode ter ficado vazio (um bloco de content_script/recurso sem
// nenhum host vira código morto, silenciosamente quebrado) e (2) a string
// "localhost" não pode sobrar em NENHUM lugar do manifest — nem em campos
// que hoje não existem mas alguém possa adicionar no futuro sem atualizar
// este transformador.
function assertNoDevHostsRemain(manifest) {
  for (const block of manifest.content_scripts ?? []) {
    if (Array.isArray(block.matches) && block.matches.length === 0) {
      throw new Error('Transformação PROD deixou um bloco de content_scripts sem nenhum host — matches vazio.')
    }
  }
  for (const block of manifest.web_accessible_resources ?? []) {
    if (Array.isArray(block.matches) && block.matches.length === 0) {
      throw new Error('Transformação PROD deixou um bloco de web_accessible_resources sem nenhum host — matches vazio.')
    }
  }
  if (DEV_HOST_PATTERN.test(JSON.stringify(manifest))) {
    throw new Error('Transformação PROD falhou: "localhost" ainda aparece em algum lugar do manifest gerado.')
  }
}

// `icons` do manifest final aponta para os PNGs que `stageIcons` já
// escreve em `assets/icons/` — mesmos arquivos usados pelo pacote DEV,
// só que agora referenciados de fato pelo manifest.
function withProductionIcons(manifest) {
  const clone = structuredClone(manifest)
  clone.icons = Object.fromEntries(ICON_SIZES.map((size) => [String(size), `assets/icons/icon-${size}.png`]))
  return clone
}

// Primeira versão do Firefox com suporte estável (fora de flag) a
// Manifest V3 — `content_scripts`, `host_permissions`,
// `web_accessible_resources` no formato de objeto (resources + matches) e
// `background.scripts` como event page não persistente. Nenhuma API usada
// por este manifest (permissions: ["storage"], os campos acima) exige uma
// versão mais nova do que essa. https://www.mozilla.org/en-US/firefox/109.0/releasenotes/
export const FIREFOX_STRICT_MIN_VERSION = '109.0'

// Transformação determinística DEV → PROD. `manifest.json` (a fonte de
// desenvolvimento) nunca é editado — esta função sempre recebe o manifest
// de origem e devolve um manifest NOVO, específico do navegador e pronto
// para distribuição oficial. É a única fonte de verdade sobre "o que muda
// entre DEV e PROD"; o validador de Release Candidate importa esta mesma
// função em vez de reimplementar a transformação.
export function toProductionManifest(sourceManifest, targetName) {
  const target = TARGETS[targetName]
  if (!target) {
    throw new Error(`Alvo de empacotamento desconhecido: ${targetName}`)
  }

  let manifest = stripDevHosts(sourceManifest)
  manifest = withProductionIcons(manifest)
  manifest = target.adaptManifest(manifest)

  if (targetName === 'chrome') {
    // browser_specific_settings é específico de Gecko/Safari — não faz
    // sentido carregar isso num pacote Chrome de produção.
    delete manifest.browser_specific_settings
  } else if (targetName === 'firefox') {
    manifest.browser_specific_settings = {
      ...manifest.browser_specific_settings,
      gecko: {
        ...manifest.browser_specific_settings?.gecko,
        strict_min_version: FIREFOX_STRICT_MIN_VERSION,
      },
    }
  }

  assertNoDevHostsRemain(manifest)
  return manifest
}

export function readSourceManifest() {
  const raw = readFileSync(join(EXTENSION_ROOT, 'manifest.json'), 'utf8')
  return JSON.parse(raw)
}

// Verificação de deriva: garante que a allowlist acima continua cobrindo
// exatamente os arquivos que o manifest.json de origem referencia. Se
// alguém adicionar um novo arquivo ao manifest sem atualizar este script
// (ou vice-versa), o build falha alto em vez de gerar um pacote incompleto
// silenciosamente.
export function assertAllowlistMatchesManifest(manifest) {
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

export function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

// Lista (ordenada, determinística) de entradas que um pacote de `targetName`
// deve conter. Única fonte de verdade para "o que entra no zip" — usada
// tanto pelo build quanto pelo validador de Release Candidate (D2), para
// que os dois nunca divirjam sobre o conjunto esperado de arquivos.
export function getTargetZipEntries(targetName) {
  const target = TARGETS[targetName]
  if (!target) {
    throw new Error(`Alvo de empacotamento desconhecido: ${targetName}`)
  }
  return [
    'manifest.json',
    ...target.files,
    ...ICON_SIZES.map((size) => `assets/icons/icon-${size}.png`),
  ].sort()
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

export const ENVIRONMENTS = ['dev', 'prod']

export function zipFileName(targetName, environment, version) {
  return environment === 'prod'
    ? `yolen-companion-${targetName}-prod-v${version}.zip`
    : `yolen-companion-${targetName}-v${version}.zip`
}

function buildTarget(targetName, environment, sourceManifest) {
  const target = TARGETS[targetName]
  const stagingDir =
    environment === 'prod'
      ? join(OUTPUT_ROOT, targetName, 'prod', 'staging')
      : join(OUTPUT_ROOT, targetName, 'staging')
  rmSync(stagingDir, { recursive: true, force: true })
  mkdirSync(stagingDir, { recursive: true })

  const sortedFiles = [...target.files].sort()
  for (const relativePath of sortedFiles) {
    stageFile(relativePath, stagingDir)
  }

  stageIcons(stagingDir)

  const manifest =
    environment === 'prod' ? toProductionManifest(sourceManifest, targetName) : target.adaptManifest(sourceManifest)
  stageManifest(manifest, stagingDir)

  const zipEntries = getTargetZipEntries(targetName)

  const zipPath = join(OUTPUT_ROOT, zipFileName(targetName, environment, sourceManifest.version))
  createZip(stagingDir, zipPath, zipEntries)

  return {
    target: targetName,
    environment,
    zipPath,
    sha256: sha256(zipPath),
    entries: zipEntries,
  }
}

function main() {
  const sourceManifest = readSourceManifest()
  assertAllowlistMatchesManifest(sourceManifest)

  mkdirSync(OUTPUT_ROOT, { recursive: true })

  const results = Object.keys(TARGETS).flatMap((targetName) =>
    ENVIRONMENTS.map((environment) => buildTarget(targetName, environment, sourceManifest)),
  )

  const summary = {
    version: sourceManifest.version,
    generatedAt: new Date().toISOString(),
    note:
      'Pacotes "dev" ainda são internos/dev (incluem localhost:3000, sem icons vinculados no manifest). ' +
      'Pacotes "prod" (D3) removem todo host de desenvolvimento e vinculam os ícones gerados, mas isso NÃO ' +
      'significa aprovação de loja — ver dist/yolen-companion/release-candidate-report.json.',
    packages: results.map(({ target, environment, zipPath, sha256: hash, entries }) => ({
      target,
      environment,
      zipPath: zipPath.replace(`${REPO_ROOT}/`, ''),
      sha256: hash,
      fileCount: entries.length,
      entries,
    })),
  }

  writeFileSync(join(OUTPUT_ROOT, 'build-summary.json'), `${JSON.stringify(summary, null, 2)}\n`)

  for (const pkg of summary.packages) {
    console.log(`\n[${pkg.target}/${pkg.environment}] ${pkg.zipPath}`)
    console.log(`  sha256: ${pkg.sha256}`)
    console.log(`  arquivos (${pkg.fileCount}):`)
    for (const entry of pkg.entries) {
      console.log(`    - ${entry}`)
    }
  }

  console.log(`\nResumo escrito em: ${join(OUTPUT_ROOT, 'build-summary.json').replace(`${REPO_ROOT}/`, '')}`)
}

// Só executa o build quando o arquivo é rodado diretamente (`node
// build-package.mjs`). Isso permite que outros scripts (como o validador de
// Release Candidate do D2) importem os helpers acima sem disparar um build
// como efeito colateral do import.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}
