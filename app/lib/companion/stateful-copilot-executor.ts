import {
  STATEFUL_COPILOT_CONTRACT_VERSION,
  type StatefulCopilotOutput,
} from './stateful-copilot-contract'

import {
  STATEFUL_COPILOT_PROMPT_VERSION,
  type StatefulCopilotExecutionPlan,
  type StatefulCopilotModelRequest,
} from './stateful-copilot-execution-plan'

import {
  StatefulCopilotContractError,
  normalizeStatefulCopilotOutput,
} from './stateful-copilot-normalizer'

const MAX_MODEL_CONTENT_LENGTH =
  1_000_000

type JsonRecord =
  Record<string, unknown>

type StatefulCopilotModelPlan =
  Extract<
    StatefulCopilotExecutionPlan,
    {
      mode: 'model'
    }
  >

export type StatefulCopilotProviderRequest = {
  prompt_version:
    StatefulCopilotModelRequest['prompt_version']

  output_contract_version:
    StatefulCopilotModelRequest['output_contract_version']

  system_prompt: string
  user_prompt: string
}

export type StatefulCopilotUsage = {
  input_tokens: number | null
  output_tokens: number | null
  total_tokens: number | null
}

export type StatefulCopilotProviderResponse = {
  content: unknown
  provider: unknown
  model?: unknown
  request_id?: unknown
  usage?: unknown
}

export type StatefulCopilotProvider = (
  request: StatefulCopilotProviderRequest,
) => Promise<StatefulCopilotProviderResponse>

export type StatefulCopilotExecutionAttemptResult = {
  output:
    StatefulCopilotOutput

  execution: {
    mode: 'model'
    provider: string
    model: string | null
    request_id: string | null

    usage:
      StatefulCopilotUsage | null
  }
}

export class StatefulCopilotExecutionError
  extends Error {
  readonly code: string
  readonly status_code: number
  readonly retryable: boolean

  readonly details:
    JsonRecord | null

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
      'StatefulCopilotExecutionError'

    this.code =
      code

    this.status_code =
      status_code

    this.retryable =
      retryable

    this.details =
      details
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
  throw new StatefulCopilotExecutionError({
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
        'INVALID_PROVIDER_RESPONSE',

      message:
        'O provedor não declarou uma identificação válida.',

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

function requireModelPlan(
  plan: StatefulCopilotExecutionPlan,
): StatefulCopilotModelPlan {
  if (plan.mode !== 'model') {
    fail({
      code:
        'EXECUTION_PLAN_NOT_MODEL',

      message:
        'Uma tentativa de modelo exige um plano executável pelo modelo.',

      status_code:
        500,

      retryable:
        false,
    })
  }

  if (
    plan.request.prompt_version !==
    STATEFUL_COPILOT_PROMPT_VERSION
  ) {
    fail({
      code:
        'PROMPT_VERSION_MISMATCH',

      message:
        'O plano utiliza uma versão incompatível do prompt stateful.',

      status_code:
        500,

      retryable:
        false,
    })
  }

  if (
    plan.request.output_contract_version !==
    STATEFUL_COPILOT_CONTRACT_VERSION
  ) {
    fail({
      code:
        'OUTPUT_CONTRACT_VERSION_MISMATCH',

      message:
        'O plano utiliza uma versão incompatível do contrato de saída.',

      status_code:
        500,

      retryable:
        false,
    })
  }

  if (
    !plan.request.system_prompt.trim() ||
    !plan.request.user_prompt.trim()
  ) {
    fail({
      code:
        'EMPTY_EXECUTION_PROMPT',

      message:
        'O plano stateful precisa possuir prompts válidos.',

      status_code:
        500,

      retryable:
        false,
    })
  }

  if (
    !isRecord(
      plan
        .request
        .normalization_context,
    )
  ) {
    fail({
      code:
        'INVALID_NORMALIZATION_CONTEXT',

      message:
        'O plano stateful não possui contexto de normalização válido.',

      status_code:
        500,

      retryable:
        false,
    })
  }

  return plan
}

function buildProviderRequest(
  plan: StatefulCopilotModelPlan,
): StatefulCopilotProviderRequest {
  return Object.freeze({
    prompt_version:
      plan.request.prompt_version,

    output_contract_version:
      plan
        .request
        .output_contract_version,

    system_prompt:
      plan.request.system_prompt,

    user_prompt:
      plan.request.user_prompt,
  })
}

function parseModelOutput(
  content: unknown,
): JsonRecord {
  if (typeof content !== 'string') {
    fail({
      code:
        'INVALID_PROVIDER_RESPONSE',

      message:
        'O provedor não retornou conteúdo textual válido.',

      status_code:
        502,

      retryable:
        true,
    })
  }

  if (
    content.length >
    MAX_MODEL_CONTENT_LENGTH
  ) {
    fail({
      code:
        'MODEL_OUTPUT_TOO_LARGE',

      message:
        'A saída do modelo ultrapassou o limite permitido.',

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
        'EMPTY_MODEL_OUTPUT',

      message:
        'O modelo não retornou conteúdo para o Copiloto stateful.',

      status_code:
        502,

      retryable:
        true,
    })
  }

  let parsed: unknown

  try {
    parsed =
      JSON.parse(
        normalizedContent,
      )
  } catch {
    fail({
      code:
        'INVALID_MODEL_JSON',

      message:
        'O modelo não retornou um objeto JSON válido.',

      status_code:
        502,

      retryable:
        true,
    })
  }

  if (!isRecord(parsed)) {
    fail({
      code:
        'INVALID_MODEL_JSON',

      message:
        'A saída do Copiloto stateful precisa ser um objeto JSON.',

      status_code:
        502,

      retryable:
        true,
    })
  }

  return parsed
}

function normalizeModelOutput({
  raw_output,
  plan,
}: {
  raw_output: JsonRecord
  plan: StatefulCopilotModelPlan
}): StatefulCopilotOutput {
  try {
    return normalizeStatefulCopilotOutput(
      raw_output,
      plan
        .request
        .normalization_context,
    )
  } catch (error) {
    if (
      error instanceof
      StatefulCopilotContractError
    ) {
      const isContextError =
        error.path.startsWith(
          'context.',
        )

      fail({
        code:
          isContextError
            ? 'INVALID_EXECUTION_PLAN'
            : 'INVALID_MODEL_OUTPUT',

        message:
          isContextError
            ? 'O plano stateful possui contexto interno inválido.'
            : 'O modelo retornou uma saída incompatível com o contrato stateful.',

        status_code:
          isContextError
            ? 500
            : 502,

        retryable:
          !isContextError,

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
}

export async function executeStatefulCopilotModelAttempt({
  plan,
  provider,
}: {
  plan:
    StatefulCopilotExecutionPlan

  provider:
    StatefulCopilotProvider
}): Promise<StatefulCopilotExecutionAttemptResult> {
  const modelPlan =
    requireModelPlan(plan)

  const providerRequest =
    buildProviderRequest(
      modelPlan,
    )

  let providerResponse:
    StatefulCopilotProviderResponse

  try {
    providerResponse =
      await provider(
        providerRequest,
      )
  } catch (error) {
    if (
      error instanceof
      StatefulCopilotExecutionError
    ) {
      throw error
    }

    fail({
      code:
        'PROVIDER_REQUEST_FAILED',

      message:
        'Não foi possível executar o provedor do Copiloto stateful.',

      status_code:
        502,

      retryable:
        true,
    })
  }

  if (!isRecord(providerResponse)) {
    fail({
      code:
        'INVALID_PROVIDER_RESPONSE',

      message:
        'O provedor retornou uma resposta estruturalmente inválida.',

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

  const output =
    normalizeModelOutput({
      raw_output:
        rawOutput,

      plan:
        modelPlan,
    })

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
    },
  }
}
