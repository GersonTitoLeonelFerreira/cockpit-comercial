import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ManagerialIntelligenceAssemblerError,
  assembleManagerialIntelligence,
} from './managerial-intelligence-assembler.ts'

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

    commercial_reading_coverage:
      [],

    semantic_evidence:
      [],

    action_facts:
      [],

    cycle_facts:
      [],

    cycle_snapshots:
      [],

    excluded_analysis_events:
      [],

    source_limitations:
      [],

    analysis_event_ids:
      [],

    action_event_ids:
      [],

    cycle_event_ids:
      [],

    commercial_reading_cycle_ids:
      [],

    commercial_reading_seller_user_ids:
      [],

    cycle_ids:
      [],

    seller_user_ids:
      [],
  }
}

function coverage({
  id =
    'analysis-1',

  cycleId =
    'cycle-1',

  sellerUserId =
    'seller-1',

  occurredAt =
    '2026-08-20T15:00:00-03:00',

  status =
    'complete',

  limitations =
    [],
} = {}) {
  return {
    source:
      'commercial_reading_coverage',

    analysis_event_id:
      id,

    cycle_id:
      cycleId,

    seller_user_id:
      sellerUserId,

    occurred_at:
      occurredAt,

    analysis_status:
      status,

    analysis_limitations:
      limitations,
  }
}

function semantic({
  id =
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
    'A descoberta ficou incompleta.',

  impact =
    'Pode reduzir a qualidade da recomendação.',

  riskSeverity =
    null,

  status =
    'complete',

  limitations =
    [],
} = {}) {
  return {
    source:
      'commercial_reading',

    analysis_event_id:
      id,

    cycle_id:
      cycleId,

    seller_user_id:
      sellerUserId,

    occurred_at:
      occurredAt,

    analysis_status:
      status,

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
      riskSeverity,

    evidence_message_ids: [
      'message-' + id,
    ],

    memory_ids: [],
  }
}

function action({
  id =
    'action-1',

  cycleId =
    'cycle-1',

  sellerUserId =
    'seller-1',

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
      '2026-08-20T17:00:00-03:00',

    action_type:
      actionType,

    mapped_kind:
      mappedKind,
  }
}

function teamScope({
  cycles = [
    'cycle-1',
    'cycle-2',
  ],

  sellers = [
    'seller-1',
    'seller-2',
  ],
} = {}) {
  return {
    period_start:
      '2026-08-01',

    period_end:
      '2026-08-20',

    seller_scope: {
      type:
        'team',

      seller_user_id:
        null,
    },

    eligible_cycle_ids:
      cycles,

    seller_user_ids_in_scope:
      sellers,
  }
}

function sellerScope({
  seller =
    'seller-1',

  cycles = [
    'cycle-1',
  ],
} = {}) {
  return {
    period_start:
      '2026-08-01',

    period_end:
      '2026-08-20',

    seller_scope: {
      type:
        'seller',

      seller_user_id:
        seller,
    },

    eligible_cycle_ids:
      cycles,

    seller_user_ids_in_scope: [
      seller,
    ],
  }
}

function run(
  extraction,
  scope,
) {
  return assembleManagerialIntelligence({
    extraction,
    scope,

    reference_time:
      '2026-08-20T23:00:00-03:00',
  })
}

function clone(value) {
  return JSON.parse(
    JSON.stringify(value),
  )
}

function repeatedTeamExtraction() {
  const extraction =
    emptyExtraction()

  extraction.commercial_reading_coverage = [
    coverage({
      id:
        'analysis-1',

      cycleId:
        'cycle-1',

      sellerUserId:
        'seller-1',
    }),

    coverage({
      id:
        'analysis-2',

      cycleId:
        'cycle-2',

      sellerUserId:
        'seller-2',

      occurredAt:
        '2026-08-20T16:00:00-03:00',
    }),
  ]

  extraction.semantic_evidence = [
    semantic({
      id:
        'analysis-1',

      cycleId:
        'cycle-1',

      sellerUserId:
        'seller-1',
    }),

    semantic({
      id:
        'analysis-2',

      cycleId:
        'cycle-2',

      sellerUserId:
        'seller-2',

      occurredAt:
        '2026-08-20T16:00:00-03:00',
    }),
  ]

  return extraction
}

test(
  'monta managerial-intelligence-v1 completo para equipe',
  () => {
    const result =
      run(
        repeatedTeamExtraction(),
        teamScope(),
      )

    assert.equal(
      result.contract_version,
      'managerial-intelligence-v1',
    )

    assert.equal(
      result.analysis_status,
      'complete',
    )

    assert.deepEqual(
      result.analysis_limitations,
      [],
    )

    assert.equal(
      result.coverage
        .eligible_cycles,
      2,
    )

    assert.equal(
      result.coverage
        .cycles_with_commercial_reading,
      2,
    )

    assert.equal(
      result.coverage
        .sellers_with_commercial_reading,
      2,
    )

    assert.equal(
      result.signals.length,
      1,
    )

    assert.equal(
      result.signals[0]
        .recurrence,
      'systemic',
    )

    assert.equal(
      result
        .management_decision
        .priority,
      'attention',
    )

    assert.equal(
      result
        .recommendations[0]
        .action,
      'train_team',
    )

    assert.equal(
      result
        .recommendations[0]
        .advisory_only,
      true,
    )
  },
)

test(
  'escopo individual recalcula recorrência antes da classificação',
  () => {
    const result =
      run(
        repeatedTeamExtraction(),
        sellerScope({
          seller:
            'seller-1',

          cycles: [
            'cycle-1',
          ],
        }),
      )

    assert.equal(
      result.signals.length,
      1,
    )

    assert.equal(
      result.signals[0]
        .occurrences,
      1,
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

    assert.deepEqual(
      result.signals[0]
        .affected_seller_user_ids,
      [
        'seller-1',
      ],
    )

    assert.equal(
      result
        .management_decision
        .priority,
      'informational',
    )

    assert.equal(
      result
        .recommendations[0]
        .action,
      'observe',
    )

    assert.equal(
      result
        .recommendations[0]
        .target_id,
      'seller-1',
    )
  },
)

test(
  'telemetria sem cobertura A4 permanece factual e não gera sinal gerencial',
  () => {
    const extraction =
      emptyExtraction()

    extraction.action_facts = [
      action(),
    ]

    const result =
      run(
        extraction,
        sellerScope(),
      )

    assert.equal(
      result.analysis_status,
      'insufficient',
    )

    assert.deepEqual(
      result.analysis_limitations,
      [
        'commercial_reading_coverage_missing',
      ],
    )

    assert.deepEqual(
      result.signals,
      [],
    )

    assert.equal(
      result
        .management_decision
        .priority,
      'none',
    )

    assert.equal(
      result
        .management_decision
        .intervention_needed,
      false,
    )

    assert.equal(
      result
        .recommendations[0]
        .action,
      'no_action',
    )

    assert.deepEqual(
      result.action_event_ids,
      [
        'action-1',
      ],
    )
  },
)

test(
  'cobertura parcial produz análise limitada sem fabricar completude',
  () => {
    const extraction =
      emptyExtraction()

    extraction.commercial_reading_coverage = [
      coverage(),
    ]

    const result =
      run(
        extraction,
        teamScope({
          cycles: [
            'cycle-1',
            'cycle-2',
          ],

          sellers: [
            'seller-1',
          ],
        }),
      )

    assert.equal(
      result.analysis_status,
      'limited',
    )

    assert.deepEqual(
      result.analysis_limitations,
      [
        'partial_commercial_reading_coverage',
      ],
    )

    assert.equal(
      result.coverage
        .eligible_cycles,
      2,
    )

    assert.equal(
      result.coverage
        .cycles_with_commercial_reading,
      1,
    )
  },
)

test(
  'leitura A4 limitada preserva a limitação no contrato gerencial',
  () => {
    const extraction =
      emptyExtraction()

    extraction.commercial_reading_coverage = [
      coverage({
        status:
          'limited',

        limitations: [
          'audio_without_transcription',
        ],
      }),
    ]

    const result =
      run(
        extraction,
        teamScope({
          cycles: [
            'cycle-1',
          ],

          sellers: [
            'seller-1',
          ],
        }),
      )

    assert.equal(
      result.analysis_status,
      'limited',
    )

    assert.deepEqual(
      result.analysis_limitations,
      [
        'audio_without_transcription',
      ],
    )
  },
)

test(
  'ausência de vendedor histórico nunca é reparada pelo vendedor selecionado',
  () => {
    const extraction =
      emptyExtraction()

    extraction.commercial_reading_coverage = [
      coverage({
        sellerUserId:
          null,
      }),
    ]

    extraction.semantic_evidence = [
      semantic({
        sellerUserId:
          null,

        semanticKey:
          'customer_objection:price_resistance',

        dimension:
          'customer_objection',

        category:
          'customer_pattern',

        kind:
          'recurring_objection',

        summary:
          'O cliente demonstrou resistência ao preço.',

        impact:
          null,

        riskSeverity:
          'medium',
      }),
    ]

    const result =
      run(
        extraction,
        sellerScope(),
      )

    assert.equal(
      result.analysis_status,
      'limited',
    )

    assert.ok(
      result
        .analysis_limitations
        .includes(
          'seller_commercial_reading_coverage_missing',
        ),
    )

    assert.deepEqual(
      result.signals[0]
        .affected_seller_user_ids,
      [],
    )

    assert.equal(
      result.signals[0]
        .category,
      'customer_pattern',
    )

    assert.notEqual(
      result
        .recommendations[0]
        .action,
      'coach_seller',
    )

    assert.equal(
      result
        .recommendations[0]
        .action,
      'review_process',
    )
  },
)

test(
  'um único ciclo redistribuído pode cobrir dois vendedores históricos',
  () => {
    const extraction =
      emptyExtraction()

    extraction.commercial_reading_coverage = [
      coverage({
        id:
          'analysis-1',

        sellerUserId:
          'seller-1',
      }),

      coverage({
        id:
          'analysis-2',

        sellerUserId:
          'seller-2',

        occurredAt:
          '2026-08-20T16:00:00-03:00',
      }),
    ]

    const result =
      run(
        extraction,
        teamScope({
          cycles: [
            'cycle-1',
          ],

          sellers: [
            'seller-1',
            'seller-2',
          ],
        }),
      )

    assert.equal(
      result.analysis_status,
      'complete',
    )

    assert.equal(
      result.coverage
        .cycles_with_commercial_reading,
      1,
    )

    assert.equal(
      result.coverage
        .sellers_with_commercial_reading,
      2,
    )

    assert.equal(
      result
        .management_decision
        .priority,
      'none',
    )
  },
)

test(
  'vendedor histórico fora do escopo de equipe falha fechado',
  () => {
    const extraction =
      emptyExtraction()

    extraction.commercial_reading_coverage = [
      coverage({
        sellerUserId:
          'seller-2',
      }),
    ]

    assert.throws(
      () =>
        run(
          extraction,
          teamScope({
            cycles: [
              'cycle-1',
            ],

            sellers: [
              'seller-1',
            ],
          }),
        ),

      error =>
        error instanceof
          ManagerialIntelligenceAssemblerError &&
        error.code ===
          'SELLER_OUTSIDE_SCOPE',
    )
  },
)

test(
  'escopo individual exige lista consistente com o vendedor selecionado',
  () => {
    const scope =
      sellerScope()

    scope.seller_user_ids_in_scope = [
      'seller-1',
      'seller-2',
    ]

    assert.throws(
      () =>
        run(
          emptyExtraction(),
          scope,
        ),

      error =>
        error instanceof
          ManagerialIntelligenceAssemblerError &&
        error.code ===
          'SELLER_SCOPE_MISMATCH',
    )
  },
)

test(
  'ciclo elegível sem leitura permanece no denominador da cobertura',
  () => {
    const extraction =
      emptyExtraction()

    extraction.commercial_reading_coverage = [
      coverage(),
    ]

    const result =
      run(
        extraction,
        teamScope({
          cycles: [
            'cycle-1',
            'cycle-sem-leitura',
          ],

          sellers: [
            'seller-1',
          ],
        }),
      )

    assert.equal(
      result.coverage
        .eligible_cycles,
      2,
    )

    assert.equal(
      result.coverage
        .cycles_with_commercial_reading,
      1,
    )

    assert.ok(
      result
        .cycle_ids
        .includes(
          'cycle-sem-leitura',
        ),
    )

    assert.equal(
      result.analysis_status,
      'limited',
    )
  },
)

test(
  'sem ciclos elegíveis a análise é insuficiente e não cria intervenção',
  () => {
    const result =
      run(
        emptyExtraction(),
        teamScope({
          cycles:
            [],

          sellers:
            [],
        }),
      )

    assert.equal(
      result.analysis_status,
      'insufficient',
    )

    assert.deepEqual(
      result.analysis_limitations,
      [
        'no_eligible_cycles',
      ],
    )

    assert.deepEqual(
      result.signals,
      [],
    )

    assert.equal(
      result
        .management_decision
        .priority,
      'none',
    )

    assert.equal(
      result
        .recommendations[0]
        .action,
      'no_action',
    )
  },
)

test(
  'assembler é determinístico serializável e não modifica a extração',
  () => {
    const extraction =
      repeatedTeamExtraction()

    const before =
      clone(extraction)

    const first =
      run(
        extraction,
        teamScope(),
      )

    const second =
      run(
        extraction,
        teamScope(),
      )

    assert.deepEqual(
      extraction,
      before,
    )

    assert.deepEqual(
      first,
      second,
    )

    assert.equal(
      JSON.stringify(first)
        .includes(
          'undefined',
        ),
      false,
    )

    assert.deepEqual(
      first.analysis_event_ids,
      [
        'analysis-1',
        'analysis-2',
      ],
    )

    assert.deepEqual(
      first.cycle_ids,
      [
        'cycle-1',
        'cycle-2',
      ],
    )

    assert.deepEqual(
      first.seller_user_ids,
      [
        'seller-1',
        'seller-2',
      ],
    )
  },
)
