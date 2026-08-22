// ============================================================================
// Yolen — Leitura Comercial Completa
// Contrato central consumível pelas experiências Yolen.
// ============================================================================

import type {
  DiagnosticLeadStatus,
} from './diagnostic-contract'

import type {
  CompanionDiagnosticInput,
} from './diagnostic-input'

import {
  COMMERCIAL_RELEVANCES,
  isCommerciallyActionable,
  type CommercialRelevance,
} from './commercial-relevance'

export const COMMERCIAL_READING_CONTRACT_VERSION =
  'commercial-reading-v1' as const

export const COMMERCIAL_READING_ANALYSIS_STATUSES = [
  'complete',
  'limited',
] as const

export const COMMERCIAL_READING_COMMERCIAL_ROLES = [
  'buyer',
  'provider',
  'unknown',
] as const

export const COMMERCIAL_READING_COMMERCIAL_RELEVANCES =
  COMMERCIAL_RELEVANCES

export const COMMERCIAL_READING_EVOLUTION_STATUSES = [
  'completed',
  'active',
  'partial',
  'pending',
  'not_started',
  'skipped',
  'not_applicable',
] as const

export const COMMERCIAL_READING_METHOD_STATUSES = [
  'completed',
  'active',
  'partial',
  'not_started',
  'skipped',
  'not_applicable',
] as const

export const COMMERCIAL_READING_METHOD_ADHERENCE_STATUSES = [
  'on_method',
  'partially_on_method',
  'off_method',
  'not_configured',
  'insufficient_evidence',
] as const

export const COMMERCIAL_READING_DECISIONS = [
  'respond',
  'clarify',
  'ask',
  'deepen_discovery',
  'present_solution',
  'compare',
  'demonstrate_value',
  'handle_objection',
  'send_material',
  'confirm_information',
  'propose_call',
  'propose_meeting',
  'propose_visit',
  'negotiate',
  'ask_for_decision',
  'set_commitment',
  'wait',
  'give_space',
  'follow_up',
  'escalate',
  'close',
  'no_intervention',
  'insufficient_information',
] as const

export const COMMERCIAL_READING_CHANNELS = [
  'text',
  'audio',
  'call',
  'meeting',
  'visit',
  'document',
  'wait',
  'none',
] as const

export const COMMERCIAL_READING_SELLER_STRENGTH_KINDS = [
  'answered_question',
  'good_discovery',
  'correct_information',
  'respected_space',
  'method_alignment',
  'clear_explanation',
  'handled_objection',
  'confirmed_information',
  'other',
] as const

export const COMMERCIAL_READING_IMPROVEMENT_KINDS = [
  'unanswered_question',
  'premature_price',
  'premature_presentation',
  'insufficient_discovery',
  'interrogation',
  'repetition',
  'pressure',
  'incorrect_information',
  'poor_objection_handling',
  'advance_without_confirmation',
  'missing_next_commitment',
  'method_misapplication',
  'promise_risk',
  'missed_commitment',
  'other',
] as const

export const COMMERCIAL_READING_RISK_SEVERITIES = [
  'low',
  'medium',
  'high',
] as const

export const COMMERCIAL_READING_PRODUCT_INTEREST_LEVELS = [
  'discussed',
  'interested',
  'primary',
] as const

export const COMMERCIAL_READING_COMPETITOR_MENTION_TYPES = [
  'named',
  'unnamed_alternative',
] as const

export const COMMERCIAL_READING_COMMUNICATION_OBSERVATION_TYPES = [
  'event',
  'explicit_preference',
  'pattern',
] as const

export const COMMERCIAL_READING_COMMUNICATION_BEHAVIORS = [
  'short_responses',
  'direct_questions',
  'requests_data_or_numbers',
  'frequent_audio',
  'prefers_short_explanations',
  'negative_reaction_to_pressure',
  'responds_to_clear_alternatives',
  'other_observed_behavior',
] as const

export const COMMERCIAL_READING_MISSING_DISCOVERY_TOPICS = [
  'objective',
  'problem',
  'impact',
  'need',
  'budget',
  'timeline',
  'decision_maker',
  'priority',
  'decision_criteria',
  'current_process',
  'product_fit',
  'other',
] as const

export const COMMERCIAL_READING_CUSTOMER_HISTORY_CATEGORIES = [
  'objective',
  'problem',
  'impact',
  'need',
  'interest',
  'decision_criterion',
  'preference',
  'open_question',
  'objection',
  'uncertainty',
  'missing_discovery',
  'product',
  'competitor',
] as const

export const COMMERCIAL_READING_MODEL_OUTPUT_FIELDS = [
  'conversation_summary',
  'commercial_evolution',
  'method',
  'seller_strengths',
  'improvement_points',
  'risks',
  'best_approach',
] as const

export type CommercialReadingAnalysisStatus =
  (typeof COMMERCIAL_READING_ANALYSIS_STATUSES)[number]

export type CommercialReadingCommercialRole =
  (typeof COMMERCIAL_READING_COMMERCIAL_ROLES)[number]

export type CommercialReadingCommercialRelevance =
  CommercialRelevance

export type CommercialReadingEvolutionStatus =
  (typeof COMMERCIAL_READING_EVOLUTION_STATUSES)[number]

export type CommercialReadingMethodStatus =
  (typeof COMMERCIAL_READING_METHOD_STATUSES)[number]

export type CommercialReadingMethodAdherenceStatus =
  (typeof COMMERCIAL_READING_METHOD_ADHERENCE_STATUSES)[number]

export type CommercialReadingDecision =
  (typeof COMMERCIAL_READING_DECISIONS)[number]

export type CommercialReadingChannel =
  (typeof COMMERCIAL_READING_CHANNELS)[number]

export type CommercialReadingSellerStrengthKind =
  (typeof COMMERCIAL_READING_SELLER_STRENGTH_KINDS)[number]

export type CommercialReadingImprovementKind =
  (typeof COMMERCIAL_READING_IMPROVEMENT_KINDS)[number]

export type CommercialReadingRiskSeverity =
  (typeof COMMERCIAL_READING_RISK_SEVERITIES)[number]

export type CommercialReadingProductInterestLevel =
  (typeof COMMERCIAL_READING_PRODUCT_INTEREST_LEVELS)[number]

export type CommercialReadingCompetitorMentionType =
  (typeof COMMERCIAL_READING_COMPETITOR_MENTION_TYPES)[number]

export type CommercialReadingCommunicationObservationType =
  (typeof COMMERCIAL_READING_COMMUNICATION_OBSERVATION_TYPES)[number]

export type CommercialReadingCommunicationBehavior =
  (typeof COMMERCIAL_READING_COMMUNICATION_BEHAVIORS)[number]

export type CommercialReadingMissingDiscoveryTopic =
  (typeof COMMERCIAL_READING_MISSING_DISCOVERY_TOPICS)[number]

export type CommercialReadingCustomerHistoryCategory =
  (typeof COMMERCIAL_READING_CUSTOMER_HISTORY_CATEGORIES)[number]

export type CommercialReadingEvidenceItem = {
  summary: string
  evidence_message_ids: string[]
  memory_ids: string[]
}

export type CommercialReadingConversationSummary = {
  initial_context:
    CommercialReadingEvidenceItem | null

  evolution:
    CommercialReadingEvidenceItem | null

  important_events:
    CommercialReadingEvidenceItem[]

  current_state:
    CommercialReadingEvidenceItem

  last_customer_request_or_decision:
    CommercialReadingEvidenceItem | null
}

export type CommercialReadingCustomer = {
  objectives:
    CommercialReadingEvidenceItem[]

  problems:
    CommercialReadingEvidenceItem[]

  impacts:
    CommercialReadingEvidenceItem[]

  needs:
    CommercialReadingEvidenceItem[]

  interests:
    CommercialReadingEvidenceItem[]

  decision_criteria:
    CommercialReadingEvidenceItem[]

  preferences:
    CommercialReadingEvidenceItem[]

  open_questions:
    CommercialReadingEvidenceItem[]

  objections:
    CommercialReadingEvidenceItem[]

  uncertainties:
    CommercialReadingEvidenceItem[]

  discussed_products:
    CommercialReadingCustomerProduct[]

  primary_product_interest:
    CommercialReadingCustomerProduct | null

  competitors:
    CommercialReadingCustomerCompetitor[]

  commitments:
    CommercialReadingCustomerCommitment[]

  missing_discovery:
    CommercialReadingMissingDiscoveryItem[]

  resolved_information:
    CommercialReadingCustomerHistoryItem[]

  superseded_information:
    CommercialReadingCustomerHistoryItem[]

  communication: {
    events:
      CommercialReadingCommunicationObservation[]

    patterns:
      CommercialReadingCommunicationObservation[]
  }
}

export type CommercialReadingCustomerProduct =
  CommercialReadingEvidenceItem & {
    canonical_product_id: string | null
    name: string
    interest_level:
      CommercialReadingProductInterestLevel
  }

export type CommercialReadingCustomerCompetitor =
  CommercialReadingEvidenceItem & {
    name: string | null
    mention_type:
      CommercialReadingCompetitorMentionType
  }

export type CommercialReadingCustomerCommitment =
  CommercialReadingEvidenceItem & {
    status:
      'proposed' |
      'confirmed' |
      'reschedule_requested' |
      'cancelled' |
      'completed'

    scheduled_at: string | null
    proposed_at: string | null
  }

export type CommercialReadingMissingDiscoveryItem =
  CommercialReadingEvidenceItem & {
    topic:
      CommercialReadingMissingDiscoveryTopic
  }

export type CommercialReadingCommunicationObservation =
  CommercialReadingEvidenceItem & {
    observation_type:
      CommercialReadingCommunicationObservationType

    behavior:
      CommercialReadingCommunicationBehavior
  }

export type CommercialReadingCustomerHistoryItem =
  CommercialReadingEvidenceItem & {
    category:
      CommercialReadingCustomerHistoryCategory
  }

export type CommercialReadingEvolutionItem = {
  key: string
  label: string
  status:
    CommercialReadingEvolutionStatus

  explanation: string

  evidence_message_ids:
    string[]

  memory_ids:
    string[]
}

export type CommercialReadingMethodStage = {
  step_order: number

  stage_key:
    string | null

  name: string

  status:
    CommercialReadingMethodStatus

  explanation: string

  evidence_message_ids:
    string[]

  memory_ids:
    string[]
}

export type CommercialReadingCurrentMethodStage = {
  step_order: number
  stage_key: string | null
  name: string
}

export type CommercialReadingMethodAdherence = {
  status:
    CommercialReadingMethodAdherenceStatus

  summary: string

  deviation_stage_order:
    number | null

  what_happened:
    string | null

  missing_information:
    string[]

  why_it_matters:
    string | null

  evidence_message_ids:
    string[]

  memory_ids:
    string[]
}

export type CommercialReadingRecoveryGuidance = {
  objective: string

  missing_information:
    string[]

  recommended_move: string

  optional_question:
    string | null

  evidence_message_ids:
    string[]

  memory_ids:
    string[]
}

export type CommercialReadingMethod = {
  configured: boolean
  name: string | null

  stages:
    CommercialReadingMethodStage[]

  current_stage:
    CommercialReadingCurrentMethodStage | null

  adherence:
    CommercialReadingMethodAdherence

  recovery_guidance:
    CommercialReadingRecoveryGuidance | null
}

export type CommercialReadingSellerStrength = {
  kind:
    CommercialReadingSellerStrengthKind

  summary: string

  why_it_matters: string

  evidence_message_ids:
    string[]

  memory_ids:
    string[]
}

export type CommercialReadingImprovementPoint = {
  kind:
    CommercialReadingImprovementKind

  summary: string
  why_it_matters: string
  impact: string
  how_to_improve: string

  evidence_message_ids:
    string[]

  memory_ids:
    string[]
}

export type CommercialReadingRisk = {
  kind: string

  severity:
    CommercialReadingRiskSeverity

  summary: string

  evidence_message_ids:
    string[]

  memory_ids:
    string[]
}

export type CommercialReadingBestApproach = {
  decision:
    CommercialReadingDecision

  reason: string

  channel:
    CommercialReadingChannel

  evidence_message_ids:
    string[]

  memory_ids:
    string[]
}

export type CommercialReadingCommunication = {
  intervention_needed: boolean

  recommended_question:
    string | null

  recommended_message:
    string | null
}

export type CommercialReadingCrmSuggestion = {
  should_change_crm_stage: boolean

  recommended_status:
    DiagnosticLeadStatus | null

  rationale:
    string | null

  requires_human_confirmation:
    true
}

export type CommercialReadingAgendaSuggestion = {
  should_change_agenda: boolean

  expected_next_action_at:
    string | null

  rationale:
    string | null

  requires_human_confirmation:
    true
}

export type CommercialReading = {
  contract_version:
    typeof COMMERCIAL_READING_CONTRACT_VERSION

  analysis_status:
    CommercialReadingAnalysisStatus

  analysis_limitations:
    string[]

  commercial_role:
    CommercialReadingCommercialRole

  commercial_relevance:
    CommercialReadingCommercialRelevance

  conversation_summary:
    CommercialReadingConversationSummary

  customer:
    CommercialReadingCustomer

  commercial_evolution:
    CommercialReadingEvolutionItem[]

  method:
    CommercialReadingMethod

  seller_strengths:
    CommercialReadingSellerStrength[]

  improvement_points:
    CommercialReadingImprovementPoint[]

  risks: {
    customer_objections:
      CommercialReadingRisk[]

    service_risks:
      CommercialReadingRisk[]
  }

  best_approach:
    CommercialReadingBestApproach

  communication:
    CommercialReadingCommunication

  operations: {
    crm:
      CommercialReadingCrmSuggestion

    agenda:
      CommercialReadingAgendaSuggestion
  }

  evidence_message_ids:
    string[]

  memory_ids:
    string[]
}

export type CommercialReadingMethodStageModelOutput = {
  step_order: number

  status:
    CommercialReadingMethodStatus

  explanation: string

  evidence_message_ids:
    string[]

  memory_ids:
    string[]
}

export type CommercialReadingMethodModelOutput = {
  stages:
    CommercialReadingMethodStageModelOutput[]

  adherence:
    CommercialReadingMethodAdherence

  recovery_guidance:
    CommercialReadingRecoveryGuidance | null
}

export type CommercialReadingModelOutput =
  Omit<
    Pick<
      CommercialReading,
      (typeof COMMERCIAL_READING_MODEL_OUTPUT_FIELDS)[number]
    >,
    'method'
  > & {
    method:
      CommercialReadingMethodModelOutput | null
  }

export type CommercialReadingSalesMethod =
  CompanionDiagnosticInput[
    'commercial_context'
  ]['sales_method']

export type CommercialReadingDerivedOutput =
  Pick<
    CommercialReading,
    | 'analysis_status'
    | 'analysis_limitations'
    | 'commercial_role'
    | 'commercial_relevance'
    | 'customer'
    | 'communication'
    | 'operations'
  > & {
    sales_method:
      CommercialReadingSalesMethod
  }

export type CommercialReadingNormalizationContext = {
  available_message_ids:
    string[]

  seller_message_ids?:
    string[]

  available_memory_ids:
    string[]

  current_crm_status:
    DiagnosticLeadStatus | null

  reference_time:
    string
}

type JsonRecord =
  Record<string, unknown>

const LEAD_STATUSES = [
  'novo',
  'contato',
  'respondeu',
  'negociacao',
  'pausado',
  'cancelado',
  'ganho',
  'perdido',
] as const satisfies
  readonly DiagnosticLeadStatus[]

export class CommercialReadingContractError
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
      'CommercialReadingContractError'

    this.code = code
    this.path = path
  }
}

function fail(
  code: string,
  path: string,
  message: string,
): never {
  throw new CommercialReadingContractError(
    code,
    path,
    message,
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

function requireRecord(
  value: unknown,
  path: string,
): JsonRecord {
  if (!isRecord(value)) {
    fail(
      'INVALID_SHAPE',
      path,
      `${path} precisa ser um objeto.`,
    )
  }

  return value
}

function requireExactFields(
  record: JsonRecord,
  expectedFields:
    readonly string[],
  path: string,
): void {
  const actualFields =
    Object.keys(record)

  const missingField =
    expectedFields.find(
      field =>
        !Object.prototype.hasOwnProperty.call(
          record,
          field,
        ),
    )

  if (missingField) {
    fail(
      'MISSING_REQUIRED_FIELD',
      `${path}.${missingField}`,
      `${path} não contém todos os campos obrigatórios.`,
    )
  }

  if (
    actualFields.length !==
      expectedFields.length ||
    actualFields.some(
      field =>
        !expectedFields.includes(
          field,
        ),
    )
  ) {
    fail(
      'ADDITIONAL_FIELD_NOT_ALLOWED',
      path,
      `${path} contém campo não previsto pelo contrato.`,
    )
  }
}

function requireArray(
  value: unknown,
  path: string,
): unknown[] {
  if (!Array.isArray(value)) {
    fail(
      'INVALID_SHAPE',
      path,
      `${path} precisa ser uma lista.`,
    )
  }

  return value
}

function requireString(
  value: unknown,
  path: string,
  maximumLength = 4000,
): string {
  if (typeof value !== 'string') {
    fail(
      'INVALID_SHAPE',
      path,
      `${path} precisa ser texto.`,
    )
  }

  const normalized =
    value.trim()

  if (!normalized) {
    fail(
      'EMPTY_VALUE',
      path,
      `${path} não pode ficar vazio.`,
    )
  }

  if (
    normalized.length >
    maximumLength
  ) {
    fail(
      'VALUE_TOO_LONG',
      path,
      `${path} excede o limite permitido.`,
    )
  }

  return normalized
}

function requireNullableString(
  value: unknown,
  path: string,
): string | null {
  if (value === null) {
    return null
  }

  return requireString(
    value,
    path,
  )
}

function requireBoolean(
  value: unknown,
  path: string,
): boolean {
  if (typeof value !== 'boolean') {
    fail(
      'INVALID_SHAPE',
      path,
      `${path} precisa ser booleano.`,
    )
  }

  return value
}

function requireTrue(
  value: unknown,
  path: string,
): true {
  if (value !== true) {
    fail(
      'HUMAN_CONFIRMATION_REQUIRED',
      path,
      `${path} precisa ser true.`,
    )
  }

  return true
}

function requirePositiveInteger(
  value: unknown,
  path: string,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1
  ) {
    fail(
      'INVALID_NUMBER',
      path,
      `${path} precisa ser inteiro positivo.`,
    )
  }

  return value
}

function requireNullablePositiveInteger(
  value: unknown,
  path: string,
): number | null {
  if (value === null) {
    return null
  }

  return requirePositiveInteger(
    value,
    path,
  )
}

function requireEnum<
  const TValues extends readonly string[],
>(
  value: unknown,
  allowedValues: TValues,
  path: string,
): TValues[number] {
  if (
    typeof value !== 'string' ||
    !allowedValues.includes(value)
  ) {
    fail(
      'INVALID_ENUM',
      path,
      `${path} possui valor inválido.`,
    )
  }

  return value as
    TValues[number]
}

function requireUniqueStringArray(
  value: unknown,
  path: string,
): string[] {
  const values =
    requireArray(
      value,
      path,
    )

  const normalized =
    values.map(
      (item, index) =>
        requireString(
          item,
          `${path}[${index}]`,
          500,
        ),
    )

  if (
    new Set(normalized).size !==
    normalized.length
  ) {
    fail(
      'DUPLICATE_VALUE',
      path,
      `${path} possui valores duplicados.`,
    )
  }

  return normalized
}

function normalizeReferences(
  record: JsonRecord,
  path: string,
  context:
    CommercialReadingNormalizationContext,
  collectedMessageIds:
    Set<string>,
  collectedMemoryIds:
    Set<string>,
  requireGrounding = true,
  requireDirectMessage = false,
): {
  evidence_message_ids: string[]
  memory_ids: string[]
} {
  const messageIds =
    requireUniqueStringArray(
      record.evidence_message_ids,
      `${path}.evidence_message_ids`,
    )

  const memoryIds =
    requireUniqueStringArray(
      record.memory_ids,
      `${path}.memory_ids`,
    )

  const availableMessageIds =
    new Set(
      context.available_message_ids,
    )

  const availableMemoryIds =
    new Set(
      context.available_memory_ids,
    )

  for (const id of messageIds) {
    if (!availableMessageIds.has(id)) {
      fail(
        'UNKNOWN_EVIDENCE',
        `${path}.evidence_message_ids`,
        `A mensagem ${id} não está disponível.`,
      )
    }

    collectedMessageIds.add(id)
  }

  for (const id of memoryIds) {
    if (!availableMemoryIds.has(id)) {
      fail(
        'UNKNOWN_MEMORY',
        `${path}.memory_ids`,
        `A memória ${id} não está disponível.`,
      )
    }

    collectedMemoryIds.add(id)
  }

  if (
    requireDirectMessage &&
    messageIds.length === 0
  ) {
    fail(
      'DIRECT_EVIDENCE_REQUIRED',
      `${path}.evidence_message_ids`,
      `${path} precisa de evidência concreta da conversa.`,
    )
  }

  if (
    requireDirectMessage &&
    context.seller_message_ids &&
    !messageIds.some(
      id =>
        context
          .seller_message_ids
          ?.includes(id),
    )
  ) {
    fail(
      'SELLER_EVIDENCE_REQUIRED',
      `${path}.evidence_message_ids`,
      `${path} precisa apontar para uma mensagem do vendedor.`,
    )
  }

  if (
    requireGrounding &&
    messageIds.length === 0 &&
    memoryIds.length === 0
  ) {
    fail(
      'GROUNDING_REQUIRED',
      path,
      `${path} precisa de evidência ou memória.`,
    )
  }

  return {
    evidence_message_ids:
      messageIds,

    memory_ids:
      memoryIds,
  }
}

function normalizeEvidenceItem(
  value: unknown,
  path: string,
  context:
    CommercialReadingNormalizationContext,
  collectedMessageIds:
    Set<string>,
  collectedMemoryIds:
    Set<string>,
): CommercialReadingEvidenceItem {
  const record =
    requireRecord(
      value,
      path,
    )

  requireExactFields(
    record,
    [
      'summary',
      'evidence_message_ids',
      'memory_ids',
    ],
    path,
  )

  return {
    summary:
      requireString(
        record.summary,
        `${path}.summary`,
      ),

    ...normalizeReferences(
      record,
      path,
      context,
      collectedMessageIds,
      collectedMemoryIds,
    ),
  }
}

function normalizeNullableEvidenceItem(
  value: unknown,
  path: string,
  context:
    CommercialReadingNormalizationContext,
  collectedMessageIds:
    Set<string>,
  collectedMemoryIds:
    Set<string>,
): CommercialReadingEvidenceItem | null {
  if (value === null) {
    return null
  }

  return normalizeEvidenceItem(
    value,
    path,
    context,
    collectedMessageIds,
    collectedMemoryIds,
  )
}

function normalizeEvidenceList(
  value: unknown,
  path: string,
  context:
    CommercialReadingNormalizationContext,
  collectedMessageIds:
    Set<string>,
  collectedMemoryIds:
    Set<string>,
): CommercialReadingEvidenceItem[] {
  return requireArray(
    value,
    path,
  ).map(
    (item, index) =>
      normalizeEvidenceItem(
        item,
        `${path}[${index}]`,
        context,
        collectedMessageIds,
        collectedMemoryIds,
      ),
  )
}

function normalizeConversationSummary(
  value: unknown,
  context:
    CommercialReadingNormalizationContext,
  collectedMessageIds:
    Set<string>,
  collectedMemoryIds:
    Set<string>,
): CommercialReadingConversationSummary {
  const record =
    requireRecord(
      value,
      'reading.conversation_summary',
    )

  requireExactFields(
    record,
    [
      'initial_context',
      'evolution',
      'important_events',
      'current_state',
      'last_customer_request_or_decision',
    ],
    'reading.conversation_summary',
  )

  return {
    initial_context:
      normalizeNullableEvidenceItem(
        record.initial_context,
        'reading.conversation_summary.initial_context',
        context,
        collectedMessageIds,
        collectedMemoryIds,
      ),

    evolution:
      normalizeNullableEvidenceItem(
        record.evolution,
        'reading.conversation_summary.evolution',
        context,
        collectedMessageIds,
        collectedMemoryIds,
      ),

    important_events:
      normalizeEvidenceList(
        record.important_events,
        'reading.conversation_summary.important_events',
        context,
        collectedMessageIds,
        collectedMemoryIds,
      ),

    current_state:
      normalizeEvidenceItem(
        record.current_state,
        'reading.conversation_summary.current_state',
        context,
        collectedMessageIds,
        collectedMemoryIds,
      ),

    last_customer_request_or_decision:
      normalizeNullableEvidenceItem(
        record.last_customer_request_or_decision,
        'reading.conversation_summary.last_customer_request_or_decision',
        context,
        collectedMessageIds,
        collectedMemoryIds,
      ),
  }
}

function normalizeCustomer(
  value: unknown,
  context:
    CommercialReadingNormalizationContext,
  collectedMessageIds:
    Set<string>,
  collectedMemoryIds:
    Set<string>,
): CommercialReadingCustomer {
  const record =
    requireRecord(
      value,
      'reading.customer',
    )

  const fields = [
    'objectives',
    'problems',
    'impacts',
    'needs',
    'interests',
    'decision_criteria',
    'preferences',
    'open_questions',
    'objections',
    'uncertainties',
    'discussed_products',
    'primary_product_interest',
    'competitors',
    'commitments',
    'missing_discovery',
    'resolved_information',
    'superseded_information',
    'communication',
  ] as const

  requireExactFields(
    record,
    fields,
    'reading.customer',
  )

  const normalizeProduct = (
    value: unknown,
    path: string,
  ): CommercialReadingCustomerProduct => {
    const product =
      requireRecord(
        value,
        path,
      )

    requireExactFields(
      product,
      [
        'canonical_product_id',
        'name',
        'interest_level',
        'summary',
        'evidence_message_ids',
        'memory_ids',
      ],
      path,
    )

    return {
      canonical_product_id:
        requireNullableString(
          product.canonical_product_id,
          `${path}.canonical_product_id`,
        ),

      name:
        requireString(
          product.name,
          `${path}.name`,
          500,
        ),

      interest_level:
        requireEnum(
          product.interest_level,
          COMMERCIAL_READING_PRODUCT_INTEREST_LEVELS,
          `${path}.interest_level`,
        ),

      summary:
        requireString(
          product.summary,
          `${path}.summary`,
        ),

      ...normalizeReferences(
        product,
        path,
        context,
        collectedMessageIds,
        collectedMemoryIds,
      ),
    }
  }

  const products =
    requireArray(
      record.discussed_products,
      'reading.customer.discussed_products',
    ).map(
      (item, index) =>
        normalizeProduct(
          item,
          `reading.customer.discussed_products[${index}]`,
        ),
    )

  const primaryProduct =
    record.primary_product_interest === null
      ? null
      : normalizeProduct(
          record.primary_product_interest,
          'reading.customer.primary_product_interest',
        )

  if (
    primaryProduct !== null &&
    (
      primaryProduct.interest_level !==
        'primary' ||
      !products.some(
        product =>
          product.canonical_product_id ===
            primaryProduct.canonical_product_id &&
          product.name ===
            primaryProduct.name &&
          product.interest_level ===
            primaryProduct.interest_level &&
          product.summary ===
            primaryProduct.summary &&
          product.evidence_message_ids.length ===
            primaryProduct.evidence_message_ids.length &&
          product.evidence_message_ids.every(
            (id, index) =>
              id ===
              primaryProduct.evidence_message_ids[index],
          ) &&
          product.memory_ids.length ===
            primaryProduct.memory_ids.length &&
          product.memory_ids.every(
            (id, index) =>
              id ===
              primaryProduct.memory_ids[index],
          ),
      )
    )
  ) {
    fail(
      'PRIMARY_PRODUCT_MISMATCH',
      'reading.customer.primary_product_interest',
      'O produto principal precisa ser um item primary da lista de produtos discutidos.',
    )
  }

  const competitors =
    requireArray(
      record.competitors,
      'reading.customer.competitors',
    ).map(
      (item, index) => {
        const path =
          `reading.customer.competitors[${index}]`

        const competitor =
          requireRecord(
            item,
            path,
          )

        requireExactFields(
          competitor,
          [
            'name',
            'mention_type',
            'summary',
            'evidence_message_ids',
            'memory_ids',
          ],
          path,
        )

        const mentionType =
          requireEnum(
            competitor.mention_type,
            COMMERCIAL_READING_COMPETITOR_MENTION_TYPES,
            `${path}.mention_type`,
          )

        const name =
          requireNullableString(
            competitor.name,
            `${path}.name`,
          )

        if (
          (
            mentionType === 'named' &&
            name === null
          ) ||
          (
            mentionType === 'unnamed_alternative' &&
            name !== null
          )
        ) {
          fail(
            'COMPETITOR_NAME_MISMATCH',
            `${path}.name`,
            'Concorrente nominal exige nome; alternativa sem nome precisa permanecer desconhecida.',
          )
        }

        return {
          name,
          mention_type:
            mentionType,

          summary:
            requireString(
              competitor.summary,
              `${path}.summary`,
            ),

          ...normalizeReferences(
            competitor,
            path,
            context,
            collectedMessageIds,
            collectedMemoryIds,
          ),
        }
      },
    )

  const commitments =
    requireArray(
      record.commitments,
      'reading.customer.commitments',
    ).map(
      (item, index) => {
        const path =
          `reading.customer.commitments[${index}]`

        const commitment =
          requireRecord(
            item,
            path,
          )

        requireExactFields(
          commitment,
          [
            'status',
            'scheduled_at',
            'proposed_at',
            'summary',
            'evidence_message_ids',
            'memory_ids',
          ],
          path,
        )

        return {
          status:
            requireEnum(
              commitment.status,
              [
                'proposed',
                'confirmed',
                'reschedule_requested',
                'cancelled',
                'completed',
              ] as const,
              `${path}.status`,
            ),

          scheduled_at:
            requireNullableString(
              commitment.scheduled_at,
              `${path}.scheduled_at`,
            ),

          proposed_at:
            requireNullableString(
              commitment.proposed_at,
              `${path}.proposed_at`,
            ),

          summary:
            requireString(
              commitment.summary,
              `${path}.summary`,
            ),

          ...normalizeReferences(
            commitment,
            path,
            context,
            collectedMessageIds,
            collectedMemoryIds,
          ),
        }
      },
    )

  const missingDiscovery =
    requireArray(
      record.missing_discovery,
      'reading.customer.missing_discovery',
    ).map(
      (item, index) => {
        const path =
          `reading.customer.missing_discovery[${index}]`

        const missing =
          requireRecord(
            item,
            path,
          )

        requireExactFields(
          missing,
          [
            'topic',
            'summary',
            'evidence_message_ids',
            'memory_ids',
          ],
          path,
        )

        return {
          topic:
            requireEnum(
              missing.topic,
              COMMERCIAL_READING_MISSING_DISCOVERY_TOPICS,
              `${path}.topic`,
            ),

          summary:
            requireString(
              missing.summary,
              `${path}.summary`,
            ),

          ...normalizeReferences(
            missing,
            path,
            context,
            collectedMessageIds,
            collectedMemoryIds,
          ),
        }
      },
    )

  const normalizeHistory = (
    value: unknown,
    path: string,
  ): CommercialReadingCustomerHistoryItem => {
    const history =
      requireRecord(
        value,
        path,
      )

    requireExactFields(
      history,
      [
        'category',
        'summary',
        'evidence_message_ids',
        'memory_ids',
      ],
      path,
    )

    return {
      category:
        requireEnum(
          history.category,
          COMMERCIAL_READING_CUSTOMER_HISTORY_CATEGORIES,
          `${path}.category`,
        ),

      summary:
        requireString(
          history.summary,
          `${path}.summary`,
        ),

      ...normalizeReferences(
        history,
        path,
        context,
        collectedMessageIds,
        collectedMemoryIds,
      ),
    }
  }

  const communication =
    requireRecord(
      record.communication,
      'reading.customer.communication',
    )

  requireExactFields(
    communication,
    [
      'events',
      'patterns',
    ],
    'reading.customer.communication',
  )

  const normalizeCommunication = (
    value: unknown,
    path: string,
  ): CommercialReadingCommunicationObservation => {
    const observation =
      requireRecord(
        value,
        path,
      )

    requireExactFields(
      observation,
      [
        'observation_type',
        'behavior',
        'summary',
        'evidence_message_ids',
        'memory_ids',
      ],
      path,
    )

    return {
      observation_type:
        requireEnum(
          observation.observation_type,
          COMMERCIAL_READING_COMMUNICATION_OBSERVATION_TYPES,
          `${path}.observation_type`,
        ),

      behavior:
        requireEnum(
          observation.behavior,
          COMMERCIAL_READING_COMMUNICATION_BEHAVIORS,
          `${path}.behavior`,
        ),

      summary:
        requireString(
          observation.summary,
          `${path}.summary`,
        ),

      ...normalizeReferences(
        observation,
        path,
        context,
        collectedMessageIds,
        collectedMemoryIds,
      ),
    }
  }

  const evidenceFields = [
    'objectives',
    'problems',
    'impacts',
    'needs',
    'interests',
    'decision_criteria',
    'preferences',
    'open_questions',
    'objections',
    'uncertainties',
  ] as const

  const evidenceLists =
    Object.fromEntries(
      evidenceFields.map(
        field => [
          field,
          normalizeEvidenceList(
            record[field],
            `reading.customer.${field}`,
            context,
            collectedMessageIds,
            collectedMemoryIds,
          ),
        ],
      ),
    ) as Pick<
      CommercialReadingCustomer,
      (typeof evidenceFields)[number]
    >

  return {
    ...evidenceLists,

    discussed_products:
      products,

    primary_product_interest:
      primaryProduct,

    competitors,
    commitments,

    missing_discovery:
      missingDiscovery,

    resolved_information:
      requireArray(
        record.resolved_information,
        'reading.customer.resolved_information',
      ).map(
        (item, index) =>
          normalizeHistory(
            item,
            `reading.customer.resolved_information[${index}]`,
          ),
      ),

    superseded_information:
      requireArray(
        record.superseded_information,
        'reading.customer.superseded_information',
      ).map(
        (item, index) =>
          normalizeHistory(
            item,
            `reading.customer.superseded_information[${index}]`,
          ),
      ),

    communication: {
      events:
        requireArray(
          communication.events,
          'reading.customer.communication.events',
        ).map(
          (item, index) =>
            normalizeCommunication(
              item,
              `reading.customer.communication.events[${index}]`,
            ),
        ),

      patterns:
        requireArray(
          communication.patterns,
          'reading.customer.communication.patterns',
        ).map(
          (item, index) =>
            normalizeCommunication(
              item,
              `reading.customer.communication.patterns[${index}]`,
            ),
        ),
    },
  }
}

function normalizeEvolution(
  value: unknown,
  context:
    CommercialReadingNormalizationContext,
  collectedMessageIds:
    Set<string>,
  collectedMemoryIds:
    Set<string>,
): CommercialReadingEvolutionItem[] {
  const usedKeys =
    new Set<string>()

  return requireArray(
    value,
    'reading.commercial_evolution',
  ).map(
    (item, index) => {
      const path =
        `reading.commercial_evolution[${index}]`

      const record =
        requireRecord(
          item,
          path,
        )

      requireExactFields(
        record,
        [
          'key',
          'label',
          'status',
          'explanation',
          'evidence_message_ids',
          'memory_ids',
        ],
        path,
      )

      const key =
        requireString(
          record.key,
          `${path}.key`,
          200,
        )

      if (usedKeys.has(key)) {
        fail(
          'DUPLICATE_EVOLUTION_KEY',
          `${path}.key`,
          `A chave ${key} está duplicada.`,
        )
      }

      usedKeys.add(key)

      const status =
        requireEnum(
          record.status,
          COMMERCIAL_READING_EVOLUTION_STATUSES,
          `${path}.status`,
        )

      return {
        key,

        label:
          requireString(
            record.label,
            `${path}.label`,
            500,
          ),

        status,

        explanation:
          requireString(
            record.explanation,
            `${path}.explanation`,
          ),

        ...normalizeReferences(
          record,
          path,
          context,
          collectedMessageIds,
          collectedMemoryIds,
          ![
            'pending',
            'not_started',
            'not_applicable',
          ].includes(status),
        ),
      }
    },
  )
}

function normalizeMethodAdherence(
  value: unknown,
  path: string,
  configured: boolean,
  stageOrders: Set<number>,
  context:
    CommercialReadingNormalizationContext,
  collectedMessageIds:
    Set<string>,
  collectedMemoryIds:
    Set<string>,
): CommercialReadingMethodAdherence {
  const record =
    requireRecord(
      value,
      path,
    )

  requireExactFields(
    record,
    [
      'status',
      'summary',
      'deviation_stage_order',
      'what_happened',
      'missing_information',
      'why_it_matters',
      'evidence_message_ids',
      'memory_ids',
    ],
    path,
  )

  const status =
    requireEnum(
      record.status,
      COMMERCIAL_READING_METHOD_ADHERENCE_STATUSES,
      `${path}.status`,
    )

  const deviationStageOrder =
    requireNullablePositiveInteger(
      record.deviation_stage_order,
      `${path}.deviation_stage_order`,
    )

  const whatHappened =
    requireNullableString(
      record.what_happened,
      `${path}.what_happened`,
    )

  const missingInformation =
    requireUniqueStringArray(
      record.missing_information,
      `${path}.missing_information`,
    )

  const whyItMatters =
    requireNullableString(
      record.why_it_matters,
      `${path}.why_it_matters`,
    )

  if (
    configured &&
    status === 'not_configured'
  ) {
    fail(
      'METHOD_ADHERENCE_MISMATCH',
      `${path}.status`,
      'Método configurado não pode ser avaliado como não configurado.',
    )
  }

  if (
    !configured &&
    status !== 'not_configured'
  ) {
    fail(
      'METHOD_ADHERENCE_MISMATCH',
      `${path}.status`,
      'Método ausente precisa usar aderência not_configured.',
    )
  }

  if (
    status === 'off_method'
  ) {
    if (
      deviationStageOrder === null ||
      !stageOrders.has(
        deviationStageOrder,
      )
    ) {
      fail(
        'METHOD_DEVIATION_STAGE_REQUIRED',
        `${path}.deviation_stage_order`,
        'Saída do método precisa apontar para uma etapa canônica.',
      )
    }

    if (
      whatHappened === null ||
      missingInformation.length === 0 ||
      whyItMatters === null
    ) {
      fail(
        'METHOD_DEVIATION_EXPLANATION_REQUIRED',
        path,
        'Saída do método precisa explicar o que aconteceu, o que faltou e por que importa.',
      )
    }
  } else if (
    deviationStageOrder !== null ||
    whatHappened !== null ||
    whyItMatters !== null
  ) {
    fail(
      'METHOD_DEVIATION_NOT_ALLOWED',
      path,
      'Detalhes de saída só são permitidos quando a conversa saiu do método.',
    )
  }

  const requiresGrounding =
    ![
      'not_configured',
      'insufficient_evidence',
    ].includes(status)

  return {
    status,

    summary:
      requireString(
        record.summary,
        `${path}.summary`,
      ),

    deviation_stage_order:
      deviationStageOrder,

    what_happened:
      whatHappened,

    missing_information:
      missingInformation,

    why_it_matters:
      whyItMatters,

    ...normalizeReferences(
      record,
      path,
      context,
      collectedMessageIds,
      collectedMemoryIds,
      requiresGrounding,
      status === 'off_method',
    ),
  }
}

function normalizeRecoveryGuidance(
  value: unknown,
  path: string,
  adherenceStatus:
    CommercialReadingMethodAdherenceStatus,
  context:
    CommercialReadingNormalizationContext,
  collectedMessageIds:
    Set<string>,
  collectedMemoryIds:
    Set<string>,
): CommercialReadingRecoveryGuidance | null {
  if (value === null) {
    if (
      adherenceStatus === 'off_method'
    ) {
      fail(
        'METHOD_RECOVERY_REQUIRED',
        path,
        'Saída do método precisa de uma condução corretiva.',
      )
    }

    return null
  }

  if (
    adherenceStatus !== 'off_method'
  ) {
    fail(
      'METHOD_RECOVERY_NOT_ALLOWED',
      path,
      'Condução corretiva só é permitida quando a conversa saiu do método.',
    )
  }

  const record =
    requireRecord(
      value,
      path,
    )

  requireExactFields(
    record,
    [
      'objective',
      'missing_information',
      'recommended_move',
      'optional_question',
      'evidence_message_ids',
      'memory_ids',
    ],
    path,
  )

  const missingInformation =
    requireUniqueStringArray(
      record.missing_information,
      `${path}.missing_information`,
    )

  if (missingInformation.length === 0) {
    fail(
      'METHOD_RECOVERY_MISSING_INFORMATION_REQUIRED',
      `${path}.missing_information`,
      'Condução corretiva precisa declarar o que ainda falta compreender.',
    )
  }

  return {
    objective:
      requireString(
        record.objective,
        `${path}.objective`,
      ),

    missing_information:
      missingInformation,

    recommended_move:
      requireString(
        record.recommended_move,
        `${path}.recommended_move`,
      ),

    optional_question:
      requireNullableString(
        record.optional_question,
        `${path}.optional_question`,
      ),

    ...normalizeReferences(
      record,
      path,
      context,
      collectedMessageIds,
      collectedMemoryIds,
      true,
      true,
    ),
  }
}

function deriveCurrentMethodStage(
  stages:
    CommercialReadingMethodStage[],
  adherenceStatus:
    CommercialReadingMethodAdherenceStatus,
): CommercialReadingCurrentMethodStage | null {
  if (
    [
      'not_configured',
      'insufficient_evidence',
    ].includes(adherenceStatus)
  ) {
    return null
  }

  const stage =
    stages.find(
      item =>
        item.status === 'active',
    ) ??
    stages.find(
      item =>
        item.status === 'partial',
    ) ??
    stages.find(
      item =>
        item.status === 'not_started',
    ) ??
    [...stages]
      .reverse()
      .find(
        item =>
          item.status === 'completed',
      ) ??
    null

  return stage
    ? {
        step_order:
          stage.step_order,

        stage_key:
          stage.stage_key,

        name:
          stage.name,
      }
    : null
}

function normalizeCurrentMethodStage(
  value: unknown,
  path: string,
): CommercialReadingCurrentMethodStage | null {
  if (value === null) {
    return null
  }

  const record =
    requireRecord(
      value,
      path,
    )

  requireExactFields(
    record,
    [
      'step_order',
      'stage_key',
      'name',
    ],
    path,
  )

  return {
    step_order:
      requirePositiveInteger(
        record.step_order,
        `${path}.step_order`,
      ),

    stage_key:
      requireNullableString(
        record.stage_key,
        `${path}.stage_key`,
      ),

    name:
      requireString(
        record.name,
        `${path}.name`,
        500,
      ),
  }
}

function normalizeMethod(
  value: unknown,
  context:
    CommercialReadingNormalizationContext,
  collectedMessageIds:
    Set<string>,
  collectedMemoryIds:
    Set<string>,
): CommercialReadingMethod {
  const record =
    requireRecord(
      value,
      'reading.method',
    )

  requireExactFields(
    record,
    [
      'configured',
      'name',
      'stages',
      'current_stage',
      'adherence',
      'recovery_guidance',
    ],
    'reading.method',
  )

  const configured =
    requireBoolean(
      record.configured,
      'reading.method.configured',
    )

  const name =
    requireNullableString(
      record.name,
      'reading.method.name',
    )

  const usedOrders =
    new Set<number>()

  const usedKeys =
    new Set<string>()

  const stages =
    requireArray(
      record.stages,
      'reading.method.stages',
    ).map(
      (item, index) => {
        const path =
          `reading.method.stages[${index}]`

        const stage =
          requireRecord(
            item,
            path,
          )

        requireExactFields(
          stage,
          [
            'step_order',
            'stage_key',
            'name',
            'status',
            'explanation',
            'evidence_message_ids',
            'memory_ids',
          ],
          path,
        )

        const stepOrder =
          requirePositiveInteger(
            stage.step_order,
            `${path}.step_order`,
          )

        if (usedOrders.has(stepOrder)) {
          fail(
            'DUPLICATE_METHOD_ORDER',
            `${path}.step_order`,
            'A ordem da etapa está duplicada.',
          )
        }

        usedOrders.add(stepOrder)

        const stageKey =
          requireNullableString(
            stage.stage_key,
            `${path}.stage_key`,
          )

        if (
          stageKey !== null &&
          usedKeys.has(stageKey)
        ) {
          fail(
            'DUPLICATE_METHOD_KEY',
            `${path}.stage_key`,
            `A chave ${stageKey} está duplicada.`,
          )
        }

        if (stageKey !== null) {
          usedKeys.add(stageKey)
        }

        const status =
          requireEnum(
            stage.status,
            COMMERCIAL_READING_METHOD_STATUSES,
            `${path}.status`,
          )

        return {
          step_order:
            stepOrder,

          stage_key:
            stageKey,

          name:
            requireString(
              stage.name,
              `${path}.name`,
              500,
            ),

          status,

          explanation:
            requireString(
              stage.explanation,
              `${path}.explanation`,
            ),

          ...normalizeReferences(
            stage,
            path,
            context,
            collectedMessageIds,
            collectedMemoryIds,
            ![
              'not_started',
              'not_applicable',
            ].includes(status),
          ),
        }
      },
    )

  if (
    stages.filter(
      stage =>
        stage.status === 'active',
    ).length > 1
  ) {
    fail(
      'MULTIPLE_ACTIVE_METHOD_STAGES',
      'reading.method.stages',
      'Somente uma etapa pode representar o momento atual do método.',
    )
  }

  const adherence =
    normalizeMethodAdherence(
      record.adherence,
      'reading.method.adherence',
      configured,
      usedOrders,
      context,
      collectedMessageIds,
      collectedMemoryIds,
    )

  const recoveryGuidance =
    normalizeRecoveryGuidance(
      record.recovery_guidance,
      'reading.method.recovery_guidance',
      adherence.status,
      context,
      collectedMessageIds,
      collectedMemoryIds,
    )

  const currentStage =
    normalizeCurrentMethodStage(
      record.current_stage,
      'reading.method.current_stage',
    )

  const expectedCurrentStage =
    deriveCurrentMethodStage(
      stages,
      adherence.status,
    )

  if (
    JSON.stringify(currentStage) !==
    JSON.stringify(expectedCurrentStage)
  ) {
    fail(
      'CURRENT_METHOD_STAGE_MISMATCH',
      'reading.method.current_stage',
      'Etapa atual precisa ser derivada dos status canônicos do método.',
    )
  }

  if (
    configured &&
    name === null
  ) {
    fail(
      'METHOD_NAME_REQUIRED',
      'reading.method.name',
      'Método configurado precisa possuir nome.',
    )
  }

  if (
    configured &&
    stages.length === 0
  ) {
    fail(
      'METHOD_STAGES_REQUIRED',
      'reading.method.stages',
      'Método configurado precisa possuir etapas.',
    )
  }

  if (
    !configured &&
    (
      name !== null ||
      stages.length > 0 ||
      currentStage !== null ||
      recoveryGuidance !== null
    )
  ) {
    fail(
      'METHOD_NOT_CONFIGURED',
      'reading.method',
      'Método não configurado não pode inventar avaliação ou etapas.',
    )
  }

  return {
    configured,
    name,
    stages,
    current_stage:
      currentStage,
    adherence,
    recovery_guidance:
      recoveryGuidance,
  }
}

type CanonicalMethodStage = {
  step_order: number
  stage_key: string | null
  name: string
  required: boolean
}

function buildCanonicalMethodStages(
  salesMethod:
    CommercialReadingSalesMethod,
): CanonicalMethodStage[] {
  if (!salesMethod.configured) {
    return []
  }

  if (
    salesMethod.contract_version ===
      'commercial-method-v2' &&
    salesMethod.definition
  ) {
    return [
      ...salesMethod
        .definition
        .stages,
    ]
      .sort(
        (a, b) =>
          a.display_order -
          b.display_order,
      )
      .map(
        stage => ({
          step_order:
            stage.display_order,

          stage_key:
            stage.key,

          name:
            stage.name,

          required:
            stage.requirement ===
            'required',
        }),
      )
  }

  return [
    ...salesMethod.steps,
  ]
    .sort(
      (a, b) =>
        a.step_order -
        b.step_order,
    )
    .map(
      stage => ({
        step_order:
          stage.step_order,

        stage_key:
          null,

        name:
          stage.name,

        required:
          stage.is_required,
      }),
    )
}

function buildUnavailableMethod(
  salesMethod:
    CommercialReadingSalesMethod,
  reason:
    'not_configured' |
    'insufficient_evidence',
): CommercialReadingMethod {
  const stages =
    buildCanonicalMethodStages(
      salesMethod,
    )
      .map(
        stage => ({
          step_order:
            stage.step_order,

          stage_key:
            stage.stage_key,

          name:
            stage.name,

          status:
            'not_applicable' as const,

          explanation:
            'A sessão atual não possui relevância comercial confirmada para avaliar esta etapa.',

          evidence_message_ids: [],

          memory_ids: [],
        }),
      )

  const configured =
    reason !== 'not_configured'

  return {
    configured,

    name:
      configured
        ? salesMethod.name
        : null,

    stages,

    current_stage:
      null,

    adherence: {
      status:
        reason,

      summary:
        reason === 'not_configured'
          ? 'Método comercial não configurado.'
          : 'A sessão atual não possui evidência comercial suficiente para avaliar o método.',

      deviation_stage_order:
        null,

      what_happened:
        null,

      missing_information: [],

      why_it_matters:
        null,

      evidence_message_ids: [],

      memory_ids: [],
    },

    recovery_guidance:
      null,
  }
}

function normalizeMethodModelOutput({
  value,
  salesMethod,
  commerciallyActionable,
  context,
}: {
  value: unknown
  salesMethod:
    CommercialReadingSalesMethod
  commerciallyActionable: boolean
  context:
    CommercialReadingNormalizationContext
}): CommercialReadingMethod {
  if (!salesMethod.configured) {
    if (value !== null) {
      fail(
        'METHOD_NOT_CONFIGURED',
        'reading.method',
        'Método não configurado precisa ser derivado como null no output do modelo.',
      )
    }

    return buildUnavailableMethod(
      salesMethod,
      'not_configured',
    )
  }

  const canonicalStages =
    buildCanonicalMethodStages(
      salesMethod,
    )

  if (
    !salesMethod.name ||
    canonicalStages.length === 0
  ) {
    fail(
      'INVALID_CANONICAL_METHOD',
      'context.sales_method',
      'Método canônico configurado precisa possuir nome e etapas.',
    )
  }

  if (!commerciallyActionable) {
    if (value !== null) {
      fail(
        'METHOD_ASSESSMENT_NOT_ALLOWED',
        'reading.method',
        'Sessão sem relevância comercial não pode gerar avaliação nova do método.',
      )
    }

    return buildUnavailableMethod(
      salesMethod,
      'insufficient_evidence',
    )
  }

  const record =
    requireRecord(
      value,
      'reading.method',
    )

  requireExactFields(
    record,
    [
      'stages',
      'adherence',
      'recovery_guidance',
    ],
    'reading.method',
  )

  const stageOutputByOrder =
    new Map<
      number,
      JsonRecord
    >()

  requireArray(
    record.stages,
    'reading.method.stages',
  ).forEach(
    (item, index) => {
      const path =
        `reading.method.stages[${index}]`

      const stage =
        requireRecord(
          item,
          path,
        )

      requireExactFields(
        stage,
        [
          'step_order',
          'status',
          'explanation',
          'evidence_message_ids',
          'memory_ids',
        ],
        path,
      )

      const stepOrder =
        requirePositiveInteger(
          stage.step_order,
          `${path}.step_order`,
        )

      if (
        stageOutputByOrder.has(
          stepOrder,
        )
      ) {
        fail(
          'DUPLICATE_METHOD_ORDER',
          `${path}.step_order`,
          'A ordem da etapa está duplicada.',
        )
      }

      stageOutputByOrder.set(
        stepOrder,
        stage,
      )
    },
  )

  if (
    stageOutputByOrder.size !==
    canonicalStages.length
  ) {
    fail(
      'METHOD_STAGE_SET_MISMATCH',
      'reading.method.stages',
      'O modelo precisa avaliar exatamente as etapas do método canônico.',
    )
  }

  const modelStages =
    canonicalStages.map(
      (canonicalStage, index) => {
        const stage =
          stageOutputByOrder.get(
            canonicalStage.step_order,
          )

        if (!stage) {
          fail(
            'METHOD_STAGE_SET_MISMATCH',
            `reading.method.stages[${index}].step_order`,
            'Etapa canônica ausente na avaliação do método.',
          )
        }

        const status =
          requireEnum(
            stage.status,
            COMMERCIAL_READING_METHOD_STATUSES,
            `reading.method.stages[${index}].status`,
          )

        if (
          canonicalStage.required &&
          status === 'skipped'
        ) {
          fail(
            'REQUIRED_METHOD_STAGE_SKIPPED',
            `reading.method.stages[${index}].status`,
            'Etapa obrigatória não pode ser marcada como pulada.',
          )
        }

        return {
          step_order:
            canonicalStage.step_order,

          stage_key:
            canonicalStage.stage_key,

          name:
            canonicalStage.name,

          status,

          explanation:
            requireString(
              stage.explanation,
              `reading.method.stages[${index}].explanation`,
            ),

          evidence_message_ids:
            stage.evidence_message_ids,

          memory_ids:
            stage.memory_ids,
        }
      },
    )

  const methodCandidate:
    JsonRecord = {
    configured:
      true,

    name:
      salesMethod.name,

    stages:
      modelStages,

    current_stage:
      null,

    adherence:
      record.adherence,

    recovery_guidance:
      record.recovery_guidance,
  }

  const provisionalMessageIds =
    new Set<string>()

  const provisionalMemoryIds =
    new Set<string>()

  const adherence =
    normalizeMethodAdherence(
      methodCandidate.adherence,
      'reading.method.adherence',
      true,
      new Set(
        canonicalStages.map(
          stage =>
            stage.step_order,
        ),
      ),
      context,
      provisionalMessageIds,
      provisionalMemoryIds,
    )

  methodCandidate.current_stage =
    deriveCurrentMethodStage(
      modelStages as
        CommercialReadingMethodStage[],
      adherence.status,
    )

  const normalizedMessageIds =
    new Set<string>()

  const normalizedMemoryIds =
    new Set<string>()

  return normalizeMethod(
    methodCandidate,
    context,
    normalizedMessageIds,
    normalizedMemoryIds,
  )
}

function normalizedSearchText(
  value: string,
): string {
  return value
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      '',
    )
    .toLowerCase()
    .replace(
      /[.!?]+$/g,
      '',
    )
    .trim()
}

function normalizeSellerStrengths(
  value: unknown,
  context:
    CommercialReadingNormalizationContext,
  collectedMessageIds:
    Set<string>,
  collectedMemoryIds:
    Set<string>,
): CommercialReadingSellerStrength[] {
  return requireArray(
    value,
    'reading.seller_strengths',
  ).map(
    (item, index) => {
      const path =
        `reading.seller_strengths[${index}]`

      const record =
        requireRecord(
          item,
          path,
        )

      requireExactFields(
        record,
        [
          'kind',
          'summary',
          'why_it_matters',
          'evidence_message_ids',
          'memory_ids',
        ],
        path,
      )

      const summary =
        requireString(
          record.summary,
          `${path}.summary`,
        )

      const normalizedSummary =
        normalizedSearchText(
          summary,
        )

      if (
        [
          'bom atendimento',
          'otimo atendimento',
          'excelente atendimento',
          'boa comunicacao',
          'otima comunicacao',
          'excelente comunicacao',
          'boa conducao',
          'otima conducao',
          'excelente conducao',
        ].includes(
          normalizedSummary,
        )
      ) {
        fail(
          'GENERIC_SELLER_PRAISE',
          `${path}.summary`,
          'Acerto do vendedor precisa descrever uma ação concreta.',
        )
      }

      return {
        kind:
          requireEnum(
            record.kind,
            COMMERCIAL_READING_SELLER_STRENGTH_KINDS,
            `${path}.kind`,
          ),

        summary,

        why_it_matters:
          requireString(
            record.why_it_matters,
            `${path}.why_it_matters`,
          ),

        ...normalizeReferences(
          record,
          path,
          context,
          collectedMessageIds,
          collectedMemoryIds,
          true,
          true,
        ),
      }
    },
  )
}

function normalizeImprovementPoints(
  value: unknown,
  context:
    CommercialReadingNormalizationContext,
  collectedMessageIds:
    Set<string>,
  collectedMemoryIds:
    Set<string>,
): CommercialReadingImprovementPoint[] {
  return requireArray(
    value,
    'reading.improvement_points',
  ).map(
    (item, index) => {
      const path =
        `reading.improvement_points[${index}]`

      const record =
        requireRecord(
          item,
          path,
        )

      requireExactFields(
        record,
        [
          'kind',
          'summary',
          'why_it_matters',
          'impact',
          'how_to_improve',
          'evidence_message_ids',
          'memory_ids',
        ],
        path,
      )

      return {
        kind:
          requireEnum(
            record.kind,
            COMMERCIAL_READING_IMPROVEMENT_KINDS,
            `${path}.kind`,
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

        ...normalizeReferences(
          record,
          path,
          context,
          collectedMessageIds,
          collectedMemoryIds,
          true,
          true,
        ),
      }
    },
  )
}

function normalizeRisks(
  value: unknown,
  context:
    CommercialReadingNormalizationContext,
  collectedMessageIds:
    Set<string>,
  collectedMemoryIds:
    Set<string>,
): CommercialReading['risks'] {
  const record =
    requireRecord(
      value,
      'reading.risks',
    )

  requireExactFields(
    record,
    [
      'customer_objections',
      'service_risks',
    ],
    'reading.risks',
  )

  const normalizeRiskList = (
    field:
      'customer_objections' |
      'service_risks',
    requireDirectMessage:
      boolean,
  ): CommercialReadingRisk[] =>
    requireArray(
      record[field],
      `reading.risks.${field}`,
    ).map(
      (item, index) => {
        const path =
          `reading.risks.${field}[${index}]`

        const risk =
          requireRecord(
            item,
            path,
          )

        requireExactFields(
          risk,
          [
            'kind',
            'severity',
            'summary',
            'evidence_message_ids',
            'memory_ids',
          ],
          path,
        )

        return {
          kind:
            requireString(
              risk.kind,
              `${path}.kind`,
              200,
            ),

          severity:
            requireEnum(
              risk.severity,
              COMMERCIAL_READING_RISK_SEVERITIES,
              `${path}.severity`,
            ),

          summary:
            requireString(
              risk.summary,
              `${path}.summary`,
            ),

          ...normalizeReferences(
            risk,
            path,
            context,
            collectedMessageIds,
            collectedMemoryIds,
            true,
            requireDirectMessage,
          ),
        }
      },
    )

  return {
    customer_objections:
      normalizeRiskList(
        'customer_objections',
        false,
      ),

    service_risks:
      normalizeRiskList(
        'service_risks',
        true,
      ),
  }
}

function normalizeBestApproach(
  value: unknown,
  context:
    CommercialReadingNormalizationContext,
  collectedMessageIds:
    Set<string>,
  collectedMemoryIds:
    Set<string>,
): CommercialReadingBestApproach {
  const record =
    requireRecord(
      value,
      'reading.best_approach',
    )

  requireExactFields(
    record,
    [
      'decision',
      'reason',
      'channel',
      'evidence_message_ids',
      'memory_ids',
    ],
    'reading.best_approach',
  )

  const decision =
    requireEnum(
      record.decision,
      COMMERCIAL_READING_DECISIONS,
      'reading.best_approach.decision',
    )

  const channel =
    requireEnum(
      record.channel,
      COMMERCIAL_READING_CHANNELS,
      'reading.best_approach.channel',
    )

  if (
    decision ===
      'no_intervention' &&
    channel !== 'none'
  ) {
    fail(
      'NO_INTERVENTION_CHANNEL',
      'reading.best_approach.channel',
      'NO_INTERVENTION precisa usar canal none.',
    )
  }

  if (
    decision === 'wait' &&
    ![
      'wait',
      'none',
    ].includes(channel)
  ) {
    fail(
      'WAIT_CHANNEL',
      'reading.best_approach.channel',
      'WAIT precisa usar canal wait ou none.',
    )
  }

  return {
    decision,

    reason:
      requireString(
        record.reason,
        'reading.best_approach.reason',
      ),

    channel,

    ...normalizeReferences(
      record,
      'reading.best_approach',
      context,
      collectedMessageIds,
      collectedMemoryIds,
    ),
  }
}

function normalizeCommunication(
  value: unknown,
  decision:
    CommercialReadingDecision,
): CommercialReadingCommunication {
  const record =
    requireRecord(
      value,
      'reading.communication',
    )

  requireExactFields(
    record,
    [
      'intervention_needed',
      'recommended_question',
      'recommended_message',
    ],
    'reading.communication',
  )

  const interventionNeeded =
    requireBoolean(
      record.intervention_needed,
      'reading.communication.intervention_needed',
    )

  const recommendedQuestion =
    requireNullableString(
      record.recommended_question,
      'reading.communication.recommended_question',
    )

  const recommendedMessage =
    requireNullableString(
      record.recommended_message,
      'reading.communication.recommended_message',
    )

  if (
    !interventionNeeded &&
    (
      recommendedQuestion !== null ||
      recommendedMessage !== null
    )
  ) {
    fail(
      'SILENT_COMMUNICATION_REQUIRED',
      'reading.communication',
      'Sem intervenção, pergunta e mensagem precisam ser null.',
    )
  }

  if (
    decision ===
      'no_intervention' &&
    interventionNeeded
  ) {
    fail(
      'NO_INTERVENTION_CONFLICT',
      'reading.communication.intervention_needed',
      'NO_INTERVENTION não pode exigir comunicação.',
    )
  }

  return {
    intervention_needed:
      interventionNeeded,

    recommended_question:
      recommendedQuestion,

    recommended_message:
      recommendedMessage,
  }
}

function normalizeCrm(
  value: unknown,
  context:
    CommercialReadingNormalizationContext,
): CommercialReadingCrmSuggestion {
  const record =
    requireRecord(
      value,
      'reading.operations.crm',
    )

  requireExactFields(
    record,
    [
      'should_change_crm_stage',
      'recommended_status',
      'rationale',
      'requires_human_confirmation',
    ],
    'reading.operations.crm',
  )

  const shouldChange =
    requireBoolean(
      record.should_change_crm_stage,
      'reading.operations.crm.should_change_crm_stage',
    )

  const recommendedStatus =
    record.recommended_status === null
      ? null
      : requireEnum(
          record.recommended_status,
          LEAD_STATUSES,
          'reading.operations.crm.recommended_status',
        )

  const rationale =
    requireNullableString(
      record.rationale,
      'reading.operations.crm.rationale',
    )

  if (
    shouldChange &&
    recommendedStatus === null
  ) {
    fail(
      'CRM_STATUS_REQUIRED',
      'reading.operations.crm.recommended_status',
      'Mudança de CRM exige etapa.',
    )
  }

  if (
    !shouldChange &&
    (
      recommendedStatus !== null ||
      rationale !== null
    )
  ) {
    fail(
      'CRM_CHANGE_NOT_ALLOWED',
      'reading.operations.crm',
      'CRM sem mudança precisa manter status e justificativa null.',
    )
  }

  if (
    shouldChange &&
    rationale === null
  ) {
    fail(
      'CRM_RATIONALE_REQUIRED',
      'reading.operations.crm.rationale',
      'Mudança de CRM exige justificativa.',
    )
  }

  if (
    shouldChange &&
    recommendedStatus ===
      context.current_crm_status
  ) {
    fail(
      'CRM_STATUS_UNCHANGED',
      'reading.operations.crm.recommended_status',
      'A nova etapa precisa ser diferente da atual.',
    )
  }

  return {
    should_change_crm_stage:
      shouldChange,

    recommended_status:
      recommendedStatus,

    rationale,

    requires_human_confirmation:
      requireTrue(
        record.requires_human_confirmation,
        'reading.operations.crm.requires_human_confirmation',
      ),
  }
}

function normalizeAgenda(
  value: unknown,
  context:
    CommercialReadingNormalizationContext,
): CommercialReadingAgendaSuggestion {
  const record =
    requireRecord(
      value,
      'reading.operations.agenda',
    )

  requireExactFields(
    record,
    [
      'should_change_agenda',
      'expected_next_action_at',
      'rationale',
      'requires_human_confirmation',
    ],
    'reading.operations.agenda',
  )

  const shouldChange =
    requireBoolean(
      record.should_change_agenda,
      'reading.operations.agenda.should_change_agenda',
    )

  const expectedAt =
    requireNullableString(
      record.expected_next_action_at,
      'reading.operations.agenda.expected_next_action_at',
    )

  const rationale =
    requireNullableString(
      record.rationale,
      'reading.operations.agenda.rationale',
    )

  if (
    shouldChange &&
    expectedAt === null
  ) {
    fail(
      'AGENDA_DATE_REQUIRED',
      'reading.operations.agenda.expected_next_action_at',
      'Mudança de Agenda exige data.',
    )
  }

  if (
    !shouldChange &&
    (
      expectedAt !== null ||
      rationale !== null
    )
  ) {
    fail(
      'AGENDA_CHANGE_NOT_ALLOWED',
      'reading.operations.agenda',
      'Agenda sem mudança precisa manter data e justificativa null.',
    )
  }

  if (
    shouldChange &&
    rationale === null
  ) {
    fail(
      'AGENDA_RATIONALE_REQUIRED',
      'reading.operations.agenda.rationale',
      'Mudança de Agenda exige justificativa.',
    )
  }

  if (expectedAt !== null) {
    const timestamp =
      Date.parse(expectedAt)

    if (!Number.isFinite(timestamp)) {
      fail(
        'INVALID_AGENDA_DATE',
        'reading.operations.agenda.expected_next_action_at',
        'A data da Agenda é inválida.',
      )
    }

    if (
      timestamp <=
      Date.parse(
        context.reference_time,
      )
    ) {
      fail(
        'AGENDA_DATE_NOT_FUTURE',
        'reading.operations.agenda.expected_next_action_at',
        'A data da Agenda precisa estar no futuro.',
      )
    }
  }

  return {
    should_change_agenda:
      shouldChange,

    expected_next_action_at:
      expectedAt,

    rationale,

    requires_human_confirmation:
      requireTrue(
        record.requires_human_confirmation,
        'reading.operations.agenda.requires_human_confirmation',
      ),
  }
}

function ensureGlobalReferences(
  declared: string[],
  collected: Set<string>,
  path: string,
  code: string,
): void {
  const declaredSet =
    new Set(declared)

  for (const id of collected) {
    if (!declaredSet.has(id)) {
      fail(
        code,
        path,
        `${id} foi utilizado mas não declarado globalmente.`,
      )
    }
  }
}

function neutralizeNonActionableReading(
  reading: CommercialReading,
): CommercialReading {
  const currentEvidence = [
    ...reading
      .conversation_summary
      .current_state
      .evidence_message_ids,
  ]

  const currentSummary =
    reading.commercial_relevance ===
      'non_commercial'
      ? 'Conversa sem evidência comercial relevante para este ciclo.'
      : 'Momento atual sem relevância comercial confirmada.'

  return {
    ...reading,

    conversation_summary: {
      initial_context:
        null,
      evolution:
        null,
      important_events:
        [],
      current_state: {
        summary:
          currentSummary,
        evidence_message_ids:
          currentEvidence,
        memory_ids:
          [],
      },
      last_customer_request_or_decision:
        null,
    },

    customer: {
      objectives: [],
      problems: [],
      impacts: [],
      needs: [],
      interests: [],
      decision_criteria: [],
      preferences: [],
      open_questions: [],
      objections: [],
      uncertainties: [],
      discussed_products: [],
      primary_product_interest:
        null,
      competitors: [],
      commitments: [],
      missing_discovery: [],
      resolved_information: [],
      superseded_information: [],
      communication: {
        events: [],
        patterns: [],
      },
    },

    commercial_evolution:
      [],

    method: {
      ...reading.method,

      stages:
        reading.method.stages.map(
          stage => ({
            ...stage,
            status:
              'not_applicable',
            explanation:
              'A sessão atual não possui relevância comercial confirmada.',
            evidence_message_ids:
              [],
            memory_ids:
              [],
          }),
        ),

      current_stage:
        null,

      adherence: {
        status:
          reading.method.configured
            ? 'insufficient_evidence'
            : 'not_configured',

        summary:
          reading.method.configured
            ? 'A sessão atual não possui evidência comercial suficiente para avaliar o método.'
            : 'Método comercial não configurado.',

        deviation_stage_order:
          null,

        what_happened:
          null,

        missing_information: [],

        why_it_matters:
          null,

        evidence_message_ids: [],

        memory_ids: [],
      },

      recovery_guidance:
        null,
    },

    seller_strengths:
      [],

    improvement_points:
      [],

    risks: {
      customer_objections: [],
      service_risks: [],
    },

    best_approach: {
      decision:
        'no_intervention',
      reason:
        'Nenhuma ação comercial necessária para o assunto atual.',
      channel:
        'none',
      evidence_message_ids:
        currentEvidence,
      memory_ids:
        [],
    },

    communication: {
      intervention_needed:
        false,
      recommended_question:
        null,
      recommended_message:
        null,
    },

    operations: {
      crm: {
        should_change_crm_stage:
          false,
        recommended_status:
          null,
        rationale:
          null,
        requires_human_confirmation:
          true,
      },
      agenda: {
        should_change_agenda:
          false,
        expected_next_action_at:
          null,
        rationale:
          null,
        requires_human_confirmation:
          true,
      },
    },

    evidence_message_ids:
      currentEvidence,

    memory_ids:
      [],
  }
}

function collectModelReferenceIds(
  value: unknown,
  fieldName:
    'evidence_message_ids' |
    'memory_ids',
  collected:
    Set<string>,
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectModelReferenceIds(
        item,
        fieldName,
        collected,
      )
    }

    return
  }

  if (!isRecord(value)) {
    return
  }

  const references =
    value[fieldName]

  if (Array.isArray(references)) {
    for (const reference of references) {
      if (
        typeof reference ===
        'string'
      ) {
        const normalized =
          reference.trim()

        if (normalized) {
          collected.add(
            normalized,
          )
        }
      }
    }
  }

  for (
    const [
      nestedField,
      nestedValue,
    ] of Object.entries(value)
  ) {
    if (
      nestedField !==
      fieldName
    ) {
      collectModelReferenceIds(
        nestedValue,
        fieldName,
        collected,
      )
    }
  }
}

export function normalizeCommercialReadingModelOutput({
  value,
  context,
  derived,
}: {
  value: unknown

  context:
    CommercialReadingNormalizationContext

  derived:
    CommercialReadingDerivedOutput
}): CommercialReading {
  const modelOutput =
    requireRecord(
      value,
      'reading',
    )

  requireExactFields(
    modelOutput,
    COMMERCIAL_READING_MODEL_OUTPUT_FIELDS,
    'reading',
  )

  const normalizedMethod =
    normalizeMethodModelOutput({
      value:
        modelOutput.method,

      salesMethod:
        derived.sales_method,

      commerciallyActionable:
        derived.commercial_role ===
          'buyer' &&
        isCommerciallyActionable(
          derived.commercial_relevance,
        ),

      context,
    })

  const normalizedModelOutput = {
    ...modelOutput,

    customer:
      derived.customer,

    method:
      normalizedMethod,
  }

  const evidenceMessageIds =
    new Set<string>()

  const memoryIds =
    new Set<string>()

  collectModelReferenceIds(
    normalizedModelOutput,
    'evidence_message_ids',
    evidenceMessageIds,
  )

  collectModelReferenceIds(
    normalizedModelOutput,
    'memory_ids',
    memoryIds,
  )

  return normalizeCommercialReading(
    {
      contract_version:
        COMMERCIAL_READING_CONTRACT_VERSION,

      analysis_status:
        derived.analysis_status,

      analysis_limitations:
        derived.analysis_limitations,

      commercial_role:
        derived.commercial_role,

      commercial_relevance:
        derived.commercial_relevance,

      ...normalizedModelOutput,

      communication:
        derived.communication,

      operations:
        derived.operations,

      evidence_message_ids: [
        ...evidenceMessageIds,
      ],

      memory_ids: [
        ...memoryIds,
      ],
    },
    context,
  )
}

export function normalizeCommercialReading(
  value: unknown,
  context:
    CommercialReadingNormalizationContext,
): CommercialReading {
  if (
    !Number.isFinite(
      Date.parse(
        context.reference_time,
      ),
    )
  ) {
    fail(
      'INVALID_REFERENCE_TIME',
      'context.reference_time',
      'Horário de referência inválido.',
    )
  }

  const root =
    requireRecord(
      value,
      'reading',
    )

  requireExactFields(
    root,
    [
      'contract_version',
      'analysis_status',
      'analysis_limitations',
      'commercial_role',
      'commercial_relevance',
      'customer',
      ...COMMERCIAL_READING_MODEL_OUTPUT_FIELDS,
      'communication',
      'operations',
      'evidence_message_ids',
      'memory_ids',
    ],
    'reading',
  )

  if (
    root.contract_version !==
    COMMERCIAL_READING_CONTRACT_VERSION
  ) {
    fail(
      'CONTRACT_VERSION_MISMATCH',
      'reading.contract_version',
      'Versão incompatível da leitura comercial.',
    )
  }

  const analysisStatus =
    requireEnum(
      root.analysis_status,
      COMMERCIAL_READING_ANALYSIS_STATUSES,
      'reading.analysis_status',
    )

  const limitations =
    requireUniqueStringArray(
      root.analysis_limitations,
      'reading.analysis_limitations',
    )

  if (
    analysisStatus ===
      'complete' &&
    limitations.length > 0
  ) {
    fail(
      'COMPLETE_WITH_LIMITATIONS',
      'reading.analysis_limitations',
      'Leitura completa não pode declarar limitações.',
    )
  }

  if (
    analysisStatus ===
      'limited' &&
    limitations.length === 0
  ) {
    fail(
      'LIMITED_WITHOUT_LIMITATION',
      'reading.analysis_limitations',
      'Leitura limitada precisa explicar a limitação.',
    )
  }

  const collectedMessageIds =
    new Set<string>()

  const collectedMemoryIds =
    new Set<string>()

  const conversationSummary =
    normalizeConversationSummary(
      root.conversation_summary,
      context,
      collectedMessageIds,
      collectedMemoryIds,
    )

  const customer =
    normalizeCustomer(
      root.customer,
      context,
      collectedMessageIds,
      collectedMemoryIds,
    )

  const commercialEvolution =
    normalizeEvolution(
      root.commercial_evolution,
      context,
      collectedMessageIds,
      collectedMemoryIds,
    )

  const method =
    normalizeMethod(
      root.method,
      context,
      collectedMessageIds,
      collectedMemoryIds,
    )

  const sellerStrengths =
    normalizeSellerStrengths(
      root.seller_strengths,
      context,
      collectedMessageIds,
      collectedMemoryIds,
    )

  const improvementPoints =
    normalizeImprovementPoints(
      root.improvement_points,
      context,
      collectedMessageIds,
      collectedMemoryIds,
    )

  const risks =
    normalizeRisks(
      root.risks,
      context,
      collectedMessageIds,
      collectedMemoryIds,
    )

  const bestApproach =
    normalizeBestApproach(
      root.best_approach,
      context,
      collectedMessageIds,
      collectedMemoryIds,
    )

  const communication =
    normalizeCommunication(
      root.communication,
      bestApproach.decision,
    )

  const operationsRecord =
    requireRecord(
      root.operations,
      'reading.operations',
    )

  requireExactFields(
    operationsRecord,
    [
      'crm',
      'agenda',
    ],
    'reading.operations',
  )

  const evidenceMessageIds =
    requireUniqueStringArray(
      root.evidence_message_ids,
      'reading.evidence_message_ids',
    )

  const memoryIds =
    requireUniqueStringArray(
      root.memory_ids,
      'reading.memory_ids',
    )

  for (const id of evidenceMessageIds) {
    if (
      !context
        .available_message_ids
        .includes(id)
    ) {
      fail(
        'UNKNOWN_GLOBAL_EVIDENCE',
        'reading.evidence_message_ids',
        `A mensagem global ${id} não está disponível.`,
      )
    }
  }

  for (const id of memoryIds) {
    if (
      !context
        .available_memory_ids
        .includes(id)
    ) {
      fail(
        'UNKNOWN_GLOBAL_MEMORY',
        'reading.memory_ids',
        `A memória global ${id} não está disponível.`,
      )
    }
  }

  ensureGlobalReferences(
    evidenceMessageIds,
    collectedMessageIds,
    'reading.evidence_message_ids',
    'MISSING_GLOBAL_EVIDENCE',
  )

  ensureGlobalReferences(
    memoryIds,
    collectedMemoryIds,
    'reading.memory_ids',
    'MISSING_GLOBAL_MEMORY',
  )

  const commercialRole =
    requireEnum(
      root.commercial_role,
      COMMERCIAL_READING_COMMERCIAL_ROLES,
      'reading.commercial_role',
    )

  const commercialRelevance =
    requireEnum(
      root.commercial_relevance,
      COMMERCIAL_READING_COMMERCIAL_RELEVANCES,
      'reading.commercial_relevance',
    )

  const reading: CommercialReading = {
    contract_version:
      COMMERCIAL_READING_CONTRACT_VERSION,

    analysis_status:
      analysisStatus,

    analysis_limitations:
      limitations,

    commercial_role:
      commercialRole,

    commercial_relevance:
      commercialRelevance,

    conversation_summary:
      conversationSummary,

    customer,

    commercial_evolution:
      commercialEvolution,

    method,

    seller_strengths:
      sellerStrengths,

    improvement_points:
      improvementPoints,

    risks,

    best_approach:
      bestApproach,

    communication,

    operations: {
      crm:
        normalizeCrm(
          operationsRecord.crm,
          context,
        ),

      agenda:
        normalizeAgenda(
          operationsRecord.agenda,
          context,
        ),
    },

    evidence_message_ids:
      evidenceMessageIds,

    memory_ids:
      memoryIds,
  }

  return (
    commercialRole === 'buyer' &&
    isCommerciallyActionable(
      commercialRelevance,
    )
  )
    ? reading
    : neutralizeNonActionableReading(
        reading,
      )
}
