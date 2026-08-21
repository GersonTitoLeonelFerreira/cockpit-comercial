import type {
  ManagerialActionFact,
  ManagerialCycleFact,
  ManagerialCycleSnapshot,
  ManagerialEvidenceExtraction,
  ManagerialEvidenceSourceLimitation,
  ManagerialExcludedAnalysisEvent,
  ManagerialSemanticEvidence,
  ManagerialSemanticEvidenceDimension,
} from './managerial-evidence-extractor'

import type {
  ManagerialIntelligenceSignalCategory,
  ManagerialIntelligenceSignalKind,
} from './managerial-intelligence-contract'

export type ManagerialSemanticOccurrence = {
  occurrence_key: string

  cycle_id: string

  semantic_key: string

  dimension:
    ManagerialSemanticEvidenceDimension

  category:
    ManagerialIntelligenceSignalCategory

  kind:
    ManagerialIntelligenceSignalKind

  seller_user_ids:
    string[]

  first_observed_at:
    string

  last_observed_at:
    string

  latest_analysis_event_id:
    string

  latest_summary:
    string

  latest_impact:
    string | null

  highest_risk_severity:
    'low' | 'medium' | 'high' | null

  observation_count:
    number

  analysis_event_ids:
    string[]

  limited_analysis_event_ids:
    string[]

  analysis_limitations:
    string[]

  evidence_message_ids:
    string[]

  memory_ids:
    string[]
}

export type ManagerialSemanticPatternCandidate = {
  semantic_key: string

  dimension:
    ManagerialSemanticEvidenceDimension

  category:
    ManagerialIntelligenceSignalCategory

  kind:
    ManagerialIntelligenceSignalKind

  occurrences:
    number

  observation_count:
    number

  affected_cycle_ids:
    string[]

  affected_seller_user_ids:
    string[]

  occurrence_keys:
    string[]

  analysis_event_ids:
    string[]

  limited_analysis_event_ids:
    string[]

  analysis_limitations:
    string[]

  first_observed_at:
    string

  last_observed_at:
    string

  latest_summary:
    string

  latest_impact:
    string | null

  highest_risk_severity:
    'low' | 'medium' | 'high' | null
}

export type ManagerialActionPatternCandidate = {
  kind:
    NonNullable<
      ManagerialActionFact['mapped_kind']
    >

  event_count:
    number

  cycle_count:
    number

  affected_cycle_ids:
    string[]

  affected_seller_user_ids:
    string[]

  action_event_ids:
    string[]

  first_observed_at:
    string

  last_observed_at:
    string
}

export type ManagerialCycleEvidenceRollup = {
  cycle_id: string

  semantic_occurrence_keys:
    string[]

  analysis_event_ids:
    string[]

  action_event_ids:
    string[]

  cycle_event_ids:
    string[]

  historical_seller_user_ids:
    string[]

  actor_user_ids:
    string[]

  first_evidence_at:
    string | null

  last_evidence_at:
    string | null

  current_snapshot:
    ManagerialCycleSnapshot | null
}

export type ManagerialEvidenceAggregation = {
  company_id: string

  source_coverage:
    ManagerialEvidenceExtraction['coverage']

  aggregation_coverage: {
    semantic_observations:
      number

    deduplicated_semantic_occurrences:
      number

    semantic_pattern_candidates:
      number

    mapped_action_events:
      number

    unmapped_action_events:
      number

    cycles_in_rollup:
      number
  }

  semantic_occurrences:
    ManagerialSemanticOccurrence[]

  semantic_patterns:
    ManagerialSemanticPatternCandidate[]

  action_patterns:
    ManagerialActionPatternCandidate[]

  cycle_rollups:
    ManagerialCycleEvidenceRollup[]

  action_facts:
    ManagerialActionFact[]

  cycle_facts:
    ManagerialCycleFact[]

  cycle_snapshots:
    ManagerialCycleSnapshot[]

  unmapped_action_event_ids:
    string[]

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

export class ManagerialEvidenceAggregatorError
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
      'ManagerialEvidenceAggregatorError'

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
  throw new ManagerialEvidenceAggregatorError(
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

function earliest(
  current: string | null,
  candidate: string,
): string {
  if (
    current === null ||
    candidate < current
  ) {
    return candidate
  }

  return current
}

function latest(
  current: string | null,
  candidate: string,
): string {
  if (
    current === null ||
    candidate > current
  ) {
    return candidate
  }

  return current
}

function riskSeverityRank(
  value:
    'low' | 'medium' | 'high' | null,
): number {
  if (value === 'high') {
    return 3
  }

  if (value === 'medium') {
    return 2
  }

  if (value === 'low') {
    return 1
  }

  return 0
}

function highestRiskSeverity(
  current:
    'low' | 'medium' | 'high' | null,

  candidate:
    'low' | 'medium' | 'high' | null,
) {
  return (
    riskSeverityRank(candidate) >
    riskSeverityRank(current)
  )
    ? candidate
    : current
}

function occurrenceMapKey(
  evidence:
    ManagerialSemanticEvidence,
): string {
  return JSON.stringify([
    evidence.cycle_id,
    evidence.semantic_key,
  ])
}

function occurrencePublicKey(
  cycleId: string,
  semanticKey: string,
): string {
  return (
    semanticKey +
    '@' +
    cycleId
  )
}

function ensureSameSemantics(
  current: {
    dimension:
      ManagerialSemanticEvidenceDimension

    category:
      ManagerialIntelligenceSignalCategory

    kind:
      ManagerialIntelligenceSignalKind
  },

  evidence:
    ManagerialSemanticEvidence,

  path: string,
): void {
  if (
    current.dimension !==
      evidence.dimension ||
    current.category !==
      evidence.category ||
    current.kind !==
      evidence.kind
  ) {
    fail(
      'SEMANTIC_KEY_CONFLICT',
      path,
      'A mesma semantic_key recebeu semânticas incompatíveis.',
    )
  }
}

function shouldReplaceLatest(
  currentTime: string,
  currentAnalysisEventId: string,
  evidence:
    ManagerialSemanticEvidence,
): boolean {
  if (
    evidence.occurred_at >
    currentTime
  ) {
    return true
  }

  if (
    evidence.occurred_at <
    currentTime
  ) {
    return false
  }

  return (
    evidence.analysis_event_id >
    currentAnalysisEventId
  )
}

function buildSemanticOccurrences(
  evidenceItems:
    ManagerialSemanticEvidence[],
): ManagerialSemanticOccurrence[] {
  const byOccurrence =
    new Map<
      string,
      ManagerialSemanticOccurrence
    >()

  evidenceItems.forEach(
    (evidence, index) => {
      const mapKey =
        occurrenceMapKey(
          evidence,
        )

      const existing =
        byOccurrence.get(
          mapKey,
        )

      if (!existing) {
        byOccurrence.set(
          mapKey,
          {
            occurrence_key:
              occurrencePublicKey(
                evidence.cycle_id,
                evidence.semantic_key,
              ),

            cycle_id:
              evidence.cycle_id,

            semantic_key:
              evidence.semantic_key,

            dimension:
              evidence.dimension,

            category:
              evidence.category,

            kind:
              evidence.kind,

            seller_user_ids:
              evidence.seller_user_id
                ? [
                    evidence
                      .seller_user_id,
                  ]
                : [],

            first_observed_at:
              evidence.occurred_at,

            last_observed_at:
              evidence.occurred_at,

            latest_analysis_event_id:
              evidence.analysis_event_id,

            latest_summary:
              evidence.summary,

            latest_impact:
              evidence.impact,

            highest_risk_severity:
              evidence.risk_severity,

            observation_count:
              1,

            analysis_event_ids: [
              evidence
                .analysis_event_id,
            ],

            limited_analysis_event_ids:
              evidence.analysis_status ===
              'limited'
                ? [
                    evidence
                      .analysis_event_id,
                  ]
                : [],

            analysis_limitations:
              [
                ...evidence
                  .analysis_limitations,
              ],

            evidence_message_ids:
              [
                ...evidence
                  .evidence_message_ids,
              ],

            memory_ids:
              [
                ...evidence
                  .memory_ids,
              ],
          },
        )

        return
      }

      ensureSameSemantics(
        existing,
        evidence,
        'semantic_evidence[' +
          index +
          ']',
      )

      const replaceLatest =
        shouldReplaceLatest(
          existing
            .last_observed_at,
          existing
            .latest_analysis_event_id,
          evidence,
        )

      existing.first_observed_at =
        earliest(
          existing
            .first_observed_at,
          evidence.occurred_at,
        )

      existing.last_observed_at =
        latest(
          existing
            .last_observed_at,
          evidence.occurred_at,
        )

      if (replaceLatest) {
        existing
          .latest_analysis_event_id =
          evidence.analysis_event_id

        existing.latest_summary =
          evidence.summary

        existing.latest_impact =
          evidence.impact
      }

      existing
        .highest_risk_severity =
        highestRiskSeverity(
          existing
            .highest_risk_severity,
          evidence
            .risk_severity,
        )

      existing.observation_count +=
        1

      existing
        .analysis_event_ids
        .push(
          evidence.analysis_event_id,
        )

      if (
        evidence.analysis_status ===
        'limited'
      ) {
        existing
          .limited_analysis_event_ids
          .push(
            evidence.analysis_event_id,
          )
      }

      existing
        .analysis_limitations
        .push(
          ...evidence
            .analysis_limitations,
        )

      existing
        .evidence_message_ids
        .push(
          ...evidence
            .evidence_message_ids,
        )

      existing
        .memory_ids
        .push(
          ...evidence.memory_ids,
        )

      if (
        evidence.seller_user_id
      ) {
        existing
          .seller_user_ids
          .push(
            evidence
              .seller_user_id,
          )
      }
    },
  )

  return Array.from(
    byOccurrence.values(),
  )
    .map(
      occurrence => ({
        ...occurrence,

        seller_user_ids:
          uniqueSorted(
            occurrence
              .seller_user_ids,
          ),

        analysis_event_ids:
          uniqueSorted(
            occurrence
              .analysis_event_ids,
          ),

        limited_analysis_event_ids:
          uniqueSorted(
            occurrence
              .limited_analysis_event_ids,
          ),

        analysis_limitations:
          uniqueSorted(
            occurrence
              .analysis_limitations,
          ),

        evidence_message_ids:
          uniqueSorted(
            occurrence
              .evidence_message_ids,
          ),

        memory_ids:
          uniqueSorted(
            occurrence
              .memory_ids,
          ),
      }),
    )
    .sort(
      (left, right) =>
        left.semantic_key
          .localeCompare(
            right.semantic_key,
          ) ||
        left.cycle_id
          .localeCompare(
            right.cycle_id,
          ),
    )
}

function buildSemanticPatterns(
  occurrences:
    ManagerialSemanticOccurrence[],
): ManagerialSemanticPatternCandidate[] {
  const patterns =
    new Map<
      string,
      ManagerialSemanticPatternCandidate
    >()

  for (
    const occurrence
    of occurrences
  ) {
    const existing =
      patterns.get(
        occurrence
          .semantic_key,
      )

    if (!existing) {
      patterns.set(
        occurrence.semantic_key,
        {
          semantic_key:
            occurrence
              .semantic_key,

          dimension:
            occurrence.dimension,

          category:
            occurrence.category,

          kind:
            occurrence.kind,

          occurrences:
            1,

          observation_count:
            occurrence
              .observation_count,

          affected_cycle_ids: [
            occurrence.cycle_id,
          ],

          affected_seller_user_ids:
            [
              ...occurrence
                .seller_user_ids,
            ],

          occurrence_keys: [
            occurrence
              .occurrence_key,
          ],

          analysis_event_ids: [
            ...occurrence
              .analysis_event_ids,
          ],

          limited_analysis_event_ids:
            [
              ...occurrence
                .limited_analysis_event_ids,
            ],

          analysis_limitations: [
            ...occurrence
              .analysis_limitations,
          ],

          first_observed_at:
            occurrence
              .first_observed_at,

          last_observed_at:
            occurrence
              .last_observed_at,

          latest_summary:
            occurrence
              .latest_summary,

          latest_impact:
            occurrence
              .latest_impact,

          highest_risk_severity:
            occurrence
              .highest_risk_severity,
        },
      )

      continue
    }

    if (
      existing.dimension !==
        occurrence.dimension ||
      existing.category !==
        occurrence.category ||
      existing.kind !==
        occurrence.kind
    ) {
      fail(
        'SEMANTIC_KEY_CONFLICT',
        'semantic_occurrences',
        'A mesma semantic_key recebeu semânticas incompatíveis.',
      )
    }

    const replaceLatest =
      (
        occurrence
          .last_observed_at >
        existing
          .last_observed_at
      ) ||
      (
        occurrence
          .last_observed_at ===
        existing
          .last_observed_at &&
        occurrence
          .latest_analysis_event_id >
        (
          existing
            .analysis_event_ids
            .slice()
            .sort()
            .at(-1) ??
          ''
        )
      )

    existing.occurrences +=
      1

    existing.observation_count +=
      occurrence
        .observation_count

    existing
      .affected_cycle_ids
      .push(
        occurrence.cycle_id,
      )

    existing
      .affected_seller_user_ids
      .push(
        ...occurrence
          .seller_user_ids,
      )

    existing
      .occurrence_keys
      .push(
        occurrence
          .occurrence_key,
      )

    existing
      .analysis_event_ids
      .push(
        ...occurrence
          .analysis_event_ids,
      )

    existing
      .limited_analysis_event_ids
      .push(
        ...occurrence
          .limited_analysis_event_ids,
      )

    existing
      .analysis_limitations
      .push(
        ...occurrence
          .analysis_limitations,
      )

    existing.first_observed_at =
      earliest(
        existing
          .first_observed_at,
        occurrence
          .first_observed_at,
      )

    existing.last_observed_at =
      latest(
        existing
          .last_observed_at,
        occurrence
          .last_observed_at,
      )

    if (replaceLatest) {
      existing.latest_summary =
        occurrence
          .latest_summary

      existing.latest_impact =
        occurrence
          .latest_impact
    }

    existing
      .highest_risk_severity =
      highestRiskSeverity(
        existing
          .highest_risk_severity,
        occurrence
          .highest_risk_severity,
      )
  }

  return Array.from(
    patterns.values(),
  )
    .map(
      pattern => ({
        ...pattern,

        occurrences:
          uniqueSorted(
            pattern
              .affected_cycle_ids,
          ).length,

        affected_cycle_ids:
          uniqueSorted(
            pattern
              .affected_cycle_ids,
          ),

        affected_seller_user_ids:
          uniqueSorted(
            pattern
              .affected_seller_user_ids,
          ),

        occurrence_keys:
          uniqueSorted(
            pattern
              .occurrence_keys,
          ),

        analysis_event_ids:
          uniqueSorted(
            pattern
              .analysis_event_ids,
          ),

        limited_analysis_event_ids:
          uniqueSorted(
            pattern
              .limited_analysis_event_ids,
          ),

        analysis_limitations:
          uniqueSorted(
            pattern
              .analysis_limitations,
          ),
      }),
    )
    .sort(
      (left, right) =>
        left.semantic_key
          .localeCompare(
            right.semantic_key,
          ),
    )
}

function buildActionPatterns(
  facts:
    ManagerialActionFact[],
): {
  patterns:
    ManagerialActionPatternCandidate[]

  unmappedActionEventIds:
    string[]
} {
  const byKind =
    new Map<
      NonNullable<
        ManagerialActionFact[
          'mapped_kind'
        ]
      >,
      ManagerialActionPatternCandidate
    >()

  const unmappedActionEventIds:
    string[] =
    []

  for (const fact of facts) {
    if (
      fact.mapped_kind ===
      null
    ) {
      unmappedActionEventIds.push(
        fact.action_event_id,
      )

      continue
    }

    const existing =
      byKind.get(
        fact.mapped_kind,
      )

    if (!existing) {
      byKind.set(
        fact.mapped_kind,
        {
          kind:
            fact.mapped_kind,

          event_count:
            1,

          cycle_count:
            1,

          affected_cycle_ids: [
            fact.cycle_id,
          ],

          affected_seller_user_ids:
            [
              fact
                .seller_user_id,
            ],

          action_event_ids: [
            fact
              .action_event_id,
          ],

          first_observed_at:
            fact.occurred_at,

          last_observed_at:
            fact.occurred_at,
        },
      )

      continue
    }

    existing.event_count +=
      1

    existing
      .affected_cycle_ids
      .push(
        fact.cycle_id,
      )

    existing
      .affected_seller_user_ids
      .push(
        fact.seller_user_id,
      )

    existing
      .action_event_ids
      .push(
        fact.action_event_id,
      )

    existing.first_observed_at =
      earliest(
        existing
          .first_observed_at,
        fact.occurred_at,
      )

    existing.last_observed_at =
      latest(
        existing
          .last_observed_at,
        fact.occurred_at,
      )
  }

  return {
    patterns:
      Array.from(
        byKind.values(),
      )
        .map(
          pattern => {
            const cycles =
              uniqueSorted(
                pattern
                  .affected_cycle_ids,
              )

            return {
              ...pattern,

              cycle_count:
                cycles.length,

              affected_cycle_ids:
                cycles,

              affected_seller_user_ids:
                uniqueSorted(
                  pattern
                    .affected_seller_user_ids,
                ),

              action_event_ids:
                uniqueSorted(
                  pattern
                    .action_event_ids,
                ),
            }
          },
        )
        .sort(
          (left, right) =>
            left.kind
              .localeCompare(
                right.kind,
              ),
        ),

    unmappedActionEventIds:
      uniqueSorted(
        unmappedActionEventIds,
      ),
  }
}

function createEmptyCycleRollup(
  cycleId: string,
): ManagerialCycleEvidenceRollup {
  return {
    cycle_id:
      cycleId,

    semantic_occurrence_keys:
      [],

    analysis_event_ids:
      [],

    action_event_ids:
      [],

    cycle_event_ids:
      [],

    historical_seller_user_ids:
      [],

    actor_user_ids:
      [],

    first_evidence_at:
      null,

    last_evidence_at:
      null,

    current_snapshot:
      null,
  }
}

function touchRollupTime(
  rollup:
    ManagerialCycleEvidenceRollup,

  occurredAt:
    string,
): void {
  rollup.first_evidence_at =
    earliest(
      rollup
        .first_evidence_at,
      occurredAt,
    )

  rollup.last_evidence_at =
    latest(
      rollup
        .last_evidence_at,
      occurredAt,
    )
}

function buildCycleRollups({
  cycleIds,
  occurrences,
  actionFacts,
  cycleFacts,
  snapshots,
}: {
  cycleIds:
    string[]

  occurrences:
    ManagerialSemanticOccurrence[]

  actionFacts:
    ManagerialActionFact[]

  cycleFacts:
    ManagerialCycleFact[]

  snapshots:
    ManagerialCycleSnapshot[]
}): ManagerialCycleEvidenceRollup[] {
  const rollups =
    new Map<
      string,
      ManagerialCycleEvidenceRollup
    >()

  const getRollup =
    (
      cycleId:
        string,
    ) => {
      let current =
        rollups.get(
          cycleId,
        )

      if (!current) {
        current =
          createEmptyCycleRollup(
            cycleId,
          )

        rollups.set(
          cycleId,
          current,
        )
      }

      return current
    }

  for (const cycleId of cycleIds) {
    getRollup(
      cycleId,
    )
  }

  for (
    const occurrence
    of occurrences
  ) {
    const rollup =
      getRollup(
        occurrence.cycle_id,
      )

    rollup
      .semantic_occurrence_keys
      .push(
        occurrence
          .occurrence_key,
      )

    rollup
      .analysis_event_ids
      .push(
        ...occurrence
          .analysis_event_ids,
      )

    rollup
      .historical_seller_user_ids
      .push(
        ...occurrence
          .seller_user_ids,
      )

    touchRollupTime(
      rollup,
      occurrence
        .first_observed_at,
    )

    touchRollupTime(
      rollup,
      occurrence
        .last_observed_at,
    )
  }

  for (
    const fact
    of actionFacts
  ) {
    const rollup =
      getRollup(
        fact.cycle_id,
      )

    rollup
      .action_event_ids
      .push(
        fact.action_event_id,
      )

    rollup
      .historical_seller_user_ids
      .push(
        fact.seller_user_id,
      )

    touchRollupTime(
      rollup,
      fact.occurred_at,
    )
  }

  for (
    const fact
    of cycleFacts
  ) {
    const rollup =
      getRollup(
        fact.cycle_id,
      )

    rollup
      .cycle_event_ids
      .push(
        fact.cycle_event_id,
      )

    if (
      fact.actor_user_id
    ) {
      rollup
        .actor_user_ids
        .push(
          fact.actor_user_id,
        )
    }

    touchRollupTime(
      rollup,
      fact.occurred_at,
    )
  }

  for (
    const snapshot
    of snapshots
  ) {
    const rollup =
      getRollup(
        snapshot.cycle_id,
      )

    if (
      rollup.current_snapshot !==
      null
    ) {
      fail(
        'DUPLICATE_CYCLE_SNAPSHOT',
        'cycle_snapshots',
        'Existe mais de um snapshot atual para o mesmo ciclo.',
      )
    }

    rollup.current_snapshot = {
      ...snapshot,
    }
  }

  return Array.from(
    rollups.values(),
  )
    .map(
      rollup => ({
        ...rollup,

        semantic_occurrence_keys:
          uniqueSorted(
            rollup
              .semantic_occurrence_keys,
          ),

        analysis_event_ids:
          uniqueSorted(
            rollup
              .analysis_event_ids,
          ),

        action_event_ids:
          uniqueSorted(
            rollup
              .action_event_ids,
          ),

        cycle_event_ids:
          uniqueSorted(
            rollup
              .cycle_event_ids,
          ),

        historical_seller_user_ids:
          uniqueSorted(
            rollup
              .historical_seller_user_ids,
          ),

        actor_user_ids:
          uniqueSorted(
            rollup
              .actor_user_ids,
          ),
      }),
    )
    .sort(
      (left, right) =>
        left.cycle_id
          .localeCompare(
            right.cycle_id,
          ),
    )
}

function cloneActionFact(
  fact:
    ManagerialActionFact,
): ManagerialActionFact {
  return {
    ...fact,
  }
}

function cloneCycleFact(
  fact:
    ManagerialCycleFact,
): ManagerialCycleFact {
  return {
    ...fact,
  }
}

function cloneSnapshot(
  snapshot:
    ManagerialCycleSnapshot,
): ManagerialCycleSnapshot {
  return {
    ...snapshot,
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

function cloneLimitation(
  item:
    ManagerialEvidenceSourceLimitation,
): ManagerialEvidenceSourceLimitation {
  return {
    ...item,

    skipped_dimensions: [
      ...item
        .skipped_dimensions,
    ],
  }
}

export function aggregateManagerialEvidence(
  extraction:
    ManagerialEvidenceExtraction,
): ManagerialEvidenceAggregation {
  if (
    !extraction.company_id ||
    !extraction.company_id.trim()
  ) {
    fail(
      'INVALID_COMPANY',
      'company_id',
      'company_id é obrigatório.',
    )
  }

  const semanticOccurrences =
    buildSemanticOccurrences(
      extraction
        .semantic_evidence,
    )

  const semanticPatterns =
    buildSemanticPatterns(
      semanticOccurrences,
    )

  const {
    patterns: actionPatterns,
    unmappedActionEventIds,
  } =
    buildActionPatterns(
      extraction.action_facts,
    )

  const cycleRollups =
    buildCycleRollups({
      cycleIds:
        extraction.cycle_ids,

      occurrences:
        semanticOccurrences,

      actionFacts:
        extraction.action_facts,

      cycleFacts:
        extraction.cycle_facts,

      snapshots:
        extraction
          .cycle_snapshots,
    })

  const mappedActionEvents =
    actionPatterns.reduce(
      (
        total,
        pattern,
      ) =>
        total +
        pattern.event_count,
      0,
    )

  return {
    company_id:
      extraction.company_id,

    source_coverage: {
      ...extraction.coverage,
    },

    aggregation_coverage: {
      semantic_observations:
        extraction
          .semantic_evidence
          .length,

      deduplicated_semantic_occurrences:
        semanticOccurrences
          .length,

      semantic_pattern_candidates:
        semanticPatterns
          .length,

      mapped_action_events:
        mappedActionEvents,

      unmapped_action_events:
        unmappedActionEventIds
          .length,

      cycles_in_rollup:
        cycleRollups.length,
    },

    semantic_occurrences:
      semanticOccurrences,

    semantic_patterns:
      semanticPatterns,

    action_patterns:
      actionPatterns,

    cycle_rollups:
      cycleRollups,

    action_facts:
      extraction
        .action_facts
        .map(
          cloneActionFact,
        ),

    cycle_facts:
      extraction
        .cycle_facts
        .map(
          cloneCycleFact,
        ),

    cycle_snapshots:
      extraction
        .cycle_snapshots
        .map(
          cloneSnapshot,
        ),

    unmapped_action_event_ids:
      unmappedActionEventIds,

    excluded_analysis_events:
      extraction
        .excluded_analysis_events
        .map(
          cloneExclusion,
        ),

    source_limitations:
      extraction
        .source_limitations
        .map(
          cloneLimitation,
        ),

    analysis_event_ids:
      uniqueSorted(
        extraction
          .analysis_event_ids,
      ),

    action_event_ids:
      uniqueSorted(
        extraction
          .action_event_ids,
      ),

    cycle_event_ids:
      uniqueSorted(
        extraction
          .cycle_event_ids,
      ),

    commercial_reading_cycle_ids:
      uniqueSorted(
        extraction
          .commercial_reading_cycle_ids,
      ),

    commercial_reading_seller_user_ids:
      uniqueSorted(
        extraction
          .commercial_reading_seller_user_ids,
      ),

    cycle_ids:
      uniqueSorted(
        extraction
          .cycle_ids,
      ),

    seller_user_ids:
      uniqueSorted(
        extraction
          .seller_user_ids,
      ),
  }
}
