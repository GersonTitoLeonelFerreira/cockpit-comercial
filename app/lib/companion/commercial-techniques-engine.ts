import type {
  CompanionDiagnosticInput,
} from './diagnostic-input'

import type {
  CommercialReading,
} from './commercial-reading-contract'

import type {
  RankedCommercialIntelligenceEntry,
} from './commercial-intelligence-contract'

import type {
  SellerExecutionTrace,
} from './seller-execution-trace'

import type {
  SellerSequenceMethodAssessment,
} from './seller-sequence-method-assessment'

export const COMMERCIAL_TECHNIQUES_ENGINE_VERSION =
  'commercial-techniques-engine-v1' as const

export type CommercialTechniqueApplicabilityStatus =
  | 'applicable'
  | 'conditional'
  | 'blocked'

export type CommercialTechniqueDecision = {
  intelligence_id: string
  status:
    CommercialTechniqueApplicabilityStatus
  score: number
  reasons: string[]
  unmet_requirements: string[]
}

export type CommercialTechniqueContext = {
  contract_version:
    typeof COMMERCIAL_TECHNIQUES_ENGINE_VERSION

  supplemental_signals: string[]

  grounded_options: {
    scheduling_option_count: number
    scheduling_fact_keys: string[]
    product_option_count: number
    product_ids: string[]
    has_multiple_valid_options: boolean
  }

  sequence: {
    waiting_for_customer: boolean
    stale_waiting_for_customer: boolean
    customer_fact_after_action: boolean
    last_action_type: string | null
  }

  customer: {
    active_intent:
      SellerExecutionTrace[
        'summary'
      ]['active_customer_intent']
    has_open_objection: boolean
  }

  signals: string[]
  situations: string[]
}

export type CommercialTechniqueSelection = {
  selected_ranked:
    RankedCommercialIntelligenceEntry[]
  decisions:
    CommercialTechniqueDecision[]
  limitations: string[]
  restrictions: string[]
}

function normalizeText(
  value: string,
): string {
  return value
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      '',
    )
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function unique<T>(
  values: T[],
): T[] {
  return Array.from(
    new Set(values),
  )
}

function isSchedulingAvailabilityFact({
  category,
  fact_key,
}: {
  category: string
  fact_key: string
}): boolean {
  const identity =
    normalizeText(
      `${category} ${fact_key}`,
    )

  return [
    'availability',
    'available slot',
    'appointment slot',
    'schedule option',
    'scheduling option',
    'disponibilidade',
    'horario disponivel',
    'horarios disponiveis',
    'opcao de agendamento',
    'opcoes de agendamento',
    'agenda disponivel',
  ].some(
    marker =>
      identity.includes(
        normalizeText(marker),
      ),
  )
}

function countConcreteTimes(
  value: string,
): number {
  const matches =
    normalizeText(value)
      .match(
        /\b(?:[01]?\d|2[0-3])(?::[0-5]\d|h(?:[0-5]\d)?)\b/g,
      ) ??
    []

  return new Set(matches)
    .size
}

function groundedSchedulingOptions(
  input: CompanionDiagnosticInput,
): {
  count: number
  fact_keys: string[]
} {
  const facts =
    input.commercial_context
      .facts
      .filter(
        fact =>
          fact.validity_status ===
            'current' &&
          isSchedulingAvailabilityFact(
            fact,
          ),
      )

  let count = 0

  for (const fact of facts) {
    const concreteTimes =
      countConcreteTimes(
        fact.fact_value,
      )

    count +=
      Math.max(
        1,
        concreteTimes,
      )
  }

  return {
    count,
    fact_keys:
      facts.map(
        fact =>
          fact.fact_key,
      ),
  }
}

function groundedProductOptions({
  reading,
  input,
}: {
  reading: CommercialReading
  input: CompanionDiagnosticInput
}): {
  count: number
  product_ids: string[]
} {
  const discussed =
    new Set(
      reading.customer
        .discussed_products
        .map(
          product =>
            product.canonical_product_id,
        )
        .filter(
          (
            productId,
          ): productId is string =>
            Boolean(
              productId,
            ),
        ),
    )

  const productIds =
    input.commercial_context
      .products
      .filter(
        product =>
          product.active !== false &&
          discussed.has(
            product.product_id,
          ),
      )
      .map(
        product =>
          product.product_id,
      )

  return {
    count:
      productIds.length,
    product_ids:
      productIds,
  }
}

function hasContextMatch(
  ranked:
    RankedCommercialIntelligenceEntry,
): boolean {
  return (
    ranked.matched_signals.length > 0 ||
    ranked.matched_situations.length >
      0 ||
    ranked.matched_objectives.length >
      0
  )
}

function contains(
  values: string[],
  value: string,
): boolean {
  return values.includes(
    value,
  )
}

function buildDecision({
  ranked,
  context,
}: {
  ranked:
    RankedCommercialIntelligenceEntry
  context:
    CommercialTechniqueContext
}): CommercialTechniqueDecision {
  const id =
    ranked.entry.id

  const reasons: string[] = [
    ...ranked.ranking_reasons,
  ]

  const unmet: string[] = []

  if (!hasContextMatch(ranked)) {
    return {
      intelligence_id:
        id,
      status: 'blocked',
      score:
        ranked.score,
      reasons,
      unmet_requirements: [
        'contextual_match_required',
      ],
    }
  }

  if (
    id ===
      'technique.guided_choice'
  ) {
    if (
      context.sequence
        .waiting_for_customer &&
      context.sequence
        .last_action_type ===
          'scheduling_guided_choice' &&
      !context.sequence
        .customer_fact_after_action
    ) {
      return {
        intelligence_id:
          id,
        status: 'blocked',
        score:
          ranked.score,
        reasons: [
          ...reasons,
          'A escolha guiada já foi executada e a próxima resposta está com o cliente.',
        ],
        unmet_requirements: [
          'do_not_repeat_completed_guided_choice',
        ],
      }
    }

    if (
      !context.grounded_options
        .has_multiple_valid_options
    ) {
      unmet.push(
        'grounded_multiple_valid_options_required',
      )

      return {
        intelligence_id:
          id,
        status:
          'conditional',
        score:
          ranked.score,
        reasons: [
          ...reasons,
          'Escolha guiada só pode virar ação quando existirem ao menos duas opções reais groundeadas em conhecimento atual.',
        ],
        unmet_requirements:
          unmet,
      }
    }

    reasons.push(
      'Existem múltiplas opções válidas groundeadas no contexto canônico.',
    )
  }

  if (
    id ===
      'technique.commitment_wait'
  ) {
    if (
      context.sequence
        .stale_waiting_for_customer
    ) {
      return {
        intelligence_id:
          id,
        status: 'blocked',
        score:
          ranked.score,
        reasons: [
          ...reasons,
          'A espera já ultrapassou a janela operacional padrão; continuar aguardando passivamente deixa de ser o melhor próximo movimento.',
        ],
        unmet_requirements: [
          'fresh_wait_required',
        ],
      }
    }

    if (
      context.sequence
        .customer_fact_after_action
    ) {
      return {
        intelligence_id:
          id,
        status: 'blocked',
        score:
          ranked.score,
        reasons: [
          ...reasons,
          'Surgiu fato novo do cliente depois da ação anterior.',
        ],
        unmet_requirements: [
          'no_new_customer_fact_after_action',
        ],
      }
    }

    if (
      !context.sequence
        .waiting_for_customer
    ) {
      return {
        intelligence_id:
          id,
        status:
          'conditional',
        score:
          ranked.score,
        reasons,
        unmet_requirements: [
          'waiting_for_customer_required',
        ],
      }
    }
  }

  if (
    id ===
      'technique.contextual_reengagement'
  ) {
    if (
      context.sequence
        .customer_fact_after_action
    ) {
      return {
        intelligence_id:
          id,
        status: 'blocked',
        score:
          ranked.score,
        reasons: [
          ...reasons,
          'Surgiu fato novo do cliente; a prioridade é responder ao novo contexto, não executar uma retomada.',
        ],
        unmet_requirements: [
          'no_new_customer_fact_after_action',
        ],
      }
    }

    if (
      context.sequence
        .waiting_for_customer &&
      context.sequence
        .last_action_type ===
          'reengagement'
    ) {
      return {
        intelligence_id:
          id,
        status: 'blocked',
        score:
          ranked.score,
        reasons: [
          ...reasons,
          'A retomada já foi executada e agora a próxima resposta depende do cliente.',
        ],
        unmet_requirements: [
          'do_not_repeat_reengagement',
        ],
      }
    }

    const hasRecoverySignal =
      contains(
        context.signals,
        'sequence_break',
      ) ||
      contains(
        context.situations,
        'duplicate_followup',
      ) ||
      context.sequence
        .stale_waiting_for_customer

    if (!hasRecoverySignal) {
      return {
        intelligence_id:
          id,
        status:
          'conditional',
        score:
          ranked.score,
        reasons,
        unmet_requirements: [
          'continuity_break_required',
        ],
      }
    }
  }

  if (
    id ===
      'technique.objection_isolation'
  ) {
    if (
      !context.customer
        .has_open_objection
    ) {
      return {
        intelligence_id:
          id,
        status: 'conditional',
        score:
          ranked.score,
        reasons,
        unmet_requirements: [
          'open_objection_required',
        ],
      }
    }

    if (
      context.sequence
        .last_action_type !==
          'objection_probe'
    ) {
      return {
        intelligence_id:
          id,
        status: 'conditional',
        score:
          ranked.score,
        reasons: [
          ...reasons,
          'Primeiro é preciso entender a causa da objeção antes de isolar se ela é a principal trava.',
        ],
        unmet_requirements: [
          'objection_diagnosis_first',
        ],
      }
    }
  }

  if (
    id ===
      'technique.explicit_close_execution'
  ) {
    if (
      context.customer
        .active_intent
        ?.kind !== 'close'
    ) {
      return {
        intelligence_id:
          id,
        status: 'conditional',
        score:
          ranked.score,
        reasons,
        unmet_requirements: [
          'explicit_close_intent_required',
        ],
      }
    }
  }

  if (
    id ===
      'technique.decision_criteria_clarification' &&
    !contains(
      context.signals,
      'missing_decision_criterion',
    )
  ) {
    return {
      intelligence_id:
        id,
      status: 'conditional',
      score:
        ranked.score,
      reasons,
      unmet_requirements: [
        'decision_criterion_gap_required',
      ],
    }
  }

  if (
    id ===
      'technique.impact_exploration' &&
    !contains(
      context.signals,
      'missing_impact',
    )
  ) {
    return {
      intelligence_id:
        id,
      status: 'conditional',
      score:
        ranked.score,
      reasons,
      unmet_requirements: [
        'impact_gap_required',
      ],
    }
  }

  if (
    id ===
      'technique.value_linkage' &&
    !(
      contains(
        context.signals,
        'need_known',
      ) ||
      contains(
        context.signals,
        'decision_criteria_known',
      )
    )
  ) {
    return {
      intelligence_id:
        id,
      status: 'conditional',
      score:
        ranked.score,
      reasons,
      unmet_requirements: [
        'known_need_or_decision_criterion_required',
      ],
    }
  }

  if (
    id ===
      'technique.evidence_based_reassurance' &&
    !contains(
      context.signals,
      'uncertainty_open',
    )
  ) {
    return {
      intelligence_id:
        id,
      status: 'conditional',
      score:
        ranked.score,
      reasons,
      unmet_requirements: [
        'uncertainty_required',
      ],
    }
  }

  if (
    id ===
      'technique.comparison_by_criteria' &&
    !contains(
      context.signals,
      'decision_criteria_known',
    )
  ) {
    return {
      intelligence_id:
        id,
      status: 'conditional',
      score:
        ranked.score,
      reasons,
      unmet_requirements: [
        'decision_criteria_required',
      ],
    }
  }

  if (
    id ===
      'technique.commitment_ladder' &&
    !contains(
      context.signals,
      'customer_intent_hot',
    )
  ) {
    return {
      intelligence_id:
        id,
      status: 'conditional',
      score:
        ranked.score,
      reasons,
      unmet_requirements: [
        'active_customer_intent_required',
      ],
    }
  }

  if (
    id ===
      'technique.discovery_before_prescription'
  ) {
    if (
      context.sequence
        .waiting_for_customer
    ) {
      return {
        intelligence_id:
          id,
        status: 'blocked',
        score:
          ranked.score,
        reasons: [
          ...reasons,
          'O vendedor já transferiu a próxima resposta ao cliente.',
        ],
        unmet_requirements: [
          'do_not_repeat_discovery_while_waiting',
        ],
      }
    }

    if (
      contains(
        context.signals,
        'late_discovery_after_close_intent',
      )
    ) {
      return {
        intelligence_id:
          id,
        status: 'blocked',
        score:
          ranked.score,
        reasons: [
          ...reasons,
          'A intenção explícita de fechamento torna nova descoberta genérica inadequada neste momento.',
        ],
        unmet_requirements: [
          'do_not_delay_explicit_close_intent',
        ],
      }
    }
  }

  if (
    id ===
      'technique.objection_diagnosis'
  ) {
    if (
      context.sequence
        .waiting_for_customer &&
      context.sequence
        .last_action_type ===
          'objection_probe'
    ) {
      return {
        intelligence_id:
          id,
        status: 'blocked',
        score:
          ranked.score,
        reasons: [
          ...reasons,
          'O vendedor já fez a pergunta diagnóstica e precisa aguardar a resposta.',
        ],
        unmet_requirements: [
          'do_not_repeat_objection_probe',
        ],
      }
    }

    if (
      !context.customer
        .has_open_objection
    ) {
      return {
        intelligence_id:
          id,
        status:
          'conditional',
        score:
          ranked.score,
        reasons,
        unmet_requirements: [
          'open_objection_required',
        ],
      }
    }
  }

  return {
    intelligence_id:
      id,
    status: 'applicable',
    score:
      ranked.score,
    reasons,
    unmet_requirements: [],
  }
}

export function buildCommercialTechniqueContext({
  reading,
  diagnostic_input,
  trace,
  sequence_method,
  reading_signals = [],
  reading_situations = [],
}: {
  reading: CommercialReading
  diagnostic_input:
    CompanionDiagnosticInput
  trace: SellerExecutionTrace
  sequence_method:
    SellerSequenceMethodAssessment
  reading_signals?: string[]
  reading_situations?: string[]
}): CommercialTechniqueContext {
  const scheduleOptions =
    groundedSchedulingOptions(
      diagnostic_input,
    )

  const productOptions =
    groundedProductOptions({
      reading,
      input:
        diagnostic_input,
    })

  const schedulingContext =
    sequence_method.situations
      .includes(
        'scheduling_choice',
      )

  const productContext =
    sequence_method.situations
      .includes(
        'product_choice',
      )

  const multipleValidOptions =
    (
      schedulingContext &&
      scheduleOptions.count >= 2
    ) ||
    (
      productContext &&
      productOptions.count >= 2
    )

  const lastEvent =
    trace.events.length > 0
      ? trace.events[
          trace.events.length - 1
        ]
      : null

  const supplementalSignals =
    multipleValidOptions
      ? [
          'multiple_valid_options',
        ]
      : []

  if (
    schedulingContext &&
    trace.summary
      .active_customer_intent
      ?.kind === 'scheduling' &&
    !sequence_method.sequence
      .waiting_for_customer
  ) {
    supplementalSignals.push(
      'customer_waiting_for_options',
    )
  }

  const readingWaitsForCustomer =
    (
      reading.best_approach
        .decision === 'wait' ||
      reading.best_approach
        .decision === 'give_space'
    ) &&
    !sequence_method.sequence
      .customer_fact_after_action

  return {
    contract_version:
      COMMERCIAL_TECHNIQUES_ENGINE_VERSION,
    supplemental_signals:
      unique(
        supplementalSignals,
      ),
    grounded_options: {
      scheduling_option_count:
        scheduleOptions.count,
      scheduling_fact_keys:
        scheduleOptions.fact_keys,
      product_option_count:
        productOptions.count,
      product_ids:
        productOptions.product_ids,
      has_multiple_valid_options:
        multipleValidOptions,
    },
    sequence: {
      waiting_for_customer:
        sequence_method.sequence
          .waiting_for_customer ||
        readingWaitsForCustomer,
      stale_waiting_for_customer:
        sequence_method.sequence
          .stale_waiting_for_customer,
      customer_fact_after_action:
        sequence_method.sequence
          .customer_fact_after_action,
      last_action_type:
        lastEvent?.action_type ??
        null,
    },
    customer: {
      active_intent:
        trace.summary
          .active_customer_intent,
      has_open_objection:
        reading.customer
          .objections.length > 0 ||
        reading.risks
          .customer_objections.length >
          0,
    },
    signals:
      unique([
        ...reading_signals,
        ...sequence_method.signals,
      ]),
    situations:
      unique([
        ...reading_situations,
        ...sequence_method.situations,
      ]),
  }
}

export function selectApplicableCommercialTechniques({
  ranked,
  context,
}: {
  ranked:
    RankedCommercialIntelligenceEntry[]
  context:
    CommercialTechniqueContext
}): CommercialTechniqueSelection {
  const candidates =
    ranked.filter(
      item =>
        item.entry.kind ===
          'technique' ||
        item.entry.kind ===
          'principle',
    )

  const decisions =
    candidates.map(
      rankedItem =>
        buildDecision({
          ranked:
            rankedItem,
          context,
        }),
    )

  const allowedIds =
    new Set(
      decisions
        .filter(
          decision =>
            decision.status ===
              'applicable',
        )
        .map(
          decision =>
            decision.intelligence_id,
        ),
    )

  const selectedRanked =
    candidates.filter(
      item =>
        allowedIds.has(
          item.entry.id,
        ),
    )

  const limitations =
    decisions.flatMap(
      decision =>
        decision.status ===
          'applicable'
          ? []
          : decision
              .unmet_requirements
              .map(
                requirement =>
                  `technique_condition_unmet:${decision.intelligence_id}:${requirement}`,
              ),
    )

  const restrictions: string[] = []

  const guidedChoice =
    decisions.find(
      decision =>
        decision.intelligence_id ===
          'technique.guided_choice',
    )

  if (
    guidedChoice &&
    guidedChoice.status !==
      'applicable'
  ) {
    restrictions.push(
      'Não inventar horários, vagas, produtos ou alternativas para forçar uma escolha guiada; use apenas opções atuais groundeadas.',
    )
  }

  if (
    decisions.some(
      decision =>
        decision.unmet_requirements
          .includes(
            'do_not_repeat_completed_guided_choice',
          ),
    )
  ) {
    restrictions.push(
      'Não repetir uma escolha guiada que já foi apresentada enquanto a resposta ainda depende do cliente.',
    )
  }

  return {
    selected_ranked:
      selectedRanked,
    decisions,
    limitations:
      unique(limitations),
    restrictions:
      unique(restrictions),
  }
}
