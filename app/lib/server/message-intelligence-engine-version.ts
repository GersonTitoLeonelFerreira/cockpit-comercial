import 'server-only'

// ============================================================================
// Message Intelligence Engine — seleção de versão (backward-safe)
//
// Default é sempre V1. V2 só é selecionado quando MESSAGE_INTELLIGENCE_ENGINE_VERSION
// estiver explicitamente definida como "v2". Qualquer outro valor (ausente,
// vazio, desconhecido) permanece V1 — nenhuma empresa entra em V2 por
// acidente, e nada aqui altera env do Vercel.
// ============================================================================

export const MESSAGE_INTELLIGENCE_ENGINE_VERSIONS = [
  'v1',
  'v2',
] as const

export type MessageIntelligenceEngineVersion =
  (typeof MESSAGE_INTELLIGENCE_ENGINE_VERSIONS)[number]

export function resolveMessageIntelligenceEngineVersion(
  env: Readonly<
    Record<string, string | undefined>
  > = process.env,
): MessageIntelligenceEngineVersion {
  const raw =
    env.MESSAGE_INTELLIGENCE_ENGINE_VERSION
      ?.trim()
      .toLowerCase()

  return raw === 'v2' ? 'v2' : 'v1'
}
