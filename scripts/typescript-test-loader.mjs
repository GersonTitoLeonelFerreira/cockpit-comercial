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

export async function resolve(
  specifier,
  context,
  nextResolve,
) {
  try {
    return await nextResolve(
      specifier,
      context,
    )
  } catch (error) {
    const isRelativeSpecifier =
      specifier.startsWith('./') ||
      specifier.startsWith('../')

    const alreadyHasExtension =
      /\.[a-z0-9]+$/i.test(
        specifier,
      )

    if (
      !isModuleNotFoundError(error) ||
      !isRelativeSpecifier ||
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
      }
    }

    throw error
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
