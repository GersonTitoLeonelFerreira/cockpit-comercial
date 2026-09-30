// Escolha do motor de IA do Companion.
//
// Todas as chamadas de modelo do Companion (diagnóstico, comunicação,
// orientação do método, mensagem sugerida, resumo do cliente) passam por
// aqui. A estrutura do Companion não muda: os mesmos prompts, contratos e
// normalizadores funcionam com qualquer um dos dois provedores, porque os
// dois implementam a mesma interface (StatefulCopilotProvider).
//
// COMPANION_AI_PROVIDER=anthropic liga o Claude. Sem a variável (ou com
// qualquer outro valor) continua a OpenAI, que é o comportamento atual.
// A transcrição de áudio e o caminho legado V1 não passam por aqui e
// continuam na OpenAI.

import {
  createStatefulCopilotOpenAIProvider,
  type StatefulCopilotOpenAIProviderOptions,
} from './stateful-copilot-openai-provider'

import {
  createStatefulCopilotAnthropicProvider,
  isClaudeModelName,
} from './stateful-copilot-anthropic-provider'

import type {
  StatefulCopilotProvider,
} from './stateful-copilot-executor'

export type CompanionAIProviderName =
  | 'openai'
  | 'anthropic'

type EnvLike =
  Record<string, string | undefined>

export function resolveCompanionAIProviderName(
  env: EnvLike = process.env,
): CompanionAIProviderName {
  const configured =
    env.COMPANION_AI_PROVIDER?.trim().toLowerCase()

  return configured === 'anthropic' || configured === 'claude'
    ? 'anthropic'
    : 'openai'
}

// Mesma assinatura da fábrica da OpenAI, para caber em todos os pontos que
// já a usavam. Com o Claude ligado, a chave e os nomes de modelo da OpenAI
// são ignorados (o Claude usa ANTHROPIC_API_KEY e os modelos próprios);
// prazo e limite de saída continuam valendo.
export function createCompanionAIProvider(
  options: StatefulCopilotOpenAIProviderOptions = {},
): StatefulCopilotProvider {
  if (resolveCompanionAIProviderName() !== 'anthropic') {
    return createStatefulCopilotOpenAIProvider(options)
  }

  return createStatefulCopilotAnthropicProvider({
    ...(isClaudeModelName(options.model)
      ? { model: options.model }
      : {}),

    ...(isClaudeModelName(options.communication_model)
      ? { communication_model: options.communication_model }
      : {}),

    ...(options.timeout_ms !== undefined
      ? { timeout_ms: options.timeout_ms }
      : {}),

    ...(options.max_output_tokens !== undefined
      ? { max_output_tokens: options.max_output_tokens }
      : {}),

    ...(options.fetch_impl
      ? { fetch_impl: options.fetch_impl }
      : {}),
  })
}
