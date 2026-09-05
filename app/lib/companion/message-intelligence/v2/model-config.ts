// ============================================================================
// Message Intelligence Engine V2 — Model configuration
//
// Qualidade do modelo é requisito funcional desta arquitetura. Preferência
// explícita: OPENAI_MESSAGE_INTELLIGENCE_MODEL. Fallback somente para
// OPENAI_STATEFUL_COMMUNICATION_MODEL, que já foi auditado como configurado
// intencionalmente para comunicação generativa (stateful-communication-*).
// Nunca cai silenciosamente no default histórico gpt-4.1-mini do provider
// stateful — se nenhum dos dois estiver configurado, V2 falha de forma
// segura (config_not_ready) e o caminho chamador cai para o fallback
// existente.
// ============================================================================

type MessageIntelligenceV2ModelEnv =
  Readonly<
    Record<string, string | undefined>
  >

export type MessageIntelligenceV2ModelSource =
  | 'message_intelligence_env'
  | 'communication_env_reused'

export type MessageIntelligenceV2ModelConfig =
  | {
      status: 'ready'
      model: string
      source:
        MessageIntelligenceV2ModelSource
    }
  | {
      status: 'not_ready'
      reason: string
    }

function normalizeOptionalString(
  value: unknown,
): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()

  return normalized || null
}

export function resolveMessageIntelligenceV2ModelConfig(
  env: MessageIntelligenceV2ModelEnv =
    process.env,
): MessageIntelligenceV2ModelConfig {
  const explicitModel =
    normalizeOptionalString(
      env.OPENAI_MESSAGE_INTELLIGENCE_MODEL,
    )

  if (explicitModel) {
    return {
      status: 'ready',
      model: explicitModel,
      source: 'message_intelligence_env',
    }
  }

  const communicationModel =
    normalizeOptionalString(
      env.OPENAI_STATEFUL_COMMUNICATION_MODEL,
    )

  if (communicationModel) {
    return {
      status: 'ready',
      model: communicationModel,
      source: 'communication_env_reused',
    }
  }

  return {
    status: 'not_ready',
    reason:
      'Nenhum modelo adequado está configurado para o MIE V2 (OPENAI_MESSAGE_INTELLIGENCE_MODEL ou OPENAI_STATEFUL_COMMUNICATION_MODEL).',
  }
}
