import type {
  ManagerialActionPatternCandidate,
  ManagerialEvidenceAggregation,
  ManagerialSemanticPatternCandidate,
} from './managerial-evidence-aggregator'

import type {
  ManagerialIntelligenceRecurrence,
  ManagerialIntelligenceSignal,
  ManagerialIntelligenceSignalCategory,
  ManagerialIntelligenceSignalDirection,
  ManagerialIntelligenceSignalSeverity,
} from './managerial-intelligence-contract'

export type ManagerialSignalClassification = {
  company_id: string

  semantic_sample_size: number
  action_sample_size: number

  signals:
    ManagerialIntelligenceSignal[]
}

export class ManagerialSignalClassifierError
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
      'ManagerialSignalClassifierError'

    this.code = code
    this.path = path
  }
}

function fail(
  code: string,
  path: string,
  message: string,
): never {
  throw new ManagerialSignalClassifierError(
    code,
    path,
    message,
  )
}

function uniqueSorted(
  values: string[],
): string[] {
  return Array.from(
    new Set(values),
  ).sort()
}

function ensureKnownIds(
  values: string[],
  availableValues: string[],
  path: string,
): void {
  const available =
    new Set(availableValues)

  for (const value of values) {
    if (!available.has(value)) {
      fail(
        'UNKNOWN_REFERENCE',
        path,
        value +
          ' não está disponível no handoff A5.3.',
      )
    }
  }
}

function deriveRecurrence(
  occurrences: number,
  affectedSellerUserIds:
    string[],
): ManagerialIntelligenceRecurrence {
  if (occurrences === 1) {
    return 'isolated'
  }

  if (
    affectedSellerUserIds.length >=
    2
  ) {
    return 'systemic'
  }

  return 'repeated'
}

function directionForCategory(
  category:
    ManagerialIntelligenceSignalCategory,
): ManagerialIntelligenceSignalDirection {
  if (
    category ===
    'positive_pattern'
  ) {
    return 'positive'
  }

  if (
    category ===
    'ai_adoption'
  ) {
    return 'neutral'
  }

  return 'risk'
}

function severityForSemanticPattern(
  pattern:
    ManagerialSemanticPatternCandidate,
  recurrence:
    ManagerialIntelligenceRecurrence,
): ManagerialIntelligenceSignalSeverity {
  if (
    pattern.category ===
    'positive_pattern'
  ) {
    return 'informational'
  }

  const risk =
    pattern.highest_risk_severity

  if (risk === 'high') {
    return recurrence === 'isolated'
      ? 'attention'
      : 'critical'
  }

  if (risk === 'medium') {
    return 'attention'
  }

  if (
    recurrence === 'repeated' ||
    recurrence === 'systemic'
  ) {
    return 'attention'
  }

  return 'informational'
}

function semanticFallbackImpact(
  pattern:
    ManagerialSemanticPatternCandidate,
): string {
  if (
    pattern.category ===
    'positive_pattern'
  ) {
    return 'Padrão positivo comprovado nos ciclos cobertos pela leitura comercial.'
  }

  if (
    pattern.category ===
    'customer_pattern'
  ) {
    return 'O padrão do cliente pode influenciar a condução comercial e deve ser acompanhado no escopo analisado.'
  }

  if (
    pattern.category ===
    'method_execution'
  ) {
    return 'A recorrência pode reduzir a aderência ao método comercial configurado.'
  }

  return 'O padrão comprovado deve ser considerado na leitura gerencial do escopo analisado.'
}

function validateSemanticPattern(
  pattern:
    ManagerialSemanticPatternCandidate,
  aggregation:
    ManagerialEvidenceAggregation,
  index: number,
): void {
  const path =
    'semantic_patterns[' +
    index +
    ']'

  if (
    !Number.isSafeInteger(
      pattern.occurrences,
    ) ||
    pattern.occurrences < 1
  ) {
    fail(
      'INVALID_OCCURRENCES',
      path + '.occurrences',
      'Ocorrências precisam ser um inteiro positivo.',
    )
  }

  const cycles =
    uniqueSorted(
      pattern.affected_cycle_ids,
    )

  if (
    cycles.length !==
    pattern.occurrences
  ) {
    fail(
      'OCCURRENCE_CYCLE_MISMATCH',
      path,
      'Ocorrências precisam representar ciclos únicos afetados.',
    )
  }

  if (
    pattern.analysis_event_ids
      .length === 0
  ) {
    fail(
      'ANALYSIS_EVIDENCE_REQUIRED',
      path + '.analysis_event_ids',
      'Sinal semântico exige evidência A4 persistida.',
    )
  }

  ensureKnownIds(
    cycles,
    aggregation
      .commercial_reading_cycle_ids,
    path +
      '.affected_cycle_ids',
  )

  ensureKnownIds(
    pattern.analysis_event_ids,
    aggregation.analysis_event_ids,
    path +
      '.analysis_event_ids',
  )

  ensureKnownIds(
    pattern
      .affected_seller_user_ids,
    aggregation.seller_user_ids,
    path +
      '.affected_seller_user_ids',
  )
}

function buildSemanticSignal(
  pattern:
    ManagerialSemanticPatternCandidate,
  aggregation:
    ManagerialEvidenceAggregation,
  sampleSize: number,
  index: number,
): ManagerialIntelligenceSignal {
  validateSemanticPattern(
    pattern,
    aggregation,
    index,
  )

  if (sampleSize < 1) {
    fail(
      'SEMANTIC_SAMPLE_REQUIRED',
      'commercial_reading_cycle_ids',
      'Padrão semântico exige amostra A4 válida.',
    )
  }

  if (
    pattern.occurrences >
    sampleSize
  ) {
    fail(
      'OCCURRENCES_EXCEED_SAMPLE',
      'semantic_patterns[' +
        index +
        '].occurrences',
      'Ocorrências não podem exceder os ciclos cobertos por A4.',
    )
  }

  const sellers =
    uniqueSorted(
      pattern
        .affected_seller_user_ids,
    )

  const recurrence =
    deriveRecurrence(
      pattern.occurrences,
      sellers,
    )

  const signalKey =
    'semantic:' +
    pattern.semantic_key

  if (
    signalKey.length > 200
  ) {
    fail(
      'SIGNAL_KEY_TOO_LONG',
      'semantic_patterns[' +
        index +
        '].semantic_key',
      'A chave do sinal excede o limite contratual.',
    )
  }

  return {
    signal_key:
      signalKey,

    category:
      pattern.category,

    kind:
      pattern.kind,

    direction:
      directionForCategory(
        pattern.category,
      ),

    severity:
      severityForSemanticPattern(
        pattern,
        recurrence,
      ),

    recurrence,

    summary:
      pattern.latest_summary,

    impact:
      pattern.latest_impact ??
      semanticFallbackImpact(
        pattern,
      ),

    occurrences:
      pattern.occurrences,

    sample_size:
      sampleSize,

    affected_cycle_ids:
      uniqueSorted(
        pattern.affected_cycle_ids,
      ),

    affected_seller_user_ids:
      sellers,

    analysis_event_ids:
      uniqueSorted(
        pattern.analysis_event_ids,
      ),

    action_event_ids: [],

    cycle_event_ids: [],

    requires_human_review:
      true,
  }
}

function actionSummary(
  pattern:
    ManagerialActionPatternCandidate,
): string {
  if (
    pattern.kind ===
    'suggestion_ignored'
  ) {
    return 'Sugestões do Companion foram ignoradas nos ciclos observados.'
  }

  if (
    pattern.kind ===
    'suggestion_adoption'
  ) {
    return 'Sugestões do Companion foram adotadas nos ciclos observados.'
  }

  if (
    pattern.kind ===
    'crm_rejection'
  ) {
    return 'Sugestões de CRM do Companion foram rejeitadas nos ciclos observados.'
  }

  return 'Sugestões de Agenda do Companion foram rejeitadas nos ciclos observados.'
}

function validateActionPattern(
  pattern:
    ManagerialActionPatternCandidate,
  aggregation:
    ManagerialEvidenceAggregation,
  actionCycleIds: string[],
  index: number,
): void {
  const path =
    'action_patterns[' +
    index +
    ']'

  if (
    !Number.isSafeInteger(
      pattern.cycle_count,
    ) ||
    pattern.cycle_count < 1
  ) {
    fail(
      'INVALID_CYCLE_COUNT',
      path + '.cycle_count',
      'cycle_count precisa ser um inteiro positivo.',
    )
  }

  if (
    !Number.isSafeInteger(
      pattern.event_count,
    ) ||
    pattern.event_count < 1
  ) {
    fail(
      'INVALID_EVENT_COUNT',
      path + '.event_count',
      'event_count precisa ser um inteiro positivo.',
    )
  }

  const cycles =
    uniqueSorted(
      pattern.affected_cycle_ids,
    )

  if (
    cycles.length !==
    pattern.cycle_count
  ) {
    fail(
      'ACTION_CYCLE_MISMATCH',
      path,
      'cycle_count precisa representar ciclos únicos afetados.',
    )
  }

  if (
    pattern.action_event_ids
      .length !==
    pattern.event_count
  ) {
    fail(
      'ACTION_EVENT_COUNT_MISMATCH',
      path,
      'event_count precisa corresponder aos eventos de ação preservados.',
    )
  }

  ensureKnownIds(
    cycles,
    actionCycleIds,
    path +
      '.affected_cycle_ids',
  )

  ensureKnownIds(
    pattern.action_event_ids,
    aggregation.action_event_ids,
    path +
      '.action_event_ids',
  )

  ensureKnownIds(
    pattern
      .affected_seller_user_ids,
    aggregation.seller_user_ids,
    path +
      '.affected_seller_user_ids',
  )
}

function buildActionSignal(
  pattern:
    ManagerialActionPatternCandidate,
  aggregation:
    ManagerialEvidenceAggregation,
  actionCycleIds: string[],
  index: number,
): ManagerialIntelligenceSignal {
  validateActionPattern(
    pattern,
    aggregation,
    actionCycleIds,
    index,
  )

  const sampleSize =
    actionCycleIds.length

  if (
    pattern.cycle_count >
    sampleSize
  ) {
    fail(
      'OCCURRENCES_EXCEED_SAMPLE',
      'action_patterns[' +
        index +
        '].cycle_count',
      'Ciclos com a ação não podem exceder a amostra factual de telemetria.',
    )
  }

  const sellers =
    uniqueSorted(
      pattern
        .affected_seller_user_ids,
    )

  return {
    signal_key:
      'action:' +
      pattern.kind,

    category:
      'ai_adoption',

    kind:
      pattern.kind,

    direction:
      'neutral',

    severity:
      'informational',

    recurrence:
      deriveRecurrence(
        pattern.cycle_count,
        sellers,
      ),

    summary:
      actionSummary(
        pattern,
      ),

    impact:
      'Este dado mede uso da IA e, isoladamente, não avalia a qualidade do vendedor.',

    occurrences:
      pattern.cycle_count,

    sample_size:
      sampleSize,

    affected_cycle_ids:
      uniqueSorted(
        pattern.affected_cycle_ids,
      ),

    affected_seller_user_ids:
      sellers,

    analysis_event_ids: [],

    action_event_ids:
      uniqueSorted(
        pattern.action_event_ids,
      ),

    cycle_event_ids: [],

    requires_human_review:
      true,
  }
}

export function classifyManagerialSignals(
  aggregation:
    ManagerialEvidenceAggregation,
): ManagerialSignalClassification {
  const companyId =
    aggregation.company_id
      .trim()

  if (!companyId) {
    fail(
      'INVALID_COMPANY',
      'company_id',
      'company_id é obrigatório.',
    )
  }

  const semanticSampleSize =
    uniqueSorted(
      aggregation
        .commercial_reading_cycle_ids,
    ).length

  const actionCycleIds =
    uniqueSorted(
      aggregation
        .action_facts
        .map(
          fact =>
            fact.cycle_id,
        ),
    )

  const signals = [
    ...aggregation
      .semantic_patterns
      .map(
        (pattern, index) =>
          buildSemanticSignal(
            pattern,
            aggregation,
            semanticSampleSize,
            index,
          ),
      ),

    ...aggregation
      .action_patterns
      .map(
        (pattern, index) =>
          buildActionSignal(
            pattern,
            aggregation,
            actionCycleIds,
            index,
          ),
      ),
  ].sort(
    (left, right) =>
      left.signal_key
        .localeCompare(
          right.signal_key,
        ),
  )

  const signalKeys =
    signals.map(
      signal =>
        signal.signal_key,
    )

  if (
    new Set(signalKeys).size !==
    signalKeys.length
  ) {
    fail(
      'DUPLICATE_SIGNAL_KEY',
      'signals',
      'A classificação produziu chaves de sinal duplicadas.',
    )
  }

  return {
    company_id:
      companyId,

    semantic_sample_size:
      semanticSampleSize,

    action_sample_size:
      actionCycleIds.length,

    signals,
  }
}
