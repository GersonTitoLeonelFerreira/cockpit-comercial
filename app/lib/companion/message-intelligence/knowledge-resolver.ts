// ============================================================================
// Yolen — Message Intelligence Engine V1
// Frente 2 — Knowledge Resolver
//
// Context Snapshot -> Knowledge Resolver -> KnowledgeResolutionV1
//
// Esta camada NÃO cria estratégia de venda, NÃO escreve mensagem ao
// cliente, NÃO escolhe técnica comercial e NÃO decide governança. Ela
// resolve, a partir do MessageContextSnapshotV1 produzido pela Frente 1,
// o que a Yolen sabe, não sabe, ou sabe de forma condicionada, expirada,
// conflitante, fora de escopo ou proibida.
// ============================================================================

import type {
  CommercialFactScope,
  CommercialFactSource,
  CommercialFactValidity,
} from '../commercial-fact-contract'

import type {
  CommercialObjectionDefinition,
} from '../commercial-objection-contract'

import type {
  CommercialProductPricing,
} from '../commercial-product-contract'

import type {
  CommercialProductStock,
  CommercialProductVariantDefinition,
} from '../commercial-product-complex-contract'

import type {
  MessageContextCommercialV1,
  MessageContextCustomerV1,
  MessageContextFactV1,
  MessageContextMemoryItemV1,
  MessageContextSnapshotV1,
} from './context-snapshot'

import type {
  SourceTraceV1,
} from './source-trace'

import {
  createKnowledgeGapV1,
} from './knowledge-gap'

import {
  createKnowledgeResolutionV1,
  type KnowledgeResolutionV1,
} from './knowledge-resolution'

// ----------------------------------------------------------------------------
// Utilidades compartilhadas: evidência viva vs. mensagem deletada.
// ----------------------------------------------------------------------------

function activeMessageIdSet(
  snapshot: MessageContextSnapshotV1,
): Set<string> {
  return new Set(
    snapshot.conversation.messages.map(
      message => message.message_id,
    ),
  )
}

function deletedMessageIdSet(
  snapshot: MessageContextSnapshotV1,
): Set<string> {
  return new Set(
    snapshot.conversation.excluded_messages.map(
      message => message.message_id,
    ),
  )
}

/**
 * Mensagem deletada nunca sustenta resolução. Separa a evidência citada
 * entre a que ainda está viva na conversa atual e a que foi deletada ou
 * é desconhecida ao snapshot.
 */
export function sanitizeEvidenceMessageIds(
  snapshot: MessageContextSnapshotV1,
  evidenceMessageIds: readonly string[],
): {
  valid: string[]
  invalid: string[]
} {
  const active =
    activeMessageIdSet(snapshot)

  const valid: string[] = []
  const invalid: string[] = []

  for (const id of evidenceMessageIds) {
    if (active.has(id)) {
      valid.push(id)
    } else {
      invalid.push(id)
    }
  }

  return {
    valid,
    invalid,
  }
}

function describesDeletedEvidence(
  snapshot: MessageContextSnapshotV1,
  invalidIds: readonly string[],
): boolean {
  const deleted =
    deletedMessageIdSet(snapshot)

  return invalidIds.some(id =>
    deleted.has(id),
  )
}

// ----------------------------------------------------------------------------
// Fatos oficiais — commercial-fact-v2
// ----------------------------------------------------------------------------

export type KnowledgeFactSubjectV1 = {
  fact_key: string
  scope:
    Pick<
      CommercialFactScope,
      'type' | 'product_id' | 'variant_key' | 'reference_key'
    >
}

export type KnowledgeFactValueV1 = {
  fact_value: string
  category: string
  scope: CommercialFactScope
  conditions: string[]
  limitations: string[]
  validity: CommercialFactValidity
  source: CommercialFactSource
}

export type KnowledgeFactResolutionV1 =
  KnowledgeResolutionV1<
    KnowledgeFactValueV1,
    KnowledgeFactSubjectV1
  >

function scopeEquals(
  left: CommercialFactScope,
  right: KnowledgeFactSubjectV1['scope'],
): boolean {
  return (
    left.type === right.type &&
    left.product_id === right.product_id &&
    left.variant_key === right.variant_key &&
    left.reference_key === right.reference_key
  )
}

function describeFactScope(
  scope: KnowledgeFactSubjectV1['scope'],
): string {
  const parts = [
    `type=${scope.type}`,
  ]

  if (scope.product_id !== null) {
    parts.push(
      `product_id=${scope.product_id}`,
    )
  }

  if (scope.variant_key !== null) {
    parts.push(
      `variant_key=${scope.variant_key}`,
    )
  }

  if (scope.reference_key !== null) {
    parts.push(
      `reference_key=${scope.reference_key}`,
    )
  }

  return parts.join(', ')
}

function isFactExpired(
  validity: CommercialFactValidity,
  referenceTime: string,
): boolean {
  const reference =
    Date.parse(referenceTime)

  if (
    validity.valid_from !== null &&
    Date.parse(validity.valid_from) > reference
  ) {
    return true
  }

  if (
    validity.mode === 'bounded' &&
    validity.valid_until !== null &&
    Date.parse(validity.valid_until) <= reference
  ) {
    return true
  }

  return false
}

function factValue(
  fact: MessageContextFactV1,
): KnowledgeFactValueV1 {
  return {
    fact_value:
      fact.fact_value,
    category:
      fact.definition.category,
    scope:
      fact.definition.scope,
    conditions: [
      ...fact.definition.conditions,
    ],
    limitations: [
      ...fact.definition.limitations,
    ],
    validity:
      fact.definition.validity,
    source:
      fact.definition.source,
  }
}

/**
 * Resolve o conhecimento oficial sobre um fato comercial.
 *
 * Nunca consulta Commercial Reading: um fato só pode ser afirmado a
 * partir de `company.facts` (fonte canônica publicada).
 */
export function resolveFactKnowledgeV1(
  snapshot: MessageContextSnapshotV1,
  query: {
    fact_key: string
    scope?: Partial<
      KnowledgeFactSubjectV1['scope']
    >
    /**
     * Condições declaradas no fato que já foram comprovadas por
     * evidência externa. O resolver nunca assume uma condição como
     * comprovada por conta própria.
     */
    proven_conditions?: readonly string[]
  },
): KnowledgeFactResolutionV1 {
  const requestedScope: KnowledgeFactSubjectV1['scope'] = {
    type:
      query.scope?.type ??
      'company',
    product_id:
      query.scope?.product_id ??
      null,
    variant_key:
      query.scope?.variant_key ??
      null,
    reference_key:
      query.scope?.reference_key ??
      null,
  }

  const subject: KnowledgeFactSubjectV1 = {
    fact_key: query.fact_key,
    scope: requestedScope,
  }

  const sought =
    `fact_key=${query.fact_key}; ${describeFactScope(requestedScope)}`

  const matchesKey =
    snapshot.company.facts.filter(
      fact =>
        fact.fact_key === query.fact_key,
    )

  if (matchesKey.length === 0) {
    return createKnowledgeResolutionV1({
      domain: 'commercial_fact',
      subject,
      status: 'missing',
      gap: createKnowledgeGapV1({
        domain: 'commercial_fact',
        reason: 'not_found',
        sought,
        explanation:
          `Nenhum fato oficial publicado com fact_key "${query.fact_key}".`,
      }),
    })
  }

  const matchesScope =
    matchesKey.filter(fact =>
      scopeEquals(
        fact.definition.scope,
        requestedScope,
      ),
    )

  if (matchesScope.length === 0) {
    return createKnowledgeResolutionV1({
      domain: 'commercial_fact',
      subject,
      status: 'out_of_scope',
      gap: createKnowledgeGapV1({
        domain: 'commercial_fact',
        reason: 'scope_mismatch',
        sought,
        explanation:
          `O fact_key "${query.fact_key}" existe, mas não no escopo solicitado (${describeFactScope(requestedScope)}).`,
        partial_sources:
          matchesKey.flatMap(
            fact => fact.provenance,
          ),
      }),
    })
  }

  const referenceTime =
    snapshot.reference_time

  const activeMatches =
    matchesScope.filter(
      fact =>
        !isFactExpired(
          fact.definition.validity,
          referenceTime,
        ),
    )

  if (activeMatches.length === 0) {
    return createKnowledgeResolutionV1({
      domain: 'commercial_fact',
      subject,
      status: 'expired',
      candidates:
        matchesScope.map(fact => ({
          value: factValue(fact),
          provenance: fact.provenance,
        })),
      gap: createKnowledgeGapV1({
        domain: 'commercial_fact',
        reason: 'expired_source',
        sought,
        explanation:
          `O fact_key "${query.fact_key}" só possui fontes fora de vigência em ${referenceTime}.`,
        partial_sources:
          matchesScope.flatMap(
            fact => fact.provenance,
          ),
      }),
    })
  }

  const sortedActiveMatches = [
    ...activeMatches,
  ].sort((left, right) =>
    left.fact_id.localeCompare(
      right.fact_id,
    ),
  )

  const distinctValues = new Set(
    sortedActiveMatches.map(
      fact => fact.fact_value,
    ),
  )

  if (distinctValues.size > 1) {
    return createKnowledgeResolutionV1({
      domain: 'commercial_fact',
      subject,
      status: 'conflicting',
      candidates:
        sortedActiveMatches.map(fact => ({
          value: factValue(fact),
          provenance: fact.provenance,
        })),
      gap: createKnowledgeGapV1({
        domain: 'commercial_fact',
        reason: 'conflicting_sources',
        sought,
        explanation:
          `Existem fatos oficiais divergentes para fact_key "${query.fact_key}" no mesmo escopo.`,
        partial_sources:
          sortedActiveMatches.flatMap(
            fact => fact.provenance,
          ),
      }),
    })
  }

  const fact =
    sortedActiveMatches[0]

  const declaredConditions =
    fact.definition.conditions

  const provenConditions = new Set(
    (query.proven_conditions ?? []).map(
      condition =>
        condition.trim().toLocaleLowerCase(
          'pt-BR',
        ),
    ),
  )

  const allConditionsProven =
    declaredConditions.every(condition =>
      provenConditions.has(
        condition.trim().toLocaleLowerCase(
          'pt-BR',
        ),
      ),
    )

  if (
    declaredConditions.length > 0 &&
    !allConditionsProven
  ) {
    return createKnowledgeResolutionV1({
      domain: 'commercial_fact',
      subject,
      status: 'condition_unproven',
      gap: createKnowledgeGapV1({
        domain: 'commercial_fact',
        reason: 'unverifiable_condition',
        sought,
        explanation:
          `O fact_key "${query.fact_key}" depende de condições não comprovadas: ${declaredConditions.join('; ')}.`,
        partial_sources:
          fact.provenance,
      }),
    })
  }

  return createKnowledgeResolutionV1({
    domain: 'commercial_fact',
    subject,
    status: 'resolved',
    value: factValue(fact),
    provenance: fact.provenance,
  })
}

// ----------------------------------------------------------------------------
// Produtos — commercial-product-v2 / commercial-product-v3
// ----------------------------------------------------------------------------

export const KNOWLEDGE_PRODUCT_CLAIM_KINDS = [
  'pricing',
  'contract_conditions',
  'payment_conditions',
  'allowed_claims',
  'forbidden_claims',
  'limitations',
  'recommend_when',
  'avoid_when',
  'variants',
  'stock',
] as const

export type KnowledgeProductClaimKind =
  (typeof KNOWLEDGE_PRODUCT_CLAIM_KINDS)[number]

export type KnowledgeProductSubjectV1 = {
  product_id: string
  variant_key: string | null
  claim: KnowledgeProductClaimKind
}

export type KnowledgeProductClaimValueV1 =
  | string[]
  | CommercialProductPricing
  | CommercialProductStock
  | CommercialProductVariantDefinition[]

export type KnowledgeProductResolutionV1 =
  KnowledgeResolutionV1<
    KnowledgeProductClaimValueV1,
    KnowledgeProductSubjectV1
  >

function outOfScopeProductResolution(
  subject: KnowledgeProductSubjectV1,
  sought: string,
  explanation: string,
  partialSources: SourceTraceV1[] = [],
): KnowledgeProductResolutionV1 {
  return createKnowledgeResolutionV1({
    domain: 'commercial_product',
    subject,
    status: 'out_of_scope',
    gap: createKnowledgeGapV1({
      domain: 'commercial_product',
      reason: 'scope_mismatch',
      sought,
      explanation,
      partial_sources: partialSources,
    }),
  })
}

/**
 * Resolve o conhecimento comercial disponível sobre uma afirmação de
 * produto. Nunca transforma `recommend_when`/`avoid_when` em estratégia
 * — apenas responde se a afirmação é comprovável e aplicável.
 */
export function resolveProductClaimKnowledgeV1(
  snapshot: MessageContextSnapshotV1,
  query: {
    product_id: string
    variant_key?: string | null
    claim: KnowledgeProductClaimKind
  },
): KnowledgeProductResolutionV1 {
  const variantKey =
    query.variant_key ?? null

  const subject: KnowledgeProductSubjectV1 = {
    product_id: query.product_id,
    variant_key: variantKey,
    claim: query.claim,
  }

  const sought =
    `product_id=${query.product_id}; variant_key=${variantKey ?? 'null'}; claim=${query.claim}`

  const product =
    snapshot.company.products.find(
      entry =>
        entry.product_id ===
        query.product_id,
    )

  if (!product) {
    return createKnowledgeResolutionV1({
      domain: 'commercial_product',
      subject,
      status: 'missing',
      gap: createKnowledgeGapV1({
        domain: 'commercial_product',
        reason: 'not_found',
        sought,
        explanation:
          `Nenhum produto publicado com product_id "${query.product_id}".`,
      }),
    })
  }

  const definition =
    product.definition

  let variant:
    CommercialProductVariantDefinition | null =
      null

  if (variantKey !== null) {
    if (definition.product_kind !== 'complex') {
      return outOfScopeProductResolution(
        subject,
        sought,
        `O produto "${query.product_id}" não possui variantes.`,
        product.provenance,
      )
    }

    variant =
      definition.variants.find(
        item => item.key === variantKey,
      ) ?? null

    if (!variant) {
      return outOfScopeProductResolution(
        subject,
        sought,
        `A variante "${variantKey}" não existe para o produto "${query.product_id}".`,
        product.provenance,
      )
    }
  }

  const resolved = (
    value: KnowledgeProductClaimValueV1,
  ): KnowledgeProductResolutionV1 =>
    createKnowledgeResolutionV1({
      domain: 'commercial_product',
      subject,
      status: 'resolved',
      value,
      provenance: product.provenance,
    })

  const forbiddenOrResolved = (
    claims: readonly string[],
  ): KnowledgeProductResolutionV1 => {
    const value = [
      ...claims,
    ]

    if (value.length === 0) {
      return resolved(value)
    }

    return createKnowledgeResolutionV1({
      domain: 'commercial_product',
      subject,
      status: 'forbidden',
      value,
      gap: createKnowledgeGapV1({
        domain: 'commercial_product',
        reason: 'not_found',
        sought,
        explanation:
          `Existem afirmações explicitamente proibidas para "${query.product_id}"${variantKey ? ` (variante ${variantKey})` : ''}.`,
      }),
      provenance: product.provenance,
    })
  }

  switch (query.claim) {
    case 'contract_conditions':
      return resolved([
        ...definition.contract_conditions,
      ])

    case 'payment_conditions':
      return resolved([
        ...definition.payment_conditions,
      ])

    case 'allowed_claims':
      return resolved([
        ...(variant?.allowed_claims ??
          definition.allowed_claims),
      ])

    case 'forbidden_claims':
      return forbiddenOrResolved(
        variant?.forbidden_claims ??
          definition.forbidden_claims,
      )

    case 'limitations':
      return resolved([
        ...(variant?.limitations ??
          definition.limitations),
      ])

    case 'recommend_when':
      return resolved([
        ...(variant?.recommend_when ??
          definition.recommend_when),
      ])

    case 'avoid_when':
      return resolved([
        ...(variant?.avoid_when ??
          definition.avoid_when),
      ])

    case 'variants': {
      if (definition.product_kind !== 'complex') {
        return outOfScopeProductResolution(
          subject,
          sought,
          `O produto "${query.product_id}" é simples e não possui variantes.`,
          product.provenance,
        )
      }

      return resolved([
        ...definition.variants,
      ])
    }

    case 'stock': {
      if (variant === null) {
        return outOfScopeProductResolution(
          subject,
          sought,
          'Disponibilidade em estoque só é rastreada por variante para este produto.',
          product.provenance,
        )
      }

      if (variant.stock.status === 'unknown') {
        return createKnowledgeResolutionV1({
          domain: 'commercial_product',
          subject,
          status: 'missing',
          gap: createKnowledgeGapV1({
            domain: 'commercial_product',
            reason: 'not_found',
            sought,
            explanation:
              `A disponibilidade em estoque da variante "${variantKey}" não é conhecida.`,
          }),
        })
      }

      if (
        variant.stock.valid_until !== null &&
        Date.parse(
          variant.stock.valid_until,
        ) <= Date.parse(
          snapshot.reference_time,
        )
      ) {
        return createKnowledgeResolutionV1({
          domain: 'commercial_product',
          subject,
          status: 'expired',
          candidates: [
            {
              value: variant.stock,
              provenance: product.provenance,
            },
          ],
          gap: createKnowledgeGapV1({
            domain: 'commercial_product',
            reason: 'expired_source',
            sought,
            explanation:
              `A verificação de estoque da variante "${variantKey}" não está mais vigente em ${snapshot.reference_time}.`,
            partial_sources:
              product.provenance,
          }),
        })
      }

      return resolved(variant.stock)
    }

    case 'pricing': {
      const pricing =
        variant?.pricing ??
        (definition.product_kind === 'simple'
          ? definition.pricing
          : null)

      if (pricing === null) {
        return outOfScopeProductResolution(
          subject,
          sought,
          `O preço de "${query.product_id}" é definido por variante; informe variant_key.`,
          product.provenance,
        )
      }

      if (pricing.model === 'unknown') {
        return createKnowledgeResolutionV1({
          domain: 'commercial_product',
          subject,
          status: 'missing',
          gap: createKnowledgeGapV1({
            domain: 'commercial_product',
            reason: 'not_found',
            sought,
            explanation:
              `O modelo de precificação de "${query.product_id}" não é conhecido.`,
          }),
        })
      }

      if (pricing.model === 'quote_required') {
        return createKnowledgeResolutionV1({
          domain: 'commercial_product',
          subject,
          status: 'approval_required',
          value: pricing,
          gap: createKnowledgeGapV1({
            domain: 'commercial_product',
            reason: 'requires_quote_or_approval',
            sought,
            explanation:
              `O preço de "${query.product_id}" depende de cotação individual antes de poder ser afirmado.`,
          }),
          provenance: product.provenance,
        })
      }

      return resolved(pricing)
    }

    default:
      return outOfScopeProductResolution(
        subject,
        sought,
        `Afirmação "${String(query.claim)}" não é reconhecida para produtos.`,
      )
  }
}

// ----------------------------------------------------------------------------
// Objeções — commercial-objection-v2
// ----------------------------------------------------------------------------

export type KnowledgeObjectionSubjectV1 = {
  objection_key: string
}

export type KnowledgeObjectionResolutionV1 =
  KnowledgeResolutionV1<
    CommercialObjectionDefinition,
    KnowledgeObjectionSubjectV1
  >

/**
 * Resolve a orientação oficial existente para uma objeção comercial.
 *
 * Preserva integralmente a distinção do domínio entre objeção,
 * pergunta, pedido de informação, condição, adiamento, recusa e
 * incerteza (`distinguish_from`). NUNCA decide qual delas está ocorrendo
 * na conversa atual — essa classificação não pertence a esta frente.
 */
export function resolveObjectionGuideKnowledgeV1(
  snapshot: MessageContextSnapshotV1,
  query: {
    objection_key: string
  },
): KnowledgeObjectionResolutionV1 {
  const subject: KnowledgeObjectionSubjectV1 = {
    objection_key: query.objection_key,
  }

  const sought =
    `objection_key=${query.objection_key}`

  const guide =
    snapshot.company.objection_guides.find(
      entry =>
        entry.definition.objection_key ===
        query.objection_key,
    )

  if (!guide) {
    return createKnowledgeResolutionV1({
      domain: 'commercial_objection',
      subject,
      status: 'missing',
      gap: createKnowledgeGapV1({
        domain: 'commercial_objection',
        reason: 'not_found',
        sought,
        explanation:
          `Nenhum guia oficial de objeção com objection_key "${query.objection_key}".`,
      }),
    })
  }

  return createKnowledgeResolutionV1({
    domain: 'commercial_objection',
    subject,
    status: 'resolved',
    value: guide.definition,
    provenance: guide.provenance,
  })
}

// ----------------------------------------------------------------------------
// Commercial Reading — fonte derivada, nunca superior ao canônico.
// ----------------------------------------------------------------------------

export const KNOWLEDGE_COMMERCIAL_READING_FIELDS = [
  'commercial_role',
  'commercial_relevance',
  'current_crm_status',
  'current_method_stage',
  'method_adherence',
  'recovery_guidance',
  'best_approach',
] as const

export type KnowledgeCommercialReadingField =
  (typeof KNOWLEDGE_COMMERCIAL_READING_FIELDS)[number]

export type KnowledgeCommercialReadingSubjectV1 = {
  field: KnowledgeCommercialReadingField
}

export type KnowledgeCommercialReadingResolutionV1 = {
  /**
   * Marca explicitamente que esta resolução nunca tem autoridade
   * superior a uma fonte canônica (ledger, memória, fatos, produtos,
   * objeções, método ou configuração publicados).
   */
  authority: 'derived_commercial_reading'

  resolution:
    KnowledgeResolutionV1<
      unknown,
      KnowledgeCommercialReadingSubjectV1
    >
}

/**
 * Resolve os campos derivados de Commercial Reading expostos pelo
 * snapshot. É sempre marcada como fonte derivada e nunca é consultada
 * pelos resolvers de fatos, produtos ou objeções.
 */
export function resolveCommercialReadingFieldKnowledgeV1(
  snapshot: MessageContextSnapshotV1,
  field: KnowledgeCommercialReadingField,
): KnowledgeCommercialReadingResolutionV1 {
  const subject: KnowledgeCommercialReadingSubjectV1 = {
    field,
  }

  const sought =
    `commercial.${field}`

  const sourced:
    MessageContextCommercialV1[
      typeof field
    ] = snapshot.commercial[field]

  if (sourced === null) {
    return {
      authority: 'derived_commercial_reading',
      resolution: createKnowledgeResolutionV1({
        domain: 'commercial_reading',
        subject,
        status: 'missing',
        gap: createKnowledgeGapV1({
          domain: 'commercial_reading',
          reason: 'no_active_source',
          sought,
          explanation:
            `Nenhuma leitura comercial disponível para "${field}" no ciclo atual.`,
        }),
      }),
    }
  }

  return {
    authority: 'derived_commercial_reading',
    resolution: createKnowledgeResolutionV1({
      domain: 'commercial_reading',
      subject,
      status: 'resolved',
      value: sourced.value,
      provenance: sourced.provenance,
    }),
  }
}

// ----------------------------------------------------------------------------
// Memória do cliente (customer.*) — herança nunca vira fato atual sozinha.
// ----------------------------------------------------------------------------

/**
 * Categorias do bloco `customer.*` do MessageContextSnapshotV1 (ex.:
 * objectives, problems, objections, uncertainties...).
 */
export type KnowledgeCustomerCategory =
  keyof MessageContextCustomerV1

export type KnowledgeCustomerMemorySubjectV1 = {
  category: KnowledgeCustomerCategory
  memory_id: string | null
  kind: string | null
}

export type KnowledgeCustomerMemoryValueV1 = {
  summary: string
  value: string | null
  confidence: string | null
}

export type KnowledgeCustomerMemoryResolutionV1 =
  KnowledgeResolutionV1<
    KnowledgeCustomerMemoryValueV1,
    KnowledgeCustomerMemorySubjectV1
  >

function isInheritedItem(
  item: MessageContextMemoryItemV1,
): boolean {
  return item.provenance.some(
    trace =>
      trace.inheritance ===
      'inherited_from_previous_cycle',
  )
}

/**
 * Resolve o conhecimento sobre um item de memória do cliente
 * (`customer.*`). Memória herdada de ciclo anterior sem evidência
 * comprovada no ciclo atual, e evidência apoiada exclusivamente em
 * mensagem deletada, nunca viram fato atual — permanecem
 * `insufficient_evidence`.
 */
export function resolveCustomerMemoryKnowledgeV1(
  snapshot: MessageContextSnapshotV1,
  query: {
    category: KnowledgeCustomerCategory
    memory_id?: string | null
    kind?: string
  },
): KnowledgeCustomerMemoryResolutionV1 {
  if (
    query.memory_id === undefined &&
    query.kind === undefined
  ) {
    throw new Error(
      'resolveCustomerMemoryKnowledgeV1 exige memory_id ou kind.',
    )
  }

  const subject: KnowledgeCustomerMemorySubjectV1 = {
    category: query.category,
    memory_id:
      query.memory_id ?? null,
    kind:
      query.kind ?? null,
  }

  const sought =
    `category=${String(query.category)}; memory_id=${query.memory_id ?? 'null'}; kind=${query.kind ?? 'null'}`

  const items: MessageContextMemoryItemV1[] =
    snapshot.customer[
      query.category
    ]

  const matches = items.filter(item =>
    (
      query.memory_id !== undefined
        ? item.memory_id === query.memory_id
        : true
    ) &&
    (
      query.kind !== undefined
        ? item.kind === query.kind
        : true
    ),
  )

  if (matches.length === 0) {
    return createKnowledgeResolutionV1({
      domain: 'customer_memory',
      subject,
      status: 'missing',
      gap: createKnowledgeGapV1({
        domain: 'customer_memory',
        reason: 'not_found',
        sought,
        explanation:
          `Nenhum item de memória do cliente encontrado (${sought}).`,
      }),
    })
  }

  const sortedMatches = [
    ...matches,
  ].sort((left, right) =>
    (left.memory_id ?? '').localeCompare(
      right.memory_id ?? '',
    ),
  )

  const item = sortedMatches[0]

  const {
    valid: validEvidence,
    invalid: invalidEvidence,
  } = sanitizeEvidenceMessageIds(
    snapshot,
    item.evidence_message_ids,
  )

  const value: KnowledgeCustomerMemoryValueV1 = {
    summary: item.summary,
    value: item.value,
    confidence: item.confidence,
  }

  if (
    describesDeletedEvidence(
      snapshot,
      invalidEvidence,
    ) &&
    validEvidence.length === 0
  ) {
    return createKnowledgeResolutionV1({
      domain: 'customer_memory',
      subject,
      status: 'insufficient_evidence',
      gap: createKnowledgeGapV1({
        domain: 'customer_memory',
        reason: 'unsupported_evidence',
        sought,
        explanation:
          'A única evidência citada para este item de memória foi deletada da conversa.',
        partial_sources:
          item.provenance,
      }),
    })
  }

  const inherited =
    isInheritedItem(item)

  if (
    inherited &&
    validEvidence.length === 0
  ) {
    return createKnowledgeResolutionV1({
      domain: 'customer_memory',
      subject,
      status: 'insufficient_evidence',
      gap: createKnowledgeGapV1({
        domain: 'customer_memory',
        reason: 'inherited_without_current_evidence',
        sought,
        explanation:
          'Este item foi herdado de um ciclo anterior e não possui evidência comprovada no ciclo atual.',
        partial_sources:
          item.provenance,
      }),
    })
  }

  if (item.memory_status === 'superseded') {
    return createKnowledgeResolutionV1({
      domain: 'customer_memory',
      subject,
      status: 'expired',
      candidates: [
        {
          value,
          provenance: item.provenance,
        },
      ],
      gap: createKnowledgeGapV1({
        domain: 'customer_memory',
        reason: 'superseded_by_newer_information',
        sought,
        explanation:
          'Este item de memória foi superado por informação mais recente.',
        partial_sources:
          item.provenance,
      }),
    })
  }

  return createKnowledgeResolutionV1({
    domain: 'customer_memory',
    subject,
    status: 'resolved',
    value,
    provenance: item.provenance,
  })
}

// ----------------------------------------------------------------------------
// Fachada de conveniência.
// ----------------------------------------------------------------------------

export function createKnowledgeResolverV1(
  snapshot: MessageContextSnapshotV1,
) {
  return {
    resolve_fact: (
      query: Parameters<
        typeof resolveFactKnowledgeV1
      >[1],
    ) =>
      resolveFactKnowledgeV1(
        snapshot,
        query,
      ),

    resolve_product_claim: (
      query: Parameters<
        typeof resolveProductClaimKnowledgeV1
      >[1],
    ) =>
      resolveProductClaimKnowledgeV1(
        snapshot,
        query,
      ),

    resolve_objection_guide: (
      query: Parameters<
        typeof resolveObjectionGuideKnowledgeV1
      >[1],
    ) =>
      resolveObjectionGuideKnowledgeV1(
        snapshot,
        query,
      ),

    resolve_commercial_reading_field: (
      field: KnowledgeCommercialReadingField,
    ) =>
      resolveCommercialReadingFieldKnowledgeV1(
        snapshot,
        field,
      ),

    resolve_customer_memory: (
      query: Parameters<
        typeof resolveCustomerMemoryKnowledgeV1
      >[1],
    ) =>
      resolveCustomerMemoryKnowledgeV1(
        snapshot,
        query,
      ),
  }
}
