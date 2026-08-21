import {
  aggregateManagerialEvidence,
} from './managerial-evidence-aggregator'

import type {
  ManagerialActionFact,
  ManagerialCommercialReadingCoverage,
  ManagerialCycleFact,
  ManagerialCycleSnapshot,
  ManagerialEvidenceExtraction,
  ManagerialEvidenceSourceLimitation,
  ManagerialExcludedAnalysisEvent,
  ManagerialSemanticEvidence,
} from './managerial-evidence-extractor'

import {
  classifyManagerialSignals,
  type ManagerialSignalClassification,
} from './managerial-signal-classifier'

import {
  classifyManagerialPriority,
} from './managerial-priority-classifier'

import {
  classifyManagerialRecommendations,
} from './managerial-recommendation-classifier'

import {
  MANAGERIAL_INTELLIGENCE_CONTRACT_VERSION,
  normalizeManagerialIntelligence,
  type ManagerialIntelligence,
  type ManagerialIntelligenceAnalysisStatus,
  type ManagerialIntelligenceCoverage,
  type ManagerialIntelligenceScopeType,
} from './managerial-intelligence-contract'

export type ManagerialIntelligenceAssemblyScope = {
  period_start: string
  period_end: string

  seller_scope: {
    type:
      ManagerialIntelligenceScopeType

    seller_user_id:
      string | null
  }

  eligible_cycle_ids:
    string[]

  seller_user_ids_in_scope:
    string[]
}

export type AssembleManagerialIntelligenceArgs = {
  extraction:
    ManagerialEvidenceExtraction

  scope:
    ManagerialIntelligenceAssemblyScope

  reference_time:
    string
}

export class ManagerialIntelligenceAssemblerError
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
      'ManagerialIntelligenceAssemblerError'

    this.code = code
    this.path = path
  }
}

function fail(
  code: string,
  path: string,
  message: string,
): never {
  throw new ManagerialIntelligenceAssemblerError(
    code,
    path,
    message,
  )
}

function requireText(
  value: unknown,
  path: string,
): string {
  if (
    typeof value !== 'string' ||
    !value.trim()
  ) {
    fail(
      'INVALID_TEXT',
      path,
      path + ' é obrigatório.',
    )
  }

  return value.trim()
}

function requireDateKey(
  value: unknown,
  path: string,
): string {
  const normalized =
    requireText(
      value,
      path,
    )

  if (
    !/^\d{4}-\d{2}-\d{2}$/
      .test(normalized)
  ) {
    fail(
      'INVALID_DATE',
      path,
      path +
        ' precisa usar YYYY-MM-DD.',
    )
  }

  const parsed =
    new Date(
      normalized +
        'T00:00:00.000Z',
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
      path +
        ' possui data inválida.',
    )
  }

  return normalized
}

function requireReferenceTime(
  value: unknown,
): string {
  const normalized =
    requireText(
      value,
      'reference_time',
    )

  if (
    !Number.isFinite(
      Date.parse(normalized),
    )
  ) {
    fail(
      'INVALID_REFERENCE_TIME',
      'reference_time',
      'reference_time inválido.',
    )
  }

  return normalized
}

function uniqueSorted(
  values: string[],
): string[] {
  return Array.from(
    new Set(values),
  ).sort()
}

function requireUniqueTextArray(
  value: unknown,
  path: string,
): string[] {
  if (!Array.isArray(value)) {
    fail(
      'INVALID_LIST',
      path,
      path + ' precisa ser uma lista.',
    )
  }

  const normalized =
    value.map(
      (item, index) =>
        requireText(
          item,
          path +
            '[' +
            index +
            ']',
        ),
    )

  if (
    new Set(normalized).size !==
    normalized.length
  ) {
    fail(
      'DUPLICATE_VALUE',
      path,
      path +
        ' possui valores duplicados.',
    )
  }

  return normalized.sort()
}

function requireExtractionArrays(
  extraction:
    ManagerialEvidenceExtraction,
): void {
  const fields = [
    'commercial_reading_coverage',
    'semantic_evidence',
    'action_facts',
    'cycle_facts',
    'cycle_snapshots',
    'excluded_analysis_events',
    'source_limitations',
  ] as const

  for (const field of fields) {
    if (
      !Array.isArray(
        extraction[field],
      )
    ) {
      fail(
        'INVALID_EXTRACTION',
        'extraction.' + field,
        'O handoff A5.3 está incompleto.',
      )
    }
  }
}

function validateScope(
  scope:
    ManagerialIntelligenceAssemblyScope,
  referenceTime: string,
): {
  period_start: string
  period_end: string

  seller_scope: {
    type:
      ManagerialIntelligenceScopeType

    seller_user_id:
      string | null
  }

  eligible_cycle_ids:
    string[]

  seller_user_ids_in_scope:
    string[]
} {
  const periodStart =
    requireDateKey(
      scope.period_start,
      'scope.period_start',
    )

  const periodEnd =
    requireDateKey(
      scope.period_end,
      'scope.period_end',
    )

  if (
    periodEnd <
    periodStart
  ) {
    fail(
      'INVALID_PERIOD',
      'scope.period_end',
      'A data final não pode ser anterior à inicial.',
    )
  }

  const referenceDate =
    referenceTime.slice(
      0,
      10,
    )

  if (
    /^\d{4}-\d{2}-\d{2}$/
      .test(referenceDate) &&
    periodEnd >
      referenceDate
  ) {
    fail(
      'PERIOD_IN_FUTURE',
      'scope.period_end',
      'O período não pode avançar para o futuro.',
    )
  }

  const type =
    scope
      .seller_scope
      .type

  if (
    type !== 'team' &&
    type !== 'seller'
  ) {
    fail(
      'INVALID_SCOPE_TYPE',
      'scope.seller_scope.type',
      'Escopo gerencial inválido.',
    )
  }

  const sellerUserId =
    scope
      .seller_scope
      .seller_user_id ===
      null
      ? null
      : requireText(
          scope
            .seller_scope
            .seller_user_id,
          'scope.seller_scope.seller_user_id',
        )

  const eligibleCycleIds =
    requireUniqueTextArray(
      scope.eligible_cycle_ids,
      'scope.eligible_cycle_ids',
    )

  const sellerUserIds =
    requireUniqueTextArray(
      scope
        .seller_user_ids_in_scope,
      'scope.seller_user_ids_in_scope',
    )

  if (
    type === 'team' &&
    sellerUserId !== null
  ) {
    fail(
      'TEAM_SCOPE_WITH_SELLER',
      'scope.seller_scope',
      'Escopo de equipe não aceita vendedor individual.',
    )
  }

  if (
    type === 'seller' &&
    sellerUserId === null
  ) {
    fail(
      'SELLER_SCOPE_REQUIRES_SELLER',
      'scope.seller_scope.seller_user_id',
      'Escopo individual exige vendedor.',
    )
  }

  if (
    type === 'seller' &&
    (
      sellerUserIds.length !== 1 ||
      sellerUserIds[0] !==
        sellerUserId
    )
  ) {
    fail(
      'SELLER_SCOPE_MISMATCH',
      'scope.seller_user_ids_in_scope',
      'Escopo individual precisa conter somente o vendedor selecionado.',
    )
  }

  return {
    period_start:
      periodStart,

    period_end:
      periodEnd,

    seller_scope: {
      type,
      seller_user_id:
        sellerUserId,
    },

    eligible_cycle_ids:
      eligibleCycleIds,

    seller_user_ids_in_scope:
      sellerUserIds,
  }
}

function cycleIsEligible(
  cycleId: string,
  eligibleCycles:
    Set<string>,
): boolean {
  return eligibleCycles.has(
    cycleId,
  )
}

function historicalSellerMatchesScope(
  sellerUserId:
    string | null,
  scope: {
    type:
      ManagerialIntelligenceScopeType

    seller_user_id:
      string | null
  },
): boolean {
  if (scope.type === 'team') {
    return true
  }

  return (
    sellerUserId === null ||
    sellerUserId ===
      scope.seller_user_id
  )
}

function actionSellerMatchesScope(
  sellerUserId: string,
  scope: {
    type:
      ManagerialIntelligenceScopeType

    seller_user_id:
      string | null
  },
): boolean {
  if (scope.type === 'team') {
    return true
  }

  return (
    sellerUserId ===
    scope.seller_user_id
  )
}

function ensureTeamSellerIsKnown(
  sellerUserId:
    string | null,
  availableSellers:
    Set<string>,
  path: string,
): void {
  if (
    sellerUserId !== null &&
    !availableSellers.has(
      sellerUserId,
    )
  ) {
    fail(
      'SELLER_OUTSIDE_SCOPE',
      path,
      sellerUserId +
        ' não pertence ao escopo de vendedores declarado.',
    )
  }
}

function cloneCoverage(
  item:
    ManagerialCommercialReadingCoverage,
): ManagerialCommercialReadingCoverage {
  return {
    ...item,

    analysis_limitations: [
      ...item.analysis_limitations,
    ],
  }
}

function cloneSemanticEvidence(
  item:
    ManagerialSemanticEvidence,
): ManagerialSemanticEvidence {
  return {
    ...item,

    analysis_limitations: [
      ...item.analysis_limitations,
    ],

    evidence_message_ids: [
      ...item.evidence_message_ids,
    ],

    memory_ids: [
      ...item.memory_ids,
    ],
  }
}

function cloneActionFact(
  item:
    ManagerialActionFact,
): ManagerialActionFact {
  return {
    ...item,
  }
}

function cloneCycleFact(
  item:
    ManagerialCycleFact,
): ManagerialCycleFact {
  return {
    ...item,
  }
}

function cloneSnapshot(
  item:
    ManagerialCycleSnapshot,
): ManagerialCycleSnapshot {
  return {
    ...item,
  }
}

function cloneExclusion(
  item:
    ManagerialExcludedAnalysisEvent,
): ManagerialExcludedAnalysisEvent {
  return {
    ...item,
  }
}

function cloneSourceLimitation(
  item:
    ManagerialEvidenceSourceLimitation,
): ManagerialEvidenceSourceLimitation {
  return {
    ...item,

    skipped_dimensions: [
      ...item.skipped_dimensions,
    ],
  }
}

function buildScopedExtraction(
  extraction:
    ManagerialEvidenceExtraction,
  scope:
    ReturnType<
      typeof validateScope
    >,
): ManagerialEvidenceExtraction {
  const eligibleCycles =
    new Set(
      scope.eligible_cycle_ids,
    )

  const availableSellers =
    new Set(
      scope
        .seller_user_ids_in_scope,
    )

  if (
    scope
      .seller_scope
      .type ===
    'team'
  ) {
    extraction
      .commercial_reading_coverage
      .filter(
        item =>
          cycleIsEligible(
            item.cycle_id,
            eligibleCycles,
          ),
      )
      .forEach(
        (item, index) =>
          ensureTeamSellerIsKnown(
            item.seller_user_id,
            availableSellers,
            'extraction.commercial_reading_coverage[' +
              index +
              '].seller_user_id',
          ),
      )

    extraction
      .semantic_evidence
      .filter(
        item =>
          cycleIsEligible(
            item.cycle_id,
            eligibleCycles,
          ),
      )
      .forEach(
        (item, index) =>
          ensureTeamSellerIsKnown(
            item.seller_user_id,
            availableSellers,
            'extraction.semantic_evidence[' +
              index +
              '].seller_user_id',
          ),
      )

    extraction
      .action_facts
      .filter(
        item =>
          cycleIsEligible(
            item.cycle_id,
            eligibleCycles,
          ),
      )
      .forEach(
        (item, index) =>
          ensureTeamSellerIsKnown(
            item.seller_user_id,
            availableSellers,
            'extraction.action_facts[' +
              index +
              '].seller_user_id',
          ),
      )
  }

  const coverage =
    extraction
      .commercial_reading_coverage
      .filter(
        item =>
          cycleIsEligible(
            item.cycle_id,
            eligibleCycles,
          ) &&
          historicalSellerMatchesScope(
            item.seller_user_id,
            scope.seller_scope,
          ),
      )
      .map(
        cloneCoverage,
      )

  const coverageIds =
    new Set(
      coverage.map(
        item =>
          item.analysis_event_id,
      ),
    )

  if (
    coverageIds.size !==
    coverage.length
  ) {
    fail(
      'DUPLICATE_ANALYSIS_EVENT',
      'extraction.commercial_reading_coverage',
      'A cobertura A4 possui eventos duplicados.',
    )
  }

  const semanticEvidence =
    extraction
      .semantic_evidence
      .filter(
        item =>
          cycleIsEligible(
            item.cycle_id,
            eligibleCycles,
          ) &&
          historicalSellerMatchesScope(
            item.seller_user_id,
            scope.seller_scope,
          ),
      )
      .map(
        cloneSemanticEvidence,
      )

  semanticEvidence.forEach(
    (item, index) => {
      if (
        !coverageIds.has(
          item.analysis_event_id,
        )
      ) {
        fail(
          'SEMANTIC_COVERAGE_MISSING',
          'extraction.semantic_evidence[' +
            index +
            '].analysis_event_id',
          'Evidência semântica precisa possuir cobertura A4 compatível no mesmo escopo.',
        )
      }
    },
  )

  const actionFacts =
    extraction
      .action_facts
      .filter(
        item =>
          cycleIsEligible(
            item.cycle_id,
            eligibleCycles,
          ) &&
          actionSellerMatchesScope(
            item.seller_user_id,
            scope.seller_scope,
          ),
      )
      .map(
        cloneActionFact,
      )

  const cycleFacts =
    extraction
      .cycle_facts
      .filter(
        item =>
          cycleIsEligible(
            item.cycle_id,
            eligibleCycles,
          ),
      )
      .map(
        cloneCycleFact,
      )

  const cycleSnapshots =
    extraction
      .cycle_snapshots
      .filter(
        item =>
          cycleIsEligible(
            item.cycle_id,
            eligibleCycles,
          ),
      )
      .map(
        cloneSnapshot,
      )

  const exclusions =
    extraction
      .excluded_analysis_events
      .filter(
        item =>
          cycleIsEligible(
            item.cycle_id,
            eligibleCycles,
          ),
      )
      .map(
        cloneExclusion,
      )

  const sourceLimitations =
    extraction
      .source_limitations
      .filter(
        item =>
          cycleIsEligible(
            item.cycle_id,
            eligibleCycles,
          ) &&
          coverageIds.has(
            item.analysis_event_id,
          ),
      )
      .map(
        cloneSourceLimitation,
      )

  const analysisEventIds =
    uniqueSorted(
      coverage.map(
        item =>
          item.analysis_event_id,
      ),
    )

  const actionEventIds =
    uniqueSorted(
      actionFacts.map(
        item =>
          item.action_event_id,
      ),
    )

  const cycleEventIds =
    uniqueSorted(
      cycleFacts.map(
        item =>
          item.cycle_event_id,
      ),
    )

  const commercialReadingCycleIds =
    uniqueSorted(
      coverage.map(
        item =>
          item.cycle_id,
      ),
    )

  const commercialReadingSellerIds =
    uniqueSorted(
      coverage
        .flatMap(
          item =>
            item.seller_user_id
              ? [
                  item.seller_user_id,
                ]
              : [],
        ),
    )

  return {
    company_id:
      extraction.company_id,

    coverage: {
      analysis_events_received:
        coverage.length +
        exclusions.length,

      commercial_reading_events_compatible:
        coverage.length,

      commercial_reading_events_excluded:
        exclusions.length,

      seller_attributed_commercial_reading_events:
        coverage.filter(
          item =>
            item.seller_user_id !==
            null,
        ).length,

      action_events:
        actionFacts.length,

      cycle_events:
        cycleFacts.length,

      cycle_snapshots:
        cycleSnapshots.length,
    },

    commercial_reading_coverage:
      coverage,

    semantic_evidence:
      semanticEvidence,

    action_facts:
      actionFacts,

    cycle_facts:
      cycleFacts,

    cycle_snapshots:
      cycleSnapshots,

    excluded_analysis_events:
      exclusions,

    source_limitations:
      sourceLimitations,

    analysis_event_ids:
      analysisEventIds,

    action_event_ids:
      actionEventIds,

    cycle_event_ids:
      cycleEventIds,

    commercial_reading_cycle_ids:
      commercialReadingCycleIds,

    commercial_reading_seller_user_ids:
      commercialReadingSellerIds,

    cycle_ids:
      [
        ...scope
          .eligible_cycle_ids,
      ],

    seller_user_ids:
      [
        ...scope
          .seller_user_ids_in_scope,
      ],
  }
}

function deriveCoverage(
  extraction:
    ManagerialEvidenceExtraction,
  scope:
    ReturnType<
      typeof validateScope
    >,
): ManagerialIntelligenceCoverage {
  const coveredCycles =
    uniqueSorted(
      extraction
        .commercial_reading_coverage
        .map(
          item =>
            item.cycle_id,
        ),
    )

  const sellersInScope =
    new Set(
      scope
        .seller_user_ids_in_scope,
    )

  const coveredSellers =
    uniqueSorted(
      extraction
        .commercial_reading_coverage
        .flatMap(
          item =>
            item.seller_user_id &&
            sellersInScope.has(
              item.seller_user_id,
            )
              ? [
                  item.seller_user_id,
                ]
              : [],
        ),
    )

  return {
    eligible_cycles:
      scope
        .eligible_cycle_ids
        .length,

    cycles_with_commercial_reading:
      coveredCycles.length,

    commercial_reading_events:
      extraction
        .commercial_reading_coverage
        .length,

    companion_action_events:
      extraction
        .action_facts
        .length,

    cycle_events:
      extraction
        .cycle_facts
        .length,

    sellers_in_scope:
      scope
        .seller_user_ids_in_scope
        .length,

    sellers_with_commercial_reading:
      coveredSellers.length,
  }
}

function deriveAnalysisState(
  extraction:
    ManagerialEvidenceExtraction,
  coverage:
    ManagerialIntelligenceCoverage,
): {
  status:
    ManagerialIntelligenceAnalysisStatus

  limitations:
    string[]
} {
  if (
    coverage.eligible_cycles ===
    0
  ) {
    return {
      status:
        'insufficient',

      limitations: [
        'no_eligible_cycles',
      ],
    }
  }

  if (
    coverage
      .cycles_with_commercial_reading ===
    0
  ) {
    return {
      status:
        'insufficient',

      limitations: [
        'commercial_reading_coverage_missing',
      ],
    }
  }

  const limitations:
    string[] =
    []

  if (
    coverage
      .cycles_with_commercial_reading <
    coverage.eligible_cycles
  ) {
    limitations.push(
      'partial_commercial_reading_coverage',
    )
  }

  if (
    coverage
      .sellers_with_commercial_reading <
    coverage.sellers_in_scope
  ) {
    limitations.push(
      'seller_commercial_reading_coverage_missing',
    )
  }

  for (
    const item
    of extraction
      .commercial_reading_coverage
  ) {
    if (
      item.analysis_status ===
      'limited'
    ) {
      limitations.push(
        ...item
          .analysis_limitations,
      )
    }
  }

  if (
    extraction
      .source_limitations
      .some(
        item =>
          item.reason ===
          'seller_attribution_missing',
      )
  ) {
    limitations.push(
      'seller_attribution_missing',
    )
  }

  const normalized =
    uniqueSorted(
      limitations,
    )

  return {
    status:
      normalized.length ===
      0
        ? 'complete'
        : 'limited',

    limitations:
      normalized,
  }
}

function emptyClassificationForInsufficient(
  companyId: string,
  extraction:
    ManagerialEvidenceExtraction,
): ManagerialSignalClassification {
  return {
    company_id:
      companyId,

    semantic_sample_size:
      uniqueSorted(
        extraction
          .commercial_reading_cycle_ids,
      ).length,

    action_sample_size:
      uniqueSorted(
        extraction
          .action_facts
          .map(
            item =>
              item.cycle_id,
          ),
      ).length,

    signals: [],
  }
}

export function assembleManagerialIntelligence(
  args:
    AssembleManagerialIntelligenceArgs,
): ManagerialIntelligence {
  requireExtractionArrays(
    args.extraction,
  )

  const companyId =
    requireText(
      args.extraction.company_id,
      'extraction.company_id',
    )

  const referenceTime =
    requireReferenceTime(
      args.reference_time,
    )

  const scope =
    validateScope(
      args.scope,
      referenceTime,
    )

  const scopedExtraction =
    buildScopedExtraction(
      {
        ...args.extraction,

        company_id:
          companyId,
      },
      scope,
    )

  const aggregation =
    aggregateManagerialEvidence(
      scopedExtraction,
    )

  const coverage =
    deriveCoverage(
      scopedExtraction,
      scope,
    )

  const analysis =
    deriveAnalysisState(
      scopedExtraction,
      coverage,
    )

  const classification =
    analysis.status ===
      'insufficient'
      ? emptyClassificationForInsufficient(
          companyId,
          scopedExtraction,
        )
      : classifyManagerialSignals(
          aggregation,
        )

  const priority =
    classifyManagerialPriority(
      classification,
    )

  const recommendations =
    classifyManagerialRecommendations(
      classification,
      priority,
    )

  const analysisEventIds =
    uniqueSorted(
      scopedExtraction
        .analysis_event_ids,
    )

  const actionEventIds =
    uniqueSorted(
      scopedExtraction
        .action_event_ids,
    )

  const cycleEventIds =
    uniqueSorted(
      scopedExtraction
        .cycle_event_ids,
    )

  const cycleIds =
    uniqueSorted(
      scope.eligible_cycle_ids,
    )

  const sellerUserIds =
    uniqueSorted(
      scope
        .seller_user_ids_in_scope,
    )

  const candidate:
    ManagerialIntelligence = {
      contract_version:
        MANAGERIAL_INTELLIGENCE_CONTRACT_VERSION,

      generated_at:
        referenceTime,

      analysis_status:
        analysis.status,

      analysis_limitations:
        analysis.limitations,

      scope: {
        company_id:
          companyId,

        period_start:
          scope.period_start,

        period_end:
          scope.period_end,

        seller_scope: {
          ...scope.seller_scope,
        },
      },

      coverage,

      signals:
        classification
          .signals,

      management_decision:
        priority.decision,

      recommendations:
        recommendations
          .recommendations,

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

  return normalizeManagerialIntelligence(
    candidate,
    {
      expected_company_id:
        companyId,

      reference_time:
        referenceTime,

      available_analysis_event_ids:
        analysisEventIds,

      available_action_event_ids:
        actionEventIds,

      available_cycle_event_ids:
        cycleEventIds,

      available_cycle_ids:
        cycleIds,

      available_seller_user_ids:
        sellerUserIds,
    },
  )
}
