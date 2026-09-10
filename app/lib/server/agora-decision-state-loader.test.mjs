import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AgoraDecisionStateReadError,
  CompanionClientContextError,
  loadAgoraViewModel,
} from './agora-decision-state-loader.ts'

// ---------------------------------------------------------------------------
// FASE 16.5 — testes de composição (glue) do loader que alimenta o AGORA
// seller-facing view model.
//
// Este loader não reimplementa nenhuma lógica de decisão — ele só monta
// o contexto que loadCompanionClientContext/loadCanonicalCommercialReadingSource/
// loadCanonicalDecisionState/buildAgoraViewModel já exigem (cada um já
// exaustivamente testado em seu próprio arquivo: companion-client-
// context-loader.test.mjs, canonical-commercial-reading-source.test.mjs,
// canonical-decision-state-source.test.mjs, agora-view-model.test.mjs).
// Por isso a cobertura aqui foca na COMPOSIÇÃO — que tabelas são
// consultadas com quais chaves, que o resultado final é um AgoraViewModel
// coerente, e que falhas de autenticação/escopo propagam corretamente —
// não em re-testar a normalização de Commercial Reading (fixture gigante
// já coberta em outro arquivo).
// ---------------------------------------------------------------------------

const COMPANY_ID = '10000000-0000-4000-8000-000000000001'
const OTHER_COMPANY_ID = '10000000-0000-4000-8000-000000000002'
const CYCLE_ID = '20000000-0000-4000-8000-000000000001'
const OWNER_USER_ID = '30000000-0000-4000-8000-000000000001'
const CONVERSATION_KEY = 'whatsapp:+5547999990001'
const REFERENCE_TIME = '2026-09-09T17:00:00.000Z'

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

test('sem estado comercial persistido: view model ainda é produzido a partir dos sinais operacionais do client_context', async () => {
  const admin = createFakeAdmin(baseFixtures())

  const vm = await loadAgoraViewModel({
    admin,
    token: buildToken(),
    cycle_id: CYCLE_ID,
    conversation_key: CONVERSATION_KEY,
    reference_time: REFERENCE_TIME,
  })

  // Sem current_reading (state_read.mode === 'missing') e sem sinal
  // operacional no fixture (sem SLA crítico, sem cliente aguardando,
  // sem compromisso) — Decision State cai no fallback conservador de
  // no_intervention, que o presenter traduz em silêncio, nunca numa
  // recomendação inventada.
  assert.equal(vm.silent, true)
  assert.equal(vm.silent_reason, 'nothing_to_do')
  assert.equal(vm.primary, null)
})

test('cliente aguardando resposta sem estado comercial persistido: primary respond vem do sinal operacional real', async () => {
  const admin = createFakeAdmin(
    baseFixtures({
      reconciliation: [
        {
          company_id: COMPANY_ID,
          conversation_key: CONVERSATION_KEY,
          current_message_id: 1,
          message_key: 'm1',
        },
      ],
      messages: [
        {
          id: 1,
          company_id: COMPANY_ID,
          cycle_id: CYCLE_ID,
          conversation_key: CONVERSATION_KEY,
          message_key: 'm1',
          version: 1,
          direction: 'incoming',
          occurred_at: '2026-09-09T16:00:00.000Z',
          observed_at: '2026-09-09T16:00:00.000Z',
          content_type: 'text',
          text_content: 'Alguém pode me responder?',
          audio_transcription: null,
          is_deleted: false,
          deletion_reason: null,
        },
      ],
    }),
  )

  const vm = await loadAgoraViewModel({
    admin,
    token: buildToken(),
    cycle_id: CYCLE_ID,
    conversation_key: CONVERSATION_KEY,
    reference_time: REFERENCE_TIME,
  })

  assert.equal(vm.silent, false)
  assert.equal(vm.primary.status, 'respond')
  assert.equal(vm.primary.provenance.source, 'customer_waiting')
})

test('acesso negado (sem vínculo ativo com a empresa) propaga CompanionClientContextError, nunca um AgoraViewModel', async () => {
  const admin = createFakeAdmin(baseFixtures({ memberships: [] }))

  await assert.rejects(
    () =>
      loadAgoraViewModel({
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
      loadAgoraViewModel({
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

test('AgoraDecisionStateReadError é exportado e carrega code/status_code/retryable', () => {
  const error = new AgoraDecisionStateReadError({
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
