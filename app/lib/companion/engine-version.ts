export const COMPANION_ENGINE_VERSIONS = ['v1', 'v2'] as const

export type CompanionEngineVersion =
  (typeof COMPANION_ENGINE_VERSIONS)[number]

const DEFAULT_COMPANION_ENGINE_VERSION: CompanionEngineVersion = 'v1'

export function resolveCompanionEngineVersion(
  configuredVersion = process.env.COMPANION_ENGINE_VERSION,
): CompanionEngineVersion {
  const normalizedVersion = configuredVersion
    ?.trim()
    .toLowerCase()

  if (!normalizedVersion) {
    return DEFAULT_COMPANION_ENGINE_VERSION
  }

  if (
    normalizedVersion === 'v1' ||
    normalizedVersion === 'v2'
  ) {
    return normalizedVersion
  }

  throw new Error(
    `COMPANION_ENGINE_VERSION inválida: "${configuredVersion}". Use "v1" ou "v2".`,
  )
}
