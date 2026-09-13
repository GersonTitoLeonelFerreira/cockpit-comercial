export const COMMERCIAL_REASONING_CORE_V2_CONTRACT_VERSION =
  'commercial-reasoning-core-v2' as const

export const COMMERCIAL_REASONING_CORE_V2_STATUSES = [
  'ready',
  'limited',
  'silent',
] as const

export const COMMERCIAL_REASONING_CORE_V2_CONFIDENCE_LEVELS = [
  'low',
  'medium',
  'high',
] as const

export const COMMERCIAL_REASONING_CORE_V2_WAITING_ON = [
  'seller',
  'customer',
  'shared',
  'none',
] as const

export const COMMERCIAL_REASONING_CORE_V2_DECISIONS = [
  'no_intervention',
  'answer_question',
  'clarify',
  'discover',
  'present_solution',
  'handle_objection',
  'confirm_next_step',
  'schedule',
  'close',
  'wait',
  'give_space',
  'recover_context',
] as const

export const COMMERCIAL_REASONING_CORE_V2_METHOD_ADHERENCE = [
  'on_method',
  'partially_on_method',
  'off_method',
  'not_configured',
  'insufficient_evidence',
] as const

export type CommercialReasoningCoreV2Status =
  (typeof COMMERCIAL_REASONING_CORE_V2_STATUSES)[number]

export type CommercialReasoningCoreV2Confidence =
  (typeof COMMERCIAL_REASONING_CORE_V2_CONFIDENCE_LEVELS)[number]

export type CommercialReasoningCoreV2WaitingOn =
  (typeof COMMERCIAL_REASONING_CORE_V2_WAITING_ON)[number]

export type CommercialReasoningCoreV2Decision =
  (typeof COMMERCIAL_REASONING_CORE_V2_DECISIONS)[number]

export type CommercialReasoningCoreV2MethodAdherence =
  (typeof COMMERCIAL_REASONING_CORE_V2_METHOD_ADHERENCE)[number]

export type CommercialReasoningCoreV2Evidence = {
  summary: string
  evidence_message_ids: string[]
}

export type CommercialReasoningCoreV2Strength = {
  kind: string
  summary: string
  why_it_matters: string
  evidence_message_ids: string[]
}

export type CommercialReasoningCoreV2ImprovementPoint = {
  kind: string
  summary: string
  why_it_matters: string
  impact: string
  how_to_improve: string
  evidence_message_ids: string[]
}

export type CommercialReasoningCoreV2Output = {
  contract_version:
    typeof COMMERCIAL_REASONING_CORE_V2_CONTRACT_VERSION

  status:
    CommercialReasoningCoreV2Status

  situation: {
    summary: string
    customer_intent: string | null
    commercial_stage: string | null
    confidence: CommercialReasoningCoreV2Confidence
    evidence_message_ids: string[]
  }

  responsibility: {
    waiting_on: CommercialReasoningCoreV2WaitingOn
    summary: string
    evidence_message_ids: string[]
  }

  decision: {
    action: CommercialReasoningCoreV2Decision
    objective: string
    reason: string
    evidence_message_ids: string[]
  }

  coaching: {
    strengths: CommercialReasoningCoreV2Strength[]
    improvement_points: CommercialReasoningCoreV2ImprovementPoint[]
  }

  method: {
    configured: boolean
    name: string | null
    current_stage: string | null
    adherence: CommercialReasoningCoreV2MethodAdherence
    deviation: string | null
    recovery_move: string | null
    evidence_message_ids: string[]
  }

  technique: {
    name: string | null
    why_applicable: string | null
    do_not_do: string[]
  }

  communication: {
    intervention_needed: boolean
    recommended_question: string | null
    suggested_message: string | null
  }

  factuality: {
    facts_used: CommercialReasoningCoreV2Evidence[]
    unknowns: string[]
  }

  evidence_message_ids: string[]
}

type JsonRecord =
  Record<string, unknown>

export class CommercialReasoningCoreV2ContractError
  extends Error {
  readonly code: string
  readonly path: string

  constructor(
    code: string,
    path: string,
    message: string,
  ) {
    super(message)

    this.name =
      'CommercialReasoningCoreV2ContractError'

    this.code = code
    this.path = path
  }
}

function fail(
  code: string,
  path: string,
  message: string,
): never {
  throw new CommercialReasoningCoreV2ContractError(
    code,
    path,
    message,
  )
}

function requireRecord(
  value: unknown,
  path: string,
): JsonRecord {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    fail(
      'OBJECT_REQUIRED',
      path,
      `${path} precisa ser um objeto.`,
    )
  }

  return value as JsonRecord
}

function requireString(
  value: unknown,
  path: string,
  maximumLength = 4_000,
): string {
  if (typeof value !== 'string') {
    fail(
      'TEXT_REQUIRED',
      path,
      `${path} precisa ser texto.`,
    )
  }

  const normalized =
    value.trim()

  if (!normalized) {
    fail(
      'NON_EMPTY_TEXT',
      path,
      `${path} não pode ficar vazio.`,
    )
  }

  if (normalized.length > maximumLength) {
    fail(
      'TEXT_LENGTH_LIMIT',
      path,
      `${path} excedeu o limite permitido.`,
    )
  }

  return normalized
}

function requireNullableString(
  value: unknown,
  path: string,
  maximumLength = 4_000,
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

function requireBoolean(
  value: unknown,
  path: string,
): boolean {
  if (typeof value !== 'boolean') {
    fail(
      'BOOLEAN_REQUIRED',
      path,
      `${path} precisa ser booleano.`,
    )
  }

  return value
}

function requireEnum<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  path: string,
): T[number] {
  if (
    typeof value !== 'string' ||
    !(allowed as readonly string[]).includes(value)
  ) {
    fail(
      'ENUM_VALUE_REQUIRED',
      path,
      `${path} possui valor inválido.`,
    )
  }

  return value as T[number]
}

function requireStringArray(
  value: unknown,
  path: string,
  maximumItems = 100,
): string[] {
  if (!Array.isArray(value)) {
    fail(
      'ARRAY_REQUIRED',
      path,
      `${path} precisa ser uma lista.`,
    )
  }

  if (value.length > maximumItems) {
    fail(
      'ARRAY_LENGTH_LIMIT',
      path,
      `${path} possui itens demais.`,
    )
  }

  const normalized =
    value.map(
      (item, index) =>
        requireString(
          item,
          `${path}[${index}]`,
          500,
        ),
    )

  return [
    ...new Set(normalized),
  ]
}

function requireArray<T>(
  value: unknown,
  path: string,
  normalizeItem: (
    item: unknown,
    path: string,
  ) => T,
  maximumItems = 20,
): T[] {
  if (!Array.isArray(value)) {
    fail(
      'ARRAY_REQUIRED',
      path,
      `${path} precisa ser uma lista.`,
    )
  }

  if (value.length > maximumItems) {
    fail(
      'ARRAY_LENGTH_LIMIT',
      path,
      `${path} possui itens demais.`,
    )
  }

  return value.map(
    (item, index) =>
      normalizeItem(
        item,
        `${path}[${index}]`,
      ),
  )
}

function normalizeEvidence(
  value: unknown,
  path: string,
): CommercialReasoningCoreV2Evidence {
  const record =
    requireRecord(value, path)

  return {
    summary:
      requireString(
        record.summary,
        `${path}.summary`,
      ),

    evidence_message_ids:
      requireStringArray(
        record.evidence_message_ids,
        `${path}.evidence_message_ids`,
      ),
  }
}

function normalizeStrength(
  value: unknown,
  path: string,
): CommercialReasoningCoreV2Strength {
  const record =
    requireRecord(value, path)

  return {
    kind:
      requireString(
        record.kind,
        `${path}.kind`,
        200,
      ),

    summary:
      requireString(
        record.summary,
        `${path}.summary`,
      ),

    why_it_matters:
      requireString(
        record.why_it_matters,
        `${path}.why_it_matters`,
      ),

    evidence_message_ids:
      requireStringArray(
        record.evidence_message_ids,
        `${path}.evidence_message_ids`,
      ),
  }
}

function normalizeImprovementPoint(
  value: unknown,
  path: string,
): CommercialReasoningCoreV2ImprovementPoint {
  const record =
    requireRecord(value, path)

  return {
    kind:
      requireString(
        record.kind,
        `${path}.kind`,
        200,
      ),

    summary:
      requireString(
        record.summary,
        `${path}.summary`,
      ),

    why_it_matters:
      requireString(
        record.why_it_matters,
        `${path}.why_it_matters`,
      ),

    impact:
      requireString(
        record.impact,
        `${path}.impact`,
      ),

    how_to_improve:
      requireString(
        record.how_to_improve,
        `${path}.how_to_improve`,
      ),

    evidence_message_ids:
      requireStringArray(
        record.evidence_message_ids,
        `${path}.evidence_message_ids`,
      ),
  }
}

export function normalizeCommercialReasoningCoreV2Output(
  value: unknown,
): CommercialReasoningCoreV2Output {
  const root =
    requireRecord(
      value,
      'output',
    )

  if (
    root.contract_version !==
    COMMERCIAL_REASONING_CORE_V2_CONTRACT_VERSION
  ) {
    fail(
      'CONTRACT_VERSION_MISMATCH',
      'output.contract_version',
      'A saída utiliza uma versão incompatível do Commercial Reasoning Core V2.',
    )
  }

  const situation =
    requireRecord(
      root.situation,
      'output.situation',
    )

  const responsibility =
    requireRecord(
      root.responsibility,
      'output.responsibility',
    )

  const decision =
    requireRecord(
      root.decision,
      'output.decision',
    )

  const coaching =
    requireRecord(
      root.coaching,
      'output.coaching',
    )

  const method =
    requireRecord(
      root.method,
      'output.method',
    )

  const technique =
    requireRecord(
      root.technique,
      'output.technique',
    )

  const communication =
    requireRecord(
      root.communication,
      'output.communication',
    )

  const factuality =
    requireRecord(
      root.factuality,
      'output.factuality',
    )

  return {
    contract_version:
      COMMERCIAL_REASONING_CORE_V2_CONTRACT_VERSION,

    status:
      requireEnum(
        root.status,
        COMMERCIAL_REASONING_CORE_V2_STATUSES,
        'output.status',
      ),

    situation: {
      summary:
        requireString(
          situation.summary,
          'output.situation.summary',
        ),

      customer_intent:
        requireNullableString(
          situation.customer_intent,
          'output.situation.customer_intent',
        ),

      commercial_stage:
        requireNullableString(
          situation.commercial_stage,
          'output.situation.commercial_stage',
          500,
        ),

      confidence:
        requireEnum(
          situation.confidence,
          COMMERCIAL_REASONING_CORE_V2_CONFIDENCE_LEVELS,
          'output.situation.confidence',
        ),

      evidence_message_ids:
        requireStringArray(
          situation.evidence_message_ids,
          'output.situation.evidence_message_ids',
        ),
    },

    responsibility: {
      waiting_on:
        requireEnum(
          responsibility.waiting_on,
          COMMERCIAL_REASONING_CORE_V2_WAITING_ON,
          'output.responsibility.waiting_on',
        ),

      summary:
        requireString(
          responsibility.summary,
          'output.responsibility.summary',
        ),

      evidence_message_ids:
        requireStringArray(
          responsibility.evidence_message_ids,
          'output.responsibility.evidence_message_ids',
        ),
    },

    decision: {
      action:
        requireEnum(
          decision.action,
          COMMERCIAL_REASONING_CORE_V2_DECISIONS,
          'output.decision.action',
        ),

      objective:
        requireString(
          decision.objective,
          'output.decision.objective',
        ),

      reason:
        requireString(
          decision.reason,
          'output.decision.reason',
        ),

      evidence_message_ids:
        requireStringArray(
          decision.evidence_message_ids,
          'output.decision.evidence_message_ids',
        ),
    },

    coaching: {
      strengths:
        requireArray(
          coaching.strengths,
          'output.coaching.strengths',
          normalizeStrength,
        ),

      improvement_points:
        requireArray(
          coaching.improvement_points,
          'output.coaching.improvement_points',
          normalizeImprovementPoint,
        ),
    },

    method: {
      configured:
        requireBoolean(
          method.configured,
          'output.method.configured',
        ),

      name:
        requireNullableString(
          method.name,
          'output.method.name',
          500,
        ),

      current_stage:
        requireNullableString(
          method.current_stage,
          'output.method.current_stage',
          500,
        ),

      adherence:
        requireEnum(
          method.adherence,
          COMMERCIAL_REASONING_CORE_V2_METHOD_ADHERENCE,
          'output.method.adherence',
        ),

      deviation:
        requireNullableString(
          method.deviation,
          'output.method.deviation',
        ),

      recovery_move:
        requireNullableString(
          method.recovery_move,
          'output.method.recovery_move',
        ),

      evidence_message_ids:
        requireStringArray(
          method.evidence_message_ids,
          'output.method.evidence_message_ids',
        ),
    },

    technique: {
      name:
        requireNullableString(
          technique.name,
          'output.technique.name',
          500,
        ),

      why_applicable:
        requireNullableString(
          technique.why_applicable,
          'output.technique.why_applicable',
        ),

      do_not_do:
        requireStringArray(
          technique.do_not_do,
          'output.technique.do_not_do',
          20,
        ),
    },

    communication: {
      intervention_needed:
        requireBoolean(
          communication.intervention_needed,
          'output.communication.intervention_needed',
        ),

      recommended_question:
        requireNullableString(
          communication.recommended_question,
          'output.communication.recommended_question',
          1_200,
        ),

      suggested_message:
        requireNullableString(
          communication.suggested_message,
          'output.communication.suggested_message',
          1_200,
        ),
    },

    factuality: {
      facts_used:
        requireArray(
          factuality.facts_used,
          'output.factuality.facts_used',
          normalizeEvidence,
          50,
        ),

      unknowns:
        requireStringArray(
          factuality.unknowns,
          'output.factuality.unknowns',
          50,
        ),
    },

    evidence_message_ids:
      requireStringArray(
        root.evidence_message_ids,
        'output.evidence_message_ids',
      ),
  }
}
