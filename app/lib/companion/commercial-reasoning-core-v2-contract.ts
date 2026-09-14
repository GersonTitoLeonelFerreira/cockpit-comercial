import {
  COMMERCIAL_RELEVANCES,
  type CommercialRelevance,
} from './commercial-relevance'

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

export const COMMERCIAL_REASONING_CORE_V2_COMMERCIAL_ROLES = [
  'buyer',
  'provider',
  'unknown',
] as const

export const COMMERCIAL_REASONING_CORE_V2_COMMERCIAL_RELEVANCES =
  COMMERCIAL_RELEVANCES

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

export const COMMERCIAL_REASONING_CORE_V2_COMMITMENT_STATUSES = [
  'proposed',
  'confirmed',
  'reschedule_requested',
  'cancelled',
  'completed',
] as const

export type CommercialReasoningCoreV2Status =
  (typeof COMMERCIAL_REASONING_CORE_V2_STATUSES)[number]

export type CommercialReasoningCoreV2Confidence =
  (typeof COMMERCIAL_REASONING_CORE_V2_CONFIDENCE_LEVELS)[number]

export type CommercialReasoningCoreV2CommercialRole =
  (typeof COMMERCIAL_REASONING_CORE_V2_COMMERCIAL_ROLES)[number]

export type CommercialReasoningCoreV2CommercialRelevance =
  CommercialRelevance

export type CommercialReasoningCoreV2WaitingOn =
  (typeof COMMERCIAL_REASONING_CORE_V2_WAITING_ON)[number]

export type CommercialReasoningCoreV2Decision =
  (typeof COMMERCIAL_REASONING_CORE_V2_DECISIONS)[number]

export type CommercialReasoningCoreV2MethodAdherence =
  (typeof COMMERCIAL_REASONING_CORE_V2_METHOD_ADHERENCE)[number]

export type CommercialReasoningCoreV2CommitmentStatus =
  (typeof COMMERCIAL_REASONING_CORE_V2_COMMITMENT_STATUSES)[number]

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

export type CommercialReasoningCoreV2MemoryObservedItem = {
  kind: string
  summary: string
  confidence: CommercialReasoningCoreV2Confidence
  evidence_message_ids: string[]
}

export type CommercialReasoningCoreV2MemoryFact =
  CommercialReasoningCoreV2MemoryObservedItem & {
    value: string | null
  }

export type CommercialReasoningCoreV2MemoryOpenLoop = {
  kind: string
  summary: string
  evidence_message_ids: string[]
}

export type CommercialReasoningCoreV2MemoryCommitment = {
  commitment_id: string | null
  kind: string
  status: CommercialReasoningCoreV2CommitmentStatus
  scheduled_at: string | null
  proposed_at: string | null
  summary: string
  evidence_message_ids: string[]
}

export type CommercialReasoningCoreV2MemoryDelta = {
  facts_to_add:
    CommercialReasoningCoreV2MemoryFact[]

  fact_ids_to_supersede:
    string[]

  needs_to_add:
    CommercialReasoningCoreV2MemoryObservedItem[]

  need_ids_to_resolve:
    string[]

  need_ids_to_supersede:
    string[]

  open_loops_to_add:
    CommercialReasoningCoreV2MemoryOpenLoop[]

  open_loop_ids_to_resolve:
    string[]

  open_loop_ids_to_supersede:
    string[]

  objections_to_add:
    CommercialReasoningCoreV2MemoryObservedItem[]

  objection_ids_to_resolve:
    string[]

  objection_ids_to_supersede:
    string[]

  commitments_to_upsert:
    CommercialReasoningCoreV2MemoryCommitment[]

  signals_to_add:
    CommercialReasoningCoreV2MemoryObservedItem[]

  signal_ids_to_resolve:
    string[]

  uncertainties_to_add:
    CommercialReasoningCoreV2MemoryObservedItem[]

  uncertainty_ids_to_resolve:
    string[]

  uncertainty_ids_to_supersede:
    string[]
}

export function createEmptyCommercialReasoningCoreV2MemoryDelta():
  CommercialReasoningCoreV2MemoryDelta {
  return {
    facts_to_add: [],
    fact_ids_to_supersede: [],
    needs_to_add: [],
    need_ids_to_resolve: [],
    need_ids_to_supersede: [],
    open_loops_to_add: [],
    open_loop_ids_to_resolve: [],
    open_loop_ids_to_supersede: [],
    objections_to_add: [],
    objection_ids_to_resolve: [],
    objection_ids_to_supersede: [],
    commitments_to_upsert: [],
    signals_to_add: [],
    signal_ids_to_resolve: [],
    uncertainties_to_add: [],
    uncertainty_ids_to_resolve: [],
    uncertainty_ids_to_supersede: [],
  }
}

export type CommercialReasoningCoreV2Output = {
  contract_version:
    typeof COMMERCIAL_REASONING_CORE_V2_CONTRACT_VERSION

  status:
    CommercialReasoningCoreV2Status

  commercial_role:
    CommercialReasoningCoreV2CommercialRole

  commercial_relevance:
    CommercialReasoningCoreV2CommercialRelevance

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

  memory_delta:
    CommercialReasoningCoreV2MemoryDelta

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

function requireNullableDateTime(
  value: unknown,
  path: string,
): string | null {
  const normalized =
    requireNullableString(
      value,
      path,
      100,
    )

  if (normalized === null) {
    return null
  }

  if (
    !Number.isFinite(
      Date.parse(
        normalized,
      ),
    )
  ) {
    fail(
      'DATETIME_REQUIRED',
      path,
      `${path} precisa possuir uma data válida.`,
    )
  }

  return normalized
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

function normalizeMemoryObservedItem(
  value: unknown,
  path: string,
): CommercialReasoningCoreV2MemoryObservedItem {
  const record =
    requireRecord(
      value,
      path,
    )

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

    confidence:
      requireEnum(
        record.confidence,
        COMMERCIAL_REASONING_CORE_V2_CONFIDENCE_LEVELS,
        `${path}.confidence`,
      ),

    evidence_message_ids:
      requireStringArray(
        record.evidence_message_ids,
        `${path}.evidence_message_ids`,
      ),
  }
}

function normalizeMemoryFact(
  value: unknown,
  path: string,
): CommercialReasoningCoreV2MemoryFact {
  const record =
    requireRecord(
      value,
      path,
    )

  return {
    ...normalizeMemoryObservedItem(
      record,
      path,
    ),

    value:
      requireNullableString(
        record.value,
        `${path}.value`,
        1_000,
      ),
  }
}

function normalizeMemoryOpenLoop(
  value: unknown,
  path: string,
): CommercialReasoningCoreV2MemoryOpenLoop {
  const record =
    requireRecord(
      value,
      path,
    )

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

    evidence_message_ids:
      requireStringArray(
        record.evidence_message_ids,
        `${path}.evidence_message_ids`,
      ),
  }
}

function normalizeMemoryCommitment(
  value: unknown,
  path: string,
): CommercialReasoningCoreV2MemoryCommitment {
  const record =
    requireRecord(
      value,
      path,
    )

  return {
    commitment_id:
      requireNullableString(
        record.commitment_id,
        `${path}.commitment_id`,
        500,
      ),

    kind:
      requireString(
        record.kind,
        `${path}.kind`,
        200,
      ),

    status:
      requireEnum(
        record.status,
        COMMERCIAL_REASONING_CORE_V2_COMMITMENT_STATUSES,
        `${path}.status`,
      ),

    scheduled_at:
      requireNullableDateTime(
        record.scheduled_at,
        `${path}.scheduled_at`,
      ),

    proposed_at:
      requireNullableDateTime(
        record.proposed_at,
        `${path}.proposed_at`,
      ),

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

function normalizeMemoryDelta(
  value: unknown,
  path: string,
): CommercialReasoningCoreV2MemoryDelta {
  const record =
    requireRecord(
      value,
      path,
    )

  return {
    facts_to_add:
      requireArray(
        record.facts_to_add,
        `${path}.facts_to_add`,
        normalizeMemoryFact,
        12,
      ),

    fact_ids_to_supersede:
      requireStringArray(
        record.fact_ids_to_supersede,
        `${path}.fact_ids_to_supersede`,
        30,
      ),

    needs_to_add:
      requireArray(
        record.needs_to_add,
        `${path}.needs_to_add`,
        normalizeMemoryObservedItem,
        12,
      ),

    need_ids_to_resolve:
      requireStringArray(
        record.need_ids_to_resolve,
        `${path}.need_ids_to_resolve`,
        30,
      ),

    need_ids_to_supersede:
      requireStringArray(
        record.need_ids_to_supersede,
        `${path}.need_ids_to_supersede`,
        30,
      ),

    open_loops_to_add:
      requireArray(
        record.open_loops_to_add,
        `${path}.open_loops_to_add`,
        normalizeMemoryOpenLoop,
        12,
      ),

    open_loop_ids_to_resolve:
      requireStringArray(
        record.open_loop_ids_to_resolve,
        `${path}.open_loop_ids_to_resolve`,
        30,
      ),

    open_loop_ids_to_supersede:
      requireStringArray(
        record.open_loop_ids_to_supersede,
        `${path}.open_loop_ids_to_supersede`,
        30,
      ),

    objections_to_add:
      requireArray(
        record.objections_to_add,
        `${path}.objections_to_add`,
        normalizeMemoryObservedItem,
        12,
      ),

    objection_ids_to_resolve:
      requireStringArray(
        record.objection_ids_to_resolve,
        `${path}.objection_ids_to_resolve`,
        30,
      ),

    objection_ids_to_supersede:
      requireStringArray(
        record.objection_ids_to_supersede,
        `${path}.objection_ids_to_supersede`,
        30,
      ),

    commitments_to_upsert:
      requireArray(
        record.commitments_to_upsert,
        `${path}.commitments_to_upsert`,
        normalizeMemoryCommitment,
        12,
      ),

    signals_to_add:
      requireArray(
        record.signals_to_add,
        `${path}.signals_to_add`,
        normalizeMemoryObservedItem,
        12,
      ),

    signal_ids_to_resolve:
      requireStringArray(
        record.signal_ids_to_resolve,
        `${path}.signal_ids_to_resolve`,
        30,
      ),

    uncertainties_to_add:
      requireArray(
        record.uncertainties_to_add,
        `${path}.uncertainties_to_add`,
        normalizeMemoryObservedItem,
        12,
      ),

    uncertainty_ids_to_resolve:
      requireStringArray(
        record.uncertainty_ids_to_resolve,
        `${path}.uncertainty_ids_to_resolve`,
        30,
      ),

    uncertainty_ids_to_supersede:
      requireStringArray(
        record.uncertainty_ids_to_supersede,
        `${path}.uncertainty_ids_to_supersede`,
        30,
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

    commercial_role:
      requireEnum(
        root.commercial_role,
        COMMERCIAL_REASONING_CORE_V2_COMMERCIAL_ROLES,
        'output.commercial_role',
      ),

    commercial_relevance:
      requireEnum(
        root.commercial_relevance,
        COMMERCIAL_REASONING_CORE_V2_COMMERCIAL_RELEVANCES,
        'output.commercial_relevance',
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

    memory_delta:
      normalizeMemoryDelta(
        root.memory_delta ??
          createEmptyCommercialReasoningCoreV2MemoryDelta(),
        'output.memory_delta',
      ),

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
