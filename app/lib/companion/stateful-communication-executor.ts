import {
  STATEFUL_COMMUNICATION_CONTRACT_VERSION,
  STATEFUL_COMMUNICATION_MODEL_OUTPUT_FIELDS,
  type StatefulCommunicationNormalizationContext,
  type StatefulCommunicationOutput,
} from './stateful-communication-contract'

import {
  CommercialReadingContractError,
  normalizeCommercialReadingModelOutput,
  type CommercialReading,
} from './commercial-reading-contract'

import {
  STATEFUL_COMMUNICATION_PROMPT_VERSION,
  buildStatefulCommunicationRepairExecutionPlan,
  type StatefulCommunicationExecutionPlan,
} from './stateful-communication-execution-plan'

import {
  STATEFUL_COMMUNICATION_STRUCTURED_OUTPUT_FORMAT,
} from './stateful-communication-json-schema'

import {
  buildCommercialReadingCustomerFromState,
} from './client-commercial-intelligence-contract'

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
  new Set<string>(
    STATEFUL_COMMUNICATION_MODEL_OUTPUT_FIELDS,
  )

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

type CommunicationFailureMetadata = {
  path: string
  invariant: string
}

function buildCommunicationFailureDetails({
  path,
  invariant,
  details = null,
}: CommunicationFailureMetadata & {
  details?: JsonRecord | null
}): JsonRecord {
  return {
    ...details,

    communication_failure_path:
      path,

    communication_failure_invariant:
      invariant,
  }
}

function failInvalidOutput({
  message,
  path,
  invariant,
  details,
}: CommunicationFailureMetadata & {
  message: string
  details?: JsonRecord | null
}): never {
  fail({
    code:
      'INVALID_COMMUNICATION_OUTPUT',

    message,

    status_code:
      502,

    retryable:
      true,

    details:
      buildCommunicationFailureDetails({
        path,
        invariant,
        details,
      }),
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
    failInvalidOutput({
      message:
        `${path} precisa ser um texto.`,

      path,

      invariant:
        'TEXT_REQUIRED',
    })
  }

  const normalized =
    value.trim()

  if (!normalized) {
    failInvalidOutput({
      message:
        `${path} possui um texto inválido.`,

      path,

      invariant:
        'NON_EMPTY_TEXT',
    })
  }

  if (
    normalized.length >
    maximumLength
  ) {
    failInvalidOutput({
      message:
        `${path} possui um texto inválido.`,

      path,

      invariant:
        'TEXT_LENGTH_LIMIT',
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

function normalizeCommercialReadingOutput({
  value,
  context,
  intervention_needed,
  recommended_question,
  suggested_message,
}: {
  value: unknown

  context:
    StatefulCommunicationNormalizationContext

  intervention_needed:
    boolean

  recommended_question:
    string | null

  suggested_message:
    string | null
}): CommercialReading {
  const commerciallyActionable =
    context.commercial_role ===
      'buyer' &&
    context.commercial_relevance ===
      'commercial'

  try {
    return normalizeCommercialReadingModelOutput({
      value,

      context:
        context.commercial_reading,

      derived: {
        analysis_status:
          context.expected_analysis_status,

        analysis_limitations: [
          ...context
            .expected_analysis_limitations,
        ],

        commercial_role:
          context.commercial_role,

        commercial_relevance:
          context.commercial_relevance,

        customer:
          buildCommercialReadingCustomerFromState({
            state:
              context.candidate_state,

            products:
              context.products,
          }),

        communication:
          commerciallyActionable
            ? {
                intervention_needed,

                recommended_question,

                recommended_message:
                  suggested_message,
              }
            : {
                intervention_needed:
                  false,

                recommended_question:
                  null,

                recommended_message:
                  null,
              },

        operations: {
          crm: {
            ...context.expected_crm,
          },

          agenda: {
            ...context.expected_agenda,
          },
        },

        sales_method:
          context.sales_method,
      },
    })
  } catch (error) {
    if (
      error instanceof
        CommercialReadingContractError
    ) {
      failInvalidOutput({
        message:
          'A Leitura Comercial Completa retornada é incompatível com o contrato.',

        path:
          error.path,

        invariant:
          error.code,

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

      details:
        buildCommunicationFailureDetails({
          path:
            'communication',

          invariant:
            'NON_EMPTY_JSON',
        }),
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

      details:
        buildCommunicationFailureDetails({
          path:
            'communication',

          invariant:
            'VALID_JSON_OBJECT',
        }),
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

      details:
        buildCommunicationFailureDetails({
          path:
            'communication',

          invariant:
            'VALID_JSON_OBJECT',
        }),
    })
  }

  return parsed
}

function deriveMethodApplication(
  reading:
    CommercialReading,
): string {
  if (!reading.method.configured) {
    return 'Método comercial não configurado.'
  }

  const currentStage =
    reading.method.current_stage

  const stagePrefix =
    currentStage
      ? `Etapa atual: ${currentStage.name}. `
      : ''

  return `${stagePrefix}${reading.method.adherence.summary}`
    .trim()
    .slice(0, 900)
}

function deriveGuidance(
  reading:
    CommercialReading,
): string {
  if (
    reading.method
      .recovery_guidance
  ) {
    return reading.method
      .recovery_guidance
      .recommended_move
      .slice(0, 1_400)
  }

  return reading.best_approach
    .reason
    .slice(0, 1_400)
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

  const missingField = [
    ...COMMUNICATION_OUTPUT_FIELDS,
  ].find(
    fieldName =>
      !Object.prototype.hasOwnProperty.call(
        value,
        fieldName,
      ),
  )

  if (missingField) {
    failInvalidOutput({
      message:
        'A camada de comunicação não retornou todos os campos obrigatórios.',

      path:
        `communication.${missingField}`,

      invariant:
        'REQUIRED_FIELD_MISSING',
    })
  }

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
    failInvalidOutput({
      message:
        'A camada de comunicação retornou campos incompatíveis com o contrato.',

      path:
        'communication',

      invariant:
        'ADDITIONAL_FIELD_NOT_ALLOWED',
    })
  }

  if (
    typeof value.intervention_needed !==
    'boolean'
  ) {
    failInvalidOutput({
      message:
        'intervention_needed precisa ser booleano.',

      path:
        'communication.intervention_needed',

      invariant:
        'BOOLEAN_REQUIRED',
    })
  }

  const interventionNeeded =
    value.intervention_needed

  const recommendedQuestion =
    requireNullableString(
      value.recommended_question,
      'communication.recommended_question',
      900,
    )

  const suggestedMessage =
    requireNullableString(
      value.suggested_message,
      'communication.suggested_message',
      900,
    )

  if (
    interventionNeeded ===
      false &&
    (
      recommendedQuestion !==
        null ||
      suggestedMessage !==
        null
    )
  ) {
    failInvalidOutput({
      message:
        'Uma decisão sem intervenção não pode sugerir pergunta ou mensagem.',

      path:
        'communication',

      invariant:
        'NO_INTERVENTION_REQUIRES_SILENCE',
    })
  }

  const commercialReading =
    normalizeCommercialReadingOutput({
      value:
        value.commercial_reading,

      context,

      intervention_needed:
        interventionNeeded,

      recommended_question:
        recommendedQuestion,

      suggested_message:
        suggestedMessage,
    })

  const methodApplication =
    deriveMethodApplication(
      commercialReading,
    )

  const guidance =
    deriveGuidance(
      commercialReading,
    )

  const output:
    StatefulCommunicationOutput = {
    contract_version:
      STATEFUL_COMMUNICATION_CONTRACT_VERSION,

    intervention_needed:
      interventionNeeded,

    method_application:
      methodApplication,

    guidance,

    recommended_question:
      recommendedQuestion,

    suggested_message:
      suggestedMessage,

    commercial_reading:
      commercialReading,
  }

  // Papel e relevância são gates independentes. O executor neutraliza toda
  // orientação comercial quando qualquer um deles não autoriza intervenção,
  // inclusive quando o modelo já marcou intervention_needed=false, mas ainda
  // deixou coaching persuasivo nos campos textuais.
  if (
    context.commercial_role !==
      'buyer' ||
    context.commercial_relevance !==
      'commercial'
  ) {
    output.intervention_needed =
      false

    output.method_application =
      'Nenhuma aplicação comercial ao assunto atual.'

    output.guidance =
      'Nenhuma ação comercial necessária.'

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
          'Nenhuma intervenção comercial é recomendada para o contexto atual.',

        channel:
          'none',
      }
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

function readFailureMetadata(
  error:
    StatefulCommunicationExecutionError,
): CommunicationFailureMetadata {
  const details =
    error.details

  return {
    path:
      typeof details
        ?.communication_failure_path ===
        'string'
        ? details
            .communication_failure_path
        : 'communication',

    invariant:
      typeof details
        ?.communication_failure_invariant ===
        'string'
        ? details
            .communication_failure_invariant
        : error.code,
  }
}

function withAttemptMetadata({
  error,
  attempts,
  firstError = null,
}: {
  error:
    StatefulCommunicationExecutionError

  attempts:
    1 | 2

  firstError?:
    StatefulCommunicationExecutionError | null
}): StatefulCommunicationExecutionError {
  const details: JsonRecord = {
    ...error.details,

    communication_attempts:
      attempts,
  }

  if (firstError) {
    const firstFailure =
      readFailureMetadata(
        firstError,
      )

    details.first_failure_code =
      firstError.code

    details.first_failure_path =
      firstFailure.path

    details.first_failure_invariant =
      firstFailure.invariant
  }

  return new StatefulCommunicationExecutionError({
    code:
      error.code,

    message:
      error.message,

    status_code:
      error.status_code,

    retryable:
      error.retryable,

    details,
  })
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

  let firstError:
    StatefulCommunicationExecutionError | null =
      null

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
    if (
      !(error instanceof
        StatefulCommunicationExecutionError) ||
      !shouldRetry(error)
    ) {
      if (
        error instanceof
        StatefulCommunicationExecutionError
      ) {
        throw withAttemptMetadata({
          error,
          attempts:
            1,
        })
      }

      throw error
    }

    firstError =
      error
  }

  if (firstError === null) {
    fail({
      code:
        'INVALID_COMMUNICATION_PLAN',

      message:
        'A segunda tentativa de comunicação não possui uma falha reparável.',

      status_code:
        500,

      retryable:
        false,
    })
  }

  const firstFailure =
    readFailureMetadata(
      firstError,
    )

  const repairPlan =
    buildStatefulCommunicationRepairExecutionPlan({
      plan,

      previous_failure_code:
        firstError.code,

      previous_failure_path:
        firstFailure.path,

      previous_failure_invariant:
        firstFailure.invariant,
    })

  let secondResult:
    Awaited<
      ReturnType<
        typeof executeAttempt
      >
    >

  try {
    secondResult =
      await executeAttempt({
        plan:
          repairPlan,

        provider,
      })
  } catch (error) {
    if (
      error instanceof
      StatefulCommunicationExecutionError
    ) {
      throw withAttemptMetadata({
        error,
        attempts:
          2,
        firstError,
      })
    }

    throw error
  }

  return buildResult({
    result:
      secondResult,

    attempts:
      2,
  })
}
