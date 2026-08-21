import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ManagerialEvidenceAggregatorError,
  aggregateManagerialEvidence,
} from './managerial-evidence-aggregator.ts'

function emptyExtraction() {
  return {
    company_id:
      'company-1',

    coverage: {
      analysis_events_received:
        0,

      commercial_reading_events_compatible:
        0,

      commercial_reading_events_excluded:
        0,

      seller_attributed_commercial_reading_events:
        0,

      action_events:
        0,

      cycle_events:
        0,

      cycle_snapshots:
        0,
    },

    commercial_reading_coverage: [],
    semantic_evidence: [],
    action_facts: [],
    cycle_facts: [],
    cycle_snapshots: [],
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

function semanticEvidence({
  analysisEventId =
    'analysis-1',

  cycleId =
    'cycle-1',

  sellerUserId =
    'seller-1',

  occurredAt =
    '2026-08-20T15:00:00-03:00',

  semanticKey =
    'seller_improvement:insufficient_discovery',

  dimension =
    'seller_improvement',

  category =
    'seller_behavior',

  kind =
    'insufficient_discovery',

  summary =
    'Descoberta insuficiente.',

  impact =
    'Pode reduzir a qualidade da recomendação.',

  severity =
    null,

  analysisStatus =
    'complete',

  limitations =
    [],
} = {}) {
  return {
    source:
      'commercial_reading',

    analysis_event_id:
      analysisEventId,

    cycle_id:
      cycleId,

    seller_user_id:
      sellerUserId,

    occurred_at:
      occurredAt,

    analysis_status:
      analysisStatus,

    analysis_limitations:
      limitations,

    dimension,

    semantic_key:
      semanticKey,

    category,

    kind,

    summary,

    impact,

    risk_severity:
      severity,

    evidence_message_ids: [
      'message-' +
        analysisEventId,
    ],

    memory_ids: [],
  }
}

function actionFact({
  id =
    'action-1',

  cycleId =
    'cycle-1',

  sellerUserId =
    'seller-1',

  occurredAt =
    '2026-08-20T15:00:00-03:00',

  actionType =
    'suggestion_ignored',

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
      sellerUserId,

    occurred_at:
      occurredAt,

    action_type:
      actionType,

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
  'cinco reanálises do mesmo padrão no mesmo ciclo viram uma ocorrência',
  () => {
    const extraction =
      emptyExtraction()

    extraction.cycle_ids = [
      'cycle-1',
    ]

    extraction.semantic_evidence =
      Array.from(
        { length: 5 },
        (_, index) =>
          semanticEvidence({
            analysisEventId:
              'analysis-' +
              (index + 1),

            occurredAt:
              '2026-08-20T1' +
              index +
              ':00:00-03:00',
          }),
      )

    const result =
      aggregateManagerialEvidence(
        extraction,
      )

    assert.equal(
      result
        .semantic_occurrences
        .length,
      1,
    )

    assert.equal(
      result
        .semantic_occurrences[0]
        .observation_count,
      5,
    )

    assert.equal(
      result
        .semantic_patterns[0]
        .occurrences,
      1,
    )

    assert.equal(
      result
        .semantic_patterns[0]
        .observation_count,
      5,
    )

    assert.equal(
      result
        .semantic_patterns[0]
        .analysis_event_ids
        .length,
      5,
    )
  },
)

test(
  'o mesmo padrão em dois ciclos distintos representa duas ocorrências',
  () => {
    const extraction =
      emptyExtraction()

    extraction.cycle_ids = [
      'cycle-1',
      'cycle-2',
    ]

    extraction.semantic_evidence = [
      semanticEvidence({
        analysisEventId:
          'analysis-1',

        cycleId:
          'cycle-1',
      }),

      semanticEvidence({
        analysisEventId:
          'analysis-2',

        cycleId:
          'cycle-2',
      }),
    ]

    const result =
      aggregateManagerialEvidence(
        extraction,
      )

    assert.equal(
      result
        .semantic_occurrences
        .length,
      2,
    )

    assert.equal(
      result
        .semantic_patterns[0]
        .occurrences,
      2,
    )

    assert.deepEqual(
      result
        .semantic_patterns[0]
        .affected_cycle_ids,
      [
        'cycle-1',
        'cycle-2',
      ],
    )
  },
)

test(
  'padrões diferentes dentro do mesmo ciclo permanecem ocorrências diferentes',
  () => {
    const extraction =
      emptyExtraction()

    extraction.cycle_ids = [
      'cycle-1',
    ]

    extraction.semantic_evidence = [
      semanticEvidence(),

      semanticEvidence({
        analysisEventId:
          'analysis-2',

        semanticKey:
          'seller_improvement:premature_price',

        kind:
          'premature_price',

        summary:
          'Preço apresentado cedo demais.',
      }),
    ]

    const result =
      aggregateManagerialEvidence(
        extraction,
      )

    assert.equal(
      result
        .semantic_occurrences
        .length,
      2,
    )

    assert.equal(
      result
        .semantic_patterns
        .length,
      2,
    )
  },
)

test(
  'redistribuição preserva os vendedores históricos sem multiplicar a ocorrência do ciclo',
  () => {
    const extraction =
      emptyExtraction()

    extraction.cycle_ids = [
      'cycle-1',
    ]

    extraction.semantic_evidence = [
      semanticEvidence({
        analysisEventId:
          'analysis-before',

        sellerUserId:
          'seller-a',
      }),

      semanticEvidence({
        analysisEventId:
          'analysis-after',

        sellerUserId:
          'seller-b',

        occurredAt:
          '2026-08-20T16:00:00-03:00',
      }),
    ]

    const result =
      aggregateManagerialEvidence(
        extraction,
      )

    assert.equal(
      result
        .semantic_occurrences
        .length,
      1,
    )

    assert.deepEqual(
      result
        .semantic_occurrences[0]
        .seller_user_ids,
      [
        'seller-a',
        'seller-b',
      ],
    )

    assert.equal(
      result
        .semantic_patterns[0]
        .occurrences,
      1,
    )
  },
)

test(
  'leitura limitada mantém limitações e IDs que comprovam a restrição',
  () => {
    const extraction =
      emptyExtraction()

    extraction.cycle_ids = [
      'cycle-1',
    ]

    extraction.semantic_evidence = [
      semanticEvidence(),

      semanticEvidence({
        analysisEventId:
          'analysis-limited',

        occurredAt:
          '2026-08-20T16:00:00-03:00',

        analysisStatus:
          'limited',

        limitations: [
          'audio_without_transcription',
        ],
      }),
    ]

    const result =
      aggregateManagerialEvidence(
        extraction,
      )

    assert.deepEqual(
      result
        .semantic_occurrences[0]
        .limited_analysis_event_ids,
      [
        'analysis-limited',
      ],
    )

    assert.deepEqual(
      result
        .semantic_occurrences[0]
        .analysis_limitations,
      [
        'audio_without_transcription',
      ],
    )
  },
)

test(
  'risco agregado preserva a maior severidade comprovada sem criar prioridade gerencial',
  () => {
    const extraction =
      emptyExtraction()

    extraction.cycle_ids = [
      'cycle-1',
    ]

    extraction.semantic_evidence = [
      semanticEvidence({
        analysisEventId:
          'analysis-low',

        semanticKey:
          'service_risk:promise',

        dimension:
          'service_risk',

        category:
          'seller_behavior',

        kind:
          'recurring_service_risk',

        severity:
          'low',
      }),

      semanticEvidence({
        analysisEventId:
          'analysis-high',

        occurredAt:
          '2026-08-20T16:00:00-03:00',

        semanticKey:
          'service_risk:promise',

        dimension:
          'service_risk',

        category:
          'seller_behavior',

        kind:
          'recurring_service_risk',

        severity:
          'high',
      }),
    ]

    const result =
      aggregateManagerialEvidence(
        extraction,
      )

    assert.equal(
      result
        .semantic_occurrences[0]
        .highest_risk_severity,
      'high',
    )

    assert.equal(
      Object.prototype
        .hasOwnProperty.call(
          result
            .semantic_patterns[0],
          'priority',
        ),
      false,
    )

    assert.equal(
      Object.prototype
        .hasOwnProperty.call(
          result
            .semantic_patterns[0],
          'recurrence',
        ),
      false,
    )
  },
)

test(
  'telemetria agrega eventos e ciclos separadamente sem transformar uso em julgamento',
  () => {
    const extraction =
      emptyExtraction()

    extraction.cycle_ids = [
      'cycle-1',
      'cycle-2',
    ]

    extraction.action_facts = [
      actionFact({
        id:
          'action-1',

        cycleId:
          'cycle-1',

        actionType:
          'suggestion_copied',

        mappedKind:
          'suggestion_adoption',
      }),

      actionFact({
        id:
          'action-2',

        cycleId:
          'cycle-1',

        actionType:
          'suggestion_sent',

        mappedKind:
          'suggestion_adoption',
      }),

      actionFact({
        id:
          'action-3',

        cycleId:
          'cycle-2',

        actionType:
          'suggestion_inserted',

        mappedKind:
          'suggestion_adoption',
      }),
    ]

    const result =
      aggregateManagerialEvidence(
        extraction,
      )

    assert.equal(
      result.action_patterns[0]
        .event_count,
      3,
    )

    assert.equal(
      result.action_patterns[0]
        .cycle_count,
      2,
    )

    assert.equal(
      Object.prototype
        .hasOwnProperty.call(
          result.action_patterns[0],
          'severity',
        ),
      false,
    )
  },
)

test(
  'ação sem mapeamento gerencial permanece preservada e não é inventada como sinal',
  () => {
    const extraction =
      emptyExtraction()

    extraction.cycle_ids = [
      'cycle-1',
    ]

    extraction.action_facts = [
      actionFact({
        id:
          'action-shown',

        actionType:
          'suggestion_shown',

        mappedKind:
          null,
      }),
    ]

    const result =
      aggregateManagerialEvidence(
        extraction,
      )

    assert.deepEqual(
      result
        .unmapped_action_event_ids,
      [
        'action-shown',
      ],
    )

    assert.equal(
      result.action_patterns.length,
      0,
    )

    assert.equal(
      result.action_facts.length,
      1,
    )
  },
)

test(
  'rollup do ciclo mantém ator operacional separado de vendedor histórico',
  () => {
    const extraction =
      emptyExtraction()

    extraction.cycle_ids = [
      'cycle-1',
    ]

    extraction.semantic_evidence = [
      semanticEvidence({
        sellerUserId:
          'seller-history',
      }),
    ]

    extraction.cycle_facts = [
      {
        source:
          'cycle_event',

        cycle_event_id:
          'cycle-event-1',

        cycle_id:
          'cycle-1',

        actor_user_id:
          'manager-1',

        occurred_at:
          '2026-08-20T16:00:00-03:00',

        event_type:
          'stage_changed',

        from_status:
          'respondeu',

        to_status:
          'negociacao',

        action_channel:
          null,

        action_result:
          null,

        result_detail:
          null,

        next_action:
          null,

        next_action_date:
          null,

        lost_reason:
          null,

        event_source:
          null,
      },
    ]

    extraction.cycle_snapshots = [
      {
        source:
          'sales_cycle_snapshot',

        cycle_id:
          'cycle-1',

        current_owner_user_id:
          'seller-current',

        status:
          'negociacao',

        next_action:
          null,

        next_action_date:
          null,

        updated_at:
          '2026-08-20T17:00:00-03:00',
      },
    ]

    const result =
      aggregateManagerialEvidence(
        extraction,
      )

    assert.deepEqual(
      result.cycle_rollups[0]
        .historical_seller_user_ids,
      [
        'seller-history',
      ],
    )

    assert.deepEqual(
      result.cycle_rollups[0]
        .actor_user_ids,
      [
        'manager-1',
      ],
    )

    assert.equal(
      result.cycle_rollups[0]
        .current_snapshot
        .current_owner_user_id,
      'seller-current',
    )
  },
)

test(
  'semantic_key conflitante falha fechado em vez de combinar evidências incompatíveis',
  () => {
    const extraction =
      emptyExtraction()

    extraction.cycle_ids = [
      'cycle-1',
    ]

    extraction.semantic_evidence = [
      semanticEvidence(),

      semanticEvidence({
        analysisEventId:
          'analysis-conflict',

        category:
          'customer_pattern',

        kind:
          'recurring_objection',
      }),
    ]

    assert.throws(
      () =>
        aggregateManagerialEvidence(
          extraction,
        ),
      error => {
        assert.ok(
          error instanceof
            ManagerialEvidenceAggregatorError,
        )

        assert.equal(
          error.code,
          'SEMANTIC_KEY_CONFLICT',
        )

        return true
      },
    )
  },
)

test(
  'agregação é determinística e não modifica a extração de origem',
  () => {
    const extraction =
      emptyExtraction()

    extraction.cycle_ids = [
      'cycle-2',
      'cycle-1',
    ]

    extraction.semantic_evidence = [
      semanticEvidence({
        analysisEventId:
          'analysis-2',

        cycleId:
          'cycle-2',

        occurredAt:
          '2026-08-20T16:00:00-03:00',
      }),

      semanticEvidence({
        analysisEventId:
          'analysis-1',

        cycleId:
          'cycle-1',
      }),
    ]

    extraction.action_facts = [
      actionFact({
        id:
          'action-2',

        cycleId:
          'cycle-2',
      }),

      actionFact({
        id:
          'action-1',

        cycleId:
          'cycle-1',
      }),
    ]

    const before =
      clone(extraction)

    const first =
      aggregateManagerialEvidence(
        extraction,
      )

    const second =
      aggregateManagerialEvidence(
        extraction,
      )

    assert.deepEqual(
      extraction,
      before,
    )

    assert.deepEqual(
      first,
      second,
    )

    assert.deepEqual(
      first.cycle_rollups.map(
        item =>
          item.cycle_id,
      ),
      [
        'cycle-1',
        'cycle-2',
      ],
    )
  },
)
