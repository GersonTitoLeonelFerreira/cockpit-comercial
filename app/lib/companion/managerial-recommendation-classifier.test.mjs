import assert from 'node:assert/strict'
import test from 'node:test'

import {
  classifyManagerialPriority,
} from './managerial-priority-classifier.ts'

import {
  ManagerialRecommendationClassifierError,
  classifyManagerialRecommendations,
} from './managerial-recommendation-classifier.ts'

function signal({
  key =
    'signal-1',

  category =
    'seller_behavior',

  kind =
    'insufficient_discovery',

  severity =
    'informational',

  recurrence =
    'isolated',

  direction =
    'risk',

  sellerIds =
    ['seller-1'],

  cycleIds =
    ['cycle-1'],
} = {}) {
  return {
    signal_key:
      key,

    category,
    kind,
    direction,
    severity,
    recurrence,

    summary:
      'Sinal comprovado.',

    impact:
      'Impacto comprovado.',

    occurrences:
      cycleIds.length,

    sample_size:
      Math.max(
        1,
        cycleIds.length,
      ),

    affected_cycle_ids:
      cycleIds,

    affected_seller_user_ids:
      sellerIds,

    analysis_event_ids: [
      'analysis-' + key,
    ],

    action_event_ids: [],

    cycle_event_ids: [],

    requires_human_review:
      true,
  }
}

function classification(
  signals = [],
) {
  return {
    company_id:
      'company-1',

    semantic_sample_size:
      10,

    action_sample_size:
      0,

    signals,
  }
}

function run(
  signals = [],
) {
  const classified =
    classification(
      signals,
    )

  const priority =
    classifyManagerialPriority(
      classified,
    )

  return classifyManagerialRecommendations(
    classified,
    priority,
  )
}

function clone(value) {
  return JSON.parse(
    JSON.stringify(value),
  )
}

test(
  'sem sinais produz somente no_action consultivo',
  () => {
    const result =
      run()

    assert.deepEqual(
      result.recommendations,
      [
        {
          action:
            'no_action',

          target_type:
            'none',

          target_id:
            null,

          reason:
            'Nenhuma intervenção gerencial é recomendada com as evidências atuais.',

          signal_keys:
            [],

          advisory_only:
            true,
        },
      ],
    )
  },
)

test(
  'sinal informativo de vendedor recomenda apenas observar o vendedor',
  () => {
    const result =
      run([
        signal(),
      ])

    assert.equal(
      result
        .recommendations[0]
        .action,
      'observe',
    )

    assert.equal(
      result
        .recommendations[0]
        .target_type,
      'seller',
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
  'telemetria informativa permanece observação de processo e nunca coaching',
  () => {
    const result =
      run([
        signal({
          key:
            'ai-adoption',

          category:
            'ai_adoption',

          kind:
            'suggestion_adoption',

          direction:
            'neutral',

          sellerIds: [
            'seller-1',
          ],
        }),
      ])

    assert.deepEqual(
      result
        .recommendations
        .map(
          item =>
            item.action,
        ),
      [
        'observe',
      ],
    )

    assert.equal(
      result
        .recommendations[0]
        .target_type,
      'process',
    )
  },
)

test(
  'padrão positivo sistêmico recomenda observar equipe sem criar intervenção',
  () => {
    const result =
      run([
        signal({
          key:
            'positive',

          category:
            'positive_pattern',

          kind:
            'seller_strength_pattern',

          direction:
            'positive',

          recurrence:
            'systemic',

          sellerIds: [
            'seller-1',
            'seller-2',
          ],

          cycleIds: [
            'cycle-1',
            'cycle-2',
          ],
        }),
      ])

    assert.equal(
      result
        .recommendations[0]
        .action,
      'observe',
    )

    assert.equal(
      result
        .recommendations[0]
        .target_type,
      'team',
    )
  },
)

test(
  'sinal de atenção atribuído a um vendedor recomenda coaching consultivo',
  () => {
    const result =
      run([
        signal({
          severity:
            'attention',

          recurrence:
            'repeated',

          cycleIds: [
            'cycle-1',
            'cycle-2',
          ],
        }),
      ])

    const recommendation =
      result.recommendations[0]

    assert.equal(
      recommendation.action,
      'coach_seller',
    )

    assert.equal(
      recommendation.target_type,
      'seller',
    )

    assert.equal(
      recommendation.target_id,
      'seller-1',
    )

    assert.equal(
      recommendation.advisory_only,
      true,
    )
  },
)

test(
  'padrão realmente sistêmico recomenda revisão com a equipe',
  () => {
    const result =
      run([
        signal({
          severity:
            'attention',

          recurrence:
            'systemic',

          sellerIds: [
            'seller-1',
            'seller-2',
          ],

          cycleIds: [
            'cycle-1',
            'cycle-2',
          ],
        }),
      ])

    const recommendation =
      result.recommendations[0]

    assert.equal(
      recommendation.action,
      'train_team',
    )

    assert.equal(
      recommendation.target_type,
      'team',
    )

    assert.equal(
      recommendation.target_id,
      null,
    )
  },
)

test(
  'redistribuição sem recorrência sistêmica não transforma múltiplos vendedores em treino de equipe',
  () => {
    const result =
      run([
        signal({
          severity:
            'attention',

          recurrence:
            'isolated',

          sellerIds: [
            'seller-1',
            'seller-2',
          ],

          cycleIds: [
            'cycle-1',
          ],
        }),
      ])

    assert.equal(
      result
        .recommendations[0]
        .action,
      'collect_more_evidence',
    )

    assert.equal(
      result
        .recommendations[0]
        .target_type,
      'none',
    )
  },
)

test(
  'informação incorreta comprovada recomenda verificação antes de nova orientação',
  () => {
    const result =
      run([
        signal({
          key:
            'incorrect',

          kind:
            'incorrect_information',

          severity:
            'attention',
        }),
      ])

    const recommendation =
      result.recommendations[0]

    assert.equal(
      recommendation.action,
      'verify_information',
    )

    assert.equal(
      recommendation.target_type,
      'seller',
    )

    assert.equal(
      recommendation.target_id,
      'seller-1',
    )
  },
)

test(
  'risco de promessa sistêmico verifica o processo em vez de atribuir culpa individual',
  () => {
    const result =
      run([
        signal({
          key:
            'promise',

          kind:
            'promise_risk',

          severity:
            'critical',

          recurrence:
            'systemic',

          sellerIds: [
            'seller-1',
            'seller-2',
          ],

          cycleIds: [
            'cycle-1',
            'cycle-2',
          ],
        }),
      ])

    const recommendation =
      result.recommendations[0]

    assert.equal(
      recommendation.action,
      'verify_information',
    )

    assert.equal(
      recommendation.target_type,
      'process',
    )

    assert.equal(
      recommendation.target_id,
      null,
    )
  },
)

test(
  'padrão de cliente em atenção recomenda revisão do processo e não coaching',
  () => {
    const result =
      run([
        signal({
          key:
            'objection',

          category:
            'customer_pattern',

          kind:
            'recurring_objection',

          severity:
            'attention',

          recurrence:
            'repeated',

          sellerIds:
            [],

          cycleIds: [
            'cycle-1',
            'cycle-2',
          ],
        }),
      ])

    assert.equal(
      result
        .recommendations[0]
        .action,
      'review_process',
    )

    assert.equal(
      result
        .recommendations[0]
        .target_type,
      'process',
    )
  },
)

test(
  'processo e resultado comercial podem convergir em uma revisão de processo',
  () => {
    const result =
      run([
        signal({
          key:
            'follow-up',

          category:
            'process_execution',

          kind:
            'overdue_follow_up',

          severity:
            'attention',
        }),

        signal({
          key:
            'loss',

          category:
            'commercial_result',

          kind:
            'loss_pattern',

          severity:
            'attention',
        }),
      ])

    assert.equal(
      result
        .recommendations
        .length,
      1,
    )

    assert.equal(
      result
        .recommendations[0]
        .action,
      'review_process',
    )

    assert.deepEqual(
      result
        .recommendations[0]
        .signal_keys,
      [
        'follow-up',
        'loss',
      ],
    )
  },
)

test(
  'risco de oportunidade gera intervenção consultiva somente nos ciclos comprovados',
  () => {
    const result =
      run([
        signal({
          key:
            'stagnation',

          category:
            'opportunity_risk',

          kind:
            'opportunity_stagnation',

          severity:
            'attention',

          recurrence:
            'repeated',

          sellerIds:
            [],

          cycleIds: [
            'cycle-2',
            'cycle-1',
          ],
        }),
      ])

    assert.equal(
      result
        .recommendations
        .length,
      2,
    )

    assert.deepEqual(
      result
        .recommendations
        .map(
          item =>
            item.target_id,
        ),
      [
        'cycle-1',
        'cycle-2',
      ],
    )

    assert.equal(
      result
        .recommendations
        .every(
          item =>
            item.action ===
              'intervene_opportunity' &&
            item.advisory_only ===
              true,
        ),
      true,
    )
  },
)

test(
  'somente sinais que sustentam a prioridade máxima geram intervenção',
  () => {
    const result =
      run([
        signal({
          key:
            'info',
        }),

        signal({
          key:
            'critical',

          severity:
            'critical',

          recurrence:
            'repeated',

          cycleIds: [
            'cycle-1',
            'cycle-2',
          ],
        }),
      ])

    assert.equal(
      result
        .recommendations
        .length,
      1,
    )

    assert.deepEqual(
      result
        .recommendations[0]
        .signal_keys,
      [
        'critical',
      ],
    )
  },
)

test(
  'prioridade adulterada falha fechado',
  () => {
    const classified =
      classification([
        signal({
          severity:
            'attention',
        }),
      ])

    const priority =
      classifyManagerialPriority(
        classified,
      )

    priority.decision.priority =
      'critical'

    assert.throws(
      () =>
        classifyManagerialRecommendations(
          classified,
          priority,
        ),

      error =>
        error instanceof
          ManagerialRecommendationClassifierError &&
        error.code ===
          'PRIORITY_MISMATCH',
    )
  },
)

test(
  'classificador não cria escrita automática em CRM Agenda ou operação',
  () => {
    const result =
      run([
        signal({
          severity:
            'critical',

          recurrence:
            'repeated',

          cycleIds: [
            'cycle-1',
            'cycle-2',
          ],
        }),
      ])

    const recommendation =
      result.recommendations[0]

    assert.equal(
      Object.prototype
        .hasOwnProperty.call(
          recommendation,
          'apply',
        ),
      false,
    )

    assert.equal(
      Object.prototype
        .hasOwnProperty.call(
          recommendation,
          'crm_write',
        ),
      false,
    )

    assert.equal(
      Object.prototype
        .hasOwnProperty.call(
          recommendation,
          'agenda_write',
        ),
      false,
    )

    assert.equal(
      recommendation.advisory_only,
      true,
    )
  },
)

test(
  'recomendações são determinísticas e não modificam sinais nem prioridade',
  () => {
    const classified =
      classification([
        signal({
          key:
            'attention-b',

          severity:
            'attention',
        }),

        signal({
          key:
            'attention-a',

          severity:
            'attention',
        }),
      ])

    const priority =
      classifyManagerialPriority(
        classified,
      )

    const beforeSignals =
      clone(
        classified,
      )

    const beforePriority =
      clone(
        priority,
      )

    const first =
      classifyManagerialRecommendations(
        classified,
        priority,
      )

    const second =
      classifyManagerialRecommendations(
        classified,
        priority,
      )

    assert.deepEqual(
      classified,
      beforeSignals,
    )

    assert.deepEqual(
      priority,
      beforePriority,
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
  },
)
