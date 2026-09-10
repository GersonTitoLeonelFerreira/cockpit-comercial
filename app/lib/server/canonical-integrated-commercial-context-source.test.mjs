import assert from 'node:assert/strict'
import test from 'node:test'

import {
  loadCanonicalIntegratedCommercialContext,
} from './canonical-integrated-commercial-context-source.ts'

const COMPANY_ID = '10000000-0000-4000-8000-000000000001'
const OTHER_COMPANY_ID = '10000000-0000-4000-8000-000000000002'

const CYCLE_ID = '30000000-0000-4000-8000-000000000001'
const OTHER_CYCLE_ID = '30000000-0000-4000-8000-000000000002'

const CONVERSATION_KEY = 'whatsapp:+5547999990001'

const REFERENCE_TIME = '2026-09-09T17:00:00.000Z'

function evidence(summary, ids = ['m1']) {
  return {
    summary,
    evidence_message_ids: ids,
    memory_ids: [],
  }
}

function buildReading(overrides = {}) {
  return {
    contract_version: 'commercial-reading-v1',
    analysis_status: 'complete',
    analysis_limitations: [],
    commercial_role: 'buyer',
    commercial_relevance: 'commercial',
    conversation_summary: {
      initial_context: null,
      evolution: null,
      important_events: [],
      current_state: evidence('Conversa em andamento.'),
      last_customer_request_or_decision: null,
    },
    customer: {
      objectives: [],
      problems: [],
      impacts: [],
      needs: [],
      interests: [],
      decision_criteria: [],
      preferences: [],
      open_questions: [],
      objections: [],
      uncertainties: [],
      discussed_products: [],
      primary_product_interest: null,
      competitors: [],
      commitments: [],
      missing_discovery: [],
      resolved_information: [],
      superseded_information: [],
      communication: {
        events: [],
        patterns: [],
      },
    },
    commercial_evolution: [],
    method: {
      configured: false,
      name: null,
      stages: [],
      current_stage: null,
      adherence: {
        status: 'not_configured',
        summary: 'Método comercial não configurado.',
        deviation_stage_order: null,
        what_happened: null,
        missing_information: [],
        why_it_matters: null,
        evidence_message_ids: [],
        memory_ids: [],
      },
      recovery_guidance: null,
    },
    seller_strengths: [],
    improvement_points: [],
    risks: {
      customer_objections: [],
      service_risks: [],
    },
    best_approach: {
      decision: 'no_intervention',
      reason: 'Nada novo sustentado pelo contexto atual.',
      channel: 'none',
      evidence_message_ids: ['m1'],
      memory_ids: [],
    },
    communication: {
      intervention_needed: false,
      recommended_question: null,
      recommended_message: null,
    },
    operations: {
      crm: {
        should_change_crm_stage: false,
        recommended_status: null,
        rationale: null,
        requires_human_confirmation: true,
      },
      agenda: {
        should_change_agenda: false,
        expected_next_action_at: null,
        rationale: null,
        requires_human_confirmation: true,
      },
    },
    evidence_message_ids: ['m1'],
    memory_ids: [],
    ...overrides,
  }
}

function buildCurrentReading({
  company_id = COMPANY_ID,
  cycle_id = CYCLE_ID,
  conversation_key = CONVERSATION_KEY,
  state_record_id = 'state-record-1',
  state_version = 3,
  source_event_id = 'event-current-1',
  generated_at = '2026-09-09T16:59:00.000Z',
  state_updated_at = generated_at,
  reading = buildReading(),
} = {}) {
  return {
    company_id,
    cycle_id,
    conversation_key,
    state_record_id,
    state_version,
    reading,
    source_event_id,
    generated_at,
    state_updated_at,
  }
}

function buildClientContext({
  company_id = COMPANY_ID,
  cycle_id = CYCLE_ID,
  conversation_key = CONVERSATION_KEY,
  current_status = 'negociacao',
  generated_at = REFERENCE_TIME,
  last_interaction_at = '2026-09-09T16:55:00.000Z',
  sla = {
    configured: false,
    applicable: false,
    stage: null,
    stage_label: null,
    target_minutes: null,
    warning_minutes: null,
    danger_minutes: null,
    elapsed_minutes: null,
    risk: null,
  },
  waiting = {
    state: 'no_pending_response',
    waiting_since: null,
    waiting_duration_ms: null,
  },
} = {}) {
  return {
    contract_version: 'companion-client-context-v1',
    generated_at,
    identity: {
      company_id,
      cycle_id,
      conversation_key,
      current_status,
    },
    relationship: {
      first_known_interaction_at: '2026-09-01T10:00:00.000Z',
      relationship_age_ms: 1000,
      latest_customer_message_at: last_interaction_at,
      latest_seller_message_at: last_interaction_at,
      last_interaction_at,
      known_interaction_count: 5,
    },
    waiting,
    timeline: [],
    sla,
  }
}

function buildPublishedMethodConfigRow(overrides = {}) {
  return {
    company_id: COMPANY_ID,
    id: 'method-config-1',
    status: 'published',
    published_at: '2026-09-09T10:00:00.000Z',
    ...overrides,
  }
}

function buildSnapshot(overrides = {}) {
  return {
    contract_version: 'phase-5.1-commercial-state-v1',
    cycle_id: CYCLE_ID,
    version: 1,
    updated_at: '2026-09-09T16:00:00.000Z',
    facts: [],
    needs: [],
    open_loops: [],
    objections: [],
    commitments: [],
    signals: [],
    uncertainties: [],
    ...overrides,
  }
}

function buildStateRow({
  id = 'row-1',
  company_id = COMPANY_ID,
  cycle_id = CYCLE_ID,
  conversation_key = CONVERSATION_KEY,
  state_version = 1,
  state_contract_version = 'phase-5.1-commercial-state-v1',
  state_updated_at = '2026-09-09T16:00:00.000Z',
  snapshot = {},
} = {}) {
  return {
    id,
    company_id,
    cycle_id,
    conversation_key,
    state_version,
    state_contract_version,
    state_updated_at,
    state_snapshot: buildSnapshot({
      updated_at: state_updated_at,
      cycle_id,
      ...snapshot,
    }),
  }
}

function createQueryClass({ rows, error }) {
  return class Query {
    constructor() {
      this.filters = []
      this.upperBounds = []
      this.inFilters = []
      this.rangeFrom = null
      this.rangeTo = null
    }

    select() { return this }

    eq(column, value) {
      this.filters.push({ column, value })
      return this
    }

    lte(column, value) {
      this.upperBounds.push({ column, value })
      return this
    }

    in(column, values) {
      this.inFilters.push({ column, values })
      return this
    }

    order() { return this }

    range(from, to) {
      this.rangeFrom = from
      this.rangeTo = to
      return this
    }

    matched() {
      return rows.filter((row) =>
        this.filters.every(
          (filter) => row[filter.column] === filter.value,
        ) &&
        this.upperBounds.every(
          (filter) =>
            Date.parse(row[filter.column]) <=
              Date.parse(filter.value),
        ) &&
        this.inFilters.every(
          (filter) => filter.values.includes(row[filter.column]),
        ),
      )
    }

    maybeSingle() {
      if (error) {
        return Promise.resolve({ data: null, error })
      }

      const matched = this.matched()

      return Promise.resolve({ data: matched[0] ?? null, error: null })
    }

    then(onFulfilled, onRejected) {
      if (error) {
        return Promise.resolve({ data: null, error })
          .then(onFulfilled, onRejected)
      }

      let matched = this.matched()

      if (this.rangeFrom !== null && this.rangeTo !== null) {
        matched = matched.slice(this.rangeFrom, this.rangeTo + 1)
      }

      return Promise.resolve({ data: matched, error: null })
        .then(onFulfilled, onRejected)
    }
  }
}

function createAdmin({
  agoraRows = [],
  stateRows = [buildStateRow({})],
  eventRows = [],
  publishedMethodRows = [buildPublishedMethodConfigRow()],
} = {}) {
  const AgoraQuery = createQueryClass({ rows: agoraRows })
  const StateQuery = createQueryClass({ rows: stateRows })
  const EventQuery = createQueryClass({ rows: eventRows })
  const PublishedMethodQuery = createQueryClass({ rows: publishedMethodRows })

  return {
    from(table) {
      if (table === 'companion_method_stage_state') return new AgoraQuery()
      if (table === 'companion_commercial_states') return new StateQuery()
      if (table === 'companion_commercial_state_events') return new EventQuery()
      if (table === 'company_commercial_config_versions') return new PublishedMethodQuery()

      assert.fail(`tabela inesperada: ${table}`)
      return null
    },
  }
}

function withCallCounts(admin) {
  const counts = {}

  return {
    counts,
    admin: {
      from(table) {
        counts[table] = (counts[table] ?? 0) + 1
        return admin.from(table)
      },
    },
  }
}

function load({
  admin = createAdmin(),
  company_id = COMPANY_ID,
  cycle_id = CYCLE_ID,
  conversation_key = CONVERSATION_KEY,
  reference_time = REFERENCE_TIME,
  current_reading = buildCurrentReading(),
  client_context = buildClientContext(),
} = {}) {
  return loadCanonicalIntegratedCommercialContext({
    admin,
    company_id,
    cycle_id,
    conversation_key,
    reference_time,
    current_reading,
    client_context,
  })
}

test('reference_time inválido retorna null sem consultar nenhuma fonte', async () => {
  const admin = {
    from() {
      assert.fail('não deveria consultar o banco com reference_time inválido')
    },
  }

  const context = await load({ admin, reference_time: 'not-a-date' })

  assert.equal(context, null)
})

// Cenário 1 do mandato (§36): sessão comercial ativa + opportunity ativa.
test('sessão comercial ativa: as cinco camadas ficam coerentes e disponíveis', async () => {
  const reading = buildReading({
    commercial_relevance: 'commercial',
    best_approach: {
      decision: 'send_material',
      reason: 'Cliente pediu material sobre o produto.',
      channel: 'document',
      evidence_message_ids: ['m10'],
      memory_ids: [],
    },
    communication: {
      intervention_needed: true,
      recommended_question: null,
      recommended_message: null,
    },
  })

  const context = await load({
    current_reading: buildCurrentReading({ reading }),
  })

  assert.ok(context)
  assert.equal(context.current_reading.reading.commercial_relevance, 'commercial')
  assert.ok(context.cycle_memory)
  assert.ok(context.decision_state)
  assert.equal(context.decision_state.primary_decision.kind, 'send_material')
  assert.ok(context.communication_context)
  assert.equal(context.communication_context.executable, true)

  assert.deepEqual(context.freshness, {
    current_moment: 'active_session',
    opportunity: 'available',
    communication: 'executable',
  })
})

// Prova central da FASE 16.4 (mandato §25): nenhuma fonte é paginada
// duas vezes ao compor as cinco camadas na mesma execução — antes da
// FASE 16.4, Decision State recarregava Cycle Memory e Method/Coaching
// internamente mesmo quando o orquestrador já os tinha carregado.
test('nenhuma tabela é consultada mais de uma vez ao compor as cinco camadas', async () => {
  const { admin, counts } = withCallCounts(createAdmin())

  const context = await load({ admin })

  assert.ok(context)

  assert.equal(counts['companion_commercial_states'], 1)
  assert.equal(counts['companion_method_stage_state'], 1)
  assert.equal(counts['company_commercial_config_versions'], 1)

  // Só há uma conversation_key no ciclo neste cenário — a descoberta de
  // coaching cross-conversation nem chega a consultar o banco
  // (otherConversationKeys.length === 0 é um curto-circuito síncrono em
  // loadCrossConversationCoaching).
  assert.equal(counts['companion_commercial_state_events'], undefined)
})

// Cenário 2/7 do mandato (§3/§36): sessão pessoal ativa não apaga a
// oportunidade comercial persistida.
test('sessão pessoal ativa preserva a oportunidade comercial (give_space, cycle_memory disponível)', async () => {
  const admin = createAdmin({
    stateRows: [
      buildStateRow({
        snapshot: {
          commitments: [{
            id: 'commit-1',
            kind: 'commitment',
            summary: 'Enviar proposta amanhã.',
            evidence_message_ids: ['m1'],
            memory_status: 'active',
            created_in_state_version: 1,
            updated_in_state_version: 1,
            closed_in_state_version: null,
            commitment_status: 'confirmed',
            scheduled_at: '2026-09-10T12:00:00.000Z',
            proposed_at: null,
          }],
        },
      }),
    ],
  })

  const reading = buildReading({
    commercial_relevance: 'non_commercial',
    best_approach: {
      decision: 'no_intervention',
      reason: 'Cliente mudou de assunto para algo pessoal.',
      channel: 'none',
      evidence_message_ids: ['m1'],
      memory_ids: [],
    },
  })

  const context = await load({
    admin,
    current_reading: buildCurrentReading({
      reading,
      generated_at: '2026-09-09T16:59:00.000Z',
      state_updated_at: '2026-09-09T16:59:00.000Z',
    }),
  })

  assert.ok(context)
  assert.equal(context.decision_state.primary_decision.kind, 'give_space')
  assert.equal(context.decision_state.primary_decision.reason.includes('venda'), true)

  // A oportunidade (compromisso do ciclo) continua visível em Cycle
  // Memory mesmo com a sessão atual sendo pessoal.
  assert.equal(context.cycle_memory.commitments.length, 1)
  assert.equal(context.freshness.opportunity, 'available')

  assert.equal(
    context.communication_context.constraints.some(
      (constraint) => constraint.source === 'give_space',
    ),
    true,
  )
})

// Cenário 3/29 do mandato: sessão expirada (>4h) não apaga a
// oportunidade.
test('sessão expirada preserva a oportunidade e marca current_moment como expired_session', async () => {
  const admin = createAdmin({
    stateRows: [
      buildStateRow({
        snapshot: {
          commitments: [{
            id: 'commit-1',
            kind: 'commitment',
            summary: 'Enviar proposta amanhã.',
            evidence_message_ids: ['m1'],
            memory_status: 'active',
            created_in_state_version: 1,
            updated_in_state_version: 1,
            closed_in_state_version: null,
            commitment_status: 'confirmed',
            scheduled_at: null,
            proposed_at: '2026-09-08T10:00:00.000Z',
          }],
        },
      }),
    ],
  })

  const context = await load({
    admin,
    current_reading: buildCurrentReading({
      generated_at: '2026-09-09T10:00:00.000Z',
      state_updated_at: '2026-09-09T10:00:00.000Z',
    }),
    client_context: buildClientContext({
      last_interaction_at: '2026-09-09T10:00:00.000Z',
    }),
  })

  assert.ok(context)
  assert.equal(context.decision_state.current_moment.is_active_session, false)
  assert.equal(context.freshness.current_moment, 'expired_session')

  // A oportunidade persiste — compromisso do ciclo continua disponível.
  assert.equal(context.cycle_memory.commitments.length, 1)
  assert.equal(context.freshness.opportunity, 'available')
})

// Cenário 4/28 do mandato: sem evidência de sessão atual, current_moment
// fica "unknown" — nunca inferido como comercial nem pessoal.
test('sem current_reading nem client_context, current_moment fica unknown e a oportunidade continua disponível', async () => {
  const context = await load({
    current_reading: null,
    client_context: null,
  })

  assert.ok(context)
  assert.equal(context.decision_state.current_moment.is_active_session, null)
  assert.equal(context.freshness.current_moment, 'unknown')
  assert.equal(context.freshness.opportunity, 'available')
})

// Cenário 23 do mandato: cross-company falha fechado — current_reading
// de outra company faz Decision State (e, por consequência,
// Communication Context) ficarem indisponíveis, sem derrubar Cycle
// Memory (que é escopado só por company_id/cycle_id do PRÓPRIO
// chamador, nunca do current_reading suprido).
test('current_reading de outra company degrada decision_state/communication_context sem apagar cycle_memory', async () => {
  const context = await load({
    current_reading: buildCurrentReading({
      company_id: OTHER_COMPANY_ID,
    }),
  })

  assert.ok(context)
  assert.equal(context.decision_state, null)
  assert.ok(context.cycle_memory)
  assert.equal(context.communication_context.executable, false)
  assert.equal(
    context.communication_context.non_executable_reason,
    'no_decision_state',
  )

  assert.deepEqual(context.freshness, {
    current_moment: 'unknown',
    opportunity: 'available',
    communication: 'non_executable',
  })
})

// Cenário 25 do mandato: cross-cycle isolado — um commitment de outro
// ciclo nunca aparece na leitura do ciclo pedido.
test('cross-cycle: commitment de outro ciclo nunca aparece na leitura do ciclo atual', async () => {
  const admin = createAdmin({
    stateRows: [
      buildStateRow({
        id: 'row-current-cycle',
        snapshot: {
          commitments: [{
            id: 'commit-current',
            kind: 'commitment',
            summary: 'Compromisso do ciclo atual.',
            evidence_message_ids: ['m1'],
            memory_status: 'active',
            created_in_state_version: 1,
            updated_in_state_version: 1,
            closed_in_state_version: null,
            commitment_status: 'confirmed',
            scheduled_at: null,
            proposed_at: '2026-09-08T10:00:00.000Z',
          }],
        },
      }),
      buildStateRow({
        id: 'row-other-cycle',
        cycle_id: OTHER_CYCLE_ID,
        snapshot: {
          cycle_id: OTHER_CYCLE_ID,
          commitments: [{
            id: 'commit-other',
            kind: 'commitment',
            summary: 'Compromisso de outro ciclo — nunca deve vazar.',
            evidence_message_ids: ['m1'],
            memory_status: 'active',
            created_in_state_version: 1,
            updated_in_state_version: 1,
            closed_in_state_version: null,
            commitment_status: 'confirmed',
            scheduled_at: null,
            proposed_at: '2026-09-08T10:00:00.000Z',
          }],
        },
      }),
    ],
  })

  const context = await load({ admin })

  assert.equal(context.cycle_memory.commitments.length, 1)
  assert.equal(
    context.cycle_memory.commitments[0].origin_id,
    'commit-current',
  )
})
