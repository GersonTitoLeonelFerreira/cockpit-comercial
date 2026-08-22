import type {
  CompanionDiagnosticInput,
} from './diagnostic-input'

import type {
  CommercialReadingCommunicationBehavior,
  CommercialReadingCommunicationObservationType,
  CommercialReadingCustomer,
  CommercialReadingCustomerHistoryCategory,
  CommercialReadingMissingDiscoveryTopic,
  CommercialReadingProductInterestLevel,
} from './commercial-reading-contract'

import {
  COMMERCIAL_READING_COMMUNICATION_BEHAVIORS,
  COMMERCIAL_READING_MISSING_DISCOVERY_TOPICS,
} from './commercial-reading-contract'

import type {
  StatefulCommercialFact,
  StatefulCommercialMemoryBase,
  StatefulCommercialObservedItem,
  StatefulCommercialOpenLoop,
  StatefulCommercialState,
} from './stateful-commercial-state'

export const CLIENT_COMMERCIAL_FACT_KINDS = [
  'client.objective',
  'client.problem',
  'client.impact',
  'client.interest',
  'client.decision_criterion',
  'client.preference',
] as const

export const CLIENT_COMMERCIAL_PRODUCT_FACT_KINDS = [
  'client.product.catalog.discussed',
  'client.product.catalog.interested',
  'client.product.catalog.primary',
  'client.product.observed.discussed',
  'client.product.observed.interested',
  'client.product.observed.primary',
] as const

export const CLIENT_COMMERCIAL_COMPETITOR_FACT_KINDS = [
  'client.competitor.named',
  'client.competitor.unnamed',
] as const

export const CLIENT_COMMERCIAL_COMMUNICATION_FACT_KINDS = [
  'client.communication.event',
  'client.communication.explicit_preference',
  'client.communication.pattern',
] as const

export const CLIENT_COMMERCIAL_OPEN_QUESTION_KIND =
  'client.open_question' as const

export const CLIENT_COMMERCIAL_MISSING_DISCOVERY_PREFIX =
  'client.missing_discovery.' as const

export type ClientCommercialFactKind =
  | (typeof CLIENT_COMMERCIAL_FACT_KINDS)[number]
  | (typeof CLIENT_COMMERCIAL_PRODUCT_FACT_KINDS)[number]
  | (typeof CLIENT_COMMERCIAL_COMPETITOR_FACT_KINDS)[number]
  | (typeof CLIENT_COMMERCIAL_COMMUNICATION_FACT_KINDS)[number]

export type ClientCommercialFactDescriptor =
  | {
      category:
        'objective' |
        'problem' |
        'impact' |
        'interest' |
        'decision_criterion' |
        'preference'
    }
  | {
      category: 'product'
      source: 'catalog' | 'observed'
      interest_level:
        CommercialReadingProductInterestLevel
    }
  | {
      category: 'competitor'
      mention_type:
        'named' | 'unnamed_alternative'
    }
  | {
      category: 'communication'
      observation_type:
        CommercialReadingCommunicationObservationType
    }

type DiagnosticCommercialProduct =
  CompanionDiagnosticInput[
    'commercial_context'
  ]['products'][number]

const PSYCHOLOGICAL_PROFILE_PATTERN =
  /\b(?:ansios[oa]|dominante|insegur[oa]|dificil|disc|personalidade|perfil\s+psicologico)\b/i

function normalizeSearchText(
  value: string,
): string {
  return value
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      '',
    )
    .toLowerCase()
    .trim()
}

export function containsForbiddenPsychologicalProfile(
  value: string,
): boolean {
  return PSYCHOLOGICAL_PROFILE_PATTERN.test(
    normalizeSearchText(value),
  )
}

export function parseClientCommercialFactKind(
  kind: string,
): ClientCommercialFactDescriptor | null {
  const simpleCategories:
    Record<
      (typeof CLIENT_COMMERCIAL_FACT_KINDS)[number],
      Extract<
        ClientCommercialFactDescriptor,
        {
          category:
            'objective' |
            'problem' |
            'impact' |
            'interest' |
            'decision_criterion' |
            'preference'
        }
      >['category']
    > = {
      'client.objective':
        'objective',
      'client.problem':
        'problem',
      'client.impact':
        'impact',
      'client.interest':
        'interest',
      'client.decision_criterion':
        'decision_criterion',
      'client.preference':
        'preference',
    }

  if (
    Object.prototype.hasOwnProperty.call(
      simpleCategories,
      kind,
    )
  ) {
    return {
      category:
        simpleCategories[
          kind as keyof typeof simpleCategories
        ],
    }
  }

  const productMatch =
    /^client\.product\.(catalog|observed)\.(discussed|interested|primary)$/
      .exec(kind)

  if (productMatch) {
    return {
      category:
        'product',

      source:
        productMatch[1] as
          | 'catalog'
          | 'observed',

      interest_level:
        productMatch[2] as
          CommercialReadingProductInterestLevel,
    }
  }

  if (
    kind ===
    'client.competitor.named'
  ) {
    return {
      category:
        'competitor',
      mention_type:
        'named',
    }
  }

  if (
    kind ===
    'client.competitor.unnamed'
  ) {
    return {
      category:
        'competitor',
      mention_type:
        'unnamed_alternative',
    }
  }

  const communicationMatch =
    /^client\.communication\.(event|explicit_preference|pattern)$/
      .exec(kind)

  if (communicationMatch) {
    return {
      category:
        'communication',

      observation_type:
        communicationMatch[1] as
          CommercialReadingCommunicationObservationType,
    }
  }

  return null
}

export function parseMissingDiscoveryKind(
  kind: string,
): CommercialReadingMissingDiscoveryTopic | null {
  if (
    !kind.startsWith(
      CLIENT_COMMERCIAL_MISSING_DISCOVERY_PREFIX,
    )
  ) {
    return null
  }

  const topic =
    kind.slice(
      CLIENT_COMMERCIAL_MISSING_DISCOVERY_PREFIX.length,
    )

  return COMMERCIAL_READING_MISSING_DISCOVERY_TOPICS
    .includes(
      topic as CommercialReadingMissingDiscoveryTopic,
    )
    ? topic as CommercialReadingMissingDiscoveryTopic
    : null
}

export function isCommunicationBehavior(
  value: unknown,
): value is CommercialReadingCommunicationBehavior {
  return (
    typeof value === 'string' &&
    COMMERCIAL_READING_COMMUNICATION_BEHAVIORS
      .includes(
        value as CommercialReadingCommunicationBehavior,
      )
  )
}

export function isClientCommercialMemory(
  item: StatefulCommercialMemoryBase,
): boolean {
  return (
    parseClientCommercialFactKind(
      item.kind,
    ) !== null ||
    item.kind ===
      CLIENT_COMMERCIAL_OPEN_QUESTION_KIND ||
    parseMissingDiscoveryKind(
      item.kind,
    ) !== null
  )
}

function memoryEvidence(
  item: StatefulCommercialMemoryBase,
) {
  return {
    summary:
      item.summary,
    evidence_message_ids: [],
    memory_ids: [
      item.id,
    ],
  }
}

function canonicalProductName(
  product: DiagnosticCommercialProduct,
): string {
  return (
    product.name ??
    product.definition?.name ??
    product.product_id
  )
}

function historyCategoryForFact(
  fact: StatefulCommercialFact,
): CommercialReadingCustomerHistoryCategory | null {
  const descriptor =
    parseClientCommercialFactKind(
      fact.kind,
    )

  if (!descriptor) {
    return null
  }

  if (
    descriptor.category ===
    'communication'
  ) {
    return null
  }

  return descriptor.category
}

function historyItem(
  item: StatefulCommercialMemoryBase,
  category:
    CommercialReadingCustomerHistoryCategory,
  prefix: string,
) {
  return {
    category,
    summary:
      `${prefix}: ${item.summary}`,
    evidence_message_ids: [],
    memory_ids: [
      item.id,
    ],
  }
}

function collectHistory(
  state: StatefulCommercialState,
  status: 'resolved' | 'superseded',
) {
  const prefix =
    status === 'resolved'
      ? 'Informação resolvida'
      : 'Informação anterior substituída'

  const result:
    CommercialReadingCustomer[
      'resolved_information'
    ] = []

  for (const fact of state.facts) {
    if (
      fact.memory_status !== status
    ) {
      continue
    }

    const category =
      historyCategoryForFact(fact)

    if (category) {
      result.push(
        historyItem(
          fact,
          category,
          prefix,
        ),
      )
    }
  }

  const collections: Array<{
    items:
      StatefulCommercialMemoryBase[]
    category:
      CommercialReadingCustomerHistoryCategory
    filter?: (
      item: StatefulCommercialMemoryBase,
    ) => boolean
  }> = [
    {
      items:
        state.needs,
      category:
        'need',
    },
    {
      items:
        state.open_loops,
      category:
        'open_question',
      filter:
        item =>
          item.kind ===
          CLIENT_COMMERCIAL_OPEN_QUESTION_KIND,
    },
    {
      items:
        state.objections,
      category:
        'objection',
    },
    {
      items:
        state.uncertainties,
      category:
        'uncertainty',
      filter:
        item =>
          parseMissingDiscoveryKind(
            item.kind,
          ) === null,
    },
    {
      items:
        state.uncertainties,
      category:
        'missing_discovery',
      filter:
        item =>
          parseMissingDiscoveryKind(
            item.kind,
          ) !== null,
    },
  ]

  for (const collection of collections) {
    for (const item of collection.items) {
      if (
        item.memory_status === status &&
        (
          !collection.filter ||
          collection.filter(item)
        )
      ) {
        result.push(
          historyItem(
            item,
            collection.category,
            prefix,
          ),
        )
      }
    }
  }

  return result
}

export function buildCommercialReadingCustomerFromState({
  state,
  products,
}: {
  state: StatefulCommercialState
  products: DiagnosticCommercialProduct[]
}): CommercialReadingCustomer {
  const catalog =
    new Map(
      products.map(
        product => [
          product.product_id,
          product,
        ] as const,
      ),
    )

  const customer: CommercialReadingCustomer = {
    objectives: [],
    problems: [],
    impacts: [],
    needs: [],
    interests: [],
    decision_criteria: [],
    preferences: [],
    open_questions: [],
    objections: [],
    uncertainties: [],
    discussed_products: [],
    primary_product_interest:
      null,
    competitors: [],
    commitments: [],
    missing_discovery: [],
    resolved_information: [],
    superseded_information: [],
    communication: {
      events: [],
      patterns: [],
    },
  }

  const activeFacts =
    state.facts.filter(
      fact =>
        fact.memory_status ===
        'active',
    )

  for (const fact of activeFacts) {
    const descriptor =
      parseClientCommercialFactKind(
        fact.kind,
      )

    if (!descriptor) {
      continue
    }

    const evidence =
      memoryEvidence(fact)

    if (
      descriptor.category ===
        'objective'
    ) {
      customer.objectives.push(
        evidence,
      )
      continue
    }

    if (
      descriptor.category ===
        'problem'
    ) {
      customer.problems.push(
        evidence,
      )
      continue
    }

    if (
      descriptor.category ===
        'impact'
    ) {
      customer.impacts.push(
        evidence,
      )
      continue
    }

    if (
      descriptor.category ===
        'interest'
    ) {
      customer.interests.push(
        evidence,
      )
      continue
    }

    if (
      descriptor.category ===
        'decision_criterion'
    ) {
      customer.decision_criteria.push(
        evidence,
      )
      continue
    }

    if (
      descriptor.category ===
        'preference'
    ) {
      customer.preferences.push(
        evidence,
      )
      continue
    }

    if (
      descriptor.category ===
        'product'
    ) {
      const product =
        descriptor.source ===
          'catalog' &&
        fact.value
          ? catalog.get(
              fact.value,
            )
          : null

      const item = {
        canonical_product_id:
          descriptor.source ===
            'catalog'
            ? fact.value
            : null,

        name:
          product
            ? canonicalProductName(
                product,
              )
            : descriptor.source ===
                'observed'
              ? fact.value ??
                fact.summary
              : fact.summary,

        interest_level:
          descriptor.interest_level,

        ...evidence,
      }

      customer.discussed_products.push(
        item,
      )

      if (
        descriptor.interest_level ===
        'primary'
      ) {
        customer.primary_product_interest =
          item
      }

      continue
    }

    if (
      descriptor.category ===
        'competitor'
    ) {
      customer.competitors.push({
        name:
          descriptor.mention_type ===
            'named'
            ? fact.value
            : null,

        mention_type:
          descriptor.mention_type,

        ...evidence,
      })

      continue
    }

    if (
      descriptor.category ===
        'communication' &&
      isCommunicationBehavior(
        fact.value,
      )
    ) {
      const accumulatedMemoryIds =
        descriptor.observation_type ===
          'pattern'
          ? state.facts
              .filter(
                candidate => {
                  const candidateDescriptor =
                    parseClientCommercialFactKind(
                      candidate.kind,
                    )

                  return (
                    candidate.id !==
                      fact.id &&
                    candidate.memory_status ===
                      'superseded' &&
                    candidateDescriptor?.category ===
                      'communication' &&
                    candidate.value ===
                      fact.value
                  )
                },
              )
              .map(
                candidate =>
                  candidate.id,
              )
          : []

      const observation = {
        observation_type:
          descriptor.observation_type,

        behavior:
          fact.value,

        ...evidence,

        memory_ids: [
          fact.id,
          ...accumulatedMemoryIds,
        ],
      }

      if (
        descriptor.observation_type ===
        'event'
      ) {
        customer.communication.events.push(
          observation,
        )
      } else {
        customer.communication.patterns.push(
          observation,
        )
      }
    }
  }

  const activeEvidence = <
    T extends StatefulCommercialMemoryBase,
  >(
    items: T[],
  ) =>
    items
      .filter(
        item =>
          item.memory_status ===
          'active',
      )
      .map(memoryEvidence)

  customer.needs =
    activeEvidence(state.needs)

  customer.open_questions =
    activeEvidence(
      state.open_loops.filter(
        item =>
          item.kind ===
          CLIENT_COMMERCIAL_OPEN_QUESTION_KIND,
      ),
    )

  customer.objections =
    activeEvidence(
      state.objections,
    )

  customer.uncertainties =
    activeEvidence(
      state.uncertainties.filter(
        item =>
          parseMissingDiscoveryKind(
            item.kind,
          ) === null,
      ),
    )

  customer.missing_discovery =
    state.uncertainties
      .filter(
        item =>
          item.memory_status ===
            'active' &&
          parseMissingDiscoveryKind(
            item.kind,
          ) !== null,
      )
      .map(
        item => ({
          topic:
            parseMissingDiscoveryKind(
              item.kind,
            ) ?? 'other',

          ...memoryEvidence(item),
        }),
      )

  customer.commitments =
    state.commitments.map(
      commitment => ({
        status:
          commitment.commitment_status,

        scheduled_at:
          commitment.scheduled_at,

        proposed_at:
          commitment.proposed_at,

        ...memoryEvidence(
          commitment,
        ),
      }),
    )

  customer.resolved_information =
    collectHistory(
      state,
      'resolved',
    )

  customer.superseded_information =
    collectHistory(
      state,
      'superseded',
    )

  return customer
}

export type ClientCommercialStateIssue = {
  code: string
  path: string
  message: string
}

export function validateClientCommercialState(
  state: StatefulCommercialState,
): ClientCommercialStateIssue[] {
  const issues:
    ClientCommercialStateIssue[] = []

  for (const fact of state.facts) {
    const descriptor =
      parseClientCommercialFactKind(
        fact.kind,
      )

    if (!descriptor) {
      if (
        fact.kind.startsWith(
          'client.',
        )
      ) {
        issues.push({
          code:
            'UNKNOWN_CLIENT_FACT_KIND',
          path:
            'state.facts',
          message:
            'O estado contém um tipo não canônico de inteligência comercial do cliente.',
        })
      }

      continue
    }

    if (
      (
        descriptor.category ===
          'objective' ||
        descriptor.category ===
          'problem' ||
        descriptor.category ===
          'impact' ||
        descriptor.category ===
          'interest' ||
        descriptor.category ===
          'decision_criterion' ||
        descriptor.category ===
          'preference'
      ) &&
      fact.value !== null
    ) {
      issues.push({
        code:
          'CLIENT_FACT_VALUE_NOT_ALLOWED',
        path:
          'state.facts',
        message:
          'Objetivo, problema, impacto, interesse, critério e preferência usam summary e value=null.',
      })
    }

    if (
      descriptor.category ===
        'product' &&
      !fact.value
    ) {
      issues.push({
        code:
          'PRODUCT_REFERENCE_REQUIRED',
        path:
          'state.facts',
        message:
          'Produto discutido precisa preservar uma referência canônica ou observada.',
      })
    }

    if (
      descriptor.category ===
        'competitor' &&
      (
        (
          descriptor.mention_type ===
            'named' &&
          !fact.value
        ) ||
        (
          descriptor.mention_type ===
            'unnamed_alternative' &&
          fact.value !== null
        )
      )
    ) {
      issues.push({
        code:
          'COMPETITOR_REFERENCE_MISMATCH',
        path:
          'state.facts',
        message:
          'Concorrente nominal exige nome; alternativa sem nome permanece desconhecida.',
      })
    }

    if (
      descriptor.category ===
        'communication' &&
      (
        !isCommunicationBehavior(
          fact.value,
        ) ||
        containsForbiddenPsychologicalProfile(
          fact.summary,
        )
      )
    ) {
      issues.push({
        code:
          'INVALID_COMMUNICATION_OBSERVATION',
        path:
          'state.facts',
        message:
          'A observação de comunicação precisa ser comportamental, canônica e não psicológica.',
      })
    }
  }

  for (const uncertainty of state.uncertainties) {
    if (
      uncertainty.kind.startsWith(
        CLIENT_COMMERCIAL_MISSING_DISCOVERY_PREFIX,
      ) &&
      parseMissingDiscoveryKind(
        uncertainty.kind,
      ) === null
    ) {
      issues.push({
        code:
          'INVALID_MISSING_DISCOVERY_TOPIC',
        path:
          'state.uncertainties',
        message:
          'Missing discovery precisa usar um tópico canônico.',
      })
    }
  }

  const activePrimaryProducts =
    state.facts.filter(
      fact => {
        const descriptor =
          parseClientCommercialFactKind(
            fact.kind,
          )

        return (
          fact.memory_status ===
            'active' &&
          descriptor?.category ===
            'product' &&
          descriptor.interest_level ===
            'primary'
        )
      },
    )

  if (
    activePrimaryProducts.length > 1
  ) {
    issues.push({
      code:
        'MULTIPLE_PRIMARY_PRODUCTS',
      path:
        'state.facts',
      message:
        'Somente um produto pode representar o maior interesse atual do cliente.',
    })
  }

  const semanticItems: Array<{
    category: string
    summary: string
  }> = []

  for (const fact of state.facts) {
    if (
      fact.memory_status !== 'active'
    ) {
      continue
    }

    const descriptor =
      parseClientCommercialFactKind(
        fact.kind,
      )

    if (
      descriptor &&
      [
        'objective',
        'problem',
        'impact',
      ].includes(
        descriptor.category,
      )
    ) {
      semanticItems.push({
        category:
          descriptor.category,
        summary:
          normalizeSearchText(
            fact.summary,
          ),
      })
    }
  }

  for (const need of state.needs) {
    if (
      need.memory_status === 'active'
    ) {
      semanticItems.push({
        category:
          'need',
        summary:
          normalizeSearchText(
            need.summary,
          ),
      })
    }
  }

  for (
    let index = 0;
    index < semanticItems.length;
    index += 1
  ) {
    const current =
      semanticItems[index]

    const duplicate =
      semanticItems.find(
        (item, candidateIndex) =>
          candidateIndex !== index &&
          item.category !==
            current.category &&
          item.summary ===
            current.summary,
      )

    if (duplicate) {
      issues.push({
        code:
          'CLIENT_CONCEPT_DUPLICATION',
        path:
          'state',
        message:
          'Objetivo, problema, impacto e necessidade não podem repetir a mesma afirmação em categorias diferentes.',
      })
      break
    }
  }

  return issues
}

export function collectClientCommercialMemoryIds(
  state: StatefulCommercialState,
): string[] {
  const memories: Array<
    StatefulCommercialFact |
    StatefulCommercialObservedItem |
    StatefulCommercialOpenLoop
  > = [
    ...state.facts.filter(
      fact =>
        parseClientCommercialFactKind(
          fact.kind,
        ) !== null,
    ),
    ...state.needs,
    ...state.open_loops.filter(
      item =>
        item.kind ===
        CLIENT_COMMERCIAL_OPEN_QUESTION_KIND,
    ),
    ...state.objections,
    ...state.uncertainties,
  ]

  return memories.map(
    memory =>
      memory.id,
  )
}
