import {
  classifyManagerialPriority,
  type ManagerialPriorityClassification,
} from './managerial-priority-classifier'

import type {
  ManagerialSignalClassification,
} from './managerial-signal-classifier'

import type {
  ManagerialIntelligenceRecommendation,
  ManagerialIntelligenceRecommendationAction,
  ManagerialIntelligenceSignal,
} from './managerial-intelligence-contract'

export type ManagerialRecommendationClassification = {
  company_id: string

  recommendations:
    ManagerialIntelligenceRecommendation[]
}

export class ManagerialRecommendationClassifierError
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
      'ManagerialRecommendationClassifierError'

    this.code = code
    this.path = path
  }
}

function fail(
  code: string,
  path: string,
  message: string,
): never {
  throw new ManagerialRecommendationClassifierError(
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

function arraysEqual(
  left: string[],
  right: string[],
): boolean {
  if (
    left.length !==
    right.length
  ) {
    return false
  }

  return left.every(
    (value, index) =>
      value === right[index],
  )
}

function ensureCanonicalPriority(
  classification:
    ManagerialSignalClassification,
  priority:
    ManagerialPriorityClassification,
): void {
  if (
    classification.company_id !==
    priority.company_id
  ) {
    fail(
      'COMPANY_MISMATCH',
      'company_id',
      'Sinais e prioridade pertencem a empresas diferentes.',
    )
  }

  const canonical =
    classifyManagerialPriority(
      classification,
    )

  const expectedKeys =
    uniqueSorted(
      canonical
        .decision
        .signal_keys,
    )

  const receivedKeys =
    uniqueSorted(
      priority
        .decision
        .signal_keys,
    )

  if (
    canonical.company_id !==
      priority.company_id ||
    canonical
      .decision
      .priority !==
      priority
        .decision
        .priority ||
    canonical
      .decision
      .intervention_needed !==
      priority
        .decision
        .intervention_needed ||
    canonical
      .decision
      .reason !==
      priority
        .decision
        .reason ||
    canonical
      .decision
      .requires_human_judgment !==
      priority
        .decision
        .requires_human_judgment ||
    !arraysEqual(
      expectedKeys,
      receivedKeys,
    )
  ) {
    fail(
      'PRIORITY_MISMATCH',
      'priority.decision',
      'A prioridade recebida não corresponde à classificação determinística dos sinais.',
    )
  }
}

function reasonForAction(
  action:
    ManagerialIntelligenceRecommendationAction,
): string {
  if (action === 'no_action') {
    return 'Nenhuma intervenção gerencial é recomendada com as evidências atuais.'
  }

  if (action === 'observe') {
    return 'Acompanhar o padrão comprovado sem transformar o sinal em intervenção automática.'
  }

  if (
    action ===
    'coach_seller'
  ) {
    return 'Revisar com o vendedor o padrão comercial comprovado nas oportunidades afetadas.'
  }

  if (
    action ===
    'train_team'
  ) {
    return 'Revisar o padrão sistêmico com a equipe, preservando julgamento humano sobre a intervenção adequada.'
  }

  if (
    action ===
    'review_process'
  ) {
    return 'Revisar o processo comercial relacionado ao padrão comprovado antes de alterar a operação.'
  }

  if (
    action ===
    'verify_information'
  ) {
    return 'Verificar a informação comercial comprovadamente envolvida antes de orientar nova comunicação ou decisão.'
  }

  if (
    action ===
    'intervene_opportunity'
  ) {
    return 'Revisar humanamente a oportunidade comprovadamente afetada antes de qualquer ação comercial.'
  }

  return 'Coletar mais evidência antes de recomendar uma intervenção gerencial específica.'
}

type RecommendationDraft =
  ManagerialIntelligenceRecommendation

function makeRecommendation(
  action:
    ManagerialIntelligenceRecommendationAction,
  targetType:
    ManagerialIntelligenceRecommendation['target_type'],
  targetId: string | null,
  signalKeys: string[],
): RecommendationDraft {
  return {
    action,

    target_type:
      targetType,

    target_id:
      targetId,

    reason:
      reasonForAction(
        action,
      ),

    signal_keys:
      uniqueSorted(
        signalKeys,
      ),

    advisory_only:
      true,
  }
}

function observationRecommendations(
  signal:
    ManagerialIntelligenceSignal,
): RecommendationDraft[] {
  if (
    signal.category ===
    'opportunity_risk'
  ) {
    return uniqueSorted(
      signal
        .affected_cycle_ids,
    ).map(
      cycleId =>
        makeRecommendation(
          'observe',
          'opportunity',
          cycleId,
          [
            signal.signal_key,
          ],
        ),
    )
  }

  if (
    [
      'seller_behavior',
      'method_execution',
      'positive_pattern',
    ].includes(
      signal.category,
    )
  ) {
    const sellers =
      uniqueSorted(
        signal
          .affected_seller_user_ids,
      )

    if (
      signal.recurrence ===
        'systemic' &&
      sellers.length >= 2
    ) {
      return [
        makeRecommendation(
          'observe',
          'team',
          null,
          [
            signal.signal_key,
          ],
        ),
      ]
    }

    if (
      sellers.length ===
      1
    ) {
      return [
        makeRecommendation(
          'observe',
          'seller',
          sellers[0],
          [
            signal.signal_key,
          ],
        ),
      ]
    }
  }

  return [
    makeRecommendation(
      'observe',
      'process',
      null,
      [
        signal.signal_key,
      ],
    ),
  ]
}

function informationVerificationRecommendation(
  signal:
    ManagerialIntelligenceSignal,
): RecommendationDraft {
  const sellers =
    uniqueSorted(
      signal
        .affected_seller_user_ids,
    )

  if (
    sellers.length ===
    1
  ) {
    return makeRecommendation(
      'verify_information',
      'seller',
      sellers[0],
      [
        signal.signal_key,
      ],
    )
  }

  return makeRecommendation(
    'verify_information',
    'process',
    null,
    [
      signal.signal_key,
    ],
  )
}

function sellerInterventionRecommendation(
  signal:
    ManagerialIntelligenceSignal,
): RecommendationDraft {
  const sellers =
    uniqueSorted(
      signal
        .affected_seller_user_ids,
    )

  if (
    signal.recurrence ===
      'systemic' &&
    sellers.length >= 2
  ) {
    return makeRecommendation(
      'train_team',
      'team',
      null,
      [
        signal.signal_key,
      ],
    )
  }

  if (
    sellers.length ===
    1
  ) {
    return makeRecommendation(
      'coach_seller',
      'seller',
      sellers[0],
      [
        signal.signal_key,
      ],
    )
  }

  return makeRecommendation(
    'collect_more_evidence',
    'none',
    null,
    [
      signal.signal_key,
    ],
  )
}

function interventionRecommendations(
  signal:
    ManagerialIntelligenceSignal,
): RecommendationDraft[] {
  if (
    [
      'incorrect_information',
      'promise_risk',
    ].includes(
      signal.kind,
    )
  ) {
    return [
      informationVerificationRecommendation(
        signal,
      ),
    ]
  }

  if (
    [
      'seller_behavior',
      'method_execution',
    ].includes(
      signal.category,
    )
  ) {
    return [
      sellerInterventionRecommendation(
        signal,
      ),
    ]
  }

  if (
    [
      'customer_pattern',
      'process_execution',
      'commercial_result',
    ].includes(
      signal.category,
    )
  ) {
    return [
      makeRecommendation(
        'review_process',
        'process',
        null,
        [
          signal.signal_key,
        ],
      ),
    ]
  }

  if (
    signal.category ===
    'opportunity_risk'
  ) {
    const cycles =
      uniqueSorted(
        signal
          .affected_cycle_ids,
      )

    if (
      cycles.length ===
      0
    ) {
      return [
        makeRecommendation(
          'collect_more_evidence',
          'none',
          null,
          [
            signal.signal_key,
          ],
        ),
      ]
    }

    return cycles.map(
      cycleId =>
        makeRecommendation(
          'intervene_opportunity',
          'opportunity',
          cycleId,
          [
            signal.signal_key,
          ],
        ),
    )
  }

  return observationRecommendations(
    signal,
  )
}

function mergeRecommendations(
  drafts:
    RecommendationDraft[],
): ManagerialIntelligenceRecommendation[] {
  const merged =
    new Map<
      string,
      ManagerialIntelligenceRecommendation
    >()

  for (const draft of drafts) {
    const key =
      JSON.stringify([
        draft.action,
        draft.target_type,
        draft.target_id,
      ])

    const existing =
      merged.get(key)

    if (!existing) {
      merged.set(
        key,
        {
          ...draft,

          signal_keys:
            uniqueSorted(
              draft.signal_keys,
            ),
        },
      )

      continue
    }

    existing.signal_keys =
      uniqueSorted([
        ...existing
          .signal_keys,
        ...draft
          .signal_keys,
      ])
  }

  return Array.from(
    merged.values(),
  ).sort(
    (left, right) => {
      const leftKey =
        [
          left.action,
          left.target_type,
          left.target_id ?? '',
        ].join(':')

      const rightKey =
        [
          right.action,
          right.target_type,
          right.target_id ?? '',
        ].join(':')

      return leftKey
        .localeCompare(
          rightKey,
        )
    },
  )
}

export function classifyManagerialRecommendations(
  classification:
    ManagerialSignalClassification,
  priority:
    ManagerialPriorityClassification,
): ManagerialRecommendationClassification {
  ensureCanonicalPriority(
    classification,
    priority,
  )

  if (
    priority
      .decision
      .priority ===
    'none'
  ) {
    return {
      company_id:
        classification.company_id,

      recommendations: [
        makeRecommendation(
          'no_action',
          'none',
          null,
          [],
        ),
      ],
    }
  }

  const signalMap =
    new Map(
      classification
        .signals
        .map(
          signal => [
            signal.signal_key,
            signal,
          ],
        ),
    )

  const supportingSignals =
    priority
      .decision
      .signal_keys
      .map(
        signalKey => {
          const signal =
            signalMap.get(
              signalKey,
            )

          if (!signal) {
            fail(
              'UNKNOWN_SIGNAL',
              'priority.decision.signal_keys',
              'A decisão referencia um sinal inexistente: ' +
                signalKey,
            )
          }

          return signal
        },
      )

  const drafts =
    supportingSignals
      .flatMap(
        signal =>
          priority
            .decision
            .intervention_needed
            ? interventionRecommendations(
                signal,
              )
            : observationRecommendations(
                signal,
              ),
      )

  return {
    company_id:
      classification.company_id,

    recommendations:
      mergeRecommendations(
        drafts,
      ),
  }
}
