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
//     -> Semantic Critic (quando há mensagem a avaliar): pass finaliza,
//        repair consome o ÚNICO orçamento de regeneração compartilhado com
//        o repair determinístico, block encerra sem regenerar.
//     -> MessageIntelligenceRunResultV2
//
// Orçamento total de geração da mensagem primária: NO MÁXIMO 2 chamadas
// (original + 1 repair, seja o repair disparado por falha determinística
// OU pelo veredito do critic — nunca os dois no mesmo run, nunca uma
// terceira geração). O critic roda no máximo 2 vezes (antes e, se houve
// repair, depois dele).
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
  type StatefulCopilotProvider,
} from '../../stateful-copilot-executor'

import {
  buildMessageIntelligenceV2CriticDrivenRepairExecutionPlan,
  buildMessageIntelligenceV2ExecutionPlan,
} from './execution-plan'

import {
  executeMessageIntelligenceV2Plan,
  executeMessageIntelligenceV2SingleAttempt,
  MessageIntelligenceV2ExecutionError,
  type MessageIntelligenceV2Execution,
} from './executor'

import type {
  MessageIntelligenceV2Output,
} from './generation-contract'

import {
  buildMessageIntelligenceV2CriticExecutionPlan,
} from './critic-execution-plan'

import {
  executeMessageIntelligenceV2CriticAttempt,
  MessageIntelligenceV2CriticExecutionError,
  type MessageIntelligenceV2CriticExecution,
  type MessageIntelligenceV2CriticExecutionResult,
} from './critic-executor'

import type {
  MessageIntelligenceV2CriticReasonCode,
  MessageIntelligenceV2CriticVerdict,
} from './critic-contract'

import {
  resolveMessageIntelligenceV2ModelConfig,
  type MessageIntelligenceV2ModelConfig,
} from './model-config'

export const MESSAGE_INTELLIGENCE_V2_RUNNER_CONTRACT_VERSION =
  'message-intelligence-v2-runner-v1' as const

export const MESSAGE_INTELLIGENCE_V2_RUN_STATUSES = [
  // O modelo concluiu com uma mensagem seller-facing segura, validada
  // deterministicamente e aprovada pelo semantic critic.
  'generated',
  // Conclusão válida sem mensagem a surfar (silêncio correto ou
  // orientação interna sem texto ao cliente). Não é erro. O critic nunca
  // roda nesse caso — não há claim customer-facing para revisar.
  'no_message',
  // Nenhum modelo adequado está configurado (V2_CONFIG_NOT_READY).
  'config_not_ready',
  // Falha de provedor (auth, permissão, rate limit, timeout,
  // indisponibilidade, refusal) — não reparável por natureza. Pode vir da
  // geração primária ou do critic.
  'provider_error',
  // Repair único esgotado e a saída ainda é inválida/insegura
  // (determinística) OU o semantic critic bloqueou/não aprovou a
  // candidate reparada OU o critic falhou tecnicamente (nunca surfamos
  // mensagem sem revisão semântica confirmada).
  'invalid_output',
] as const

export type MessageIntelligenceV2RunStatus =
  (typeof MESSAGE_INTELLIGENCE_V2_RUN_STATUSES)[number]

export type MessageIntelligenceV2CriticEvaluation = {
  verdict: MessageIntelligenceV2CriticVerdict
  reason_codes: MessageIntelligenceV2CriticReasonCode[]
  execution: MessageIntelligenceV2CriticExecution
}

export type MessageIntelligenceV2PhaseDurationsMs = {
  primary: number
  critic_first: number | null
  repair: number | null
  critic_second: number | null
}

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

  // null quando o critic nunca chegou a rodar (silêncio, ou falha antes
  // dele). `second` só é preenchido quando um repair acionado pelo critic
  // ocorreu.
  critic: {
    first: MessageIntelligenceV2CriticEvaluation
    second:
      MessageIntelligenceV2CriticEvaluation | null
  } | null

  phase_durations_ms:
    MessageIntelligenceV2PhaseDurationsMs

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
  > & {
    critic_max_output_tokens?: number
  }

const DEFAULT_V2_TIMEOUT_MS = 45_000
const DEFAULT_V2_MAX_OUTPUT_TOKENS = 1_400
const DEFAULT_V2_CRITIC_MAX_OUTPUT_TOKENS = 600

function toCriticEvaluation(
  attempt:
    MessageIntelligenceV2CriticExecutionResult,
): MessageIntelligenceV2CriticEvaluation {
  return {
    verdict: attempt.output.verdict,
    reason_codes: attempt.output.reason_codes,
    execution: attempt.execution,
  }
}

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
  critic,
  phase_durations_ms,
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
  critic: MessageIntelligenceRunResultV2['critic']
  phase_durations_ms:
    MessageIntelligenceV2PhaseDurationsMs
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
    critic,
    phase_durations_ms,

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

function errorFromCaught(
  error: unknown,
): {
  status: 'provider_error' | 'invalid_output'
  error: {
    code: string
    message: string
    retryable: boolean
  }
} {
  if (
    error instanceof
      MessageIntelligenceV2ExecutionError ||
    error instanceof
      MessageIntelligenceV2CriticExecutionError
  ) {
    return {
      status: 'invalid_output',
      error: {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      },
    }
  }

  if (
    error instanceof
    StatefulCopilotExecutionError
  ) {
    return {
      status: 'provider_error',
      error: {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      },
    }
  }

  throw error
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

  const noDurations: MessageIntelligenceV2PhaseDurationsMs =
    {
      primary: 0,
      critic_first: null,
      repair: null,
      critic_second: null,
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
      critic: null,
      phase_durations_ms: noDurations,
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

  const provider: StatefulCopilotProvider =
    createStatefulCopilotOpenAIProvider({
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

  // Provider separado, mesmo modelo (nenhuma env nova de critic — reusa a
  // mesma resolução de modelo da geração primária), com um teto de
  // tokens menor: a saída do critic é pequena por contrato.
  const criticProvider: StatefulCopilotProvider =
    createStatefulCopilotOpenAIProvider({
      model: modelConfig.model,
      timeout_ms:
        provider_options.timeout_ms ??
        DEFAULT_V2_TIMEOUT_MS,
      max_output_tokens:
        provider_options
          .critic_max_output_tokens ??
        DEFAULT_V2_CRITIC_MAX_OUTPUT_TOKENS,
      api_key: provider_options.api_key,
      fetch_impl: provider_options.fetch_impl,
    })

  const phaseDurations: MessageIntelligenceV2PhaseDurationsMs =
    { ...noDurations }

  // -- 1. Geração primária (1 tentativa + repair determinístico interno,
  // no máximo 2 gerações) -----------------------------------------------
  let primaryResult:
    Awaited<
      ReturnType<
        typeof executeMessageIntelligenceV2Plan
      >
    >

  const primaryStartedAt = Date.now()

  try {
    primaryResult =
      await executeMessageIntelligenceV2Plan({
        plan,
        provider,
      })
  } catch (error) {
    phaseDurations.primary =
      Date.now() - primaryStartedAt

    const failure = errorFromCaught(error)

    return buildResult({
      ...identity,
      snapshot,
      status: failure.status,
      output: null,
      execution: null,
      model_config: modelConfig,
      critic: null,
      phase_durations_ms: phaseDurations,
      error: failure.error,
    })
  }

  phaseDurations.primary =
    Date.now() - primaryStartedAt

  // -- 2. Silêncio válido não precisa de revisão semântica — não há
  // nenhuma claim customer-facing para avaliar. -------------------------
  if (
    !primaryResult.output
      .intervention_needed ||
    !primaryResult.output.suggested_message
  ) {
    return buildResult({
      ...identity,
      snapshot,
      status: 'no_message',
      output: primaryResult.output,
      execution: primaryResult.execution,
      model_config: modelConfig,
      critic: null,
      phase_durations_ms: phaseDurations,
      error: null,
    })
  }

  // -- 3. Semantic critic — primeira avaliação --------------------------
  const criticPlan1 =
    buildMessageIntelligenceV2CriticExecutionPlan({
      primaryPlan: plan,
      output: primaryResult.output,
    })

  let criticAttempt1: MessageIntelligenceV2CriticExecutionResult

  const critic1StartedAt = Date.now()

  try {
    criticAttempt1 =
      await executeMessageIntelligenceV2CriticAttempt(
        {
          plan: criticPlan1,
          provider: criticProvider,
        },
      )
  } catch (error) {
    phaseDurations.critic_first =
      Date.now() - critic1StartedAt

    const failure = errorFromCaught(error)

    return buildResult({
      ...identity,
      snapshot,
      status: failure.status,
      output: null,
      execution: null,
      model_config: modelConfig,
      critic: null,
      phase_durations_ms: phaseDurations,
      error: failure.error,
    })
  }

  phaseDurations.critic_first =
    Date.now() - critic1StartedAt

  const criticEval1 = toCriticEvaluation(
    criticAttempt1,
  )

  if (criticAttempt1.output.verdict === 'pass') {
    return buildResult({
      ...identity,
      snapshot,
      status: 'generated',
      output: primaryResult.output,
      execution: primaryResult.execution,
      model_config: modelConfig,
      critic: {
        first: criticEval1,
        second: null,
      },
      phase_durations_ms: phaseDurations,
      error: null,
    })
  }

  if (
    criticAttempt1.output.verdict === 'block'
  ) {
    return buildResult({
      ...identity,
      snapshot,
      status: 'invalid_output',
      output: null,
      execution: null,
      model_config: modelConfig,
      critic: {
        first: criticEval1,
        second: null,
      },
      phase_durations_ms: phaseDurations,
      error: {
        code: 'V2_SEMANTIC_CRITIC_BLOCKED',
        message:
          criticAttempt1.output
            .concise_feedback ??
          'O critic semântico bloqueou a candidate.',
        retryable: false,
      },
    })
  }

  // verdict === 'repair' a partir daqui.
  const repairBudgetAvailable =
    primaryResult.execution.attempts === 1

  if (!repairBudgetAvailable) {
    // A geração primária já consumiu o único repair (determinístico) —
    // não há orçamento para uma terceira geração.
    return buildResult({
      ...identity,
      snapshot,
      status: 'invalid_output',
      output: null,
      execution: null,
      model_config: modelConfig,
      critic: {
        first: criticEval1,
        second: null,
      },
      phase_durations_ms: phaseDurations,
      error: {
        code:
          'V2_SEMANTIC_CRITIC_REPAIR_EXHAUSTED',
        message:
          criticAttempt1.output
            .concise_feedback ??
          'O critic semântico pediu reparo, mas o orçamento de regeneração já havia sido usado pela validação determinística.',
        retryable: false,
      },
    })
  }

  // -- 4. Repair único acionado pelo critic ------------------------------
  const criticRepairPlan =
    buildMessageIntelligenceV2CriticDrivenRepairExecutionPlan(
      {
        plan,
        previous_output:
          primaryResult.output,
        critic_feedback: {
          reason_codes:
            criticAttempt1.output
              .reason_codes,
          unsupported_claim_indexes:
            criticAttempt1.output
              .unsupported_claim_indexes,
          concise_feedback:
            criticAttempt1.output
              .concise_feedback,
        },
      },
    )

  let repairedAttempt: Awaited<
    ReturnType<
      typeof executeMessageIntelligenceV2SingleAttempt
    >
  >

  const repairStartedAt = Date.now()

  try {
    repairedAttempt =
      await executeMessageIntelligenceV2SingleAttempt(
        {
          plan: criticRepairPlan,
          provider,
        },
      )
  } catch (error) {
    phaseDurations.repair =
      Date.now() - repairStartedAt

    const failure = errorFromCaught(error)

    return buildResult({
      ...identity,
      snapshot,
      status: failure.status,
      output: null,
      execution: null,
      model_config: modelConfig,
      critic: {
        first: criticEval1,
        second: null,
      },
      phase_durations_ms: phaseDurations,
      error: failure.error,
    })
  }

  phaseDurations.repair =
    Date.now() - repairStartedAt

  const repairedExecution: MessageIntelligenceV2Execution =
    {
      ...repairedAttempt.execution,
      attempts: 2,
      recovered_after_retry: true,
      repair_reason: 'semantic_critic',
    }

  // A candidate reparada pode legitimamente virar silêncio (ex.: o único
  // conteúdo sustentável era o que o critic rejeitou).
  if (
    !repairedAttempt.output
      .intervention_needed ||
    !repairedAttempt.output.suggested_message
  ) {
    return buildResult({
      ...identity,
      snapshot,
      status: 'no_message',
      output: repairedAttempt.output,
      execution: repairedExecution,
      model_config: modelConfig,
      critic: {
        first: criticEval1,
        second: null,
      },
      phase_durations_ms: phaseDurations,
      error: null,
    })
  }

  // -- 5. Semantic critic — segunda e última avaliação -------------------
  const criticPlan2 =
    buildMessageIntelligenceV2CriticExecutionPlan({
      primaryPlan: plan,
      output: repairedAttempt.output,
    })

  let criticAttempt2: MessageIntelligenceV2CriticExecutionResult

  const critic2StartedAt = Date.now()

  try {
    criticAttempt2 =
      await executeMessageIntelligenceV2CriticAttempt(
        {
          plan: criticPlan2,
          provider: criticProvider,
        },
      )
  } catch (error) {
    phaseDurations.critic_second =
      Date.now() - critic2StartedAt

    const failure = errorFromCaught(error)

    return buildResult({
      ...identity,
      snapshot,
      status: failure.status,
      output: null,
      execution: null,
      model_config: modelConfig,
      critic: {
        first: criticEval1,
        second: null,
      },
      phase_durations_ms: phaseDurations,
      error: failure.error,
    })
  }

  phaseDurations.critic_second =
    Date.now() - critic2StartedAt

  const criticEval2 = toCriticEvaluation(
    criticAttempt2,
  )

  const criticBoth = {
    first: criticEval1,
    second: criticEval2,
  }

  if (criticAttempt2.output.verdict === 'pass') {
    return buildResult({
      ...identity,
      snapshot,
      status: 'generated',
      output: repairedAttempt.output,
      execution: repairedExecution,
      model_config: modelConfig,
      critic: criticBoth,
      phase_durations_ms: phaseDurations,
      error: null,
    })
  }

  // repair ou block na segunda avaliação: sem terceira geração — bloqueia.
  return buildResult({
    ...identity,
    snapshot,
    status: 'invalid_output',
    output: null,
    execution: null,
    model_config: modelConfig,
    critic: criticBoth,
    phase_durations_ms: phaseDurations,
    error: {
      code:
        criticAttempt2.output.verdict ===
        'block'
          ? 'V2_SEMANTIC_CRITIC_BLOCKED'
          : 'V2_SEMANTIC_CRITIC_REPAIR_EXHAUSTED',
      message:
        criticAttempt2.output
          .concise_feedback ??
        'O critic semântico não aprovou a candidate reparada.',
      retryable: false,
    },
  })
}
