import {
  COMMERCIAL_READING_ANALYSIS_STATUSES,
  COMMERCIAL_READING_CONTRACT_VERSION,
  COMMERCIAL_READING_IMPROVEMENT_KINDS,
  COMMERCIAL_READING_RISK_SEVERITIES,
  COMMERCIAL_READING_SELLER_STRENGTH_KINDS,
  type CommercialReadingAnalysisStatus,
  type CommercialReadingRiskSeverity,
} from './commercial-reading-contract'

import type {
  ManagerialIntelligenceSignalCategory,
  ManagerialIntelligenceSignalKind,
} from './managerial-intelligence-contract'

type JsonRecord =
  Record<string, unknown>

export type ManagerialSemanticEvidenceDimension =
  | 'seller_improvement'
  | 'seller_strength'
  | 'customer_objection'
  | 'service_risk'

export type ManagerialCommercialReadingCoverage = {
  source:
    'commercial_reading_coverage'

  analysis_event_id:
    string

  cycle_id:
    string

  seller_user_id:
    string | null

  occurred_at:
    string

  analysis_status:
    CommercialReadingAnalysisStatus

  analysis_limitations:
    string[]
}

export type ManagerialSemanticEvidence = {
  source:
    'commercial_reading'

  analysis_event_id:
    string

  cycle_id:
    string

  seller_user_id:
    string | null

  occurred_at:
    string

  analysis_status:
    CommercialReadingAnalysisStatus

  analysis_limitations:
    string[]

  dimension:
    ManagerialSemanticEvidenceDimension

  semantic_key:
    string

  category:
    ManagerialIntelligenceSignalCategory

  kind:
    ManagerialIntelligenceSignalKind

  summary:
    string

  impact:
    string | null

  risk_severity:
    CommercialReadingRiskSeverity | null

  evidence_message_ids:
    string[]

  memory_ids:
    string[]
}

export type ManagerialActionFact = {
  source:
    'companion_action'

  action_event_id:
    string

  cycle_id:
    string

  seller_user_id:
    string

  occurred_at:
    string

  action_type:
    string

  mapped_kind:
    ManagerialIntelligenceSignalKind | null
}

export type ManagerialCycleFact = {
  source:
    'cycle_event'

  cycle_event_id:
    string

  cycle_id:
    string

  actor_user_id:
    string | null

  occurred_at:
    string

  event_type:
    string

  from_status:
    string | null

  to_status:
    string | null

  action_channel:
    string | null

  action_result:
    string | null

  result_detail:
    string | null

  next_action:
    string | null

  next_action_date:
    string | null

  lost_reason:
    string | null

  event_source:
    string | null
}

export type ManagerialCycleSnapshot = {
  source:
    'sales_cycle_snapshot'

  cycle_id:
    string

  current_owner_user_id:
    string | null

  status:
    string

  next_action:
    string | null

  next_action_date:
    string | null

  updated_at:
    string
}

export type ManagerialExcludedAnalysisEvent = {
  analysis_event_id:
    string

  cycle_id:
    string

  seller_user_id:
    string | null

  reason:
    | 'commercial_reading_missing'
    | 'commercial_reading_incompatible'

  contract_version:
    string | null
}

export type ManagerialEvidenceSourceLimitation = {
  analysis_event_id:
    string

  cycle_id:
    string

  reason:
    'seller_attribution_missing'

  skipped_dimensions:
    ManagerialSemanticEvidenceDimension[]
}

export type ManagerialEvidenceExtraction = {
  company_id:
    string

  coverage: {
    analysis_events_received:
      number

    commercial_reading_events_compatible:
      number

    commercial_reading_events_excluded:
      number

    seller_attributed_commercial_reading_events:
      number

    action_events:
      number

    cycle_events:
      number

    cycle_snapshots:
      number
  }

  commercial_reading_coverage:
    ManagerialCommercialReadingCoverage[]

  semantic_evidence:
    ManagerialSemanticEvidence[]

  action_facts:
    ManagerialActionFact[]

  cycle_facts:
    ManagerialCycleFact[]

  cycle_snapshots:
    ManagerialCycleSnapshot[]

  excluded_analysis_events:
    ManagerialExcludedAnalysisEvent[]

  source_limitations:
    ManagerialEvidenceSourceLimitation[]

  analysis_event_ids:
    string[]

  action_event_ids:
    string[]

  cycle_event_ids:
    string[]

  commercial_reading_cycle_ids:
    string[]

  commercial_reading_seller_user_ids:
    string[]

  cycle_ids:
    string[]

  seller_user_ids:
    string[]
}

export type ExtractManagerialEvidenceArgs = {
  expected_company_id:
    unknown

  commercial_reading_events:
    unknown

  action_events:
    unknown

  cycle_events:
    unknown

  cycle_snapshots:
    unknown
}

export class ManagerialEvidenceExtractorError
  extends Error {
  readonly code:
    string

  readonly path:
    string

  constructor(
    code: string,
    path: string,
    message: string,
  ) {
    super(message)

    this.name =
      'ManagerialEvidenceExtractorError'

    this.code =
      code

    this.path =
      path
  }
}

function fail(
  code: string,
  path: string,
  message: string,
): never {
  throw new ManagerialEvidenceExtractorError(
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
      'INVALID_SOURCE_SHAPE',
      path,
      path + ' precisa ser um objeto.',
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
      'INVALID_SOURCE_SHAPE',
      path,
      path + ' precisa ser uma lista.',
    )
  }

  return value
}

function requireText(
  value: unknown,
  path: string,
  maximumLength = 4000,
): string {
  if (typeof value !== 'string') {
    fail(
      'INVALID_SOURCE_VALUE',
      path,
      path + ' precisa ser texto.',
    )
  }

  const normalized =
    value.trim()

  if (
    !normalized ||
    normalized.length > maximumLength
  ) {
    fail(
      'INVALID_SOURCE_VALUE',
      path,
      path + ' possui valor inválido.',
    )
  }

  return normalized
}

function requireNullableText(
  value: unknown,
  path: string,
): string | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null
  }

  return requireText(
    value,
    path,
    1000,
  )
}

function requireDateTime(
  value: unknown,
  path: string,
): string {
  const normalized =
    requireText(
      value,
      path,
      100,
    )

  if (
    Number.isNaN(
      Date.parse(normalized),
    )
  ) {
    fail(
      'INVALID_SOURCE_TIME',
      path,
      path + ' possui horário inválido.',
    )
  }

  return normalized
}

function requireUniqueTextArray(
  value: unknown,
  path: string,
): string[] {
  const result =
    requireArray(
      value,
      path,
    ).map(
      (item, index) =>
        requireText(
          item,
          path + '[' + index + ']',
          500,
        ),
    )

  if (
    new Set(result).size !==
    result.length
  ) {
    fail(
      'DUPLICATE_SOURCE_REFERENCE',
      path,
      path + ' possui referências duplicadas.',
    )
  }

  return result
}

function requireCompany(
  record: JsonRecord,
  expectedCompanyId: string,
  path: string,
): void {
  const companyId =
    requireText(
      record.company_id,
      path + '.company_id',
      200,
    )

  if (
    companyId !==
    expectedCompanyId
  ) {
    fail(
      'COMPANY_MISMATCH',
      path + '.company_id',
      'A fonte pertence a outra empresa.',
    )
  }
}

function ensureUniqueId(
  id: string,
  used: Set<string>,
  path: string,
): void {
  if (used.has(id)) {
    fail(
      'DUPLICATE_SOURCE_ID',
      path,
      'Identificador de fonte duplicado: ' +
        id,
    )
  }

  used.add(id)
}

function readNestedText(
  record: JsonRecord,
  paths: string[][],
): string | null {
  for (const path of paths) {
    let current:
      unknown =
      record

    for (const key of path) {
      if (!isRecord(current)) {
        current = null
        break
      }

      current =
        current[key]
    }

    if (
      typeof current === 'string' &&
      current.trim()
    ) {
      return current.trim()
    }
  }

  return null
}

function normalizeSemanticKey(
  dimension:
    ManagerialSemanticEvidenceDimension,
  kind: string,
): string {
  return (
    dimension +
    ':' +
    kind
      .trim()
      .toLowerCase()
  )
}

function mapImprovementCategory(
  kind: string,
): ManagerialIntelligenceSignalCategory {
  if (
    kind ===
    'method_misapplication'
  ) {
    return 'method_execution'
  }

  return 'seller_behavior'
}

function mapActionKind(
  actionType: string,
): ManagerialIntelligenceSignalKind | null {
  if (
    actionType ===
    'suggestion_ignored'
  ) {
    return 'suggestion_ignored'
  }

  if (
    [
      'suggestion_copied',
      'suggestion_inserted',
      'suggestion_edited',
      'suggestion_sent',
    ].includes(actionType)
  ) {
    return 'suggestion_adoption'
  }

  if (
    actionType ===
    'crm_rejected'
  ) {
    return 'crm_rejection'
  }

  if (
    actionType ===
    'agenda_rejected'
  ) {
    return 'agenda_rejection'
  }

  return null
}

function normalizeCommercialReadingStatus(
  value: unknown,
  path: string,
): CommercialReadingAnalysisStatus {
  if (
    typeof value !== 'string' ||
    !(
      COMMERCIAL_READING_ANALYSIS_STATUSES as readonly string[]
    ).includes(value)
  ) {
    fail(
      'INVALID_COMMERCIAL_READING',
      path,
      'Status da leitura A4 é inválido.',
    )
  }

  return value as
    CommercialReadingAnalysisStatus
}

function normalizeRiskSeverity(
  value: unknown,
  path: string,
): CommercialReadingRiskSeverity {
  if (
    typeof value !== 'string' ||
    !(
      COMMERCIAL_READING_RISK_SEVERITIES as readonly string[]
    ).includes(value)
  ) {
    fail(
      'INVALID_COMMERCIAL_READING',
      path,
      'Severidade de risco A4 é inválida.',
    )
  }

  return value as
    CommercialReadingRiskSeverity
}

function normalizeAnalysisLimitations(
  value: unknown,
  status:
    CommercialReadingAnalysisStatus,
  path: string,
): string[] {
  const limitations =
    requireUniqueTextArray(
      value,
      path,
    )

  if (
    status === 'complete' &&
    limitations.length > 0
  ) {
    fail(
      'INVALID_COMMERCIAL_READING',
      path,
      'Leitura completa não pode declarar limitações.',
    )
  }

  if (
    status === 'limited' &&
    limitations.length === 0
  ) {
    fail(
      'INVALID_COMMERCIAL_READING',
      path,
      'Leitura limitada precisa declarar limitações.',
    )
  }

  return limitations
}

function extractCommercialReadingEvidence({
  record,
  expectedCompanyId,
  index,
  usedIds,
  cycleIds,
  sellerIds,
  commercialReadingCycleIds,
  commercialReadingSellerIds,
  compatibleAnalysisIds,
  commercialReadingCoverage,
  semanticEvidence,
  exclusions,
  sourceLimitations,
}: {
  record:
    JsonRecord

  expectedCompanyId:
    string

  index:
    number

  usedIds:
    Set<string>

  cycleIds:
    Set<string>

  sellerIds:
    Set<string>

  commercialReadingCycleIds:
    Set<string>

  commercialReadingSellerIds:
    Set<string>

  compatibleAnalysisIds:
    string[]

  commercialReadingCoverage:
    ManagerialCommercialReadingCoverage[]

  semanticEvidence:
    ManagerialSemanticEvidence[]

  exclusions:
    ManagerialExcludedAnalysisEvent[]

  sourceLimitations:
    ManagerialEvidenceSourceLimitation[]
}): boolean {
  const path =
    'commercial_reading_events[' +
    index +
    ']'

  requireCompany(
    record,
    expectedCompanyId,
    path,
  )

  const analysisEventId =
    requireText(
      record.id,
      path + '.id',
      500,
    )

  ensureUniqueId(
    analysisEventId,
    usedIds,
    path + '.id',
  )

  const cycleId =
    requireText(
      record.cycle_id,
      path + '.cycle_id',
      500,
    )

  const sellerUserId =
    requireNullableText(
      record.seller_user_id,
      path + '.seller_user_id',
    )

  const generatedAt =
    requireDateTime(
      record.generated_at,
      path + '.generated_at',
    )

  cycleIds.add(
    cycleId,
  )

  if (sellerUserId !== null) {
    sellerIds.add(
      sellerUserId,
    )
  }

  const normalizedOutput =
    requireRecord(
      record.normalized_output,
      path + '.normalized_output',
    )

  const communication =
    isRecord(
      normalizedOutput.communication,
    )
      ? normalizedOutput.communication
      : null

  const reading =
    communication &&
    isRecord(
      communication.commercial_reading,
    )
      ? communication.commercial_reading
      : null

  if (!reading) {
    exclusions.push({
      analysis_event_id:
        analysisEventId,

      cycle_id:
        cycleId,

      seller_user_id:
        sellerUserId,

      reason:
        'commercial_reading_missing',

      contract_version:
        null,
    })

    return false
  }

  const contractVersion =
    typeof reading.contract_version ===
      'string'
      ? reading.contract_version.trim()
      : null

  if (
    contractVersion !==
    COMMERCIAL_READING_CONTRACT_VERSION
  ) {
    exclusions.push({
      analysis_event_id:
        analysisEventId,

      cycle_id:
        cycleId,

      seller_user_id:
        sellerUserId,

      reason:
        'commercial_reading_incompatible',

      contract_version:
        contractVersion,
    })

    return false
  }

  const analysisStatus =
    normalizeCommercialReadingStatus(
      reading.analysis_status,
      path +
        '.normalized_output.communication.commercial_reading.analysis_status',
    )

  const analysisLimitations =
    normalizeAnalysisLimitations(
      reading.analysis_limitations,
      analysisStatus,
      path +
        '.normalized_output.communication.commercial_reading.analysis_limitations',
    )

  commercialReadingCoverage.push({
    source:
      'commercial_reading_coverage',

    analysis_event_id:
      analysisEventId,

    cycle_id:
      cycleId,

    seller_user_id:
      sellerUserId,

    occurred_at:
      generatedAt,

    analysis_status:
      analysisStatus,

    analysis_limitations:
      [...analysisLimitations],
  })

  compatibleAnalysisIds.push(
    analysisEventId,
  )

  commercialReadingCycleIds.add(
    cycleId,
  )

  if (sellerUserId !== null) {
    commercialReadingSellerIds.add(
      sellerUserId,
    )
  }

  const skippedDimensions =
    new Set<
      ManagerialSemanticEvidenceDimension
    >()

  const sellerStrengths =
    requireArray(
      reading.seller_strengths,
      path +
        '.normalized_output.communication.commercial_reading.seller_strengths',
    )

  for (
    let itemIndex = 0;
    itemIndex <
    sellerStrengths.length;
    itemIndex += 1
  ) {
    const itemPath =
      path +
      '.normalized_output.communication.commercial_reading.seller_strengths[' +
      itemIndex +
      ']'

    const item =
      requireRecord(
        sellerStrengths[itemIndex],
        itemPath,
      )

    const kind =
      requireText(
        item.kind,
        itemPath + '.kind',
        200,
      )

    if (
      !(
        COMMERCIAL_READING_SELLER_STRENGTH_KINDS as readonly string[]
      ).includes(kind)
    ) {
      fail(
        'INVALID_COMMERCIAL_READING',
        itemPath + '.kind',
        'Tipo de acerto do vendedor é inválido.',
      )
    }

    if (sellerUserId === null) {
      skippedDimensions.add(
        'seller_strength',
      )

      continue
    }

    semanticEvidence.push({
      source:
        'commercial_reading',

      analysis_event_id:
        analysisEventId,

      cycle_id:
        cycleId,

      seller_user_id:
        sellerUserId,

      occurred_at:
        generatedAt,

      analysis_status:
        analysisStatus,

      analysis_limitations:
        [...analysisLimitations],

      dimension:
        'seller_strength',

      semantic_key:
        normalizeSemanticKey(
          'seller_strength',
          kind,
        ),

      category:
        'positive_pattern',

      kind:
        'seller_strength_pattern',

      summary:
        requireText(
          item.summary,
          itemPath + '.summary',
        ),

      impact:
        null,

      risk_severity:
        null,

      evidence_message_ids:
        requireUniqueTextArray(
          item.evidence_message_ids,
          itemPath +
            '.evidence_message_ids',
        ),

      memory_ids:
        requireUniqueTextArray(
          item.memory_ids,
          itemPath +
            '.memory_ids',
        ),
    })
  }

  const improvementPoints =
    requireArray(
      reading.improvement_points,
      path +
        '.normalized_output.communication.commercial_reading.improvement_points',
    )

  for (
    let itemIndex = 0;
    itemIndex <
    improvementPoints.length;
    itemIndex += 1
  ) {
    const itemPath =
      path +
      '.normalized_output.communication.commercial_reading.improvement_points[' +
      itemIndex +
      ']'

    const item =
      requireRecord(
        improvementPoints[itemIndex],
        itemPath,
      )

    const kind =
      requireText(
        item.kind,
        itemPath + '.kind',
        200,
      )

    if (
      !(
        COMMERCIAL_READING_IMPROVEMENT_KINDS as readonly string[]
      ).includes(kind)
    ) {
      fail(
        'INVALID_COMMERCIAL_READING',
        itemPath + '.kind',
        'Tipo de melhoria do vendedor é inválido.',
      )
    }

    if (sellerUserId === null) {
      skippedDimensions.add(
        'seller_improvement',
      )

      continue
    }

    semanticEvidence.push({
      source:
        'commercial_reading',

      analysis_event_id:
        analysisEventId,

      cycle_id:
        cycleId,

      seller_user_id:
        sellerUserId,

      occurred_at:
        generatedAt,

      analysis_status:
        analysisStatus,

      analysis_limitations:
        [...analysisLimitations],

      dimension:
        'seller_improvement',

      semantic_key:
        normalizeSemanticKey(
          'seller_improvement',
          kind,
        ),

      category:
        mapImprovementCategory(
          kind,
        ),

      kind:
        kind as
          ManagerialIntelligenceSignalKind,

      summary:
        requireText(
          item.summary,
          itemPath + '.summary',
        ),

      impact:
        requireText(
          item.impact,
          itemPath + '.impact',
        ),

      risk_severity:
        null,

      evidence_message_ids:
        requireUniqueTextArray(
          item.evidence_message_ids,
          itemPath +
            '.evidence_message_ids',
        ),

      memory_ids:
        requireUniqueTextArray(
          item.memory_ids,
          itemPath +
            '.memory_ids',
        ),
    })
  }

  const risks =
    requireRecord(
      reading.risks,
      path +
        '.normalized_output.communication.commercial_reading.risks',
    )

  const customerObjections =
    requireArray(
      risks.customer_objections,
      path +
        '.normalized_output.communication.commercial_reading.risks.customer_objections',
    )

  for (
    let itemIndex = 0;
    itemIndex <
    customerObjections.length;
    itemIndex += 1
  ) {
    const itemPath =
      path +
      '.normalized_output.communication.commercial_reading.risks.customer_objections[' +
      itemIndex +
      ']'

    const item =
      requireRecord(
        customerObjections[itemIndex],
        itemPath,
      )

    const kind =
      requireText(
        item.kind,
        itemPath + '.kind',
        200,
      )

    semanticEvidence.push({
      source:
        'commercial_reading',

      analysis_event_id:
        analysisEventId,

      cycle_id:
        cycleId,

      seller_user_id:
        sellerUserId,

      occurred_at:
        generatedAt,

      analysis_status:
        analysisStatus,

      analysis_limitations:
        [...analysisLimitations],

      dimension:
        'customer_objection',

      semantic_key:
        normalizeSemanticKey(
          'customer_objection',
          kind,
        ),

      category:
        'customer_pattern',

      kind:
        'recurring_objection',

      summary:
        requireText(
          item.summary,
          itemPath + '.summary',
        ),

      impact:
        null,

      risk_severity:
        normalizeRiskSeverity(
          item.severity,
          itemPath + '.severity',
        ),

      evidence_message_ids:
        requireUniqueTextArray(
          item.evidence_message_ids,
          itemPath +
            '.evidence_message_ids',
        ),

      memory_ids:
        requireUniqueTextArray(
          item.memory_ids,
          itemPath +
            '.memory_ids',
        ),
    })
  }

  const serviceRisks =
    requireArray(
      risks.service_risks,
      path +
        '.normalized_output.communication.commercial_reading.risks.service_risks',
    )

  for (
    let itemIndex = 0;
    itemIndex <
    serviceRisks.length;
    itemIndex += 1
  ) {
    const itemPath =
      path +
      '.normalized_output.communication.commercial_reading.risks.service_risks[' +
      itemIndex +
      ']'

    const item =
      requireRecord(
        serviceRisks[itemIndex],
        itemPath,
      )

    const kind =
      requireText(
        item.kind,
        itemPath + '.kind',
        200,
      )

    if (sellerUserId === null) {
      skippedDimensions.add(
        'service_risk',
      )

      continue
    }

    semanticEvidence.push({
      source:
        'commercial_reading',

      analysis_event_id:
        analysisEventId,

      cycle_id:
        cycleId,

      seller_user_id:
        sellerUserId,

      occurred_at:
        generatedAt,

      analysis_status:
        analysisStatus,

      analysis_limitations:
        [...analysisLimitations],

      dimension:
        'service_risk',

      semantic_key:
        normalizeSemanticKey(
          'service_risk',
          kind,
        ),

      category:
        'seller_behavior',

      kind:
        'recurring_service_risk',

      summary:
        requireText(
          item.summary,
          itemPath + '.summary',
        ),

      impact:
        null,

      risk_severity:
        normalizeRiskSeverity(
          item.severity,
          itemPath + '.severity',
        ),

      evidence_message_ids:
        requireUniqueTextArray(
          item.evidence_message_ids,
          itemPath +
            '.evidence_message_ids',
        ),

      memory_ids:
        requireUniqueTextArray(
          item.memory_ids,
          itemPath +
            '.memory_ids',
        ),
    })
  }

  if (
    skippedDimensions.size > 0
  ) {
    sourceLimitations.push({
      analysis_event_id:
        analysisEventId,

      cycle_id:
        cycleId,

      reason:
        'seller_attribution_missing',

      skipped_dimensions:
        Array.from(
          skippedDimensions,
        ).sort(),
    })
  }

  return true
}

export function extractManagerialEvidence(
  args:
    ExtractManagerialEvidenceArgs,
): ManagerialEvidenceExtraction {
  const expectedCompanyId =
    requireText(
      args.expected_company_id,
      'expected_company_id',
      200,
    )

  const rawAnalysisEvents =
    requireArray(
      args.commercial_reading_events,
      'commercial_reading_events',
    )

  const rawActionEvents =
    requireArray(
      args.action_events,
      'action_events',
    )

  const rawCycleEvents =
    requireArray(
      args.cycle_events,
      'cycle_events',
    )

  const rawCycleSnapshots =
    requireArray(
      args.cycle_snapshots,
      'cycle_snapshots',
    )

  const semanticEvidence:
    ManagerialSemanticEvidence[] =
    []

  const commercialReadingCoverage:
    ManagerialCommercialReadingCoverage[] =
    []

  const actionFacts:
    ManagerialActionFact[] =
    []

  const cycleFacts:
    ManagerialCycleFact[] =
    []

  const cycleSnapshots:
    ManagerialCycleSnapshot[] =
    []

  const exclusions:
    ManagerialExcludedAnalysisEvent[] =
    []

  const sourceLimitations:
    ManagerialEvidenceSourceLimitation[] =
    []

  const analysisIds =
    new Set<string>()

  const actionIds =
    new Set<string>()

  const cycleEventIds =
    new Set<string>()

  const snapshotCycleIds =
    new Set<string>()

  const compatibleAnalysisIds:
    string[] =
    []

  const cycleIds =
    new Set<string>()

  const sellerIds =
    new Set<string>()

  const commercialReadingCycleIds =
    new Set<string>()

  const commercialReadingSellerIds =
    new Set<string>()

  let sellerAttributedReadingEvents =
    0

  rawAnalysisEvents.forEach(
    (raw, index) => {
      const record =
        requireRecord(
          raw,
          'commercial_reading_events[' +
            index +
            ']',
        )

      const compatible =
        extractCommercialReadingEvidence({
          record,
          expectedCompanyId,
          index,
          usedIds:
            analysisIds,
          cycleIds,
          sellerIds,
          commercialReadingCycleIds,
          commercialReadingSellerIds,
          compatibleAnalysisIds,
          commercialReadingCoverage,
          semanticEvidence,
          exclusions,
          sourceLimitations,
        })

      if (
        compatible &&
        record.seller_user_id !== null &&
        record.seller_user_id !==
          undefined
      ) {
        sellerAttributedReadingEvents +=
          1
      }
    },
  )

  rawActionEvents.forEach(
    (raw, index) => {
      const path =
        'action_events[' +
        index +
        ']'

      const record =
        requireRecord(
          raw,
          path,
        )

      requireCompany(
        record,
        expectedCompanyId,
        path,
      )

      const id =
        requireText(
          record.id,
          path + '.id',
          500,
        )

      ensureUniqueId(
        id,
        actionIds,
        path + '.id',
      )

      const cycleId =
        requireText(
          record.cycle_id,
          path + '.cycle_id',
          500,
        )

      const sellerUserId =
        requireText(
          record.seller_user_id,
          path + '.seller_user_id',
          500,
        )

      const actionType =
        requireText(
          record.action_type,
          path + '.action_type',
          200,
        )

      const occurredAt =
        requireDateTime(
          record.occurred_at,
          path + '.occurred_at',
        )

      cycleIds.add(
        cycleId,
      )

      sellerIds.add(
        sellerUserId,
      )

      actionFacts.push({
        source:
          'companion_action',

        action_event_id:
          id,

        cycle_id:
          cycleId,

        seller_user_id:
          sellerUserId,

        occurred_at:
          occurredAt,

        action_type:
          actionType,

        mapped_kind:
          mapActionKind(
            actionType,
          ),
      })
    },
  )

  rawCycleEvents.forEach(
    (raw, index) => {
      const path =
        'cycle_events[' +
        index +
        ']'

      const record =
        requireRecord(
          raw,
          path,
        )

      requireCompany(
        record,
        expectedCompanyId,
        path,
      )

      const id =
        requireText(
          record.id,
          path + '.id',
          500,
        )

      ensureUniqueId(
        id,
        cycleEventIds,
        path + '.id',
      )

      const cycleId =
        requireText(
          record.cycle_id,
          path + '.cycle_id',
          500,
        )

      const occurredAt =
        requireDateTime(
          record.occurred_at,
          path + '.occurred_at',
        )

      const metadata =
        isRecord(record.metadata)
          ? record.metadata
          : {}

      cycleIds.add(
        cycleId,
      )

      cycleFacts.push({
        source:
          'cycle_event',

        cycle_event_id:
          id,

        cycle_id:
          cycleId,

        actor_user_id:
          requireNullableText(
            record.created_by,
            path + '.created_by',
          ),

        occurred_at:
          occurredAt,

        event_type:
          requireText(
            record.event_type,
            path + '.event_type',
            200,
          ),

        from_status:
          readNestedText(
            metadata,
            [
              ['from_status'],
              ['payload', 'from_status'],
              ['checkpoint', 'from_status'],
              ['previous_status'],
              ['original_status'],
            ],
          ),

        to_status:
          readNestedText(
            metadata,
            [
              ['to_status'],
              ['payload', 'to_status'],
              ['checkpoint', 'to_status'],
              ['applied_status'],
              ['new_status'],
            ],
          ),

        action_channel:
          readNestedText(
            metadata,
            [
              ['action_channel'],
              ['payload', 'action_channel'],
              ['checkpoint', 'action_channel'],
              ['suggestion', 'action_channel'],
            ],
          ),

        action_result:
          readNestedText(
            metadata,
            [
              ['action_result'],
              ['payload', 'action_result'],
              ['checkpoint', 'action_result'],
              ['suggestion', 'action_result'],
            ],
          ),

        result_detail:
          readNestedText(
            metadata,
            [
              ['result_detail'],
              ['payload', 'result_detail'],
              ['checkpoint', 'result_detail'],
              ['suggestion', 'result_detail'],
            ],
          ),

        next_action:
          readNestedText(
            metadata,
            [
              ['next_action'],
              ['payload', 'next_action'],
              ['checkpoint', 'next_action'],
              ['new_next_action'],
            ],
          ),

        next_action_date:
          readNestedText(
            metadata,
            [
              ['next_action_date'],
              ['payload', 'next_action_date'],
              ['checkpoint', 'next_action_date'],
              ['new_next_action_date'],
            ],
          ),

        lost_reason:
          readNestedText(
            metadata,
            [
              ['lost_reason'],
              ['payload', 'lost_reason'],
              ['checkpoint', 'lost_reason'],
              ['suggestion', 'close_reason'],
            ],
          ),

        event_source:
          readNestedText(
            metadata,
            [
              ['source'],
              ['payload', 'source'],
            ],
          ),
      })
    },
  )

  rawCycleSnapshots.forEach(
    (raw, index) => {
      const path =
        'cycle_snapshots[' +
        index +
        ']'

      const record =
        requireRecord(
          raw,
          path,
        )

      requireCompany(
        record,
        expectedCompanyId,
        path,
      )

      const cycleId =
        requireText(
          record.id,
          path + '.id',
          500,
        )

      ensureUniqueId(
        cycleId,
        snapshotCycleIds,
        path + '.id',
      )

      const currentOwnerUserId =
        requireNullableText(
          record.owner_user_id,
          path + '.owner_user_id',
        )

      cycleIds.add(
        cycleId,
      )

      if (
        currentOwnerUserId !==
        null
      ) {
        sellerIds.add(
          currentOwnerUserId,
        )
      }

      cycleSnapshots.push({
        source:
          'sales_cycle_snapshot',

        cycle_id:
          cycleId,

        current_owner_user_id:
          currentOwnerUserId,

        status:
          requireText(
            record.status,
            path + '.status',
            200,
          ),

        next_action:
          requireNullableText(
            record.next_action,
            path + '.next_action',
          ),

        next_action_date:
          requireNullableText(
            record.next_action_date,
            path + '.next_action_date',
          ),

        updated_at:
          requireDateTime(
            record.updated_at,
            path + '.updated_at',
          ),
      })
    },
  )

  semanticEvidence.sort(
    (left, right) =>
      left.occurred_at.localeCompare(
        right.occurred_at,
      ) ||
      left.analysis_event_id.localeCompare(
        right.analysis_event_id,
      ) ||
      left.semantic_key.localeCompare(
        right.semantic_key,
      ),
  )

  commercialReadingCoverage.sort(
    (left, right) =>
      left.occurred_at.localeCompare(
        right.occurred_at,
      ) ||
      left.analysis_event_id.localeCompare(
        right.analysis_event_id,
      ),
  )

  actionFacts.sort(
    (left, right) =>
      left.occurred_at.localeCompare(
        right.occurred_at,
      ) ||
      left.action_event_id.localeCompare(
        right.action_event_id,
      ),
  )

  cycleFacts.sort(
    (left, right) =>
      left.occurred_at.localeCompare(
        right.occurred_at,
      ) ||
      left.cycle_event_id.localeCompare(
        right.cycle_event_id,
      ),
  )

  cycleSnapshots.sort(
    (left, right) =>
      left.updated_at.localeCompare(
        right.updated_at,
      ) ||
      left.cycle_id.localeCompare(
        right.cycle_id,
      ),
  )

  exclusions.sort(
    (left, right) =>
      left.analysis_event_id.localeCompare(
        right.analysis_event_id,
      ),
  )

  sourceLimitations.sort(
    (left, right) =>
      left.analysis_event_id.localeCompare(
        right.analysis_event_id,
      ),
  )

  return {
    company_id:
      expectedCompanyId,

    coverage: {
      analysis_events_received:
        rawAnalysisEvents.length,

      commercial_reading_events_compatible:
        compatibleAnalysisIds.length,

      commercial_reading_events_excluded:
        exclusions.length,

      seller_attributed_commercial_reading_events:
        sellerAttributedReadingEvents,

      action_events:
        actionFacts.length,

      cycle_events:
        cycleFacts.length,

      cycle_snapshots:
        cycleSnapshots.length,
    },

    commercial_reading_coverage:
      commercialReadingCoverage.map(
        item => ({
          ...item,

          analysis_limitations: [
            ...item.analysis_limitations,
          ],
        }),
      ),

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
      [...compatibleAnalysisIds]
        .sort(),

    action_event_ids:
      Array.from(
        actionIds,
      ).sort(),

    cycle_event_ids:
      Array.from(
        cycleEventIds,
      ).sort(),

    commercial_reading_cycle_ids:
      Array.from(
        commercialReadingCycleIds,
      ).sort(),

    commercial_reading_seller_user_ids:
      Array.from(
        commercialReadingSellerIds,
      ).sort(),

    cycle_ids:
      Array.from(
        cycleIds,
      ).sort(),

    seller_user_ids:
      Array.from(
        sellerIds,
      ).sort(),
  }
}
