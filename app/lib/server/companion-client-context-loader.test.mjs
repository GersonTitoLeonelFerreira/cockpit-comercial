import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CompanionClientContextError,
  loadCompanionClientContext,
} from './companion-client-context-loader.ts'

const COMPANY_A =
  '10000000-0000-4000-8000-000000000001'

const COMPANY_B =
  '10000000-0000-4000-8000-000000000002'

const CYCLE_ID =
  '20000000-0000-4000-8000-000000000001'

const OWNER_USER_ID =
  '30000000-0000-4000-8000-000000000001'

const OTHER_USER_ID =
  '30000000-0000-4000-8000-000000000002'

const CONVERSATION_KEY =
  'whatsapp:+5547999990001'

const REFERENCE_TIME =
  '2026-08-22T12:00:00.000Z'

function buildToken({
  companyId = COMPANY_A,
  userId = OWNER_USER_ID,
  role = 'member',
} = {}) {
  return {
    sub: userId,
    company_id: companyId,
    role,
    iat: 1,
    exp: 9_999_999_999,
  }
}

function matchesFilters(
  row,
  filters,
) {
  return filters.every(
    (filter) =>
      row[filter.column] ===
      filter.value,
  )
}

function createFakeAdmin({
  memberships = [],
  cycles = [],
  reconciliation = [],
  messages = [],
  cycleEvents = [],
  actionEventsResult = {
    data: [],
    error: null,
  },
  slaRules = [],
  slaRulesError = null,
} = {}) {
  const tables = {
    company_memberships:
      memberships,

    sales_cycles:
      cycles,

    conversation_message_reconciliation_state:
      reconciliation,

    conversation_messages:
      messages,

    cycle_events:
      cycleEvents,

    sla_rules:
      slaRules,
  }

  class Query {
    constructor(
      table,
    ) {
      this.table =
        table

      this.filters =
        []

      this.inFilters =
        []

      this.maximum =
        null
    }

    select() {
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

    in(
      column,
      values,
    ) {
      this.inFilters.push({
        column,
        values,
      })

      return this
    }

    order() {
      return this
    }

    limit(
      value,
    ) {
      this.maximum =
        value

      return this
    }

    resolveRows() {
      const rows = (
        tables[this.table] ??
        []
      ).filter(
        (row) =>
          matchesFilters(
            row,
            this.filters,
          ) &&
          this.inFilters.every(
            (filter) =>
              filter.values.includes(
                row[filter.column],
              ),
          ),
      )

      const limited =
        this.maximum === null
          ? rows
          : rows.slice(
              0,
              this.maximum,
            )

      return {
        data:
          limited,

        error:
          null,
      }
    }

    maybeSingle() {
      if (
        this.table ===
          'sla_rules' &&
        slaRulesError
      ) {
        return Promise.resolve({
          data: null,
          error:
            slaRulesError,
        })
      }

      const result =
        this.resolveRows()

      return Promise.resolve({
        data:
          result.data[0] ??
          null,

        error:
          null,
      })
    }

    then(
      onFulfilled,
      onRejected,
    ) {
      return Promise.resolve(
        this.resolveRows(),
      ).then(
        onFulfilled,
        onRejected,
      )
    }
  }

  return {
    from(
      table,
    ) {
      return new Query(
        table,
      )
    },

    rpc(
      _name,
      _params,
    ) {
      return Promise.resolve(
        actionEventsResult,
      )
    },
  }
}

function baseFixtures(
  overrides = {},
) {
  return {
    memberships: [
      {
        company_id:
          COMPANY_A,

        user_id:
          OWNER_USER_ID,

        role:
          'member',

        is_active:
          true,
      },
    ],

    cycles: [
      {
        id:
          CYCLE_ID,

        company_id:
          COMPANY_A,

        owner_user_id:
          OWNER_USER_ID,

        status:
          'negociacao',

        stage_entered_at:
          '2026-08-20T08:00:00.000Z',
      },
    ],

    reconciliation:
      [],

    messages:
      [],

    cycleEvents:
      [],

    slaRules:
      [],

    ...overrides,
  }
}

// Cenário H: isolamento por empresa (tenant isolation).
test(
  'ciclo de outra empresa nunca é retornado, mesmo com o mesmo cycle_id',
  async () => {
    const admin =
      createFakeAdmin(
        baseFixtures({
          cycles: [
            {
              id:
                CYCLE_ID,

              company_id:
                COMPANY_B,

              owner_user_id:
                OWNER_USER_ID,

              status:
                'negociacao',

              stage_entered_at:
                '2026-08-20T08:00:00.000Z',
            },
          ],
        }),
      )

    await assert.rejects(
      () =>
        loadCompanionClientContext({
          admin,

          token:
            buildToken(),

          cycle_id:
            CYCLE_ID,

          conversation_key:
            CONVERSATION_KEY,

          reference_time:
            REFERENCE_TIME,
        }),
      (
        error,
      ) => {
        assert.ok(
          error instanceof
            CompanionClientContextError,
        )

        assert.equal(
          error.code,
          'CLIENT_CONTEXT_CYCLE_NOT_FOUND',
        )

        return true
      },
    )
  },
)

test(
  'sem vínculo ativo com a empresa, o acesso é negado antes de qualquer leitura do ciclo',
  async () => {
    const admin =
      createFakeAdmin(
        baseFixtures({
          memberships:
            [],
        }),
      )

    await assert.rejects(
      () =>
        loadCompanionClientContext({
          admin,

          token:
            buildToken(),

          cycle_id:
            CYCLE_ID,

          conversation_key:
            CONVERSATION_KEY,

          reference_time:
            REFERENCE_TIME,
        }),
      (
        error,
      ) => {
        assert.equal(
          error.code,
          'CLIENT_CONTEXT_MEMBERSHIP_REQUIRED',
        )

        assert.equal(
          error.status_code,
          403,
        )

        return true
      },
    )
  },
)

// Cenário I: member não lê ciclo fora da carteira.
test(
  'member sem posse do ciclo é bloqueado com 403',
  async () => {
    const admin =
      createFakeAdmin(
        baseFixtures({
          memberships: [
            {
              company_id:
                COMPANY_A,

              user_id:
                OTHER_USER_ID,

              role:
                'member',

              is_active:
                true,
            },
          ],
        }),
      )

    await assert.rejects(
      () =>
        loadCompanionClientContext({
          admin,

          token:
            buildToken({
              userId:
                OTHER_USER_ID,
            }),

          cycle_id:
            CYCLE_ID,

          conversation_key:
            CONVERSATION_KEY,

          reference_time:
            REFERENCE_TIME,
        }),
      (
        error,
      ) => {
        assert.equal(
          error.code,
          'CLIENT_CONTEXT_PERMISSION_DENIED',
        )

        assert.equal(
          error.status_code,
          403,
        )

        return true
      },
    )
  },
)

test(
  'admin lê o ciclo de qualquer vendedor da mesma empresa',
  async () => {
    const admin =
      createFakeAdmin(
        baseFixtures({
          memberships: [
            {
              company_id:
                COMPANY_A,

              user_id:
                OTHER_USER_ID,

              role:
                'admin',

              is_active:
                true,
            },
          ],
        }),
      )

    const result =
      await loadCompanionClientContext({
        admin,

        token:
          buildToken({
            userId:
              OTHER_USER_ID,

            role:
              'admin',
          }),

        cycle_id:
          CYCLE_ID,

        conversation_key:
          CONVERSATION_KEY,

        reference_time:
          REFERENCE_TIME,
      })

    assert.equal(
      result.identity.cycle_id,
      CYCLE_ID,
    )
  },
)

// P2 (fast-follow do PR #186): uma falha ao consultar sla_rules não pode
// virar "sem regra configurada" — o banco não respondeu, isso não prova
// ausência de regra.
test(
  'falha na consulta de sla_rules produz um erro retryable, não configured:false',
  async () => {
    const admin =
      createFakeAdmin(
        baseFixtures({
          slaRulesError: {
            message:
              'connection reset',
          },
        }),
      )

    await assert.rejects(
      () =>
        loadCompanionClientContext({
          admin,

          token:
            buildToken(),

          cycle_id:
            CYCLE_ID,

          conversation_key:
            CONVERSATION_KEY,

          reference_time:
            REFERENCE_TIME,
        }),
      (
        error,
      ) => {
        assert.ok(
          error instanceof
            CompanionClientContextError,
        )

        assert.equal(
          error.code,
          'CLIENT_CONTEXT_QUERY_FAILED',
        )

        assert.equal(
          error.retryable,
          true,
        )

        return true
      },
    )
  },
)

// Recuperação após erro transitório: uma segunda tentativa, sem o erro,
// volta a funcionar normalmente — a falha da consulta não deixou nenhum
// estado residual incorreto (ex.: uma regra "lembrada" como ausente).
test(
  'após uma falha transitória em sla_rules, uma nova tentativa sem o erro volta a reportar o SLA corretamente',
  async () => {
    const fixtures =
      baseFixtures({
        slaRules: [
          {
            company_id:
              COMPANY_A,

            status:
              'negociacao',

            target_minutes:
              60,

            warning_minutes:
              120,

            danger_minutes:
              10_000,
          },
        ],
      })

    const failingAdmin =
      createFakeAdmin({
        ...fixtures,
        slaRulesError: {
          message:
            'timeout',
        },
      })

    await assert.rejects(
      () =>
        loadCompanionClientContext({
          admin:
            failingAdmin,

          token:
            buildToken(),

          cycle_id:
            CYCLE_ID,

          conversation_key:
            CONVERSATION_KEY,

          reference_time:
            REFERENCE_TIME,
        }),
    )

    const recoveredAdmin =
      createFakeAdmin(
        fixtures,
      )

    const result =
      await loadCompanionClientContext({
        admin:
          recoveredAdmin,

        token:
          buildToken(),

        cycle_id:
          CYCLE_ID,

        conversation_key:
          CONVERSATION_KEY,

        reference_time:
          REFERENCE_TIME,
      })

    assert.equal(
      result.sla.configured,
      true,
    )

    assert.equal(
      result.sla.risk,
      'medium',
    )
  },
)

test(
  'lead sem mensagem no ledger, mas com SLA configurado, ainda reporta o SLA (tempo na etapa não depende de mensagens)',
  async () => {
    const admin =
      createFakeAdmin(
        baseFixtures({
          slaRules: [
            {
              company_id:
                COMPANY_A,

              status:
                'negociacao',

              target_minutes:
                60,

              warning_minutes:
                120,

              danger_minutes:
                10_000,
            },
          ],
        }),
      )

    const result =
      await loadCompanionClientContext({
        admin,

        token:
          buildToken(),

        cycle_id:
          CYCLE_ID,

        conversation_key:
          CONVERSATION_KEY,

        reference_time:
          REFERENCE_TIME,
      })

    assert.equal(
      result.relationship
        .first_known_interaction_at,
      null,
    )

    assert.equal(
      result.sla.configured,
      true,
    )

    assert.equal(
      typeof result.sla
        .elapsed_minutes,
      'number',
    )
  },
)

test(
  'lead sem mensagem no ledger e sem SLA configurado não inventa risco',
  async () => {
    const admin =
      createFakeAdmin(
        baseFixtures(),
      )

    const result =
      await loadCompanionClientContext({
        admin,

        token:
          buildToken(),

        cycle_id:
          CYCLE_ID,

        conversation_key:
          CONVERSATION_KEY,

        reference_time:
          REFERENCE_TIME,
      })

    assert.equal(
      result.relationship
        .first_known_interaction_at,
      null,
    )

    assert.equal(
      result.sla.configured,
      false,
    )

    assert.equal(
      result.sla.risk,
      null,
    )
  },
)

test(
  'caminho feliz monta identity, relationship, waiting, timeline e sla',
  async () => {
    const admin =
      createFakeAdmin(
        baseFixtures({
          reconciliation: [
            {
              company_id:
                COMPANY_A,

              conversation_key:
                CONVERSATION_KEY,

              current_message_id:
                1,
            },

            {
              company_id:
                COMPANY_A,

              conversation_key:
                CONVERSATION_KEY,

              current_message_id:
                2,
            },
          ],

          messages: [
            {
              id: 1,

              company_id:
                COMPANY_A,

              cycle_id:
                CYCLE_ID,

              conversation_key:
                CONVERSATION_KEY,

              direction:
                'incoming',

              occurred_at:
                '2026-08-21T08:00:00.000Z',

              is_deleted:
                false,
            },

            {
              id: 2,

              company_id:
                COMPANY_A,

              cycle_id:
                CYCLE_ID,

              conversation_key:
                CONVERSATION_KEY,

              direction:
                'outgoing',

              occurred_at:
                '2026-08-21T09:00:00.000Z',

              is_deleted:
                false,
            },
          ],

          cycleEvents: [
            {
              company_id:
                COMPANY_A,

              cycle_id:
                CYCLE_ID,

              event_type:
                'next_action_set',

              occurred_at:
                '2026-08-21T09:30:00.000Z',

              metadata:
                {},
            },
          ],

          slaRules: [
            {
              company_id:
                COMPANY_A,

              status:
                'negociacao',

              target_minutes:
                60,

              warning_minutes:
                120,

              danger_minutes:
                10_000,
            },
          ],
        }),
      )

    const result =
      await loadCompanionClientContext({
        admin,

        token:
          buildToken(),

        cycle_id:
          CYCLE_ID,

        conversation_key:
          CONVERSATION_KEY,

        reference_time:
          REFERENCE_TIME,
      })

    assert.equal(
      result.contract_version,
      'companion-client-context-v1',
    )

    assert.equal(
      result.identity.company_id,
      COMPANY_A,
    )

    assert.equal(
      result.relationship.known_interaction_count,
      2,
    )

    assert.equal(
      result.waiting.state,
      'seller_waiting_for_customer',
    )

    assert.equal(
      result.timeline.length,
      2,
    )

    assert.equal(
      result.sla.configured,
      true,
    )

    assert.equal(
      result.sla.risk,
      'medium',
    )
  },
)
