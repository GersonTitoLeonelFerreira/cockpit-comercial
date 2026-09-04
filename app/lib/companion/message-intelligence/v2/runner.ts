// ============================================================================
// Message Intelligence Engine V2 — LLM-first, evidence-governed generation
// Runner / Orchestrator
//
//   MessageIntelligenceRequestV1 (mesmo contrato do V1)
//     -> Message Context Source Loader (mesmo loader device-independent)
//     -> Context Assembler (mesmo MessageContextSnapshotV1 canônico)
//     -> Execution Plan (prompt + payload estruturado + normalization context)
//     -> Provider OpenAI existente (createStatefulCopilotOpenAIProvider)
//     -> Executor (validação determinística, 1 repair no máximo)
//     -> MessageIntelligenceRunResultV2
//
// V1 continua intacto: este runner não importa nem altera nenhum módulo do
// pipeline V1 (strategy/planner/candidate-generator/hard-gates/critic).
// ============================================================================

import {
  normalizeMessageIntelligenceRequestV1,
  type MessageIntelligenceContextSourceLoaderV1,
} from '../contracts'

import {
  assembleMessageContextSnapshotV1,
} from '../context-assembler'

import type {
  MessageContextSnapshotV1,
} from '../context-snapshot'

import {
  createStatefulCopilotOpenAIProvider,
  type StatefulCopilotOpenAIProviderOptions,
} from '../../stateful-copilot-openai-provider'

import {
  StatefulCopilotExecutionError,
} from '../../stateful-copilot-executor'

import {
  buildMessageIntelligenceV2ExecutionPlan,
} from './execution-plan'

import {
  executeMessageIntelligenceV2Plan,
  MessageIntelligenceV2ExecutionError,
  type MessageIntelligenceV2Execution,
} from './executor'

import type {
  MessageIntelligenceV2Output,
} from './generation-contract'

import {
  resolveMessageIntelligenceV2ModelConfig,
  type MessageIntelligenceV2ModelConfig,
} from './model-config'

export const MESSAGE_INTELLIGENCE_V2_RUNNER_CONTRACT_VERSION =
  'message-intelligence-v2-runner-v1' as const

export const MESSAGE_INTELLIGENCE_V2_RUN_STATUSES = [
  // O modelo concluiu com uma mensagem seller-facing segura e validada.
  'generated',
  // Conclusão válida sem mensagem a surfar (silêncio correto ou
  // orientação interna sem texto ao cliente). Não é erro.
  'no_message',
  // Nenhum modelo adequado está configurado (V2_CONFIG_NOT_READY).
  'config_not_ready',
  // Falha de provedor (auth, permissão, rate limit, timeout,
  // indisponibilidade, refusal) — não reparável por natureza.
  'provider_error',
  // Repair único esgotado e a saída ainda é inválida/insegura.
  'invalid_output',
] as const

export type MessageIntelligenceV2RunStatus =
  (typeof MESSAGE_INTELLIGENCE_V2_RUN_STATUSES)[number]

export type MessageIntelligenceRunResultV2 = {
  contract_version:
    typeof MESSAGE_INTELLIGENCE_V2_RUNNER_CONTRACT_VERSION

  request_id: string
  company_id: string
  cycle_id: string
  conversation_key: string

  snapshot: MessageContextSnapshotV1

  status: MessageIntelligenceV2RunStatus

  output: MessageIntelligenceV2Output | null

  final_message: string | null

  model_config: MessageIntelligenceV2ModelConfig

  execution: MessageIntelligenceV2Execution | null

  safety: {
    automatic_send: false
    automatic_crm_write: false
    automatic_agenda_write: false
    would_surface_message: boolean
  }

  error: {
    code: string
    message: string
    retryable: boolean
  } | null
}

export type MessageIntelligenceV2ProviderOptions =
  Pick<
    StatefulCopilotOpenAIProviderOptions,
    | 'api_key'
    | 'timeout_ms'
    | 'max_output_tokens'
    | 'fetch_impl'
  >

const DEFAULT_V2_TIMEOUT_MS = 45_000
const DEFAULT_V2_MAX_OUTPUT_TOKENS = 1_400

function buildResult({
  request_id,
  company_id,
  cycle_id,
  conversation_key,
  snapshot,
  status,
  output,
  execution,
  model_config,
  error,
}: {
  request_id: string
  company_id: string
  cycle_id: string
  conversation_key: string
  snapshot: MessageContextSnapshotV1
  status: MessageIntelligenceV2RunStatus
  output: MessageIntelligenceV2Output | null
  execution: MessageIntelligenceV2Execution | null
  model_config: MessageIntelligenceV2ModelConfig
  error: {
    code: string
    message: string
    retryable: boolean
  } | null
}): MessageIntelligenceRunResultV2 {
  const finalMessage =
    status === 'generated'
      ? output?.suggested_message ?? null
      : null

  return {
    contract_version:
      MESSAGE_INTELLIGENCE_V2_RUNNER_CONTRACT_VERSION,

    request_id,
    company_id,
    cycle_id,
    conversation_key,

    snapshot,
    status,
    output,
    final_message: finalMessage,

    model_config,
    execution,

    safety: {
      automatic_send: false,
      automatic_crm_write: false,
      automatic_agenda_write: false,
      would_surface_message:
        status === 'generated' &&
        Boolean(finalMessage),
    },

    error,
  }
}

export async function runMessageIntelligenceV2({
  request: rawRequest,
  load_sources,
  provider_options = {},
  env = process.env,
}: {
  request: unknown
  load_sources:
    MessageIntelligenceContextSourceLoaderV1
  provider_options?:
    MessageIntelligenceV2ProviderOptions
  env?: Readonly<
    Record<string, string | undefined>
  >
}): Promise<MessageIntelligenceRunResultV2> {
  const request =
    normalizeMessageIntelligenceRequestV1(
      rawRequest,
    )

  const sources = await load_sources(request)

  const snapshot = assembleMessageContextSnapshotV1({
    request,
    sources,
  })

  const identity = {
    request_id: request.request_id,
    company_id: request.company_id,
    cycle_id: request.cycle_id,
    conversation_key: request.conversation_key,
  }

  const modelConfig =
    resolveMessageIntelligenceV2ModelConfig(env)

  if (modelConfig.status === 'not_ready') {
    return buildResult({
      ...identity,
      snapshot,
      status: 'config_not_ready',
      output: null,
      execution: null,
      model_config: modelConfig,
      error: {
        code: 'V2_CONFIG_NOT_READY',
        message: modelConfig.reason,
        retryable: false,
      },
    })
  }

  const plan =
    buildMessageIntelligenceV2ExecutionPlan({
      snapshot,
    })

  const provider = createStatefulCopilotOpenAIProvider({
    model: modelConfig.model,
    timeout_ms:
      provider_options.timeout_ms ??
      DEFAULT_V2_TIMEOUT_MS,
    max_output_tokens:
      provider_options.max_output_tokens ??
      DEFAULT_V2_MAX_OUTPUT_TOKENS,
    api_key: provider_options.api_key,
    fetch_impl: provider_options.fetch_impl,
  })

  try {
    const result =
      await executeMessageIntelligenceV2Plan({
        plan,
        provider,
      })

    const status: MessageIntelligenceV2RunStatus =
      result.output.intervention_needed &&
      Boolean(result.output.suggested_message)
        ? 'generated'
        : 'no_message'

    return buildResult({
      ...identity,
      snapshot,
      status,
      output: result.output,
      execution: result.execution,
      model_config: modelConfig,
      error: null,
    })
  } catch (error) {
    if (
      error instanceof
      MessageIntelligenceV2ExecutionError
    ) {
      return buildResult({
        ...identity,
        snapshot,
        status: 'invalid_output',
        output: null,
        execution: null,
        model_config: modelConfig,
        error: {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
        },
      })
    }

    if (
      error instanceof
      StatefulCopilotExecutionError
    ) {
      return buildResult({
        ...identity,
        snapshot,
        status: 'provider_error',
        output: null,
        execution: null,
        model_config: modelConfig,
        error: {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
        },
      })
    }

    throw error
  }
}
