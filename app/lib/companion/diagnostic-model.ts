import {
  COMPANION_DIAGNOSTIC_CONTRACT_VERSION,
  CompanionDiagnosticContractError,
  normalizeCompanionDiagnostic,
  type CompanionDiagnostic,
} from './diagnostic-contract'

import type {
  CompanionDiagnosticExecutionPlan,
} from './diagnostic-execution-plan'

import type {
  CompanionDiagnosticInput,
} from './diagnostic-input'

export const DEFAULT_COMPANION_DIAGNOSTIC_MODEL =
  'gpt-4.1-mini'

export const DEFAULT_COMPANION_DIAGNOSTIC_TIMEOUT_MS =
  45000

const OPENAI_CHAT_COMPLETIONS_URL =
  'https://api.openai.com/v1/chat/completions'

const MAX_PROVIDER_RESPONSE_LENGTH =
  2_000_000

const MAX_MODEL_CONTENT_LENGTH =
  1_000_000

type JsonRecord =
  Record<string, unknown>

type DiagnosticFetch =
  typeof fetch

export type CompanionDiagnosticModelOptions = {
  api_key?: string | null
  model?: string | null
  timeout_ms?: number
  fetch_impl?: DiagnosticFetch
}

export type CompanionDiagnosticUsage = {
  input_tokens: number | null
  output_tokens: number | null
  total_tokens: number | null
}

export type CompanionDiagnosticExecutionResult = {
  diagnostic: CompanionDiagnostic

  execution: {
    mode: 'blocked' | 'model'
    provider: 'deterministic' | 'openai'
    model: string | null
    request_id: string | null
    usage:
      | CompanionDiagnosticUsage
      | null
  }
}

export class CompanionDiagnosticModelError
  extends Error {
  readonly code: string
  readonly status_code: number
  readonly retryable: boolean
  readonly details:
    | JsonRecord
    | null

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
      'CompanionDiagnosticModelError'

    this.code = code
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
  throw new CompanionDiagnosticModelError({
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

function normalizeOptionalString(
  value: unknown,
): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized =
    value.trim()

  return normalized || null
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

function normalizeTimeout(
  value: unknown,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value)
  ) {
    return DEFAULT_COMPANION_DIAGNOSTIC_TIMEOUT_MS
  }

  return Math.min(
    120000,
    Math.max(
      10,
      Math.floor(value),
    ),
  )
}

function resolveApiKey(
  options:
    CompanionDiagnosticModelOptions,
): string | null {
  const rawValue =
    options.api_key === undefined
      ? process.env.OPENAI_API_KEY
      : options.api_key

  return normalizeOptionalString(
    rawValue,
  )
}

function resolveModel(
  options:
    CompanionDiagnosticModelOptions,
): string {
  const rawValue =
    options.model === undefined
      ? process.env.OPENAI_MODEL
      : options.model

  return (
    normalizeOptionalString(
      rawValue,
    ) ||
    DEFAULT_COMPANION_DIAGNOSTIC_MODEL
  )
}

function buildValidationContext(
  input: CompanionDiagnosticInput,
) {
  return {
    available_message_ids:
      input.conversation
        .active_message_ids,

    current_crm_status:
      input.current_crm_status,

    reference_time:
      input.reference_time,
  }
}

function validateBlockedResult(
  plan:
    Extract<
      CompanionDiagnosticExecutionPlan,
      {
        mode: 'blocked'
      }
    >,
  input: CompanionDiagnosticInput,
): CompanionDiagnostic {
  try {
    return normalizeCompanionDiagnostic(
      plan.diagnostic,
      buildValidationContext(
        input,
      ),
    )
  } catch (error) {
    if (
      error instanceof
      CompanionDiagnosticContractError
    ) {
      fail({
        code:
          'INVALID_BLOCKED_DIAGNOSTIC',

        message:
          'O diagnóstico determinístico bloqueado não respeitou o contrato.',

        status_code: 500,
        retryable: false,

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

function parseProviderEnvelope(
  text: string,
): JsonRecord {
  if (
    text.length >
    MAX_PROVIDER_RESPONSE_LENGTH
  ) {
    fail({
      code:
        'MODEL_RESPONSE_TOO_LARGE',

      message:
        'A resposta do provedor ultrapassou o limite permitido.',

      status_code: 502,
      retryable: false,
    })
  }

  let parsed: unknown

  try {
    parsed =
      JSON.parse(text)
  } catch {
    fail({
      code:
        'INVALID_PROVIDER_RESPONSE',

      message:
        'O provedor retornou uma resposta HTTP que não contém JSON válido.',

      status_code: 502,
      retryable: true,
    })
  }

  if (!isRecord(parsed)) {
    fail({
      code:
        'INVALID_PROVIDER_RESPONSE',

      message:
        'O provedor retornou um envelope inválido.',

      status_code: 502,
      retryable: true,
    })
  }

  return parsed
}

function getProviderHttpErrorMessage(
  status: number,
): string {
  if (status === 401) {
    return 'A autenticação com o provedor do diagnóstico falhou.'
  }

  if (status === 403) {
    return 'O provedor recusou o acesso ao diagnóstico.'
  }

  if (status === 429) {
    return 'O provedor atingiu o limite temporário de solicitações.'
  }

  if (status >= 500) {
    return 'O provedor do diagnóstico está temporariamente indisponível.'
  }

  return 'O provedor rejeitou a solicitação do diagnóstico.'
}

function getProviderHttpErrorCode(
  status: number,
): string {
  if (status === 401) {
    return 'MODEL_AUTHENTICATION_FAILED'
  }

  if (status === 403) {
    return 'MODEL_PERMISSION_DENIED'
  }

  if (status === 429) {
    return 'MODEL_RATE_LIMITED'
  }

  if (status >= 500) {
    return 'MODEL_PROVIDER_UNAVAILABLE'
  }

  return 'MODEL_REQUEST_REJECTED'
}

function isRetryableHttpStatus(
  status: number,
): boolean {
  return (
    status === 408 ||
    status === 409 ||
    status === 429 ||
    status >= 500
  )
}

function getAssistantMessage(
  payload: JsonRecord,
): JsonRecord {
  if (!Array.isArray(payload.choices)) {
    fail({
      code:
        'INVALID_PROVIDER_RESPONSE',

      message:
        'O provedor não retornou a lista de respostas esperada.',

      status_code: 502,
      retryable: true,
    })
  }

  const firstChoice =
    payload.choices[0]

  if (!isRecord(firstChoice)) {
    fail({
      code:
        'INVALID_PROVIDER_RESPONSE',

      message:
        'O provedor não retornou uma resposta utilizável.',

      status_code: 502,
      retryable: true,
    })
  }

  const message =
    firstChoice.message

  if (!isRecord(message)) {
    fail({
      code:
        'INVALID_PROVIDER_RESPONSE',

      message:
        'A resposta do provedor não contém uma mensagem do assistente.',

      status_code: 502,
      retryable: true,
    })
  }

  const refusal =
    normalizeOptionalString(
      message.refusal,
    )

  if (refusal) {
    fail({
      code:
        'MODEL_REFUSAL',

      message:
        'O modelo recusou gerar o diagnóstico solicitado.',

      status_code: 502,
      retryable: false,
    })
  }

  return message
}

function getModelContent(
  payload: JsonRecord,
): string {
  const message =
    getAssistantMessage(
      payload,
    )

  const content =
    normalizeOptionalString(
      message.content,
    )

  if (!content) {
    fail({
      code:
        'EMPTY_MODEL_OUTPUT',

      message:
        'O modelo não retornou conteúdo para o diagnóstico.',

      status_code: 502,
      retryable: true,
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
        'O diagnóstico retornado ultrapassou o limite permitido.',

      status_code: 502,
      retryable: false,
    })
  }

  return content
}

function parseModelDiagnostic(
  content: string,
): JsonRecord {
  let parsed: unknown

  try {
    parsed =
      JSON.parse(content)
  } catch {
    fail({
      code:
        'INVALID_MODEL_JSON',

      message:
        'O modelo não retornou um objeto JSON válido.',

      status_code: 502,
      retryable: true,
    })
  }

  if (!isRecord(parsed)) {
    fail({
      code:
        'INVALID_MODEL_JSON',

      message:
        'O diagnóstico do modelo precisa ser um objeto JSON.',

      status_code: 502,
      retryable: true,
    })
  }

  return parsed
}

function normalizeModelEvidenceReferences(
  value: JsonRecord,
  input: CompanionDiagnosticInput,
): JsonRecord {
  const activeMessageIds =
    new Set(
      input.conversation
        .active_message_ids,
    )

  const sequenceToMessageId =
    new Map<
      string,
      string | null
    >()

  for (
    const message of
    input.conversation.messages
  ) {
    if (
      !activeMessageIds.has(
        message.id,
      )
    ) {
      continue
    }

    const sequenceKey =
      String(
        message.sequence,
      )

    const existingMessageId =
      sequenceToMessageId.get(
        sequenceKey,
      )

    if (
      existingMessageId ===
      undefined
    ) {
      sequenceToMessageId.set(
        sequenceKey,
        message.id,
      )

      continue
    }

    if (
      existingMessageId !==
      message.id
    ) {
      sequenceToMessageId.set(
        sequenceKey,
        null,
      )
    }
  }

  function normalizeEvidenceReference(
    reference: unknown,
  ): unknown {
    if (
      typeof reference !==
      'string'
    ) {
      return reference
    }

    const normalizedReference =
      reference.trim()

    if (
      activeMessageIds.has(
        normalizedReference,
      )
    ) {
      return normalizedReference
    }

    const canonicalMessageId =
      sequenceToMessageId.get(
        normalizedReference,
      )

    return (
      canonicalMessageId ??
      reference
    )
  }

  function normalizeNode(
    current: unknown,
    key: string | null = null,
  ): unknown {
    if (Array.isArray(current)) {
      if (
        key ===
        'evidence_message_ids'
      ) {
        return current.map(
          normalizeEvidenceReference,
        )
      }

      return current.map(
        (item) =>
          normalizeNode(
            item,
          ),
      )
    }

    if (!isRecord(current)) {
      return current
    }

    const normalizedRecord:
      JsonRecord = {}

    for (
      const [
        entryKey,
        entryValue,
      ] of Object.entries(
        current,
      )
    ) {
      normalizedRecord[entryKey] =
        normalizeNode(
          entryValue,
          entryKey,
        )
    }

    return normalizedRecord
  }

  return normalizeNode(
    value,
  ) as JsonRecord
}

function normalizeUnsubstantiatedSolutionFit(
  value: JsonRecord,
): JsonRecord {
  const solutionFit =
    value.solution_fit

  if (!isRecord(solutionFit)) {
    return value
  }

  const isConclusiveStatus =
    solutionFit.status === 'fit' ||
    solutionFit.status ===
      'partial_fit' ||
    solutionFit.status === 'misfit'

  const evidenceMessageIds =
    solutionFit
      .evidence_message_ids

  if (
    !isConclusiveStatus ||
    !Array.isArray(
      evidenceMessageIds,
    ) ||
    evidenceMessageIds.length > 0
  ) {
    return value
  }

  return {
    ...value,

    solution_fit: {
      ...solutionFit,

      status:
        'unknown',

      rationale:
        null,

      evidence_message_ids: [],
    },
  }
}

const COMMERCIAL_ROLE_VALUES = [
  'buyer',
  'provider',
  'unknown',
] as const

type CommercialRole =
  typeof COMMERCIAL_ROLE_VALUES[number]

function failCommercialRole(
  path: string,
  message: string,
): never {
  fail({
    code:
      'INVALID_MODEL_OUTPUT',

    message:
      'O modelo retornou um diagnóstico que viola o gate de papel comercial.',

    status_code: 502,
    retryable: false,

    details: {
      contract_error_code:
        'INVARIANT_VIOLATION',

      contract_error_path:
        path,

      commercial_role_error:
        message,
    },
  })
}

function requireEmptyCommercialArray(
  record: JsonRecord,
  key: string,
  path: string,
) {
  const value =
    record[key]

  if (
    !Array.isArray(value) ||
    value.length > 0
  ) {
    failCommercialRole(
      path,
      `${path} precisa ser uma lista vazia quando o contato não é comprador.`,
    )
  }
}

function validateCommercialRoleGate(
  value: JsonRecord,
  input: CompanionDiagnosticInput,
) {
  const roleRecord =
    value.commercial_role

  if (!isRecord(roleRecord)) {
    failCommercialRole(
      'commercial_role',
      'commercial_role precisa ser um objeto.',
    )
  }

  const rawRole =
    roleRecord
      .external_contact_role

  if (
    typeof rawRole !==
      'string' ||
    !COMMERCIAL_ROLE_VALUES
      .includes(
        rawRole as CommercialRole,
      )
  ) {
    failCommercialRole(
      'commercial_role.external_contact_role',
      'O papel comercial precisa ser buyer, provider ou unknown.',
    )
  }

  const role =
    rawRole as CommercialRole

  const evidence =
    roleRecord
      .evidence_message_ids

  if (!Array.isArray(evidence)) {
    failCommercialRole(
      'commercial_role.evidence_message_ids',
      'As evidências do papel comercial precisam ser uma lista.',
    )
  }

  const availableMessageIds =
    new Set(
      input.conversation
        .active_message_ids,
    )

  const normalizedEvidence:
    string[] = []

  for (
    let index = 0;
    index < evidence.length;
    index += 1
  ) {
    const evidenceId =
      evidence[index]

    if (
      typeof evidenceId !==
        'string' ||
      !evidenceId.trim()
    ) {
      failCommercialRole(
        `commercial_role.evidence_message_ids[${index}]`,
        'A evidência precisa possuir um ID textual válido.',
      )
    }

    const normalizedId =
      evidenceId.trim()

    if (
      !availableMessageIds.has(
        normalizedId,
      )
    ) {
      failCommercialRole(
        `commercial_role.evidence_message_ids[${index}]`,
        'A evidência do papel comercial não pertence à fotografia canônica.',
      )
    }

    if (
      !normalizedEvidence.includes(
        normalizedId,
      )
    ) {
      normalizedEvidence.push(
        normalizedId,
      )
    }
  }

  if (
    role !== 'unknown' &&
    normalizedEvidence.length ===
      0
  ) {
    failCommercialRole(
      'commercial_role.evidence_message_ids',
      'Buyer e provider exigem evidência explícita.',
    )
  }

  if (role === 'buyer') {
    if (
      value.commercial_relevance !==
      'commercial'
    ) {
      failCommercialRole(
        'commercial_relevance',
        'Buyer exige commercial_relevance=commercial.',
      )
    }

    return
  }

  const expectedRelevance =
    role === 'provider'
      ? 'non_commercial'
      : 'uncertain'

  if (
    value.commercial_relevance !==
    expectedRelevance
  ) {
    failCommercialRole(
      'commercial_relevance',
      `O papel ${role} exige commercial_relevance=${expectedRelevance}.`,
    )
  }

  if (
    role === 'unknown' &&
    (
      value.analysis_status !==
        'limited' ||
      !Array.isArray(
        value.analysis_limitations,
      ) ||
      !value.analysis_limitations
        .includes(
          'conversation_context_insufficient',
        ) ||
      value.confidence ===
        'high'
    )
  ) {
    failCommercialRole(
      'analysis_status',
      'Papel desconhecido exige análise limitada, contexto insuficiente e confiança não alta.',
    )
  }

  if (
    value.customer_intent !==
    null
  ) {
    failCommercialRole(
      'customer_intent',
      'Provider ou papel desconhecido não podem possuir intenção de compra.',
    )
  }

  requireEmptyCommercialArray(
    value,
    'needs',
    'needs',
  )

  requireEmptyCommercialArray(
    value,
    'unanswered_questions',
    'unanswered_questions',
  )

  requireEmptyCommercialArray(
    value,
    'active_objections',
    'active_objections',
  )

  const sellerAssessment =
    value.seller_assessment

  if (!isRecord(sellerAssessment)) {
    failCommercialRole(
      'seller_assessment',
      'seller_assessment precisa ser um objeto.',
    )
  }

  requireEmptyCommercialArray(
    sellerAssessment,
    'strengths',
    'seller_assessment.strengths',
  )

  requireEmptyCommercialArray(
    sellerAssessment,
    'risks',
    'seller_assessment.risks',
  )

  const salesMethod =
    value.sales_method

  if (!isRecord(salesMethod)) {
    failCommercialRole(
      'sales_method',
      'sales_method precisa ser um objeto.',
    )
  }

  if (
    salesMethod.current_step !==
    null
  ) {
    failCommercialRole(
      'sales_method.current_step',
      'Provider ou papel desconhecido não podem possuir etapa atual do método.',
    )
  }

  requireEmptyCommercialArray(
    salesMethod,
    'completed_steps',
    'sales_method.completed_steps',
  )

  requireEmptyCommercialArray(
    salesMethod,
    'skipped_steps',
    'sales_method.skipped_steps',
  )

  requireEmptyCommercialArray(
    salesMethod,
    'evidence_message_ids',
    'sales_method.evidence_message_ids',
  )

  const solutionFit =
    value.solution_fit

  if (!isRecord(solutionFit)) {
    failCommercialRole(
      'solution_fit',
      'solution_fit precisa ser um objeto.',
    )
  }

  if (
    solutionFit.status !==
      'unknown' ||
    solutionFit.rationale !==
      null
  ) {
    failCommercialRole(
      'solution_fit',
      'Provider ou papel desconhecido exigem adequação desconhecida.',
    )
  }

  requireEmptyCommercialArray(
    solutionFit,
    'evidence_message_ids',
    'solution_fit.evidence_message_ids',
  )

  const guidance =
    value.guidance

  if (!isRecord(guidance)) {
    failCommercialRole(
      'guidance',
      'guidance precisa ser um objeto.',
    )
  }

  if (
    guidance
      .intervention_required !==
      false ||
    guidance.next_move !== null ||
    guidance
      .recommended_question !==
      null ||
    guidance.suggested_message !==
      null
  ) {
    failCommercialRole(
      'guidance',
      'Provider ou papel desconhecido não podem gerar orientação comercial.',
    )
  }

  const crmSuggestion =
    value.crm_suggestion

  if (!isRecord(crmSuggestion)) {
    failCommercialRole(
      'crm_suggestion',
      'crm_suggestion precisa ser um objeto.',
    )
  }

  if (
    crmSuggestion
      .should_change_crm_stage !==
      false ||
    crmSuggestion
      .recommended_status !==
      null ||
    crmSuggestion
      .next_action_required !==
      false ||
    crmSuggestion
      .expected_next_action_at !==
      null
  ) {
    failCommercialRole(
      'crm_suggestion',
      'Provider ou papel desconhecido não podem gerar mudança de CRM ou Agenda.',
    )
  }
}

function validateModelDiagnostic(
  value: JsonRecord,
  input: CompanionDiagnosticInput,
): CompanionDiagnostic {
  const normalizedEvidenceValue =
    normalizeModelEvidenceReferences(
      value,
      input,
    )

  const normalizedValue =
    normalizeUnsubstantiatedSolutionFit(
      normalizedEvidenceValue,
    )

  validateCommercialRoleGate(
    normalizedValue,
    input,
  )

  const diagnosticValue:
    JsonRecord = {
      ...normalizedValue,
    }

  delete diagnosticValue
    .commercial_role

  try {
    return normalizeCompanionDiagnostic(
      diagnosticValue,
      buildValidationContext(
        input,
      ),
    )
  } catch (error) {
    if (
      error instanceof
      CompanionDiagnosticContractError
    ) {
      fail({
        code:
          'INVALID_MODEL_OUTPUT',

        message:
          'O modelo retornou um diagnóstico que viola o contrato comercial.',

        status_code: 502,
        retryable: false,

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

function getUsage(
  payload: JsonRecord,
): CompanionDiagnosticUsage | null {
  if (!isRecord(payload.usage)) {
    return null
  }

  const usage = {
    input_tokens:
      normalizeTokenCount(
        payload.usage
          .prompt_tokens,
      ),

    output_tokens:
      normalizeTokenCount(
        payload.usage
          .completion_tokens,
      ),

    total_tokens:
      normalizeTokenCount(
        payload.usage
          .total_tokens,
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

function isAbortError(
  error: unknown,
): boolean {
  return (
    error instanceof DOMException &&
    error.name === 'AbortError'
  ) || (
    isRecord(error) &&
    error.name === 'AbortError'
  )
}

function ensurePlanMatchesInput(
  plan: CompanionDiagnosticExecutionPlan,
  input: CompanionDiagnosticInput,
) {
  if (
    input.diagnostic_contract_version !==
    COMPANION_DIAGNOSTIC_CONTRACT_VERSION
  ) {
    fail({
      code:
        'INVALID_DIAGNOSTIC_INPUT',

      message:
        'A entrada utiliza uma versão incompatível do contrato.',

      status_code: 500,
      retryable: false,
    })
  }

  if (
    plan.mode === 'model' &&
    input.analysis_precondition
      .status === 'blocked'
  ) {
    fail({
      code:
        'EXECUTION_PLAN_MISMATCH',

      message:
        'Uma entrada bloqueada não pode possuir plano de execução por modelo.',

      status_code: 500,
      retryable: false,
    })
  }

  if (
    plan.mode === 'blocked' &&
    input.analysis_precondition
      .status !== 'blocked'
  ) {
    fail({
      code:
        'EXECUTION_PLAN_MISMATCH',

      message:
        'Um plano bloqueado exige uma entrada bloqueada.',

      status_code: 500,
      retryable: false,
    })
  }
}

export async function executeCompanionDiagnosticPlan({
  plan,
  input,
  options = {},
}: {
  plan:
    CompanionDiagnosticExecutionPlan

  input:
    CompanionDiagnosticInput

  options?:
    CompanionDiagnosticModelOptions
}): Promise<
  CompanionDiagnosticExecutionResult
> {
  ensurePlanMatchesInput(
    plan,
    input,
  )

  if (plan.mode === 'blocked') {
    return {
      diagnostic:
        validateBlockedResult(
          plan,
          input,
        ),

      execution: {
        mode: 'blocked',
        provider:
          'deterministic',
        model: null,
        request_id: null,
        usage: null,
      },
    }
  }

  const apiKey =
    resolveApiKey(options)

  if (!apiKey) {
    fail({
      code:
        'MODEL_NOT_CONFIGURED',

      message:
        'OPENAI_API_KEY não está configurada para o diagnóstico V2.',

      status_code: 503,
      retryable: false,
    })
  }

  const model =
    resolveModel(options)

  const timeout =
    normalizeTimeout(
      options.timeout_ms,
    )

  const fetchImpl =
    options.fetch_impl ??
    fetch

  const controller =
    new AbortController()

  const timeoutHandle =
    setTimeout(
      () => {
        controller.abort()
      },
      timeout,
    )

  let response: Response

  try {
    response =
      await fetchImpl(
        OPENAI_CHAT_COMPLETIONS_URL,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',

            Authorization:
              `Bearer ${apiKey}`,
          },

          signal:
            controller.signal,

          body: JSON.stringify({
            model,

            temperature:
              0.1,

            response_format: {
              type:
                'json_object',
            },

            messages: [
              {
                role:
                  'system',

                content:
                  plan.request
                    .system_prompt,
              },

              {
                role:
                  'user',

                content:
                  plan.request
                    .user_prompt,
              },
            ],
          }),
        },
      )
  } catch (error) {
    if (
      controller.signal.aborted ||
      isAbortError(error)
    ) {
      fail({
        code:
          'MODEL_TIMEOUT',

        message:
          'O diagnóstico excedeu o tempo máximo de execução.',

        status_code: 504,
        retryable: true,
      })
    }

    fail({
      code:
        'MODEL_NETWORK_ERROR',

      message:
        'Não foi possível acessar o provedor do diagnóstico.',

      status_code: 502,
      retryable: true,
    })
  } finally {
    clearTimeout(
      timeoutHandle,
    )
  }

  let responseText: string

  try {
    responseText =
      await response.text()
  } catch {
    fail({
      code:
        'MODEL_RESPONSE_READ_FAILED',

      message:
        'Não foi possível ler a resposta do provedor do diagnóstico.',

      status_code: 502,
      retryable: true,

      details: {
        provider_status:
          response.status,
      },
    })
  }

  const payload =
    parseProviderEnvelope(
      responseText,
    )

  if (!response.ok) {
    fail({
      code:
        getProviderHttpErrorCode(
          response.status,
        ),

      message:
        getProviderHttpErrorMessage(
          response.status,
        ),

      status_code:
        response.status,

      retryable:
        isRetryableHttpStatus(
          response.status,
        ),

      details: {
        provider_status:
          response.status,
      },
    })
  }

  const content =
    getModelContent(
      payload,
    )

  const rawDiagnostic =
    parseModelDiagnostic(
      content,
    )

  const diagnostic =
    validateModelDiagnostic(
      rawDiagnostic,
      input,
    )

  return {
    diagnostic,

    execution: {
      mode: 'model',
      provider: 'openai',

      model:
        normalizeOptionalString(
          payload.model,
        ) || model,

      request_id:
        normalizeOptionalString(
          response.headers.get(
            'x-request-id',
          ),
        ),

      usage:
        getUsage(payload),
    },
  }
}
