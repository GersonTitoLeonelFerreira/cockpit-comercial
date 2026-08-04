import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CompanionDiagnosticPreviewError,
  runCompanionDiagnosticPreview,
} from '../server/companion-diagnostic-preview.ts'

const COMPANY_ID =
  '40fb91ee-f998-4d98-acdf-7d0794369ccf'

const USER_ID =
  '123e4567-e89b-42d3-a456-426614174000'

const OTHER_USER_ID =
  '223e4567-e89b-42d3-a456-426614174000'

const CYCLE_ID =
  '323e4567-e89b-42d3-a456-426614174000'

const CONVERSATION_KEY =
  'whatsapp:5511999999999'

const TOKEN = {
  sub:
    USER_ID,

  company_id:
    COMPANY_ID,

  role:
    'member',

  iat:
    1785870000,

  exp:
    1785873600,
}

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
        const configured =
          tableResults[table]

        return typeof configured ===
          'function'
          ? configured(call)
          : configured
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

        maybeSingle() {
          call.operations.push({
            type: 'maybeSingle',
          })

          return Promise.resolve(
            resolveResult(),
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

function buildMembership(
  overrides = {},
) {
  return {
    company_id:
      COMPANY_ID,

    user_id:
      USER_ID,

    role:
      'member',

    is_active:
      true,

    ...overrides,
  }
}

function buildCycle(
  overrides = {},
) {
  return {
    id:
      CYCLE_ID,

    company_id:
      COMPANY_ID,

    owner_user_id:
      USER_ID,

    status:
      'respondeu',

    ...overrides,
  }
}

function buildEngineResult() {
  return {
    engine_version:
      'phase-5-engine-v1',

    source: {
      company_id:
        COMPANY_ID,

      cycle_id:
        CYCLE_ID,

      conversation_key:
        CONVERSATION_KEY,

      canonical_message_count:
        1,

      excluded_message_count:
        0,

      commercial_config_version_id:
        null,

      commercial_config_version_number:
        null,
    },

    diagnostic: {
      contract_version:
        'phase-1-v1',

      analysis_status:
        'limited',

      analysis_limitations: [
        'product_information_missing',
      ],
    },

    execution: {
      mode:
        'model',

      provider:
        'openai',

      model:
        'test-model',

      request_id:
        'req-test',

      usage:
        null,
    },
  }
}

function createPreviewDependencies() {
  const engineCalls = []

  return {
    engineCalls,

    dependencies: {
      async run_engine(args) {
        engineCalls.push(args)

        return buildEngineResult()
      },
    },
  }
}

function runPreview({
  membership =
    buildMembership(),

  cycle =
    buildCycle(),

  token =
    TOKEN,

  tableOverrides = {},

  dependencies,
} = {}) {
  const {
    client,
    calls,
  } = createFakeClient({
    company_memberships:
      ok(membership),

    sales_cycles:
      ok(cycle),

    ...tableOverrides,
  })

  const promise =
    runCompanionDiagnosticPreview({
      admin:
        client,

      token,

      cycle_id:
        CYCLE_ID,

      conversation_key:
        CONVERSATION_KEY,

      reference_time:
        '2026-08-04T21:00:00.000Z',

      model_options: {
        api_key:
          'chave-de-teste',

        model:
          'modelo-de-teste',
      },

      dependencies,
    })

  return {
    promise,
    calls,
  }
}

function assertPreviewError(
  callback,
  expectedCode,
) {
  return assert.rejects(
    callback,
    (error) => {
      assert.ok(
        error instanceof
          CompanionDiagnosticPreviewError,
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
  'membro ativo pode visualizar o ciclo da própria carteira',
  async () => {
    const {
      dependencies,
      engineCalls,
    } = createPreviewDependencies()

    const {
      promise,
    } = runPreview({
      dependencies,
    })

    const result =
      await promise

    assert.deepEqual(
      result.preview,
      {
        read_only: true,
        persisted: false,
        crm_changed: false,
        cursor_advanced: false,
      },
    )

    assert.equal(
      result.engine
        .engine_version,
      'phase-5-engine-v1',
    )

    assert.equal(
      engineCalls.length,
      1,
    )
  },
)

test(
  'administrador pode visualizar ciclo de outro vendedor',
  async () => {
    const {
      dependencies,
      engineCalls,
    } = createPreviewDependencies()

    const {
      promise,
    } = runPreview({
      membership:
        buildMembership({
          role:
            'admin',
        }),

      cycle:
        buildCycle({
          owner_user_id:
            OTHER_USER_ID,
        }),

      token: {
        ...TOKEN,
        role:
          'admin',
      },

      dependencies,
    })

    const result =
      await promise

    assert.equal(
      result.preview.read_only,
      true,
    )

    assert.equal(
      engineCalls.length,
      1,
    )
  },
)

test(
  'gestor pode visualizar ciclo de outro vendedor',
  async () => {
    const {
      dependencies,
    } = createPreviewDependencies()

    const {
      promise,
    } = runPreview({
      membership:
        buildMembership({
          role:
            'manager',
        }),

      cycle:
        buildCycle({
          owner_user_id:
            OTHER_USER_ID,
        }),

      token: {
        ...TOKEN,
        role:
          'manager',
      },

      dependencies,
    })

    const result =
      await promise

    assert.equal(
      result.preview.crm_changed,
      false,
    )
  },
)

test(
  'membro não pode visualizar ciclo de outra carteira',
  async () => {
    const {
      dependencies,
      engineCalls,
    } = createPreviewDependencies()

    const {
      promise,
    } = runPreview({
      cycle:
        buildCycle({
          owner_user_id:
            OTHER_USER_ID,
        }),

      dependencies,
    })

    await assertPreviewError(
      () => promise,
      'PREVIEW_PERMISSION_DENIED',
    )

    assert.equal(
      engineCalls.length,
      0,
    )
  },
)

test(
  'usuário sem vínculo ativo não acessa a prévia',
  async () => {
    const {
      dependencies,
      engineCalls,
    } = createPreviewDependencies()

    const {
      promise,
    } = runPreview({
      membership:
        null,

      dependencies,
    })

    await assertPreviewError(
      () => promise,
      'PREVIEW_MEMBERSHIP_REQUIRED',
    )

    assert.equal(
      engineCalls.length,
      0,
    )
  },
)

test(
  'ciclo encerrado não executa o motor',
  async () => {
    const {
      dependencies,
      engineCalls,
    } = createPreviewDependencies()

    const {
      promise,
    } = runPreview({
      cycle:
        buildCycle({
          status:
            'ganho',
        }),

      dependencies,
    })

    await assertPreviewError(
      () => promise,
      'PREVIEW_CYCLE_CLOSED',
    )

    assert.equal(
      engineCalls.length,
      0,
    )
  },
)

test(
  'falha de consulta não expõe mensagem interna do banco',
  async () => {
    const {
      dependencies,
    } = createPreviewDependencies()

    const {
      promise,
    } = runPreview({
      tableOverrides: {
        company_memberships: {
          data: null,

          error: {
            message:
              'detalhe interno do banco',
          },
        },
      },

      dependencies,
    })

    await assert.rejects(
      () => promise,
      (error) => {
        assert.ok(
          error instanceof
            CompanionDiagnosticPreviewError,
        )

        assert.equal(
          error.code,
          'PREVIEW_QUERY_FAILED',
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
  'encaminha o escopo validado e as opções para o motor',
  async () => {
    const {
      dependencies,
      engineCalls,
    } = createPreviewDependencies()

    const {
      promise,
    } = runPreview({
      dependencies,
    })

    await promise

    assert.equal(
      engineCalls.length,
      1,
    )

    const engineCall =
      engineCalls[0]

    assert.equal(
      engineCall.company_id,
      COMPANY_ID,
    )

    assert.equal(
      engineCall.cycle_id,
      CYCLE_ID,
    )

    assert.equal(
      engineCall.conversation_key,
      CONVERSATION_KEY,
    )

    assert.equal(
      engineCall.reference_time,
      '2026-08-04T21:00:00.000Z',
    )

    assert.deepEqual(
      engineCall.model_options,
      {
        api_key:
          'chave-de-teste',

        model:
          'modelo-de-teste',
      },
    )
  },
)

test(
  'valida o ciclo antes de realizar consultas',
  async () => {
    const {
      client,
      calls,
    } = createFakeClient({
      company_memberships:
        ok(buildMembership()),

      sales_cycles:
        ok(buildCycle()),
    })

    await assertPreviewError(
      () =>
        runCompanionDiagnosticPreview({
          admin:
            client,

          token:
            TOKEN,

          cycle_id:
            'ciclo-invalido',

          conversation_key:
            CONVERSATION_KEY,

          reference_time:
            '2026-08-04T21:00:00.000Z',
        }),

      'INVALID_PREVIEW_ARGUMENT',
    )

    assert.deepEqual(
      calls,
      [],
    )
  },
)
