import assert from 'node:assert/strict'
import test from 'node:test'

import {
  StatefulCopilotRealContextLoaderError,
  createStatefulCopilotRealContextLoader,
  loadDurableMemorySeedForMissingState,
  loadStatefulCopilotCanonicalScope,
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

function buildCommercialFactV2() {
  return {
    contract_version:
      'commercial-fact-v2',

    fact_kind:
      'official',

    category:
      'operação',

    fact_key:
      'horario',

    fact_value:
      'Atendimento em horário comercial.',

    scope: {
      type:
        'company',

      product_id:
        null,

      variant_key:
        null,

      reference_key:
        null,
    },

    conditions: [],

    limitations: [],

    validity: {
      mode:
        'ongoing',

      valid_from:
        '2026-08-01T00:00:00.000Z',

      valid_until:
        null,
    },

    source: {
      type:
        'internal_policy',

      reference:
        'Configuração oficial.',

      verified_at:
        '2026-08-06T20:00:00.000Z',
    },
  }
}

function buildCommercialObjectionV2() {
  return {
    contract_version:
      'commercial-objection-v2',

    objection_kind:
      'commercial_objection',

    objection_key:
      'price_value',

    objection:
      'Preço percebido como alto',

    category:
      'price',

    description:
      'Resistência em que o preço dificulta materialmente a decisão comercial.',

    scope: {
      type:
        'company',

      product_id:
        null,

      variant_key:
        null,
    },

    signals: [
      'Está caro.',
      'Ficou acima do orçamento previsto.',
    ],

    objection_when: [
      'O cliente apresenta o preço como bloqueio real para avançar.',
    ],

    not_objection_when: [
      'O cliente apenas pergunta qual é o preço.',
    ],

    distinguish_from: [
      'question',
      'information_request',
      'condition',
      'postponement',
      'rejection',
      'uncertainty',
    ],

    discovery_questions: [
      'Quando você diz que ficou alto, o que está pesando mais nessa condição?',
    ],

    recommended_approach:
      'Compreender a natureza da resistência antes de responder.',

    response_limits: [
      'Não presumir falta de dinheiro.',
      'Não oferecer desconto sem política comercial aplicável.',
    ],

    resolution_criteria: [
      'Está claro se o preço continua sendo um bloqueio real.',
    ],

    wait_when: [
      'O cliente pediu tempo e assumiu compromisso de retorno.',
    ],

    give_space_when: [
      'Continuar insistindo aumentaria a resistência sem acrescentar informação útil.',
    ],

    stop_when: [
      'O cliente fez uma recusa explícita e não solicitou continuidade.',
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

      this.upperBounds =
        []

      this.strictUpperBounds =
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

    lte(
      column,
      value,
    ) {
      this.upperBounds.push({
        column,
        value,
      })

      return this
    }

    lt(
      column,
      value,
    ) {
      this.strictUpperBounds.push({
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

        strict_upper_bounds:
          this.strictUpperBounds.map(
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
        const upperBound of
        this.upperBounds
      ) {
        rows =
          rows.filter(
            row =>
              row[
                upperBound.column
              ] <=
              upperBound.value,
          )
      }

      for (
        const strictUpperBound of
        this.strictUpperBounds
      ) {
        rows =
          rows.filter(
            row =>
              row[
                strictUpperBound.column
              ] <
              strictUpperBound.value,
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

        created_at:
          '2026-08-06T09:00:00.000Z',
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

              commercial_fact_contract_version:
                'commercial-fact-v2',

              commercial_fact_definition:
                buildCommercialFactV2(),

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

              commercial_objection_contract_version:
                'commercial-objection-v2',

              commercial_objection_definition:
                buildCommercialObjectionV2(),

              sort_order:
                1,

              objection:
                'Preço percebido como alto',

              signals: [
                'Está caro.',
                'Ficou acima do orçamento previsto.',
              ],

              discovery_questions: [
                'Quando você diz que ficou alto, o que está pesando mais nessa condição?',
              ],

              recommended_approach:
                'Compreender a natureza da resistência antes de responder.',

              response_limits: [
                'Não presumir falta de dinheiro.',
                'Não oferecer desconto sem política comercial aplicável.',
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

    const factCall =
      calls.find(
        call =>
          call.table ===
          'company_commercial_facts',
      )

    assert.ok(
      factCall,
    )

    assert.ok(
      factCall
        .selected_columns
        .includes(
          'commercial_fact_contract_version',
        ),
    )

    assert.ok(
      factCall
        .selected_columns
        .includes(
          'commercial_fact_definition',
        ),
    )

    const loadedFact =
      result
        .diagnostic_input
        .commercial_context
        .facts[0]

    assert.equal(
      loadedFact.fact_key,
      'horario',
    )

    assert.equal(
      loadedFact.contract_version,
      'commercial-fact-v2',
    )

    assert.equal(
      loadedFact.validity_status,
      'current',
    )

    assert.equal(
      loadedFact.definition
        .source
        .type,
      'internal_policy',
    )

    const objectionCall =
      calls.find(
        call =>
          call.table ===
          'company_commercial_objection_guides',
      )

    assert.ok(
      objectionCall,
    )

    assert.ok(
      objectionCall
        .selected_columns
        .includes(
          'commercial_objection_contract_version',
        ),
    )

    assert.ok(
      objectionCall
        .selected_columns
        .includes(
          'commercial_objection_definition',
        ),
    )

    const loadedObjection =
      result
        .diagnostic_input
        .commercial_context
        .objection_guides[0]

    assert.equal(
      loadedObjection.contract_version,
      'commercial-objection-v2',
    )

    assert.equal(
      loadedObjection
        .definition
        .category,
      'price',
    )

    assert.equal(
      loadedObjection
        .definition
        .give_space_when[0],
      'Continuar insistindo aumentaria a resistência sem acrescentar informação útil.',
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


test(
  'snapshot stateful exclui mensagem observada depois do reference_time',
  async () => {
    const fixtures =
      buildFixtures()

    fixtures
      .conversation_messages
      .push({
        id:
          '99',

        company_id:
          companyId,

        cycle_id:
          cycleId,

        conversation_key:
          conversationKey,

        message_key:
          'message-future',

        version:
          1,

        direction:
          'incoming',

        occurred_at:
          '2026-08-07T00:59:59.000Z',

        observed_at:
          '2026-08-07T01:00:01.000Z',

        content_type:
          'text',

        text_content:
          'Mensagem posterior ao snapshot.',

        audio_transcription:
          null,

        is_deleted:
          false,
      })

    const {
      client,
    } =
      createMockClient(
        fixtures,
      )

    const loader =
      createStatefulCopilotRealContextLoader(
        client,
      )

    const result =
      await loader({
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
      })

    assert.equal(
      result
        .known_message_ids
        .includes(
          '99',
        ),
      false,
    )

    assert.equal(
      result
        .diagnostic_input
        .conversation
        .messages
        .some(
          message =>
            message.id ===
            '99',
        ),
      false,
    )
  },
)

// ONDA 8 / FRENTE 2 — commercial-method-v2 é a única fonte ativa de
// método comercial no caminho do Companion. Os testes abaixo comprovam,
// no nível do carregador real (a mesma consulta usada em produção):
// draft nunca vaza para o Companion, e uma nova análise após publicação
// usa imediatamente a versão nova, sem cache preso à versão anterior.

function buildMethodVersionRow({
  id,
  versionNumber,
  status,
  stageName,
}) {
  return {
    id,

    company_id:
      companyId,

    version_number:
      versionNumber,

    contract_version:
      'phase-2-v1',

    status,

    business_description:
      'Empresa de serviços comerciais.',

    target_audience:
      'Clientes que buscam acompanhamento.',

    value_proposition:
      'Atendimento consultivo e estruturado.',

    commercial_method_name:
      `Método ${stageName} (legado, não deve ser usado)`,

    commercial_method_description:
      'Texto legado, não deve ser parseado como etapas.',

    commercial_method_contract_version:
      'commercial-method-v2',

    commercial_method_definition: {
      contract_version:
        'commercial-method-v2',

      name:
        `Método ${stageName}`,

      description:
        `Descrição estruturada do método ${stageName}.`,

      principles: [
        'Esperar é uma decisão comercial válida.',
      ],

      stages: [
        {
          key:
            stageName.toLowerCase(),

          display_order:
            1,

          name:
            stageName,

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
          wait_when: [],

          stop_asking_when: [
            'Novas perguntas não alterariam a decisão.',
          ],

          dimensions: [],
        },
      ],
    },

    communication_tone:
      'Direto e respeitoso.',

    required_behaviors: [],
    prohibited_behaviors: [],

    created_by:
      ownerId,

    published_by:
      status === 'published'
        ? ownerId
        : null,

    archived_by:
      status === 'archived'
        ? ownerId
        : null,

    created_at:
      '2026-08-01T10:00:00.000Z',

    updated_at:
      '2026-08-02T10:00:00.000Z',

    published_at:
      status === 'published'
        ? '2026-08-02T10:00:00.000Z'
        : null,

    archived_at:
      status === 'archived'
        ? '2026-08-03T10:00:00.000Z'
        : null,
  }
}

test(
  'draft commercial-method-v2 nunca é usado enquanto outra versão está publicada (cenário A)',
  async () => {
    const fixtures =
      buildFixtures()

    fixtures
      .company_commercial_config_versions =
      [
        buildMethodVersionRow({
          id:
            configVersionId,

          versionNumber:
            3,

          status:
            'published',

          stageName:
            'Tour',
        }),

        buildMethodVersionRow({
          id:
            '60000000-0000-4000-8000-000000000009',

          versionNumber:
            4,

          status:
            'draft',

          stageName:
            'RascunhoNuncaUsado',
        }),
      ]

    const {
      client,
    } =
      createMockClient(
        fixtures,
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
        .steps
        .some(
          (step) =>
            step.name ===
            'RascunhoNuncaUsado',
        ),
      false,
    )
  },
)

test(
  'nova análise após publicação usa a nova versão publicada, sem cache preso à anterior (cenário B)',
  async () => {
    const versionAFixtures =
      buildFixtures()

    versionAFixtures
      .company_commercial_config_versions =
      [
        buildMethodVersionRow({
          id:
            configVersionId,

          versionNumber:
            3,

          status:
            'published',

          stageName:
            'Tour',
        }),
      ]

    const loader =
      createStatefulCopilotRealContextLoader(
        createMockClient(
          versionAFixtures,
        ).client,
      )

    const resultA =
      await loader(
        buildLoadArgs(),
      )

    assert.equal(
      resultA
        .diagnostic_input
        .commercial_context
        .sales_method
        .steps[0]
        .name,
      'Tour',
    )

    assert.equal(
      resultA
        .diagnostic_input
        .commercial_context
        .config_version_number,
      3,
    )

    // Simula o resultado de uma publicação bem-sucedida: a versão 3
    // agora está arquivada e a versão 4 passa a ser a única publicada.
    const versionBFixtures =
      buildFixtures()

    versionBFixtures
      .company_commercial_config_versions =
      [
        buildMethodVersionRow({
          id:
            configVersionId,

          versionNumber:
            3,

          status:
            'archived',

          stageName:
            'Tour',
        }),

        buildMethodVersionRow({
          id:
            '60000000-0000-4000-8000-000000000004',

          versionNumber:
            4,

          status:
            'published',

          stageName:
            'Apresentacao',
        }),
      ]

    const freshLoader =
      createStatefulCopilotRealContextLoader(
        createMockClient(
          versionBFixtures,
        ).client,
      )

    const resultAfterPublish =
      await freshLoader(
        buildLoadArgs(),
      )

    assert.equal(
      resultAfterPublish
        .diagnostic_input
        .commercial_context
        .config_version_number,
      4,
    )

    assert.equal(
      resultAfterPublish
        .diagnostic_input
        .commercial_context
        .sales_method
        .steps[0]
        .name,
      'Apresentacao',
    )

    assert.equal(
      resultAfterPublish
        .diagnostic_input
        .commercial_context
        .sales_method
        .steps
        .some(
          (step) =>
            step.name ===
            'Tour',
        ),
      false,
    )
  },
)

const priorCycleId =
  '30000000-0000-4000-8000-000000000099'

// Fase 16.3A — adversarial fixtures: um segundo lead/company e um ciclo
// futuro, usados para provar que origin_cycle_id e o fallback de
// heurística nunca atravessam identidade nem causalidade.
const otherLeadId =
  '20000000-0000-4000-8000-000000000002'

const otherCompanyId =
  '10000000-0000-4000-8000-000000000002'

const futureCycleId =
  '30000000-0000-4000-8000-000000000098'

const olderCycleId =
  '30000000-0000-4000-8000-000000000097'

function priorStateSnapshotFixture() {
  return {
    contract_version:
      'phase-5.1-commercial-state-v1',

    cycle_id:
      priorCycleId,

    version: 2,

    commercial_role:
      'buyer',

    current_moment: {
      summary: 'x',
      evidence_message_ids: [],
    },

    current_priority: {
      summary: 'x',
      evidence_message_ids: [],
    },

    last_analyzed_message_ids: [],
    last_evidence_message_ids: [],

    facts: [
      {
        id: 'old-fact-objective',
        kind: 'client.objective',
        value: null,
        summary: 'Queria emagrecer para a maratona no ciclo anterior.',
        confidence: 'high',
        evidence_message_ids: ['old-msg-1'],
        memory_status: 'active',
        created_in_state_version: 2,
        updated_in_state_version: 2,
        closed_in_state_version: null,
      },
    ],

    needs: [],
    open_loops: [],
    objections: [],
    commitments: [],
    signals: [],
    uncertainties: [],

    created_at: '2026-08-01T10:00:00.000Z',
    updated_at: '2026-08-01T10:00:00.000Z',
  }
}

test(
  'Blocker 4: ciclo sem estado próprio herda memória durável do ciclo indicado por origin_cycle_id',
  async () => {
    const fixtures =
      buildFixtures({
        includeState: false,
      })

    fixtures.sales_cycles[0].origin_cycle_id =
      priorCycleId

    // Fase 16.3A: origin_cycle_id agora é revalidado contra sales_cycles
    // (mesma company, mesmo lead, cronologicamente anterior) — precisa
    // existir como linha própria para o caminho feliz continuar válido.
    fixtures.sales_cycles.push({
      id: priorCycleId,
      company_id: companyId,
      lead_id: leadId,
      owner_user_id: ownerId,
      status: 'perdido',
      next_action: null,
      next_action_date: null,
      updated_at: '2026-08-01T10:00:00.000Z',
      created_at: '2026-08-01T09:00:00.000Z',
    })

    fixtures.companion_commercial_states = [
      {
        id: '80000000-0000-4000-8000-000000000099',
        company_id: companyId,
        cycle_id: priorCycleId,
        conversation_key: 'whatsapp:+5547999990099',
        state_version: 2,
        state_contract_version: 'phase-5.1-commercial-state-v1',
        state_updated_at: '2026-08-01T10:00:00.000Z',
        persisted_at: '2026-08-01T10:00:01.000Z',
        state_snapshot: priorStateSnapshotFixture(),
      },
    ]

    const { client } =
      createMockClient(fixtures)

    const result =
      await createStatefulCopilotRealContextLoader(
        client,
      )(
        buildLoadArgs(),
      )

    assert.equal(result.state_read.mode, 'missing')
    assert.ok(result.durable_memory_seed, 'deveria herdar memória do ciclo indicado por origin_cycle_id')
    assert.equal(result.durable_memory_seed.source_cycle_id, priorCycleId)
    assert.equal(result.durable_memory_seed.facts.length, 1)
    assert.equal(result.durable_memory_seed.facts[0].kind, 'client.objective')
    assert.match(result.durable_memory_seed.facts[0].summary, /Herdado do ciclo anterior/)
  },
)

test(
  'Blocker 4: sem origin_cycle_id, herda do ciclo mais recente do mesmo lead (heurística de fallback)',
  async () => {
    const fixtures =
      buildFixtures({
        includeState: false,
      })

    // origin_cycle_id não é setado — precisa cair na heurística de
    // "ciclo mais recente do mesmo lead, excluindo o ciclo atual".
    fixtures.sales_cycles.push({
      id: priorCycleId,
      company_id: companyId,
      lead_id: leadId,
      owner_user_id: ownerId,
      status: 'perdido',
      next_action: null,
      next_action_date: null,
      updated_at: '2026-08-01T10:00:00.000Z',
      created_at: '2026-08-01T09:00:00.000Z',
    })

    fixtures.sales_cycles[0].created_at =
      '2026-08-06T09:00:00.000Z'

    fixtures.companion_commercial_states = [
      {
        id: '80000000-0000-4000-8000-000000000099',
        company_id: companyId,
        cycle_id: priorCycleId,
        conversation_key: 'whatsapp:+5547999990099',
        state_version: 2,
        state_contract_version: 'phase-5.1-commercial-state-v1',
        state_updated_at: '2026-08-01T10:00:00.000Z',
        persisted_at: '2026-08-01T10:00:01.000Z',
        state_snapshot: priorStateSnapshotFixture(),
      },
    ]

    const { client } =
      createMockClient(fixtures)

    const result =
      await createStatefulCopilotRealContextLoader(
        client,
      )(
        buildLoadArgs(),
      )

    assert.equal(result.state_read.mode, 'missing')
    assert.ok(result.durable_memory_seed, 'deveria herdar via heurística de fallback')
    assert.equal(result.durable_memory_seed.source_cycle_id, priorCycleId)
  },
)

test(
  'Blocker 4: ciclo que já possui estado próprio nunca consulta memória durável de outro ciclo',
  async () => {
    const fixtures =
      buildFixtures()

    const { client, calls } =
      createMockClient(fixtures)

    const result =
      await createStatefulCopilotRealContextLoader(
        client,
      )(
        buildLoadArgs(),
      )

    assert.equal(result.state_read.mode, 'found')
    assert.equal(result.durable_memory_seed, null)

    assert.equal(
      calls.some(
        (call) =>
          call.table === 'sales_cycles' &&
          call.filters.some((f) => f.column === 'lead_id'),
      ),
      false,
      'não deveria nem buscar ciclos anteriores quando já há estado próprio',
    )
  },
)

test(
  'Blocker 4: sem ciclo anterior e sem origin_cycle_id, durable_memory_seed permanece null',
  async () => {
    const fixtures =
      buildFixtures({
        includeState: false,
      })

    const { client } =
      createMockClient(fixtures)

    const result =
      await createStatefulCopilotRealContextLoader(
        client,
      )(
        buildLoadArgs(),
      )

    assert.equal(result.state_read.mode, 'missing')
    assert.equal(result.durable_memory_seed, null)
  },
)

// ----------------------------------------------------------------------------
// Fase 16.3A — Identity + Durable Memory Safety.
//
// Bug A (cross-lead/cross-company contamination): origin_cycle_id nunca
// era revalidado contra sales_cycles antes de ser usado como fonte —
// bastava existir. Bug B (inversão temporal): o fallback ordenava por
// created_at DESC e excluía só o próprio id, sem exigir predecessor
// cronológico estrito, permitindo herdar de um ciclo futuro do mesmo
// lead. As correções tornam ambos os caminhos (origin_cycle_id
// explícito e heurística de fallback) sujeitos ao mesmo contrato: mesma
// company, mesmo lead, nunca o próprio ciclo, estritamente anterior.
// ----------------------------------------------------------------------------

test(
  'Fase 16.3A (Bug A): origin_cycle_id de outro lead da mesma company nunca é usado para herdar memória',
  async () => {
    const fixtures =
      buildFixtures({
        includeState: false,
      })

    fixtures.sales_cycles[0].origin_cycle_id =
      priorCycleId

    // O ciclo indicado por origin_cycle_id existe e é da mesma company,
    // mas pertence a OUTRO lead — não pode ser usado como fonte.
    fixtures.sales_cycles.push({
      id: priorCycleId,
      company_id: companyId,
      lead_id: otherLeadId,
      owner_user_id: ownerId,
      status: 'perdido',
      next_action: null,
      next_action_date: null,
      updated_at: '2026-08-01T10:00:00.000Z',
      created_at: '2026-08-01T09:00:00.000Z',
    })

    fixtures.companion_commercial_states = [
      {
        id: '80000000-0000-4000-8000-000000000099',
        company_id: companyId,
        cycle_id: priorCycleId,
        conversation_key: 'whatsapp:+5547999990099',
        state_version: 2,
        state_contract_version: 'phase-5.1-commercial-state-v1',
        state_updated_at: '2026-08-01T10:00:00.000Z',
        persisted_at: '2026-08-01T10:00:01.000Z',
        state_snapshot: priorStateSnapshotFixture(),
      },
    ]

    const { client } =
      createMockClient(fixtures)

    const result =
      await createStatefulCopilotRealContextLoader(
        client,
      )(
        buildLoadArgs(),
      )

    assert.equal(result.state_read.mode, 'missing')
    assert.equal(
      result.durable_memory_seed,
      null,
      'não deveria herdar memória de um ciclo de outro lead, mesmo indicado por origin_cycle_id',
    )
  },
)

test(
  'Fase 16.3A (Bug A): origin_cycle_id de outra company nunca é usado para herdar memória',
  async () => {
    const fixtures =
      buildFixtures({
        includeState: false,
      })

    fixtures.sales_cycles[0].origin_cycle_id =
      priorCycleId

    // Mesmo lead_id (coincidência possível entre tenants), mas OUTRA
    // company — o filtro de tenant da própria query já deveria excluir.
    fixtures.sales_cycles.push({
      id: priorCycleId,
      company_id: otherCompanyId,
      lead_id: leadId,
      owner_user_id: ownerId,
      status: 'perdido',
      next_action: null,
      next_action_date: null,
      updated_at: '2026-08-01T10:00:00.000Z',
      created_at: '2026-08-01T09:00:00.000Z',
    })

    fixtures.companion_commercial_states = [
      {
        id: '80000000-0000-4000-8000-000000000099',
        company_id: otherCompanyId,
        cycle_id: priorCycleId,
        conversation_key: 'whatsapp:+5547999990099',
        state_version: 2,
        state_contract_version: 'phase-5.1-commercial-state-v1',
        state_updated_at: '2026-08-01T10:00:00.000Z',
        persisted_at: '2026-08-01T10:00:01.000Z',
        state_snapshot: priorStateSnapshotFixture(),
      },
    ]

    const { client } =
      createMockClient(fixtures)

    const result =
      await createStatefulCopilotRealContextLoader(
        client,
      )(
        buildLoadArgs(),
      )

    assert.equal(result.state_read.mode, 'missing')
    assert.equal(
      result.durable_memory_seed,
      null,
      'não deveria herdar memória de um ciclo de outra company, mesmo indicado por origin_cycle_id',
    )
  },
)

test(
  'Fase 16.3A: origin_cycle_id apontando para o próprio ciclo atual é ignorado',
  async () => {
    const fixtures =
      buildFixtures({
        includeState: false,
      })

    fixtures.sales_cycles[0].origin_cycle_id =
      cycleId

    const { client } =
      createMockClient(fixtures)

    const result =
      await createStatefulCopilotRealContextLoader(
        client,
      )(
        buildLoadArgs(),
      )

    assert.equal(result.state_read.mode, 'missing')
    assert.equal(
      result.durable_memory_seed,
      null,
      'origin_cycle_id igual ao ciclo atual nunca pode ser fonte de si mesmo',
    )
  },
)

test(
  'Fase 16.3A (Bug B): origin_cycle_id apontando para um ciclo futuro do mesmo lead nunca é usado',
  async () => {
    const fixtures =
      buildFixtures({
        includeState: false,
      })

    fixtures.sales_cycles[0].origin_cycle_id =
      futureCycleId

    fixtures.sales_cycles.push({
      id: futureCycleId,
      company_id: companyId,
      lead_id: leadId,
      owner_user_id: ownerId,
      status: 'negociacao',
      next_action: null,
      next_action_date: null,
      updated_at: '2026-08-08T10:00:00.000Z',
      created_at: '2026-08-08T10:00:00.000Z',
    })

    fixtures.companion_commercial_states = [
      {
        id: '80000000-0000-4000-8000-000000000098',
        company_id: companyId,
        cycle_id: futureCycleId,
        conversation_key: 'whatsapp:+5547999990098',
        state_version: 2,
        state_contract_version: 'phase-5.1-commercial-state-v1',
        state_updated_at: '2026-08-08T10:00:00.000Z',
        persisted_at: '2026-08-08T10:00:01.000Z',
        state_snapshot: priorStateSnapshotFixture(),
      },
    ]

    const { client } =
      createMockClient(fixtures)

    const result =
      await createStatefulCopilotRealContextLoader(
        client,
      )(
        buildLoadArgs(),
      )

    assert.equal(result.state_read.mode, 'missing')
    assert.equal(
      result.durable_memory_seed,
      null,
      'um ciclo futuro nunca pode ser fonte de memória durável, mesmo indicado por origin_cycle_id',
    )
  },
)

test(
  'Fase 16.3A (fallback): sem origin_cycle_id, escolhe o predecessor cronológico MAIS RECENTE entre vários válidos',
  async () => {
    const fixtures =
      buildFixtures({
        includeState: false,
      })

    // Dois candidatos válidos (mesma company/lead, ambos anteriores ao
    // ciclo atual) — o mais recente (priorCycleId) deve vencer sobre o
    // mais antigo (olderCycleId).
    fixtures.sales_cycles.push(
      {
        id: olderCycleId,
        company_id: companyId,
        lead_id: leadId,
        owner_user_id: ownerId,
        status: 'perdido',
        next_action: null,
        next_action_date: null,
        updated_at: '2026-07-01T10:00:00.000Z',
        created_at: '2026-07-01T09:00:00.000Z',
      },
      {
        id: priorCycleId,
        company_id: companyId,
        lead_id: leadId,
        owner_user_id: ownerId,
        status: 'perdido',
        next_action: null,
        next_action_date: null,
        updated_at: '2026-08-01T10:00:00.000Z',
        created_at: '2026-08-01T09:00:00.000Z',
      },
    )

    fixtures.companion_commercial_states = [
      {
        id: '80000000-0000-4000-8000-000000000096',
        company_id: companyId,
        cycle_id: olderCycleId,
        conversation_key: 'whatsapp:+5547999990096',
        state_version: 2,
        state_contract_version: 'phase-5.1-commercial-state-v1',
        state_updated_at: '2026-07-01T10:00:00.000Z',
        persisted_at: '2026-07-01T10:00:01.000Z',
        state_snapshot: {
          ...priorStateSnapshotFixture(),
          cycle_id: olderCycleId,
        },
      },
      {
        id: '80000000-0000-4000-8000-000000000099',
        company_id: companyId,
        cycle_id: priorCycleId,
        conversation_key: 'whatsapp:+5547999990099',
        state_version: 2,
        state_contract_version: 'phase-5.1-commercial-state-v1',
        state_updated_at: '2026-08-01T10:00:00.000Z',
        persisted_at: '2026-08-01T10:00:01.000Z',
        state_snapshot: priorStateSnapshotFixture(),
      },
    ]

    const { client } =
      createMockClient(fixtures)

    const result =
      await createStatefulCopilotRealContextLoader(
        client,
      )(
        buildLoadArgs(),
      )

    assert.equal(result.state_read.mode, 'missing')
    assert.ok(result.durable_memory_seed)
    assert.equal(
      result.durable_memory_seed.source_cycle_id,
      priorCycleId,
      'deveria escolher o predecessor cronológico mais recente, não o mais antigo',
    )
  },
)

test(
  'Fase 16.3A (Bug B, fallback): ignora ciclo futuro e escolhe o predecessor cronológico real',
  async () => {
    const fixtures =
      buildFixtures({
        includeState: false,
      })

    // futureCycleId é mais recente que qualquer coisa em created_at
    // DESC, mas é POSTERIOR ao ciclo atual — não pode vencer priorCycleId.
    fixtures.sales_cycles.push(
      {
        id: futureCycleId,
        company_id: companyId,
        lead_id: leadId,
        owner_user_id: ownerId,
        status: 'negociacao',
        next_action: null,
        next_action_date: null,
        updated_at: '2026-08-08T10:00:00.000Z',
        created_at: '2026-08-08T10:00:00.000Z',
      },
      {
        id: priorCycleId,
        company_id: companyId,
        lead_id: leadId,
        owner_user_id: ownerId,
        status: 'perdido',
        next_action: null,
        next_action_date: null,
        updated_at: '2026-08-01T10:00:00.000Z',
        created_at: '2026-08-01T09:00:00.000Z',
      },
    )

    fixtures.companion_commercial_states = [
      {
        id: '80000000-0000-4000-8000-000000000098',
        company_id: companyId,
        cycle_id: futureCycleId,
        conversation_key: 'whatsapp:+5547999990098',
        state_version: 2,
        state_contract_version: 'phase-5.1-commercial-state-v1',
        state_updated_at: '2026-08-08T10:00:00.000Z',
        persisted_at: '2026-08-08T10:00:01.000Z',
        state_snapshot: {
          ...priorStateSnapshotFixture(),
          cycle_id: futureCycleId,
        },
      },
      {
        id: '80000000-0000-4000-8000-000000000099',
        company_id: companyId,
        cycle_id: priorCycleId,
        conversation_key: 'whatsapp:+5547999990099',
        state_version: 2,
        state_contract_version: 'phase-5.1-commercial-state-v1',
        state_updated_at: '2026-08-01T10:00:00.000Z',
        persisted_at: '2026-08-01T10:00:01.000Z',
        state_snapshot: priorStateSnapshotFixture(),
      },
    ]

    const { client } =
      createMockClient(fixtures)

    const result =
      await createStatefulCopilotRealContextLoader(
        client,
      )(
        buildLoadArgs(),
      )

    assert.equal(result.state_read.mode, 'missing')
    assert.ok(result.durable_memory_seed)
    assert.equal(
      result.durable_memory_seed.source_cycle_id,
      priorCycleId,
      'o ciclo futuro nunca deveria ser escolhido, mesmo sendo o de created_at mais recente',
    )
  },
)

test(
  'Fase 16.3A (Bug B, fallback): só existe ciclo futuro do mesmo lead — sem predecessor real, permanece null',
  async () => {
    const fixtures =
      buildFixtures({
        includeState: false,
      })

    fixtures.sales_cycles.push({
      id: futureCycleId,
      company_id: companyId,
      lead_id: leadId,
      owner_user_id: ownerId,
      status: 'negociacao',
      next_action: null,
      next_action_date: null,
      updated_at: '2026-08-08T10:00:00.000Z',
      created_at: '2026-08-08T10:00:00.000Z',
    })

    fixtures.companion_commercial_states = [
      {
        id: '80000000-0000-4000-8000-000000000098',
        company_id: companyId,
        cycle_id: futureCycleId,
        conversation_key: 'whatsapp:+5547999990098',
        state_version: 2,
        state_contract_version: 'phase-5.1-commercial-state-v1',
        state_updated_at: '2026-08-08T10:00:00.000Z',
        persisted_at: '2026-08-08T10:00:01.000Z',
        state_snapshot: {
          ...priorStateSnapshotFixture(),
          cycle_id: futureCycleId,
        },
      },
    ]

    const { client } =
      createMockClient(fixtures)

    const result =
      await createStatefulCopilotRealContextLoader(
        client,
      )(
        buildLoadArgs(),
      )

    assert.equal(result.state_read.mode, 'missing')
    assert.equal(
      result.durable_memory_seed,
      null,
      'sem nenhum predecessor cronológico real, o fallback precisa retornar null — nunca escolher o único ciclo futuro disponível',
    )
  },
)

test(
  'Fase 16.3A (empate de created_at): um ciclo com o mesmo timestamp do ciclo atual nunca é um predecessor seguro',
  async () => {
    const fixtures =
      buildFixtures({
        includeState: false,
      })

    const tiedCreatedAt =
      fixtures.sales_cycles[0].created_at

    // Empatado exatamente com o ciclo atual — sem critério causal
    // seguro para decidir quem veio "antes". origin_cycle_id explícito
    // E a heurística de fallback precisam recusar os dois.
    fixtures.sales_cycles[0].origin_cycle_id =
      priorCycleId

    fixtures.sales_cycles.push({
      id: priorCycleId,
      company_id: companyId,
      lead_id: leadId,
      owner_user_id: ownerId,
      status: 'perdido',
      next_action: null,
      next_action_date: null,
      updated_at: tiedCreatedAt,
      created_at: tiedCreatedAt,
    })

    fixtures.companion_commercial_states = [
      {
        id: '80000000-0000-4000-8000-000000000099',
        company_id: companyId,
        cycle_id: priorCycleId,
        conversation_key: 'whatsapp:+5547999990099',
        state_version: 2,
        state_contract_version: 'phase-5.1-commercial-state-v1',
        state_updated_at: tiedCreatedAt,
        persisted_at: tiedCreatedAt,
        state_snapshot: priorStateSnapshotFixture(),
      },
    ]

    const { client } =
      createMockClient(fixtures)

    const result =
      await createStatefulCopilotRealContextLoader(
        client,
      )(
        buildLoadArgs(),
      )

    assert.equal(result.state_read.mode, 'missing')
    assert.equal(
      result.durable_memory_seed,
      null,
      'created_at empatado não é um predecessor cronológico seguro — nem via origin_cycle_id, nem via fallback',
    )
  },
)

test(
  'Fase 16.3A (best-effort): erro na busca do ciclo anterior nunca lança, retorna null',
  async () => {
    const result =
      await loadDurableMemorySeedForMissingState({
        client: {
          from(table) {
            if (table === 'sales_cycles') {
              return {
                select() {
                  return this
                },
                eq() {
                  return this
                },
                lt() {
                  return this
                },
                order() {
                  return this
                },
                limit() {
                  return this
                },
                then(_resolve, reject) {
                  reject(
                    new Error('lookup indisponível'),
                  )
                },
              }
            }

            throw new Error(
              `tabela inesperada nesta simulação de falha: ${table}`,
            )
          },
        },

        companyId,
        cycleId,
        leadId,

        originCycleId:
          null,

        currentCycleCreatedAt:
          '2026-08-06T09:00:00.000Z',
      })

    assert.equal(
      result,
      null,
      'uma falha best-effort na busca do ciclo anterior nunca pode lançar nem interromper o fluxo',
    )
  },
)

test(
  'scope canônico compartilhado é equivalente ao scope consumido pelo loader stateful',
  async () => {
    const fixtures =
      buildFixtures()

    const {
      client: scopeClient,
    } =
      createMockClient(fixtures)

    const canonicalScope =
      await loadStatefulCopilotCanonicalScope({
        client: scopeClient,
        companyId,
        cycleId,
      })

    const {
      client: loaderClient,
    } =
      createMockClient(fixtures)

    const fullContext =
      await createStatefulCopilotRealContextLoader(
        loaderClient,
      )(
        buildLoadArgs(),
      )

    assert.deepEqual(
      {
        company:
          fullContext.scope.company,
        lead:
          fullContext.scope.lead,
        cycle:
          fullContext.scope.cycle,
      },
      {
        company:
          canonicalScope.company,
        lead:
          canonicalScope.lead,
        cycle:
          canonicalScope.cycle,
      },
    )

    assert.equal(
      canonicalScope.origin_cycle_id,
      null,
    )
  },
)
