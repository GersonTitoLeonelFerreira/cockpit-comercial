import type {
  CompanionDiagnosticInput,
} from './diagnostic-input'

import type {
  CommercialReading,
  CommercialReadingEvidenceItem,
} from './commercial-reading-contract'

import type {
  StatefulCommercialState,
} from './stateful-commercial-state'

import {
  buildCommercialIntelligenceLibrary,
  rankCommercialIntelligence,
} from './commercial-intelligence-library'

import {
  COMMERCIAL_REASONING_CONTRACT_VERSION,
  type CommercialReasoning,
  type CommercialReasoningTechnique,
  type CommercialReasoningKnowledgeReference,
} from './commercial-reasoning-contract'

import type {
  RankedCommercialIntelligenceEntry,
} from './commercial-intelligence-contract'

const MAX_TECHNIQUES = 3
const MAX_KNOWLEDGE_REFERENCES = 5
const MAX_DO_NOT_DO = 5
const MAX_COMPARISONS = 5

function unique(
  values: string[],
): string[] {
  return Array.from(
    new Set(
      values
        .map(value => value.trim())
        .filter(Boolean),
    ),
  )
}

function normalizeSearchText(
  value: string,
): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function evidenceText(
  items: readonly CommercialReadingEvidenceItem[],
): string {
  return items
    .map(item => item.summary)
    .join(' ')
}

function containsAny(
  value: string,
  terms: readonly string[],
): boolean {
  const normalized =
    normalizeSearchText(value)

  return terms.some(
    term =>
      normalized.includes(
        normalizeSearchText(term),
      ),
  )
}

function collectProductIds(
  reading: CommercialReading,
): string[] {
  return unique(
    reading.customer.discussed_products
      .map(
        product =>
          product.canonical_product_id,
      )
      .filter(
        (value): value is string =>
          typeof value === 'string' &&
          Boolean(value.trim()),
      ),
  )
}

function hasActiveKind(
  state: StatefulCommercialState,
  prefix: string,
): boolean {
  return [
    ...state.facts,
    ...state.needs,
    ...state.open_loops,
    ...state.objections,
    ...state.commitments,
    ...state.signals,
    ...state.uncertainties,
  ].some(
    item =>
      item.memory_status === 'active' &&
      item.kind.startsWith(prefix),
  )
}

function hasCanonicalThirdPartyOpportunity(
  state: StatefulCommercialState,
): boolean {
  return (
    hasActiveKind(
      state,
      'commercial_party.current_contact.intermediary',
    ) &&
    hasActiveKind(
      state,
      'commercial_party.related.prospect',
    )
  )
}

function hasSemanticMatch(
  ranked: RankedCommercialIntelligenceEntry,
): boolean {
  return (
    ranked.matched_signals.length > 0 ||
    ranked.matched_situations.length > 0 ||
    ranked.matched_objectives.length > 0
  )
}

function filterReasoningCandidates(
  ranked: RankedCommercialIntelligenceEntry[],
): RankedCommercialIntelligenceEntry[] {
  return ranked.filter((item) => {
    if (
      item.entry.kind !==
        'company_knowledge'
    ) {
      return true
    }

    // Conhecimento de empresa/produto não pode entrar só porque pertence
    // ao mesmo company_id ou product_id. Precisa existir compatibilidade
    // semântica com o momento atual; caso contrário, uma política de
    // pagamento poderia contaminar, por exemplo, uma conversa sobre cirurgia.
    return hasSemanticMatch(item)
  })
}

function buildSituationSignals({
  reading,
  state,
}: {
  reading: CommercialReading
  state: StatefulCommercialState
}): {
  situations: string[]
  signals: string[]
  objectives: string[]
} {
  const situations: string[] = []
  const signals: string[] = []
  const objectives: string[] = [
    reading.best_approach.reason,
  ]

  const objectionText =
    [
      evidenceText(
        reading.customer.objections,
      ),
      reading.risks.customer_objections
        .map(risk => risk.summary)
        .join(' '),
    ].join(' ')

  if (reading.customer.objections.length > 0) {
    situations.push(
      'objection_handling',
    )
    signals.push('objection_open')
  }

  if (
    containsAny(
      objectionText,
      [
        'cartão',
        'cartao',
        'pix',
        'pagamento',
        'limite',
        'boleto',
        'parcela',
      ],
    )
  ) {
    situations.push(
      'payment_objection',
    )
    signals.push(
      'claim_requires_company_knowledge',
    )
  }

  if (
    containsAny(
      objectionText,
      [
        'preço',
        'preco',
        'caro',
        'valor',
        'desconto',
      ],
    )
  ) {
    situations.push(
      'price_objection',
    )
  }

  if (
    reading.customer.missing_discovery.length > 0
  ) {
    situations.push('discovery_gap')

    for (
      const gap of
      reading.customer.missing_discovery
    ) {
      signals.push(
        `missing_${gap.topic}`,
      )
    }
  }

  if (
    reading.method.configured &&
    reading.method.adherence.status !==
      'on_method'
  ) {
    situations.push(
      'method_alignment',
    )
    signals.push('method_configured')
  }

  if (
    hasActiveKind(
      state,
      'commercial_party.related.prospect',
    ) ||
    hasActiveKind(
      state,
      'commercial_party.current_contact.intermediary',
    )
  ) {
    situations.push(
      'third_party_referral',
      'intermediary_contact',
    )
    signals.push(
      'third_party_prospect',
      'intermediary_detected',
    )
  }

  const latestDirection =
    reading.conversation_summary
      .last_customer_request_or_decision
      ? 'customer'
      : null

  const commitmentText =
    reading.customer.commitments
      .filter(
        item =>
          item.status === 'proposed' ||
          item.status === 'confirmed' ||
          item.status === 'reschedule_requested',
      )
      .map(item => item.summary)
      .join(' ')

  if (
    commitmentText &&
    containsAny(
      commitmentText,
      [
        'vou ',
        'te aviso',
        'confirmo',
        'verificar',
        'resolver',
        'amanhã',
        'amanha',
      ],
    )
  ) {
    situations.push(
      'customer_commitment_pending',
      'waiting_for_customer',
    )
    signals.push(
      'waiting_on_customer',
      'customer_future_action',
    )
  }

  if (
    reading.best_approach.decision === 'wait' ||
    reading.best_approach.decision === 'give_space'
  ) {
    situations.push(
      'waiting_for_customer',
    )
    signals.push(
      'waiting_on_customer',
    )
  }

  if (
    latestDirection === 'customer' &&
    reading.communication.intervention_needed
  ) {
    signals.push(
      'seller_response_needed',
    )
  }

  if (
    reading.customer.primary_product_interest
  ) {
    situations.push(
      'product_fit',
    )
    signals.push(
      'claim_requires_company_knowledge',
    )
  }

  if (
    reading.best_approach.decision ===
      'present_solution' ||
    reading.best_approach.decision ===
      'demonstrate_value' ||
    reading.best_approach.decision ===
      'compare'
  ) {
    situations.push(
      'value_explanation',
    )
  }

  return {
    situations:
      unique(situations),
    signals:
      unique(signals),
    objectives:
      unique(objectives),
  }
}

function summarizeRankingReason(
  ranked: RankedCommercialIntelligenceEntry,
): string {
  if (
    ranked.ranking_reasons.length > 0
  ) {
    return ranked.ranking_reasons
      .join(' ')
  }

  return 'Compatível com o contexto comercial atual.'
}

function selectTechniques(
  ranked:
    RankedCommercialIntelligenceEntry[],
): CommercialReasoningTechnique[] {
  return ranked
    .filter(
      item =>
        item.entry.kind === 'technique' ||
        item.entry.kind === 'principle',
    )
    .slice(0, MAX_TECHNIQUES)
    .map(
      item => ({
        intelligence_id:
          item.entry.id,
        title:
          item.entry.title,
        kind:
          item.entry.kind,
        scope:
          item.entry.scope,
        why_applicable:
          summarizeRankingReason(item),
        risks: [
          ...item.entry.risks,
        ],
      }),
    )
}

function selectKnowledge(
  ranked:
    RankedCommercialIntelligenceEntry[],
): CommercialReasoningKnowledgeReference[] {
  return ranked
    .filter(
      item =>
        item.entry.kind ===
          'company_knowledge',
    )
    .slice(
      0,
      MAX_KNOWLEDGE_REFERENCES,
    )
    .map(
      item => ({
        intelligence_id:
          item.entry.id,
        title:
          item.entry.title,
        scope:
          item.entry.scope,
        source_type:
          item.entry.provenance
            .source_type,
        source_id:
          item.entry.provenance
            .source_id,
        product_id:
          item.entry.provenance
            .product_id,
        why_relevant:
          summarizeRankingReason(item),
      }),
    )
}

function buildDoNotDo(
  ranked:
    RankedCommercialIntelligenceEntry[],
  reading:
    CommercialReading,
): string[] {
  const restrictions: string[] = []

  for (
    const item of ranked
  ) {
    if (
      item.entry.kind === 'anti_pattern'
    ) {
      restrictions.push(
        item.entry.title,
      )
    }

    restrictions.push(
      ...item.entry.when_not_to_use,
    )
  }

  for (
    const improvement of
    reading.improvement_points
  ) {
    restrictions.push(
      improvement.how_to_improve,
    )
  }

  return unique(restrictions)
    .slice(0, MAX_DO_NOT_DO)
}

function buildComparison(
  ranked:
    RankedCommercialIntelligenceEntry[],
): CommercialReasoning['comparison'] {
  const similarities =
    unique(
      ranked.flatMap(
        item => [
          ...item.matched_signals.map(
            signal =>
              `Sinal atual compatível: ${signal}.`,
          ),
          ...item.matched_situations.map(
            situation =>
              `Situação atual compatível: ${situation}.`,
          ),
        ],
      ),
    )
      .slice(0, MAX_COMPARISONS)

  const differences =
    unique(
      ranked.flatMap(
        item =>
          item.entry.when_not_to_use
            .slice(0, 1)
            .map(
              restriction =>
                `Limite que ainda precisa ser respeitado em ${item.entry.title}: ${restriction}`,
            ),
      ),
    )
      .slice(0, MAX_COMPARISONS)

  return {
    similarities,
    differences,
  }
}

function inferObjectiveNow(
  reading: CommercialReading,
): string {
  if (
    reading.method.recovery_guidance
  ) {
    return reading.method
      .recovery_guidance
      .objective
  }

  return reading.best_approach.reason
}

function buildCurrentSituation(
  reading: CommercialReading,
): string {
  return reading
    .conversation_summary
    .current_state
    .summary
}

export function buildCommercialReasoning({
  reading,
  cycle_state,
  diagnostic_input,
}: {
  reading: CommercialReading
  cycle_state: StatefulCommercialState
  diagnostic_input: CompanionDiagnosticInput
}): CommercialReasoning {
  const thirdPartyOpportunity =
    hasCanonicalThirdPartyOpportunity(
      cycle_state,
    )

  const roleAllowsReasoning =
    reading.commercial_role === 'buyer' ||
    thirdPartyOpportunity

  const status =
    !roleAllowsReasoning ||
    reading.commercial_relevance !==
      'commercial'
      ? 'silent'
      : reading.analysis_status ===
          'limited'
        ? 'limited'
        : 'ready'

  const situation =
    buildSituationSignals({
      reading,
      state:
        cycle_state,
    })

  const productIds =
    collectProductIds(reading)

  const library =
    buildCommercialIntelligenceLibrary(
      diagnostic_input,
    )

  const ranked =
    status === 'silent'
      ? []
      : filterReasoningCandidates(
          rankCommercialIntelligence({
            entries:
              library,
            query: {
              company_id:
                diagnostic_input.company_id,
              product_ids:
                productIds,
              situations:
                situation.situations,
              signals:
                situation.signals,
              objectives:
                situation.objectives,
              limit: 12,
            },
          }),
        )

  const selectedTechniques =
    selectTechniques(ranked)

  const companyKnowledge =
    selectKnowledge(ranked)

  const limitations =
    unique([
      ...reading.analysis_limitations,
      ...(
        status !== 'silent' &&
        selectedTechniques.length === 0
          ? [
              'no_relevant_commercial_technique_found',
            ]
          : []
      ),
      ...(
        status !== 'silent' &&
        situation.signals.includes(
          'claim_requires_company_knowledge',
        ) &&
        companyKnowledge.length === 0
          ? [
              'required_company_knowledge_not_found',
            ]
          : []
      ),
    ])

  const decision =
    status === 'silent'
      ? 'no_intervention'
      : reading.best_approach.decision

  const decisionReason =
    status === 'silent'
      ? 'A sessão atual não autoriza intervenção comercial.'
      : reading.best_approach.reason

  return {
    contract_version:
      COMMERCIAL_REASONING_CONTRACT_VERSION,

    status,

    decision,
    decision_reason:
      decisionReason,

    current_situation:
      buildCurrentSituation(reading),

    objective_now:
      status === 'silent'
        ? 'Preservar o contexto sem forçar avanço comercial.'
        : inferObjectiveNow(reading),

    do_not_do:
      status === 'silent'
        ? [
            'Não forçar ação comercial enquanto a relevância da sessão não estiver confirmada.',
          ]
        : buildDoNotDo(
            ranked,
            reading,
          ),

    selected_techniques:
      selectedTechniques,

    company_knowledge_used:
      companyKnowledge,

    seller_assessment: {
      strengths: [
        ...reading.seller_strengths,
      ],
      improvement_points: [
        ...reading.improvement_points,
      ],
    },

    comparison:
      buildComparison(ranked),

    evidence_message_ids: [
      ...reading.evidence_message_ids,
    ],

    memory_ids: [
      ...reading.memory_ids,
    ],

    limitations,
  }
}
