import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CompanionDiagnosticSnapshotError,
  loadCompanionDiagnosticSnapshot,
} from '../server/companion-diagnostic-snapshot.ts'

const COMPANY_ID =
  '40fb91ee-f998-4d98-acdf-7d0794369ccf'

const CYCLE_ID =
  '123e4567-e89b-42d3-a456-426614174000'

const PREVIOUS_CYCLE_ID =
  '923e4567-e89b-42d3-a456-426614174000'

const CONFIG_VERSION_ID =
  '223e4567-e89b-42d3-a456-426614174000'

const PRODUCT_ID =
  '323e4567-e89b-42d3-a456-426614174000'

function ok(data) {
  return {
    data,
    error: null,
  }
}

function createFakeClient(
  tableResults,
) {
  const calls = []

  const client = {
    from(table) {
      if (
        !Object.prototype
          .hasOwnProperty.call(
            tableResults,
            table,
          )
      ) {
        throw new Error(
          `Consulta inesperada: ${table}`,
        )
      }

      const call = {
        table,
        operations: [],
      }

      calls.push(call)

      const resolveResult = () => {
        const configuredResult =
          tableResults[table]

        return typeof configuredResult ===
          'function'
          ? configuredResult(call)
          : configuredResult
      }

      const builder = {
        select(columns) {
          call.operations.push({
            type: 'select',
            columns,
          })

          return builder
        },

        eq(column, value) {
          call.operations.push({
            type: 'eq',
            column,
            value,
          })

          return builder
        },

        in(column, values) {
          call.operations.push({
            type: 'in',
            column,
            values,
          })

          return builder
        },

        order(column, options) {
          call.operations.push({
            type: 'order',
            column,
            options,
          })

          return builder
        },

        limit(value) {
          call.operations.push({
            type: 'limit',
            value,
          })

          return builder
        },

        maybeSingle() {
          call.operations.push({
            type: 'maybeSingle',
          })

          return Promise.resolve(
            resolveResult(),
          )
        },

        then(onFulfilled, onRejected) {
          return Promise.resolve(
            resolveResult(),
          ).then(
            onFulfilled,
            onRejected,
          )
        },
      }

      return builder
    },
  }

  return {
    client,
    calls,
  }
}

function buildCycle(
  overrides = {},
) {
  return {
    id: CYCLE_ID,
    company_id: COMPANY_ID,
    status: 'respondeu',
    ...overrides,
  }
}

function buildMessage(
  overrides = {},
) {
  return {
    id: '11',
    company_id: COMPANY_ID,
    cycle_id: CYCLE_ID,
    conversation_key:
      'whatsapp:5511999999999',
    message_key:
      'message-001',
    version: 2,
    direction: 'incoming',
    occurred_at:
      '2026-08-04T18:00:00.000Z',
    observed_at:
      '2026-08-04T18:00:02.000Z',
    content_type: 'text',
    text_content:
      'Quero conhecer os planos.',
    audio_transcription: null,
    is_deleted: false,
    ...overrides,
  }
}

function buildVersion(
  overrides = {},
) {
  return {
    id: CONFIG_VERSION_ID,
    company_id: COMPANY_ID,
    version_number: 1,
    contract_version:
      'phase-2-v1',
    status: 'published',

    business_description:
      'Academia com atendimento consultivo.',

    target_audience:
      'Pessoas interessadas em atividade física.',

    value_proposition:
      'Estrutura e acompanhamento.',

    commercial_method_name:
      'Método Consultivo',

    commercial_method_description:
      'Entender antes de apresentar.',

    communication_tone:
      'Direto e acolhedor.',

    required_behaviors: [
      'Responder perguntas.',
    ],

    prohibited_behaviors: [
      'Inventar condições.',
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

    ...overrides,
  }
}

function buildFullTables(
  overrides = {},
) {
  return {
    sales_cycles:
      ok(buildCycle()),

    conversation_message_reconciliation_state:
      ok([
        {
          current_message_id:
            '11',
          message_key:
            'message-001',
        },
      ]),

    conversation_messages:
      ok([
        buildMessage(),
      ]),

    company_commercial_config_versions:
      ok([
        buildVersion(),
      ]),

    company_commercial_method_steps:
      ok([
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
            'Qual é seu objetivo?',
          ],

          is_required: true,

          created_at:
            '2026-08-01T10:00:00.000Z',

          updated_at:
            '2026-08-01T10:00:00.000Z',
        },
      ]),

    company_commercial_product_profiles:
      ok([
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
            'Condicionamento',
          ],

          benefits: [
            'Estrutura completa',
          ],

          verified_differentiators: [
            'Acompanhamento',
          ],

          limitations: [],
          contract_conditions: [],
          payment_conditions: [],
          allowed_claims: [],
          forbidden_claims: [],

          created_at:
            '2026-08-01T10:00:00.000Z',

          updated_at:
            '2026-08-01T10:00:00.000Z',
        },
      ]),

    company_commercial_facts:
      ok([]),

    company_commercial_objection_guides:
      ok([]),

    products:
      ok([
        {
          id: PRODUCT_ID,
          company_id:
            COMPANY_ID,
          name: 'Plano Open',
          category: 'plano',
          base_price: 199.9,
          active: true,
        },
      ]),

    ...overrides,
  }
}

async function loadSnapshot(
  tableOverrides = {},
) {
  const {
    client,
    calls,
  } = createFakeClient(
    buildFullTables(
      tableOverrides,
    ),
  )

  const snapshot =
    await loadCompanionDiagnosticSnapshot({
      admin: client,
      company_id:
        COMPANY_ID,
      cycle_id:
        CYCLE_ID,
      conversation_key:
        'whatsapp:5511999999999',
      reference_time:
        '2026-08-04T20:00:00.000Z',
    })

  return {
    snapshot,
    calls,
  }
}

function assertSnapshotError(
  callback,
  expectedCode,
) {
  return assert.rejects(
    callback,
    (error) => {
      assert.ok(
        error instanceof
          CompanionDiagnosticSnapshotError,
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
  'carrega a fotografia canônica completa do diagnóstico',
  async () => {
    const {
      snapshot,
      calls,
    } = await loadSnapshot()

    assert.equal(
      snapshot.input
        .analysis_precondition
        .status,
      'ready',
    )

    assert.equal(
      snapshot.input
        .current_crm_status,
      'respondeu',
    )

    assert.deepEqual(
      snapshot.input
        .conversation
        .active_message_ids,
      ['11'],
    )

    assert.equal(
      snapshot.input
        .commercial_context
        .products[0].name,
      'Plano Open',
    )

    assert.equal(
      snapshot.source
        .canonical_message_count,
      1,
    )

    assert.equal(
      snapshot.source
        .commercial_config_version_id,
      CONFIG_VERSION_ID,
    )

    const messageCall =
      calls.find(
        (call) =>
          call.table ===
          'conversation_messages',
      )

    const inOperation =
      messageCall.operations.find(
        (operation) =>
          operation.type === 'in',
      )

    assert.deepEqual(
      inOperation,
      {
        type: 'in',
        column: 'id',
        values: ['11'],
      },
    )

    const productProfileCall =
      calls.find(
        (call) =>
          call.table ===
          'company_commercial_product_profiles',
      )

    assert.ok(
      productProfileCall,
    )

    const productProfileSelect =
      productProfileCall.operations.find(
        (operation) =>
          operation.type === 'select',
      )

    assert.ok(
      productProfileSelect,
    )

    assert.ok(
      productProfileSelect.columns.includes(
        'commercial_product_contract_version',
      ),
    )

    assert.ok(
      productProfileSelect.columns.includes(
        'commercial_product_definition',
      ),
    )
  },
)

test(
  'usa somente a versão apontada pelo estado canônico',
  async () => {
    const {
      snapshot,
    } = await loadSnapshot({
      conversation_messages:
        ok([
          buildMessage({
            id: '21',
            message_key:
              'message-001',
            version: 1,
            text_content:
              'Versão antiga',
          }),
        ]),

      conversation_message_reconciliation_state:
        ok([
          {
            current_message_id:
              '21',
            message_key:
              'message-001',
          },
        ]),
    })

    assert.equal(
      snapshot.input
        .conversation
        .messages[0]
        .id,
      '21',
    )

    assert.equal(
      snapshot.input
        .conversation
        .messages[0]
        .version,
      1,
    )
  },
)

test(
  'ignora estados canônicos de outros ciclos da mesma conversa',
  async () => {
    const {
      snapshot,
      calls,
    } = await loadSnapshot({
      conversation_message_reconciliation_state:
        ok([
          {
            current_message_id:
              '11',
            message_key:
              'message-001',
          },

          {
            current_message_id:
              '12',
            message_key:
              'message-previous-cycle',
          },
        ]),

      conversation_messages:
        ok([
          buildMessage(),

          buildMessage({
            id: '12',

            cycle_id:
              PREVIOUS_CYCLE_ID,

            message_key:
              'message-previous-cycle',

            version: 1,

            occurred_at:
              '2026-07-01T18:00:00.000Z',

            observed_at:
              '2026-07-01T18:00:02.000Z',

            text_content:
              'Mensagem pertencente ao ciclo anterior.',
          }),
        ]),
    })

    assert.deepEqual(
      snapshot.input
        .conversation
        .active_message_ids,
      ['11'],
    )

    assert.equal(
      snapshot.source
        .canonical_message_count,
      1,
    )

    const messageCall =
      calls.find(
        (call) =>
          call.table ===
          'conversation_messages',
      )

    const inOperation =
      messageCall.operations.find(
        (operation) =>
          operation.type === 'in',
      )

    assert.deepEqual(
      inOperation,
      {
        type: 'in',
        column: 'id',
        values: [
          '11',
          '12',
        ],
      },
    )

    const prematureCycleFilter =
      messageCall.operations.find(
        (operation) =>
          operation.type === 'eq' &&
          operation.column ===
            'cycle_id',
      )

    assert.equal(
      prematureCycleFilter,
      undefined,
    )
  },
)

test(
  'mensagem canônica apagada não sustenta evidência',
  async () => {
    const {
      snapshot,
    } = await loadSnapshot({
      conversation_messages:
        ok([
          buildMessage({
            is_deleted: true,
            text_content: null,
          }),
        ]),
    })

    assert.equal(
      snapshot.input
        .analysis_precondition
        .status,
      'blocked',
    )

    assert.deepEqual(
      snapshot.input
        .conversation
        .active_message_ids,
      [],
    )

    assert.deepEqual(
      snapshot.input
        .conversation
        .excluded_message_ids,
      ['11'],
    )
  },
)

test(
  'ausência de configuração publicada limita método e produto',
  async () => {
    const {
      client,
    } = createFakeClient({
      sales_cycles:
        ok(buildCycle()),

      conversation_message_reconciliation_state:
        ok([
          {
            current_message_id:
              '11',
            message_key:
              'message-001',
          },
        ]),

      conversation_messages:
        ok([
          buildMessage(),
        ]),

      company_commercial_config_versions:
        ok([]),
    })

    const snapshot =
      await loadCompanionDiagnosticSnapshot({
        admin: client,
        company_id:
          COMPANY_ID,
        cycle_id:
          CYCLE_ID,
        conversation_key:
          'whatsapp:5511999999999',
        reference_time:
          '2026-08-04T20:00:00.000Z',
      })

    assert.equal(
      snapshot.input
        .analysis_precondition
        .status,
      'limited',
    )

    assert.deepEqual(
      snapshot.input
        .analysis_precondition
        .limitations,
      [
        'method_not_configured',
        'product_information_missing',
      ],
    )
  },
)

test(
  'rejeita estado canônico que aponta para mensagem inexistente',
  async () => {
    const {
      client,
    } = createFakeClient(
      buildFullTables({
        conversation_messages:
          ok([]),
      }),
    )

    await assertSnapshotError(
      () =>
        loadCompanionDiagnosticSnapshot({
          admin: client,
          company_id:
            COMPANY_ID,
          cycle_id:
            CYCLE_ID,
          conversation_key:
            'whatsapp:5511999999999',
          reference_time:
            '2026-08-04T20:00:00.000Z',
        }),

      'SNAPSHOT_STATE_INCONSISTENT',
    )
  },
)

test(
  'rejeita mensagem carregada de outra empresa',
  async () => {
    const {
      client,
    } = createFakeClient(
      buildFullTables({
        conversation_messages:
          ok([
            buildMessage({
              company_id:
                '923e4567-e89b-42d3-a456-426614174000',
            }),
          ]),
      }),
    )

    await assertSnapshotError(
      () =>
        loadCompanionDiagnosticSnapshot({
          admin: client,
          company_id:
            COMPANY_ID,
          cycle_id:
            CYCLE_ID,
          conversation_key:
            'whatsapp:5511999999999',
          reference_time:
            '2026-08-04T20:00:00.000Z',
        }),

      'SNAPSHOT_SCOPE_VIOLATION',
    )
  },
)

test(
  'rejeita mais de uma configuração comercial publicada',
  async () => {
    const {
      client,
    } = createFakeClient(
      buildFullTables({
        company_commercial_config_versions:
          ok([
            buildVersion(),

            buildVersion({
              id:
                'a23e4567-e89b-42d3-a456-426614174000',
              version_number: 2,
            }),
          ]),
      }),
    )

    await assertSnapshotError(
      () =>
        loadCompanionDiagnosticSnapshot({
          admin: client,
          company_id:
            COMPANY_ID,
          cycle_id:
            CYCLE_ID,
          conversation_key:
            'whatsapp:5511999999999',
          reference_time:
            '2026-08-04T20:00:00.000Z',
        }),

      'SNAPSHOT_MULTIPLE_PUBLISHED_CONFIGS',
    )
  },
)

test(
  'classifica falha de consulta sem expor mensagem interna',
  async () => {
    const {
      client,
    } = createFakeClient({
      sales_cycles: {
        data: null,

        error: {
          message:
            'detalhe interno do banco',
        },
      },
    })

    await assert.rejects(
      () =>
        loadCompanionDiagnosticSnapshot({
          admin: client,
          company_id:
            COMPANY_ID,
          cycle_id:
            CYCLE_ID,
          conversation_key:
            'whatsapp:5511999999999',
          reference_time:
            '2026-08-04T20:00:00.000Z',
        }),

      (error) => {
        assert.ok(
          error instanceof
            CompanionDiagnosticSnapshotError,
        )

        assert.equal(
          error.code,
          'SNAPSHOT_QUERY_FAILED',
        )

        assert.equal(
          error.retryable,
          true,
        )

        assert.equal(
          error.message.includes(
            'detalhe interno do banco',
          ),
          false,
        )

        return true
      },
    )
  },
)

test(
  'rejeita ciclo pertencente a outro escopo',
  async () => {
    const {
      client,
    } = createFakeClient({
      sales_cycles:
        ok(
          buildCycle({
            company_id:
              '923e4567-e89b-42d3-a456-426614174000',
          }),
        ),
    })

    await assertSnapshotError(
      () =>
        loadCompanionDiagnosticSnapshot({
          admin: client,
          company_id:
            COMPANY_ID,
          cycle_id:
            CYCLE_ID,
          conversation_key:
            'whatsapp:5511999999999',
          reference_time:
            '2026-08-04T20:00:00.000Z',
        }),

      'SNAPSHOT_SCOPE_VIOLATION',
    )
  },
)
