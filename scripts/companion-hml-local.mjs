#!/usr/bin/env node
// Build local da extensão HML (com ManyChat) para carregar no Firefox.
//
//   npm run companion:hml-local
//
// 1. Roda o build --homolog-manychat com YOLEN_COMPANION_HOMOLOG_BASE_URL
//    (padrão: o preview da branch claude/companion-full-reading; a variável
//    de ambiente sobrescreve).
// 2. Apaga yolen-firefox-dev/ e copia o staging inteiro para lá. Cópia
//    completa, nunca sincronização por data/tamanho: o build grava todos os
//    arquivos com a mesma data fixa, então uma sincronização por data
//    deixaria arquivos velhos para trás.
// 3. No fim, imprime o commit gravado em yolen-firefox-dev/src/build-identity.js.

import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_HOMOLOG_BASE_URL =
  'https://cockpit-comercial-vocn-git-claude-companion-full-reading-yolen.vercel.app'

export const TARGET_DIR_NAME = 'yolen-firefox-dev'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function stagingDirFor(repoRoot) {
  return join(repoRoot, 'dist', 'yolen-companion', 'firefox', 'homolog-manychat', 'staging')
}

export function readBuildIdentityCommit(targetDir) {
  const identityPath = join(targetDir, 'src', 'build-identity.js')

  if (!existsSync(identityPath)) {
    return null
  }

  const match = /"commit"\s*:\s*"([0-9a-f]{7,40})"/.exec(readFileSync(identityPath, 'utf8'))

  return match ? match[1] : null
}

function defaultRunBuild({ repoRoot, baseUrl }) {
  const result = spawnSync(
    process.execPath,
    [join(repoRoot, 'app', 'extension', 'yolen-companion', 'scripts', 'build-package.mjs'), '--homolog-manychat'],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        YOLEN_COMPANION_HOMOLOG_BASE_URL: baseUrl,
      },
    },
  )

  if (result.status !== 0) {
    throw new Error(`O build --homolog-manychat falhou (código ${result.status ?? 'desconhecido'}).`)
  }
}

export function runHmlLocal({
  repoRoot = REPO_ROOT,
  env = process.env,
  runBuild = defaultRunBuild,
  log = (line) => console.log(line),
} = {}) {
  const baseUrl = (env.YOLEN_COMPANION_HOMOLOG_BASE_URL || '').trim() || DEFAULT_HOMOLOG_BASE_URL

  log(`Backend HML: ${baseUrl}`)
  runBuild({ repoRoot, baseUrl })

  const stagingDir = stagingDirFor(repoRoot)

  if (!existsSync(stagingDir)) {
    throw new Error(`Staging não encontrado depois do build: ${relative(repoRoot, stagingDir)}`)
  }

  const targetDir = join(repoRoot, TARGET_DIR_NAME)

  // Só apaga exatamente <repo>/yolen-firefox-dev.
  if (basename(targetDir) !== TARGET_DIR_NAME || !targetDir.startsWith(repoRoot + sep)) {
    throw new Error(`Destino inesperado: ${targetDir}`)
  }

  rmSync(targetDir, { recursive: true, force: true })
  cpSync(stagingDir, targetDir, { recursive: true })

  const commit = readBuildIdentityCommit(targetDir)

  log(`Copiado para ${TARGET_DIR_NAME}/ (cópia completa do staging).`)
  log(`Commit gravado em ${TARGET_DIR_NAME}/src/build-identity.js: ${commit ?? 'não encontrado'}`)

  return { baseUrl, commit, targetDir }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runHmlLocal()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
