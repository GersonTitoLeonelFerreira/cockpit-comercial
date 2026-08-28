// Hook de resolução ESM usado SOMENTE pelos testes de rota da E2
// (app/api/companion/create-lead, resolve-lead, message-action,
// transcribe-audio). Não é carregado pela suíte padrão do Companion nem
// por nenhum outro teste — é registrado explicitamente, via
// `node:module`'s `register()`, dentro de cada arquivo de teste que
// precisa importar um `route.ts` de verdade.
//
// Resolve três casos que o loader compartilhado (scripts/typescript-test-loader.mjs)
// não cobre, porque nenhum teste existente antes da E2 importava um
// `route.ts` (que usa `next/server`/`next/headers`) nem um import de
// VALOR (não-tipo) a partir do alias `@/...`:
//   1. `next/server` (specifier "bare", sem extensão) -> `next/server.js`
//      (o pacote não declara "exports" no package.json, então a
//      resolução ESM padrão não tenta adicionar a extensão sozinha).
//   2. `next/headers` (mesmo motivo) -> `next/headers.js` — usado por
//      rotas com autenticação via cookie (ex.: app/api/ai/apply-suggestion).
//   3. `@/<caminho>` -> arquivo real em `<raiz-do-repo>/<caminho>`,
//      espelhando o alias `paths: {"@/*": ["./*"]}` do tsconfig.json,
//      com a mesma tentativa de extensão (.ts/.tsx/index.ts/index.tsx)
//      já usada pelo loader compartilhado para especificadores relativos.

import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

const EXTENSION_CANDIDATES = ['.ts', '.tsx', '/index.ts', '/index.tsx']

function resolveAliasPath(aliasPath) {
  const withoutPrefix = aliasPath.slice('@/'.length)
  const basePath = `${REPO_ROOT}${withoutPrefix}`

  if (existsSync(basePath)) {
    return basePath
  }

  for (const suffix of EXTENSION_CANDIDATES) {
    const candidate = `${basePath}${suffix}`

    if (existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

function normalizeAliasSpecifier(specifier) {
  if (specifier.startsWith('@/')) {
    return specifier
  }

  if (specifier.startsWith('file:')) {
    try {
      const url = new URL(specifier)
      const marker = '/@/'
      const markerIndex = url.pathname.indexOf(marker)

      if (markerIndex !== -1) {
        return `@/${url.pathname.slice(
          markerIndex + marker.length,
        )}`
      }
    } catch {
      return null
    }
  }

  return null
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'next/server') {
    return nextResolve('next/server.js', context)
  }

  if (specifier === 'next/headers') {
    return nextResolve('next/headers.js', context)
  }

  const aliasSpecifier =
    normalizeAliasSpecifier(specifier)

  if (aliasSpecifier) {
    const resolvedPath =
      resolveAliasPath(aliasSpecifier)

    if (resolvedPath) {
      return {
        url: pathToFileURL(resolvedPath).href,
        shortCircuit: true,
      }
    }
  }

  return nextResolve(specifier, context)
}
