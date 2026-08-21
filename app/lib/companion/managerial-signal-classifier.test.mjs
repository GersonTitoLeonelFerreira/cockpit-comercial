import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ManagerialSignalClassifierError,
  classifyManagerialSignals,
} from './managerial-signal-classifier.ts'

function emptyAggregation() {
  return {
    company_id:
      'company-1',

    source_coverage: {
      analysis_events_received: 0,
      commercial_reading_events_compatible: 0,
      commercial_reading_events_excluded: 0,
      seller_attributed_commercial_reading_events: 0,
      action_events: 0,
      cycle_events: 0,
      cycle_snapshots: 0,
    },

    aggregation_coverage: {
      semantic_observations: 0,
      deduplicated_semantic_occurrences: 0,
      semantic_pattern_candidates: 0,
      mapped_action_events: 0,
      unmapped_action_events: 0,
      cycles_in_rollup: 0,
    },

    semantic_occurrences: [],
    semantic_patterns: [],
    action_patterns: [],
    cycle_rollups: [],
    action_facts: [],
    cycle_facts: [],
    cycle_snapshots: [],
    unmapped_action_event_ids: [],
    excluded_analysis_events: [],
    source_limitations: [],

    analysis_event_ids: [],
    action_event_ids: [],
    cycle_event_ids: [],
    commercial_reading_cycle_ids: [],
    commercial_reading_seller_user_ids: [],
    cycle_ids: [],
    seller_user_ids: [],
  }
}

function semanticPattern({
  semanticKey =
    'seller_improvement:insufficient_discovery',

  category =
    'seller_behavior',

  kind =
    'insufficient_discovery',

  dimension =
    'seller_improvement',

  occurrences =
    1,

  cycleIds =
    ['cycle-1'],

  sellerIds =
    ['seller-1'],

  analysisIds =
    ['analysis-1'],

  risk =
    null,

  summary =
    'Descoberta insuficiente.',

  impact =
    'Pode reduzir a qualidade da recomendação.',
} = {}) {
  return {
    semantic_key:
      semanticKey,

    dimension,
    category,
    kind,

    occurrences,

    observation_count:
      analysisIds.length,

    affected_cycle_ids:
      cycleIds,

    affected_seller_user_ids:
      sellerIds,

    occurrence_keys:
      cycleIds.map(
        cycleId =>
          semanticKey +
          '@' +
          cycleId,
      ),

    analysis_event_ids:
      analysisIds,

    limited_analysis_event_ids:
      [],

    analysis_limitations:
      [],

    first_observed_at:
      '2026-08-20T10:00:00-03:00',

    last_observed_at:
      '2026-08-20T11:00:00-03:00',

    latest_summary:
      summary,

    latest_impact:
      impact,

    highest_risk_severity:
      risk,
  }
}

function actionPattern({
  kind =
    'suggestion_ignored',

  eventCount =
    1,

  cycleCount =
    1,

  cycleIds =
    ['cycle-1'],

  sellerIds =
    ['seller-1'],

  actionIds =
    ['action-1'],
} = {}) {
  return {
    kind,

    event_count:
      eventCount,

    cycle_count:
      cycleCount,

    affected_cycle_ids:
      cycleIds,

    affected_seller_user_ids:
      sellerIds,

    action_event_ids:
      actionIds,

    first_observed_at:
      '2026-08-20T10:00:00-03:00',

    last_observed_at:
      '2026-08-20T11:00:00-03:00',
  }
}

function actionFact({
  id,
  cycleId,
  sellerId,
  mappedKind =
    'suggestion_ignored',
} = {}) {
  return {
    source:
      'companion_action',

    action_event_id:
      id,

    cycle_id:
      cycleId,

    seller_user_id:
      sellerId,

    occurred_at:
      '2026-08-20T10:00:00-03:00',

    action_type:
      mappedKind,

    mapped_kind:
      mappedKind,
  }
}

function clone(value) {
  return JSON.parse(
    JSON.stringify(value),
  )
}

test(
  'padrão isolado sem risco explícito permanece informativo',
  () => {
    const input =
      emptyAggregation()

    input.semantic_patterns = [
      semanticPattern(),
    ]

    input.commercial_reading_cycle_ids = [
      'cycle-1',
      'cycle-2',
      'cycle-3',
    ]

    input.analysis_event_ids = [
      'analysis-1',
    ]

    input.seller_user_ids = [
      'seller-1',
    ]

    const result =
      classifyManagerialSignals(
        input,
      )

    assert.equal(
      result.semantic_sample_size,
      3,
    )

    assert.equal(
      result.signals[0]
        .recurrence,
      'isolated',
    )

    assert.equal(
      result.signals[0]
        .severity,
      'informational',
    )

    assert.equal(
      result.signals[0]
        .direction,
      'risk',
    )

    assert.equal(
      result.signals[0]
        .sample_size,
      3,
    )
  },
)

test(
  'mesmo padrão em múltiplos ciclos do mesmo vendedor vira repeated',
  () => {
    const input =
      emptyAggregation()

    input.semantic_patterns = [
      semanticPattern({
        occurrences: 2,

        cycleIds: [
          'cycle-1',
          'cycle-2',
        ],

        analysisIds: [
          'analysis-1',
          'analysis-2',
        ],
      }),
    ]

    input.commercial_reading_cycle_ids = [
      'cycle-1',
      'cycle-2',
      'cycle-3',
    ]

    input.analysis_event_ids = [
      'analysis-1',
      'analysis-2',
    ]

    input.seller_user_ids = [
      'seller-1',
    ]

    const signal =
      classifyManagerialSignals(
        input,
      ).signals[0]

    assert.equal(
      signal.recurrence,
      'repeated',
    )

    assert.equal(
      signal.severity,
      'attention',
    )

    assert.equal(
      signal.occurrences,
      2,
    )

    assert.equal(
      signal.sample_size,
      3,
    )
  },
)

test(
  'padrão recorrente em mais de um vendedor vira systemic',
  () => {
    const input =
      emptyAggregation()

    input.semantic_patterns = [
      semanticPattern({
        occurrences: 2,

        cycleIds: [
          'cycle-1',
          'cycle-2',
        ],

        sellerIds: [
          'seller-1',
          'seller-2',
        ],

        analysisIds: [
          'analysis-1',
          'analysis-2',
        ],
      }),
    ]

    input.commercial_reading_cycle_ids = [
      'cycle-1',
      'cycle-2',
    ]

    input.analysis_event_ids = [
      'analysis-1',
      'analysis-2',
    ]

    input.seller_user_ids = [
      'seller-1',
      'seller-2',
    ]

    const signal =
      classifyManagerialSignals(
        input,
      ).signals[0]

    assert.equal(
      signal.recurrence,
      'systemic',
    )

    assert.equal(
      signal.severity,
      'attention',
    )
  },
)

test(
  'risco A4 alto isolado exige atenção mas não vira crítico sozinho',
  () => {
    const input =
      emptyAggregation()

    input.semantic_patterns = [
      semanticPattern({
        semanticKey:
          'service_risk:promise',

        category:
          'seller_behavior',

        kind:
          'recurring_service_risk',

        dimension:
          'service_risk',

        risk:
          'high',
      }),
    ]

    input.commercial_reading_cycle_ids = [
      'cycle-1',
    ]

    input.analysis_event_ids = [
      'analysis-1',
    ]

    input.seller_user_ids = [
      'seller-1',
    ]

    const signal =
      classifyManagerialSignals(
        input,
      ).signals[0]

    assert.equal(
      signal.recurrence,
      'isolated',
    )

    assert.equal(
      signal.severity,
      'attention',
    )
  },
)

test(
  'risco A4 alto recorrente pode formar sinal crítico',
  () => {
    const input =
      emptyAggregation()

    input.semantic_patterns = [
      semanticPattern({
        semanticKey:
          'service_risk:promise',

        category:
          'seller_behavior',

        kind:
          'recurring_service_risk',

        dimension:
          'service_risk',

        occurrences:
          2,

        cycleIds: [
          'cycle-1',
          'cycle-2',
        ],

        analysisIds: [
          'analysis-1',
          'analysis-2',
        ],

        risk:
          'high',
      }),
    ]

    input.commercial_reading_cycle_ids = [
      'cycle-1',
      'cycle-2',
    ]

    input.analysis_event_ids = [
      'analysis-1',
      'analysis-2',
    ]

    input.seller_user_ids = [
      'seller-1',
    ]

    const signal =
      classifyManagerialSignals(
        input,
      ).signals[0]

    assert.equal(
      signal.recurrence,
      'repeated',
    )

    assert.equal(
      signal.severity,
      'critical',
    )
  },
)

test(
  'padrão positivo permanece positivo e informativo mesmo quando sistêmico',
  () => {
    const input =
      emptyAggregation()

    input.semantic_patterns = [
      semanticPattern({
        semanticKey:
          'seller_strength:good_discovery',

        category:
          'positive_pattern',

        kind:
          'seller_strength_pattern',

        dimension:
          'seller_strength',

        occurrences:
          2,

        cycleIds: [
          'cycle-1',
          'cycle-2',
        ],

        sellerIds: [
          'seller-1',
          'seller-2',
        ],

        analysisIds: [
          'analysis-1',
          'analysis-2',
        ],

        impact:
          null,
      }),
    ]

    input.commercial_reading_cycle_ids = [
      'cycle-1',
      'cycle-2',
    ]

    input.analysis_event_ids = [
      'analysis-1',
      'analysis-2',
    ]

    input.seller_user_ids = [
      'seller-1',
      'seller-2',
    ]

    const signal =
      classifyManagerialSignals(
        input,
      ).signals[0]

    assert.equal(
      signal.direction,
      'positive',
    )

    assert.equal(
      signal.severity,
      'informational',
    )

    assert.equal(
      signal.recurrence,
      'systemic',
    )
  },
)

test(
  'telemetria permanece neutra e informativa e usa ciclos em vez de volume bruto',
  () => {
    const input =
      emptyAggregation()

    input.action_patterns = [
      actionPattern({
        eventCount: 3,
        cycleCount: 2,

        cycleIds: [
          'cycle-1',
          'cycle-2',
        ],

        sellerIds: [
          'seller-1',
          'seller-2',
        ],

        actionIds: [
          'action-1',
          'action-2',
          'action-3',
        ],
      }),
    ]

    input.action_facts = [
      actionFact({
        id: 'action-1',
        cycleId: 'cycle-1',
        sellerId: 'seller-1',
      }),

      actionFact({
        id: 'action-2',
        cycleId: 'cycle-1',
        sellerId: 'seller-1',
      }),

      actionFact({
        id: 'action-3',
        cycleId: 'cycle-2',
        sellerId: 'seller-2',
      }),

      actionFact({
        id: 'action-4',
        cycleId: 'cycle-3',
        sellerId: 'seller-3',
      }),
    ]

    input.action_event_ids = [
      'action-1',
      'action-2',
      'action-3',
      'action-4',
    ]

    input.seller_user_ids = [
      'seller-1',
      'seller-2',
      'seller-3',
    ]

    const result =
      classifyManagerialSignals(
        input,
      )

    const signal =
      result.signals[0]

    assert.equal(
      result.action_sample_size,
      3,
    )

    assert.equal(
      signal.occurrences,
      2,
    )

    assert.equal(
      signal.sample_size,
      3,
    )

    assert.equal(
      signal.recurrence,
      'systemic',
    )

    assert.equal(
      signal.direction,
      'neutral',
    )

    assert.equal(
      signal.severity,
      'informational',
    )
  },
)

test(
  'sample semântico inclui ciclos A4 sem o padrão observado',
  () => {
    const input =
      emptyAggregation()

    input.semantic_patterns = [
      semanticPattern(),
    ]

    input.commercial_reading_cycle_ids = [
      'cycle-1',
      'cycle-2',
      'cycle-3',
      'cycle-4',
    ]

    input.analysis_event_ids = [
      'analysis-1',
    ]

    input.seller_user_ids = [
      'seller-1',
    ]

    const signal =
      classifyManagerialSignals(
        input,
      ).signals[0]

    assert.equal(
      signal.occurrences,
      1,
    )

    assert.equal(
      signal.sample_size,
      4,
    )
  },
)

test(
  'reanálises ficam na proveniência sem aumentar occurrences nem sample_size',
  () => {
    const input =
      emptyAggregation()

    input.semantic_patterns = [
      semanticPattern({
        occurrences:
          1,

        cycleIds: [
          'cycle-1',
        ],

        analysisIds: [
          'analysis-1',
          'analysis-2',
          'analysis-3',
        ],
      }),
    ]

    input.commercial_reading_cycle_ids = [
      'cycle-1',
    ]

    input.analysis_event_ids = [
      'analysis-1',
      'analysis-2',
      'analysis-3',
    ]

    input.seller_user_ids = [
      'seller-1',
    ]

    const signal =
      classifyManagerialSignals(
        input,
      ).signals[0]

    assert.equal(
      signal.occurrences,
      1,
    )

    assert.equal(
      signal.sample_size,
      1,
    )

    assert.equal(
      signal
        .analysis_event_ids
        .length,
      3,
    )
  },
)

test(
  'sem padrões comprovados não inventa sinais',
  () => {
    const result =
      classifyManagerialSignals(
        emptyAggregation(),
      )

    assert.deepEqual(
      result.signals,
      [],
    )

    assert.equal(
      result.semantic_sample_size,
      0,
    )

    assert.equal(
      result.action_sample_size,
      0,
    )
  },
)

test(
  'falha fechado quando ocorrências semânticas excedem a amostra A4',
  () => {
    const input =
      emptyAggregation()

    input.semantic_patterns = [
      semanticPattern({
        occurrences: 2,

        cycleIds: [
          'cycle-1',
          'cycle-2',
        ],

        analysisIds: [
          'analysis-1',
          'analysis-2',
        ],
      }),
    ]

    input.commercial_reading_cycle_ids = [
      'cycle-1',
    ]

    input.analysis_event_ids = [
      'analysis-1',
      'analysis-2',
    ]

    input.seller_user_ids = [
      'seller-1',
    ]

    assert.throws(
      () =>
        classifyManagerialSignals(
          input,
        ),

      error =>
        error instanceof
          ManagerialSignalClassifierError &&
        error.code ===
          'UNKNOWN_REFERENCE',
    )
  },
)

test(
  'classificação é determinística e não modifica o handoff A5.3',
  () => {
    const input =
      emptyAggregation()

    input.semantic_patterns = [
      semanticPattern(),
    ]

    input.commercial_reading_cycle_ids = [
      'cycle-2',
      'cycle-1',
    ]

    input.analysis_event_ids = [
      'analysis-1',
    ]

    input.seller_user_ids = [
      'seller-1',
    ]

    const before =
      clone(input)

    const first =
      classifyManagerialSignals(
        input,
      )

    const second =
      classifyManagerialSignals(
        input,
      )

    assert.deepEqual(
      input,
      before,
    )

    assert.deepEqual(
      first,
      second,
    )

    assert.equal(
      JSON.stringify(first)
        .includes('undefined'),
      false,
    )
  },
)
