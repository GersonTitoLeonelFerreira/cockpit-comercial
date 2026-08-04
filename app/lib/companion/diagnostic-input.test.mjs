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
