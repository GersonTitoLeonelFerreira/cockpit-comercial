import type {
  CommercialProductPricing,
} from '../commercial-product-contract'

import {
  parseMissingDiscoveryKind,
} from '../client-commercial-intelligence-contract'

import {
  deriveCommunicationAdaptationV1,
  type CommunicationAdaptationV1,
} from './communication-adaptation'

import type {
  MessageContextMemoryItemV1,
  MessageContextSnapshotV1,
} from './context-snapshot'

import {
  deriveCustomerCommunicationProfileV1,
  type CustomerCommunicationProfileV1,
} from './customer-communication-profile'

import {
  createKnowledgeGapV1,
  type KnowledgeGapV1,
} from './knowledge-gap'

import {
  createKnowledgeResolverV1,
} from './knowledge-resolver'

import type {
  KnowledgeResolutionV1,
  KnowledgeStatus,
} from './knowledge-resolution'

import {
  MESSAGE_PLAN_CONTRACT_VERSION,
  type CommunicationStylePlanV1,
  type MessagePlanContentRequirementV1,
  type MessagePlanFactRequirementV1,
  type MessagePlanForbiddenContentV1,
  type MessagePlanGenerationConstraintV1,
  type MessagePlanStatusV1,
  type MessagePlanV1,
  type NextStepPlanV1,
  type QuestionPlanV1,
} from './message-plan'

import {
  deriveSellerVoiceProfileV1,
  type SellerVoiceProfileV1,
} from './seller-voice-profile'

import {
  stableUniqueStrings,
  type SourceTraceV1,
} from './source-trace'

import type {
  CommercialMoveV1,
  CommercialStrategyDecisionV1,
  GovernanceConstraintV1,
} from './strategy-contracts'

type KnowledgeResolverV1 =
  ReturnType<typeof createKnowledgeResolverV1>

type PlannerKnowledge = {
  fact_requirements:
    MessagePlanFactRequirementV1[]
  knowledge_gaps: KnowledgeGapV1[]
  forbidden_content:
    MessagePlanForbiddenContentV1[]
  content_requirements:
    MessagePlanContentRequirementV1[]
  constraints:
    MessagePlanGenerationConstraintV1[]
}

const DISCOVERY_TOPIC_ORDER = [
  'objective',
  'problem',
  'impact',
  'need',
  'budget',
  'timeline',
  'decision_maker',
  'priority',
  'decision_criteria',
  'current_process',
  'product_fit',
  'other',
] as const

type DiscoveryTopic =
  (typeof DISCOVERY_TOPIC_ORDER)[number]

function normalizeText(
  value: string,
): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(
  value: string,
): string[] {
  const ignored = new Set([
    'qual',
    'quais',
    'quanto',
    'como',
    'para',
    'uma',
    'uns',
    'das',
    'dos',
    'que',
    'isso',
    'esse',
    'essa',
    'tem',
    'com',
    'do',
    'da',
    'de',
    'o',
    'a',
    'e',
  ])

  return normalizeText(value)
    .split(' ')
    .filter(
      token =>
        token.length >= 3 &&
        !ignored.has(token),
    )
}

function latestIncomingText(
  snapshot: MessageContextSnapshotV1,
): string {
  const current =
    snapshot.conversation
      .current_interaction
      ?.messages
      .filter(
        message =>
          message.direction ===
            'incoming',
      ) ?? []

  const fallback =
    snapshot.conversation.messages
      .filter(
        message =>
          message.direction ===
            'incoming',
      )

  const message =
    current.at(-1) ??
    fallback.at(-1) ??
    null

  return message
    ? message.text_content ??
        message.audio_transcription ??
        ''
    : ''
}

function uniqueTraces(
  traces: readonly SourceTraceV1[],
): SourceTraceV1[] {
  const result: SourceTraceV1[] = []
  const seen = new Set<string>()

  for (const trace of traces) {
    const key = JSON.stringify({
      source_type:
        trace.source_type,
      source_id:
        trace.source_id,
      source_version:
        trace.source_version,
      observed_at:
        trace.observed_at,
      source_cycle_id:
        trace.source_cycle_id ?? null,
      inheritance:
        trace.inheritance ?? null,
      evidence_message_ids:
        stableUniqueStrings(
          trace.evidence_message_ids ?? [],
        ),
      evidence_memory_ids:
        stableUniqueStrings(
          trace.evidence_memory_ids ?? [],
        ),
    })

    if (!seen.has(key)) {
      seen.add(key)
      result.push(trace)
    }
  }

  return result.sort((left, right) => {
    const type =
      left.source_type.localeCompare(
        right.source_type,
      )

    if (type !== 0) {
      return type
    }

    return (
      left.source_id ?? ''
    ).localeCompare(
      right.source_id ?? '',
      'en',
      {
        numeric: true,
      },
    )
  })
}

function uniqueContentRequirements(
  values:
    readonly MessagePlanContentRequirementV1[],
): MessagePlanContentRequirementV1[] {
  return [
    ...new Set(values),
  ].sort()
}

function contentRequirementsForMove(
  move: CommercialMoveV1,
): MessagePlanContentRequirementV1[] {
  const mapping:
    Record<
      CommercialMoveV1,
      MessagePlanContentRequirementV1[]
    > = {
      answer_directly: [
        'answer_requested_information',
      ],
      clarify_request: [
        'clarify_missing_information',
      ],
      advance_discovery: [
        'clarify_missing_information',
      ],
      surface_impact: [
        'acknowledge_customer_point',
        'clarify_missing_information',
      ],
      confirm_decision_criteria: [
        'confirm_decision_criterion',
      ],
      isolate_objection: [
        'acknowledge_customer_point',
        'clarify_missing_information',
      ],
      resolve_objection: [
        'acknowledge_customer_point',
        'address_objection',
      ],
      reduce_decision_risk: [
        'acknowledge_customer_point',
        'reduce_decision_risk',
      ],
      compare_on_criteria: [
        'confirm_decision_criterion',
        'surface_verified_difference',
      ],
      propose_next_step: [
        'propose_next_step',
      ],
      confirm_commitment: [
        'confirm_commitment',
      ],
      recover_stalled_process: [
        'recover_process',
        'propose_next_step',
      ],
      respect_customer_timing: [
        'respect_customer_timing',
        'close_without_pressure',
      ],
      give_customer_space: [
        'respect_customer_timing',
        'close_without_pressure',
      ],
      close_conversation: [
        'acknowledge_customer_point',
        'close_without_pressure',
      ],
      request_more_context: [
        'clarify_missing_information',
      ],
      no_commercial_move: [
        'acknowledge_non_commercial',
      ],
    }

  return [
    ...mapping[move],
  ]
}

function factStatus(
  status: KnowledgeStatus,
): MessagePlanFactRequirementV1[
  'status'
] {
  if (status === 'resolved') {
    return 'available'
  }

  if (
    status ===
      'condition_unproven' ||
    status ===
      'approval_required'
  ) {
    return 'conditioned'
  }

  if (status === 'conflicting') {
    return 'conflicting'
  }

  if (status === 'forbidden') {
    return 'forbidden'
  }

  return 'missing'
}

function assertionPolicy(
  status: KnowledgeStatus,
): MessagePlanFactRequirementV1[
  'assertion_policy'
] {
  if (status === 'resolved') {
    return 'may_assert'
  }

  if (
    status ===
      'condition_unproven' ||
    status ===
      'approval_required'
  ) {
    return 'describe_constraint_only'
  }

  return 'must_not_assert'
}

function requirementFromResolution<
  TValue,
  TSubject,
>({
  requirement_key,
  necessity,
  resolution,
  gap_impact,
  override_value,
}: {
  requirement_key: string
  necessity:
    MessagePlanFactRequirementV1[
      'necessity'
    ]
  resolution:
    KnowledgeResolutionV1<
      TValue,
      TSubject
    >
  gap_impact:
    MessagePlanFactRequirementV1[
      'gap_impact'
    ]
  override_value?: unknown
}): MessagePlanFactRequirementV1 {
  return {
    requirement_key,
    necessity,
    status:
      factStatus(
        resolution.status,
      ),
    knowledge_status:
      resolution.status,
    subject:
      resolution.subject as
        Record<string, unknown>,
    value:
      override_value !== undefined
        ? override_value
        : resolution.value,
    gap:
      resolution.gap,
    gap_impact:
      resolution.gap
        ? gap_impact
        : null,
    assertion_policy:
      assertionPolicy(
        resolution.status,
      ),
    provenance:
      uniqueTraces([
        ...resolution.provenance,
        ...resolution.candidates.flatMap(
          candidate =>
            candidate.provenance,
        ),
        ...(
          resolution.gap
            ?.partial_sources ?? []
        ),
      ]),
  }
}

function missingRequirement({
  requirement_key,
  subject,
  gap,
  gap_impact = 'hard',
}: {
  requirement_key: string
  subject: Record<string, unknown>
  gap: KnowledgeGapV1
  gap_impact?: 'hard' | 'soft'
}): MessagePlanFactRequirementV1 {
  return {
    requirement_key,
    necessity: 'required',
    status: 'missing',
    knowledge_status: 'missing',
    subject,
    value: null,
    gap,
    gap_impact,
    assertion_policy:
      'must_not_assert',
    provenance:
      uniqueTraces(
        gap.partial_sources,
      ),
  }
}

function isPricing(
  value: unknown,
): value is CommercialProductPricing {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'model' in value,
  )
}

function requestedProductClaim(
  text: string,
):
  | 'pricing'
  | 'payment_conditions'
  | 'contract_conditions'
  | 'stock'
  | 'fact'
  | 'unknown' {
  const normalized =
    normalizeText(text)

  if (
    /\b(preco|valor|custa|custar|mensalidade|investimento)\b/
      .test(normalized)
  ) {
    return 'pricing'
  }

  if (
    /\b(pagamento|pagar|parcela|parcelamento)\b/
      .test(normalized)
  ) {
    return 'payment_conditions'
  }

  if (
    /\b(contrato|fidelidade|prazo contratual)\b/
      .test(normalized)
  ) {
    return 'contract_conditions'
  }

  if (
    /\b(estoque|disponivel|disponibilidade)\b/
      .test(normalized)
  ) {
    return 'stock'
  }

  if (normalized) {
    return 'fact'
  }

  return 'unknown'
}

function activeCustomerItems(
  snapshot: MessageContextSnapshotV1,
): Array<{
  category:
    keyof MessageContextSnapshotV1[
      'customer'
    ]
  item: MessageContextMemoryItemV1
}> {
  const categories:
    Array<
      keyof MessageContextSnapshotV1[
        'customer'
      ]
    > = [
      'objectives',
      'problems',
      'impacts',
      'needs',
      'interests',
      'decision_criteria',
      'preferences',
      'open_questions',
      'objections',
      'uncertainties',
      'products',
      'competitors',
      'commitments',
      'missing_discovery',
      'communication_observations',
      'signals',
      'resolved_information',
      'superseded_information',
    ]

  return categories.flatMap(
    category =>
      snapshot.customer[category]
        .filter(
          item =>
            item.memory_status ===
              'active',
        )
        .map(item => ({
          category,
          item,
        })),
  )
}

function selectProductId(
  snapshot: MessageContextSnapshotV1,
  requestText: string,
): {
  product_id: string | null
  gap: KnowledgeGapV1 | null
} {
  const products =
    [...snapshot.company.products]
      .sort(
        (left, right) =>
          left.product_id.localeCompare(
            right.product_id,
          ),
      )

  if (products.length === 0) {
    return {
      product_id: null,
      gap:
        createKnowledgeGapV1({
          domain:
            'commercial_product',
          reason: 'not_found',
          sought:
            'product for current factual request',
          explanation:
            'Nenhum produto publicado está disponível no snapshot.',
        }),
    }
  }

  const normalizedRequest =
    normalizeText(requestText)

  const explicit =
    products.filter(product => {
      const name =
        product.definition.name

      return (
        Boolean(name) &&
        normalizedRequest.includes(
          normalizeText(name),
        )
      )
    })

  if (explicit.length === 1) {
    return {
      product_id:
        explicit[0].product_id,
      gap: null,
    }
  }

  const rememberedIds =
    stableUniqueStrings(
      snapshot.customer.products
        .filter(
          item =>
            item.memory_status ===
              'active' &&
            typeof item.value ===
              'string',
        )
        .map(
          item =>
            item.value as string,
        ),
    )
      .filter(
        id =>
          products.some(
            product =>
              product.product_id === id,
          ),
      )

  if (rememberedIds.length === 1) {
    return {
      product_id:
        rememberedIds[0],
      gap: null,
    }
  }

  if (products.length === 1) {
    return {
      product_id:
        products[0].product_id,
      gap: null,
    }
  }

  return {
    product_id: null,
    gap:
      createKnowledgeGapV1({
        domain:
          'commercial_product',
        reason:
          'ambiguous_multiple_matches',
        sought:
          'product for current factual request',
        explanation:
          'Mais de um produto publicado pode responder ao pedido e o contexto não permite escolher silenciosamente.',
        partial_sources:
          products.flatMap(
            product =>
              product.provenance,
          ),
      }),
  }
}

function selectFactKey(
  snapshot: MessageContextSnapshotV1,
  requestText: string,
): string | null {
  const requestTokens =
    new Set(
      tokens(requestText),
    )

  const normalized =
    normalizeText(requestText)

  const scored =
    snapshot.company.facts
      .map(fact => {
        const keyTokens =
          tokens(
            fact.fact_key.replace(
              /_/g,
              ' ',
            ),
          )

        const valueTokens =
          tokens(
            fact.fact_value,
          )

        let score = 0

        for (const token of [
          ...keyTokens,
          ...valueTokens,
        ]) {
          if (
            requestTokens.has(token)
          ) {
            score += 1
          }
        }

        if (
          fact.fact_key ===
            'support_hours' &&
          (
            normalized.includes(
              'horario',
            ) ||
            normalized.includes(
              'atendimento',
            )
          )
        ) {
          score += 3
        }

        return {
          key: fact.fact_key,
          score,
        }
      })
      .filter(
        entry =>
          entry.score > 0,
      )
      .sort(
        (left, right) =>
          right.score -
            left.score ||
          left.key.localeCompare(
            right.key,
          ),
      )

  if (scored.length === 0) {
    return null
  }

  if (
    scored.length > 1 &&
    scored[0].score ===
      scored[1].score &&
    scored[0].key !==
      scored[1].key
  ) {
    return null
  }

  return scored[0].key
}

function productForbiddenContent(
  resolver: KnowledgeResolverV1,
  snapshot: MessageContextSnapshotV1,
  productId: string,
): {
  requirements:
    MessagePlanFactRequirementV1[]
  forbidden:
    MessagePlanForbiddenContentV1[]
} {
  const resolution =
    resolver.resolve_product_claim({
      product_id: productId,
      claim: 'forbidden_claims',
    })

  if (
    resolution.status !==
      'resolved' ||
    !Array.isArray(
      resolution.value,
    )
  ) {
    return {
      requirements: [],
      forbidden: [],
    }
  }

  const values =
    resolution.value.filter(
      (
        value,
      ): value is string =>
        typeof value === 'string',
    )

  if (values.length === 0) {
    return {
      requirements: [],
      forbidden: [],
    }
  }

  const requirement =
    requirementFromResolution({
      requirement_key:
        'product.forbidden_claims',
      necessity: 'supporting',
      resolution,
      gap_impact: 'soft',
      override_value:
        values,
    })

  requirement.status =
    'forbidden'
  requirement.assertion_policy =
    'must_not_assert'

  return {
    requirements: [
      requirement,
    ],
    forbidden:
      values.map(rule => ({
        code:
          'PRODUCT_FORBIDDEN_CLAIM',
        source:
          'commercial_product',
        rule,
        provenance:
          requirement.provenance,
      })),
  }
}

function buildFactualKnowledge(
  snapshot: MessageContextSnapshotV1,
  resolver: KnowledgeResolverV1,
  strategy:
    CommercialStrategyDecisionV1,
): PlannerKnowledge {
  const result: PlannerKnowledge = {
    fact_requirements: [],
    knowledge_gaps: [],
    forbidden_content: [],
    content_requirements: [],
    constraints: [],
  }

  if (
    strategy.governance.status ===
      'blocked'
  ) {
    return result
  }

  const requestText =
    latestIncomingText(snapshot)

  if (
    strategy.commercial_move.move ===
      'answer_directly'
  ) {
    const claim =
      requestedProductClaim(
        requestText,
      )

    if (
      claim === 'pricing' ||
      claim ===
        'payment_conditions' ||
      claim ===
        'contract_conditions' ||
      claim === 'stock'
    ) {
      const selection =
        selectProductId(
          snapshot,
          requestText,
        )

      if (!selection.product_id) {
        const gap =
          selection.gap ??
          createKnowledgeGapV1({
            domain:
              'commercial_product',
            reason: 'not_found',
            sought:
              'product for requested information',
            explanation:
              'Produto necessário ao pedido factual não foi resolvido.',
          })

        result.knowledge_gaps.push(
          gap,
        )
        result.fact_requirements.push(
          missingRequirement({
            requirement_key:
              'product.' + claim,
            subject: {
              claim,
            },
            gap,
          }),
        )
        result.constraints.push({
          code:
            'REQUIRED_PRODUCT_KNOWLEDGE_UNRESOLVED',
          severity: 'hard',
          source: 'knowledge',
          detail:
            'Não afirmar a informação solicitada sem produto e fonte canônica resolvidos.',
        })

        return result
      }

      const resolution =
        resolver.resolve_product_claim({
          product_id:
            selection.product_id,
          claim,
        })

      const requirement =
        requirementFromResolution({
          requirement_key:
            'product.' + claim,
          necessity: 'required',
          resolution,
          gap_impact: 'hard',
        })

      if (
        claim === 'pricing' &&
        resolution.status ===
          'resolved' &&
        isPricing(
          resolution.value,
        ) &&
        resolution.value.model ===
          'quote_required'
      ) {
        const quoteGap =
          createKnowledgeGapV1({
            domain:
              'commercial_product',
            reason:
              'requires_quote_or_approval',
            sought:
              'exact price for product_id=' +
              selection.product_id,
            explanation:
              'O modelo de precificação exige cotação; o valor exato não pode ser inferido.',
            partial_sources:
              resolution.provenance,
          })

        requirement.assertion_policy =
          'describe_constraint_only'
        requirement.gap =
          quoteGap
        requirement.gap_impact =
          'soft'

        result.knowledge_gaps.push(
          quoteGap,
        )
        result.content_requirements.push(
          'explain_quote_requirement',
        )
        result.constraints.push({
          code:
            'EXACT_PRICE_REQUIRES_QUOTE',
          severity: 'warning',
          source: 'knowledge',
          detail:
            'O modelo de preço exige cotação; não criar nem inferir valor exato.',
        })
      } else if (
        resolution.gap
      ) {
        result.knowledge_gaps.push(
          resolution.gap,
        )
        result.constraints.push({
          code:
            'REQUIRED_PRODUCT_KNOWLEDGE_UNRESOLVED',
          severity: 'hard',
          source: 'knowledge',
          detail:
            'O conhecimento necessário ao pedido factual não está plenamente resolvido.',
        })
      }

      result.fact_requirements.push(
        requirement,
      )

      const forbidden =
        productForbiddenContent(
          resolver,
          snapshot,
          selection.product_id,
        )

      result.fact_requirements.push(
        ...forbidden.requirements,
      )
      result.forbidden_content.push(
        ...forbidden.forbidden,
      )

      return result
    }

    if (claim === 'fact') {
      const factKey =
        selectFactKey(
          snapshot,
          requestText,
        )

      if (factKey) {
        const resolution =
          resolver.resolve_fact({
            fact_key: factKey,
          })

        const requirement =
          requirementFromResolution({
            requirement_key:
              'fact.' + factKey,
            necessity: 'required',
            resolution,
            gap_impact: 'hard',
            override_value:
              resolution.value &&
              'fact_value' in
                resolution.value
                ? resolution.value
                    .fact_value
                : null,
          })

        result.fact_requirements.push(
          requirement,
        )

        if (resolution.gap) {
          result.knowledge_gaps.push(
            resolution.gap,
          )
          result.constraints.push({
            code:
              'REQUIRED_FACT_UNRESOLVED',
            severity: 'hard',
            source: 'knowledge',
            detail:
              'O fato necessário não pode ser afirmado enquanto sua resolução permanecer incompleta.',
          })
        }

        return result
      }
    }

    const gap =
      createKnowledgeGapV1({
        domain: 'conversation',
        reason: 'not_found',
        sought:
          'explicit factual information requested by customer',
        explanation:
          'O pedido factual atual não pôde ser ligado deterministicamente a um fato ou claim suportado pelo Knowledge Resolver V1.',
      })

    result.knowledge_gaps.push(
      gap,
    )
    result.fact_requirements.push(
      missingRequirement({
        requirement_key:
          'conversation.requested_information',
        subject: {
          request_kind: claim,
        },
        gap,
      }),
    )
    result.constraints.push({
      code:
        'FACTUAL_REQUEST_NOT_RESOLVABLE',
      severity: 'hard',
      source: 'knowledge',
      detail:
        'Não substituir pedido factual não resolvido por resposta genérica ou conhecimento externo.',
    })
  }

  if (
    strategy.commercial_move.move ===
      'compare_on_criteria'
  ) {
    const selection =
      selectProductId(
        snapshot,
        requestText,
      )

    if (selection.product_id) {
      const resolution =
        resolver.resolve_product_claim({
          product_id:
            selection.product_id,
          claim: 'allowed_claims',
        })

      result.fact_requirements.push(
        requirementFromResolution({
          requirement_key:
            'product.allowed_claims',
          necessity: 'supporting',
          resolution,
          gap_impact: 'soft',
        }),
      )

      if (resolution.gap) {
        result.knowledge_gaps.push(
          resolution.gap,
        )
      }

      const forbidden =
        productForbiddenContent(
          resolver,
          snapshot,
          selection.product_id,
        )

      result.fact_requirements.push(
        ...forbidden.requirements,
      )
      result.forbidden_content.push(
        ...forbidden.forbidden,
      )
    } else if (selection.gap) {
      result.knowledge_gaps.push(
        selection.gap,
      )
    }
  }

  if (
    strategy.situation.situation ===
      'objection' &&
    snapshot.company
      .objection_guides.length === 1
  ) {
    const guide =
      snapshot.company
        .objection_guides[0]

    const resolution =
      resolver.resolve_objection_guide({
        objection_key:
          guide.definition
            .objection_key,
      })

    result.fact_requirements.push(
      requirementFromResolution({
        requirement_key:
          'objection.guide.' +
          guide.definition
            .objection_key,
        necessity: 'supporting',
        resolution,
        gap_impact: 'soft',
      }),
    )

    if (resolution.gap) {
      result.knowledge_gaps.push(
        resolution.gap,
      )
    }
  }

  return result
}

function topicCategory(
  topic: DiscoveryTopic,
):
  | keyof MessageContextSnapshotV1[
      'customer'
    ]
  | null {
  const mapping:
    Partial<
      Record<
        DiscoveryTopic,
        keyof MessageContextSnapshotV1[
          'customer'
        ]
      >
    > = {
      objective: 'objectives',
      problem: 'problems',
      impact: 'impacts',
      need: 'needs',
      decision_criteria:
        'decision_criteria',
      product_fit: 'products',
    }

  return mapping[topic] ?? null
}

function resolvedMemory(
  resolver: KnowledgeResolverV1,
  category:
    keyof MessageContextSnapshotV1[
      'customer'
    ],
  item: MessageContextMemoryItemV1,
) {
  if (!item.memory_id) {
    return null
  }

  return resolver.resolve_customer_memory({
    category,
    memory_id:
      item.memory_id,
  })
}

function knownCategory(
  snapshot: MessageContextSnapshotV1,
  resolver: KnowledgeResolverV1,
  category:
    keyof MessageContextSnapshotV1[
      'customer'
    ],
): {
  known: boolean
  known_keys: string[]
  gaps: KnowledgeGapV1[]
  provenance: SourceTraceV1[]
} {
  const items =
    snapshot.customer[category]
      .filter(
        item =>
          item.memory_status ===
            'active',
      )

  const knownKeys: string[] = []
  const gaps: KnowledgeGapV1[] = []
  const provenance: SourceTraceV1[] = []

  for (const item of items) {
    const resolution =
      resolvedMemory(
        resolver,
        category,
        item,
      )

    if (
      resolution?.status ===
        'resolved'
    ) {
      knownKeys.push(
        String(category),
      )
      provenance.push(
        ...resolution.provenance,
      )
    } else if (
      resolution?.gap
    ) {
      gaps.push(
        resolution.gap,
      )
      provenance.push(
        ...resolution.gap
          .partial_sources,
      )
    }
  }

  return {
    known:
      knownKeys.length > 0,
    known_keys:
      stableUniqueStrings(
        knownKeys,
      ),
    gaps,
    provenance:
      uniqueTraces(provenance),
  }
}

function missingDiscoveryTopics(
  snapshot: MessageContextSnapshotV1,
): DiscoveryTopic[] {
  return [
    ...new Set(
      snapshot.customer
        .missing_discovery
        .filter(
          item =>
            item.memory_status ===
              'active',
        )
        .map(item =>
          parseMissingDiscoveryKind(
            item.kind,
          ),
        )
        .filter(
          (
            topic,
          ): topic is DiscoveryTopic =>
            topic !== null,
        ),
    ),
  ].sort(
    (left, right) =>
      DISCOVERY_TOPIC_ORDER
        .indexOf(left) -
      DISCOVERY_TOPIC_ORDER
        .indexOf(right),
  )
}

function questionPlan(
  snapshot: MessageContextSnapshotV1,
  resolver: KnowledgeResolverV1,
  strategy:
    CommercialStrategyDecisionV1,
  hasHardFactualGap: boolean,
): {
  plan: QuestionPlanV1
  gaps: KnowledgeGapV1[]
  provenance: SourceTraceV1[]
} {
  const none = (
    known_information_skipped:
      string[] = [],
  ): QuestionPlanV1 => ({
    should_ask: false,
    purpose: 'none',
    max_questions: 0,
    question_type: 'none',
    required_information: [],
    avoid_reasking_known_fact:
      true,
    known_information_skipped:
      stableUniqueStrings(
        known_information_skipped,
      ),
  })

  const one = ({
    purpose,
    question_type,
    required_information,
    known_information_skipped = [],
  }: {
    purpose:
      QuestionPlanV1[
        'purpose'
      ]
    question_type:
      QuestionPlanV1[
        'question_type'
      ]
    required_information: string[]
    known_information_skipped?:
      string[]
  }): QuestionPlanV1 => ({
    should_ask: true,
    purpose,
    max_questions: 1,
    question_type,
    required_information:
      stableUniqueStrings(
        required_information,
      ),
    avoid_reasking_known_fact:
      true,
    known_information_skipped:
      stableUniqueStrings(
        known_information_skipped,
      ),
  })

  if (
    strategy.governance.status ===
      'blocked' ||
    strategy.governance.status ===
      'approval_required'
  ) {
    return {
      plan: none(),
      gaps: [],
      provenance: [],
    }
  }

  if (hasHardFactualGap) {
    return {
      plan: one({
        purpose:
          'clarify_missing_information',
        question_type:
          'direct',
        required_information: [
          'missing_factual_information',
        ],
      }),
      gaps: [],
      provenance: [],
    }
  }

  const move =
    strategy.commercial_move.move

  if (move === 'isolate_objection') {
    return {
      plan: one({
        purpose:
          'isolate_objection',
        question_type:
          'objection_clarification',
        required_information: [
          'objection_driver',
        ],
      }),
      gaps: [],
      provenance: [],
    }
  }

  if (
    move ===
      'confirm_decision_criteria' ||
    move === 'compare_on_criteria'
  ) {
    const known =
      knownCategory(
        snapshot,
        resolver,
        'decision_criteria',
      )

    if (known.known) {
      return {
        plan:
          none([
            'decision_criteria',
          ]),
        gaps: known.gaps,
        provenance:
          known.provenance,
      }
    }

    return {
      plan: one({
        purpose:
          'confirm_decision_criterion',
        question_type:
          'decision_criterion',
        required_information: [
          'decision_criteria',
        ],
      }),
      gaps: known.gaps,
      provenance:
        known.provenance,
    }
  }

  if (move === 'advance_discovery') {
    const skipped: string[] = []
    const gaps: KnowledgeGapV1[] = []
    const provenance:
      SourceTraceV1[] = []

    for (
      const topic of
      missingDiscoveryTopics(
        snapshot,
      )
    ) {
      const category =
        topicCategory(topic)

      if (!category) {
        return {
          plan: one({
            purpose:
              'clarify_missing_information',
            question_type:
              'discovery',
            required_information: [
              topic,
            ],
            known_information_skipped:
              skipped,
          }),
          gaps,
          provenance:
            uniqueTraces(
              provenance,
            ),
        }
      }

      const known =
        knownCategory(
          snapshot,
          resolver,
          category,
        )

      gaps.push(
        ...known.gaps,
      )
      provenance.push(
        ...known.provenance,
      )

      if (known.known) {
        skipped.push(topic)
        continue
      }

      return {
        plan: one({
          purpose:
            'clarify_missing_information',
          question_type:
            'discovery',
          required_information: [
            topic,
          ],
          known_information_skipped:
            skipped,
        }),
        gaps,
        provenance:
          uniqueTraces(
            provenance,
          ),
      }
    }

    return {
      plan: none(skipped),
      gaps,
      provenance:
        uniqueTraces(provenance),
    }
  }

  if (
    move === 'clarify_request' ||
    move ===
      'request_more_context'
  ) {
    return {
      plan: one({
        purpose:
          move ===
            'request_more_context'
            ? 'obtain_context'
            : 'clarify_request',
        question_type:
          'context_clarification',
        required_information: [
          'current_request_context',
        ],
      }),
      gaps: [],
      provenance: [],
    }
  }

  if (
    move ===
      'reduce_decision_risk' &&
    strategy.response_mode !==
      'give_space'
  ) {
    return {
      plan: one({
        purpose:
          'reduce_uncertainty',
        question_type: 'direct',
        required_information: [
          'decision_uncertainty',
        ],
      }),
      gaps: [],
      provenance: [],
    }
  }

  return {
    plan: none(),
    gaps: [],
    provenance: [],
  }
}

function nextStepPlan(
  strategy:
    CommercialStrategyDecisionV1,
  question:
    QuestionPlanV1,
): NextStepPlanV1 {
  const move =
    strategy.commercial_move.move

  if (
    strategy.governance.status ===
      'blocked'
  ) {
    return {
      kind: 'none',
      commercial_move: move,
      requires_customer_action:
        false,
      mutates_crm: false,
      mutates_agenda: false,
    }
  }

  if (
    strategy.governance.status ===
      'approval_required'
  ) {
    return {
      kind: 'escalate',
      commercial_move: move,
      requires_customer_action:
        false,
      mutates_crm: false,
      mutates_agenda: false,
    }
  }

  if (question.should_ask) {
    return {
      kind: 'ask',
      commercial_move: move,
      requires_customer_action:
        true,
      mutates_crm: false,
      mutates_agenda: false,
    }
  }

  const kind:
    NextStepPlanV1['kind'] =
      move === 'answer_directly' ||
      move ===
        'resolve_objection' ||
      move ===
        'reduce_decision_risk' ||
      move ===
        'compare_on_criteria'
        ? 'answer_and_wait'
        : move ===
            'clarify_request' ||
          move ===
            'request_more_context'
          ? 'clarify'
          : move ===
              'propose_next_step' ||
            move ===
              'recover_stalled_process'
            ? 'propose_next_step'
            : move ===
                'confirm_commitment'
              ? 'confirm_commitment'
              : move ===
                  'respect_customer_timing'
                ? 'respect_timing'
                : move ===
                    'give_customer_space'
                  ? 'give_space'
                  : move ===
                      'close_conversation'
                    ? 'close'
                    : 'none'

  return {
    kind,
    commercial_move: move,
    requires_customer_action:
      [
        'clarify',
        'ask',
        'propose_next_step',
        'confirm_commitment',
      ].includes(kind),
    mutates_crm: false,
    mutates_agenda: false,
  }
}

function communicationStyle(
  customer:
    CustomerCommunicationProfileV1,
  seller:
    SellerVoiceProfileV1,
  adaptation:
    CommunicationAdaptationV1,
  question:
    QuestionPlanV1,
): CommunicationStylePlanV1 {
  const longSignal =
    customer.signals.find(
      signal =>
        signal.signal ===
          'long_messages' &&
        signal.confidence !== 'low',
    )

  const targetLength:
    CommunicationStylePlanV1[
      'target_length'
    ] =
      adaptation.prefer_shorter
        ? 'short'
        : seller.typical_length
            ?.confidence !== 'low'
          ? seller
              .typical_length
              ?.value ?? 'medium'
          : longSignal
            ? 'medium'
            : 'medium'

  const emojiPolicy:
    CommunicationStylePlanV1[
      'emoji_policy'
    ] =
      adaptation.reduce_emoji
        ? 'reduce'
        : seller.emoji_usage
            ?.confidence !== 'low' &&
          seller.emoji_usage
            ?.value === 'none'
          ? 'none'
          : seller.emoji_usage
              ?.confidence !== 'low'
            ? 'preserve'
            : 'unconstrained'

  return {
    target_length:
      targetLength,
    directness:
      adaptation.prefer_more_direct
        ? 'direct'
        : 'balanced',
    paragraph_density:
      adaptation
        .avoid_large_paragraphs
        ? 'compact'
        : 'balanced',
    question_density:
      !question.should_ask
        ? 'none'
        : adaptation
            .use_question_sparingly
          ? 'low'
          : 'balanced',
    formality:
      adaptation
        .maintain_formality,
    emoji_policy:
      emojiPolicy,
    greeting_policy:
      adaptation
        .maintain_seller_greeting
        ? 'preserve_seller'
        : seller
            .greeting_pattern
          ? 'preserve_seller'
          : 'omit',
    closing_policy:
      adaptation
        .preserve_seller_closing
        ? 'preserve_seller'
        : seller
            .closing_pattern
          ? 'preserve_seller'
          : 'unconstrained',
  }
}

function governanceProvenance(
  snapshot: MessageContextSnapshotV1,
  constraint:
    GovernanceConstraintV1,
): SourceTraceV1[] {
  if (
    constraint.source ===
      'commercial_config' ||
    constraint.source ===
      'required_behavior' ||
    constraint.source ===
      'prohibited_behavior'
  ) {
    return snapshot.company
      .commercial_config
      ?.provenance ?? []
  }

  if (
    constraint.source ===
      'product_forbidden_claim' ||
    constraint.source ===
      'product_condition'
  ) {
    return snapshot.company
      .products.flatMap(
        product =>
          product.provenance,
      )
  }

  if (
    constraint.source ===
      'fact_limitation'
  ) {
    return snapshot.company
      .facts.flatMap(
        fact =>
          fact.provenance,
      )
  }

  return []
}

function governanceForbiddenContent(
  snapshot: MessageContextSnapshotV1,
  strategy:
    CommercialStrategyDecisionV1,
): MessagePlanForbiddenContentV1[] {
  return strategy.governance
    .constraints
    .filter(
      constraint =>
        [
          'prohibited_behavior',
          'product_forbidden_claim',
          'commercial_safety',
        ].includes(
          constraint.source,
        ),
    )
    .map(constraint => ({
      code: constraint.code,
      source:
        constraint.source ===
          'product_forbidden_claim'
          ? 'commercial_product'
          : constraint.source ===
              'commercial_safety'
            ? 'commercial_safety'
            : 'commercial_config',
      rule: constraint.detail,
      provenance:
        uniqueTraces(
          governanceProvenance(
            snapshot,
            constraint,
          ),
        ),
    }))
}

function generationConstraints(
  strategy:
    CommercialStrategyDecisionV1,
  knowledge:
    PlannerKnowledge,
  adaptation:
    CommunicationAdaptationV1,
): MessagePlanGenerationConstraintV1[] {
  const constraints:
    MessagePlanGenerationConstraintV1[] =
      []

  for (
    const item of
    strategy.governance.constraints
  ) {
    constraints.push({
      code: item.code,
      severity:
        strategy.governance.status ===
          'blocked' ||
        strategy.governance.status ===
          'approval_required'
          ? 'hard'
          : 'warning',
      source: 'governance',
      detail: item.detail,
    })
  }

  for (
    const detail of
    strategy.method_alignment
      .constraints
  ) {
    constraints.push({
      code:
        'METHOD_ALIGNMENT_CONSTRAINT',
      severity: 'advisory',
      source: 'method',
      detail,
    })
  }

  for (
    const detail of
    strategy.technique_selection
      .constraints
  ) {
    constraints.push({
      code:
        'TECHNIQUE_CONSTRAINT',
      severity: 'advisory',
      source: 'technique',
      detail,
    })
  }

  constraints.push(
    ...knowledge.constraints,
  )

  if (
    adaptation.status !==
      'absent'
  ) {
    constraints.push({
      code:
        'COMMUNICATION_ADAPTATION_APPLIES',
      severity: 'advisory',
      source: 'communication',
      detail:
        'Aplicar somente parâmetros de linguagem observáveis; não alterar o commercial move.',
    })
  }

  const byKey =
    new Map<
      string,
      MessagePlanGenerationConstraintV1
    >()

  for (const item of constraints) {
    const key =
      item.source +
      '|' +
      item.code +
      '|' +
      item.detail

    if (!byKey.has(key)) {
      byKey.set(key, item)
    }
  }

  return [
    ...byKey.values(),
  ].sort(
    (left, right) =>
      left.source.localeCompare(
        right.source,
      ) ||
      left.code.localeCompare(
        right.code,
      ),
  )
}

function planStatus(
  strategy:
    CommercialStrategyDecisionV1,
  gaps: readonly KnowledgeGapV1[],
  factRequirements:
    readonly MessagePlanFactRequirementV1[],
): MessagePlanStatusV1 {
  if (
    strategy.governance.status ===
      'blocked'
  ) {
    return 'blocked'
  }

  if (
    strategy.governance.status ===
      'approval_required'
  ) {
    return 'approval_required'
  }

  if (
    strategy.situation.situation ===
      'insufficient_context'
  ) {
    return 'needs_information'
  }

  const hardGap =
    factRequirements.some(
      requirement =>
        requirement.gap !== null &&
        requirement.gap_impact ===
          'hard',
    )

  if (hardGap) {
    return 'needs_information'
  }

  if (
    strategy.governance.status ===
      'allowed_with_warning' ||
    strategy.method_alignment.status ===
      'advisory_deviation' ||
    gaps.length > 0
  ) {
    return 'ready_with_constraints'
  }

  return 'ready'
}

function collectEvidence(
  snapshot: MessageContextSnapshotV1,
  strategy:
    CommercialStrategyDecisionV1,
  traces: readonly SourceTraceV1[],
): MessagePlanV1['evidence'] {
  const activeMessages =
    new Set(
      snapshot.conversation.messages
        .map(
          message =>
            message.message_id,
        ),
    )

  const activeMemoryIds =
    new Set(
      activeCustomerItems(
        snapshot,
      )
        .map(
          entry =>
            entry.item.memory_id,
        )
        .filter(
          (
            id,
          ): id is string =>
            typeof id === 'string',
        ),
    )

  const situationMemoryEvidenceIds =
    strategy.situation.evidence
      .filter(
        evidence =>
          evidence.source ===
            'memory',
      )
      .flatMap(
        evidence =>
          evidence.ids,
      )

  const messageIds =
    stableUniqueStrings([
      ...strategy.situation.evidence
        .filter(
          evidence =>
            evidence.source ===
              'message',
        )
        .flatMap(
          evidence =>
            evidence.ids,
        ),
      ...situationMemoryEvidenceIds
        .filter(
          id =>
            activeMessages.has(id),
        ),
      ...traces.flatMap(
        trace =>
          trace.evidence_message_ids ??
          [],
      ),
    ]).filter(
      id =>
        activeMessages.has(id),
    )

  const memoryIds =
    stableUniqueStrings([
      ...situationMemoryEvidenceIds
        .filter(
          id =>
            activeMemoryIds.has(id),
        ),
      ...traces.flatMap(
        trace =>
          trace.evidence_memory_ids ??
          [],
      ),
    ]).filter(
      id =>
        activeMemoryIds.has(id),
    )

  return {
    message_ids: messageIds,
    memory_ids: memoryIds,
  }
}

export function planMessageV1({
  snapshot,
  strategy,
  customer_profile,
  seller_voice,
  communication_adaptation,
}: {
  snapshot: MessageContextSnapshotV1
  strategy:
    CommercialStrategyDecisionV1
  customer_profile?:
    CustomerCommunicationProfileV1
  seller_voice?:
    SellerVoiceProfileV1
  communication_adaptation?:
    CommunicationAdaptationV1
}): MessagePlanV1 {
  const customerProfile =
    customer_profile ??
    deriveCustomerCommunicationProfileV1(
      snapshot,
    )

  const sellerVoice =
    seller_voice ??
    deriveSellerVoiceProfileV1(
      snapshot,
    )

  const adaptation =
    communication_adaptation ??
    deriveCommunicationAdaptationV1({
      customer_profile:
        customerProfile,
      seller_voice:
        sellerVoice,
    })

  const resolver =
    createKnowledgeResolverV1(
      snapshot,
    )

  const knowledge =
    buildFactualKnowledge(
      snapshot,
      resolver,
      strategy,
    )

  const hasHardFactualGap =
    knowledge.fact_requirements
      .some(
        requirement =>
          requirement.gap !== null &&
          requirement.gap_impact ===
            'hard',
      )

  const question =
    questionPlan(
      snapshot,
      resolver,
      strategy,
      hasHardFactualGap,
    )

  const allGaps =
    [
      ...knowledge
        .knowledge_gaps,
      ...question.gaps,
    ]

  const governanceForbidden =
    governanceForbiddenContent(
      snapshot,
      strategy,
    )

  const forbiddenContent =
    [
      ...knowledge
        .forbidden_content,
      ...governanceForbidden,
    ]
      .sort(
        (left, right) =>
          left.code.localeCompare(
            right.code,
          ) ||
          left.rule.localeCompare(
            right.rule,
          ),
      )

  const contentRequirements =
    strategy.governance.status ===
      'blocked'
      ? []
      : uniqueContentRequirements([
          ...contentRequirementsForMove(
            strategy
              .commercial_move
              .move,
          ),
          ...knowledge
            .content_requirements,
        ])

  const style =
    communicationStyle(
      customerProfile,
      sellerVoice,
      adaptation,
      question.plan,
    )

  const nextStep =
    nextStepPlan(
      strategy,
      question.plan,
    )

  const constraints =
    generationConstraints(
      strategy,
      knowledge,
      adaptation,
    )

  const traces =
    uniqueTraces([
      ...snapshot.seller_intent
        .provenance,
      ...snapshot.identity
        .provenance,
      ...knowledge
        .fact_requirements
        .flatMap(
          requirement =>
            requirement.provenance,
        ),
      ...forbiddenContent
        .flatMap(
          item =>
            item.provenance,
        ),
      ...question.provenance,
      ...adaptation.provenance,
    ])

  const status =
    planStatus(
      strategy,
      allGaps,
      knowledge
        .fact_requirements,
    )

  const generationAllowed =
    ![
      'blocked',
      'approval_required',
    ].includes(status)

  return {
    contract_version:
      MESSAGE_PLAN_CONTRACT_VERSION,
    status,
    seller_intent: {
      value:
        snapshot.seller_intent.value,
      provenance: [
        ...snapshot.seller_intent
          .provenance,
      ],
    },
    situation:
      strategy.situation,
    commercial_objective:
      strategy
        .commercial_objective,
    response_mode:
      strategy.response_mode,
    commercial_move:
      strategy.commercial_move,
    method_alignment: {
      status:
        strategy.method_alignment
          .status,
      method_name:
        strategy.method_alignment
          .method_name,
      stage_key:
        strategy.method_alignment
          .stage_key,
      recommended_move:
        strategy
          .commercial_move
          .default_move,
      seller_requested_move:
        strategy
          .commercial_move
          .requested_move,
      requested_move_outside_method:
        strategy.method_alignment
          .requested_move_outside_method,
      reason:
        strategy.method_alignment
          .reason,
      constraints: [
        ...strategy.method_alignment
          .constraints,
      ],
    },
    governance_status:
      strategy.governance.status,
    technique: {
      status:
        strategy
          .technique_selection
          .status,
      technique_key:
        strategy
          .technique_selection
          .technique_key,
      commercial_move:
        strategy
          .technique_selection
          .commercial_move,
      framework_reference:
        strategy
          .technique_selection
          .framework_reference,
      constraints: [
        ...strategy
          .technique_selection
          .constraints,
      ],
    },
    content_requirements:
      contentRequirements,
    fact_requirements:
      knowledge.fact_requirements,
    knowledge_gaps:
      [
        ...new Map(
          allGaps.map(
            gap => [
              gap.domain +
                '|' +
                gap.reason +
                '|' +
                gap.sought,
              gap,
            ],
          ),
        ).values(),
      ].sort(
        (left, right) =>
          left.domain.localeCompare(
            right.domain,
          ) ||
          left.sought.localeCompare(
            right.sought,
          ),
      ),
    forbidden_content:
      forbiddenContent,
    approval_boundaries: {
      governance_status:
        strategy.governance.status,
      requires_human_approval:
        strategy.governance
          .requires_human_approval,
      execution_before_approval:
        strategy.governance.status ===
          'approval_required'
          ? 'prohibited'
          : 'not_applicable',
      constraints: [
        ...strategy.governance
          .constraints,
      ],
    },
    question_plan:
      question.plan,
    next_step_plan:
      nextStep,
    communication_style:
      style,
    evidence:
      collectEvidence(
        snapshot,
        strategy,
        traces,
      ),
    provenance:
      traces,
    generation_constraints: {
      generation_allowed:
        generationAllowed,
      items: constraints,
    },
  }
}

export function createMessagePlannerV1() {
  return {
    plan: planMessageV1,
  }
}
