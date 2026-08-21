// ============================================================================
// Yolen — Leitura Comercial Completa
// Contrato central consumível pelas experiências Yolen.
// ============================================================================

import type {
  DiagnosticLeadStatus,
} from './diagnostic-contract'

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
  'partial',
  'not_started',
  'skipped',
  'not_applicable',
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
  'insufficient_discovery',
  'interrogation',
  'pressure',
  'incorrect_information',
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

export const COMMERCIAL_READING_MODEL_OUTPUT_FIELDS = [
  'conversation_summary',
  'customer',
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

export type CommercialReadingMethod = {
  configured: boolean
  name: string | null

  stages:
    CommercialReadingMethodStage[]
}

export type CommercialReadingSellerStrength = {
  kind:
    CommercialReadingSellerStrengthKind

  summary: string

  evidence_message_ids:
    string[]

  memory_ids:
    string[]
}

export type CommercialReadingImprovementPoint = {
  kind:
    CommercialReadingImprovementKind

  summary: string
  impact: string

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

export type CommercialReadingModelOutput =
  Pick<
    CommercialReading,
    (typeof COMMERCIAL_READING_MODEL_OUTPUT_FIELDS)[number]
  >

export type CommercialReadingDerivedOutput =
  Pick<
    CommercialReading,
    | 'analysis_status'
    | 'analysis_limitations'
    | 'commercial_role'
    | 'commercial_relevance'
    | 'communication'
    | 'operations'
  >

export type CommercialReadingNormalizationContext = {
  available_message_ids:
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
    'needs',
    'interests',
    'decision_criteria',
    'preferences',
    'open_questions',
    'objections',
    'uncertainties',
  ] as const

  requireExactFields(
    record,
    fields,
    'reading.customer',
  )

  const normalized =
    {} as CommercialReadingCustomer

  for (const field of fields) {
    normalized[field] =
      normalizeEvidenceList(
        record[field],
        `reading.customer.${field}`,
        context,
        collectedMessageIds,
        collectedMemoryIds,
      )
  }

  return normalized
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

        if (
          usedOrders.has(
            stepOrder,
          )
        ) {
          fail(
            'DUPLICATE_METHOD_ORDER',
            `${path}.step_order`,
            'A ordem da etapa está duplicada.',
          )
        }

        usedOrders.add(
          stepOrder,
        )

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
      stages.length > 0
    )
  ) {
    fail(
      'METHOD_NOT_CONFIGURED',
      'reading.method',
      'Método não configurado não pode inventar nome ou etapas.',
    )
  }

  return {
    configured,
    name,
    stages,
  }
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
        normalizedSummary ===
          'bom atendimento' ||
        normalizedSummary ===
          'otimo atendimento' ||
        normalizedSummary ===
          'excelente atendimento'
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
          'impact',
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

        impact:
          requireString(
            record.impact,
            `${path}.impact`,
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
      needs: [],
      interests: [],
      decision_criteria: [],
      preferences: [],
      open_questions: [],
      objections: [],
      uncertainties: [],
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

  const evidenceMessageIds =
    new Set<string>()

  const memoryIds =
    new Set<string>()

  collectModelReferenceIds(
    modelOutput,
    'evidence_message_ids',
    evidenceMessageIds,
  )

  collectModelReferenceIds(
    modelOutput,
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

      ...modelOutput,

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
