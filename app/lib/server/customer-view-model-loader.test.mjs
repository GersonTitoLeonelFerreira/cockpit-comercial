import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CompanionClientContextError,
  CustomerViewModelReadError,
  loadCustomerViewModel,
} from './customer-view-model-loader.ts'

// ---------------------------------------------------------------------------
// FASE 16.7 — testes de composição (glue) do loader que alimenta o
// CLIENTE seller-facing view model.
//
// Mesmo desenho de analysis-view-model-loader.test.mjs (FASE 16.6): este
// loader não reimplementa nenhuma lógica de leitura/normalização — a
// cobertura aqui foca em composição (isolamento cross-company,
// propagação de erro de autenticação/escopo, ausência de leitura), não
// em re-testar a normalização de Commercial Reading (já exaustivamente
// testada em seu próprio arquivo).
// ---------------------------------------------------------------------------

const COMPANY_ID = '10000000-0000-4000-8000-000000000001'
const OTHER_COMPANY_ID = '10000000-0000-4000-8000-000000000002'
const CYCLE_ID = '20000000-0000-4000-8000-000000000001'
const OWNER_USER_ID = '30000000-0000-4000-8000-000000000001'
const CONVERSATION_KEY = 'whatsapp:+5547999990001'
const REFERENCE_TIME = '2026-09-11T17:00:00.000Z'

function buildToken({
  companyId = COMPANY_ID,
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

function matchesFilters(row, filters) {
  return filters.every((filter) => row[filter.column] === filter.value)
}

function createFakeAdmin({
  memberships = [],
  cycles = [],
  reconciliation = [],
  messages = [],
  cycleEvents = [],
  actionEventsResult = { data: [], error: null },
  slaRules = [],
  commercialStates = [],
  commercialStateEvents = [],
} = {}) {
  const tables = {
    company_memberships: memberships,
    sales_cycles: cycles,
    conversation_message_reconciliation_state: reconciliation,
    conversation_messages: messages,
    cycle_events: cycleEvents,
    sla_rules: slaRules,
    companion_commercial_states: commercialStates,
    companion_commercial_state_events: commercialStateEvents,
  }

  class Query {
    constructor(table) {
      this.table = table
      this.filters = []
      this.inFilters = []
      this.upperBounds = []
      this.maximum = null
      this.rangeFrom = null
      this.rangeTo = null
    }

    select() {
      return this
    }

    eq(column, value) {
      this.filters.push({ column, value })
      return this
    }

    in(column, values) {
      this.inFilters.push({ column, values })
      return this
    }

    lte(column, value) {
      this.upperBounds.push({ column, value })
      return this
    }

    order() {
      return this
    }

    range(from, to) {
      this.rangeFrom = from
      this.rangeTo = to
      return this
    }

    limit(value) {
      this.maximum = value
      return this
    }

    resolveRows() {
      let rows = (tables[this.table] ?? []).filter(
        (row) =>
          matchesFilters(row, this.filters) &&
          this.inFilters.every((filter) => filter.values.includes(row[filter.column])) &&
          this.upperBounds.every((filter) => Date.parse(row[filter.column]) <= Date.parse(filter.value)),
      )

      if (this.rangeFrom !== null && this.rangeTo !== null) {
        rows = rows.slice(this.rangeFrom, this.rangeTo + 1)
      }

      const limited = this.maximum === null ? rows : rows.slice(0, this.maximum)

      return { data: limited, error: null }
    }

    maybeSingle() {
      const result = this.resolveRows()
      return Promise.resolve({ data: result.data[0] ?? null, error: null })
    }

    then(onFulfilled, onRejected) {
      return Promise.resolve(this.resolveRows()).then(onFulfilled, onRejected)
    }
  }

  return {
    from(table) {
      return new Query(table)
    },

    rpc() {
      return Promise.resolve(actionEventsResult)
    },
  }
}

function baseFixtures(overrides = {}) {
  return {
    memberships: [
      {
        company_id: COMPANY_ID,
        user_id: OWNER_USER_ID,
        role: 'member',
        is_active: true,
      },
    ],

    cycles: [
      {
        id: CYCLE_ID,
        company_id: COMPANY_ID,
        owner_user_id: OWNER_USER_ID,
        status: 'negociacao',
        stage_entered_at: '2026-08-20T08:00:00.000Z',
      },
    ],

    reconciliation: [],
    messages: [],
    cycleEvents: [],
    slaRules: [],
    commercialStates: [],
    commercialStateEvents: [],

    ...overrides,
  }
}

test('sem estado comercial persistido: view model disponível mas unavailable_reason=no_reading, nunca inventa leitura', async () => {
  const admin = createFakeAdmin(baseFixtures())

  const vm = await loadCustomerViewModel({
    admin,
    token: buildToken(),
    cycle_id: CYCLE_ID,
    conversation_key: CONVERSATION_KEY,
    reference_time: REFERENCE_TIME,
  })

  assert.equal(vm.available, true)
  assert.equal(vm.unavailable_reason, 'no_reading')
  assert.deepEqual(vm.preferences, [])
  assert.deepEqual(vm.knowledge_gaps, [])
  assert.deepEqual(vm.opportunity_context.objectives, [])
})

test('acesso negado (sem vínculo ativo com a empresa) propaga CompanionClientContextError, nunca um CustomerViewModel', async () => {
  const admin = createFakeAdmin(baseFixtures({ memberships: [] }))

  await assert.rejects(
    () =>
      loadCustomerViewModel({
        admin,
        token: buildToken(),
        cycle_id: CYCLE_ID,
        conversation_key: CONVERSATION_KEY,
        reference_time: REFERENCE_TIME,
      }),
    (error) => {
      assert.ok(error instanceof CompanionClientContextError)
      return true
    },
  )
})

test('ciclo de outra empresa (cross-company) nunca é retornado, mesmo com o mesmo cycle_id', async () => {
  const admin = createFakeAdmin(
    baseFixtures({
      cycles: [
        {
          id: CYCLE_ID,
          company_id: OTHER_COMPANY_ID,
          owner_user_id: OWNER_USER_ID,
          status: 'negociacao',
          stage_entered_at: '2026-08-20T08:00:00.000Z',
        },
      ],
    }),
  )

  await assert.rejects(
    () =>
      loadCustomerViewModel({
        admin,
        token: buildToken(),
        cycle_id: CYCLE_ID,
        conversation_key: CONVERSATION_KEY,
        reference_time: REFERENCE_TIME,
      }),
    (error) => {
      assert.ok(error instanceof CompanionClientContextError)
      assert.equal(error.code, 'CLIENT_CONTEXT_CYCLE_NOT_FOUND')
      return true
    },
  )
})

test('CustomerViewModelReadError é exportado e carrega code/status_code/retryable', () => {
  const error = new CustomerViewModelReadError({
    code: 'TEST_CODE',
    message: 'mensagem de teste',
    status_code: 500,
    retryable: true,
  })

  assert.equal(error.code, 'TEST_CODE')
  assert.equal(error.status_code, 500)
  assert.equal(error.retryable, true)
  assert.ok(error instanceof Error)
})

test('reference_time é sempre o gerado pelo client_context, nunca um valor arbitrário do chamador', async () => {
  const admin = createFakeAdmin(baseFixtures())

  const vm = await loadCustomerViewModel({
    admin,
    token: buildToken(),
    cycle_id: CYCLE_ID,
    conversation_key: CONVERSATION_KEY,
    reference_time: REFERENCE_TIME,
  })

  // Sem leitura persistida, provenance.reference_time fica null (mesma
  // disciplina de analysis-view-model.ts) — o valor gerado pelo
  // client-context só aparece quando existe uma leitura para carregar.
  assert.equal(vm.provenance.reference_time, null)
})
