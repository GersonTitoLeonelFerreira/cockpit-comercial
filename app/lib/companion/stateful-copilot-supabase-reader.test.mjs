import assert from 'node:assert/strict'
import test from 'node:test'

import {
  STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION,
} from './stateful-commercial-state.ts'

import {
  STATEFUL_COPILOT_STATE_SELECT_COLUMNS,
  STATEFUL_COPILOT_STATE_TABLE,
  StatefulCopilotStateReadError,
  createStatefulCopilotSupabaseReader,
} from './stateful-copilot-supabase-reader.ts'

const companyId =
  '10000000-0000-4000-8000-000000000001'

const cycleId =
  '30000000-0000-4000-8000-000000000001'

const conversationKey =
  'whatsapp:+5547999990001'

function buildState({
  version = 2,
  updatedAt =
    '2026-08-06T19:50:00-03:00',
  evidenceMessageId =
    'm2',
} = {}) {
  return {
    contract_version:
      STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION,

    cycle_id:
      cycleId,

    version,

    commercial_role:
      'buyer',

    current_moment: {
      summary:
        'O cliente está avaliando a solução.',

      evidence_message_ids: [
        evidenceMessageId,
      ],
    },

    current_priority: {
      summary:
        'Conduzir a próxima etapa comercial.',

      evidence_message_ids: [
        evidenceMessageId,
      ],
    },

    last_analyzed_message_ids: [
      evidenceMessageId,
    ],

    last_evidence_message_ids: [
      evidenceMessageId,
    ],

    facts: [],
    needs: [],
    open_loops: [],
    objections: [],
    commitments: [],
    signals: [],
    uncertainties: [],

    created_at:
      '2026-08-06T19:00:00-03:00',

    updated_at:
      updatedAt,
  }
}

function buildRow(
  overrides = {},
) {
  return {
    id:
      '50000000-0000-4000-8000-000000000001',

    company_id:
      companyId,

    cycle_id:
      cycleId,

    conversation_key:
      conversationKey,

    state_version:
      2,

    state_contract_version:
      STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION,

    state_updated_at:
      '2026-08-06T22:50:00.000Z',

    state_snapshot:
      buildState(),

    persisted_at:
      '2026-08-06T22:50:02.000Z',

    ...overrides,
  }
}

function buildRequest(
  overrides = {},
) {
  return {
    company_id:
      companyId,

    cycle_id:
      cycleId,

    conversation_key:
      conversationKey,

    known_message_ids: [
      'm1',
      'm2',
    ],

    active_message_ids: [
      'm2',
    ],

    ...overrides,
  }
}

function createMockClient({
  data = null,
  error = null,
  thrownError = null,
} = {}) {
  const calls = {
    table:
      null,

    columns:
      null,

    filters:
      [],

    maybeSingle:
      0,
  }

  const query = {
    eq(
      column,
      value,
    ) {
      calls.filters.push({
        column,
        value,
      })

      return query
    },

    async maybeSingle() {
      calls.maybeSingle += 1

      if (thrownError) {
        throw thrownError
      }

      return {
        data,
        error,
      }
    },
  }

  const client = {
    from(tableName) {
      calls.table =
        tableName

      return {
        select(columns) {
          calls.columns =
            columns

          return query
        },
      }
    },
  }

  return {
    client,
    calls,
  }
}

test(
  'retorna estado ausente sem fabricar memória comercial',
  async () => {
    const mock =
      createMockClient({
        data:
          null,
      })

    const reader =
      createStatefulCopilotSupabaseReader({
        client:
          mock.client,
      })

    const result =
      await reader(
        buildRequest({
          known_message_ids:
            [],

          active_message_ids:
            [],
        }),
      )

    assert.deepEqual(
      result,
      {
        mode:
          'missing',

        found:
          false,

        company_id:
          companyId,

        cycle_id:
          cycleId,

        conversation_key:
          conversationKey,

        state_record_id:
          null,

        state_version:
          null,

        state_updated_at:
          null,

        persisted_at:
          null,

        state:
          null,
      },
    )

    assert.equal(
      mock.calls.table,
      STATEFUL_COPILOT_STATE_TABLE,
    )

    assert.equal(
      mock.calls.columns,
      STATEFUL_COPILOT_STATE_SELECT_COLUMNS,
    )

    assert.deepEqual(
      mock.calls.filters,
      [
        {
          column:
            'company_id',

          value:
            companyId,
        },
        {
          column:
            'cycle_id',

          value:
            cycleId,
        },
        {
          column:
            'conversation_key',

          value:
            conversationKey,
        },
      ],
    )

    assert.equal(
      mock.calls.maybeSingle,
      1,
    )
  },
)

test(
  'carrega e normaliza o estado comercial persistido',
  async () => {
    const row =
      buildRow()

    const mock =
      createMockClient({
        data:
          row,
      })

    const reader =
      createStatefulCopilotSupabaseReader({
        client:
          mock.client,
      })

    const result =
      await reader(
        buildRequest(),
      )

    assert.equal(
      result.mode,
      'found',
    )

    assert.equal(
      result.found,
      true,
    )

    assert.equal(
      result.state_record_id,
      row.id,
    )

    assert.equal(
      result.state_version,
      2,
    )

    assert.equal(
      result.state.contract_version,
      STATEFUL_COMMERCIAL_STATE_CONTRACT_VERSION,
    )

    assert.equal(
      result.state.current_moment.summary,
      'O cliente está avaliando a solução.',
    )

    assert.notEqual(
      result.state,
      row.state_snapshot,
    )

    result.state.current_moment.summary =
      'Alteração local do consumidor'

    assert.equal(
      row.state_snapshot.current_moment.summary,
      'O cliente está avaliando a solução.',
    )
  },
)

test(
  'aceita horários equivalentes com fusos diferentes',
  async () => {
    const mock =
      createMockClient({
        data:
          buildRow({
            state_updated_at:
              '2026-08-06T22:50:00.000Z',

            state_snapshot:
              buildState({
                updatedAt:
                  '2026-08-06T19:50:00-03:00',
              }),
          }),
      })

    const reader =
      createStatefulCopilotSupabaseReader({
        client:
          mock.client,
      })

    const result =
      await reader(
        buildRequest(),
      )

    assert.equal(
      result.mode,
      'found',
    )
  },
)

test(
  'rejeita estado retornado para outro escopo',
  async () => {
    const mock =
      createMockClient({
        data:
          buildRow({
            company_id:
              '10000000-0000-4000-8000-000000000099',
          }),
      })

    const reader =
      createStatefulCopilotSupabaseReader({
        client:
          mock.client,
      })

    await assert.rejects(
      () =>
        reader(
          buildRequest(),
        ),
      (error) => {
        assert.ok(
          error instanceof
            StatefulCopilotStateReadError,
        )

        assert.equal(
          error.code,
          'PERSISTED_STATE_SCOPE_MISMATCH',
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
  'rejeita versão da linha diferente da fotografia',
  async () => {
    const mock =
      createMockClient({
        data:
          buildRow({
            state_version:
              3,
          }),
      })

    const reader =
      createStatefulCopilotSupabaseReader({
        client:
          mock.client,
      })

    await assert.rejects(
      () =>
        reader(
          buildRequest(),
        ),
      (error) => {
        assert.ok(
          error instanceof
            StatefulCopilotStateReadError,
        )

        assert.equal(
          error.code,
          'PERSISTED_STATE_VERSION_MISMATCH',
        )

        return true
      },
    )
  },
)

test(
  'rejeita fotografia que referencia mensagem desconhecida',
  async () => {
    const mock =
      createMockClient({
        data:
          buildRow({
            state_snapshot:
              buildState({
                evidenceMessageId:
                  'mensagem-inexistente',
              }),
          }),
      })

    const reader =
      createStatefulCopilotSupabaseReader({
        client:
          mock.client,
      })

    await assert.rejects(
      () =>
        reader(
          buildRequest(),
        ),
      (error) => {
        assert.ok(
          error instanceof
            StatefulCopilotStateReadError,
        )

        assert.equal(
          error.code,
          'INVALID_PERSISTED_STATE',
        )

        assert.equal(
          error.message.includes(
            'mensagem-inexistente',
          ),
          false,
        )

        return true
      },
    )
  },
)

test(
  'rejeita contrato persistido incompatível',
  async () => {
    const mock =
      createMockClient({
        data:
          buildRow({
            state_contract_version:
              'contrato-antigo',
          }),
      })

    const reader =
      createStatefulCopilotSupabaseReader({
        client:
          mock.client,
      })

    await assert.rejects(
      () =>
        reader(
          buildRequest(),
        ),
      (error) => {
        assert.ok(
          error instanceof
            StatefulCopilotStateReadError,
        )

        assert.equal(
          error.code,
          'PERSISTED_STATE_CONTRACT_MISMATCH',
        )

        return true
      },
    )
  },
)

test(
  'classifica indisponibilidade transitória sem expor detalhes',
  async () => {
    const mock =
      createMockClient({
        error: {
          code:
            'PGRST001',

          status:
            503,

          message:
            'host interno e senha do banco',
        },
      })

    const reader =
      createStatefulCopilotSupabaseReader({
        client:
          mock.client,
      })

    await assert.rejects(
      () =>
        reader(
          buildRequest(),
        ),
      (error) => {
        assert.ok(
          error instanceof
            StatefulCopilotStateReadError,
        )

        assert.equal(
          error.code,
          'STATEFUL_STATE_READ_UNAVAILABLE',
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
            'senha',
          ),
          false,
        )

        return true
      },
    )
  },
)

test(
  'classifica rejeição permanente sem expor a mensagem do banco',
  async () => {
    const mock =
      createMockClient({
        error: {
          code:
            '42501',

          status:
            403,

          message:
            'detalhes privados da política',
        },
      })

    const reader =
      createStatefulCopilotSupabaseReader({
        client:
          mock.client,
      })

    await assert.rejects(
      () =>
        reader(
          buildRequest(),
        ),
      (error) => {
        assert.ok(
          error instanceof
            StatefulCopilotStateReadError,
        )

        assert.equal(
          error.code,
          'STATEFUL_STATE_READ_REJECTED',
        )

        assert.equal(
          error.retryable,
          false,
        )

        assert.equal(
          error.message.includes(
            'política',
          ),
          false,
        )

        return true
      },
    )
  },
)

test(
  'falha de transporte é classificada como temporária',
  async () => {
    const mock =
      createMockClient({
        thrownError:
          new Error(
            'conexão recusada pelo host interno',
          ),
      })

    const reader =
      createStatefulCopilotSupabaseReader({
        client:
          mock.client,
      })

    await assert.rejects(
      () =>
        reader(
          buildRequest(),
        ),
      (error) => {
        assert.ok(
          error instanceof
            StatefulCopilotStateReadError,
        )

        assert.equal(
          error.code,
          'STATEFUL_STATE_READ_UNAVAILABLE',
        )

        assert.equal(
          error.retryable,
          true,
        )

        assert.equal(
          error.message.includes(
            'host interno',
          ),
          false,
        )

        return true
      },
    )
  },
)

test(
  'rejeita resposta em lista porque maybeSingle deve retornar objeto único',
  async () => {
    const mock =
      createMockClient({
        data: [
          buildRow(),
        ],
      })

    const reader =
      createStatefulCopilotSupabaseReader({
        client:
          mock.client,
      })

    await assert.rejects(
      () =>
        reader(
          buildRequest(),
        ),
      (error) => {
        assert.ok(
          error instanceof
            StatefulCopilotStateReadError,
        )

        assert.equal(
          error.code,
          'INVALID_STATEFUL_STATE_READ_RESPONSE',
        )

        return true
      },
    )
  },
)
