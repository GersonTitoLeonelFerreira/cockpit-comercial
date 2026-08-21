import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ManagerialPriorityClassifierError,
  classifyManagerialPriority,
} from './managerial-priority-classifier.ts'

function signal({
  key =
    'signal-1',

  severity =
    'informational',

  direction =
    'risk',

  category =
    'seller_behavior',

  kind =
    'insufficient_discovery',
} = {}) {
  return {
    signal_key:
      key,

    category,
    kind,
    direction,
    severity,

    recurrence:
      'isolated',

    summary:
      'Sinal comprovado.',

    impact:
      'Impacto comprovado.',

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

    analysis_event_ids: [
      'analysis-1',
    ],

    action_event_ids: [],

    cycle_event_ids: [],

    requires_human_review:
      true,
  }
}

function classification({
  signals = [],
} = {}) {
  return {
    company_id:
      'company-1',

    semantic_sample_size:
      1,

    action_sample_size:
      0,

    signals,
  }
}

function clone(value) {
  return JSON.parse(
    JSON.stringify(value),
  )
}

test(
  'ausência de sinais produz prioridade none sem intervenção',
  () => {
    const result =
      classifyManagerialPriority(
        classification(),
      )

    assert.equal(
      result.decision.priority,
      'none',
    )

    assert.equal(
      result
        .decision
        .intervention_needed,
      false,
    )

    assert.deepEqual(
      result
        .decision
        .signal_keys,
      [],
    )

    assert.equal(
      result
        .decision
        .requires_human_judgment,
      true,
    )
  },
)

test(
  'sinais apenas informativos produzem prioridade informational',
  () => {
    const result =
      classifyManagerialPriority(
        classification({
          signals: [
            signal({
              key:
                'info-b',
            }),

            signal({
              key:
                'info-a',
            }),
          ],
        }),
      )

    assert.equal(
      result.decision.priority,
      'informational',
    )

    assert.equal(
      result
        .decision
        .intervention_needed,
      false,
    )

    assert.deepEqual(
      result
        .decision
        .signal_keys,
      [
        'info-a',
        'info-b',
      ],
    )
  },
)

test(
  'padrões positivos e fatos neutros não são promovidos para atenção',
  () => {
    const result =
      classifyManagerialPriority(
        classification({
          signals: [
            signal({
              key:
                'positive',

              severity:
                'informational',

              direction:
                'positive',

              category:
                'positive_pattern',

              kind:
                'seller_strength_pattern',
            }),

            signal({
              key:
                'ai-fact',

              severity:
                'informational',

              direction:
                'neutral',

              category:
                'ai_adoption',

              kind:
                'suggestion_adoption',
            }),
          ],
        }),
      )

    assert.equal(
      result.decision.priority,
      'informational',
    )

    assert.equal(
      result
        .decision
        .intervention_needed,
      false,
    )
  },
)

test(
  'sinal de atenção prevalece sobre sinais informativos',
  () => {
    const result =
      classifyManagerialPriority(
        classification({
          signals: [
            signal({
              key:
                'informational',
            }),

            signal({
              key:
                'attention',

              severity:
                'attention',
            }),
          ],
        }),
      )

    assert.equal(
      result.decision.priority,
      'attention',
    )

    assert.equal(
      result
        .decision
        .intervention_needed,
      true,
    )

    assert.deepEqual(
      result
        .decision
        .signal_keys,
      [
        'attention',
      ],
    )
  },
)

test(
  'sinal crítico prevalece sobre atenção e informativos',
  () => {
    const result =
      classifyManagerialPriority(
        classification({
          signals: [
            signal({
              key:
                'info',
            }),

            signal({
              key:
                'attention',

              severity:
                'attention',
            }),

            signal({
              key:
                'critical',

              severity:
                'critical',
            }),
          ],
        }),
      )

    assert.equal(
      result.decision.priority,
      'critical',
    )

    assert.equal(
      result
        .decision
        .intervention_needed,
      true,
    )

    assert.deepEqual(
      result
        .decision
        .signal_keys,
      [
        'critical',
      ],
    )
  },
)

test(
  'todos os sinais da severidade máxima sustentam a decisão em ordem estável',
  () => {
    const result =
      classifyManagerialPriority(
        classification({
          signals: [
            signal({
              key:
                'critical-z',

              severity:
                'critical',
            }),

            signal({
              key:
                'attention',

              severity:
                'attention',
            }),

            signal({
              key:
                'critical-a',

              severity:
                'critical',
            }),
          ],
        }),
      )

    assert.deepEqual(
      result
        .decision
        .signal_keys,
      [
        'critical-a',
        'critical-z',
      ],
    )
  },
)

test(
  'volume de sinais informativos não cria escalonamento artificial',
  () => {
    const signals =
      Array.from(
        {
          length: 20,
        },
        (_, index) =>
          signal({
            key:
              'info-' +
              index,
          }),
      )

    const result =
      classifyManagerialPriority(
        classification({
          signals,
        }),
      )

    assert.equal(
      result.decision.priority,
      'informational',
    )

    assert.equal(
      result
        .decision
        .intervention_needed,
      false,
    )

    assert.equal(
      result
        .decision
        .signal_keys
        .length,
      20,
    )
  },
)

test(
  'A5.4.2 não cria recomendação ação coaching ou automação operacional',
  () => {
    const result =
      classifyManagerialPriority(
        classification({
          signals: [
            signal({
              severity:
                'critical',
            }),
          ],
        }),
      )

    assert.equal(
      Object.prototype
        .hasOwnProperty.call(
          result,
          'recommendations',
        ),
      false,
    )

    assert.equal(
      Object.prototype
        .hasOwnProperty.call(
          result.decision,
          'recommendations',
        ),
      false,
    )

    const serialized =
      JSON.stringify(result)

    assert.equal(
      serialized.includes(
        'coach_seller',
      ),
      false,
    )

    assert.equal(
      serialized.includes(
        'train_team',
      ),
      false,
    )

    assert.equal(
      serialized.includes(
        'intervene_opportunity',
      ),
      false,
    )
  },
)

test(
  'chaves de sinal duplicadas falham fechado',
  () => {
    assert.throws(
      () =>
        classifyManagerialPriority(
          classification({
            signals: [
              signal({
                key:
                  'duplicate',
              }),

              signal({
                key:
                  'duplicate',

                severity:
                  'attention',
              }),
            ],
          }),
        ),

      error =>
        error instanceof
          ManagerialPriorityClassifierError &&
        error.code ===
          'DUPLICATE_SIGNAL_KEY',
    )
  },
)

test(
  'severidade inválida falha fechado',
  () => {
    const invalid =
      signal()

    invalid.severity =
      'urgent'

    assert.throws(
      () =>
        classifyManagerialPriority(
          classification({
            signals: [
              invalid,
            ],
          }),
        ),

      error =>
        error instanceof
          ManagerialPriorityClassifierError &&
        error.code ===
          'INVALID_SEVERITY',
    )
  },
)

test(
  'sinal sem revisão humana obrigatória falha fechado',
  () => {
    const invalid =
      signal()

    invalid
      .requires_human_review =
      false

    assert.throws(
      () =>
        classifyManagerialPriority(
          classification({
            signals: [
              invalid,
            ],
          }),
        ),

      error =>
        error instanceof
          ManagerialPriorityClassifierError &&
        error.code ===
          'HUMAN_REVIEW_REQUIRED',
    )
  },
)

test(
  'priorização é determinística e não modifica a classificação de sinais',
  () => {
    const input =
      classification({
        signals: [
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
        ],
      })

    const before =
      clone(input)

    const first =
      classifyManagerialPriority(
        input,
      )

    const second =
      classifyManagerialPriority(
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
        .includes(
          'undefined',
        ),
      false,
    )
  },
)
