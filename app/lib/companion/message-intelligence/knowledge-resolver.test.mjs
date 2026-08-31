import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assembleMessageContextSnapshotV1,
} from './context-assembler.ts'

import {
  buildMessageIntelligenceRequestFixture,
  buildMessageIntelligenceSourcesFixture,
  buildConflictingFactFixture,
  MESSAGE_INTELLIGENCE_FIXTURE_IDS,
} from './fixtures.ts'

import {
  createSourceTraceV1,
} from './source-trace.ts'

import {
  createKnowledgeGapV1,
} from './knowledge-gap.ts'

import {
  createKnowledgeResolutionV1,
  isCanonicalSourceType,
  sourceAuthorityRank,
} from './knowledge-resolution.ts'

import * as KnowledgeResolver from './knowledge-resolver.ts'

const {
  resolveFactKnowledgeV1,
  resolveProductClaimKnowledgeV1,
  resolveObjectionGuideKnowledgeV1,
  resolveCommercialReadingFieldKnowledgeV1,
  resolveCustomerMemoryKnowledgeV1,
  sanitizeEvidenceMessageIds,
  createKnowledgeResolverV1,
} = KnowledgeResolver

const ids =
  MESSAGE_INTELLIGENCE_FIXTURE_IDS

function baseSnapshot() {
  return assembleMessageContextSnapshotV1({
    request:
      buildMessageIntelligenceRequestFixture(),
    sources:
      buildMessageIntelligenceSourcesFixture(),
  })
}

function factDefinitionOverride(
  overrides = {},
) {
  return {
    contract_version:
      'commercial-fact-v2',
    fact_kind:
      'official',
    category:
      'operation',
    fact_key:
      'support_hours',
    fact_value:
      'Atendimento em horário comercial.',
    scope: {
      type: 'company',
      product_id: null,
      variant_key: null,
      reference_key: null,
    },
    conditions: [],
    limitations: [],
    validity: {
      mode: 'ongoing',
      valid_from:
        '2026-08-01T00:00:00.000Z',
      valid_until: null,
    },
    source: {
      type: 'internal_policy',
      reference:
        'Configuração publicada.',
      verified_at:
        '2026-08-29T18:00:00.000Z',
    },
    ...overrides,
  }
}

function snapshotWithExtraFact(
  factOverrides,
  factRecordOverrides = {},
) {
  const request =
    buildMessageIntelligenceRequestFixture()

  const sources =
    buildMessageIntelligenceSourcesFixture()

  const definition =
    factDefinitionOverride(
      factOverrides,
    )

  sources.real_context.commercial_config.facts.push({
    id: 'fact-extra-1',
    company_id: ids.company_id,
    config_version_id:
      ids.config_version_id,
    commercial_fact_contract_version:
      'commercial-fact-v2',
    commercial_fact_definition:
      definition,
    category: definition.category,
    fact_key: definition.fact_key,
    fact_value: definition.fact_value,
    source_note: null,
    is_active: true,
    created_at:
      '2026-08-20T10:00:00.000Z',
    updated_at:
      '2026-08-29T18:00:00.000Z',
    ...factRecordOverrides,
  })

  return assembleMessageContextSnapshotV1({
    request,
    sources,
  })
}

// ----------------------------------------------------------------------------
// Fatos oficiais
// ----------------------------------------------------------------------------

test(
  '1. fato oficial válido resolve como resolved, com provenance',
  () => {
    const snapshot = baseSnapshot()

    const resolution =
      resolveFactKnowledgeV1(snapshot, {
        fact_key: 'support_hours',
      })

    assert.equal(
      resolution.status,
      'resolved',
    )
    assert.equal(
      resolution.value.fact_value,
      'Atendimento em horário comercial.',
    )
    assert.equal(
      resolution.gap,
      null,
    )
    assert.ok(
      resolution.provenance.length > 0,
    )
    assert.deepEqual(
      resolution.provenance,
      snapshot.company.facts.find(
        fact =>
          fact.fact_key ===
          'support_hours',
      ).provenance,
    )
  },
)

test(
  '2 / 13. ausência de fato vira knowledge gap e nunca é preenchida',
  () => {
    const snapshot = baseSnapshot()

    const resolution =
      resolveFactKnowledgeV1(snapshot, {
        fact_key: 'nonexistent_key',
      })

    assert.equal(
      resolution.status,
      'missing',
    )
    assert.equal(
      resolution.value,
      null,
    )
    assert.equal(
      resolution.gap.domain,
      'commercial_fact',
    )
    assert.equal(
      resolution.gap.reason,
      'not_found',
    )
  },
)

test(
  '3. dois fatos oficiais incompatíveis viram conflicting, nunca escolhidos silenciosamente',
  () => {
    const request =
      buildMessageIntelligenceRequestFixture()

    const sources =
      buildMessageIntelligenceSourcesFixture()

    sources.real_context.commercial_config.facts.push(
      buildConflictingFactFixture(),
    )

    const snapshot =
      assembleMessageContextSnapshotV1({
        request,
        sources,
      })

    const resolution =
      resolveFactKnowledgeV1(snapshot, {
        fact_key: 'support_hours',
      })

    assert.equal(
      resolution.status,
      'conflicting',
    )
    assert.equal(
      resolution.value,
      null,
    )
    assert.equal(
      resolution.candidates.length,
      2,
    )

    const values =
      resolution.candidates
        .map(
          candidate =>
            candidate.value.fact_value,
        )
        .sort()

    assert.deepEqual(
      values,
      [
        'Atendimento 24 horas.',
        'Atendimento em horário comercial.',
      ],
    )
  },
)

test(
  '4. fato existente fora do escopo solicitado vira out_of_scope',
  () => {
    const snapshot = baseSnapshot()

    const resolution =
      resolveFactKnowledgeV1(snapshot, {
        fact_key: 'support_hours',
        scope: {
          type: 'product',
          product_id: ids.product_id,
        },
      })

    assert.equal(
      resolution.status,
      'out_of_scope',
    )
    assert.equal(
      resolution.value,
      null,
    )
    assert.equal(
      resolution.gap.reason,
      'scope_mismatch',
    )
  },
)

test(
  '5. fato dependente de condição não comprovada vira condition_unproven',
  () => {
    const snapshot =
      snapshotWithExtraFact({
        fact_key: 'trial_discount',
        fact_value:
          'Desconto de 10% aplicável.',
        conditions: [
          'Cliente precisa ter plano ativo há 6 meses.',
        ],
      })

    const unproven =
      resolveFactKnowledgeV1(snapshot, {
        fact_key: 'trial_discount',
      })

    assert.equal(
      unproven.status,
      'condition_unproven',
    )
    assert.equal(
      unproven.value,
      null,
    )
    assert.equal(
      unproven.gap.reason,
      'unverifiable_condition',
    )

    const proven =
      resolveFactKnowledgeV1(snapshot, {
        fact_key: 'trial_discount',
        proven_conditions: [
          'Cliente precisa ter plano ativo há 6 meses.',
        ],
      })

    assert.equal(
      proven.status,
      'resolved',
    )
    assert.equal(
      proven.value.fact_value,
      'Desconto de 10% aplicável.',
    )
  },
)

test(
  '6. fato vencido não vira verdade operacional (expired)',
  () => {
    const snapshot =
      snapshotWithExtraFact({
        fact_key: 'seasonal_offer',
        fact_value:
          'Oferta de verão ativa.',
        validity: {
          mode: 'bounded',
          valid_from:
            '2026-01-01T00:00:00.000Z',
          valid_until:
            '2026-08-01T00:00:00.000Z',
        },
      })

    const resolution =
      resolveFactKnowledgeV1(snapshot, {
        fact_key: 'seasonal_offer',
      })

    assert.equal(
      resolution.status,
      'expired',
    )
    assert.equal(
      resolution.value,
      null,
    )
    assert.equal(
      resolution.gap.reason,
      'expired_source',
    )
    assert.equal(
      resolution.candidates.length,
      1,
    )
  },
)

// ----------------------------------------------------------------------------
// Produtos
// ----------------------------------------------------------------------------

test(
  '7 / 10. produto preserva allowed_claims e forbidden_claims (forbidden é proibido, não ausência)',
  () => {
    const snapshot = baseSnapshot()

    const allowed =
      resolveProductClaimKnowledgeV1(
        snapshot,
        {
          product_id: ids.product_id,
          claim: 'allowed_claims',
        },
      )

    assert.equal(
      allowed.status,
      'resolved',
    )
    assert.deepEqual(
      allowed.value,
      [
        'Suporte incluído.',
      ],
    )

    const forbidden =
      resolveProductClaimKnowledgeV1(
        snapshot,
        {
          product_id: ids.product_id,
          claim: 'forbidden_claims',
        },
      )

    assert.equal(
      forbidden.status,
      'forbidden',
    )
    assert.deepEqual(
      forbidden.value,
      [
        'Resultado garantido.',
      ],
    )
    assert.notEqual(
      forbidden.gap,
      null,
    )
  },
)

test(
  'produto desconhecido vira missing, produto sem preço quote_required vira approval_required',
  () => {
    const snapshot = baseSnapshot()

    const missingProduct =
      resolveProductClaimKnowledgeV1(
        snapshot,
        {
          product_id: 'unknown-product',
          claim: 'pricing',
        },
      )

    assert.equal(
      missingProduct.status,
      'missing',
    )

    const quoteSnapshot =
      structuredClone(snapshot)

    quoteSnapshot.company.products[0]
      .definition.pricing.model =
      'quote_required'
    quoteSnapshot.company.products[0]
      .definition.pricing.amount =
      null

    const quoteResolution =
      resolveProductClaimKnowledgeV1(
        quoteSnapshot,
        {
          product_id: ids.product_id,
          claim: 'pricing',
        },
      )

    assert.equal(
      quoteResolution.status,
      'approval_required',
    )
    assert.equal(
      quoteResolution.value.model,
      'quote_required',
    )
    assert.equal(
      quoteResolution.gap.reason,
      'requires_quote_or_approval',
    )
  },
)

// ----------------------------------------------------------------------------
// Objeções
// ----------------------------------------------------------------------------

test(
  '11. objeção preserva distinguish_from (question/information_request) sem classificar a conversa atual',
  () => {
    const snapshot = baseSnapshot()

    const resolution =
      resolveObjectionGuideKnowledgeV1(
        snapshot,
        {
          objection_key:
            'price_value',
        },
      )

    assert.equal(
      resolution.status,
      'resolved',
    )
    assert.ok(
      resolution.value.distinguish_from.includes(
        'question',
      ),
    )
    assert.ok(
      resolution.value.distinguish_from.includes(
        'information_request',
      ),
    )

    // A resolução só carrega os campos do contrato v2 — nunca uma
    // classificação nova de "isto é uma objeção agora".
    assert.deepEqual(
      Object.keys(resolution).sort(),
      [
        'candidates',
        'contract_version',
        'domain',
        'gap',
        'provenance',
        'status',
        'subject',
        'value',
      ],
    )

    const missing =
      resolveObjectionGuideKnowledgeV1(
        snapshot,
        {
          objection_key:
            'unknown_objection',
        },
      )

    assert.equal(
      missing.status,
      'missing',
    )
  },
)

// ----------------------------------------------------------------------------
// Commercial Reading — fonte derivada.
// ----------------------------------------------------------------------------

test(
  '12. Commercial Reading nunca vence fato oficial nem é consultada pelo resolver de fatos',
  () => {
    const snapshot = baseSnapshot()

    snapshot.commercial.current_crm_status = {
      value: 'negociacao',
      provenance: [
        createSourceTraceV1({
          source_type:
            'commercial_reading',
          source_id: 'reading-1',
          source_version:
            'commercial-reading-v1',
          observed_at:
            snapshot.reference_time,
        }),
      ],
    }

    const factResolution =
      resolveFactKnowledgeV1(snapshot, {
        fact_key: 'support_hours',
      })

    assert.equal(
      factResolution.status,
      'resolved',
    )
    assert.ok(
      factResolution.provenance.every(
        trace =>
          trace.source_type !==
          'commercial_reading',
      ),
    )

    const readingResolution =
      resolveCommercialReadingFieldKnowledgeV1(
        snapshot,
        'current_crm_status',
      )

    assert.equal(
      readingResolution.authority,
      'derived_commercial_reading',
    )
    assert.equal(
      readingResolution.resolution
        .status,
      'resolved',
    )
    assert.equal(
      readingResolution.resolution
        .provenance[0].source_type,
      'commercial_reading',
    )

    assert.equal(
      sourceAuthorityRank(
        'commercial_fact',
      ) <
        sourceAuthorityRank(
          'commercial_reading',
        ),
      true,
    )
    assert.equal(
      isCanonicalSourceType(
        'commercial_reading',
      ),
      false,
    )
    assert.equal(
      isCanonicalSourceType(
        'commercial_fact',
      ),
      true,
    )
  },
)

test(
  'campo de leitura comercial ausente vira missing, nunca inventado',
  () => {
    const snapshot = baseSnapshot()

    const resolution =
      resolveCommercialReadingFieldKnowledgeV1(
        snapshot,
        'best_approach',
      )

    assert.equal(
      resolution.authority,
      'derived_commercial_reading',
    )
    assert.equal(
      resolution.resolution.status,
      'missing',
    )
    assert.equal(
      resolution.resolution.value,
      null,
    )
  },
)

// ----------------------------------------------------------------------------
// Memória do cliente — herança e mensagens deletadas.
// ----------------------------------------------------------------------------

function withCustomerMemoryItem(
  snapshot,
  item,
) {
  const clone =
    structuredClone(snapshot)

  clone.customer.objectives.push(item)

  return clone
}

test(
  '8. memória herdada sem evidência atual não vira fato atual (insufficient_evidence)',
  () => {
    const base = baseSnapshot()

    const inheritedItem = {
      memory_id: null,
      collection: 'facts',
      kind: 'client.objective.inherited',
      summary:
        'Cliente busca reduzir custos operacionais.',
      value: null,
      confidence: 'medium',
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
            ids.previous_cycle_id,
          inheritance:
            'inherited_from_previous_cycle',
          evidence_message_ids: [],
        }),
      ],
    }

    const snapshot =
      withCustomerMemoryItem(
        base,
        inheritedItem,
      )

    const resolution =
      resolveCustomerMemoryKnowledgeV1(
        snapshot,
        {
          category: 'objectives',
          kind:
            'client.objective.inherited',
        },
      )

    assert.equal(
      resolution.status,
      'insufficient_evidence',
    )
    assert.equal(
      resolution.value,
      null,
    )
    assert.equal(
      resolution.gap.reason,
      'inherited_without_current_evidence',
    )
  },
)

test(
  '9. mensagem deletada nunca sustenta resolução',
  () => {
    const base = baseSnapshot()

    // A fixture já possui a mensagem "3" como deletada
    // (conversation.excluded_messages).
    assert.ok(
      base.conversation.excluded_messages.some(
        message =>
          message.message_id === '3',
      ),
    )

    const deletedOnlyItem = {
      memory_id: 'mem-deleted-only',
      collection: 'facts',
      kind: 'client.objective.deleted_only',
      summary:
        'Informação apoiada apenas em mensagem deletada.',
      value: null,
      confidence: 'low',
      memory_status: 'active',
      created_in_state_version: 4,
      updated_in_state_version: 4,
      closed_in_state_version: null,
      evidence_message_ids: [
        '3',
      ],
      attributes: {},
      provenance: [
        createSourceTraceV1({
          source_type: 'state_memory',
          source_id:
            'mem-deleted-only',
          source_version: '4',
          observed_at:
            base.reference_time,
          source_cycle_id: ids.cycle_id,
          inheritance:
            'observed_in_current_cycle',
          evidence_message_ids: [
            '3',
          ],
        }),
      ],
    }

    const snapshot =
      withCustomerMemoryItem(
        base,
        deletedOnlyItem,
      )

    const resolution =
      resolveCustomerMemoryKnowledgeV1(
        snapshot,
        {
          category: 'objectives',
          kind:
            'client.objective.deleted_only',
        },
      )

    assert.equal(
      resolution.status,
      'insufficient_evidence',
    )
    assert.equal(
      resolution.value,
      null,
    )
    assert.equal(
      resolution.gap.reason,
      'unsupported_evidence',
    )

    const sanitized =
      sanitizeEvidenceMessageIds(
        snapshot,
        [
          '2',
          '3',
        ],
      )

    assert.deepEqual(
      sanitized.valid,
      [
        '2',
      ],
    )
    assert.deepEqual(
      sanitized.invalid,
      [
        '3',
      ],
    )
  },
)

test(
  'memória ativa com evidência viva no ciclo atual resolve normalmente',
  () => {
    const base = baseSnapshot()

    const resolution =
      resolveCustomerMemoryKnowledgeV1(
        base,
        {
          category: 'objectives',
          kind: 'client.objective',
        },
      )

    assert.equal(
      resolution.status,
      'resolved',
    )
    assert.equal(
      resolution.value.summary,
      'Organizar o processo comercial.',
    )
    assert.ok(
      resolution.provenance.length > 0,
    )
  },
)

// ----------------------------------------------------------------------------
// 14. provenance chega ao resultado
// ----------------------------------------------------------------------------

test(
  '14. provenance chega ao resultado em todos os domínios resolvidos',
  () => {
    const snapshot = baseSnapshot()

    const fact =
      resolveFactKnowledgeV1(snapshot, {
        fact_key: 'support_hours',
      })
    const product =
      resolveProductClaimKnowledgeV1(
        snapshot,
        {
          product_id: ids.product_id,
          claim: 'contract_conditions',
        },
      )
    const objection =
      resolveObjectionGuideKnowledgeV1(
        snapshot,
        {
          objection_key: 'price_value',
        },
      )

    for (const resolution of [
      fact,
      product,
      objection,
    ]) {
      assert.ok(
        Array.isArray(
          resolution.provenance,
        ),
      )
      assert.ok(
        resolution.provenance.length >
          0,
      )
    }
  },
)

// ----------------------------------------------------------------------------
// 15. multi-company leakage
// ----------------------------------------------------------------------------

test(
  '15. resolução nunca vaza dados entre snapshots de empresas diferentes',
  () => {
    const snapshotA = baseSnapshot()

    const snapshotB =
      structuredClone(snapshotA)

    snapshotB.identity.company_id =
      'ffffffff-0000-4000-8000-000000000099'
    snapshotB.company.facts[0].fact_value =
      'Atendimento 24 horas (empresa B).'
    snapshotB.company.products[0]
      .product_id = 'product-empresa-b'

    const resultA1 =
      resolveFactKnowledgeV1(
        snapshotA,
        {
          fact_key: 'support_hours',
        },
      )

    const resultB =
      resolveFactKnowledgeV1(
        snapshotB,
        {
          fact_key: 'support_hours',
        },
      )

    const resultA2 =
      resolveFactKnowledgeV1(
        snapshotA,
        {
          fact_key: 'support_hours',
        },
      )

    assert.equal(
      resultA1.value.fact_value,
      'Atendimento em horário comercial.',
    )
    assert.equal(
      resultB.value.fact_value,
      'Atendimento 24 horas (empresa B).',
    )
    assert.deepEqual(
      resultA1,
      resultA2,
    )

    const crossLookup =
      resolveProductClaimKnowledgeV1(
        snapshotA,
        {
          product_id:
            'product-empresa-b',
          claim: 'pricing',
        },
      )

    assert.equal(
      crossLookup.status,
      'missing',
    )
  },
)

// ----------------------------------------------------------------------------
// 16. determinismo
// ----------------------------------------------------------------------------

test(
  '16. resolução é determinística para a mesma pergunta e o mesmo snapshot',
  () => {
    const request =
      buildMessageIntelligenceRequestFixture()

    const sources =
      buildMessageIntelligenceSourcesFixture()

    sources.real_context.commercial_config.facts.push(
      buildConflictingFactFixture(),
    )

    const snapshot =
      assembleMessageContextSnapshotV1({
        request,
        sources,
      })

    const first =
      resolveFactKnowledgeV1(snapshot, {
        fact_key: 'support_hours',
      })
    const second =
      resolveFactKnowledgeV1(snapshot, {
        fact_key: 'support_hours',
      })

    assert.deepEqual(
      first,
      second,
    )

    const resolver =
      createKnowledgeResolverV1(
        snapshot,
      )

    assert.deepEqual(
      resolver.resolve_fact({
        fact_key: 'support_hours',
      }),
      first,
    )
  },
)

// ----------------------------------------------------------------------------
// 17 / 18 / 19. Sem mensagem ao cliente, sem técnica, sem decisão de
// governança.
// ----------------------------------------------------------------------------

const FORBIDDEN_EXPORT_NAME_PATTERN =
  /message_to_customer|customer_message|reply_text|draft_message|final_message|choose_technique|select_technique|governance_decision|authorize_seller|approve_seller|method_alignment|situation_classifier/i

test(
  '17 / 18 / 19. módulo não expõe composição de mensagem, escolha de técnica ou decisão de governança',
  () => {
    const exportedNames =
      Object.keys(KnowledgeResolver)

    for (const name of exportedNames) {
      assert.equal(
        FORBIDDEN_EXPORT_NAME_PATTERN.test(
          name,
        ),
        false,
        `export "${name}" parece pertencer a uma responsabilidade fora da Frente 2.`,
      )
    }

    const snapshot = baseSnapshot()

    const factResolution =
      resolveFactKnowledgeV1(snapshot, {
        fact_key: 'support_hours',
      })

    // Toda resolução é limitada às chaves do contrato — nunca carrega
    // um texto de mensagem, uma técnica escolhida ou uma decisão de
    // governança embutida.
    assert.deepEqual(
      Object.keys(
        factResolution,
      ).sort(),
      [
        'candidates',
        'contract_version',
        'domain',
        'gap',
        'provenance',
        'status',
        'subject',
        'value',
      ],
    )

    const quoteSnapshot =
      structuredClone(snapshot)

    quoteSnapshot.company.products[0]
      .definition.pricing.model =
      'quote_required'

    const pricingResolution =
      resolveProductClaimKnowledgeV1(
        quoteSnapshot,
        {
          product_id: ids.product_id,
          claim: 'pricing',
        },
      )

    assert.equal(
      pricingResolution.status,
      'approval_required',
    )
    assert.equal(
      'approved' in pricingResolution,
      false,
    )
    assert.equal(
      'decision' in pricingResolution,
      false,
    )
  },
)

// ----------------------------------------------------------------------------
// Contratos auxiliares — invariantes de KnowledgeResolutionV1 e
// KnowledgeGapV1.
// ----------------------------------------------------------------------------

test(
  'createKnowledgeResolutionV1 rejeita status "resolved" sem value e "conflicting" sem 2+ candidatos',
  () => {
    assert.throws(() =>
      createKnowledgeResolutionV1({
        domain: 'commercial_fact',
        subject: {},
        status: 'resolved',
      }),
    )

    assert.throws(() =>
      createKnowledgeResolutionV1({
        domain: 'commercial_fact',
        subject: {},
        status: 'conflicting',
        candidates: [
          {
            value: 'a',
            provenance: [],
          },
        ],
        gap: createKnowledgeGapV1({
          domain: 'commercial_fact',
          reason: 'conflicting_sources',
          sought: 'x',
          explanation: 'y',
        }),
      }),
    )

    assert.throws(() =>
      createKnowledgeResolutionV1({
        domain: 'commercial_fact',
        subject: {},
        status: 'missing',
        value: 'não deveria existir',
      }),
    )
  },
)
