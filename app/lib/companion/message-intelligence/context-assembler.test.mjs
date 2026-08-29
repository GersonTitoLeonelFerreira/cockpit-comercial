import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MessageContextAssemblerError,
  assembleMessageContextSnapshotV1,
  createMessageContextAssemblerV1,
} from './context-assembler.ts'

import {
  buildCommercialConfigFixture,
  buildConflictingFactFixture,
  buildMessageIntelligenceRequestFixture,
  buildMessageIntelligenceSourcesFixture,
  MESSAGE_INTELLIGENCE_FIXTURE_IDS,
} from './fixtures.ts'

import {
  createMessageIntelligenceRuntimeSourceAdapterV1,
} from './runtime-source-adapter.ts'

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

test(
  '17. current interaction usa somente o segmento após gap, preserva ordem e provenance',
  () => {
    const sources =
      buildMessageIntelligenceSourcesFixture()

    const conversation =
      sources.real_context
        .diagnostic_input
        .conversation

    conversation.messages = [
      {
        id: '10',
        message_key: 'old',
        version: 1,
        sequence: 1,
        direction: 'incoming',
        occurred_at:
          '2026-08-29T07:00:00.000Z',
        observed_at:
          '2026-08-29T07:00:01.000Z',
        content_type: 'text',
        text_content:
          'Mensagem de uma interação anterior.',
        audio_transcription: null,
      },
      {
        id: '12',
        message_key: 'current-2',
        version: 1,
        sequence: 4,
        direction: 'outgoing',
        occurred_at:
          '2026-08-29T12:02:00.000Z',
        observed_at:
          '2026-08-29T12:02:01.000Z',
        content_type: 'text',
        text_content:
          'Vou conferir isso com você.',
        audio_transcription: null,
      },
      {
        id: '11',
        message_key: 'current-1',
        version: 1,
        sequence: 2,
        direction: 'incoming',
        occurred_at:
          '2026-08-29T12:00:00.000Z',
        observed_at:
          '2026-08-29T12:00:01.000Z',
        content_type: 'text',
        text_content:
          'Tenho uma dúvida sobre a condição.',
        audio_transcription: null,
      },
      {
        id: '13',
        message_key: 'current-3',
        version: 1,
        sequence: 3,
        direction: 'incoming',
        occurred_at:
          '2026-08-29T12:03:00.000Z',
        observed_at:
          '2026-08-29T12:03:01.000Z',
        content_type: 'audio',
        text_content: null,
        audio_transcription: null,
      },
    ]

    conversation.active_message_ids = [
      '10',
      '11',
      '12',
      '13',
    ]
    conversation.excluded_message_ids = [
      '14',
    ]
    conversation.excluded_messages = [
      {
        id: '14',
        message_key: 'deleted-current',
        version: 2,
        reason: 'deleted',
        deletion_reason:
          'explicit_deletion',
      },
    ]

    sources.real_context
      .known_message_ids = [
      '10',
      '11',
      '12',
      '13',
      '14',
    ]

    sources.real_context
      .active_message_ids = [
      '10',
      '11',
      '12',
      '13',
    ]

    const current =
      assemble(
        buildMessageIntelligenceRequestFixture(),
        sources,
      ).conversation
        .current_interaction

    assert.ok(current)

    assert.deepEqual(
      current.messages.map(
        message =>
          message.message_id,
      ),
      [
        '11',
        '12',
        '13',
      ],
      'a mensagem anterior ao gap de 4h não pode entrar e a ordem temporal precisa ser preservada',
    )

    assert.equal(
      current.messages.some(
        message =>
          message.message_id === '14',
      ),
      false,
      'mensagem deletada não pode entrar na interação atual',
    )

    for (
      const message of
      current.messages
    ) {
      assert.equal(
        message.provenance[0]
          .source_type,
        'conversation_message',
      )
      assert.equal(
        message.provenance[0]
          .source_id,
        message.message_id,
      )
    }
  },
)

test(
  '18. current interaction respeita limite máximo de 40 mensagens',
  () => {
    const sources =
      buildMessageIntelligenceSourcesFixture()

    const baseTime =
      Date.parse(
        '2026-08-29T12:00:00.000Z',
      )

    const messages =
      Array.from(
        {
          length: 45,
        },
        (
          _,
          index,
        ) => ({
          id:
            String(
              100 + index,
            ),
          message_key:
            'limit-' +
            String(index),
          version: 1,
          sequence:
            index + 1,
          direction:
            index % 2 === 0
              ? 'incoming'
              : 'outgoing',
          occurred_at:
            new Date(
              baseTime +
                index * 60_000,
            ).toISOString(),
          observed_at:
            new Date(
              baseTime +
                index * 60_000 +
                1000,
            ).toISOString(),
          content_type: 'text',
          text_content:
            'Mensagem ' +
            String(index),
          audio_transcription:
            null,
        }),
      )

    sources.real_context
      .diagnostic_input
      .conversation.messages =
      messages

    sources.real_context
      .diagnostic_input
      .conversation
      .active_message_ids =
      messages.map(
        message =>
          message.id,
      )

    sources.real_context
      .diagnostic_input
      .conversation
      .excluded_message_ids =
      []

    sources.real_context
      .diagnostic_input
      .conversation
      .excluded_messages =
      []

    const current =
      assemble(
        buildMessageIntelligenceRequestFixture(),
        sources,
      ).conversation
        .current_interaction

    assert.ok(current)
    assert.equal(
      current.messages.length,
      40,
    )
    assert.equal(
      current.messages[0]
        .message_id,
      '105',
    )
    assert.equal(
      current.messages.at(-1)
        .message_id,
      '144',
    )
  },
)

test(
  '19. factory usa loader boundary device-free e monta snapshot a partir do adapter runtime',
  async () => {
    const request =
      buildMessageIntelligenceRequestFixture()

    const sourceFixture =
      buildMessageIntelligenceSourcesFixture()

    const calls = []

    const assertDeviceFree = (
      stage,
      receivedRequest,
    ) => {
      calls.push(stage)

      assert.equal(
        Object.prototype
          .hasOwnProperty.call(
            receivedRequest,
            'device_key',
          ),
        false,
      )
    }

    const loadSources =
      createMessageIntelligenceRuntimeSourceAdapterV1({
        load_scope:
          async receivedRequest => {
            assertDeviceFree(
              'scope',
              receivedRequest,
            )

            return sourceFixture
              .real_context.scope
          },

        load_commercial_context:
          async ({
            request:
              receivedRequest,
          }) => {
            assertDeviceFree(
              'commercial_context',
              receivedRequest,
            )

            return {
              commercial_config_status:
                sourceFixture
                  .real_context
                  .commercial_config_status,
              commercial_config:
                sourceFixture
                  .real_context
                  .commercial_config,
              products:
                sourceFixture
                  .real_context
                  .products,
            }
          },

        load_conversation_context:
          async ({
            request:
              receivedRequest,
          }) => {
            assertDeviceFree(
              'conversation_context',
              receivedRequest,
            )

            return {
              diagnostic_input:
                sourceFixture
                  .real_context
                  .diagnostic_input,
              known_message_ids:
                sourceFixture
                  .real_context
                  .known_message_ids,
              active_message_ids:
                sourceFixture
                  .real_context
                  .active_message_ids,
            }
          },

        load_state_read:
          async ({
            request:
              receivedRequest,
          }) => {
            assertDeviceFree(
              'state_read',
              receivedRequest,
            )

            return sourceFixture
              .real_context
              .state_read
          },

        load_durable_memory:
          async ({
            request:
              receivedRequest,
          }) => {
            assertDeviceFree(
              'durable_memory',
              receivedRequest,
            )

            return sourceFixture
              .real_context
              .durable_memory_seed
          },

        load_commercial_reading:
          async ({
            request:
              receivedRequest,
          }) => {
            assertDeviceFree(
              'commercial_reading',
              receivedRequest,
            )

            return sourceFixture
              .commercial_reading
          },
      })

    const assembler =
      createMessageContextAssemblerV1({
        load_sources:
          loadSources,
      })

    const snapshot =
      await assembler(
        request,
      )

    assert.deepEqual(
      calls,
      [
        'scope',
        'commercial_context',
        'conversation_context',
        'state_read',
        'durable_memory',
        'commercial_reading',
      ],
    )

    assert.equal(
      snapshot.identity.company_id,
      request.company_id,
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
