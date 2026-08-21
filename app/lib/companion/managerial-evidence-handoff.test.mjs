import assert from 'node:assert/strict'
import test from 'node:test'

import {
  extractManagerialEvidence,
} from './managerial-evidence-extractor.ts'

import {
  aggregateManagerialEvidence,
} from './managerial-evidence-aggregator.ts'

function buildReading({
  status =
    'complete',

  limitations =
    [],
} = {}) {
  return {
    contract_version:
      'commercial-reading-v1',

    analysis_status:
      status,

    analysis_limitations:
      limitations,

    seller_strengths: [
      {
        kind:
          'good_discovery',

        summary:
          'O vendedor investigou a necessidade antes de recomendar.',

        evidence_message_ids: [
          'message-strength',
        ],

        memory_ids: [],
      },
    ],

    improvement_points: [
      {
        kind:
          'insufficient_discovery',

        summary:
          'A descoberta ficou incompleta.',

        impact:
          'A recomendação pode ocorrer sem critérios suficientes.',

        evidence_message_ids: [
          'message-improvement',
        ],

        memory_ids: [],
      },

      {
        kind:
          'method_misapplication',

        summary:
          'O método foi aplicado fora do contexto adequado.',

        impact:
          'A condução pode perder aderência ao método.',

        evidence_message_ids: [
          'message-method',
        ],

        memory_ids: [],
      },
    ],

    risks: {
      customer_objections: [
        {
          kind:
            'price_resistance',

          severity:
            'medium',

          summary:
            'O cliente demonstrou resistência ao preço.',

          evidence_message_ids: [
            'message-objection',
          ],

          memory_ids: [],
        },
      ],

      service_risks: [
        {
          kind:
            'promise_without_confirmation',

          severity:
            'high',

          summary:
            'Existe risco de promessa sem confirmação oficial.',

          evidence_message_ids: [
            'message-service-risk',
          ],

          memory_ids: [],
        },
      ],
    },
  }
}

function analysisEvent({
  id =
    'analysis-1',

  cycleId =
    'cycle-1',

  sellerUserId =
    'seller-1',

  generatedAt =
    '2026-08-20T15:00:00-03:00',

  reading =
    buildReading(),
} = {}) {
  return {
    id,

    company_id:
      'company-1',

    cycle_id:
      cycleId,

    seller_user_id:
      sellerUserId,

    generated_at:
      generatedAt,

    normalized_output: {
      communication: {
        commercial_reading:
          reading,
      },
    },
  }
}

function actionEvent({
  id =
    'action-1',

  cycleId =
    'cycle-1',

  sellerUserId =
    'seller-1',

  actionType =
    'suggestion_ignored',

  occurredAt =
    '2026-08-20T15:00:00-03:00',
} = {}) {
  return {
    id,

    company_id:
      'company-1',

    cycle_id:
      cycleId,

    seller_user_id:
      sellerUserId,

    action_type:
      actionType,

    occurred_at:
      occurredAt,
  }
}

function cycleEvent({
  id =
    'cycle-event-1',

  cycleId =
    'cycle-1',

  actorUserId =
    'manager-1',

  occurredAt =
    '2026-08-20T16:00:00-03:00',
} = {}) {
  return {
    id,

    company_id:
      'company-1',

    cycle_id:
      cycleId,

    created_by:
      actorUserId,

    event_type:
      'stage_changed',

    occurred_at:
      occurredAt,

    metadata: {
      payload: {
        from_status:
          'respondeu',

        to_status:
          'negociacao',

        next_action:
          'Retornar amanhã',

        conversation_text:
          'texto que não deve atravessar o handoff',
      },
    },
  }
}

function cycleSnapshot({
  cycleId =
    'cycle-1',

  ownerUserId =
    'seller-current',
} = {}) {
  return {
    id:
      cycleId,

    company_id:
      'company-1',

    owner_user_id:
      ownerUserId,

    status:
      'negociacao',

    next_action:
      'Retornar amanhã',

    next_action_date:
      '2026-08-22',

    updated_at:
      '2026-08-20T17:00:00-03:00',
  }
}

function emptyInput() {
  return {
    expected_company_id:
      'company-1',

    commercial_reading_events:
      [],

    action_events:
      [],

    cycle_events:
      [],

    cycle_snapshots:
      [],
  }
}

function runHandoff(input) {
  return aggregateManagerialEvidence(
    extractManagerialEvidence(
      input,
    ),
  )
}

function clone(value) {
  return JSON.parse(
    JSON.stringify(value),
  )
}

test(
  'handoff ponta a ponta deduplica reanálises sem perder a proveniência A4',
  () => {
    const result =
      runHandoff({
        ...emptyInput(),

        commercial_reading_events: [
          analysisEvent({
            id:
              'analysis-1',

            generatedAt:
              '2026-08-20T15:00:00-03:00',
          }),

          analysisEvent({
            id:
              'analysis-2',

            generatedAt:
              '2026-08-20T16:00:00-03:00',
          }),
        ],
      })

    const discovery =
      result.semantic_patterns.find(
        item =>
          item.kind ===
          'insufficient_discovery',
      )

    assert.ok(
      discovery,
    )

    assert.equal(
      discovery.occurrences,
      1,
    )

    assert.equal(
      discovery.observation_count,
      2,
    )

    assert.deepEqual(
      discovery.analysis_event_ids,
      [
        'analysis-1',
        'analysis-2',
      ],
    )

    assert.deepEqual(
      discovery.affected_cycle_ids,
      [
        'cycle-1',
      ],
    )
  },
)

test(
  'handoff entrega ocorrências por ciclo suficientes para A5.4 calcular recorrência posteriormente',
  () => {
    const result =
      runHandoff({
        ...emptyInput(),

        commercial_reading_events: [
          analysisEvent({
            id:
              'analysis-cycle-1',

            cycleId:
              'cycle-1',
          }),

          analysisEvent({
            id:
              'analysis-cycle-2',

            cycleId:
              'cycle-2',

            generatedAt:
              '2026-08-20T16:00:00-03:00',
          }),
        ],
      })

    const discovery =
      result.semantic_patterns.find(
        item =>
          item.kind ===
          'insufficient_discovery',
      )

    assert.ok(
      discovery,
    )

    assert.equal(
      discovery.occurrences,
      2,
    )

    assert.deepEqual(
      discovery.affected_cycle_ids,
      [
        'cycle-1',
        'cycle-2',
      ],
    )

    assert.equal(
      Object.prototype
        .hasOwnProperty.call(
          discovery,
          'recurrence',
        ),
      false,
    )

    assert.equal(
      Object.prototype
        .hasOwnProperty.call(
          discovery,
          'priority',
        ),
      false,
    )
  },
)

test(
  'handoff preserva todas as dimensões semânticas necessárias sem reinterpretar A4',
  () => {
    const result =
      runHandoff({
        ...emptyInput(),

        commercial_reading_events: [
          analysisEvent(),
        ],
      })

    const pairs =
      result.semantic_patterns.map(
        item => [
          item.category,
          item.kind,
        ],
      )

    assert.ok(
      pairs.some(
        ([category, kind]) =>
          category ===
            'positive_pattern' &&
          kind ===
            'seller_strength_pattern',
      ),
    )

    assert.ok(
      pairs.some(
        ([category, kind]) =>
          category ===
            'seller_behavior' &&
          kind ===
            'insufficient_discovery',
      ),
    )

    assert.ok(
      pairs.some(
        ([category, kind]) =>
          category ===
            'method_execution' &&
          kind ===
            'method_misapplication',
      ),
    )

    assert.ok(
      pairs.some(
        ([category, kind]) =>
          category ===
            'customer_pattern' &&
          kind ===
            'recurring_objection',
      ),
    )

    assert.ok(
      pairs.some(
        ([category, kind]) =>
          category ===
            'seller_behavior' &&
          kind ===
            'recurring_service_risk',
      ),
    )
  },
)

test(
  'ausência de vendedor histórico atravessa o handoff sem backfill pelo dono atual',
  () => {
    const result =
      runHandoff({
        ...emptyInput(),

        commercial_reading_events: [
          analysisEvent({
            sellerUserId:
              null,
          }),
        ],

        cycle_snapshots: [
          cycleSnapshot({
            ownerUserId:
              'seller-current',
          }),
        ],
      })

    const sellerPatterns =
      result.semantic_patterns.filter(
        item =>
          item.category ===
            'seller_behavior' ||
          item.category ===
            'method_execution' ||
          item.category ===
            'positive_pattern',
      )

    assert.equal(
      sellerPatterns.length,
      0,
    )

    const customerPattern =
      result.semantic_patterns.find(
        item =>
          item.category ===
          'customer_pattern',
      )

    assert.ok(
      customerPattern,
    )

    assert.deepEqual(
      customerPattern
        .affected_seller_user_ids,
      [],
    )

    assert.equal(
      result.source_limitations[0]
        .reason,
      'seller_attribution_missing',
    )

    assert.equal(
      result.cycle_rollups[0]
        .current_snapshot
        .current_owner_user_id,
      'seller-current',
    )

    assert.deepEqual(
      result.cycle_rollups[0]
        .historical_seller_user_ids,
      [],
    )
  },
)

test(
  'telemetria atravessa o handoff como fato e mantém evento separado de ciclo',
  () => {
    const result =
      runHandoff({
        ...emptyInput(),

        action_events: [
          actionEvent({
            id:
              'action-shown',

            actionType:
              'suggestion_shown',
          }),

          actionEvent({
            id:
              'action-ignored',

            actionType:
              'suggestion_ignored',

            occurredAt:
              '2026-08-20T15:01:00-03:00',
          }),

          actionEvent({
            id:
              'action-sent-1',

            actionType:
              'suggestion_sent',

            occurredAt:
              '2026-08-20T15:02:00-03:00',
          }),

          actionEvent({
            id:
              'action-sent-2',

            cycleId:
              'cycle-2',

            sellerUserId:
              'seller-2',

            actionType:
              'suggestion_sent',

            occurredAt:
              '2026-08-20T15:03:00-03:00',
          }),
        ],
      })

    assert.deepEqual(
      result.unmapped_action_event_ids,
      [
        'action-shown',
      ],
    )

    const ignored =
      result.action_patterns.find(
        item =>
          item.kind ===
          'suggestion_ignored',
      )

    const adoption =
      result.action_patterns.find(
        item =>
          item.kind ===
          'suggestion_adoption',
      )

    assert.ok(
      ignored,
    )

    assert.ok(
      adoption,
    )

    assert.equal(
      ignored.event_count,
      1,
    )

    assert.equal(
      ignored.cycle_count,
      1,
    )

    assert.equal(
      adoption.event_count,
      2,
    )

    assert.equal(
      adoption.cycle_count,
      2,
    )

    assert.equal(
      Object.prototype
        .hasOwnProperty.call(
          ignored,
          'severity',
        ),
      false,
    )

    assert.equal(
      Object.prototype
        .hasOwnProperty.call(
          ignored,
          'direction',
        ),
      false,
    )
  },
)

test(
  'fato operacional mantém ator vendedor histórico e dono atual em papéis distintos',
  () => {
    const result =
      runHandoff({
        ...emptyInput(),

        commercial_reading_events: [
          analysisEvent({
            sellerUserId:
              'seller-history',
          }),
        ],

        cycle_events: [
          cycleEvent({
            actorUserId:
              'manager-1',
          }),
        ],

        cycle_snapshots: [
          cycleSnapshot({
            ownerUserId:
              'seller-current',
          }),
        ],
      })

    const rollup =
      result.cycle_rollups[0]

    assert.deepEqual(
      rollup
        .historical_seller_user_ids,
      [
        'seller-history',
      ],
    )

    assert.deepEqual(
      rollup.actor_user_ids,
      [
        'manager-1',
      ],
    )

    assert.equal(
      rollup
        .current_snapshot
        .current_owner_user_id,
      'seller-current',
    )

    assert.equal(
      Object.prototype
        .hasOwnProperty.call(
          result.cycle_facts[0],
          'conversation_text',
        ),
      false,
    )
  },
)

test(
  'cobertura exclusões e limitações chegam ao handoff sem serem convertidas em sinal negativo',
  () => {
    const legacy =
      analysisEvent({
        id:
          'analysis-legacy',
      })

    legacy.normalized_output = {
      communication: {
        contract_version:
          'phase-5.2-communication-v1',
      },
    }

    const result =
      runHandoff({
        ...emptyInput(),

        commercial_reading_events: [
          analysisEvent({
            id:
              'analysis-compatible',
          }),

          legacy,
        ],
      })

    assert.equal(
      result.source_coverage
        .analysis_events_received,
      2,
    )

    assert.equal(
      result.source_coverage
        .commercial_reading_events_compatible,
      1,
    )

    assert.equal(
      result.source_coverage
        .commercial_reading_events_excluded,
      1,
    )

    assert.equal(
      result
        .excluded_analysis_events
        .length,
      1,
    )

    assert.equal(
      result
        .excluded_analysis_events[0]
        .reason,
      'commercial_reading_missing',
    )

    assert.ok(
      result.semantic_patterns.every(
        item =>
          !item.analysis_event_ids
            .includes(
              'analysis-legacy',
            ),
      ),
    )
  },
)

test(
  'handoff preserva limitações de análises limitadas para A5.4 considerar cobertura',
  () => {
    const result =
      runHandoff({
        ...emptyInput(),

        commercial_reading_events: [
          analysisEvent({
            id:
              'analysis-limited',

            reading:
              buildReading({
                status:
                  'limited',

                limitations: [
                  'audio_without_transcription',
                ],
              }),
          }),
        ],
      })

    assert.ok(
      result.semantic_patterns.length >
      0,
    )

    assert.ok(
      result.semantic_patterns.every(
        item =>
          item
            .limited_analysis_event_ids
            .includes(
              'analysis-limited',
            ),
      ),
    )

    assert.ok(
      result.semantic_patterns.every(
        item =>
          item
            .analysis_limitations
            .includes(
              'audio_without_transcription',
            ),
      ),
    )
  },
)

test(
  'handoff contém proveniência suficiente e não contém decisões que pertencem ao A5.4',
  () => {
    const result =
      runHandoff({
        ...emptyInput(),

        commercial_reading_events: [
          analysisEvent(),
        ],

        action_events: [
          actionEvent(),
        ],

        cycle_events: [
          cycleEvent(),
        ],

        cycle_snapshots: [
          cycleSnapshot(),
        ],
      })

    for (
      const pattern
      of result.semantic_patterns
    ) {
      assert.ok(
        pattern.semantic_key,
      )

      assert.ok(
        pattern.category,
      )

      assert.ok(
        pattern.kind,
      )

      assert.ok(
        pattern.occurrences >=
        1,
      )

      assert.ok(
        pattern
          .affected_cycle_ids
          .length >=
        1,
      )

      assert.ok(
        pattern
          .analysis_event_ids
          .length >=
        1,
      )

      for (
        const forbidden
        of [
          'recurrence',
          'severity',
          'direction',
          'priority',
          'intervention_needed',
          'recommendation',
        ]
      ) {
        assert.equal(
          Object.prototype
            .hasOwnProperty.call(
              pattern,
              forbidden,
            ),
          false,
        )
      }
    }

    assert.equal(
      Object.prototype
        .hasOwnProperty.call(
          result,
          'management_decision',
        ),
      false,
    )

    assert.equal(
      Object.prototype
        .hasOwnProperty.call(
          result,
          'recommendations',
        ),
      false,
    )
  },
)

test(
  'handoff é determinístico serializável e não modifica as fontes brutas',
  () => {
    const input = {
      ...emptyInput(),

      commercial_reading_events: [
        analysisEvent({
          id:
            'analysis-2',

          cycleId:
            'cycle-2',

          generatedAt:
            '2026-08-20T16:00:00-03:00',
        }),

        analysisEvent({
          id:
            'analysis-1',

          cycleId:
            'cycle-1',
        }),
      ],

      action_events: [
        actionEvent({
          id:
            'action-2',

          cycleId:
            'cycle-2',
        }),

        actionEvent({
          id:
            'action-1',

          cycleId:
            'cycle-1',
        }),
      ],
    }

    const before =
      clone(input)

    const first =
      runHandoff(
        input,
      )

    const second =
      runHandoff(
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

    const serialized =
      JSON.stringify(
        first,
      )

    assert.equal(
      serialized.includes(
        'undefined',
      ),
      false,
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
