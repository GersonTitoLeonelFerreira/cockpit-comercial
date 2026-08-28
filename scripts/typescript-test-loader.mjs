import { readFile } from 'node:fs/promises'

import ts from 'typescript'

function isModuleNotFoundError(error) {
  return (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'ERR_MODULE_NOT_FOUND'
  )
}

async function resolveCandidates(
  candidates,
  context,
  nextResolve,
) {
  let lastError = null

  for (const candidate of candidates) {
    try {
      return await nextResolve(
        candidate,
        context,
      )
    } catch (candidateError) {
      if (
        !isModuleNotFoundError(
          candidateError,
        )
      ) {
        throw candidateError
      }
      lastError = candidateError
    }
  }

  throw lastError
}

export async function resolve(
  specifier,
  context,
  nextResolve,
) {
  if (specifier.startsWith('@/')) {
    const projectRelative = specifier.slice(2)
    const baseUrl = new URL(
      `../${projectRelative}`,
      import.meta.url,
    ).href
    const alreadyHasExtension =
      /\.[a-z0-9]+$/i.test(specifier)

    const candidates = alreadyHasExtension
      ? [baseUrl]
      : [
          `${baseUrl}.ts`,
          `${baseUrl}.tsx`,
          `${baseUrl}/index.ts`,
          `${baseUrl}/index.tsx`,
        ]

    return resolveCandidates(
      candidates,
      context,
      nextResolve,
    )
  }

  try {
    return await nextResolve(
      specifier,
      context,
    )
  } catch (error) {
    const isRelativeOrFileSpecifier =
      specifier.startsWith('./') ||
      specifier.startsWith('../') ||
      specifier.startsWith('file:')

    const alreadyHasExtension =
      /\.[a-z0-9]+$/i.test(
        specifier,
      )

    if (
      !isModuleNotFoundError(error) ||
      !isRelativeOrFileSpecifier ||
      alreadyHasExtension
    ) {
      throw error
    }

    const candidates = [
      `${specifier}.ts`,
      `${specifier}.tsx`,
      `${specifier}/index.ts`,
      `${specifier}/index.tsx`,
    ]

    return resolveCandidates(
      candidates,
      context,
      nextResolve,
    )
  }
}

export async function load(
  url,
  context,
  nextLoad,
) {
  if (
    !url.endsWith('.ts') &&
    !url.endsWith('.tsx')
  ) {
    return nextLoad(url, context)
  }

  const source = await readFile(
    new URL(url),
    'utf8',
  )

  const result = ts.transpileModule(
    source,
    {
      fileName: new URL(url).pathname,
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        verbatimModuleSyntax: true,
      },
    },
  )

  return {
    format: 'module',
    shortCircuit: true,
    source: result.outputText,
  }
}
