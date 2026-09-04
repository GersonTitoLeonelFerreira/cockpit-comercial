// ============================================================================
// Message Intelligence Engine V2 — Executor
//
// PRIMARY GENERATION -> VALIDAÇÃO DETERMINÍSTICA -> PASS / REPAIRABLE FAIL /
// BLOCKING FAIL -> (no máximo 1 repair) -> resultado final.
//
// A Yolen não confia no output do modelo. Todo output passa por: schema
// estrito, IDs de evidência existentes, grounded_claims referenciando fonte
// real, fatos protegidos (valor/percentual/data/horário) sustentados pelo
// contexto publicado/estado ativo, disciplina de commitment_status
// (proposed != confirmed), e ausência de vazamento de internals na
// mensagem final. seller_intent nunca é uma fonte de evidência válida
// porque nunca aparece nos conjuntos de IDs permitidos.
// ============================================================================

import {
  COMMERCIAL_OBJECTIVES,
  type CommercialObjectiveV1,
} from '../strategy-contracts'

import {
  MESSAGE_INTELLIGENCE_V2_EVIDENCE_SOURCES,
  MESSAGE_INTELLIGENCE_V2_GENERATION_CONTRACT_VERSION,
  MESSAGE_INTELLIGENCE_V2_MODEL_OUTPUT_FIELDS,
  MESSAGE_INTELLIGENCE_V2_TURN_RELEVANCE_VALUES,
  type MessageIntelligenceV2EvidenceSource,
  type MessageIntelligenceV2GroundedClaimV1,
  type MessageIntelligenceV2Output,
} from './generation-contract'

import {
  buildMessageIntelligenceV2RepairExecutionPlan,
  MESSAGE_INTELLIGENCE_V2_PROMPT_VERSION,
  type MessageIntelligenceV2ExecutionPlan,
  type MessageIntelligenceV2NormalizationContext,
} from './execution-plan'

import {
  MESSAGE_INTELLIGENCE_V2_STRUCTURED_OUTPUT_FORMAT,
} from './generation-json-schema'

import {
  StatefulCopilotExecutionError,
  type StatefulCopilotProvider,
  type StatefulCopilotProviderResponse,
  type StatefulCopilotUsage,
} from '../../stateful-copilot-executor'

const MAX_MODEL_CONTENT_LENGTH = 100_000

const RETRYABLE_V2_OUTPUT_CODES = new Set([
  'EMPTY_V2_OUTPUT',
  'INVALID_V2_JSON',
  'INVALID_V2_OUTPUT',
  'V2_EVIDENCE_MESSAGE_UNAUTHORIZED',
  'V2_EVIDENCE_MEMORY_UNAUTHORIZED',
  'V2_GROUNDED_CLAIM_REF_INVALID',
  'V2_UNSUPPORTED_PROTECTED_FACT',
  'V2_UNSUPPORTED_COMMITMENT_CONFIRMATION',
  'V2_NO_INTERVENTION_REQUIRES_SILENCE',
  'V2_MESSAGE_LEAKS_INTERNALS',
  'V2_UNGROUNDED_FACTUAL_CLAIM',
  'V2_SAFETY_SELF_CHECK_NEGATIVE',
])

const V2_OUTPUT_FIELDS = new Set<string>(
  MESSAGE_INTELLIGENCE_V2_MODEL_OUTPUT_FIELDS,
)

type JsonRecord = Record<string, unknown>

export type MessageIntelligenceV2Execution = {
  mode: 'model'
  provider: string
  model: string | null
  request_id: string | null

  usage: StatefulCopilotUsage | null

  attempts: 1 | 2
  recovered_after_retry: boolean
}

export type MessageIntelligenceV2ExecutionResult = {
  output: MessageIntelligenceV2Output
  execution: MessageIntelligenceV2Execution
}

export class MessageIntelligenceV2ExecutionError
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
      'MessageIntelligenceV2ExecutionError'
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
  throw new MessageIntelligenceV2ExecutionError({
    code,
    message,
    status_code,
    retryable,
    details,
  })
}

type FailureMetadata = {
  path: string
  invariant: string
}

function buildFailureDetails({
  path,
  invariant,
}: FailureMetadata): JsonRecord {
  return {
    v2_failure_path: path,
    v2_failure_invariant: invariant,
  }
}

function failInvalid({
  code,
  message,
  path,
  invariant,
}: FailureMetadata & {
  code: string
  message: string
}): never {
  fail({
    code,
    message,
    status_code: 502,
    retryable: true,
    details: buildFailureDetails({
      path,
      invariant,
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

function isStringArray(
  value: unknown,
): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(
      item => typeof item === 'string',
    )
  )
}

function requireString(
  value: unknown,
  path: string,
  maximumLength: number,
): string {
  if (typeof value !== 'string') {
    failInvalid({
      code: 'INVALID_V2_OUTPUT',
      message: `${path} precisa ser um texto.`,
      path,
      invariant: 'TEXT_REQUIRED',
    })
  }

  const normalized = value.trim()

  if (!normalized) {
    failInvalid({
      code: 'INVALID_V2_OUTPUT',
      message: `${path} possui um texto vazio.`,
      path,
      invariant: 'NON_EMPTY_TEXT',
    })
  }

  if (normalized.length > maximumLength) {
    failInvalid({
      code: 'INVALID_V2_OUTPUT',
      message: `${path} excede o tamanho máximo permitido.`,
      path,
      invariant: 'TEXT_LENGTH_LIMIT',
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
        'INVALID_V2_PROVIDER_RESPONSE',
      message:
        'O provedor do MIE V2 não declarou uma identificação válida.',
      status_code: 502,
      retryable: true,
    })
  }

  return provider
}

function normalizeAscii(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase('pt-BR')
}

function normalizeForGrounding(
  value: string,
): string {
  return value
    .normalize('NFKC')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLocaleLowerCase('pt-BR')
}

function getProtectedFacts(
  value: string,
): string[] {
  return (
    value.match(
      /R\$\s*\d[\d.,]*|\b\d+(?:[.,]\d+)?\s*%|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b|\b\d{1,2}h(?:\d{2})?\b/giu,
    ) ?? []
  )
}

function hasUnsupportedProtectedFact({
  message,
  allowedContext,
}: {
  message: string
  allowedContext: string
}): boolean {
  const normalizedContext =
    normalizeForGrounding(allowedContext)

  return getProtectedFacts(message).some(
    fact =>
      !normalizedContext.includes(
        normalizeForGrounding(fact),
      ),
  )
}

const CONFIRMATION_LANGUAGE_PATTERNS = [
  /\bcombinad[oa]s?\b/u,
  /\bcombin(?:amos|ei|o)\b/u,
  /\bconfirmad[oa]s?\b/u,
  /\bconfirm(?:amos|ei|o|ando)\b/u,
  /\bmarcad[oa]\b/u,
] as const

function hasConfirmationLanguage(
  text: string,
): boolean {
  const normalized = normalizeAscii(text)

  return CONFIRMATION_LANGUAGE_PATTERNS.some(
    pattern => pattern.test(normalized),
  )
}

const INTERNAL_LEAKAGE_PATTERNS = [
  /\bMIE\b/u,
  /message intelligence engine/iu,
  /segundo o m[eé]todo/iu,
  /minha an[aá]lise/iu,
  /\bscore\b/iu,
  /"evidence_message_ids"/iu,
  /"memory_id"/iu,
  /\bcontract_version\b/iu,
  /grounded_claims/iu,
  /^\s*[{[]/u,
] as const

function leaksInternals(text: string): boolean {
  return INTERNAL_LEAKAGE_PATTERNS.some(
    pattern => pattern.test(text),
  )
}

function requireEvidenceSubset({
  ids,
  allowed,
  path,
  invariant,
}: {
  ids: string[]
  allowed: readonly string[]
  path: string
  invariant: string
}) {
  const allowedSet = new Set(allowed)

  for (const id of ids) {
    if (!allowedSet.has(id)) {
      failInvalid({
        code:
          invariant === 'MESSAGE'
            ? 'V2_EVIDENCE_MESSAGE_UNAUTHORIZED'
            : 'V2_EVIDENCE_MEMORY_UNAUTHORIZED',
        message: `${path} referencia um ID não autorizado: ${id}.`,
        path,
        invariant,
      })
    }
  }
}

function requireGroundedClaimRefs({
  claims,
  context,
}: {
  claims: MessageIntelligenceV2GroundedClaimV1[]
  context: MessageIntelligenceV2NormalizationContext
}) {
  const evidence = context.allowed_evidence

  const sets: Record<
    MessageIntelligenceV2EvidenceSource,
    Set<string>
  > = {
    message: new Set(evidence.message_ids),
    memory: new Set(evidence.memory_ids),
    product: new Set(evidence.product_ids),
    fact: new Set(evidence.fact_ids),
    method: new Set(
      evidence.method_id
        ? [evidence.method_id]
        : [],
    ),
  }

  claims.forEach((claim, index) => {
    const allowedIds =
      sets[claim.supported_by.source]

    if (
      !allowedIds ||
      !allowedIds.has(
        claim.supported_by.id,
      )
    ) {
      failInvalid({
        code: 'V2_GROUNDED_CLAIM_REF_INVALID',
        message: `grounded_claims[${index}] referencia uma fonte inexistente ou não autorizada.`,
        path: `grounded_claims[${index}].supported_by`,
        invariant:
          'GROUNDED_CLAIM_REF_INVALID',
      })
    }
  })
}

// Categorias de afirmação factual/comercial que exigem prova (mesma lista
// de categorias pedida na auditoria: produto, benefício, diferencial,
// funcionalidade, preço, desconto, prazo, garantia/ROI, disponibilidade/
// condição, comparação). Não é regex por frase — é uma lista pequena e
// estável de conceitos, no mesmo espírito do GROUNDED_CONCEPTS já provado
// em lead-seller-message.ts. Linguagem de confirmação de compromisso já
// tem seu próprio gate (requireCommitmentConfirmationSupport) e fica de
// fora daqui para não duplicar/colidir motivo de falha.
const CLAIM_CONCEPTS = [
  {
    code: 'product_feature',
    pattern:
      /\b(funcionalidad\w*|recursos?|integra[cç][aã]o|integr\w*|automatiz\w*|compat[íi]vel\w*|m[óo]dulos?)\b/u,
  },
  {
    code: 'benefit_differentiator',
    pattern:
      /\b(benef[íi]cios?|diferenciais?|diferencial|vantagens?)\b/u,
  },
  {
    code: 'pricing',
    pattern:
      /\b(pre[çc]os?|valor(?:es)?|investimento|mensalidade|custos?)\b/u,
  },
  {
    code: 'discount',
    pattern:
      /\b(descontos?|promo[çc][aã]o|gr[áa]tis|isent\w*)\b/u,
  },
  {
    code: 'deadline_guarantee',
    pattern:
      /\b(prazos?|garantias?|promet\w*)\b/u,
  },
  {
    code: 'roi_result',
    pattern:
      /\broi\b|\bretorno sobre\b|\bpercentual de resultado\b/u,
  },
  {
    code: 'availability_condition',
    pattern:
      /\bdispon[íi]ve\w*|\bdisponibilidade\b|\bpol[íi]tica\b|\bcondi[çc][aã]o\b|\bcondi[çc][oõ]es\b/u,
  },
  {
    code: 'comparison',
    pattern:
      /\bconcorrentes?\b|\bcompar\w*/u,
  },
] as const

function findTriggeredConcepts(
  text: string,
): Set<string> {
  const normalized = normalizeAscii(text)
  const result = new Set<string>()

  for (const concept of CLAIM_CONCEPTS) {
    if (concept.pattern.test(normalized)) {
      result.add(concept.code)
    }
  }

  return result
}

function salientTokens(
  value: string,
): string[] {
  return normalizeAscii(value)
    .replace(/[^a-z0-9\s]/gu, ' ')
    .split(/\s+/u)
    .filter(token => token.length >= 5)
}

// Não basta o ID citado existir (já verificado em requireGroundedClaimRefs)
// — a fonte citada precisa realmente conter o que a claim afirma. Overlap
// de tokens salientes (>=5 caracteres) é o mesmo tipo de heurística já
// comprovada em hard-gates.ts (semanticMatch) e lead-seller-message.ts
// (GROUNDED_CONCEPTS), adaptada para comparar claim vs. conteúdo real da
// fonte específica em vez de um blob genérico de contexto.
function claimSupportedBySourceText({
  claimText,
  sourceText,
}: {
  claimText: string
  sourceText: string
}): boolean {
  const claimTokens = new Set(
    salientTokens(claimText),
  )

  if (claimTokens.size === 0) {
    return true
  }

  const sourceTokens = new Set(
    salientTokens(sourceText),
  )

  let hits = 0

  for (const token of claimTokens) {
    if (sourceTokens.has(token)) {
      hits += 1
    }
  }

  return (
    hits >=
    Math.min(2, claimTokens.size)
  )
}

function requireFactualClaimCoverage({
  message,
  claims,
  context,
}: {
  message: string
  claims: MessageIntelligenceV2GroundedClaimV1[]
  context: MessageIntelligenceV2NormalizationContext
}) {
  // Cobertura: uma mensagem que faz uma afirmação de categoria
  // factual/comercial (produto, benefício, preço, prazo etc.) precisa
  // declarar pelo menos uma grounded_claim. Sem isso, uma afirmação
  // qualitativa sem prova nenhuma passaria despercebida.
  if (
    findTriggeredConcepts(message).size >
      0 &&
    claims.length === 0
  ) {
    failInvalid({
      code: 'V2_UNGROUNDED_FACTUAL_CLAIM',
      message:
        'A mensagem faz uma afirmação comercial verificável sem nenhuma grounded_claim declarada.',
      path: 'grounded_claims',
      invariant:
        'FACTUAL_CLAIM_COVERAGE_MISSING',
    })
  }

  // Precisão: toda grounded_claim declarada precisa ser realmente
  // sustentada pelo conteúdo da fonte específica que ela cita — citar um
  // ID real que existe, mas que não fala sobre a afirmação feita, é
  // rejeitado aqui mesmo que o ID em si seja válido.
  claims.forEach((claim, index) => {
    const sourceText =
      context.evidence_source_text.get(
        `${claim.supported_by.source}:${claim.supported_by.id}`,
      )

    if (
      !sourceText ||
      !claimSupportedBySourceText({
        claimText: claim.claim,
        sourceText,
      })
    ) {
      failInvalid({
        code: 'V2_UNGROUNDED_FACTUAL_CLAIM',
        message: `grounded_claims[${index}] cita uma fonte que não sustenta a afirmação feita.`,
        path: `grounded_claims[${index}]`,
        invariant:
          'CLAIM_NOT_SUPPORTED_BY_SOURCE',
      })
    }
  })
}

function requireCommitmentConfirmationSupport({
  message,
  evidenceMemoryIds,
  context,
}: {
  message: string
  evidenceMemoryIds: string[]
  context: MessageIntelligenceV2NormalizationContext
}) {
  if (!hasConfirmationLanguage(message)) {
    return
  }

  const citedIds = new Set(evidenceMemoryIds)

  const hasConfirmedEvidence =
    context.commitments.some(
      commitment =>
        commitment.commitment_status ===
          'confirmed' &&
        commitment.memory_status ===
          'active' &&
        citedIds.has(commitment.memory_id),
    )

  if (!hasConfirmedEvidence) {
    failInvalid({
      code:
        'V2_UNSUPPORTED_COMMITMENT_CONFIRMATION',
      message:
        'A mensagem usa linguagem de confirmação sem um compromisso ativo com commitment_status=confirmed entre as evidências citadas.',
      path: 'suggested_message',
      invariant:
        'COMMITMENT_CONFIRMATION_UNSUPPORTED',
    })
  }
}

function parseModelOutput(
  content: unknown,
): JsonRecord {
  if (typeof content !== 'string') {
    fail({
      code: 'INVALID_V2_PROVIDER_RESPONSE',
      message:
        'O provedor do MIE V2 não retornou conteúdo textual válido.',
      status_code: 502,
      retryable: true,
    })
  }

  if (content.length > MAX_MODEL_CONTENT_LENGTH) {
    fail({
      code: 'V2_OUTPUT_TOO_LARGE',
      message:
        'A saída do MIE V2 ultrapassou o limite permitido.',
      status_code: 502,
      retryable: false,
    })
  }

  const normalized = content.trim()

  if (!normalized) {
    failInvalid({
      code: 'EMPTY_V2_OUTPUT',
      message: 'O MIE V2 não retornou conteúdo.',
      path: 'v2_output',
      invariant: 'NON_EMPTY_JSON',
    })
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(normalized)
  } catch {
    failInvalid({
      code: 'INVALID_V2_JSON',
      message: 'O MIE V2 não retornou JSON válido.',
      path: 'v2_output',
      invariant: 'VALID_JSON_OBJECT',
    })
  }

  if (!isRecord(parsed)) {
    failInvalid({
      code: 'INVALID_V2_JSON',
      message:
        'A saída do MIE V2 precisa ser um objeto JSON.',
      path: 'v2_output',
      invariant: 'VALID_JSON_OBJECT',
    })
  }

  return parsed
}

function requireCommercialObjective(
  value: unknown,
  path: string,
): CommercialObjectiveV1 | null {
  if (value === null) {
    return null
  }

  if (
    typeof value === 'string' &&
    (COMMERCIAL_OBJECTIVES as readonly string[]).includes(
      value,
    )
  ) {
    return value as CommercialObjectiveV1
  }

  failInvalid({
    code: 'INVALID_V2_OUTPUT',
    message: `${path} possui um valor inválido.`,
    path,
    invariant: 'COMMERCIAL_OBJECTIVE_ENUM',
  })
}

function requireGroundedClaims(
  value: unknown,
): MessageIntelligenceV2GroundedClaimV1[] {
  if (!Array.isArray(value)) {
    failInvalid({
      code: 'INVALID_V2_OUTPUT',
      message: 'grounded_claims precisa ser uma lista.',
      path: 'grounded_claims',
      invariant: 'ARRAY_REQUIRED',
    })
  }

  return value.map((item, index) => {
    if (!isRecord(item)) {
      failInvalid({
        code: 'INVALID_V2_OUTPUT',
        message: `grounded_claims[${index}] precisa ser um objeto.`,
        path: `grounded_claims[${index}]`,
        invariant: 'OBJECT_REQUIRED',
      })
    }

    const claim = requireString(
      item.claim,
      `grounded_claims[${index}].claim`,
      400,
    )

    const supportedBy = item.supported_by

    if (!isRecord(supportedBy)) {
      failInvalid({
        code: 'INVALID_V2_OUTPUT',
        message: `grounded_claims[${index}].supported_by precisa ser um objeto.`,
        path: `grounded_claims[${index}].supported_by`,
        invariant: 'OBJECT_REQUIRED',
      })
    }

    const source = supportedBy.source

    if (
      typeof source !== 'string' ||
      !(
        MESSAGE_INTELLIGENCE_V2_EVIDENCE_SOURCES as readonly string[]
      ).includes(source)
    ) {
      failInvalid({
        code: 'INVALID_V2_OUTPUT',
        message: `grounded_claims[${index}].supported_by.source é inválido.`,
        path: `grounded_claims[${index}].supported_by.source`,
        invariant: 'EVIDENCE_SOURCE_ENUM',
      })
    }

    const id = requireString(
      supportedBy.id,
      `grounded_claims[${index}].supported_by.id`,
      200,
    )

    return {
      claim,
      supported_by: {
        source:
          source as MessageIntelligenceV2EvidenceSource,
        id,
      },
    }
  })
}

function requireSafetySelfCheck(
  value: unknown,
) {
  if (!isRecord(value)) {
    failInvalid({
      code: 'INVALID_V2_OUTPUT',
      message: 'safety_self_check precisa ser um objeto.',
      path: 'safety_self_check',
      invariant: 'OBJECT_REQUIRED',
    })
  }

  const fields = [
    'no_unsupported_commercial_claim',
    'no_commitment_assumed_beyond_evidence',
    'no_resolved_question_repeated',
  ] as const

  const result: Record<string, boolean> = {}

  for (const field of fields) {
    if (typeof value[field] !== 'boolean') {
      failInvalid({
        code: 'INVALID_V2_OUTPUT',
        message: `safety_self_check.${field} precisa ser booleano.`,
        path: `safety_self_check.${field}`,
        invariant: 'BOOLEAN_REQUIRED',
      })
    }

    result[field] = value[field] as boolean
  }

  return result as {
    no_unsupported_commercial_claim: boolean
    no_commitment_assumed_beyond_evidence: boolean
    no_resolved_question_repeated: boolean
  }
}

function applyCommercialGates(
  output: MessageIntelligenceV2Output,
  context: MessageIntelligenceV2NormalizationContext,
): MessageIntelligenceV2Output {
  const roleBlocks =
    context.canonical_commercial_role !==
      null &&
    context.canonical_commercial_role !==
      'buyer'

  const relevanceBlocks =
    context.canonical_commercial_relevance !==
    null
      ? context.canonical_commercial_relevance !==
        'commercial'
      : output.current_turn_relevance !==
        'commercial'

  if (!roleBlocks && !relevanceBlocks) {
    return output
  }

  return {
    ...output,
    intervention_needed: false,
    suggested_message: null,
  }
}

function normalizeMessageIntelligenceV2Output({
  value,
  context,
}: {
  value: JsonRecord
  context: MessageIntelligenceV2NormalizationContext
}): MessageIntelligenceV2Output {
  const fieldNames = Object.keys(value)

  const missingField = [
    ...V2_OUTPUT_FIELDS,
  ].find(
    fieldName =>
      !Object.prototype.hasOwnProperty.call(
        value,
        fieldName,
      ),
  )

  if (missingField) {
    failInvalid({
      code: 'INVALID_V2_OUTPUT',
      message:
        'O MIE V2 não retornou todos os campos obrigatórios.',
      path: missingField,
      invariant: 'REQUIRED_FIELD_MISSING',
    })
  }

  if (
    fieldNames.length !==
      V2_OUTPUT_FIELDS.size ||
    fieldNames.some(
      fieldName =>
        !V2_OUTPUT_FIELDS.has(fieldName),
    )
  ) {
    failInvalid({
      code: 'INVALID_V2_OUTPUT',
      message:
        'O MIE V2 retornou campos incompatíveis com o contrato.',
      path: 'v2_output',
      invariant: 'ADDITIONAL_FIELD_NOT_ALLOWED',
    })
  }

  if (typeof value.intervention_needed !== 'boolean') {
    failInvalid({
      code: 'INVALID_V2_OUTPUT',
      message: 'intervention_needed precisa ser booleano.',
      path: 'intervention_needed',
      invariant: 'BOOLEAN_REQUIRED',
    })
  }

  const interventionNeeded =
    value.intervention_needed

  if (
    typeof value.current_turn_relevance !==
      'string' ||
    !(
      MESSAGE_INTELLIGENCE_V2_TURN_RELEVANCE_VALUES as readonly string[]
    ).includes(value.current_turn_relevance)
  ) {
    failInvalid({
      code: 'INVALID_V2_OUTPUT',
      message: 'current_turn_relevance possui um valor inválido.',
      path: 'current_turn_relevance',
      invariant: 'TURN_RELEVANCE_ENUM',
    })
  }

  const currentTurnRelevance =
    value.current_turn_relevance as
      MessageIntelligenceV2Output['current_turn_relevance']

  const customerMeaning = requireString(
    value.customer_meaning,
    'customer_meaning',
    2_000,
  )

  const sellerIntentInterpretation =
    requireString(
      value.seller_intent_interpretation,
      'seller_intent_interpretation',
      2_000,
    )

  const recommendedObjective =
    requireCommercialObjective(
      value.recommended_commercial_objective,
      'recommended_commercial_objective',
    )

  const methodAlignmentSummary =
    requireNullableString(
      value.method_alignment_summary,
      'method_alignment_summary',
      600,
    )

  const evidenceMessageIds = isStringArray(
    value.evidence_message_ids,
  )
    ? value.evidence_message_ids
    : failInvalid({
        code: 'INVALID_V2_OUTPUT',
        message:
          'evidence_message_ids precisa ser uma lista de textos.',
        path: 'evidence_message_ids',
        invariant: 'STRING_ARRAY_REQUIRED',
      })

  const evidenceMemoryIds = isStringArray(
    value.evidence_memory_ids,
  )
    ? value.evidence_memory_ids
    : failInvalid({
        code: 'INVALID_V2_OUTPUT',
        message:
          'evidence_memory_ids precisa ser uma lista de textos.',
        path: 'evidence_memory_ids',
        invariant: 'STRING_ARRAY_REQUIRED',
      })

  requireEvidenceSubset({
    ids: evidenceMessageIds,
    allowed: context.allowed_evidence.message_ids,
    path: 'evidence_message_ids',
    invariant: 'MESSAGE',
  })

  requireEvidenceSubset({
    ids: evidenceMemoryIds,
    allowed: context.allowed_evidence.memory_ids,
    path: 'evidence_memory_ids',
    invariant: 'MEMORY',
  })

  const groundedClaims = requireGroundedClaims(
    value.grounded_claims,
  )

  requireGroundedClaimRefs({
    claims: groundedClaims,
    context,
  })

  const safetySelfCheck =
    requireSafetySelfCheck(
      value.safety_self_check,
    )

  // Um self-check positivo não é prova (o executor sempre reexecuta as
  // checagens reais acima e abaixo), mas um self-check NEGATIVO é uma
  // admissão do próprio modelo de possível falha — nunca ignorada.
  for (
    const [field, passed] of
    Object.entries(safetySelfCheck)
  ) {
    if (!passed) {
      failInvalid({
        code: 'V2_SAFETY_SELF_CHECK_NEGATIVE',
        message: `O modelo sinalizou safety_self_check.${field}=false.`,
        path: `safety_self_check.${field}`,
        invariant:
          'SAFETY_SELF_CHECK_NEGATIVE',
      })
    }
  }

  const suggestedMessage =
    requireNullableString(
      value.suggested_message,
      'suggested_message',
      900,
    )

  if (
    interventionNeeded === false &&
    suggestedMessage !== null
  ) {
    failInvalid({
      code: 'V2_NO_INTERVENTION_REQUIRES_SILENCE',
      message:
        'Uma decisão sem intervenção não pode sugerir mensagem.',
      path: 'suggested_message',
      invariant: 'NO_INTERVENTION_REQUIRES_SILENCE',
    })
  }

  if (suggestedMessage) {
    if (
      hasUnsupportedProtectedFact({
        message: suggestedMessage,
        allowedContext: context.grounding_text,
      })
    ) {
      failInvalid({
        code: 'V2_UNSUPPORTED_PROTECTED_FACT',
        message:
          'A mensagem introduziu valor, percentual, data ou horário sem base no catálogo publicado ou no estado comercial ativo.',
        path: 'suggested_message',
        invariant: 'UNSUPPORTED_PROTECTED_FACT',
      })
    }

    requireCommitmentConfirmationSupport({
      message: suggestedMessage,
      evidenceMemoryIds,
      context,
    })

    requireFactualClaimCoverage({
      message: suggestedMessage,
      claims: groundedClaims,
      context,
    })

    if (leaksInternals(suggestedMessage)) {
      failInvalid({
        code: 'V2_MESSAGE_LEAKS_INTERNALS',
        message:
          'A mensagem expõe internals, JSON ou rastro de raciocínio interno.',
        path: 'suggested_message',
        invariant: 'MESSAGE_LEAKS_INTERNALS',
      })
    }
  }

  const output: MessageIntelligenceV2Output = {
    contract_version:
      MESSAGE_INTELLIGENCE_V2_GENERATION_CONTRACT_VERSION,

    intervention_needed: interventionNeeded,
    current_turn_relevance: currentTurnRelevance,
    customer_meaning: customerMeaning,
    seller_intent_interpretation:
      sellerIntentInterpretation,
    recommended_commercial_objective:
      recommendedObjective,
    method_alignment_summary:
      methodAlignmentSummary,
    evidence_message_ids: evidenceMessageIds,
    evidence_memory_ids: evidenceMemoryIds,
    grounded_claims: groundedClaims,
    safety_self_check: safetySelfCheck,
    suggested_message: suggestedMessage,
  }

  return applyCommercialGates(output, context)
}

function validatePlan(
  plan: MessageIntelligenceV2ExecutionPlan,
) {
  if (
    plan.prompt_version !==
      MESSAGE_INTELLIGENCE_V2_PROMPT_VERSION ||
    plan.output_contract_version !==
      MESSAGE_INTELLIGENCE_V2_GENERATION_CONTRACT_VERSION ||
    !plan.system_prompt.trim() ||
    !plan.user_prompt.trim()
  ) {
    fail({
      code: 'INVALID_V2_PLAN',
      message: 'O plano de execução do MIE V2 é inválido.',
      status_code: 500,
      retryable: false,
    })
  }
}

async function executeAttempt({
  plan,
  provider,
}: {
  plan: MessageIntelligenceV2ExecutionPlan
  provider: StatefulCopilotProvider
}): Promise<{
  output: MessageIntelligenceV2Output
  execution: Omit<
    MessageIntelligenceV2Execution,
    'attempts' | 'recovered_after_retry'
  >
}> {
  let response: StatefulCopilotProviderResponse

  try {
    response = await provider({
      prompt_version: plan.prompt_version,
      output_contract_version:
        plan.output_contract_version,
      system_prompt: plan.system_prompt,
      user_prompt: plan.user_prompt,
      structured_output_format:
        MESSAGE_INTELLIGENCE_V2_STRUCTURED_OUTPUT_FORMAT,
    })
  } catch (error) {
    if (
      error instanceof
      StatefulCopilotExecutionError
    ) {
      throw error
    }

    fail({
      code: 'V2_PROVIDER_REQUEST_FAILED',
      message:
        'Não foi possível executar o provedor do MIE V2.',
      status_code: 502,
      retryable: true,
    })
  }

  if (!isRecord(response)) {
    fail({
      code: 'INVALID_V2_PROVIDER_RESPONSE',
      message:
        'O provedor do MIE V2 retornou uma resposta inválida.',
      status_code: 502,
      retryable: true,
    })
  }

  const rawOutput = parseModelOutput(
    response.content,
  )

  return {
    output: normalizeMessageIntelligenceV2Output({
      value: rawOutput,
      context: plan.normalization_context,
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

function shouldRetry(error: unknown): boolean {
  return (
    error instanceof
      MessageIntelligenceV2ExecutionError &&
    RETRYABLE_V2_OUTPUT_CODES.has(error.code)
  )
}

function buildResult({
  result,
  attempts,
}: {
  result: Awaited<
    ReturnType<typeof executeAttempt>
  >
  attempts: 1 | 2
}): MessageIntelligenceV2ExecutionResult {
  return {
    output: result.output,
    execution: {
      ...result.execution,
      attempts,
      recovered_after_retry: attempts === 2,
    },
  }
}

function readFailureMetadata(
  error: MessageIntelligenceV2ExecutionError,
): FailureMetadata {
  const details = error.details

  return {
    path:
      typeof details?.v2_failure_path ===
      'string'
        ? details.v2_failure_path
        : 'v2_output',
    invariant:
      typeof details
        ?.v2_failure_invariant === 'string'
        ? details.v2_failure_invariant
        : error.code,
  }
}

export async function executeMessageIntelligenceV2Plan({
  plan,
  provider,
}: {
  plan: MessageIntelligenceV2ExecutionPlan
  provider: StatefulCopilotProvider
}): Promise<MessageIntelligenceV2ExecutionResult> {
  validatePlan(plan)

  let firstError:
    | MessageIntelligenceV2ExecutionError
    | null = null

  try {
    const firstResult = await executeAttempt({
      plan,
      provider,
    })

    return buildResult({
      result: firstResult,
      attempts: 1,
    })
  } catch (error) {
    if (
      !(error instanceof
        MessageIntelligenceV2ExecutionError) ||
      !shouldRetry(error)
    ) {
      throw error
    }

    firstError = error
  }

  const firstFailure = readFailureMetadata(
    firstError,
  )

  const repairPlan =
    buildMessageIntelligenceV2RepairExecutionPlan({
      plan,
      previous_failure_code: firstError.code,
      previous_failure_path:
        firstFailure.path,
      previous_failure_invariant:
        firstFailure.invariant,
    })

  const secondResult = await executeAttempt({
    plan: repairPlan,
    provider,
  })

  return buildResult({
    result: secondResult,
    attempts: 2,
  })
}
