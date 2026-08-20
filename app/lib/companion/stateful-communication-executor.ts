import {
  STATEFUL_COMMUNICATION_CONTRACT_VERSION,
  type StatefulCommunicationNormalizationContext,
  type StatefulCommunicationOutput,
} from './stateful-communication-contract'

import {
  CommercialReadingContractError,
  normalizeCommercialReading,
  type CommercialReading,
} from './commercial-reading-contract'

import {
  STATEFUL_COMMUNICATION_PROMPT_VERSION,
  type StatefulCommunicationExecutionPlan,
} from './stateful-communication-execution-plan'

import {
  STATEFUL_COMMUNICATION_STRUCTURED_OUTPUT_FORMAT,
} from './stateful-communication-json-schema'

import {
  StatefulCopilotExecutionError,
  type StatefulCopilotProvider,
  type StatefulCopilotProviderResponse,
  type StatefulCopilotUsage,
} from './stateful-copilot-executor'

const MAX_MODEL_CONTENT_LENGTH =
  100_000

const RETRYABLE_OUTPUT_CODES =
  new Set([
    'EMPTY_COMMUNICATION_OUTPUT',
    'INVALID_COMMUNICATION_JSON',
    'INVALID_COMMUNICATION_OUTPUT',
  ])

const COMMUNICATION_OUTPUT_FIELDS =
  new Set([
    'contract_version',
    'intervention_needed',
    'method_application',
    'guidance',
    'recommended_question',
    'suggested_message',
    'commercial_reading',
  ])

type JsonRecord =
  Record<string, unknown>

export type StatefulCommunicationExecution = {
  mode: 'model'
  provider: string
  model: string | null
  request_id: string | null

  usage:
    StatefulCopilotUsage | null

  attempts:
    1 | 2

  recovered_after_retry:
    boolean
}

export type StatefulCommunicationExecutionResult = {
  output:
    StatefulCommunicationOutput

  execution:
    StatefulCommunicationExecution
}

export class StatefulCommunicationExecutionError
  extends StatefulCopilotExecutionError {
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
    super({
      code,
      message,
      status_code,
      retryable,
      details,
    })

    this.name =
      'StatefulCommunicationExecutionError'
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
  throw new StatefulCommunicationExecutionError({
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

function requireString(
  value: unknown,
  path: string,
  maximumLength: number,
): string {
  if (typeof value !== 'string') {
    fail({
      code:
        'INVALID_COMMUNICATION_OUTPUT',

      message:
        `${path} precisa ser um texto.`,

      status_code:
        502,

      retryable:
        true,
    })
  }

  const normalized =
    value.trim()

  if (
    !normalized ||
    normalized.length > maximumLength
  ) {
    fail({
      code:
        'INVALID_COMMUNICATION_OUTPUT',

      message:
        `${path} possui um texto inválido.`,

      status_code:
        502,

      retryable:
        true,
    })
  }

  return normalized
}

function requireNullableString(
  value: unknown,
  path: string,
  maximumLength: number,
): string | null {
  if (value === null) {
    return null
  }

  return requireString(
    value,
    path,
    maximumLength,
  )
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
    normalizeNullableString(
      value,
    )

  if (!provider) {
    fail({
      code:
        'INVALID_COMMUNICATION_PROVIDER_RESPONSE',

      message:
        'O provedor de comunicação não declarou uma identificação válida.',

      status_code:
        502,

      retryable:
        true,
    })
  }

  return provider
}

function equalStringArrays(
  left: string[],
  right: string[],
): boolean {
  if (
    left.length !==
    right.length
  ) {
    return false
  }

  return left.every(
    (value, index) =>
      value === right[index],
  )
}

function normalizeCommercialReadingOutput({
  value,
  context,
}: {
  value: unknown

  context:
    StatefulCommunicationNormalizationContext
}): CommercialReading {
  let reading:
    CommercialReading

  try {
    reading =
      normalizeCommercialReading(
        value,
        context.commercial_reading,
      )
  } catch (error) {
    if (
      error instanceof
        CommercialReadingContractError
    ) {
      fail({
        code:
          'INVALID_COMMUNICATION_OUTPUT',

        message:
          'A Leitura Comercial Completa retornada é incompatível com o contrato.',

        status_code:
          502,

        retryable:
          true,

        details: {
          reading_code:
            error.code,

          reading_path:
            error.path,
        },
      })
    }

    throw error
  }

  if (
    reading.commercial_role !==
    context.commercial_role
  ) {
    fail({
      code:
        'INVALID_COMMUNICATION_OUTPUT',

      message:
        'A leitura comercial divergiu do papel comercial validado.',

      status_code:
        502,

      retryable:
        true,
    })
  }

  if (
    reading.analysis_status !==
      context.expected_analysis_status ||
    !equalStringArrays(
      reading.analysis_limitations,
      context.expected_analysis_limitations,
    )
  ) {
    fail({
      code:
        'INVALID_COMMUNICATION_OUTPUT',

      message:
        'A leitura comercial divergiu do estado de completude validado.',

      status_code:
        502,

      retryable:
        true,
    })
  }

  const crm =
    reading.operations.crm

  const expectedCrm =
    context.expected_crm

  if (
    crm.should_change_crm_stage !==
      expectedCrm.should_change_crm_stage ||
    crm.recommended_status !==
      expectedCrm.recommended_status ||
    crm.rationale !==
      expectedCrm.rationale ||
    crm.requires_human_confirmation !==
      expectedCrm.requires_human_confirmation
  ) {
    fail({
      code:
        'INVALID_COMMUNICATION_OUTPUT',

      message:
        'A leitura comercial tentou alterar a consequência validada de CRM.',

      status_code:
        502,

      retryable:
        true,
    })
  }

  const agenda =
    reading.operations.agenda

  const expectedAgenda =
    context.expected_agenda

  if (
    agenda.should_change_agenda !==
      expectedAgenda.should_change_agenda ||
    agenda.expected_next_action_at !==
      expectedAgenda.expected_next_action_at ||
    agenda.rationale !==
      expectedAgenda.rationale ||
    agenda.requires_human_confirmation !==
      expectedAgenda.requires_human_confirmation
  ) {
    fail({
      code:
        'INVALID_COMMUNICATION_OUTPUT',

      message:
        'A leitura comercial tentou alterar a consequência validada de Agenda.',

      status_code:
        502,

      retryable:
        true,
    })
  }

  return reading
}

function parseModelOutput(
  content: unknown,
): JsonRecord {
  if (typeof content !== 'string') {
    fail({
      code:
        'INVALID_COMMUNICATION_PROVIDER_RESPONSE',

      message:
        'O provedor de comunicação não retornou conteúdo textual válido.',

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
        'COMMUNICATION_OUTPUT_TOO_LARGE',

      message:
        'A saída da camada de comunicação ultrapassou o limite permitido.',

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
        'EMPTY_COMMUNICATION_OUTPUT',

      message:
        'A camada de comunicação não retornou conteúdo.',

      status_code:
        502,

      retryable:
        true,
    })
  }

  let parsed:
    unknown

  try {
    parsed =
      JSON.parse(
        normalizedContent,
      )
  } catch {
    fail({
      code:
        'INVALID_COMMUNICATION_JSON',

      message:
        'A camada de comunicação não retornou JSON válido.',

      status_code:
        502,

      retryable:
        true,
    })
  }

  if (!isRecord(parsed)) {
    fail({
      code:
        'INVALID_COMMUNICATION_JSON',

      message:
        'A saída da camada de comunicação precisa ser um objeto JSON.',

      status_code:
        502,

      retryable:
        true,
    })
  }

  return parsed
}

function normalizeCommunicationOutput({
  value,
  context,
}: {
  value:
    JsonRecord

  context:
    StatefulCommunicationNormalizationContext
}): StatefulCommunicationOutput {
  const fieldNames =
    Object.keys(value)

  if (
    fieldNames.length !==
      COMMUNICATION_OUTPUT_FIELDS.size ||
    fieldNames.some(
      fieldName =>
        !COMMUNICATION_OUTPUT_FIELDS.has(
          fieldName,
        ),
    )
  ) {
    fail({
      code:
        'INVALID_COMMUNICATION_OUTPUT',

      message:
        'A camada de comunicação retornou campos incompatíveis com o contrato.',

      status_code:
        502,

      retryable:
        true,
    })
  }

  if (
    value.contract_version !==
    STATEFUL_COMMUNICATION_CONTRACT_VERSION
  ) {
    fail({
      code:
        'INVALID_COMMUNICATION_OUTPUT',

      message:
        'A camada de comunicação retornou uma versão de contrato incompatível.',

      status_code:
        502,

      retryable:
        true,
    })
  }

  if (
    typeof value.intervention_needed !==
    'boolean'
  ) {
    fail({
      code:
        'INVALID_COMMUNICATION_OUTPUT',

      message:
        'intervention_needed precisa ser booleano.',

      status_code:
        502,

      retryable:
        true,
    })
  }

  const commercialReading =
    normalizeCommercialReadingOutput({
      value:
        value.commercial_reading,

      context,
    })

  const output:
    StatefulCommunicationOutput = {
    contract_version:
      STATEFUL_COMMUNICATION_CONTRACT_VERSION,

    intervention_needed:
      value.intervention_needed,

    method_application:
      requireString(
        value.method_application,
        'communication.method_application',
        900,
      ),

    guidance:
      requireString(
        value.guidance,
        'communication.guidance',
        1_400,
      ),

    recommended_question:
      requireNullableString(
        value.recommended_question,
        'communication.recommended_question',
        900,
      ),

    suggested_message:
      requireNullableString(
        value.suggested_message,
        'communication.suggested_message',
        900,
      ),

    commercial_reading:
      commercialReading,
  }

  if (
    output.intervention_needed ===
      false &&
    (
      output.recommended_question !==
        null ||
      output.suggested_message !==
        null
    )
  ) {
    fail({
      code:
        'INVALID_COMMUNICATION_OUTPUT',

      message:
        'Uma decisão sem intervenção não pode sugerir pergunta ou mensagem.',

      status_code:
        502,

      retryable:
        true,
    })
  }

  // O prompt já instrui a não intervir comercialmente quando o papel não é
  // "buyer". Em vez de rejeitar a saída inteira quando o modelo viola essa
  // instrução, o executor neutraliza o resultado para o estado silencioso
  // que o contrato exige — a mesma regra, aplicada de forma determinística
  // em vez de confiada apenas ao modelo.
  if (
    context.commercial_role !==
      'buyer' &&
    (
      output.intervention_needed ||
      output.recommended_question !==
        null ||
      output.suggested_message !==
        null ||
      output
        .commercial_reading
        .communication
        .intervention_needed ||
      output
        .commercial_reading
        .communication
        .recommended_question !==
        null ||
      output
        .commercial_reading
        .communication
        .recommended_message !==
        null
    )
  ) {
    output.intervention_needed =
      false

    output.recommended_question =
      null

    output.suggested_message =
      null

    output
      .commercial_reading
      .communication = {
        intervention_needed:
          false,

        recommended_question:
          null,

        recommended_message:
          null,
      }

    output
      .commercial_reading
      .best_approach = {
        ...output
          .commercial_reading
          .best_approach,

        decision:
          'no_intervention',

        reason:
          'O contato não está comprovado como comprador; nenhuma intervenção comercial é recomendada.',

        channel:
          'none',
      }
  }

  const readingCommunication =
    output
      .commercial_reading
      .communication

  if (
    readingCommunication
      .intervention_needed !==
      output.intervention_needed ||
    readingCommunication
      .recommended_question !==
      output.recommended_question ||
    readingCommunication
      .recommended_message !==
      output.suggested_message
  ) {
    fail({
      code:
        'INVALID_COMMUNICATION_OUTPUT',

      message:
        'A comunicação da leitura comercial divergiu da intervenção final.',

      status_code:
        502,

      retryable:
        true,
    })
  }

  return output
}

function validatePlan(
  plan:
    StatefulCommunicationExecutionPlan,
) {
  if (
    plan.prompt_version !==
    STATEFUL_COMMUNICATION_PROMPT_VERSION ||
    plan.output_contract_version !==
    STATEFUL_COMMUNICATION_CONTRACT_VERSION ||
    !plan.system_prompt.trim() ||
    !plan.user_prompt.trim()
  ) {
    fail({
      code:
        'INVALID_COMMUNICATION_PLAN',

      message:
        'O plano da camada de comunicação é inválido.',

      status_code:
        500,

      retryable:
        false,
    })
  }
}

async function executeAttempt({
  plan,
  provider,
}: {
  plan:
    StatefulCommunicationExecutionPlan

  provider:
    StatefulCopilotProvider
}): Promise<{
  output:
    StatefulCommunicationOutput

  execution:
    Omit<
      StatefulCommunicationExecution,
      'attempts' |
      'recovered_after_retry'
    >
}> {
  let response:
    StatefulCopilotProviderResponse

  try {
    response =
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
          STATEFUL_COMMUNICATION_STRUCTURED_OUTPUT_FORMAT,
      })
  } catch (error) {
    if (
      error instanceof
      StatefulCopilotExecutionError
    ) {
      throw error
    }

    fail({
      code:
        'COMMUNICATION_PROVIDER_REQUEST_FAILED',

      message:
        'Não foi possível executar o provedor da camada de comunicação.',

      status_code:
        502,

      retryable:
        true,
    })
  }

  if (!isRecord(response)) {
    fail({
      code:
        'INVALID_COMMUNICATION_PROVIDER_RESPONSE',

      message:
        'O provedor de comunicação retornou uma resposta inválida.',

      status_code:
        502,

      retryable:
        true,
    })
  }

  const rawOutput =
    parseModelOutput(
      response.content,
    )

  return {
    output:
      normalizeCommunicationOutput({
        value:
          rawOutput,

        context:
          plan
            .normalization_context,
      }),

    execution: {
      mode:
        'model',

      provider:
        requireProviderName(
          response.provider,
        ),

      model:
        normalizeNullableString(
          response.model,
        ),

      request_id:
        normalizeNullableString(
          response.request_id,
        ),

      usage:
        normalizeUsage(
          response.usage,
        ),
    },
  }
}

function shouldRetry(
  error: unknown,
): boolean {
  return (
    error instanceof
      StatefulCommunicationExecutionError &&
    RETRYABLE_OUTPUT_CODES.has(
      error.code,
    )
  )
}

function buildResult({
  result,
  attempts,
}: {
  result:
    Awaited<
      ReturnType<
        typeof executeAttempt
      >
    >

  attempts:
    1 | 2
}): StatefulCommunicationExecutionResult {
  return {
    output:
      result.output,

    execution: {
      ...result.execution,

      attempts,

      recovered_after_retry:
        attempts === 2,
    },
  }
}

export async function executeStatefulCommunicationPlan({
  plan,
  provider,
}: {
  plan:
    StatefulCommunicationExecutionPlan

  provider:
    StatefulCopilotProvider
}): Promise<StatefulCommunicationExecutionResult> {
  validatePlan(
    plan,
  )

  try {
    const firstResult =
      await executeAttempt({
        plan,
        provider,
      })

    return buildResult({
      result:
        firstResult,

      attempts:
        1,
    })
  } catch (error) {
    if (!shouldRetry(error)) {
      throw error
    }
  }

  const secondResult =
    await executeAttempt({
      plan,
      provider,
    })

  return buildResult({
    result:
      secondResult,

    attempts:
      2,
  })
}
