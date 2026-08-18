import assert from 'node:assert/strict'
import test from 'node:test'

import {
  StatefulCopilotRealContextLoaderError,
  createStatefulCopilotRealContextLoader,
} from './stateful-copilot-real-context-loader.ts'

import {
  StatefulCopilotRealContextServerConfigurationError,
  createStatefulCopilotServerRealContextLoader,
} from '../server/stateful-copilot-real-context-loader.ts'

const companyId =
  '10000000-0000-4000-8000-000000000001'

const leadId =
  '20000000-0000-4000-8000-000000000001'

const cycleId =
  '30000000-0000-4000-8000-000000000001'

const ownerId =
  '40000000-0000-4000-8000-000000000001'

const deviceKey =
  '50000000-0000-4000-8000-000000000001'

const configVersionId =
  '60000000-0000-4000-8000-000000000001'

const productId =
  '70000000-0000-4000-8000-000000000001'

const conversationKey =
  'whatsapp:+5547999990001'

const referenceTime =
  '2026-08-07T01:00:00.000Z'


function buildCommercialProductV2() {
  return {
    contract_version:
      'commercial-product-v2',

    product_kind:
      'simple',

    name:
      'Plano Exemplo',

    category:
      'Serviço',

    commercial_description:
      'Serviço recorrente com acompanhamento comercial estruturado.',

    indicated_audiences: [
      'Cliente exemplo',
    ],

    needs_addressed: [
      'Acompanhamento',
    ],

    benefits: [
      'Processo estruturado',
    ],

    verified_differentiators: [
      'Atendimento consultivo',
    ],

    limitations: [
      'Depende de disponibilidade',
    ],

    recommend_when: [
      'O cliente precisa do acompanhamento oferecido.',
    ],

    avoid_when: [
      'A necessidade depende de algo que o serviço não cobre.',
    ],

    pricing: {
      model:
        'recurring',

      amount:
        199.9,

      currency:
        'BRL',

      amount_qualifier:
        'exact',

      recurrence:
        'monthly',

      installment_count:
        null,

      installment_amount_basis:
        null,

      note:
        null,
    },

    contract_conditions: [
      'Contrato mensal',
    ],

    payment_conditions: [
      'Pagamento recorrente',
    ],

    allowed_claims: [
      'Suporte incluído',
    ],

    forbidden_claims: [
      'Resultado garantido',
    ],
  }
}

function createMockClient(
  fixtures,
) {
  const calls = []

  class Query {
    constructor(
      table,
    ) {
      this.table =
        table

      this.selectedColumns =
        null

      this.filters =
        []

      this.orders =
        []

      this.maximum =
        null

      this.rangeFrom =
        null

      this.rangeTo =
        null
    }

    select(
      columns,
    ) {
      this.selectedColumns =
        columns

      return this
    }

    eq(
      column,
      value,
    ) {
      this.filters.push({
        column,
        value,
      })

      return this
    }

    order(
      column,
      options = {},
    ) {
      this.orders.push({
        column,
        ascending:
          options.ascending !== false,
      })

      return this
    }

    limit(
      count,
    ) {
      this.maximum =
        count

      return this
    }

    range(
      from,
      to,
    ) {
      this.rangeFrom =
        from

      this.rangeTo =
        to

      return this
    }

    resolveRows() {
      const fixture =
        fixtures[
          this.table
        ]

      calls.push({
        table:
          this.table,

        selected_columns:
          this.selectedColumns,

        filters:
          this.filters.map(
            item => ({
              ...item,
            }),
          ),

        orders:
          this.orders.map(
            item => ({
              ...item,
            }),
          ),

        maximum:
          this.maximum,

        range:
          this.rangeFrom === null
            ? null
            : [
                this.rangeFrom,
                this.rangeTo,
              ],
      })

      if (
        fixture &&
        !Array.isArray(fixture) &&
        fixture.error
      ) {
        return {
          data:
            null,

          error:
            fixture.error,
        }
      }

      let rows =
        Array.isArray(fixture)
          ? fixture.map(
              row => ({
                ...row,
              }),
            )
          : []

      for (
        const filter of
        this.filters
      ) {
        rows =
          rows.filter(
            row =>
              row[
                filter.column
              ] ===
              filter.value,
          )
      }

      for (
        const order of
        [...this.orders]
          .reverse()
      ) {
        rows.sort(
          (
            left,
            right,
          ) => {
            const a =
              left[
                order.column
              ]

            const b =
              right[
                order.column
              ]

            if (a === b) {
              return 0
            }

            const comparison =
              a < b
                ? -1
                : 1

            return order.ascending
              ? comparison
              : -comparison
          },
        )
      }

      if (
        this.rangeFrom !== null &&
        this.rangeTo !== null
      ) {
        rows =
          rows.slice(
            this.rangeFrom,
            this.rangeTo + 1,
          )
      }

      if (
        this.maximum !== null
      ) {
        rows =
          rows.slice(
            0,
            this.maximum,
          )
      }

      return {
        data:
          rows,

        error:
          null,
      }
    }

    maybeSingle() {
      const result =
        this.resolveRows()

      if (result.error) {
        return Promise.resolve(
          result,
        )
      }

      if (
        result.data.length >
        1
      ) {
        return Promise.resolve({
          data:
            null,

          error: {
            code:
              'MOCK_MULTIPLE_ROWS',
          },
        })
      }

      return Promise.resolve({
        data:
          result.data[0] ??
          null,

        error:
          null,
      })
    }

    then(
      resolve,
      reject,
    ) {
      return Promise.resolve(
        this.resolveRows(),
      ).then(
        resolve,
        reject,
      )
    }
  }

  return {
    client: {
      from(
        table,
      ) {
        return new Query(
          table,
        )
      },
    },

    calls,
  }
}

function buildFixtures({
  includePublishedConfig = true,
  includeState = true,
  deletedLead = false,
} = {}) {
  const fixtures = {
    companies: [
      {
        id:
          companyId,

        name:
          'Empresa Exemplo',

        platform_status:
          'active',

        onboarding_status:
          'completed',
      },
    ],

    sales_cycles: [
      {
        id:
          cycleId,

        company_id:
          companyId,

        lead_id:
          leadId,

        owner_user_id:
          ownerId,

        status:
          'negociacao',

        next_action:
          'Enviar proposta',

        next_action_date:
          '2026-08-07T15:00:00.000Z',

        updated_at:
          '2026-08-07T00:50:00.000Z',
      },
    ],

    leads: [
      {
        id:
          leadId,

        company_id:
          companyId,

        name:
          'Cliente Exemplo',

        phone:
          '+5547999990001',

        email:
          'cliente@example.test',

        deleted_at:
          deletedLead
            ? '2026-08-07T00:55:00.000Z'
            : null,

        updated_at:
          '2026-08-07T00:50:00.000Z',
      },
    ],

    conversation_messages: [
      {
        id:
          '1',

        company_id:
          companyId,

        cycle_id:
          cycleId,

        conversation_key:
          conversationKey,

        message_key:
          'message-001',

        version:
          1,

        direction:
          'incoming',

        occurred_at:
          '2026-08-06T23:00:00.000Z',

        observed_at:
          '2026-08-06T23:00:01.000Z',

        content_type:
          'text',

        text_content:
          'Mensagem antiga.',

        audio_transcription:
          null,

        is_deleted:
          false,
      },
      {
        id:
          '2',

        company_id:
          companyId,

        cycle_id:
          cycleId,

        conversation_key:
          conversationKey,

        message_key:
          'message-001',

        version:
          2,

        direction:
          'incoming',

        occurred_at:
          '2026-08-06T23:00:00.000Z',

        observed_at:
          '2026-08-06T23:05:00.000Z',

        content_type:
          'text',

        text_content:
          'Mensagem editada e canônica.',

        audio_transcription:
          null,

        is_deleted:
          false,
      },
      {
        id:
          '3',

        company_id:
          companyId,

        cycle_id:
          cycleId,

        conversation_key:
          conversationKey,

        message_key:
          'message-002',

        version:
          1,

        direction:
          'outgoing',

        occurred_at:
          '2026-08-06T23:10:00.000Z',

        observed_at:
          '2026-08-06T23:11:00.000Z',

        content_type:
          'text',

        text_content:
          null,

        audio_transcription:
          null,

        is_deleted:
          true,
      },
    ],

    conversation_capture_state: [
      {
        company_id:
          companyId,

        conversation_key:
          conversationKey,

        device_key:
          deviceKey,

        last_observed_message_id:
          '3',

        last_observed_at:
          '2026-08-06T23:11:00.000Z',

        last_processed_message_id:
          '2',

        last_processed_at:
          '2026-08-06T23:06:00.000Z',

        state_version:
          4,

        created_at:
          '2026-08-06T22:00:00.000Z',

        updated_at:
          '2026-08-06T23:11:00.000Z',
      },
    ],

    company_commercial_config_versions:
      includePublishedConfig
        ? [
            {
              id:
                configVersionId,

              company_id:
                companyId,

              version_number:
                3,

              contract_version:
                'phase-2-v1',

              status:
                'published',

              business_description:
                'Empresa de serviços comerciais.',

              target_audience:
                'Clientes que buscam acompanhamento.',

              value_proposition:
                'Atendimento consultivo e estruturado.',

              commercial_method_name:
                'Método ATO',

              commercial_method_description:
                'Acolher, compreender no Tour e Obter o desfecho adequado.',

              commercial_method_contract_version:
                'commercial-method-v2',

              commercial_method_definition: {
                contract_version:
                  'commercial-method-v2',

                name:
                  'Método ATO',

                description:
                  'Acolher, compreender no Tour e Obter o desfecho adequado.',

                principles: [
                  'Esperar é uma decisão comercial válida.',
                ],

                stages: [
                  {
                    key:
                      'tour',

                    display_order:
                      1,

                    name:
                      'Tour',

                    objective:
                      'Compreender a necessidade relevante.',

                    requirement:
                      'required',

                    completion_criteria: [
                      'Necessidade compreendida.',
                    ],

                    partial_completion_criteria: [],

                    skip_conditions: [],

                    recommended_questions: [],

                    common_mistakes: [],

                    deepen_when: [],

                    sufficient_when: [
                      'Existe informação suficiente para orientar.',
                    ],

                    advance_when: [],

                    wait_when: [
                      'O cliente informou que retornará.',
                    ],

                    stop_asking_when: [
                      'Novas perguntas não alterariam a decisão.',
                    ],

                    dimensions: [
                      {
                        key:
                          'necessidade',

                        name:
                          'Necessidade',

                        objective:
                          'Compreender o resultado buscado.',

                        evidence_criteria: [
                          'Necessidade relevante identificada.',
                        ],
                      },
                    ],
                  },
                ],
              },

              communication_tone:
                'Direto e respeitoso.',

              required_behaviors: [
                'Confirmar a necessidade.',
              ],

              prohibited_behaviors: [
                'Inventar condições.',
              ],

              created_by:
                ownerId,

              published_by:
                ownerId,

              archived_by:
                null,

              created_at:
                '2026-08-01T10:00:00.000Z',

              updated_at:
                '2026-08-02T10:00:00.000Z',

              published_at:
                '2026-08-02T10:00:00.000Z',

              archived_at:
                null,
            },
          ]
        : [],

    company_commercial_method_steps:
      includePublishedConfig
        ? [
            {
              id:
                '61000000-0000-4000-8000-000000000001',

              company_id:
                companyId,

              config_version_id:
                configVersionId,

              step_order:
                1,

              name:
                'Descoberta',

              objective:
                'Compreender a necessidade.',

              completion_criteria: [
                'Necessidade confirmada.',
              ],

              recommended_questions: [
                'Qual é sua prioridade?',
              ],

              is_required:
                true,

              created_at:
                '2026-08-01T10:00:00.000Z',

              updated_at:
                '2026-08-01T10:00:00.000Z',
            },
          ]
        : [],

    company_commercial_product_profiles:
      includePublishedConfig
        ? [
            {
              id:
                '62000000-0000-4000-8000-000000000001',

              company_id:
                companyId,

              config_version_id:
                configVersionId,

              product_id:
                productId,

              commercial_product_contract_version:
                'commercial-product-v2',

              commercial_product_definition:
                buildCommercialProductV2(),

              indicated_audiences: [
                'Cliente exemplo',
              ],

              needs_addressed: [
                'Acompanhamento',
              ],

              benefits: [
                'Processo estruturado',
              ],

              verified_differentiators: [
                'Atendimento consultivo',
              ],

              limitations: [
                'Depende de disponibilidade',
              ],

              contract_conditions: [
                'Contrato mensal',
              ],

              payment_conditions: [
                'Pagamento recorrente',
              ],

              allowed_claims: [
                'Suporte incluído',
              ],

              forbidden_claims: [
                'Resultado garantido',
              ],

              created_at:
                '2026-08-01T10:00:00.000Z',

              updated_at:
                '2026-08-01T10:00:00.000Z',
            },
          ]
        : [],

    company_commercial_facts:
      includePublishedConfig
        ? [
            {
              id:
                '63000000-0000-4000-8000-000000000001',

              company_id:
                companyId,

              config_version_id:
                configVersionId,

              category:
                'operação',

              fact_key:
                'horario',

              fact_value:
                'Atendimento em horário comercial.',

              source_note:
                'Configuração oficial.',

              is_active:
                true,

              created_at:
                '2026-08-01T10:00:00.000Z',

              updated_at:
                '2026-08-01T10:00:00.000Z',
            },
          ]
        : [],

    company_commercial_objection_guides:
      includePublishedConfig
        ? [
            {
              id:
                '64000000-0000-4000-8000-000000000001',

              company_id:
                companyId,

              config_version_id:
                configVersionId,

              sort_order:
                1,

              objection:
                'Preciso pensar.',

              signals: [
                'Pedido de prazo.',
              ],

              discovery_questions: [
                'O que precisa avaliar?',
              ],

              recommended_approach:
                'Descobrir o ponto pendente.',

              response_limits: [
                'Não pressionar.',
              ],

              is_active:
                true,

              created_at:
                '2026-08-01T10:00:00.000Z',

              updated_at:
                '2026-08-01T10:00:00.000Z',
            },
          ]
        : [],

    products: [
      {
        id:
          productId,

        company_id:
          companyId,

        name:
          'Plano Exemplo',

        category:
          'Serviço',

        base_price:
          '199.90',

        active:
          true,
      },
    ],

    companion_commercial_states:
      includeState
        ? [
            {
              id:
                '80000000-0000-4000-8000-000000000001',

              company_id:
                companyId,

              cycle_id:
                cycleId,

              conversation_key:
                conversationKey,

              state_version:
                1,

              state_contract_version:
                'phase-5.1-commercial-state-v1',

              state_updated_at:
                '2026-08-06T23:06:00.000Z',

              persisted_at:
                '2026-08-06T23:06:01.000Z',

              state_snapshot: {
                contract_version:
                  'phase-5.1-commercial-state-v1',

                cycle_id:
                  cycleId,

                version:
                  1,

                commercial_role:
                  'buyer',

                current_moment: {
                  summary:
                    'O cliente está avaliando a proposta.',

                  evidence_message_ids: [
                    '2',
                  ],
                },

                current_priority: {
                  summary:
                    'Responder a necessidade apresentada.',

                  evidence_message_ids: [
                    '2',
                  ],
                },

                last_analyzed_message_ids: [
                  '2',
                ],

                last_evidence_message_ids: [
                  '2',
                ],

                facts: [],
                needs: [],
                open_loops: [],
                objections: [],
                commitments: [],
                signals: [],
                uncertainties: [],

                created_at:
                  '2026-08-06T23:06:00.000Z',

                updated_at:
                  '2026-08-06T23:06:00.000Z',
              },
            },
          ]
        : [],
  }

  return fixtures
}

function buildLoadArgs() {
  return {
    company_id:
      companyId,

    cycle_id:
      cycleId,

    conversation_key:
      conversationKey,

    device_key:
      deviceKey,

    reference_time:
      referenceTime,
  }
}

test(
  'carrega contexto real, colapsa versões e preserva todos os IDs conhecidos',
  async () => {
    const {
      client,
      calls,
    } =
      createMockClient(
        buildFixtures(),
      )

    const loader =
      createStatefulCopilotRealContextLoader(
        client,
      )

    const result =
      await loader(
        buildLoadArgs(),
      )

    assert.equal(
      result.scope.company.id,
      companyId,
    )

    assert.equal(
      result.scope.lead.id,
      leadId,
    )

    assert.equal(
      result.scope.cycle.id,
      cycleId,
    )

    assert.equal(
      result.cursor.found,
      true,
    )

    assert.equal(
      result.cursor.last_processed_message_id,
      '2',
    )

    assert.deepEqual(
      result.known_message_ids,
      [
        '1',
        '2',
        '3',
      ],
    )

    assert.deepEqual(
      result.active_message_ids,
      [
        '2',
      ],
    )

    assert.deepEqual(
      result
        .diagnostic_input
        .conversation
        .excluded_message_ids,
      [
        '3',
      ],
    )

    assert.equal(
      result
        .diagnostic_input
        .conversation
        .messages[0]
        .text_content,
      'Mensagem editada e canônica.',
    )

    assert.equal(
      result.commercial_config_status,
      'published',
    )

    assert.equal(
      result
        .diagnostic_input
        .commercial_context
        .configured,
      true,
    )

    assert.equal(
      result
        .diagnostic_input
        .commercial_context
        .sales_method
        .contract_version,
      'commercial-method-v2',
    )

    assert.equal(
      result
        .diagnostic_input
        .commercial_context
        .sales_method
        .steps[0]
        .name,
      'Tour',
    )

    assert.equal(
      result
        .diagnostic_input
        .commercial_context
        .sales_method
        .definition
        .stages[0]
        .wait_when[0],
      'O cliente informou que retornará.',
    )

    const loadedProduct =
      result
        .diagnostic_input
        .commercial_context
        .products[0]

    assert.equal(
      loadedProduct
        .contract_version,
      'commercial-product-v2',
    )

    assert.equal(
      loadedProduct
        .definition
        .pricing
        .model,
      'recurring',
    )

    assert.equal(
      loadedProduct
        .definition
        .pricing
        .recurrence,
      'monthly',
    )

    assert.equal(
      loadedProduct
        .base_price,
      null,
    )

    const productProfileCall =
      calls.find(
        call =>
          call.table ===
          'company_commercial_product_profiles',
      )

    assert.ok(
      productProfileCall,
    )

    assert.ok(
      productProfileCall
        .selected_columns
        .includes(
          'commercial_product_contract_version',
        ),
    )

    assert.ok(
      productProfileCall
        .selected_columns
        .includes(
          'commercial_product_definition',
        ),
    )

    assert.equal(
      result
        .diagnostic_input
        .commercial_context
        .facts[0]
        .fact_key,
      'horario',
    )

    assert.equal(
      result.state_read.mode,
      'found',
    )

    assert.equal(
      result.state_read.state_version,
      1,
    )

    assert.ok(
      calls.some(
        call =>
          call.table ===
          'companion_commercial_states',
      ),
    )
  },
)

test(
  'carrega contexto limitado quando a empresa ainda não possui configuração publicada',
  async () => {
    const {
      client,
    } =
      createMockClient(
        buildFixtures({
          includePublishedConfig:
            false,

          includeState:
            false,
        }),
      )

    const result =
      await createStatefulCopilotRealContextLoader(
        client,
      )(
        buildLoadArgs(),
      )

    assert.equal(
      result.commercial_config_status,
      'missing',
    )

    assert.equal(
      result.commercial_config,
      null,
    )

    assert.equal(
      result
        .diagnostic_input
        .commercial_context
        .configured,
      false,
    )

    assert.equal(
      result
        .diagnostic_input
        .analysis_precondition
        .status,
      'limited',
    )

    assert.equal(
      result.state_read.mode,
      'missing',
    )
  },
)

test(
  'bloqueia contexto quando o lead vinculado foi excluído',
  async () => {
    const {
      client,
    } =
      createMockClient(
        buildFixtures({
          deletedLead:
            true,
        }),
      )

    await assert.rejects(
      createStatefulCopilotRealContextLoader(
        client,
      )(
        buildLoadArgs(),
      ),
      error => {
        assert.ok(
          error instanceof
            StatefulCopilotRealContextLoaderError,
        )

        assert.equal(
          error.code,
          'STATEFUL_LEAD_NOT_AVAILABLE',
        )

        assert.equal(
          error.status_code,
          409,
        )

        assert.equal(
          error.retryable,
          false,
        )

        return true
      },
    )
  },
)

test(
  'classifica falha de leitura sem expor a mensagem interna do banco',
  async () => {
    const fixtures =
      buildFixtures()

    fixtures.products = {
      error: {
        message:
          'segredo interno do banco',
      },
    }

    const {
      client,
    } =
      createMockClient(
        fixtures,
      )

    await assert.rejects(
      createStatefulCopilotRealContextLoader(
        client,
      )(
        buildLoadArgs(),
      ),
      error => {
        assert.ok(
          error instanceof
            StatefulCopilotRealContextLoaderError,
        )

        assert.equal(
          error.code,
          'REAL_CONTEXT_READ_UNAVAILABLE',
        )

        assert.equal(
          error.status_code,
          503,
        )

        assert.equal(
          error.retryable,
          true,
        )

        assert.equal(
          error.message.includes(
            'segredo interno',
          ),
          false,
        )

        return true
      },
    )
  },
)

test(
  'criação server-only usa service role sem sessão e não consulta o banco',
  () => {
    const {
      client,
      calls,
    } =
      createMockClient(
        buildFixtures(),
      )

    const factoryCalls = []

    const loader =
      createStatefulCopilotServerRealContextLoader({
        supabase_url:
          'https://example.supabase.co',

        supabase_service_role_key:
          'service-role-test',

        create_supabase_client(
          url,
          key,
          options,
        ) {
          factoryCalls.push({
            url,
            key,
            options,
          })

          return client
        },
      })

    assert.equal(
      typeof loader,
      'function',
    )

    assert.equal(
      factoryCalls.length,
      1,
    )

    assert.equal(
      factoryCalls[0].url,
      'https://example.supabase.co/',
    )

    assert.equal(
      factoryCalls[0].key,
      'service-role-test',
    )

    assert.deepEqual(
      factoryCalls[0].options,
      {
        auth: {
          persistSession:
            false,

          autoRefreshToken:
            false,

          detectSessionInUrl:
            false,
        },
      },
    )

    assert.deepEqual(
      calls,
      [],
    )
  },
)

test(
  'configuração server-only ausente falha antes de criar o cliente',
  () => {
    let factoryExecutions =
      0

    assert.throws(
      () =>
        createStatefulCopilotServerRealContextLoader({
          supabase_url:
            'https://example.supabase.co',

          supabase_service_role_key:
            '',

          create_supabase_client() {
            factoryExecutions +=
              1

            throw new Error(
              'não deveria executar',
            )
          },
        }),
      error => {
        assert.ok(
          error instanceof
            StatefulCopilotRealContextServerConfigurationError,
        )

        assert.equal(
          error.code,
          'MISSING_STATEFUL_CONTEXT_CONFIGURATION',
        )

        assert.equal(
          error.configuration_key,
          'SUPABASE_SERVICE_ROLE_KEY',
        )

        return true
      },
    )

    assert.equal(
      factoryExecutions,
      0,
    )
  },
)
