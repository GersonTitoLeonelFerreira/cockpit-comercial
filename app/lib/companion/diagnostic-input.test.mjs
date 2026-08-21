import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCompanionDiagnosticInput,
  COMPANION_DIAGNOSTIC_INPUT_VERSION,
  CompanionDiagnosticInputError,
} from './diagnostic-input.ts'

const COMPANY_ID =
  '40fb91ee-f998-4d98-acdf-7d0794369ccf'

const CYCLE_ID =
  '123e4567-e89b-42d3-a456-426614174000'

const CONFIG_VERSION_ID =
  '223e4567-e89b-42d3-a456-426614174000'

const PRODUCT_ID =
  '323e4567-e89b-42d3-a456-426614174000'

function buildMessage(overrides = {}) {
  return {
    id: '1',
    message_key: 'message-001',
    version: 1,
    direction: 'incoming',
    occurred_at:
      '2026-08-04T18:00:00.000Z',
    observed_at:
      '2026-08-04T18:00:02.000Z',
    content_type: 'text',
    text_content:
      'Quero treinar três vezes por semana.',
    audio_transcription: null,
    is_deleted: false,
    ...overrides,
  }
}

function buildCommercialMethodV2() {
  return {
    contract_version:
      'commercial-method-v2',

    name:
      'Método ATO',

    description:
      'Acolher, compreender no Tour e Obter o desfecho adequado.',

    principles: [
      'Perguntar somente quando a resposta puder alterar a decisão comercial.',
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
          'Compreender somente as informações relevantes para a decisão atual.',

        requirement:
          'required',

        completion_criteria: [
          'A necessidade relevante está compreendida.',
        ],

        partial_completion_criteria: [
          'A necessidade apareceu, mas ainda existe incerteza material.',
        ],

        skip_conditions: [],

        recommended_questions: [
          'O que é mais importante para você nessa escolha?',
        ],

        common_mistakes: [
          'Transformar descoberta em interrogatório.',
        ],

        deepen_when: [
          'Falta informação que pode alterar a recomendação.',
        ],

        sufficient_when: [
          'As informações disponíveis já permitem orientar com segurança.',
        ],

        advance_when: [
          'Existe correspondência comprovada entre necessidade e solução.',
        ],

        wait_when: [
          'O cliente assumiu compromisso explícito de retorno.',
        ],

        stop_asking_when: [
          'Novas perguntas não alterariam a decisão comercial.',
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
              'A necessidade relevante foi identificada.',
            ],
          },
        ],
      },
    ],
  }
}


function buildCommercialProductV2() {
  return {
    contract_version:
      'commercial-product-v2',

    product_kind:
      'simple',

    name:
      'Plano Open',

    category:
      'plano',

    commercial_description:
      'Plano recorrente com condições comerciais oficialmente configuradas.',

    indicated_audiences: [
      'Adultos',
    ],

    needs_addressed: [
      'Condicionamento físico',
    ],

    benefits: [
      'Estrutura completa',
    ],

    verified_differentiators: [
      'Acompanhamento',
    ],

    limitations: [
      'Disponibilidade depende da unidade',
    ],

    recommend_when: [
      'A necessidade do cliente corresponde ao que o plano realmente oferece.',
    ],

    avoid_when: [
      'O cliente precisa de algo que o plano não oferece.',
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
        'Valor mensal confirmado.',
    },

    contract_conditions: [
      'Conforme contrato',
    ],

    payment_conditions: [
      'Conforme plano escolhido',
    ],

    allowed_claims: [
      'Estrutura disponível',
    ],

    forbidden_claims: [
      'Resultado garantido',
    ],
  }
}

function buildCommercialProductV3() {
  return {
    contract_version:
      'commercial-product-v3',

    product_kind:
      'complex',

    name:
      'Esteira Profissional',

    category:
      'equipamento',

    commercial_description:
      'Equipamento profissional com seleção por variante.',

    indicated_audiences: [
      'Operações comerciais que precisam do equipamento.',
    ],

    needs_addressed: [
      'Equipar operação cardiovascular.',
    ],

    benefits: [
      'Seleção técnica conforme a aplicação.',
    ],

    verified_differentiators: [
      'Variantes com especificações verificadas.',
    ],

    limitations: [
      'A escolha depende da infraestrutura disponível.',
    ],

    recommend_when: [
      'A necessidade corresponde à aplicação da variante.',
    ],

    avoid_when: [
      'A infraestrutura é incompatível com a variante.',
    ],

    contract_conditions: [
      'Instalação conforme escopo contratado.',
    ],

    payment_conditions: [
      'Conforme condição comercial da variante.',
    ],

    allowed_claims: [
      'Existem variantes tecnicamente distintas.',
    ],

    forbidden_claims: [
      'Qualquer variante atende qualquer infraestrutura.',
    ],

    variants: [
      {
        key:
          'pro',

        name:
          'Modelo Pro',

        sku:
          'EQ-PRO-001',

        model:
          'XP-900',

        version:
          '2026',

        commercial_description:
          'Versão profissional do equipamento.',

        compatibility: {
          compatible_with: [
            'Rede elétrica 220V',
          ],

          incompatible_with: [
            'Rede elétrica 110V',
          ],

          notes: [
            'Verificar infraestrutura.',
          ],
        },

        applications: [
          'Operações profissionais.',
        ],

        specifications: [
          {
            key:
              'motor',

            label:
              'Motor',

            value:
              '5',

            unit:
              'HP',
          },
        ],

        limitations: [
          'Exige instalação em 220V.',
        ],

        recommend_when: [
          'A operação exige equipamento profissional.',
        ],

        avoid_when: [
          'O local possui somente rede 110V.',
        ],

        pricing: {
          model:
            'one_time',

          amount:
            18990,

          currency:
            'BRL',

          amount_qualifier:
            'exact',

          recurrence:
            null,

          installment_count:
            null,

          installment_amount_basis:
            null,

          note:
            'Preço confirmado da variante.',
        },

        stock: {
          status:
            'available',

          quantity:
            4,

          checked_at:
            '2026-08-04T19:00:00.000Z',

          valid_until:
            '2026-08-04T21:00:00.000Z',

          note:
            'Estoque confirmado.',
        },

        allowed_claims: [
          'Possui motor de 5 HP.',
        ],

        forbidden_claims: [
          'Nunca necessita manutenção.',
        ],
      },
    ],
  }
}

function buildCommercialFactV2(
  overrides = {},
) {
  return {
    contract_version:
      'commercial-fact-v2',

    fact_kind:
      'official',

    category:
      'operação',

    fact_key:
      'horario_atendimento',

    fact_value:
      'Atendimento comercial de segunda a sexta-feira.',

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

    limitations: [
      'Não inclui feriados.',
    ],

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
        'Política oficial de atendimento.',

      verified_at:
        '2026-08-04T12:00:00.000Z',
    },

    ...overrides,
  }
}

function buildCommercialFactRecord(
  definition,
  overrides = {},
) {
  return {
    id:
      '723e4567-e89b-42d3-a456-426614174000',

    company_id:
      COMPANY_ID,

    config_version_id:
      CONFIG_VERSION_ID,

    commercial_fact_contract_version:
      definition
        ? 'commercial-fact-v2'
        : 'commercial-fact-v1',

    commercial_fact_definition:
      definition,

    category:
      definition?.category ??
      'estrutura',

    fact_key:
      definition?.fact_key ??
      'horario',

    fact_value:
      definition?.fact_value ??
      'Horário conforme unidade.',

    source_note:
      'Configuração oficial',

    is_active:
      true,

    created_at:
      '2026-08-01T10:00:00.000Z',

    updated_at:
      '2026-08-01T10:00:00.000Z',

    ...overrides,
  }
}

function buildCommercialObjectionV2(
  overrides = {},
) {
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
      'Resistência em que o preço ou a relação entre preço e valor percebido dificulta materialmente a decisão.',

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
      'O cliente apenas pede condições de pagamento.',
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
      'Está claro se o preço continua sendo um bloqueio real para a decisão.',
    ],

    wait_when: [
      'O cliente pediu tempo e assumiu compromisso explícito de retorno.',
    ],

    give_space_when: [
      'Continuar insistindo aumentaria a resistência sem acrescentar informação útil.',
    ],

    stop_when: [
      'O cliente fez uma recusa explícita e não solicitou continuidade.',
    ],

    ...overrides,
  }
}

function buildCommercialObjectionRecord(
  definition,
  overrides = {},
) {
  return {
    id:
      '833e4567-e89b-42d3-a456-426614174000',

    company_id:
      COMPANY_ID,

    config_version_id:
      CONFIG_VERSION_ID,

    commercial_objection_contract_version:
      definition
        ? 'commercial-objection-v2'
        : 'commercial-objection-v1',

    commercial_objection_definition:
      definition,

    sort_order:
      1,

    objection:
      definition?.objection ??
      'Preço',

    signals:
      definition?.signals ?? [
        'Está caro',
      ],

    discovery_questions:
      definition
        ?.discovery_questions ?? [
        'O que você está comparando?',
      ],

    recommended_approach:
      definition
        ?.recommended_approach ??
      'Entender a comparação antes de responder.',

    response_limits:
      definition?.response_limits ?? [
        'Não prometer desconto inexistente.',
      ],

    is_active:
      true,

    created_at:
      '2026-08-01T10:00:00.000Z',

    updated_at:
      '2026-08-01T10:00:00.000Z',

    ...overrides,
  }
}

function buildCommercialConfig(
  overrides = {},
) {
  return {
    version: {
      id: CONFIG_VERSION_ID,
      company_id: COMPANY_ID,
      version_number: 1,
      contract_version:
        'phase-2-v1',
      status: 'published',

      business_description:
        'Academia com atendimento comercial consultivo.',

      target_audience:
        'Pessoas interessadas em atividade física.',

      value_proposition:
        'Acompanhamento e estrutura para treinar.',

      commercial_method_name:
        'Método Consultivo',

      commercial_method_description:
        'Entender antes de apresentar.',

      commercial_method_contract_version:
        'commercial-method-v1',

      commercial_method_definition:
        null,

      communication_tone:
        'Direto, acolhedor e claro.',

      required_behaviors: [
        'Responder perguntas do cliente.',
      ],

      prohibited_behaviors: [
        'Inventar condições comerciais.',
      ],

      created_by:
        '423e4567-e89b-42d3-a456-426614174000',

      published_by:
        '423e4567-e89b-42d3-a456-426614174000',

      archived_by: null,

      created_at:
        '2026-08-01T10:00:00.000Z',

      updated_at:
        '2026-08-01T11:00:00.000Z',

      published_at:
        '2026-08-01T11:00:00.000Z',

      archived_at: null,
    },

    method_steps: [
      {
        id:
          '523e4567-e89b-42d3-a456-426614174000',

        company_id:
          COMPANY_ID,

        config_version_id:
          CONFIG_VERSION_ID,

        step_order: 1,
        name: 'Diagnóstico',
        objective:
          'Entender objetivo e rotina.',

        completion_criteria: [
          'Objetivo identificado.',
        ],

        recommended_questions: [
          'Qual é seu principal objetivo?',
        ],

        is_required: true,

        created_at:
          '2026-08-01T10:00:00.000Z',

        updated_at:
          '2026-08-01T10:00:00.000Z',
      },
    ],

    product_profiles: [
      {
        id:
          '623e4567-e89b-42d3-a456-426614174000',

        company_id:
          COMPANY_ID,

        config_version_id:
          CONFIG_VERSION_ID,

        product_id:
          PRODUCT_ID,

        commercial_product_contract_version:
          'commercial-product-v1',

        commercial_product_definition:
          null,

        indicated_audiences: [
          'Adultos',
        ],

        needs_addressed: [
          'Condicionamento físico',
        ],

        benefits: [
          'Estrutura completa',
        ],

        verified_differentiators: [
          'Acompanhamento',
        ],

        limitations: [
          'Disponibilidade depende da unidade',
        ],

        contract_conditions: [
          'Conforme contrato',
        ],

        payment_conditions: [
          'Conforme plano escolhido',
        ],

        allowed_claims: [
          'Estrutura disponível',
        ],

        forbidden_claims: [
          'Resultado garantido',
        ],

        created_at:
          '2026-08-01T10:00:00.000Z',

        updated_at:
          '2026-08-01T10:00:00.000Z',
      },
    ],

    facts: [
      {
        id:
          '723e4567-e89b-42d3-a456-426614174000',

        company_id:
          COMPANY_ID,

        config_version_id:
          CONFIG_VERSION_ID,

        category: 'estrutura',
        fact_key: 'horario',
        fact_value:
          'Horário conforme unidade.',
        source_note:
          'Configuração oficial',
        is_active: true,

        created_at:
          '2026-08-01T10:00:00.000Z',

        updated_at:
          '2026-08-01T10:00:00.000Z',
      },
    ],

    objection_guides: [
      {
        id:
          '823e4567-e89b-42d3-a456-426614174000',

        company_id:
          COMPANY_ID,

        config_version_id:
          CONFIG_VERSION_ID,

        sort_order: 1,
        objection:
          'Preço',

        signals: [
          'Está caro',
        ],

        discovery_questions: [
          'O que você está comparando?',
        ],

        recommended_approach:
          'Entender a comparação antes de responder.',

        response_limits: [
          'Não prometer desconto inexistente.',
        ],

        is_active: true,

        created_at:
          '2026-08-01T10:00:00.000Z',

        updated_at:
          '2026-08-01T10:00:00.000Z',
      },
    ],

    ...overrides,
  }
}

function buildProducts(overrides = {}) {
  return [
    {
      id: PRODUCT_ID,
      company_id: COMPANY_ID,
      name: 'Plano Open',
      category: 'plano',
      base_price: 199.9,
      active: true,
      ...overrides,
    },
  ]
}

function buildInput(overrides = {}) {
  return {
    company_id:
      COMPANY_ID,

    cycle_id:
      CYCLE_ID,

    conversation_key:
      'whatsapp:5511999999999',

    current_crm_status:
      'respondeu',

    reference_time:
      '2026-08-04T20:00:00.000Z',

    messages: [
      buildMessage(),
    ],

    commercial_config:
      buildCommercialConfig(),

    products:
      buildProducts(),

    ...overrides,
  }
}

function assertInputError(
  callback,
  expectedCode,
) {
  assert.throws(
    callback,
    (error) => {
      assert.ok(
        error instanceof
          CompanionDiagnosticInputError,
      )

      assert.equal(
        error.code,
        expectedCode,
      )

      return true
    },
  )
}

test(
  'constrói a entrada canônica completa do diagnóstico V2',
  () => {
    const result =
      buildCompanionDiagnosticInput(
        buildInput(),
      )

    assert.equal(
      result.input_version,
      COMPANION_DIAGNOSTIC_INPUT_VERSION,
    )

    assert.equal(
      result.diagnostic_contract_version,
      'phase-1-v1',
    )

    assert.equal(
      result.analysis_precondition.status,
      'ready',
    )

    assert.deepEqual(
      result.analysis_precondition.limitations,
      [],
    )

    assert.equal(
      result.conversation.messages.length,
      1,
    )

    assert.equal(
      result.commercial_context
        .sales_method.configured,
      true,
    )

    assert.equal(
      result.commercial_context
        .products[0].name,
      'Plano Open',
    )

    assert.equal(
      result.commercial_context
        .facts[0]
        .contract_version,
      'commercial-fact-v1',
    )

    assert.equal(
      result.commercial_context
        .facts[0]
        .definition,
      null,
    )

    assert.equal(
      result.commercial_context
        .facts[0]
        .validity_status,
      'legacy',
    )

    assert.equal(
      result.commercial_context
        .objection_guides[0]
        .contract_version,
      'commercial-objection-v1',
    )

    assert.equal(
      result.commercial_context
        .objection_guides[0]
        .definition,
      null,
    )
  },
)

test(
  'propaga guia de objeção V2 completo até a entrada do cérebro',
  () => {
    const definition =
      buildCommercialObjectionV2()

    const result =
      buildCompanionDiagnosticInput(
        buildInput({
          commercial_config:
            buildCommercialConfig({
              objection_guides: [
                buildCommercialObjectionRecord(
                  definition,
                ),
              ],
            }),
        }),
      )

    const guide =
      result.commercial_context
        .objection_guides[0]

    assert.equal(
      guide.contract_version,
      'commercial-objection-v2',
    )

    assert.deepEqual(
      guide.definition,
      definition,
    )

    assert.equal(
      guide.definition.category,
      'price',
    )

    assert.equal(
      guide.definition
        .not_objection_when[0],
      'O cliente apenas pergunta qual é o preço.',
    )

    assert.equal(
      guide.definition
        .give_space_when[0],
      'Continuar insistindo aumentaria a resistência sem acrescentar informação útil.',
    )
  },
)

test(
  'rejeita guia de objeção V2 publicado com definição semântica inválida',
  () => {
    const definition =
      buildCommercialObjectionV2({
        objection_when: [],
      })

    assertInputError(
      () =>
        buildCompanionDiagnosticInput(
          buildInput({
            commercial_config:
              buildCommercialConfig({
                objection_guides: [
                  buildCommercialObjectionRecord(
                    definition,
                  ),
                ],
              }),
          }),
        ),
      'INVALID_COMMERCIAL_OBJECTION_DEFINITION',
    )
  },
)

test(
  'rejeita guia de objeção V2 cuja projeção persistida diverge da definição',
  () => {
    const definition =
      buildCommercialObjectionV2()

    assertInputError(
      () =>
        buildCompanionDiagnosticInput(
          buildInput({
            commercial_config:
              buildCommercialConfig({
                objection_guides: [
                  buildCommercialObjectionRecord(
                    definition,
                    {
                      objection:
                        'Objeção divergente',
                    },
                  ),
                ],
              }),
          }),
        ),
      'INVALID_COMMERCIAL_OBJECTION_DEFINITION',
    )
  },
)

test(
  'propaga fato oficial V2 completo e vigente até a entrada do cérebro',
  () => {
    const definition =
      buildCommercialFactV2()

    const result =
      buildCompanionDiagnosticInput(
        buildInput({
          commercial_config:
            buildCommercialConfig({
              facts: [
                buildCommercialFactRecord(
                  definition,
                ),
              ],
            }),
        }),
      )

    const fact =
      result.commercial_context
        .facts[0]

    assert.equal(
      fact.contract_version,
      'commercial-fact-v2',
    )

    assert.deepEqual(
      fact.definition,
      definition,
    )

    assert.equal(
      fact.validity_status,
      'current',
    )

    assert.equal(
      fact.definition
        .source
        .type,
      'internal_policy',
    )
  },
)

test(
  'fato V2 futuro permanece no snapshot mas não é considerado vigente',
  () => {
    const definition =
      buildCommercialFactV2({
        validity: {
          mode:
            'ongoing',

          valid_from:
            '2026-08-05T00:00:00.000Z',

          valid_until:
            null,
        },
      })

    const result =
      buildCompanionDiagnosticInput(
        buildInput({
          commercial_config:
            buildCommercialConfig({
              facts: [
                buildCommercialFactRecord(
                  definition,
                ),
              ],
            }),
        }),
      )

    const fact =
      result.commercial_context
        .facts[0]

    assert.equal(
      fact.validity_status,
      'not_yet_valid',
    )

    assert.deepEqual(
      fact.definition,
      definition,
    )
  },
)

test(
  'fato V2 vencido permanece no snapshot mas recebe validade expirada',
  () => {
    const definition =
      buildCommercialFactV2({
        validity: {
          mode:
            'bounded',

          valid_from:
            '2026-08-01T00:00:00.000Z',

          valid_until:
            '2026-08-04T19:00:00.000Z',
        },
      })

    const result =
      buildCompanionDiagnosticInput(
        buildInput({
          commercial_config:
            buildCommercialConfig({
              facts: [
                buildCommercialFactRecord(
                  definition,
                ),
              ],
            }),
        }),
      )

    const fact =
      result.commercial_context
        .facts[0]

    assert.equal(
      fact.validity_status,
      'expired',
    )

    assert.deepEqual(
      fact.definition,
      definition,
    )
  },
)

test(
  'rejeita fato V2 publicado com definição semântica inválida',
  () => {
    const definition =
      buildCommercialFactV2({
        source: {
          type:
            'system_record',

          reference:
            'Registro oficial.',

          verified_at:
            'data-invalida',
        },
      })

    assertInputError(
      () =>
        buildCompanionDiagnosticInput(
          buildInput({
            commercial_config:
              buildCommercialConfig({
                facts: [
                  buildCommercialFactRecord(
                    definition,
                  ),
                ],
              }),
          }),
        ),
      'INVALID_COMMERCIAL_FACT_DEFINITION',
    )
  },
)

test(
  'rejeita fato V2 cuja projeção persistida diverge da definição oficial',
  () => {
    const definition =
      buildCommercialFactV2()

    assertInputError(
      () =>
        buildCompanionDiagnosticInput(
          buildInput({
            commercial_config:
              buildCommercialConfig({
                facts: [
                  buildCommercialFactRecord(
                    definition,
                    {
                      fact_value:
                        'Valor divergente.',
                    },
                  ),
                ],
              }),
          }),
        ),
      'INVALID_COMMERCIAL_FACT_DEFINITION',
    )
  },
)

test(
  'propaga o método V2 completo e substitui as etapas legadas na entrada do cérebro',
  () => {
    const legacyConfig =
      buildCommercialConfig()

    const definition =
      buildCommercialMethodV2()

    const result =
      buildCompanionDiagnosticInput(
        buildInput({
          commercial_config:
            buildCommercialConfig({
              version: {
                ...legacyConfig.version,

                commercial_method_name:
                  definition.name,

                commercial_method_description:
                  definition.description,

                commercial_method_contract_version:
                  'commercial-method-v2',

                commercial_method_definition:
                  definition,
              },
            }),
        }),
      )

    const method =
      result.commercial_context
        .sales_method

    assert.equal(
      method.configured,
      true,
    )

    assert.equal(
      method.contract_version,
      'commercial-method-v2',
    )

    assert.equal(
      method.name,
      'Método ATO',
    )

    assert.deepEqual(
      method.principles,
      definition.principles,
    )

    assert.deepEqual(
      method.steps.map(
        step => step.name,
      ),
      [
        'Tour',
      ],
    )

    assert.equal(
      method.definition
        .stages[0]
        .sufficient_when[0],
      'As informações disponíveis já permitem orientar com segurança.',
    )

    assert.equal(
      method.definition
        .stages[0]
        .wait_when[0],
      'O cliente assumiu compromisso explícito de retorno.',
    )

    assert.equal(
      method.definition
        .stages[0]
        .stop_asking_when[0],
      'Novas perguntas não alterariam a decisão comercial.',
    )

    assert.equal(
      method.definition
        .stages[0]
        .dimensions[0]
        .key,
      'necessidade',
    )
  },
)


test(
  'propaga o produto V2 completo sem reinterpretar o base_price mutável do catálogo',
  () => {
    const legacyConfig =
      buildCommercialConfig()

    const definition =
      buildCommercialProductV2()

    const legacyProfile =
      legacyConfig
        .product_profiles[0]

    const result =
      buildCompanionDiagnosticInput(
        buildInput({
          commercial_config:
            buildCommercialConfig({
              product_profiles: [
                {
                  ...legacyProfile,

                  commercial_product_contract_version:
                    'commercial-product-v2',

                  commercial_product_definition:
                    definition,

                  indicated_audiences:
                    definition.indicated_audiences,

                  needs_addressed:
                    definition.needs_addressed,

                  benefits:
                    definition.benefits,

                  verified_differentiators:
                    definition.verified_differentiators,

                  limitations:
                    definition.limitations,

                  contract_conditions:
                    definition.contract_conditions,

                  payment_conditions:
                    definition.payment_conditions,

                  allowed_claims:
                    definition.allowed_claims,

                  forbidden_claims:
                    definition.forbidden_claims,
                },
              ],
            }),

          products:
            buildProducts({
              name:
                'Nome alterado no catálogo',

              category:
                'categoria alterada',

              base_price:
                1723.85,
            }),
        }),
      )

    const product =
      result
        .commercial_context
        .products[0]

    assert.equal(
      product.contract_version,
      'commercial-product-v2',
    )

    assert.equal(
      product.definition
        .contract_version,
      'commercial-product-v2',
    )

    assert.equal(
      product.name,
      'Plano Open',
    )

    assert.equal(
      product.category,
      'plano',
    )

    assert.equal(
      product.base_price,
      null,
    )

    assert.equal(
      product.definition
        .pricing
        .model,
      'recurring',
    )

    assert.equal(
      product.definition
        .pricing
        .recurrence,
      'monthly',
    )

    assert.equal(
      product.definition
        .recommend_when[0],
      'A necessidade do cliente corresponde ao que o plano realmente oferece.',
    )

    assert.equal(
      product.definition
        .avoid_when[0],
      'O cliente precisa de algo que o plano não oferece.',
    )
  },
)

test(
  'propaga produto complexo V3 integralmente até a entrada do cérebro',
  () => {
    const legacyConfig =
      buildCommercialConfig()

    const definition =
      buildCommercialProductV3()

    const legacyProfile =
      legacyConfig
        .product_profiles[0]

    const result =
      buildCompanionDiagnosticInput(
        buildInput({
          commercial_config:
            buildCommercialConfig({
              product_profiles: [
                {
                  ...legacyProfile,

                  commercial_product_contract_version:
                    'commercial-product-v3',

                  commercial_product_definition:
                    definition,

                  indicated_audiences:
                    definition.indicated_audiences,

                  needs_addressed:
                    definition.needs_addressed,

                  benefits:
                    definition.benefits,

                  verified_differentiators:
                    definition.verified_differentiators,

                  limitations:
                    definition.limitations,

                  contract_conditions:
                    definition.contract_conditions,

                  payment_conditions:
                    definition.payment_conditions,

                  allowed_claims:
                    definition.allowed_claims,

                  forbidden_claims:
                    definition.forbidden_claims,
                },
              ],
            }),

          products:
            buildProducts({
              name:
                'Nome mutável do catálogo',

              category:
                'categoria mutável',

              base_price:
                99999.99,
            }),
        }),
      )

    const product =
      result
        .commercial_context
        .products[0]

    assert.equal(
      result.analysis_precondition.status,
      'ready',
    )

    assert.equal(
      product.contract_version,
      'commercial-product-v3',
    )

    assert.equal(
      product.definition
        .contract_version,
      'commercial-product-v3',
    )

    assert.equal(
      product.name,
      'Esteira Profissional',
    )

    assert.equal(
      product.category,
      'equipamento',
    )

    assert.equal(
      product.base_price,
      null,
    )

    assert.equal(
      product.definition
        .variants[0]
        .sku,
      'EQ-PRO-001',
    )

    assert.equal(
      product.definition
        .variants[0]
        .pricing
        .amount,
      18990,
    )

    assert.equal(
      product.definition
        .variants[0]
        .compatibility
        .compatible_with[0],
      'Rede elétrica 220V',
    )

    assert.equal(
      product.definition
        .variants[0]
        .specifications[0]
        .value,
      '5',
    )

    assert.equal(
      product.definition
        .variants[0]
        .stock
        .status,
      'available',
    )
  },
)

test(
  'estoque temporário V3 vencido limita a análise sem apagar o snapshot',
  () => {
    const legacyConfig =
      buildCommercialConfig()

    const definition =
      buildCommercialProductV3()

    definition
      .variants[0]
      .stock
      .valid_until =
        '2026-08-04T19:30:00.000Z'

    const legacyProfile =
      legacyConfig
        .product_profiles[0]

    const result =
      buildCompanionDiagnosticInput(
        buildInput({
          commercial_config:
            buildCommercialConfig({
              product_profiles: [
                {
                  ...legacyProfile,

                  commercial_product_contract_version:
                    'commercial-product-v3',

                  commercial_product_definition:
                    definition,

                  indicated_audiences:
                    definition.indicated_audiences,

                  needs_addressed:
                    definition.needs_addressed,

                  benefits:
                    definition.benefits,

                  verified_differentiators:
                    definition.verified_differentiators,

                  limitations:
                    definition.limitations,

                  contract_conditions:
                    definition.contract_conditions,

                  payment_conditions:
                    definition.payment_conditions,

                  allowed_claims:
                    definition.allowed_claims,

                  forbidden_claims:
                    definition.forbidden_claims,
                },
              ],
            }),
        }),
      )

    assert.equal(
      result.analysis_precondition.status,
      'limited',
    )

    assert.deepEqual(
      result.analysis_precondition.limitations,
      [
        'product_stock_information_stale',
      ],
    )

    assert.equal(
      result
        .commercial_context
        .products[0]
        .definition
        .variants[0]
        .stock
        .valid_until,
      '2026-08-04T19:30:00.000Z',
    )
  },
)

test(
  'rejeita produto V3 publicado com definição semântica inválida',
  () => {
    const legacyConfig =
      buildCommercialConfig()

    const invalidDefinition =
      buildCommercialProductV3()

    invalidDefinition
      .variants[0]
      .stock
      .quantity = 0

    assertInputError(
      () =>
        buildCompanionDiagnosticInput(
          buildInput({
            commercial_config:
              buildCommercialConfig({
                product_profiles: [
                  {
                    ...legacyConfig
                      .product_profiles[0],

                    commercial_product_contract_version:
                      'commercial-product-v3',

                    commercial_product_definition:
                      invalidDefinition,
                  },
                ],
              }),
          }),
        ),
      'INVALID_COMMERCIAL_PRODUCT_DEFINITION',
    )
  },
)

test(
  'rejeita produto V2 publicado com definição semântica inválida',
  () => {
    const legacyConfig =
      buildCommercialConfig()

    const invalidDefinition =
      buildCommercialProductV2()

    invalidDefinition
      .pricing
      .recurrence = null

    assertInputError(
      () =>
        buildCompanionDiagnosticInput(
          buildInput({
            commercial_config:
              buildCommercialConfig({
                product_profiles: [
                  {
                    ...legacyConfig
                      .product_profiles[0],

                    commercial_product_contract_version:
                      'commercial-product-v2',

                    commercial_product_definition:
                      invalidDefinition,
                  },
                ],
              }),
          }),
        ),
      'INVALID_COMMERCIAL_PRODUCT_DEFINITION',
    )
  },
)

test(
  'ordena mensagens e exclui estados apagados da evidência',
  () => {
    const result =
      buildCompanionDiagnosticInput(
        buildInput({
          messages: [
            buildMessage({
              id: '3',
              message_key:
                'message-003',
              occurred_at:
                '2026-08-04T18:03:00.000Z',
            }),

            buildMessage({
              id: '1',
              message_key:
                'message-001',
              occurred_at:
                '2026-08-04T18:01:00.000Z',
            }),

            buildMessage({
              id: '2',
              message_key:
                'message-002',
              occurred_at:
                '2026-08-04T18:02:00.000Z',
              is_deleted: true,
              text_content:
                'Conteúdo removido',
            }),
          ],
        }),
      )

    assert.deepEqual(
      result.conversation
        .active_message_ids,
      ['1', '3'],
    )

    assert.deepEqual(
      result.conversation
        .excluded_message_ids,
      ['2'],
    )

    assert.deepEqual(
      result.conversation.messages.map(
        (message) =>
          message.sequence,
      ),
      [1, 2],
    )
  },
)

test(
  'áudio sem transcrição bloqueia quando não existe outro conteúdo utilizável',
  () => {
    const result =
      buildCompanionDiagnosticInput(
        buildInput({
          messages: [
            buildMessage({
              content_type: 'audio',
              text_content: null,
              audio_transcription: null,
            }),
          ],
        }),
      )

    assert.equal(
      result.analysis_precondition.status,
      'blocked',
    )

    assert.deepEqual(
      result.analysis_precondition.limitations,
      [
        'audio_without_transcription',
        'conversation_context_insufficient',
      ],
    )
  },
)

test(
  'áudio sem transcrição limita quando existem mensagens de texto utilizáveis',
  () => {
    const result =
      buildCompanionDiagnosticInput(
        buildInput({
          messages: [
            buildMessage(),

            buildMessage({
              id: '2',
              message_key:
                'message-002',
              content_type: 'audio',
              text_content: null,
              audio_transcription: null,
              occurred_at:
                '2026-08-04T18:01:00.000Z',
            }),
          ],
        }),
      )

    assert.equal(
      result.analysis_precondition.status,
      'limited',
    )

    assert.deepEqual(
      result.analysis_precondition.limitations,
      [
        'audio_without_transcription',
      ],
    )
  },
)

test(
  'ausência de configuração comercial limita método e produto sem bloquear a conversa',
  () => {
    const result =
      buildCompanionDiagnosticInput(
        buildInput({
          commercial_config: null,
          products: [],
        }),
      )

    assert.equal(
      result.analysis_precondition.status,
      'limited',
    )

    assert.deepEqual(
      result.analysis_precondition.limitations,
      [
        'method_not_configured',
        'product_information_missing',
      ],
    )

    assert.equal(
      result.commercial_context.configured,
      false,
    )
  },
)

test(
  'rejeita configuração comercial pertencente a outra empresa',
  () => {
    assertInputError(
      () =>
        buildCompanionDiagnosticInput(
          buildInput({
            commercial_config:
              buildCommercialConfig({
                version: {
                  ...buildCommercialConfig()
                    .version,

                  company_id:
                    '923e4567-e89b-42d3-a456-426614174000',
                },
              }),
          }),
        ),
      'COMPANY_SCOPE_VIOLATION',
    )
  },
)

test(
  'rejeita produto do catálogo vinculado a outra empresa',
  () => {
    assertInputError(
      () =>
        buildCompanionDiagnosticInput(
          buildInput({
            products:
              buildProducts({
                company_id:
                  '923e4567-e89b-42d3-a456-426614174000',
              }),
          }),
        ),
      'COMPANY_SCOPE_VIOLATION',
    )
  },
)

test(
  'rejeita mais de um estado canônico para a mesma message_key',
  () => {
    assertInputError(
      () =>
        buildCompanionDiagnosticInput(
          buildInput({
            messages: [
              buildMessage(),

              buildMessage({
                id: '2',
                version: 2,
              }),
            ],
          }),
        ),
      'DUPLICATED_MESSAGE_KEY',
    )
  },
)

test(
  'conversa sem mensagens utilizáveis fica bloqueada',
  () => {
    const result =
      buildCompanionDiagnosticInput(
        buildInput({
          messages: [],
        }),
      )

    assert.equal(
      result.analysis_precondition.status,
      'blocked',
    )

    assert.deepEqual(
      result.analysis_precondition.limitations,
      [
        'conversation_context_insufficient',
      ],
    )
  },
)
