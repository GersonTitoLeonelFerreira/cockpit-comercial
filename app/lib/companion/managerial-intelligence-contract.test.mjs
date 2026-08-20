import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MANAGERIAL_INTELLIGENCE_CONTRACT_VERSION,
  MANAGERIAL_INTELLIGENCE_RECOMMENDATION_ACTIONS,
  ManagerialIntelligenceContractError,
  normalizeManagerialIntelligence,
} from './managerial-intelligence-contract.ts'

const context = {
  expected_company_id:
    'company-1',

  reference_time:
    '2026-08-20T19:00:00-03:00',

  available_analysis_event_ids: [
    'analysis-1',
    'analysis-2',
    'analysis-3',
  ],

  available_action_event_ids: [
    'action-1',
    'action-2',
  ],

  available_cycle_event_ids: [
    'cycle-event-1',
    'cycle-event-2',
    'cycle-event-3',
  ],

  available_cycle_ids: [
    'cycle-1',
    'cycle-2',
    'cycle-3',
  ],

  available_seller_user_ids: [
    'seller-1',
    'seller-2',
  ],
}

function clone(value) {
  return JSON.parse(
    JSON.stringify(value),
  )
}

function buildValidIntelligence() {
  return {
    contract_version:
      MANAGERIAL_INTELLIGENCE_CONTRACT_VERSION,

    generated_at:
      '2026-08-20T18:59:00-03:00',

    analysis_status:
      'complete',

    analysis_limitations: [],

    scope: {
      company_id:
        'company-1',

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
    },

    coverage: {
      eligible_cycles:
        2,

      cycles_with_commercial_reading:
        2,

      commercial_reading_events:
        3,

      companion_action_events:
        2,

      cycle_events:
        3,

      sellers_in_scope:
        2,

      sellers_with_commercial_reading:
        2,
    },

    signals: [
      {
        signal_key:
          'discovery-gap',

        category:
          'seller_behavior',

        kind:
          'insufficient_discovery',

        direction:
          'risk',

        severity:
          'attention',

        recurrence:
          'repeated',

        summary:
          'A descoberta ficou incompleta em mais de uma oportunidade analisada.',

        impact:
          'O vendedor pode avançar sem critérios suficientes para recomendar a solução.',

        occurrences:
          2,

        sample_size:
          2,

        affected_cycle_ids: [
          'cycle-1',
          'cycle-2',
        ],

        affected_seller_user_ids: [
          'seller-1',
        ],

        analysis_event_ids: [
          'analysis-1',
          'analysis-2',
        ],

        action_event_ids: [],

        cycle_event_ids: [],

        requires_human_review:
          true,
      },
    ],

    management_decision: {
      priority:
        'attention',

      intervention_needed:
        true,

      reason:
        'Existe recorrência comprovada de descoberta insuficiente.',

      signal_keys: [
        'discovery-gap',
      ],

      requires_human_judgment:
        true,
    },

    recommendations: [
      {
        action:
          'coach_seller',

        target_type:
          'seller',

        target_id:
          'seller-1',

        reason:
          'Revisar a condução da descoberta usando as oportunidades comprovadas.',

        signal_keys: [
          'discovery-gap',
        ],

        advisory_only:
          true,
      },
    ],

    analysis_event_ids: [
      'analysis-1',
      'analysis-2',
    ],

    action_event_ids: [],

    cycle_event_ids: [],

    cycle_ids: [
      'cycle-1',
      'cycle-2',
    ],

    seller_user_ids: [
      'seller-1',
    ],
  }
}

function expectError(
  callback,
  code,
) {
  assert.throws(
    callback,
    error => {
      assert.ok(
        error instanceof
          ManagerialIntelligenceContractError,
      )

      assert.equal(
        error.code,
        code,
      )

      return true
    },
  )
}

test(
  'contrato representa escopo cobertura sinais decisão e recomendações gerenciais',
  () => {
    const intelligence =
      normalizeManagerialIntelligence(
        buildValidIntelligence(),
        context,
      )

    assert.equal(
      intelligence.contract_version,
      'managerial-intelligence-v1',
    )

    assert.equal(
      intelligence.signals.length,
      1,
    )

    assert.equal(
      intelligence
        .management_decision
        .priority,
      'attention',
    )

    assert.equal(
      intelligence
        .recommendations[0]
        .action,
      'coach_seller',
    )
  },
)

test(
  'análise completa exige cobertura integral do escopo declarado',
  () => {
    const intelligence =
      buildValidIntelligence()

    intelligence.coverage
      .cycles_with_commercial_reading =
      1

    intelligence.coverage
      .sellers_with_commercial_reading =
      1

    expectError(
      () =>
        normalizeManagerialIntelligence(
          intelligence,
          context,
        ),
      'COMPLETE_COVERAGE_MISMATCH',
    )
  },
)

test(
  'análise limitada ou insuficiente precisa declarar sua limitação',
  () => {
    const intelligence =
      buildValidIntelligence()

    intelligence.analysis_status =
      'limited'

    intelligence.coverage
      .cycles_with_commercial_reading =
      1

    intelligence.coverage
      .sellers_with_commercial_reading =
      1

    expectError(
      () =>
        normalizeManagerialIntelligence(
          intelligence,
          context,
        ),
      'LIMITATION_REQUIRED',
    )
  },
)

test(
  'cobertura insuficiente não pode fabricar sinal ou intervenção gerencial',
  () => {
    const intelligence =
      buildValidIntelligence()

    intelligence.analysis_status =
      'insufficient'

    intelligence.analysis_limitations = [
      'commercial_reading_coverage_insufficient',
    ]

    expectError(
      () =>
        normalizeManagerialIntelligence(
          intelligence,
          context,
        ),
      'INSUFFICIENT_WITH_SIGNALS',
    )
  },
)

test(
  'risco de comportamento do vendedor exige leitura comercial A4 persistida',
  () => {
    const intelligence =
      buildValidIntelligence()

    intelligence
      .signals[0]
      .analysis_event_ids = []

    intelligence
      .signals[0]
      .cycle_event_ids = [
        'cycle-event-1',
      ]

    expectError(
      () =>
        normalizeManagerialIntelligence(
          intelligence,
          context,
        ),
      'ANALYSIS_EVIDENCE_REQUIRED',
    )
  },
)

test(
  'sugestão ignorada permanece fato neutro e não vira julgamento do vendedor',
  () => {
    const intelligence =
      buildValidIntelligence()

    intelligence.signals = [
      {
        signal_key:
          'ignored-ai',

        category:
          'ai_adoption',

        kind:
          'suggestion_ignored',

        direction:
          'risk',

        severity:
          'attention',

        recurrence:
          'isolated',

        summary:
          'Uma sugestão foi ignorada.',

        impact:
          'O fato isolado não comprova erro comercial.',

        occurrences:
          1,

        sample_size:
          1,

        affected_cycle_ids: [
          'cycle-1',
        ],

        affected_seller_user_ids: [
          'seller-1',
        ],

        analysis_event_ids: [],

        action_event_ids: [
          'action-1',
        ],

        cycle_event_ids: [],

        requires_human_review:
          true,
      },
    ]

    intelligence
      .management_decision = {
        priority:
          'attention',

        intervention_needed:
          true,

        reason:
          'Teste.',

        signal_keys: [
          'ignored-ai',
        ],

        requires_human_judgment:
          true,
      }

    intelligence.recommendations = []

    intelligence.analysis_event_ids = []

    intelligence.action_event_ids = [
      'action-1',
    ]

    intelligence.cycle_ids = [
      'cycle-1',
    ]

    intelligence.seller_user_ids = [
      'seller-1',
    ]

    expectError(
      () =>
        normalizeManagerialIntelligence(
          intelligence,
          context,
        ),
      'AI_ADOPTION_IS_FACTUAL',
    )
  },
)

test(
  'objeção recorrente do cliente permanece categoria de cliente e não falha do vendedor',
  () => {
    const intelligence =
      buildValidIntelligence()

    intelligence
      .signals[0]
      .kind =
      'recurring_objection'

    expectError(
      () =>
        normalizeManagerialIntelligence(
          intelligence,
          context,
        ),
      'KIND_CATEGORY_MISMATCH',
    )
  },
)

test(
  'padrão positivo não pode ser promovido para alerta negativo',
  () => {
    const intelligence =
      buildValidIntelligence()

    intelligence.signals[0] = {
      ...intelligence.signals[0],

      category:
        'positive_pattern',

      kind:
        'seller_strength_pattern',

      direction:
        'positive',

      severity:
        'critical',
    }

    intelligence
      .management_decision
      .priority =
      'critical'

    intelligence
      .management_decision
      .intervention_needed =
      true

    expectError(
      () =>
        normalizeManagerialIntelligence(
          intelligence,
          context,
        ),
      'POSITIVE_SIGNAL_SEMANTICS',
    )
  },
)

test(
  'prioridade atenção ou crítica precisa ser coerente com intervenção',
  () => {
    const intelligence =
      buildValidIntelligence()

    intelligence
      .management_decision
      .intervention_needed =
      false

    expectError(
      () =>
        normalizeManagerialIntelligence(
          intelligence,
          context,
        ),
      'DECISION_INTERVENTION_MISMATCH',
    )
  },
)

test(
  'prioridade crítica exige ao menos um sinal realmente crítico',
  () => {
    const intelligence =
      buildValidIntelligence()

    intelligence
      .management_decision
      .priority =
      'critical'

    expectError(
      () =>
        normalizeManagerialIntelligence(
          intelligence,
          context,
        ),
      'CRITICAL_SIGNAL_REQUIRED',
    )
  },
)

test(
  'recomendação de coaching exige vendedor afetado pelo sinal',
  () => {
    const intelligence =
      buildValidIntelligence()

    intelligence
      .recommendations[0]
      .target_id =
      'seller-2'

    intelligence.seller_user_ids = [
      'seller-1',
      'seller-2',
    ]

    expectError(
      () =>
        normalizeManagerialIntelligence(
          intelligence,
          context,
        ),
      'TARGET_NOT_SUPPORTED',
    )
  },
)

test(
  'recomendações permanecem consultivas e decisão exige julgamento humano',
  () => {
    const intelligence =
      buildValidIntelligence()

    intelligence
      .recommendations[0]
      .advisory_only =
      false

    expectError(
      () =>
        normalizeManagerialIntelligence(
          intelligence,
          context,
        ),
      'HUMAN_REVIEW_REQUIRED',
    )

    const second =
      buildValidIntelligence()

    second
      .management_decision
      .requires_human_judgment =
      false

    expectError(
      () =>
        normalizeManagerialIntelligence(
          second,
          context,
        ),
      'HUMAN_REVIEW_REQUIRED',
    )
  },
)

test(
  'referência usada por sinal precisa existir no contexto e ser declarada globalmente',
  () => {
    const unknown =
      buildValidIntelligence()

    unknown
      .signals[0]
      .analysis_event_ids = [
        'analysis-inexistente',
      ]

    expectError(
      () =>
        normalizeManagerialIntelligence(
          unknown,
          context,
        ),
      'UNKNOWN_REFERENCE',
    )

    const undeclared =
      buildValidIntelligence()

    undeclared.analysis_event_ids = [
      'analysis-1',
    ]

    expectError(
      () =>
        normalizeManagerialIntelligence(
          undeclared,
          context,
        ),
      'GLOBAL_REFERENCE_MISSING',
    )
  },
)

test(
  'ocorrências não podem ultrapassar a amostra usada para formar o padrão',
  () => {
    const intelligence =
      buildValidIntelligence()

    intelligence
      .signals[0]
      .occurrences =
      3

    intelligence
      .signals[0]
      .sample_size =
      2

    expectError(
      () =>
        normalizeManagerialIntelligence(
          intelligence,
          context,
        ),
      'OCCURRENCES_EXCEED_SAMPLE',
    )
  },
)

test(
  'sinal sistêmico precisa atingir mais de um vendedor',
  () => {
    const intelligence =
      buildValidIntelligence()

    intelligence
      .signals[0]
      .recurrence =
      'systemic'

    expectError(
      () =>
        normalizeManagerialIntelligence(
          intelligence,
          context,
        ),
      'SYSTEMIC_SCOPE_REQUIRED',
    )
  },
)

test(
  'escopo individual exige vendedor conhecido e período não pode avançar para o futuro',
  () => {
    const sellerScope =
      buildValidIntelligence()

    sellerScope.scope
      .seller_scope = {
        type:
          'seller',

        seller_user_id:
          null,
      }

    expectError(
      () =>
        normalizeManagerialIntelligence(
          sellerScope,
          context,
        ),
      'SELLER_SCOPE_REQUIRES_SELLER',
    )

    const future =
      buildValidIntelligence()

    future.scope.period_end =
      '2026-08-21'

    expectError(
      () =>
        normalizeManagerialIntelligence(
          future,
          context,
        ),
      'PERIOD_IN_FUTURE',
    )
  },
)

test(
  'cobertura insuficiente pode recomendar somente coleta de evidência sem intervenção',
  () => {
    const intelligence =
      buildValidIntelligence()

    intelligence.analysis_status =
      'insufficient'

    intelligence.analysis_limitations = [
      'commercial_reading_coverage_insufficient',
    ]

    intelligence.coverage = {
      ...intelligence.coverage,

      cycles_with_commercial_reading:
        0,

      commercial_reading_events:
        0,

      sellers_with_commercial_reading:
        0,
    }

    intelligence.signals = []

    intelligence
      .management_decision = {
        priority:
          'none',

        intervention_needed:
          false,

        reason:
          'Ainda não existe cobertura suficiente para orientar o gestor.',

        signal_keys: [],

        requires_human_judgment:
          true,
      }

    intelligence.recommendations = [
      {
        action:
          'collect_more_evidence',

        target_type:
          'team',

        target_id:
          null,

        reason:
          'Aguardar novas leituras A4 antes de concluir um padrão.',

        signal_keys: [],

        advisory_only:
          true,
      },
    ]

    intelligence.analysis_event_ids = []
    intelligence.action_event_ids = []
    intelligence.cycle_event_ids = []
    intelligence.cycle_ids = []
    intelligence.seller_user_ids = []

    const normalized =
      normalizeManagerialIntelligence(
        intelligence,
        context,
      )

    assert.equal(
      normalized.analysis_status,
      'insufficient',
    )

    assert.equal(
      normalized
        .management_decision
        .intervention_needed,
      false,
    )

    assert.equal(
      normalized
        .recommendations[0]
        .action,
      'collect_more_evidence',
    )
  },
)

test(
  'contrato gerencial não oferece escrita automática de CRM Agenda ou punição de vendedor',
  () => {
    assert.equal(
      MANAGERIAL_INTELLIGENCE_RECOMMENDATION_ACTIONS
        .includes('change_crm'),
      false,
    )

    assert.equal(
      MANAGERIAL_INTELLIGENCE_RECOMMENDATION_ACTIONS
        .includes('change_agenda'),
      false,
    )

    assert.equal(
      MANAGERIAL_INTELLIGENCE_RECOMMENDATION_ACTIONS
        .includes('fire_seller'),
      false,
    )

    assert.equal(
      MANAGERIAL_INTELLIGENCE_RECOMMENDATION_ACTIONS
        .includes('rank_seller'),
      false,
    )
  },
)
