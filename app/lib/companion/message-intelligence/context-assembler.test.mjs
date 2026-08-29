import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MessageContextAssemblerError,
  assembleMessageContextSnapshotV1,
} from './context-assembler.ts'

import {
  buildCommercialConfigFixture,
  buildConflictingFactFixture,
  buildMessageIntelligenceRequestFixture,
  buildMessageIntelligenceSourcesFixture,
  MESSAGE_INTELLIGENCE_FIXTURE_IDS,
} from './fixtures.ts'

function assemble(
  request =
    buildMessageIntelligenceRequestFixture(),
  sources =
    buildMessageIntelligenceSourcesFixture(),
) {
  return assembleMessageContextSnapshotV1({
    request,
    sources,
  })
}

test(
  '1. snapshot usa somente a empresa correta',
  () => {
    const snapshot = assemble()

    assert.equal(
      snapshot.identity.company_id,
      MESSAGE_INTELLIGENCE_FIXTURE_IDS.company_id,
    )

    for (
      const fact of
      snapshot.company.facts
    ) {
      assert.equal(
        fact.provenance[0].source_type,
        'commercial_fact',
      )
    }
  },
)

test(
  '2. método draft não entra no snapshot operacional',
  () => {
    const sources =
      buildMessageIntelligenceSourcesFixture()

    sources.real_context
      .commercial_config.version.status =
      'draft'

    const snapshot = assemble(
      buildMessageIntelligenceRequestFixture(),
      sources,
    )

    assert.equal(
      snapshot.company.published_method,
      null,
    )
    assert.equal(
      snapshot.company.commercial_config,
      null,
    )
  },
)

test(
  '3. método publicado e válido entra',
  () => {
    const snapshot = assemble()

    assert.equal(
      snapshot.company
        .published_method
        ?.definition
        .contract_version,
      'commercial-method-v2',
    )
  },
)

test(
  '4. método mantém versão canônica',
  () => {
    const method =
      assemble().company
        .published_method

    assert.ok(method)
    assert.equal(
      method.config_version_number,
      7,
    )
    assert.equal(
      method.provenance[0]
        .source_version,
      'commercial-method-v2',
    )
  },
)

test(
  '5. fato mantém provenance e verificação oficial',
  () => {
    const fact =
      assemble().company.facts[0]

    assert.equal(
      fact.fact_id,
      MESSAGE_INTELLIGENCE_FIXTURE_IDS.fact_id,
    )
    assert.equal(
      fact.provenance[0].source_id,
      MESSAGE_INTELLIGENCE_FIXTURE_IDS.fact_id,
    )
    assert.equal(
      fact.provenance[0].observed_at,
      fact.definition.source.verified_at,
    )
  },
)

test(
  '6. produto mantém profile e catálogo na provenance',
  () => {
    const product =
      assemble().company.products[0]

    assert.equal(
      product.profile_id,
      MESSAGE_INTELLIGENCE_FIXTURE_IDS.product_profile_id,
    )
    assert.equal(
      product.product_id,
      MESSAGE_INTELLIGENCE_FIXTURE_IDS.product_id,
    )
    assert.deepEqual(
      product.provenance.map(
        trace => trace.source_type,
      ),
      [
        'commercial_product',
        'product_catalog',
      ],
    )
  },
)

test(
  '7. mensagem canônica mantém message_id',
  () => {
    const messages =
      assemble().conversation.messages

    assert.deepEqual(
      messages.map(
        message =>
          message.message_id,
      ),
      [
        '1',
        '2',
      ],
    )
    assert.equal(
      messages[1]
        .provenance[0]
        .source_id,
      '2',
    )
  },
)

test(
  '8. mensagem deletada não vira evidência ativa',
  () => {
    const conversation =
      assemble().conversation

    assert.equal(
      conversation.messages.some(
        message =>
          message.message_id === '3',
      ),
      false,
    )
    assert.equal(
      conversation
        .excluded_messages[0]
        .message_id,
      '3',
    )
    assert.equal(
      conversation
        .excluded_messages[0]
        .canonical_state,
      'deleted',
    )
  },
)

test(
  '9. memória herdada é distinguida da atual sem ID fictício',
  () => {
    const sources =
      buildMessageIntelligenceSourcesFixture()

    sources.real_context.state_read = {
      mode: 'missing',
      found: false,
      company_id:
        MESSAGE_INTELLIGENCE_FIXTURE_IDS.company_id,
      cycle_id:
        MESSAGE_INTELLIGENCE_FIXTURE_IDS.cycle_id,
      conversation_key:
        sources.real_context.scope
          .conversation_key,
      state_record_id: null,
      state_version: null,
      state_updated_at: null,
      persisted_at: null,
      state: null,
    }

    sources.real_context
      .durable_memory_seed = {
      source_cycle_id:
        MESSAGE_INTELLIGENCE_FIXTURE_IDS.previous_cycle_id,
      facts: [
        {
          kind:
            'client.objective',
          value:
            null,
          summary:
            '[Herdado do ciclo anterior deste cliente] Crescer a previsibilidade comercial.',
          confidence:
            'medium',
        },
      ],
      objections: [],
    }

    const objective =
      assemble(
        buildMessageIntelligenceRequestFixture(),
        sources,
      ).customer.objectives[0]

    assert.equal(
      objective.memory_id,
      null,
    )
    assert.equal(
      objective.provenance[0]
        .inheritance,
      'inherited_from_previous_cycle',
    )
    assert.equal(
      objective.provenance[0]
        .source_cycle_id,
      MESSAGE_INTELLIGENCE_FIXTURE_IDS.previous_cycle_id,
    )
    assert.deepEqual(
      objective.evidence_message_ids,
      [],
    )
  },
)

test(
  '10. padrão de comunicação existente é reaproveitado',
  () => {
    const observation =
      assemble().customer
        .communication_observations[0]

    assert.equal(
      observation.kind,
      'client.communication.pattern',
    )
    assert.equal(
      observation.value,
      'direct_questions',
    )
    assert.deepEqual(
      observation.evidence_message_ids,
      [
        '1',
        '2',
      ],
    )
  },
)

test(
  '11. ausência permanece ausência',
  () => {
    const sources =
      buildMessageIntelligenceSourcesFixture()

    sources.real_context
      .commercial_config =
      null
    sources.real_context
      .commercial_config_status =
      'missing'
    sources.commercial_reading =
      null
    sources.real_context.state_read = {
      mode: 'missing',
      found: false,
      company_id:
        MESSAGE_INTELLIGENCE_FIXTURE_IDS.company_id,
      cycle_id:
        MESSAGE_INTELLIGENCE_FIXTURE_IDS.cycle_id,
      conversation_key:
        sources.real_context.scope
          .conversation_key,
      state_record_id: null,
      state_version: null,
      state_updated_at: null,
      persisted_at: null,
      state: null,
    }
    sources.real_context
      .durable_memory_seed =
      null

    const snapshot =
      assemble(
        buildMessageIntelligenceRequestFixture(),
        sources,
      )

    assert.equal(
      snapshot.company
        .published_method,
      null,
    )
    assert.equal(
      snapshot.company
        .commercial_config,
      null,
    )
    assert.equal(
      snapshot.commercial
        .commercial_role,
      null,
    )
    assert.deepEqual(
      snapshot.customer.objectives,
      [],
    )
  },
)

test(
  '12. conflito é preservado em vez de reconciliado',
  () => {
    const sources =
      buildMessageIntelligenceSourcesFixture()

    sources.real_context
      .commercial_config.facts.push(
        buildConflictingFactFixture(),
      )

    const facts =
      assemble(
        buildMessageIntelligenceRequestFixture(),
        sources,
      ).company.facts.filter(
        fact =>
          fact.fact_key ===
          'support_hours',
      )

    assert.equal(
      facts.length,
      2,
    )
    assert.deepEqual(
      facts
        .map(
          fact =>
            fact.fact_value,
        )
        .sort(),
      [
        'Atendimento 24 horas.',
        'Atendimento em horário comercial.',
      ].sort(),
    )
  },
)

test(
  '13. company_id divergente é rejeitada',
  () => {
    const sources =
      buildMessageIntelligenceSourcesFixture()

    sources.real_context
      .products[0].company_id =
      '10000000-0000-4000-8000-000000000099'

    assert.throws(
      () =>
        assemble(
          buildMessageIntelligenceRequestFixture(),
          sources,
        ),
      error => {
        assert.ok(
          error instanceof
            MessageContextAssemblerError,
        )
        assert.equal(
          error.code,
          'MESSAGE_CONTEXT_SCOPE_MISMATCH',
        )
        return true
      },
    )
  },
)

test(
  '14. mesmo input produz snapshot semanticamente determinístico',
  () => {
    const request =
      buildMessageIntelligenceRequestFixture()
    const sources =
      buildMessageIntelligenceSourcesFixture()

    assert.deepEqual(
      assemble(request, sources),
      assemble(request, sources),
    )
  },
)

test(
  '15. assembler não produz mensagem customer-facing',
  () => {
    const snapshot = assemble()

    assert.equal(
      Object.prototype
        .hasOwnProperty.call(
          snapshot,
          'message',
        ),
      false,
    )
    assert.equal(
      Object.prototype
        .hasOwnProperty.call(
          snapshot,
          'recommended_message',
        ),
      false,
    )
  },
)

test(
  '16. request público e snapshot não carregam device_key',
  () => {
    const request =
      buildMessageIntelligenceRequestFixture()
    const snapshot =
      assemble(request)

    assert.equal(
      Object.prototype
        .hasOwnProperty.call(
          request,
          'device_key',
        ),
      false,
    )
    assert.equal(
      JSON.stringify(
        snapshot,
      ).includes(
        'device_key',
      ),
      false,
    )
  },
)
