import type {
  CommercialConfigBundle,
  CommercialFact,
  CommercialObjectionGuide,
  CommercialProductProfile,
} from '@/app/types/commercial-config'

import {
  parseClientCommercialFactKind,
  parseMissingDiscoveryKind,
} from '../client-commercial-intelligence-contract'

import {
  validateCommercialFactDefinition,
} from '../commercial-fact-contract'

import {
  validateCommercialMethodDefinition,
} from '../commercial-method-contract'

import {
  validateCommercialObjectionDefinition,
} from '../commercial-objection-contract'

import {
  validateCommercialComplexProductDefinition,
} from '../commercial-product-complex-contract'

import {
  validateCommercialProductDefinition,
} from '../commercial-product-contract'

import {
  DURABLE_MEMORY_SEED_SUMMARY_PREFIX,
} from '../durable-memory-seed'

import type {
  StatefulCommercialMemoryBase,
  StatefulCommercialState,
} from '../stateful-commercial-state'

import {
  normalizeMessageIntelligenceRequestV1,
  type MessageIntelligenceContextSourcesV1,
  type MessageIntelligenceContextSourceLoaderV1,
  type MessageIntelligenceRequestV1,
} from './contracts'

import {
  MESSAGE_CONTEXT_SNAPSHOT_CONTRACT_VERSION,
  type MessageContextCustomerV1,
  type MessageContextMemoryCollectionV1,
  type MessageContextMemoryItemV1,
  type MessageContextSnapshotV1,
} from './context-snapshot'

import {
  createSourceTraceV1,
  stableUniqueStrings,
  type SourceTraceV1,
} from './source-trace'

export class MessageContextAssemblerError extends Error {
  readonly code: string
  readonly path: string

  constructor(code: string, path: string, message: string) {
    super(message)
    this.name = 'MessageContextAssemblerError'
    this.code = code
    this.path = path
  }
}

function fail(
  code: string,
  path: string,
  message: string,
): never {
  throw new MessageContextAssemblerError(
    code,
    path,
    message,
  )
}

function assertSame(
  actual: string,
  expected: string,
  path: string,
) {
  if (actual !== expected) {
    fail(
      'MESSAGE_CONTEXT_SCOPE_MISMATCH',
      path,
      path + ' pertence a outro escopo.',
    )
  }
}

function assertSourcesScope(
  request: MessageIntelligenceRequestV1,
  sources: MessageIntelligenceContextSourcesV1,
) {
  const real = sources.real_context

  assertSame(
    real.scope.company.id,
    request.company_id,
    'real_context.scope.company.id',
  )
  assertSame(
    real.scope.lead.company_id,
    request.company_id,
    'real_context.scope.lead.company_id',
  )
  assertSame(
    real.scope.cycle.company_id,
    request.company_id,
    'real_context.scope.cycle.company_id',
  )
  assertSame(
    real.scope.cycle.id,
    request.cycle_id,
    'real_context.scope.cycle.id',
  )
  assertSame(
    real.scope.conversation_key,
    request.conversation_key,
    'real_context.scope.conversation_key',
  )
  assertSame(
    real.diagnostic_input.company_id,
    request.company_id,
    'real_context.diagnostic_input.company_id',
  )
  assertSame(
    real.diagnostic_input.cycle_id,
    request.cycle_id,
    'real_context.diagnostic_input.cycle_id',
  )
  assertSame(
    real.diagnostic_input.conversation_key,
    request.conversation_key,
    'real_context.diagnostic_input.conversation_key',
  )
  assertSame(
    real.diagnostic_input.reference_time,
    request.reference_time,
    'real_context.diagnostic_input.reference_time',
  )

  if (
    real.scope.cycle.owner_user_id !== null &&
    real.scope.cycle.owner_user_id !==
      request.seller_user_id
  ) {
    fail(
      'MESSAGE_CONTEXT_SELLER_SCOPE_MISMATCH',
      'real_context.scope.cycle.owner_user_id',
      'O vendedor solicitado não é o owner do ciclo carregado.',
    )
  }

  if (real.state_read.mode === 'found') {
    assertSame(
      real.state_read.company_id,
      request.company_id,
      'real_context.state_read.company_id',
    )
    assertSame(
      real.state_read.cycle_id,
      request.cycle_id,
      'real_context.state_read.cycle_id',
    )
    assertSame(
      real.state_read.conversation_key,
      request.conversation_key,
      'real_context.state_read.conversation_key',
    )
  }

  const bundle = real.commercial_config
  if (bundle) {
    assertSame(
      bundle.version.company_id,
      request.company_id,
      'real_context.commercial_config.version.company_id',
    )

    const rows = [
      ...bundle.method_steps,
      ...bundle.product_profiles,
      ...bundle.facts,
      ...bundle.objection_guides,
    ]

    rows.forEach((row, index) => {
      assertSame(
        row.company_id,
        request.company_id,
        'real_context.commercial_config.rows[' +
          String(index) +
          '].company_id',
      )
    })
  }

  real.products.forEach((product, index) => {
    assertSame(
      product.company_id,
      request.company_id,
      'real_context.products[' +
        String(index) +
        '].company_id',
    )
  })

  const reading = sources.commercial_reading
  if (reading) {
    assertSame(
      reading.company_id,
      request.company_id,
      'commercial_reading.company_id',
    )
    assertSame(
      reading.cycle_id,
      request.cycle_id,
      'commercial_reading.cycle_id',
    )
    assertSame(
      reading.conversation_key,
      request.conversation_key,
      'commercial_reading.conversation_key',
    )
  }
}

function requestTrace(
  request: MessageIntelligenceRequestV1,
): SourceTraceV1 {
  return createSourceTraceV1({
    source_type: 'request',
    source_id: request.request_id,
    source_version: request.contract_version,
    observed_at: request.reference_time,
  })
}

function cycleTrace(
  request: MessageIntelligenceRequestV1,
  sources: MessageIntelligenceContextSourcesV1,
): SourceTraceV1 {
  return createSourceTraceV1({
    source_type: 'cycle',
    source_id: request.cycle_id,
    source_version: null,
    observed_at:
      sources.real_context.scope.cycle.updated_at,
    source_cycle_id: request.cycle_id,
  })
}

function buildConversation(
  sources: MessageIntelligenceContextSourcesV1,
) {
  const input =
    sources.real_context.diagnostic_input

  const messages = [
    ...input.conversation.messages,
  ]
    .sort(
      (left, right) =>
        left.sequence - right.sequence,
    )
    .map(message => ({
      message_id: message.id,
      message_key: message.message_key,
      version: message.version,
      sequence: message.sequence,
      direction: message.direction,
      occurred_at: message.occurred_at,
      observed_at: message.observed_at,
      content_type: message.content_type,
      text_content: message.text_content,
      audio_transcription:
        message.audio_transcription,
      canonical_state:
        'active' as const,
      provenance: [
        createSourceTraceV1({
          source_type:
            'conversation_message',
          source_id: message.id,
          source_version:
            String(message.version),
          observed_at:
            message.observed_at,
          source_cycle_id:
            input.cycle_id,
          inheritance:
            'observed_in_current_cycle',
          evidence_message_ids: [
            message.id,
          ],
        }),
      ],
    }))

  const excluded_messages =
    input.conversation.excluded_messages
      .map(message => ({
        message_id: message.id,
        message_key: message.message_key,
        version: message.version,
        reason: message.reason,
        deletion_reason:
          message.deletion_reason,
        canonical_state:
          message.deletion_reason ===
            'explicit_deletion'
            ? 'deleted' as const
            : 'unavailable' as const,
        provenance: [
          createSourceTraceV1({
            source_type:
              'conversation_message',
            source_id: message.id,
            source_version:
              String(message.version),
            observed_at: null,
            source_cycle_id:
              input.cycle_id,
            inheritance:
              'observed_in_current_cycle',
            evidence_message_ids: [
              message.id,
            ],
          }),
        ],
      }))
      .sort((left, right) =>
        left.message_id.localeCompare(
          right.message_id,
          'en',
          { numeric: true },
        ),
      )

  const latest =
    messages.at(-1) ?? null

  const latestCustomer =
    [...messages]
      .reverse()
      .find(
        message =>
          message.direction ===
          'incoming',
      ) ?? null

  const latestSeller =
    [...messages]
      .reverse()
      .find(
        message =>
          message.direction ===
          'outgoing',
      ) ?? null

  const current_interaction =
    latest
      ? {
          latest_message_id:
            latest.message_id,
          latest_customer_message_id:
            latestCustomer?.message_id ??
            null,
          latest_seller_message_id:
            latestSeller?.message_id ??
            null,
          provenance: [
            latest,
            latestCustomer,
            latestSeller,
          ]
            .filter(
              (
                message,
              ): message is NonNullable<typeof latest> =>
                message !== null,
            )
            .flatMap(
              message =>
                message.provenance,
            ),
        }
      : null

  return {
    messages,
    excluded_messages,
    current_interaction,
  }
}

function emptyCustomer():
  MessageContextCustomerV1 {
  return {
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
    products: [],
    competitors: [],
    commitments: [],
    missing_discovery: [],
    communication_observations: [],
    signals: [],
    resolved_information: [],
    superseded_information: [],
  }
}

function memoryAttributes(
  item: StatefulCommercialMemoryBase,
) {
  const record =
    item as unknown as
      Record<string, unknown>

  const result:
    Record<
      string,
      string | number | boolean | null
    > = {}

  for (
    const key of [
      'commitment_status',
      'scheduled_at',
      'proposed_at',
    ]
  ) {
    const value = record[key]

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      result[key] = value
    }
  }

  return result
}

function isInheritedSummary(
  summary: string,
) {
  return summary.startsWith(
    DURABLE_MEMORY_SEED_SUMMARY_PREFIX,
  )
}

function stateMemoryItem({
  item,
  collection,
  state,
  stateRecordId,
  stateUpdatedAt,
  inheritedSourceCycleId,
}: {
  item: StatefulCommercialMemoryBase
  collection:
    MessageContextMemoryCollectionV1
  state: StatefulCommercialState
  stateRecordId: string
  stateUpdatedAt: string
  inheritedSourceCycleId:
    string | null
}): MessageContextMemoryItemV1 {
  const record =
    item as unknown as
      Record<string, unknown>

  const inherited =
    isInheritedSummary(item.summary)

  return {
    memory_id: item.id,
    collection,
    kind: item.kind,
    summary: item.summary,
    value:
      typeof record.value === 'string'
        ? record.value
        : null,
    confidence:
      typeof record.confidence === 'string'
        ? record.confidence
        : null,
    memory_status:
      item.memory_status,
    created_in_state_version:
      item.created_in_state_version,
    updated_in_state_version:
      item.updated_in_state_version,
    closed_in_state_version:
      item.closed_in_state_version,
    evidence_message_ids:
      stableUniqueStrings(
        item.evidence_message_ids,
      ),
    attributes:
      memoryAttributes(item),
    provenance: [
      createSourceTraceV1({
        source_type: 'state_memory',
        source_id: item.id,
        source_version:
          String(
            item.updated_in_state_version,
          ),
        observed_at:
          stateUpdatedAt,
        source_cycle_id:
          inherited
            ? inheritedSourceCycleId
            : state.cycle_id,
        inheritance:
          inherited
            ? 'inherited_from_previous_cycle'
            : 'observed_in_current_cycle',
        evidence_message_ids:
          item.evidence_message_ids,
        evidence_memory_ids: [
          item.id,
        ],
      }),
      createSourceTraceV1({
        source_type: 'state_snapshot',
        source_id: stateRecordId,
        source_version:
          String(state.version),
        observed_at:
          stateUpdatedAt,
        source_cycle_id:
          state.cycle_id,
      }),
    ],
  }
}

function inheritedSeedItem({
  item,
  collection,
  sourceCycleId,
}: {
  item: {
    kind: string
    summary: string
    confidence: string
    value?: string | null
  }
  collection:
    MessageContextMemoryCollectionV1
  sourceCycleId: string
}): MessageContextMemoryItemV1 {
  return {
    memory_id: null,
    collection,
    kind: item.kind,
    summary: item.summary,
    value: item.value ?? null,
    confidence: item.confidence,
    memory_status: 'active',
    created_in_state_version: null,
    updated_in_state_version: null,
    closed_in_state_version: null,
    evidence_message_ids: [],
    attributes: {},
    provenance: [
      createSourceTraceV1({
        source_type: 'state_memory',
        source_id: null,
        source_version: null,
        observed_at: null,
        source_cycle_id:
          sourceCycleId,
        inheritance:
          'inherited_from_previous_cycle',
        evidence_message_ids: [],
      }),
    ],
  }
}

function pushFact(
  customer: MessageContextCustomerV1,
  item: MessageContextMemoryItemV1,
) {
  const descriptor =
    parseClientCommercialFactKind(
      item.kind,
    )

  if (!descriptor) {
    return
  }

  switch (descriptor.category) {
    case 'objective':
      customer.objectives.push(item)
      return
    case 'problem':
      customer.problems.push(item)
      return
    case 'impact':
      customer.impacts.push(item)
      return
    case 'interest':
      customer.interests.push(item)
      return
    case 'decision_criterion':
      customer.decision_criteria.push(
        item,
      )
      return
    case 'preference':
      customer.preferences.push(item)
      return
    case 'product':
      customer.products.push(item)
      return
    case 'competitor':
      customer.competitors.push(item)
      return
    case 'communication':
      customer
        .communication_observations
        .push(item)
  }
}

function pushHistory(
  customer: MessageContextCustomerV1,
  item: MessageContextMemoryItemV1,
) {
  if (
    item.memory_status === 'resolved'
  ) {
    customer.resolved_information
      .push(item)
    return true
  }

  if (
    item.memory_status ===
    'superseded'
  ) {
    customer.superseded_information
      .push(item)
    return true
  }

  return false
}

function buildCustomer(
  sources:
    MessageIntelligenceContextSourcesV1,
): MessageContextCustomerV1 {
  const customer = emptyCustomer()
  const real = sources.real_context
  const stateRead = real.state_read

  if (stateRead.mode === 'found') {
    const state = stateRead.state
    const inheritedSourceCycleId =
      real.durable_memory_seed
        ?.source_cycle_id ?? null

    const collections:
      Array<
        [
          MessageContextMemoryCollectionV1,
          StatefulCommercialMemoryBase[],
        ]
      > = [
        ['facts', state.facts],
        ['needs', state.needs],
        ['open_loops', state.open_loops],
        ['objections', state.objections],
        ['commitments', state.commitments],
        ['signals', state.signals],
        ['uncertainties', state.uncertainties],
      ]

    for (
      const [collection, items] of
      collections
    ) {
      for (const rawItem of items) {
        const item = stateMemoryItem({
          item: rawItem,
          collection,
          state,
          stateRecordId:
            stateRead.state_record_id,
          stateUpdatedAt:
            stateRead.state_updated_at,
          inheritedSourceCycleId,
        })

        if (pushHistory(customer, item)) {
          continue
        }

        if (collection === 'facts') {
          pushFact(customer, item)
          continue
        }

        if (collection === 'needs') {
          customer.needs.push(item)
          continue
        }

        if (
          collection === 'open_loops'
        ) {
          if (
            item.kind ===
            'client.open_question'
          ) {
            customer.open_questions
              .push(item)
          }
          continue
        }

        if (
          collection === 'objections'
        ) {
          customer.objections.push(item)
          continue
        }

        if (
          collection === 'commitments'
        ) {
          customer.commitments.push(item)
          continue
        }

        if (collection === 'signals') {
          customer.signals.push(item)
          continue
        }

        if (
          parseMissingDiscoveryKind(
            item.kind,
          ) !== null
        ) {
          customer.missing_discovery
            .push(item)
        } else {
          customer.uncertainties
            .push(item)
        }
      }
    }

    return customer
  }

  const seed =
    real.durable_memory_seed

  if (!seed) {
    return customer
  }

  for (const fact of seed.facts) {
    pushFact(
      customer,
      inheritedSeedItem({
        item: fact,
        collection: 'facts',
        sourceCycleId:
          seed.source_cycle_id,
      }),
    )
  }

  for (
    const objection of seed.objections
  ) {
    customer.objections.push(
      inheritedSeedItem({
        item: objection,
        collection: 'objections',
        sourceCycleId:
          seed.source_cycle_id,
      }),
    )
  }

  return customer
}

function publishedBundle(
  bundle:
    CommercialConfigBundle | null,
): CommercialConfigBundle | null {
  return (
    bundle &&
    bundle.version.status ===
      'published'
  )
    ? bundle
    : null
}

function validProduct(
  profile: CommercialProductProfile,
) {
  const definition =
    profile.commercial_product_definition

  if (!definition) {
    return false
  }

  if (
    profile
      .commercial_product_contract_version ===
        'commercial-product-v2' &&
    definition.contract_version ===
      'commercial-product-v2'
  ) {
    return (
      validateCommercialProductDefinition(
        definition,
      ).valid
    )
  }

  if (
    profile
      .commercial_product_contract_version ===
        'commercial-product-v3' &&
    definition.contract_version ===
      'commercial-product-v3'
  ) {
    return (
      validateCommercialComplexProductDefinition(
        definition,
      ).valid
    )
  }

  return false
}

function validFact(
  fact: CommercialFact,
) {
  return (
    fact.is_active &&
    fact
      .commercial_fact_contract_version ===
      'commercial-fact-v2' &&
    fact.commercial_fact_definition !==
      null &&
    fact.commercial_fact_definition
      .contract_version ===
      'commercial-fact-v2' &&
    validateCommercialFactDefinition(
      fact.commercial_fact_definition,
    ).valid
  )
}

function validObjection(
  guide: CommercialObjectionGuide,
) {
  return (
    guide.is_active &&
    guide
      .commercial_objection_contract_version ===
      'commercial-objection-v2' &&
    guide
      .commercial_objection_definition !==
      null &&
    guide
      .commercial_objection_definition
      .contract_version ===
      'commercial-objection-v2' &&
    validateCommercialObjectionDefinition(
      guide
        .commercial_objection_definition,
    ).valid
  )
}

function buildCompany(
  sources:
    MessageIntelligenceContextSourcesV1,
) {
  const bundle =
    publishedBundle(
      sources.real_context
        .commercial_config,
    )

  if (!bundle) {
    return {
      published_method: null,
      commercial_config: null,
      products: [],
      facts: [],
      objection_guides: [],
    }
  }

  const version = bundle.version
  const observedAt =
    version.published_at ??
    version.updated_at

  const configTrace =
    createSourceTraceV1({
      source_type:
        'commercial_config',
      source_id: version.id,
      source_version:
        version.contract_version,
      observed_at:
        observedAt,
    })

  const definition =
    version
      .commercial_method_definition

  const published_method =
    version
      .commercial_method_contract_version ===
        'commercial-method-v2' &&
    definition !== null &&
    definition.contract_version ===
      'commercial-method-v2' &&
    validateCommercialMethodDefinition(
      definition,
    ).valid
      ? {
          config_version_id:
            version.id,
          config_version_number:
            version.version_number,
          definition,
          provenance: [
            createSourceTraceV1({
              source_type:
                'commercial_method',
              source_id:
                version.id,
              source_version:
                definition
                  .contract_version,
              observed_at:
                observedAt,
            }),
          ],
        }
      : null

  const catalog = new Map(
    sources.real_context.products.map(
      product =>
        [
          product.id,
          product,
        ] as const,
    ),
  )

  const products =
    bundle.product_profiles
      .filter(validProduct)
      .sort(
        (left, right) =>
          left.id.localeCompare(
            right.id,
          ),
      )
      .map(profile => {
        const catalogProduct =
          catalog.get(
            profile.product_id,
          ) ?? null

        return {
          profile_id:
            profile.id,
          product_id:
            profile.product_id,
          definition:
            profile
              .commercial_product_definition!,
          catalog:
            catalogProduct,
          provenance: [
            createSourceTraceV1({
              source_type:
                'commercial_product',
              source_id:
                profile.id,
              source_version:
                profile
                  .commercial_product_contract_version,
              observed_at:
                profile.updated_at,
            }),
            ...(
              catalogProduct
                ? [
                    createSourceTraceV1({
                      source_type:
                        'product_catalog',
                      source_id:
                        catalogProduct.id,
                      source_version:
                        null,
                      observed_at:
                        null,
                    }),
                  ]
                : []
            ),
          ],
        }
      })

  const facts =
    bundle.facts
      .filter(validFact)
      .sort((left, right) => {
        const key =
          left.fact_key.localeCompare(
            right.fact_key,
            'pt-BR',
          )

        return key !== 0
          ? key
          : left.id.localeCompare(
              right.id,
            )
      })
      .map(fact => ({
        fact_id: fact.id,
        fact_key: fact.fact_key,
        fact_value:
          fact.fact_value,
        definition:
          fact
            .commercial_fact_definition!,
        provenance: [
          createSourceTraceV1({
            source_type:
              'commercial_fact',
            source_id:
              fact.id,
            source_version:
              fact
                .commercial_fact_contract_version,
            observed_at:
              fact
                .commercial_fact_definition!
                .source.verified_at,
          }),
        ],
      }))

  const objection_guides =
    bundle.objection_guides
      .filter(validObjection)
      .sort(
        (left, right) =>
          left.sort_order -
            right.sort_order ||
          left.id.localeCompare(
            right.id,
          ),
      )
      .map(guide => ({
        objection_guide_id:
          guide.id,
        definition:
          guide
            .commercial_objection_definition!,
        provenance: [
          createSourceTraceV1({
            source_type:
              'commercial_objection',
            source_id: guide.id,
            source_version:
              guide
                .commercial_objection_contract_version,
            observed_at:
              guide.updated_at,
          }),
        ],
      }))

  return {
    published_method,
    commercial_config: {
      config_version_id:
        version.id,
      config_version_number:
        version.version_number,
      business_description:
        version.business_description,
      target_audience:
        version.target_audience,
      value_proposition:
        version.value_proposition,
      communication_tone:
        version.communication_tone,
      required_behaviors: [
        ...version.required_behaviors,
      ],
      prohibited_behaviors: [
        ...version.prohibited_behaviors,
      ],
      provenance: [
        configTrace,
      ],
    },
    products,
    facts,
    objection_guides,
  }
}

function readingTrace(
  sources:
    MessageIntelligenceContextSourcesV1,
  evidenceMessageIds: string[] = [],
  evidenceMemoryIds: string[] = [],
): SourceTraceV1[] {
  const source =
    sources.commercial_reading

  if (!source) {
    return []
  }

  return [
    createSourceTraceV1({
      source_type:
        'commercial_reading',
      source_id:
        source.source_id,
      source_version:
        source.reading
          .contract_version,
      observed_at:
        source.observed_at,
      evidence_message_ids:
        evidenceMessageIds,
      evidence_memory_ids:
        evidenceMemoryIds,
    }),
  ]
}

function buildCommercial(
  request: MessageIntelligenceRequestV1,
  sources:
    MessageIntelligenceContextSourcesV1,
): MessageContextSnapshotV1[
  'commercial'
] {
  const readingSource =
    sources.commercial_reading

  const crmStatus =
    sources.real_context
      .diagnostic_input
      .current_crm_status

  const result:
    MessageContextSnapshotV1[
      'commercial'
    ] = {
      commercial_role: null,
      commercial_relevance: null,
      current_crm_status:
        crmStatus
          ? {
              value: crmStatus,
              provenance: [
                cycleTrace(
                  request,
                  sources,
                ),
              ],
            }
          : null,
      current_method_stage: null,
      method_adherence: null,
      recovery_guidance: null,
      best_approach: null,
    }

  if (!readingSource) {
    const stateRead =
      sources.real_context.state_read

    if (
      stateRead.mode === 'found'
    ) {
      result.commercial_role = {
        value:
          stateRead.state
            .commercial_role,
        provenance: [
          createSourceTraceV1({
            source_type:
              'state_snapshot',
            source_id:
              stateRead
                .state_record_id,
            source_version:
              String(
                stateRead
                  .state_version,
              ),
            observed_at:
              stateRead
                .state_updated_at,
            source_cycle_id:
              stateRead.cycle_id,
          }),
        ],
      }
    }

    return result
  }

  const reading =
    readingSource.reading

  result.commercial_role = {
    value: reading.commercial_role,
    provenance:
      readingTrace(
        sources,
        reading.evidence_message_ids,
        reading.memory_ids,
      ),
  }

  result.commercial_relevance = {
    value:
      reading.commercial_relevance,
    provenance:
      readingTrace(
        sources,
        reading.evidence_message_ids,
        reading.memory_ids,
      ),
  }

  if (reading.method.current_stage) {
    result.current_method_stage = {
      value:
        reading.method.current_stage,
      provenance:
        readingTrace(
          sources,
          reading.method.adherence
            .evidence_message_ids,
          reading.method.adherence
            .memory_ids,
        ),
    }
  }

  result.method_adherence = {
    value:
      reading.method.adherence,
    provenance:
      readingTrace(
        sources,
        reading.method.adherence
          .evidence_message_ids,
        reading.method.adherence
          .memory_ids,
      ),
  }

  if (
    reading.method.recovery_guidance
  ) {
    result.recovery_guidance = {
      value:
        reading.method
          .recovery_guidance,
      provenance:
        readingTrace(
          sources,
          reading.method
            .recovery_guidance
            .evidence_message_ids,
          reading.method
            .recovery_guidance
            .memory_ids,
        ),
    }
  }

  result.best_approach = {
    value:
      reading.best_approach,
    provenance:
      readingTrace(
        sources,
        reading.best_approach
          .evidence_message_ids,
        reading.best_approach
          .memory_ids,
      ),
  }

  return result
}

export function assembleMessageContextSnapshotV1({
  request: rawRequest,
  sources,
}: {
  request: unknown
  sources:
    MessageIntelligenceContextSourcesV1
}): MessageContextSnapshotV1 {
  const request =
    normalizeMessageIntelligenceRequestV1(
      rawRequest,
    )

  assertSourcesScope(
    request,
    sources,
  )

  return {
    contract_version:
      MESSAGE_CONTEXT_SNAPSHOT_CONTRACT_VERSION,
    request_id:
      request.request_id,
    reference_time:
      request.reference_time,
    identity: {
      company_id:
        request.company_id,
      seller_user_id:
        request.seller_user_id,
      cycle_id:
        request.cycle_id,
      conversation_key:
        request.conversation_key,
      provenance: [
        requestTrace(request),
        cycleTrace(
          request,
          sources,
        ),
      ],
    },
    seller_intent: {
      value:
        request.seller_intent,
      provenance: [
        requestTrace(request),
      ],
    },
    conversation:
      buildConversation(sources),
    customer:
      buildCustomer(sources),
    commercial:
      buildCommercial(
        request,
        sources,
      ),
    company:
      buildCompany(sources),
  }
}

export function createMessageContextAssemblerV1({
  load_sources,
}: {
  load_sources:
    MessageIntelligenceContextSourceLoaderV1
}) {
  return async (
    rawRequest: unknown,
  ): Promise<
    MessageContextSnapshotV1
  > => {
    const request =
      normalizeMessageIntelligenceRequestV1(
        rawRequest,
      )

    const sources =
      await load_sources(request)

    return assembleMessageContextSnapshotV1({
      request,
      sources,
    })
  }
}