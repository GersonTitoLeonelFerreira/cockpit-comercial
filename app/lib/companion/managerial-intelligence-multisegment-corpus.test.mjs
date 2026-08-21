import assert from 'node:assert/strict'
import test from 'node:test'

import {
  extractManagerialEvidence,
} from './managerial-evidence-extractor.ts'

import {
  assembleManagerialIntelligence,
} from './managerial-intelligence-assembler.ts'

const COMPANY_ID =
  'company-multisegment'

const REFERENCE_TIME =
  '2026-08-21T01:00:00-03:00'

function buildReading({
  status =
    'complete',

  limitations =
    [],

  strengths =
    [],

  improvements =
    [],

  objections =
    [],

  serviceRisks =
    [],
} = {}) {
  return {
    contract_version:
      'commercial-reading-v1',

    analysis_status:
      status,

    analysis_limitations:
      limitations,

    seller_strengths:
      strengths.map(
        (item, index) => ({
          kind:
            item.kind,

          summary:
            item.summary,

          evidence_message_ids: [
            'strength-message-' +
              index,
          ],

          memory_ids: [],
        }),
      ),

    improvement_points:
      improvements.map(
        (item, index) => ({
          kind:
            item.kind,

          summary:
            item.summary,

          impact:
            item.impact,

          evidence_message_ids: [
            'improvement-message-' +
              index,
          ],

          memory_ids: [],
        }),
      ),

    risks: {
      customer_objections:
        objections.map(
          (item, index) => ({
            kind:
              item.kind,

            severity:
              item.severity,

            summary:
              item.summary,

            evidence_message_ids: [
              'objection-message-' +
                index,
            ],

            memory_ids: [],
          }),
        ),

      service_risks:
        serviceRisks.map(
          (item, index) => ({
            kind:
              item.kind,

            severity:
              item.severity,

            summary:
              item.summary,

            evidence_message_ids: [
              'service-risk-message-' +
                index,
            ],

            memory_ids: [],
          }),
        ),
    },
  }
}

function buildAnalysisEvent({
  id,
  cycleId,
  sellerUserId,
  reading,
  generatedAt =
    '2026-08-20T15:00:00-03:00',
}) {
  return {
    id,

    company_id:
      COMPANY_ID,

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

function buildLegacyAnalysisEvent({
  id,
  cycleId,
  sellerUserId,
}) {
  return {
    id,

    company_id:
      COMPANY_ID,

    cycle_id:
      cycleId,

    seller_user_id:
      sellerUserId,

    generated_at:
      '2026-08-20T15:00:00-03:00',

    normalized_output: {
      communication: {
        contract_version:
          'phase-5.2-communication-v1',
      },
    },
  }
}

function buildActionEvent({
  id,
  cycleId,
  sellerUserId,
  actionType,
}) {
  return {
    id,

    company_id:
      COMPANY_ID,

    cycle_id:
      cycleId,

    seller_user_id:
      sellerUserId,

    action_type:
      actionType,

    occurred_at:
      '2026-08-20T18:00:00-03:00',
  }
}

function runScenario({
  events,
  actions = [],
  cycles,
  sellers,
}) {
  const extraction =
    extractManagerialEvidence({
      expected_company_id:
        COMPANY_ID,

      commercial_reading_events:
        events,

      action_events:
        actions,

      cycle_events: [],

      cycle_snapshots: [],
    })

  return assembleManagerialIntelligence({
    extraction,

    scope: {
      period_start:
        '2026-08-01',

      period_end:
        '2026-08-21',

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
    },

    reference_time:
      REFERENCE_TIME,
  })
}

function findSignal(
  result,
  kind,
) {
  return result
    .signals
    .find(
      item =>
        item.kind === kind,
    )
}

function hasRecommendation(
  result,
  action,
  targetType,
  targetId = undefined,
) {
  return result
    .recommendations
    .some(
      item =>
        item.action === action &&
        item.target_type ===
          targetType &&
        (
          targetId === undefined ||
          item.target_id ===
            targetId
        ),
    )
}

function repeatedImprovementScenario({
  segment,
  kind,
}) {
  const seller =
    segment + '-seller'

  const cycles = [
    segment + '-cycle-1',
    segment + '-cycle-2',
  ]

  const reading =
    buildReading({
      improvements: [
        {
          kind,

          summary:
            'O padrão comercial precisa de ajuste.',

          impact:
            'A recorrência pode reduzir a qualidade da condução comercial.',
        },
      ],
    })

  return runScenario({
    events: [
      buildAnalysisEvent({
        id:
          segment + '-analysis-1',

        cycleId:
          cycles[0],

        sellerUserId:
          seller,

        reading,
      }),

      buildAnalysisEvent({
        id:
          segment + '-analysis-2',

        cycleId:
          cycles[1],

        sellerUserId:
          seller,

        generatedAt:
          '2026-08-20T16:00:00-03:00',

        reading,
      }),
    ],

    cycles,

    sellers: [
      seller,
    ],
  })
}

test(
  'SaaS transforma descoberta insuficiente recorrente em coaching consultivo',
  () => {
    const result =
      repeatedImprovementScenario({
        segment:
          'saas',

        kind:
          'insufficient_discovery',
      })

    const signal =
      findSignal(
        result,
        'insufficient_discovery',
      )

    assert.equal(
      result.analysis_status,
      'complete',
    )

    assert.ok(
      signal,
    )

    assert.equal(
      signal.recurrence,
      'repeated',
    )

    assert.equal(
      signal.severity,
      'attention',
    )

    assert.equal(
      result
        .management_decision
        .priority,
      'attention',
    )

    assert.equal(
      result
        .management_decision
        .intervention_needed,
      true,
    )

    assert.equal(
      hasRecommendation(
        result,
        'coach_seller',
        'seller',
        'saas-seller',
      ),
      true,
    )
  },
)

test(
  'consultoria B2B transforma objeção recorrente de preço em revisão de processo',
  () => {
    const reading =
      buildReading({
        objections: [
          {
            kind:
              'price_resistance',

            severity:
              'medium',

            summary:
              'O cliente demonstrou resistência ao investimento da consultoria.',
          },
        ],
      })

    const result =
      runScenario({
        events: [
          buildAnalysisEvent({
            id:
              'consulting-analysis-1',

            cycleId:
              'consulting-cycle-1',

            sellerUserId:
              'consulting-seller',

            reading,
          }),

          buildAnalysisEvent({
            id:
              'consulting-analysis-2',

            cycleId:
              'consulting-cycle-2',

            sellerUserId:
              'consulting-seller',

            generatedAt:
              '2026-08-20T16:00:00-03:00',

            reading,
          }),
        ],

        cycles: [
          'consulting-cycle-1',
          'consulting-cycle-2',
        ],

        sellers: [
          'consulting-seller',
        ],
      })

    const signal =
      findSignal(
        result,
        'recurring_objection',
      )

    assert.ok(
      signal,
    )

    assert.equal(
      signal.category,
      'customer_pattern',
    )

    assert.equal(
      signal.recurrence,
      'repeated',
    )

    assert.equal(
      signal.severity,
      'attention',
    )

    assert.equal(
      hasRecommendation(
        result,
        'review_process',
        'process',
      ),
      true,
    )

    assert.equal(
      hasRecommendation(
        result,
        'coach_seller',
        'seller',
      ),
      false,
    )
  },
)

test(
  'indústria transforma promessa recorrente não confirmada em verificação de informação',
  () => {
    const result =
      repeatedImprovementScenario({
        segment:
          'industry',

        kind:
          'promise_risk',
      })

    const signal =
      findSignal(
        result,
        'promise_risk',
      )

    assert.ok(
      signal,
    )

    assert.equal(
      signal.recurrence,
      'repeated',
    )

    assert.equal(
      signal.severity,
      'attention',
    )

    assert.equal(
      hasRecommendation(
        result,
        'verify_information',
        'seller',
        'industry-seller',
      ),
      true,
    )
  },
)

test(
  'educação transforma erro de método em dois vendedores em padrão sistêmico',
  () => {
    const reading =
      buildReading({
        improvements: [
          {
            kind:
              'method_misapplication',

            summary:
              'Uma etapa do método comercial foi aplicada fora do contexto.',

            impact:
              'A condução pode perder aderência ao processo comercial definido.',
          },
        ],
      })

    const result =
      runScenario({
        events: [
          buildAnalysisEvent({
            id:
              'education-analysis-1',

            cycleId:
              'education-cycle-1',

            sellerUserId:
              'education-seller-1',

            reading,
          }),

          buildAnalysisEvent({
            id:
              'education-analysis-2',

            cycleId:
              'education-cycle-2',

            sellerUserId:
              'education-seller-2',

            generatedAt:
              '2026-08-20T16:00:00-03:00',

            reading,
          }),
        ],

        cycles: [
          'education-cycle-1',
          'education-cycle-2',
        ],

        sellers: [
          'education-seller-1',
          'education-seller-2',
        ],
      })

    const signal =
      findSignal(
        result,
        'method_misapplication',
      )

    assert.ok(
      signal,
    )

    assert.equal(
      signal.category,
      'method_execution',
    )

    assert.equal(
      signal.recurrence,
      'systemic',
    )

    assert.equal(
      signal.severity,
      'attention',
    )

    assert.equal(
      hasRecommendation(
        result,
        'train_team',
        'team',
      ),
      true,
    )
  },
)

test(
  'imobiliário preserva padrão positivo sistêmico sem transformar acerto em intervenção',
  () => {
    const reading =
      buildReading({
        strengths: [
          {
            kind:
              'good_discovery',

            summary:
              'O vendedor investigou critérios do cliente antes de apresentar a solução.',
          },
        ],
      })

    const result =
      runScenario({
        events: [
          buildAnalysisEvent({
            id:
              'real-estate-analysis-1',

            cycleId:
              'real-estate-cycle-1',

            sellerUserId:
              'real-estate-seller-1',

            reading,
          }),

          buildAnalysisEvent({
            id:
              'real-estate-analysis-2',

            cycleId:
              'real-estate-cycle-2',

            sellerUserId:
              'real-estate-seller-2',

            generatedAt:
              '2026-08-20T16:00:00-03:00',

            reading,
          }),
        ],

        cycles: [
          'real-estate-cycle-1',
          'real-estate-cycle-2',
        ],

        sellers: [
          'real-estate-seller-1',
          'real-estate-seller-2',
        ],
      })

    const signal =
      findSignal(
        result,
        'seller_strength_pattern',
      )

    assert.ok(
      signal,
    )

    assert.equal(
      signal.direction,
      'positive',
    )

    assert.equal(
      signal.recurrence,
      'systemic',
    )

    assert.equal(
      signal.severity,
      'informational',
    )

    assert.equal(
      result
        .management_decision
        .priority,
      'informational',
    )

    assert.equal(
      result
        .management_decision
        .intervention_needed,
      false,
    )

    assert.equal(
      hasRecommendation(
        result,
        'observe',
        'team',
      ),
      true,
    )
  },
)

test(
  'saúde propaga limitação A4 sem apagar evidência válida',
  () => {
    const reading =
      buildReading({
        status:
          'limited',

        limitations: [
          'audio_without_transcription',
        ],

        strengths: [
          {
            kind:
              'clear_explanation',

            summary:
              'O vendedor explicou a proposta com clareza dentro da evidência disponível.',
          },
        ],
      })

    const result =
      runScenario({
        events: [
          buildAnalysisEvent({
            id:
              'health-analysis-1',

            cycleId:
              'health-cycle-1',

            sellerUserId:
              'health-seller',

            reading,
          }),
        ],

        cycles: [
          'health-cycle-1',
        ],

        sellers: [
          'health-seller',
        ],
      })

    assert.equal(
      result.analysis_status,
      'limited',
    )

    assert.equal(
      result
        .analysis_limitations
        .includes(
          'audio_without_transcription',
        ),
      true,
    )

    assert.equal(
      result.signals.length,
      1,
    )

    assert.equal(
      result.signals[0]
        .direction,
      'positive',
    )

    assert.equal(
      result
        .management_decision
        .priority,
      'informational',
    )

    assert.equal(
      hasRecommendation(
        result,
        'observe',
        'seller',
        'health-seller',
      ),
      true,
    )
  },
)

test(
  'logística mantém telemetria da IA factual e não a converte em julgamento do vendedor',
  () => {
    const result =
      runScenario({
        events: [
          buildAnalysisEvent({
            id:
              'logistics-analysis-1',

            cycleId:
              'logistics-cycle-1',

            sellerUserId:
              'logistics-seller',

            reading:
              buildReading(),
          }),
        ],

        actions: [
          buildActionEvent({
            id:
              'logistics-action-1',

            cycleId:
              'logistics-cycle-1',

            sellerUserId:
              'logistics-seller',

            actionType:
              'suggestion_ignored',
          }),
        ],

        cycles: [
          'logistics-cycle-1',
        ],

        sellers: [
          'logistics-seller',
        ],
      })

    const signal =
      findSignal(
        result,
        'suggestion_ignored',
      )

    assert.ok(
      signal,
    )

    assert.equal(
      signal.category,
      'ai_adoption',
    )

    assert.equal(
      signal.direction,
      'neutral',
    )

    assert.equal(
      signal.severity,
      'informational',
    )

    assert.equal(
      result
        .management_decision
        .intervention_needed,
      false,
    )

    assert.equal(
      hasRecommendation(
        result,
        'observe',
        'process',
      ),
      true,
    )

    assert.deepEqual(
      result.action_event_ids,
      [
        'logistics-action-1',
      ],
    )
  },
)

test(
  'varejo com histórico legado sem A4 compatível permanece insuficiente e sem intervenção',
  () => {
    const result =
      runScenario({
        events: [
          buildLegacyAnalysisEvent({
            id:
              'retail-analysis-legacy',

            cycleId:
              'retail-cycle-1',

            sellerUserId:
              'retail-seller',
          }),
        ],

        cycles: [
          'retail-cycle-1',
        ],

        sellers: [
          'retail-seller',
        ],
      })

    assert.equal(
      result.analysis_status,
      'insufficient',
    )

    assert.equal(
      result
        .analysis_limitations
        .includes(
          'commercial_reading_coverage_missing',
        ),
      true,
    )

    assert.equal(
      result
        .analysis_limitations
        .includes(
          'commercial_reading_missing',
        ),
      true,
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
      hasRecommendation(
        result,
        'no_action',
        'none',
      ),
      true,
    )
  },
)

test(
  'mesma evidência produz a mesma decisão gerencial independentemente do setor',
  () => {
    const segments = [
      'saas-neutrality',
      'consulting-neutrality',
      'industry-neutrality',
      'services-neutrality',
    ]

    const projections =
      segments.map(
        segment => {
          const result =
            repeatedImprovementScenario({
              segment,

              kind:
                'insufficient_discovery',
            })

          const signal =
            findSignal(
              result,
              'insufficient_discovery',
            )

          assert.ok(
            signal,
          )

          const recommendation =
            result
              .recommendations
              .find(
                item =>
                  item.action ===
                  'coach_seller',
              )

          assert.ok(
            recommendation,
          )

          return {
            category:
              signal.category,

            kind:
              signal.kind,

            direction:
              signal.direction,

            recurrence:
              signal.recurrence,

            severity:
              signal.severity,

            occurrences:
              signal.occurrences,

            sample_size:
              signal.sample_size,

            priority:
              result
                .management_decision
                .priority,

            intervention_needed:
              result
                .management_decision
                .intervention_needed,

            recommendation_action:
              recommendation.action,

            recommendation_target:
              recommendation.target_type,
          }
        },
      )

    projections
      .slice(1)
      .forEach(
        projection =>
          assert.deepEqual(
            projection,
            projections[0],
          ),
      )
  },
)
