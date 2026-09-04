// ============================================================================
// Message Intelligence Engine V2 — Semantic Critic
// Executor
//
// Chamada única (sem repair próprio de formato — Structured Outputs em
// modo estrito já garante o shape; uma falha aqui é tratada como falha
// técnica do critic, não como sinal de conteúdo a reparar). O runner
// decide o que fazer com o veredito (pass/repair/block) e é responsável
// pelo orçamento de UMA regeneração da mensagem primária quando
// verdict='repair'.
// ============================================================================

import {
  MESSAGE_INTELLIGENCE_V2_CRITIC_MODEL_OUTPUT_FIELDS,
  MESSAGE_INTELLIGENCE_V2_CRITIC_REASON_CODES,
  MESSAGE_INTELLIGENCE_V2_CRITIC_VERDICTS,
  MESSAGE_INTELLIGENCE_V2_CRITIC_CONTRACT_VERSION,
  type MessageIntelligenceV2CriticOutput,
  type MessageIntelligenceV2CriticReasonCode,
  type MessageIntelligenceV2CriticVerdict,
} from './critic-contract'

import {
  MESSAGE_INTELLIGENCE_V2_CRITIC_STRUCTURED_OUTPUT_FORMAT,
} from './critic-json-schema'

import type {
  MessageIntelligenceV2CriticExecutionPlan,
} from './critic-execution-plan'

import {
  StatefulCopilotExecutionError,
  type StatefulCopilotProvider,
  type StatefulCopilotProviderResponse,
  type StatefulCopilotUsage,
} from '../../stateful-copilot-executor'

const MAX_MODEL_CONTENT_LENGTH = 20_000
const MAX_CONCISE_FEEDBACK_LENGTH = 500

type JsonRecord = Record<string, unknown>

const CRITIC_OUTPUT_FIELDS = new Set<string>(
  MESSAGE_INTELLIGENCE_V2_CRITIC_MODEL_OUTPUT_FIELDS,
)

export type MessageIntelligenceV2CriticExecution = {
  mode: 'model'
  provider: string
  model: string | null
  request_id: string | null
  usage: StatefulCopilotUsage | null
}

export type MessageIntelligenceV2CriticExecutionResult = {
  output: MessageIntelligenceV2CriticOutput
  execution: MessageIntelligenceV2CriticExecution
}

export class MessageIntelligenceV2CriticExecutionError
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
      'MessageIntelligenceV2CriticExecutionError'
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
  throw new MessageIntelligenceV2CriticExecutionError(
    {
      code,
      message,
      status_code,
      retryable,
      details,
    },
  )
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

  const normalized = value.trim()

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

function normalizeUsage(
  value: unknown,
): StatefulCopilotUsage | null {
  if (!isRecord(value)) {
    return null
  }

  const usage = {
    input_tokens: normalizeTokenCount(
      value.input_tokens,
    ),
    output_tokens: normalizeTokenCount(
      value.output_tokens,
    ),
    total_tokens: normalizeTokenCount(
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

function requireProviderName(
  value: unknown,
): string {
  const provider =
    normalizeNullableString(value)

  if (!provider) {
    fail({
      code:
        'INVALID_V2_CRITIC_PROVIDER_RESPONSE',
      message:
        'O provedor do critic semântico não declarou uma identificação válida.',
      status_code: 502,
      retryable: false,
    })
  }

  return provider
}

function parseCriticModelOutput(
  content: unknown,
): JsonRecord {
  if (typeof content !== 'string') {
    fail({
      code:
        'INVALID_V2_CRITIC_PROVIDER_RESPONSE',
      message:
        'O provedor do critic semântico não retornou conteúdo textual válido.',
      status_code: 502,
      retryable: false,
    })
  }

  if (
    content.length >
    MAX_MODEL_CONTENT_LENGTH
  ) {
    fail({
      code: 'V2_CRITIC_OUTPUT_TOO_LARGE',
      message:
        'A saída do critic semântico ultrapassou o limite permitido.',
      status_code: 502,
      retryable: false,
    })
  }

  const normalized = content.trim()

  if (!normalized) {
    fail({
      code: 'EMPTY_V2_CRITIC_OUTPUT',
      message:
        'O critic semântico não retornou conteúdo.',
      status_code: 502,
      retryable: false,
    })
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(normalized)
  } catch {
    fail({
      code: 'INVALID_V2_CRITIC_JSON',
      message:
        'O critic semântico não retornou JSON válido.',
      status_code: 502,
      retryable: false,
    })
  }

  if (!isRecord(parsed)) {
    fail({
      code: 'INVALID_V2_CRITIC_JSON',
      message:
        'A saída do critic semântico precisa ser um objeto JSON.',
      status_code: 502,
      retryable: false,
    })
  }

  return parsed
}

function requireBoolean(
  value: unknown,
  path: string,
): boolean {
  if (typeof value !== 'boolean') {
    fail({
      code: 'INVALID_V2_CRITIC_OUTPUT',
      message: `${path} precisa ser booleano.`,
      status_code: 502,
      retryable: false,
    })
  }

  return value
}

function requireVerdict(
  value: unknown,
): MessageIntelligenceV2CriticVerdict {
  if (
    typeof value !== 'string' ||
    !(
      MESSAGE_INTELLIGENCE_V2_CRITIC_VERDICTS as readonly string[]
    ).includes(value)
  ) {
    fail({
      code: 'INVALID_V2_CRITIC_OUTPUT',
      message: 'verdict possui um valor inválido.',
      status_code: 502,
      retryable: false,
    })
  }

  return value as MessageIntelligenceV2CriticVerdict
}

function requireReasonCodes(
  value: unknown,
): MessageIntelligenceV2CriticReasonCode[] {
  if (!Array.isArray(value)) {
    fail({
      code: 'INVALID_V2_CRITIC_OUTPUT',
      message: 'reason_codes precisa ser uma lista.',
      status_code: 502,
      retryable: false,
    })
  }

  const allowed = new Set<string>(
    MESSAGE_INTELLIGENCE_V2_CRITIC_REASON_CODES,
  )

  return value.map(item => {
    if (
      typeof item !== 'string' ||
      !allowed.has(item)
    ) {
      fail({
        code: 'INVALID_V2_CRITIC_OUTPUT',
        message: `reason_codes contém um valor inválido: ${String(item)}.`,
        status_code: 502,
        retryable: false,
      })
    }

    return item as MessageIntelligenceV2CriticReasonCode
  })
}

function requireUnsupportedClaimIndexes(
  value: unknown,
  claimCount: number,
): number[] {
  if (!Array.isArray(value)) {
    fail({
      code: 'INVALID_V2_CRITIC_OUTPUT',
      message:
        'unsupported_claim_indexes precisa ser uma lista.',
      status_code: 502,
      retryable: false,
    })
  }

  return value.map(item => {
    if (
      typeof item !== 'number' ||
      !Number.isInteger(item) ||
      item < 0 ||
      item >= claimCount
    ) {
      fail({
        code: 'INVALID_V2_CRITIC_OUTPUT',
        message: `unsupported_claim_indexes referencia um índice fora do intervalo de grounded_claims: ${String(item)}.`,
        status_code: 502,
        retryable: false,
      })
    }

    return item
  })
}

function requireConciseFeedback(
  value: unknown,
  verdict: MessageIntelligenceV2CriticVerdict,
): string | null {
  if (value === null) {
    if (verdict !== 'pass') {
      fail({
        code: 'INVALID_V2_CRITIC_OUTPUT',
        message:
          'concise_feedback é obrigatório quando verdict não é "pass".',
        status_code: 502,
        retryable: false,
      })
    }

    return null
  }

  if (typeof value !== 'string') {
    fail({
      code: 'INVALID_V2_CRITIC_OUTPUT',
      message:
        'concise_feedback precisa ser um texto ou null.',
      status_code: 502,
      retryable: false,
    })
  }

  const normalized = value.trim()

  if (
    !normalized ||
    normalized.length >
      MAX_CONCISE_FEEDBACK_LENGTH
  ) {
    fail({
      code: 'INVALID_V2_CRITIC_OUTPUT',
      message:
        'concise_feedback possui um texto inválido.',
      status_code: 502,
      retryable: false,
    })
  }

  return normalized
}

function normalizeCriticOutput({
  value,
  claimCount,
}: {
  value: JsonRecord
  claimCount: number
}): MessageIntelligenceV2CriticOutput {
  const fieldNames = Object.keys(value)

  const missingField = [
    ...CRITIC_OUTPUT_FIELDS,
  ].find(
    fieldName =>
      !Object.prototype.hasOwnProperty.call(
        value,
        fieldName,
      ),
  )

  if (missingField) {
    fail({
      code: 'INVALID_V2_CRITIC_OUTPUT',
      message: `O critic semântico não retornou o campo obrigatório ${missingField}.`,
      status_code: 502,
      retryable: false,
    })
  }

  if (
    fieldNames.length !==
      CRITIC_OUTPUT_FIELDS.size ||
    fieldNames.some(
      fieldName =>
        !CRITIC_OUTPUT_FIELDS.has(
          fieldName,
        ),
    )
  ) {
    fail({
      code: 'INVALID_V2_CRITIC_OUTPUT',
      message:
        'O critic semântico retornou campos incompatíveis com o contrato.',
      status_code: 502,
      retryable: false,
    })
  }

  const verdict = requireVerdict(
    value.verdict,
  )

  const output: MessageIntelligenceV2CriticOutput = {
    contract_version:
      MESSAGE_INTELLIGENCE_V2_CRITIC_CONTRACT_VERSION,

    verdict,

    reason_codes: requireReasonCodes(
      value.reason_codes,
    ),

    unsupported_claim_indexes:
      requireUnsupportedClaimIndexes(
        value.unsupported_claim_indexes,
        claimCount,
      ),

    missing_grounded_claim:
      requireBoolean(
        value.missing_grounded_claim,
        'missing_grounded_claim',
      ),

    claim_source_mismatch:
      requireBoolean(
        value.claim_source_mismatch,
        'claim_source_mismatch',
      ),

    semantic_mismatch: requireBoolean(
      value.semantic_mismatch,
      'semantic_mismatch',
    ),

    repeated_resolved_question:
      requireBoolean(
        value.repeated_resolved_question,
        'repeated_resolved_question',
      ),

    commitment_assumption:
      requireBoolean(
        value.commitment_assumption,
        'commitment_assumption',
      ),

    seller_intent_became_fact:
      requireBoolean(
        value.seller_intent_became_fact,
        'seller_intent_became_fact',
      ),

    seller_intent_not_executed:
      requireBoolean(
        value.seller_intent_not_executed,
        'seller_intent_not_executed',
      ),

    unnatural_seller_message:
      requireBoolean(
        value.unnatural_seller_message,
        'unnatural_seller_message',
      ),

    method_violation: requireBoolean(
      value.method_violation,
      'method_violation',
    ),

    concise_feedback:
      requireConciseFeedback(
        value.concise_feedback,
        verdict,
      ),
  }

  requireCriticCrossFieldConsistency(output)

  return output
}

// O schema/tipos por si só permitem verdict="pass" junto de
// missing_grounded_claim=true, ou verdict="block" sem nenhum reason_code
// nem boolean marcado — combinações estruturalmente válidas, mas
// semanticamente contraditórias que o runner nunca deveria aceitar como
// "pass" ou "repair/block" legítimo. Esta checagem fecha essa lacuna.
const CRITIC_BOOLEAN_TO_REASON_CODE = [
  [
    'missing_grounded_claim',
    'missing_grounded_claim',
  ],
  [
    'claim_source_mismatch',
    'claim_source_mismatch',
  ],
  ['semantic_mismatch', 'semantic_mismatch'],
  [
    'repeated_resolved_question',
    'repeated_resolved_question',
  ],
  [
    'commitment_assumption',
    'commitment_assumption',
  ],
  [
    'seller_intent_became_fact',
    'seller_intent_became_fact',
  ],
  [
    'seller_intent_not_executed',
    'seller_intent_not_executed',
  ],
  [
    'unnatural_seller_message',
    'unnatural_seller_message',
  ],
  ['method_violation', 'method_violation'],
] as const

function requireCriticCrossFieldConsistency(
  output: MessageIntelligenceV2CriticOutput,
) {
  const booleanFields = [
    output.missing_grounded_claim,
    output.claim_source_mismatch,
    output.semantic_mismatch,
    output.repeated_resolved_question,
    output.commitment_assumption,
    output.seller_intent_became_fact,
    output.seller_intent_not_executed,
    output.unnatural_seller_message,
    output.method_violation,
  ]

  const anyBooleanTrue = booleanFields.some(
    Boolean,
  )

  if (output.verdict === 'pass') {
    if (
      output.reason_codes.length > 0 ||
      output.unsupported_claim_indexes
        .length > 0 ||
      anyBooleanTrue ||
      output.concise_feedback !== null
    ) {
      fail({
        code:
          'INVALID_V2_CRITIC_OUTPUT_INCONSISTENT',
        message:
          'verdict="pass" não pode vir acompanhado de reason_codes, unsupported_claim_indexes, um boolean de falha true ou concise_feedback não nulo.',
        status_code: 502,
        retryable: false,
      })
    }

    return
  }

  // verdict é "repair" ou "block" a partir daqui.
  if (
    output.reason_codes.length === 0 &&
    output.unsupported_claim_indexes
      .length === 0 &&
    !anyBooleanTrue
  ) {
    fail({
      code:
        'INVALID_V2_CRITIC_OUTPUT_INCONSISTENT',
      message: `verdict="${output.verdict}" precisa de pelo menos um sinal concreto de falha (reason_codes, unsupported_claim_indexes ou um boolean true).`,
      status_code: 502,
      retryable: false,
    })
  }

  for (
    const [field, reasonCode] of
    CRITIC_BOOLEAN_TO_REASON_CODE
  ) {
    const booleanTrue = output[field]

    const reasonCodePresent =
      output.reason_codes.includes(
        reasonCode,
      )

    if (booleanTrue && !reasonCodePresent) {
      fail({
        code:
          'INVALID_V2_CRITIC_OUTPUT_INCONSISTENT',
        message: `${field}=true precisa que reason_codes contenha "${reasonCode}".`,
        status_code: 502,
        retryable: false,
      })
    }

    if (reasonCodePresent && !booleanTrue) {
      fail({
        code:
          'INVALID_V2_CRITIC_OUTPUT_INCONSISTENT',
        message: `reason_codes conter "${reasonCode}" precisa que ${field}=true.`,
        status_code: 502,
        retryable: false,
      })
    }
  }

  if (
    output.unsupported_claim_indexes.length >
      0 &&
    !output.reason_codes.includes(
      'unsupported_claim',
    ) &&
    !output.reason_codes.includes(
      'claim_source_mismatch',
    )
  ) {
    fail({
      code:
        'INVALID_V2_CRITIC_OUTPUT_INCONSISTENT',
      message:
        'unsupported_claim_indexes não vazio precisa que reason_codes contenha "unsupported_claim" ou "claim_source_mismatch".',
      status_code: 502,
      retryable: false,
    })
  }
}

function validatePlan(
  plan: MessageIntelligenceV2CriticExecutionPlan,
) {
  if (
    !plan.system_prompt.trim() ||
    !plan.user_prompt.trim()
  ) {
    fail({
      code: 'INVALID_V2_CRITIC_PLAN',
      message:
        'O plano de execução do critic semântico é inválido.',
      status_code: 500,
      retryable: false,
    })
  }
}

export async function executeMessageIntelligenceV2CriticAttempt({
  plan,
  provider,
}: {
  plan:
    MessageIntelligenceV2CriticExecutionPlan
  provider: StatefulCopilotProvider
}): Promise<MessageIntelligenceV2CriticExecutionResult> {
  validatePlan(plan)

  let response: StatefulCopilotProviderResponse

  try {
    response = await provider({
      prompt_version: plan.prompt_version,
      output_contract_version:
        plan.output_contract_version,
      system_prompt: plan.system_prompt,
      user_prompt: plan.user_prompt,
      structured_output_format:
        MESSAGE_INTELLIGENCE_V2_CRITIC_STRUCTURED_OUTPUT_FORMAT,
    })
  } catch (error) {
    if (
      error instanceof
      StatefulCopilotExecutionError
    ) {
      throw error
    }

    fail({
      code: 'V2_CRITIC_PROVIDER_REQUEST_FAILED',
      message:
        'Não foi possível executar o provedor do critic semântico.',
      status_code: 502,
      retryable: false,
    })
  }

  if (!isRecord(response)) {
    fail({
      code:
        'INVALID_V2_CRITIC_PROVIDER_RESPONSE',
      message:
        'O provedor do critic semântico retornou uma resposta inválida.',
      status_code: 502,
      retryable: false,
    })
  }

  const rawOutput = parseCriticModelOutput(
    response.content,
  )

  return {
    output: normalizeCriticOutput({
      value: rawOutput,
      claimCount: plan.claim_count,
    }),

    execution: {
      mode: 'model',
      provider: requireProviderName(
        response.provider,
      ),
      model: normalizeNullableString(
        response.model,
      ),
      request_id: normalizeNullableString(
        response.request_id,
      ),
      usage: normalizeUsage(response.usage),
    },
  }
}
