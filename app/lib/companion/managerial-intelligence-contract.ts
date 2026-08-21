// ============================================================================
// Yolen — Inteligência Gerencial
// Contrato central de sinais e recomendações para gestão comercial.
// ============================================================================

export const MANAGERIAL_INTELLIGENCE_CONTRACT_VERSION =
  'managerial-intelligence-v1' as const

export const MANAGERIAL_INTELLIGENCE_ANALYSIS_STATUSES = [
  'complete',
  'limited',
  'insufficient',
] as const

export const MANAGERIAL_INTELLIGENCE_SCOPE_TYPES = [
  'team',
  'seller',
] as const

export const MANAGERIAL_INTELLIGENCE_PRIORITIES = [
  'none',
  'informational',
  'attention',
  'critical',
] as const

export const MANAGERIAL_INTELLIGENCE_SIGNAL_CATEGORIES = [
  'seller_behavior',
  'customer_pattern',
  'method_execution',
  'process_execution',
  'opportunity_risk',
  'ai_adoption',
  'commercial_result',
  'positive_pattern',
] as const

export const MANAGERIAL_INTELLIGENCE_SIGNAL_KINDS = [
  'unanswered_question',
  'premature_price',
  'insufficient_discovery',
  'interrogation',
  'pressure',
  'incorrect_information',
  'method_misapplication',
  'promise_risk',
  'missed_commitment',
  'recurring_objection',
  'recurring_service_risk',
  'opportunity_stagnation',
  'overdue_follow_up',
  'suggestion_ignored',
  'suggestion_adoption',
  'crm_rejection',
  'agenda_rejection',
  'seller_strength_pattern',
  'conversion_drop',
  'loss_pattern',
  'other',
] as const

export const MANAGERIAL_INTELLIGENCE_SIGNAL_DIRECTIONS = [
  'positive',
  'risk',
  'neutral',
] as const

export const MANAGERIAL_INTELLIGENCE_SIGNAL_SEVERITIES = [
  'informational',
  'attention',
  'critical',
] as const

export const MANAGERIAL_INTELLIGENCE_RECURRENCES = [
  'isolated',
  'repeated',
  'systemic',
] as const

export const MANAGERIAL_INTELLIGENCE_RECOMMENDATION_ACTIONS = [
  'observe',
  'coach_seller',
  'review_process',
  'train_team',
  'verify_information',
  'intervene_opportunity',
  'collect_more_evidence',
  'no_action',
] as const

export const MANAGERIAL_INTELLIGENCE_RECOMMENDATION_TARGETS = [
  'none',
  'team',
  'seller',
  'process',
  'opportunity',
] as const

export type ManagerialIntelligenceAnalysisStatus =
  (typeof MANAGERIAL_INTELLIGENCE_ANALYSIS_STATUSES)[number]

export type ManagerialIntelligenceScopeType =
  (typeof MANAGERIAL_INTELLIGENCE_SCOPE_TYPES)[number]

export type ManagerialIntelligencePriority =
  (typeof MANAGERIAL_INTELLIGENCE_PRIORITIES)[number]

export type ManagerialIntelligenceSignalCategory =
  (typeof MANAGERIAL_INTELLIGENCE_SIGNAL_CATEGORIES)[number]

export type ManagerialIntelligenceSignalKind =
  (typeof MANAGERIAL_INTELLIGENCE_SIGNAL_KINDS)[number]

export type ManagerialIntelligenceSignalDirection =
  (typeof MANAGERIAL_INTELLIGENCE_SIGNAL_DIRECTIONS)[number]

export type ManagerialIntelligenceSignalSeverity =
  (typeof MANAGERIAL_INTELLIGENCE_SIGNAL_SEVERITIES)[number]

export type ManagerialIntelligenceRecurrence =
  (typeof MANAGERIAL_INTELLIGENCE_RECURRENCES)[number]

export type ManagerialIntelligenceRecommendationAction =
  (typeof MANAGERIAL_INTELLIGENCE_RECOMMENDATION_ACTIONS)[number]

export type ManagerialIntelligenceRecommendationTarget =
  (typeof MANAGERIAL_INTELLIGENCE_RECOMMENDATION_TARGETS)[number]

export type ManagerialIntelligenceScope = {
  company_id: string

  period_start: string
  period_end: string

  seller_scope: {
    type:
      ManagerialIntelligenceScopeType

    seller_user_id:
      string | null
  }
}

export type ManagerialIntelligenceCoverage = {
  eligible_cycles: number

  cycles_with_commercial_reading:
    number

  commercial_reading_events:
    number

  companion_action_events:
    number

  cycle_events:
    number

  sellers_in_scope:
    number

  sellers_with_commercial_reading:
    number
}

export type ManagerialIntelligenceSignal = {
  signal_key: string

  category:
    ManagerialIntelligenceSignalCategory

  kind:
    ManagerialIntelligenceSignalKind

  direction:
    ManagerialIntelligenceSignalDirection

  severity:
    ManagerialIntelligenceSignalSeverity

  recurrence:
    ManagerialIntelligenceRecurrence

  summary: string
  impact: string

  occurrences: number
  sample_size: number

  affected_cycle_ids:
    string[]

  affected_seller_user_ids:
    string[]

  analysis_event_ids:
    string[]

  action_event_ids:
    string[]

  cycle_event_ids:
    string[]

  requires_human_review:
    true
}

export type ManagerialIntelligenceDecision = {
  priority:
    ManagerialIntelligencePriority

  intervention_needed:
    boolean

  reason: string

  signal_keys:
    string[]

  requires_human_judgment:
    true
}

export type ManagerialIntelligenceRecommendation = {
  action:
    ManagerialIntelligenceRecommendationAction

  target_type:
    ManagerialIntelligenceRecommendationTarget

  target_id:
    string | null

  reason: string

  signal_keys:
    string[]

  advisory_only:
    true
}

export type ManagerialIntelligence = {
  contract_version:
    typeof MANAGERIAL_INTELLIGENCE_CONTRACT_VERSION

  generated_at:
    string

  analysis_status:
    ManagerialIntelligenceAnalysisStatus

  analysis_limitations:
    string[]

  scope:
    ManagerialIntelligenceScope

  coverage:
    ManagerialIntelligenceCoverage

  signals:
    ManagerialIntelligenceSignal[]

  management_decision:
    ManagerialIntelligenceDecision

  recommendations:
    ManagerialIntelligenceRecommendation[]

  analysis_event_ids:
    string[]

  action_event_ids:
    string[]

  cycle_event_ids:
    string[]

  cycle_ids:
    string[]

  seller_user_ids:
    string[]
}

export type ManagerialIntelligenceNormalizationContext = {
  expected_company_id:
    string

  reference_time:
    string

  available_analysis_event_ids:
    string[]

  available_action_event_ids:
    string[]

  available_cycle_event_ids:
    string[]

  available_cycle_ids:
    string[]

  available_seller_user_ids:
    string[]
}

type JsonRecord =
  Record<string, unknown>

export class ManagerialIntelligenceContractError
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
      'ManagerialIntelligenceContractError'

    this.code = code
    this.path = path
  }
}

function fail(
  code: string,
  path: string,
  message: string,
): never {
  throw new ManagerialIntelligenceContractError(
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
    500,
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
      'HUMAN_REVIEW_REQUIRED',
      path,
      `${path} precisa ser true.`,
    )
  }

  return true
}

function requireNonNegativeInteger(
  value: unknown,
  path: string,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    fail(
      'INVALID_NUMBER',
      path,
      `${path} precisa ser um inteiro não negativo.`,
    )
  }

  return value
}

function requirePositiveInteger(
  value: unknown,
  path: string,
): number {
  const normalized =
    requireNonNegativeInteger(
      value,
      path,
    )

  if (normalized < 1) {
    fail(
      'INVALID_NUMBER',
      path,
      `${path} precisa ser um inteiro positivo.`,
    )
  }

  return normalized
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
    !(allowedValues as readonly string[])
      .includes(value)
  ) {
    fail(
      'INVALID_ENUM',
      path,
      `${path} possui valor inválido.`,
    )
  }

  return value as TValues[number]
}

function requireDateKey(
  value: unknown,
  path: string,
): string {
  const normalized =
    requireString(
      value,
      path,
      10,
    )

  if (
    !/^\d{4}-\d{2}-\d{2}$/
      .test(normalized)
  ) {
    fail(
      'INVALID_DATE',
      path,
      `${path} precisa usar YYYY-MM-DD.`,
    )
  }

  const parsed =
    new Date(
      `${normalized}T00:00:00.000Z`,
    )

  if (
    Number.isNaN(
      parsed.getTime(),
    ) ||
    parsed
      .toISOString()
      .slice(0, 10) !==
      normalized
  ) {
    fail(
      'INVALID_DATE',
      path,
      `${path} possui data inválida.`,
    )
  }

  return normalized
}

function requireUniqueStringArray(
  value: unknown,
  path: string,
): string[] {
  const normalized =
    requireArray(
      value,
      path,
    ).map(
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

function normalizeKnownIds(
  value: unknown,
  path: string,
  availableValues: string[],
  collectedValues:
    Set<string> | null = null,
): string[] {
  const normalized =
    requireUniqueStringArray(
      value,
      path,
    )

  const available =
    new Set(
      availableValues,
    )

  for (const id of normalized) {
    if (!available.has(id)) {
      fail(
        'UNKNOWN_REFERENCE',
        path,
        `${id} não está disponível no contexto.`,
      )
    }

    collectedValues?.add(id)
  }

  return normalized
}

function ensureDeclaredReferences(
  declared: string[],
  collected: Set<string>,
  path: string,
): void {
  const declaredSet =
    new Set(declared)

  for (const id of collected) {
    if (!declaredSet.has(id)) {
      fail(
        'GLOBAL_REFERENCE_MISSING',
        path,
        `${id} foi utilizado mas não declarado globalmente.`,
      )
    }
  }
}

function normalizeScope(
  value: unknown,
  context:
    ManagerialIntelligenceNormalizationContext,
  collectedSellerIds:
    Set<string>,
): ManagerialIntelligenceScope {
  const record =
    requireRecord(
      value,
      'intelligence.scope',
    )

  const companyId =
    requireString(
      record.company_id,
      'intelligence.scope.company_id',
      200,
    )

  if (
    companyId !==
    context.expected_company_id
  ) {
    fail(
      'COMPANY_MISMATCH',
      'intelligence.scope.company_id',
      'A inteligência pertence a outra empresa.',
    )
  }

  const periodStart =
    requireDateKey(
      record.period_start,
      'intelligence.scope.period_start',
    )

  const periodEnd =
    requireDateKey(
      record.period_end,
      'intelligence.scope.period_end',
    )

  if (periodEnd < periodStart) {
    fail(
      'INVALID_PERIOD',
      'intelligence.scope.period_end',
      'A data final não pode ser anterior à inicial.',
    )
  }

  const referenceDate =
    context.reference_time.slice(
      0,
      10,
    )

  if (
    /^\d{4}-\d{2}-\d{2}$/
      .test(referenceDate) &&
    periodEnd > referenceDate
  ) {
    fail(
      'PERIOD_IN_FUTURE',
      'intelligence.scope.period_end',
      'A inteligência gerencial não pode analisar período futuro.',
    )
  }

  const sellerScope =
    requireRecord(
      record.seller_scope,
      'intelligence.scope.seller_scope',
    )

  const type =
    requireEnum(
      sellerScope.type,
      MANAGERIAL_INTELLIGENCE_SCOPE_TYPES,
      'intelligence.scope.seller_scope.type',
    )

  const sellerUserId =
    requireNullableString(
      sellerScope.seller_user_id,
      'intelligence.scope.seller_scope.seller_user_id',
    )

  if (
    type === 'team' &&
    sellerUserId !== null
  ) {
    fail(
      'TEAM_SCOPE_WITH_SELLER',
      'intelligence.scope.seller_scope',
      'Escopo de equipe não pode limitar um vendedor.',
    )
  }

  if (
    type === 'seller' &&
    sellerUserId === null
  ) {
    fail(
      'SELLER_SCOPE_REQUIRES_SELLER',
      'intelligence.scope.seller_scope.seller_user_id',
      'Escopo individual exige vendedor.',
    )
  }

  if (sellerUserId !== null) {
    if (
      !context
        .available_seller_user_ids
        .includes(sellerUserId)
    ) {
      fail(
        'UNKNOWN_REFERENCE',
        'intelligence.scope.seller_scope.seller_user_id',
        'O vendedor do escopo não está disponível.',
      )
    }

    collectedSellerIds.add(
      sellerUserId,
    )
  }

  return {
    company_id:
      companyId,

    period_start:
      periodStart,

    period_end:
      periodEnd,

    seller_scope: {
      type,
      seller_user_id:
        sellerUserId,
    },
  }
}

function normalizeCoverage(
  value: unknown,
  status:
    ManagerialIntelligenceAnalysisStatus,
): ManagerialIntelligenceCoverage {
  const record =
    requireRecord(
      value,
      'intelligence.coverage',
    )

  const coverage = {
    eligible_cycles:
      requireNonNegativeInteger(
        record.eligible_cycles,
        'intelligence.coverage.eligible_cycles',
      ),

    cycles_with_commercial_reading:
      requireNonNegativeInteger(
        record.cycles_with_commercial_reading,
        'intelligence.coverage.cycles_with_commercial_reading',
      ),

    commercial_reading_events:
      requireNonNegativeInteger(
        record.commercial_reading_events,
        'intelligence.coverage.commercial_reading_events',
      ),

    companion_action_events:
      requireNonNegativeInteger(
        record.companion_action_events,
        'intelligence.coverage.companion_action_events',
      ),

    cycle_events:
      requireNonNegativeInteger(
        record.cycle_events,
        'intelligence.coverage.cycle_events',
      ),

    sellers_in_scope:
      requireNonNegativeInteger(
        record.sellers_in_scope,
        'intelligence.coverage.sellers_in_scope',
      ),

    sellers_with_commercial_reading:
      requireNonNegativeInteger(
        record.sellers_with_commercial_reading,
        'intelligence.coverage.sellers_with_commercial_reading',
      ),
  }

  if (
    coverage
      .cycles_with_commercial_reading >
    coverage.eligible_cycles
  ) {
    fail(
      'INVALID_COVERAGE',
      'intelligence.coverage.cycles_with_commercial_reading',
      'Ciclos analisados não podem exceder ciclos elegíveis.',
    )
  }

  if (
    coverage
      .sellers_with_commercial_reading >
    coverage.sellers_in_scope
  ) {
    fail(
      'INVALID_COVERAGE',
      'intelligence.coverage.sellers_with_commercial_reading',
      'Vendedores analisados não podem exceder o escopo.',
    )
  }

  if (
    coverage
      .cycles_with_commercial_reading >
      0 &&
    coverage
      .commercial_reading_events ===
      0
  ) {
    fail(
      'READING_EVENTS_REQUIRED',
      'intelligence.coverage.commercial_reading_events',
      'Cobertura A4 exige eventos de leitura comercial.',
    )
  }

  if (
    status === 'complete' &&
    (
      coverage
        .cycles_with_commercial_reading !==
        coverage.eligible_cycles ||
      coverage
        .sellers_with_commercial_reading !==
        coverage.sellers_in_scope
    )
  ) {
    fail(
      'COMPLETE_COVERAGE_MISMATCH',
      'intelligence.coverage',
      'Análise completa exige cobertura integral do escopo declarado.',
    )
  }

  if (
    status !== 'insufficient' &&
    coverage.eligible_cycles > 0 &&
    coverage
      .cycles_with_commercial_reading ===
      0
  ) {
    fail(
      'COMMERCIAL_READING_COVERAGE_REQUIRED',
      'intelligence.coverage.cycles_with_commercial_reading',
      'Sem leitura A4 a análise gerencial precisa ser insuficiente.',
    )
  }

  return coverage
}

function expectedCategoryForKind(
  kind:
    ManagerialIntelligenceSignalKind,
): ManagerialIntelligenceSignalCategory | null {
  if (
    [
      'unanswered_question',
      'premature_price',
      'insufficient_discovery',
      'interrogation',
      'pressure',
      'incorrect_information',
      'promise_risk',
      'missed_commitment',
      'recurring_service_risk',
    ].includes(kind)
  ) {
    return 'seller_behavior'
  }

  if (
    kind ===
    'recurring_objection'
  ) {
    return 'customer_pattern'
  }

  if (
    kind ===
    'method_misapplication'
  ) {
    return 'method_execution'
  }

  if (
    kind ===
    'overdue_follow_up'
  ) {
    return 'process_execution'
  }

  if (
    kind ===
    'opportunity_stagnation'
  ) {
    return 'opportunity_risk'
  }

  if (
    [
      'suggestion_ignored',
      'suggestion_adoption',
      'crm_rejection',
      'agenda_rejection',
    ].includes(kind)
  ) {
    return 'ai_adoption'
  }

  if (
    [
      'conversion_drop',
      'loss_pattern',
    ].includes(kind)
  ) {
    return 'commercial_result'
  }

  if (
    kind ===
    'seller_strength_pattern'
  ) {
    return 'positive_pattern'
  }

  return null
}

function normalizeSignals(
  value: unknown,
  status:
    ManagerialIntelligenceAnalysisStatus,
  context:
    ManagerialIntelligenceNormalizationContext,
  collectedAnalysisEventIds:
    Set<string>,
  collectedActionEventIds:
    Set<string>,
  collectedCycleEventIds:
    Set<string>,
  collectedCycleIds:
    Set<string>,
  collectedSellerIds:
    Set<string>,
): ManagerialIntelligenceSignal[] {
  const usedKeys =
    new Set<string>()

  const signals =
    requireArray(
      value,
      'intelligence.signals',
    ).map(
      (item, index) => {
        const path =
          `intelligence.signals[${index}]`

        const record =
          requireRecord(
            item,
            path,
          )

        const signalKey =
          requireString(
            record.signal_key,
            `${path}.signal_key`,
            200,
          )

        if (
          usedKeys.has(
            signalKey,
          )
        ) {
          fail(
            'DUPLICATE_SIGNAL_KEY',
            `${path}.signal_key`,
            `Sinal duplicado: ${signalKey}.`,
          )
        }

        usedKeys.add(
          signalKey,
        )

        const category =
          requireEnum(
            record.category,
            MANAGERIAL_INTELLIGENCE_SIGNAL_CATEGORIES,
            `${path}.category`,
          )

        const kind =
          requireEnum(
            record.kind,
            MANAGERIAL_INTELLIGENCE_SIGNAL_KINDS,
            `${path}.kind`,
          )

        const expectedCategory =
          expectedCategoryForKind(
            kind,
          )

        if (
          expectedCategory !== null &&
          category !==
            expectedCategory
        ) {
          fail(
            'KIND_CATEGORY_MISMATCH',
            `${path}.category`,
            `${kind} pertence à categoria ${expectedCategory}.`,
          )
        }

        const direction =
          requireEnum(
            record.direction,
            MANAGERIAL_INTELLIGENCE_SIGNAL_DIRECTIONS,
            `${path}.direction`,
          )

        const severity =
          requireEnum(
            record.severity,
            MANAGERIAL_INTELLIGENCE_SIGNAL_SEVERITIES,
            `${path}.severity`,
          )

        const recurrence =
          requireEnum(
            record.recurrence,
            MANAGERIAL_INTELLIGENCE_RECURRENCES,
            `${path}.recurrence`,
          )

        const occurrences =
          requirePositiveInteger(
            record.occurrences,
            `${path}.occurrences`,
          )

        const sampleSize =
          requirePositiveInteger(
            record.sample_size,
            `${path}.sample_size`,
          )

        if (
          occurrences >
          sampleSize
        ) {
          fail(
            'OCCURRENCES_EXCEED_SAMPLE',
            `${path}.occurrences`,
            'Ocorrências não podem exceder a amostra.',
          )
        }

        if (
          recurrence ===
            'isolated' &&
          occurrences !== 1
        ) {
          fail(
            'INVALID_RECURRENCE',
            `${path}.recurrence`,
            'Sinal isolado precisa possuir exatamente uma ocorrência.',
          )
        }

        if (
          recurrence !==
            'isolated' &&
          occurrences < 2
        ) {
          fail(
            'INVALID_RECURRENCE',
            `${path}.recurrence`,
            'Recorrência repetida ou sistêmica exige mais de uma ocorrência.',
          )
        }

        const affectedCycleIds =
          normalizeKnownIds(
            record.affected_cycle_ids,
            `${path}.affected_cycle_ids`,
            context
              .available_cycle_ids,
            collectedCycleIds,
          )

        if (
          affectedCycleIds.length ===
          0
        ) {
          fail(
            'AFFECTED_CYCLE_REQUIRED',
            `${path}.affected_cycle_ids`,
            'Todo sinal gerencial precisa apontar ao menos um ciclo.',
          )
        }

        const affectedSellerIds =
          normalizeKnownIds(
            record.affected_seller_user_ids,
            `${path}.affected_seller_user_ids`,
            context
              .available_seller_user_ids,
            collectedSellerIds,
          )

        const analysisEventIds =
          normalizeKnownIds(
            record.analysis_event_ids,
            `${path}.analysis_event_ids`,
            context
              .available_analysis_event_ids,
            collectedAnalysisEventIds,
          )

        const actionEventIds =
          normalizeKnownIds(
            record.action_event_ids,
            `${path}.action_event_ids`,
            context
              .available_action_event_ids,
            collectedActionEventIds,
          )

        const cycleEventIds =
          normalizeKnownIds(
            record.cycle_event_ids,
            `${path}.cycle_event_ids`,
            context
              .available_cycle_event_ids,
            collectedCycleEventIds,
          )

        if (
          analysisEventIds.length ===
            0 &&
          actionEventIds.length ===
            0 &&
          cycleEventIds.length ===
            0
        ) {
          fail(
            'SOURCE_EVIDENCE_REQUIRED',
            path,
            'Sinal gerencial precisa apontar a fonte que o comprova.',
          )
        }

        if (
          [
            'seller_behavior',
            'customer_pattern',
            'method_execution',
            'positive_pattern',
          ].includes(category) &&
          analysisEventIds.length ===
            0
        ) {
          fail(
            'ANALYSIS_EVIDENCE_REQUIRED',
            `${path}.analysis_event_ids`,
            'Conclusão semântica exige leitura comercial A4 persistida.',
          )
        }

        if (
          category ===
            'ai_adoption'
        ) {
          if (
            actionEventIds.length ===
            0
          ) {
            fail(
              'ACTION_EVIDENCE_REQUIRED',
              `${path}.action_event_ids`,
              'Telemetria da IA exige evento factual do Companion.',
            )
          }

          if (
            direction !==
              'neutral' ||
            severity !==
              'informational'
          ) {
            fail(
              'AI_ADOPTION_IS_FACTUAL',
              path,
              'Uso ou rejeição da IA sozinho é fato, não julgamento negativo do vendedor.',
            )
          }
        }

        if (
          category ===
            'positive_pattern' &&
          (
            direction !==
              'positive' ||
            severity !==
              'informational'
          )
        ) {
          fail(
            'POSITIVE_SIGNAL_SEMANTICS',
            path,
            'Padrão positivo precisa permanecer positivo e informativo.',
          )
        }

        if (
          direction ===
            'neutral' &&
          severity !==
            'informational'
        ) {
          fail(
            'NEUTRAL_SIGNAL_SEVERITY',
            `${path}.severity`,
            'Sinal neutro não pode ser promovido a alerta.',
          )
        }

        if (
          recurrence ===
            'systemic' &&
          affectedSellerIds.length <
            2
        ) {
          fail(
            'SYSTEMIC_SCOPE_REQUIRED',
            `${path}.affected_seller_user_ids`,
            'Sinal sistêmico precisa afetar mais de um vendedor.',
          )
        }

        return {
          signal_key:
            signalKey,

          category,
          kind,
          direction,
          severity,
          recurrence,

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

          occurrences,
          sample_size:
            sampleSize,

          affected_cycle_ids:
            affectedCycleIds,

          affected_seller_user_ids:
            affectedSellerIds,

          analysis_event_ids:
            analysisEventIds,

          action_event_ids:
            actionEventIds,

          cycle_event_ids:
            cycleEventIds,

          requires_human_review:
            requireTrue(
              record.requires_human_review,
              `${path}.requires_human_review`,
            ),
        }
      },
    )

  if (
    status ===
      'insufficient' &&
    signals.length > 0
  ) {
    fail(
      'INSUFFICIENT_WITH_SIGNALS',
      'intelligence.signals',
      'Cobertura insuficiente não pode fabricar sinais gerenciais.',
    )
  }

  return signals
}

function normalizeDecision(
  value: unknown,
  status:
    ManagerialIntelligenceAnalysisStatus,
  signals:
    ManagerialIntelligenceSignal[],
): ManagerialIntelligenceDecision {
  const record =
    requireRecord(
      value,
      'intelligence.management_decision',
    )

  const priority =
    requireEnum(
      record.priority,
      MANAGERIAL_INTELLIGENCE_PRIORITIES,
      'intelligence.management_decision.priority',
    )

  const interventionNeeded =
    requireBoolean(
      record.intervention_needed,
      'intelligence.management_decision.intervention_needed',
    )

  const expectedIntervention =
    priority === 'attention' ||
    priority === 'critical'

  if (
    interventionNeeded !==
    expectedIntervention
  ) {
    fail(
      'DECISION_INTERVENTION_MISMATCH',
      'intelligence.management_decision.intervention_needed',
      'Intervenção precisa acompanhar a prioridade gerencial.',
    )
  }

  const signalKeys =
    requireUniqueStringArray(
      record.signal_keys,
      'intelligence.management_decision.signal_keys',
    )

  const signalMap =
    new Map(
      signals.map(
        signal => [
          signal.signal_key,
          signal,
        ],
      ),
    )

  for (const key of signalKeys) {
    if (!signalMap.has(key)) {
      fail(
        'UNKNOWN_SIGNAL',
        'intelligence.management_decision.signal_keys',
        `Sinal desconhecido: ${key}.`,
      )
    }
  }

  if (
    priority === 'none' &&
    signalKeys.length > 0
  ) {
    fail(
      'NO_PRIORITY_WITH_SIGNALS',
      'intelligence.management_decision.signal_keys',
      'Prioridade none não pode apontar sinais para intervenção.',
    )
  }

  if (
    priority !== 'none' &&
    signalKeys.length === 0
  ) {
    fail(
      'DECISION_SIGNAL_REQUIRED',
      'intelligence.management_decision.signal_keys',
      'Prioridade gerencial precisa apontar sinais comprovados.',
    )
  }

  if (
    priority ===
      'informational' &&
    signalKeys.some(
      key =>
        signalMap.get(key)
          ?.severity !==
        'informational',
    )
  ) {
    fail(
      'INFORMATIONAL_PRIORITY_MISMATCH',
      'intelligence.management_decision.signal_keys',
      'Prioridade informativa só pode usar sinais informativos.',
    )
  }

  if (
    priority ===
      'attention' &&
    !signalKeys.some(
      key =>
        [
          'attention',
          'critical',
        ].includes(
          signalMap.get(key)
            ?.severity ?? '',
        ),
    )
  ) {
    fail(
      'ATTENTION_SIGNAL_REQUIRED',
      'intelligence.management_decision.signal_keys',
      'Atenção exige ao menos um sinal de atenção ou crítico.',
    )
  }

  if (
    priority ===
      'critical' &&
    !signalKeys.some(
      key =>
        signalMap.get(key)
          ?.severity ===
        'critical',
    )
  ) {
    fail(
      'CRITICAL_SIGNAL_REQUIRED',
      'intelligence.management_decision.signal_keys',
      'Prioridade crítica exige sinal crítico.',
    )
  }

  if (
    status ===
      'insufficient' &&
    (
      priority !== 'none' ||
      interventionNeeded ||
      signalKeys.length > 0
    )
  ) {
    fail(
      'INSUFFICIENT_DECISION',
      'intelligence.management_decision',
      'Cobertura insuficiente não autoriza intervenção gerencial.',
    )
  }

  if (
    signals.length > 0 &&
    status !== 'insufficient' &&
    priority === 'none'
  ) {
    fail(
      'SIGNALS_WITHOUT_PRIORITY',
      'intelligence.management_decision.priority',
      'Sinais existentes precisam ser representados ao menos como informativos.',
    )
  }

  return {
    priority,

    intervention_needed:
      interventionNeeded,

    reason:
      requireString(
        record.reason,
        'intelligence.management_decision.reason',
      ),

    signal_keys:
      signalKeys,

    requires_human_judgment:
      requireTrue(
        record.requires_human_judgment,
        'intelligence.management_decision.requires_human_judgment',
      ),
  }
}

function targetAllowedForAction(
  action:
    ManagerialIntelligenceRecommendationAction,
  target:
    ManagerialIntelligenceRecommendationTarget,
): boolean {
  if (action === 'no_action') {
    return target === 'none'
  }

  if (action === 'coach_seller') {
    return target === 'seller'
  }

  if (
    action ===
    'intervene_opportunity'
  ) {
    return target === 'opportunity'
  }

  if (action === 'train_team') {
    return target === 'team'
  }

  if (action === 'review_process') {
    return target === 'process'
  }

  if (
    action ===
    'verify_information'
  ) {
    return [
      'seller',
      'process',
      'opportunity',
    ].includes(target)
  }

  if (action === 'observe') {
    return target !== 'none'
  }

  return true
}

function normalizeRecommendations(
  value: unknown,
  status:
    ManagerialIntelligenceAnalysisStatus,
  decision:
    ManagerialIntelligenceDecision,
  signals:
    ManagerialIntelligenceSignal[],
  context:
    ManagerialIntelligenceNormalizationContext,
  collectedCycleIds:
    Set<string>,
  collectedSellerIds:
    Set<string>,
): ManagerialIntelligenceRecommendation[] {
  const signalMap =
    new Map(
      signals.map(
        signal => [
          signal.signal_key,
          signal,
        ],
      ),
    )

  return requireArray(
    value,
    'intelligence.recommendations',
  ).map(
    (item, index) => {
      const path =
        `intelligence.recommendations[${index}]`

      const record =
        requireRecord(
          item,
          path,
        )

      const action =
        requireEnum(
          record.action,
          MANAGERIAL_INTELLIGENCE_RECOMMENDATION_ACTIONS,
          `${path}.action`,
        )

      const targetType =
        requireEnum(
          record.target_type,
          MANAGERIAL_INTELLIGENCE_RECOMMENDATION_TARGETS,
          `${path}.target_type`,
        )

      if (
        !targetAllowedForAction(
          action,
          targetType,
        )
      ) {
        fail(
          'RECOMMENDATION_TARGET_MISMATCH',
          `${path}.target_type`,
          `A ação ${action} não aceita alvo ${targetType}.`,
        )
      }

      const targetId =
        requireNullableString(
          record.target_id,
          `${path}.target_id`,
        )

      if (
        [
          'none',
          'team',
          'process',
        ].includes(targetType) &&
        targetId !== null
      ) {
        fail(
          'TARGET_ID_NOT_ALLOWED',
          `${path}.target_id`,
          'Esse tipo de alvo não aceita identificador.',
        )
      }

      if (
        [
          'seller',
          'opportunity',
        ].includes(targetType) &&
        targetId === null
      ) {
        fail(
          'TARGET_ID_REQUIRED',
          `${path}.target_id`,
          'Esse tipo de alvo exige identificador.',
        )
      }

      if (
        targetType ===
          'seller' &&
        targetId !== null
      ) {
        if (
          !context
            .available_seller_user_ids
            .includes(targetId)
        ) {
          fail(
            'UNKNOWN_REFERENCE',
            `${path}.target_id`,
            'Vendedor recomendado não está disponível.',
          )
        }

        collectedSellerIds.add(
          targetId,
        )
      }

      if (
        targetType ===
          'opportunity' &&
        targetId !== null
      ) {
        if (
          !context
            .available_cycle_ids
            .includes(targetId)
        ) {
          fail(
            'UNKNOWN_REFERENCE',
            `${path}.target_id`,
            'Oportunidade recomendada não está disponível.',
          )
        }

        collectedCycleIds.add(
          targetId,
        )
      }

      const signalKeys =
        requireUniqueStringArray(
          record.signal_keys,
          `${path}.signal_keys`,
        )

      for (const key of signalKeys) {
        if (!signalMap.has(key)) {
          fail(
            'UNKNOWN_SIGNAL',
            `${path}.signal_keys`,
            `Sinal desconhecido: ${key}.`,
          )
        }
      }

      if (
        ![
          'no_action',
          'collect_more_evidence',
        ].includes(action) &&
        signalKeys.length === 0
      ) {
        fail(
          'RECOMMENDATION_SIGNAL_REQUIRED',
          `${path}.signal_keys`,
          'Recomendação gerencial precisa apontar os sinais que a sustentam.',
        )
      }

      if (
        action ===
          'no_action' &&
        (
          targetType !==
            'none' ||
          targetId !== null ||
          signalKeys.length >
            0
        )
      ) {
        fail(
          'NO_ACTION_MUST_BE_EMPTY',
          path,
          'NO_ACTION não pode esconder alvo ou intervenção.',
        )
      }

      if (
        status ===
          'insufficient' &&
        ![
          'no_action',
          'collect_more_evidence',
        ].includes(action)
      ) {
        fail(
          'INSUFFICIENT_RECOMMENDATION',
          `${path}.action`,
          'Cobertura insuficiente só permite aguardar ou coletar evidência.',
        )
      }

      if (
        !decision
          .intervention_needed &&
        ![
          'observe',
          'collect_more_evidence',
          'no_action',
        ].includes(action)
      ) {
        fail(
          'RECOMMENDATION_EXCEEDS_DECISION',
          `${path}.action`,
          'A recomendação não pode ultrapassar a decisão gerencial.',
        )
      }

      if (
        action ===
          'coach_seller' &&
        targetId !== null
      ) {
        const supported =
          signalKeys.some(
            key =>
              signalMap
                .get(key)
                ?.affected_seller_user_ids
                .includes(targetId),
          )

        if (!supported) {
          fail(
            'TARGET_NOT_SUPPORTED',
            `${path}.target_id`,
            'O vendedor recomendado não é afetado pelos sinais indicados.',
          )
        }
      }

      if (
        action ===
          'intervene_opportunity' &&
        targetId !== null
      ) {
        const supported =
          signalKeys.some(
            key =>
              signalMap
                .get(key)
                ?.affected_cycle_ids
                .includes(targetId),
          )

        if (!supported) {
          fail(
            'TARGET_NOT_SUPPORTED',
            `${path}.target_id`,
            'A oportunidade recomendada não é afetada pelos sinais indicados.',
          )
        }
      }

      return {
        action,

        target_type:
          targetType,

        target_id:
          targetId,

        reason:
          requireString(
            record.reason,
            `${path}.reason`,
          ),

        signal_keys:
          signalKeys,

        advisory_only:
          requireTrue(
            record.advisory_only,
            `${path}.advisory_only`,
          ),
      }
    },
  )
}

export function normalizeManagerialIntelligence(
  value: unknown,
  context:
    ManagerialIntelligenceNormalizationContext,
): ManagerialIntelligence {
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
      'intelligence',
    )

  if (
    root.contract_version !==
    MANAGERIAL_INTELLIGENCE_CONTRACT_VERSION
  ) {
    fail(
      'CONTRACT_VERSION_MISMATCH',
      'intelligence.contract_version',
      'Versão incompatível da inteligência gerencial.',
    )
  }

  const generatedAt =
    requireString(
      root.generated_at,
      'intelligence.generated_at',
      100,
    )

  if (
    !Number.isFinite(
      Date.parse(
        generatedAt,
      ),
    )
  ) {
    fail(
      'INVALID_GENERATED_AT',
      'intelligence.generated_at',
      'Horário de geração inválido.',
    )
  }

  if (
    Date.parse(generatedAt) >
    Date.parse(
      context.reference_time,
    )
  ) {
    fail(
      'GENERATED_AT_IN_FUTURE',
      'intelligence.generated_at',
      'A inteligência não pode ser gerada no futuro.',
    )
  }

  const analysisStatus =
    requireEnum(
      root.analysis_status,
      MANAGERIAL_INTELLIGENCE_ANALYSIS_STATUSES,
      'intelligence.analysis_status',
    )

  const limitations =
    requireUniqueStringArray(
      root.analysis_limitations,
      'intelligence.analysis_limitations',
    )

  if (
    analysisStatus ===
      'complete' &&
    limitations.length > 0
  ) {
    fail(
      'COMPLETE_WITH_LIMITATIONS',
      'intelligence.analysis_limitations',
      'Análise completa não pode declarar limitações.',
    )
  }

  if (
    analysisStatus !==
      'complete' &&
    limitations.length === 0
  ) {
    fail(
      'LIMITATION_REQUIRED',
      'intelligence.analysis_limitations',
      'Análise limitada ou insuficiente precisa declarar a limitação.',
    )
  }

  const collectedAnalysisEventIds =
    new Set<string>()

  const collectedActionEventIds =
    new Set<string>()

  const collectedCycleEventIds =
    new Set<string>()

  const collectedCycleIds =
    new Set<string>()

  const collectedSellerIds =
    new Set<string>()

  const scope =
    normalizeScope(
      root.scope,
      context,
      collectedSellerIds,
    )

  const coverage =
    normalizeCoverage(
      root.coverage,
      analysisStatus,
    )

  const signals =
    normalizeSignals(
      root.signals,
      analysisStatus,
      context,
      collectedAnalysisEventIds,
      collectedActionEventIds,
      collectedCycleEventIds,
      collectedCycleIds,
      collectedSellerIds,
    )

  const decision =
    normalizeDecision(
      root.management_decision,
      analysisStatus,
      signals,
    )

  const recommendations =
    normalizeRecommendations(
      root.recommendations,
      analysisStatus,
      decision,
      signals,
      context,
      collectedCycleIds,
      collectedSellerIds,
    )

  const analysisEventIds =
    normalizeKnownIds(
      root.analysis_event_ids,
      'intelligence.analysis_event_ids',
      context
        .available_analysis_event_ids,
    )

  const actionEventIds =
    normalizeKnownIds(
      root.action_event_ids,
      'intelligence.action_event_ids',
      context
        .available_action_event_ids,
    )

  const cycleEventIds =
    normalizeKnownIds(
      root.cycle_event_ids,
      'intelligence.cycle_event_ids',
      context
        .available_cycle_event_ids,
    )

  const cycleIds =
    normalizeKnownIds(
      root.cycle_ids,
      'intelligence.cycle_ids',
      context
        .available_cycle_ids,
    )

  const sellerUserIds =
    normalizeKnownIds(
      root.seller_user_ids,
      'intelligence.seller_user_ids',
      context
        .available_seller_user_ids,
    )

  ensureDeclaredReferences(
    analysisEventIds,
    collectedAnalysisEventIds,
    'intelligence.analysis_event_ids',
  )

  ensureDeclaredReferences(
    actionEventIds,
    collectedActionEventIds,
    'intelligence.action_event_ids',
  )

  ensureDeclaredReferences(
    cycleEventIds,
    collectedCycleEventIds,
    'intelligence.cycle_event_ids',
  )

  ensureDeclaredReferences(
    cycleIds,
    collectedCycleIds,
    'intelligence.cycle_ids',
  )

  ensureDeclaredReferences(
    sellerUserIds,
    collectedSellerIds,
    'intelligence.seller_user_ids',
  )

  return {
    contract_version:
      MANAGERIAL_INTELLIGENCE_CONTRACT_VERSION,

    generated_at:
      generatedAt,

    analysis_status:
      analysisStatus,

    analysis_limitations:
      limitations,

    scope,
    coverage,
    signals,

    management_decision:
      decision,

    recommendations,

    analysis_event_ids:
      analysisEventIds,

    action_event_ids:
      actionEventIds,

    cycle_event_ids:
      cycleEventIds,

    cycle_ids:
      cycleIds,

    seller_user_ids:
      sellerUserIds,
  }
}
