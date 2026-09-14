import {
  COMMERCIAL_REASONING_CORE_V2_CONTRACT_VERSION,
  CommercialReasoningCoreV2ContractError,
  normalizeCommercialReasoningCoreV2Output,
  type CommercialReasoningCoreV2Output,
} from './commercial-reasoning-core-v2-contract'

import {
  COMMERCIAL_REASONING_CORE_V2_PROMPT_VERSION,
  type CommercialReasoningCoreV2ExecutionPlan,
} from './commercial-reasoning-core-v2-execution-plan'

import {
  COMMERCIAL_REASONING_CORE_V2_STRUCTURED_OUTPUT_FORMAT,
} from './commercial-reasoning-core-v2-json-schema'

import type {
  StatefulCopilotProvider,
  StatefulCopilotUsage,
} from './stateful-copilot-executor'

const MAX_CORE_V2_MODEL_CONTENT_LENGTH =
  250_000

type JsonRecord =
  Record<string, unknown>

export type CommercialReasoningCoreV2Execution = {
  mode: 'model'
  provider: string
  model: string | null
  request_id: string | null
  usage: StatefulCopilotUsage | null
  attempts: 1
  recovered_after_retry: false
  duration_ms: number
}

export type CommercialReasoningCoreV2ExecutionResult = {
  output: CommercialReasoningCoreV2Output
  execution: CommercialReasoningCoreV2Execution
}

export class CommercialReasoningCoreV2ExecutionError
  extends Error {
  readonly code: string
  readonly status_code: number
  readonly retryable: boolean
  readonly details: JsonRecord | null

  constructor({
    code,
    message,
    status_code,
    retryable,
    details = null,
  }: {
    code: string
    message: string
    status_code: number
    retryable: boolean
    details?: JsonRecord | null
  }) {
    super(message)

    this.name =
      'CommercialReasoningCoreV2ExecutionError'

    this.code = code
    this.status_code = status_code
    this.retryable = retryable
    this.details = details
  }
}

function fail({
  code,
  message,
  status_code,
  retryable,
  details,
}: {
  code: string
  message: string
  status_code: number
  retryable: boolean
  details?: JsonRecord | null
}): never {
  throw new CommercialReasoningCoreV2ExecutionError({
    code,
    message,
    status_code,
    retryable,
    details,
  })
}

function isRecord(
  value: unknown,
): value is JsonRecord {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value)
  )
}

function normalizeNullableString(
  value: unknown,
): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized =
    value.trim()

  return normalized || null
}

function requireProviderName(
  value: unknown,
): string {
  const provider =
    normalizeNullableString(value)

  if (!provider) {
    fail({
      code:
        'INVALID_CORE_V2_PROVIDER_RESPONSE',

      message:
        'O provedor do Commercial Reasoning Core V2 não declarou identificação válida.',

      status_code:
        502,

      retryable:
        true,
    })
  }

  return provider
}

function normalizeTokenCount(
  value: unknown,
): number | null {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    return null
  }

  return value
}

function normalizeUsage(
  value: unknown,
): StatefulCopilotUsage | null {
  if (!isRecord(value)) {
    return null
  }

  const usage = {
    input_tokens:
      normalizeTokenCount(
        value.input_tokens,
      ),

    output_tokens:
      normalizeTokenCount(
        value.output_tokens,
      ),

    total_tokens:
      normalizeTokenCount(
        value.total_tokens,
      ),
  }

  if (
    usage.input_tokens === null &&
    usage.output_tokens === null &&
    usage.total_tokens === null
  ) {
    return null
  }

  return usage
}

function validatePlan(
  plan: CommercialReasoningCoreV2ExecutionPlan,
): void {
  if (
    plan.prompt_version !==
      COMMERCIAL_REASONING_CORE_V2_PROMPT_VERSION ||
    plan.output_contract_version !==
      COMMERCIAL_REASONING_CORE_V2_CONTRACT_VERSION ||
    !plan.system_prompt.trim() ||
    !plan.user_prompt.trim()
  ) {
    fail({
      code:
        'INVALID_CORE_V2_PLAN',

      message:
        'O plano do Commercial Reasoning Core V2 é inválido.',

      status_code:
        500,

      retryable:
        false,
    })
  }
}

function parseModelOutput(
  content: unknown,
): JsonRecord {
  if (typeof content !== 'string') {
    fail({
      code:
        'INVALID_CORE_V2_PROVIDER_RESPONSE',

      message:
        'O provedor do Commercial Reasoning Core V2 não retornou conteúdo textual válido.',

      status_code:
        502,

      retryable:
        true,
    })
  }

  if (
    content.length >
      MAX_CORE_V2_MODEL_CONTENT_LENGTH
  ) {
    fail({
      code:
        'CORE_V2_OUTPUT_TOO_LARGE',

      message:
        'A saída do Commercial Reasoning Core V2 ultrapassou o limite permitido.',

      status_code:
        502,

      retryable:
        false,
    })
  }

  const normalizedContent =
    content.trim()

  if (!normalizedContent) {
    fail({
      code:
        'EMPTY_CORE_V2_OUTPUT',

      message:
        'O Commercial Reasoning Core V2 não retornou conteúdo.',

      status_code:
        502,

      retryable:
        true,
    })
  }

  let parsed: unknown

  try {
    parsed =
      JSON.parse(normalizedContent)
  } catch {
    fail({
      code:
        'INVALID_CORE_V2_JSON',

      message:
        'O Commercial Reasoning Core V2 não retornou JSON válido.',

      status_code:
        502,

      retryable:
        true,
    })
  }

  if (!isRecord(parsed)) {
    fail({
      code:
        'INVALID_CORE_V2_JSON',

      message:
        'A saída do Commercial Reasoning Core V2 precisa ser um objeto JSON.',

      status_code:
        502,

      retryable:
        true,
    })
  }

  return parsed
}

export async function executeCommercialReasoningCoreV2({
  plan,
  provider,
}: {
  plan: CommercialReasoningCoreV2ExecutionPlan
  provider: StatefulCopilotProvider
}): Promise<CommercialReasoningCoreV2ExecutionResult> {
  validatePlan(plan)

  const startedAt =
    Date.now()

  let providerResponse: unknown

  try {
    providerResponse =
      await provider({
        prompt_version:
          plan.prompt_version,

        output_contract_version:
          plan.output_contract_version,

        system_prompt:
          plan.system_prompt,

        user_prompt:
          plan.user_prompt,

        structured_output_format:
          COMMERCIAL_REASONING_CORE_V2_STRUCTURED_OUTPUT_FORMAT,
      })
  } catch (error) {
    if (
      error instanceof
        CommercialReasoningCoreV2ExecutionError
    ) {
      throw error
    }

    fail({
      code:
        'CORE_V2_PROVIDER_REQUEST_FAILED',

      message:
        'Não foi possível executar o Commercial Reasoning Core V2.',

      status_code:
        502,

      retryable:
        true,
    })
  }

  if (!isRecord(providerResponse)) {
    fail({
      code:
        'INVALID_CORE_V2_PROVIDER_RESPONSE',

      message:
        'O provedor do Commercial Reasoning Core V2 retornou resposta inválida.',

      status_code:
        502,

      retryable:
        true,
    })
  }

  const rawOutput =
    parseModelOutput(
      providerResponse.content,
    )

  let output:
    CommercialReasoningCoreV2Output

  try {
    output =
      normalizeCommercialReasoningCoreV2Output(
        rawOutput,
      )
  } catch (error) {
    if (
      error instanceof
        CommercialReasoningCoreV2ContractError
    ) {
      fail({
        code:
          'INVALID_CORE_V2_OUTPUT',

        message:
          'O modelo retornou uma saída incompatível com o contrato do Commercial Reasoning Core V2.',

        status_code:
          502,

        retryable:
          true,

        details: {
          contract_error_code:
            error.code,

          contract_error_path:
            error.path,
        },
      })
    }

    throw error
  }

  return {
    output,

    execution: {
      mode:
        'model',

      provider:
        requireProviderName(
          providerResponse.provider,
        ),

      model:
        normalizeNullableString(
          providerResponse.model,
        ),

      request_id:
        normalizeNullableString(
          providerResponse.request_id,
        ),

      usage:
        normalizeUsage(
          providerResponse.usage,
        ),

      attempts:
        1,

      recovered_after_retry:
        false,

      duration_ms:
        Math.max(
          0,
          Date.now() - startedAt,
        ),
    },
  }
}
