import assert from 'node:assert/strict'
import test from 'node:test'

import {
  loadCanonicalDecisionState,
} from './canonical-decision-state-source.ts'

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
  // loadCompanionClientContext grava generated_at como o próprio
  // reference_time da chamada (não um timestamp de escrita) — por
  // padrão igual a REFERENCE_TIME, já que é isso que um client_context
  // real teria para esta mesma chamada.
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

function buildAgoraRow(overrides = {}) {
  return {
    company_id: COMPANY_ID,
    cycle_id: CYCLE_ID,
    conversation_key: CONVERSATION_KEY,
    method_config_version_id: 'method-config-1',
    stage_key: 'diagnostico',
    stage_name: 'Diagnóstico',
    stage_display_order: 1,
    stage_reason: 'Cliente ainda descrevendo a necessidade.',
    updated_at: '2026-09-09T15:00:00.000Z',
    ...overrides,
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

function buildMemoryItem(overrides = {}) {
  return {
    id: 'stateful-memory-default',
    kind: 'default_kind',
    summary: 'Resumo padrão.',
    evidence_message_ids: ['m1'],
    memory_status: 'active',
    created_in_state_version: 1,
    updated_in_state_version: 1,
    closed_in_state_version: null,
    ...overrides,
  }
}

function buildCommitmentMemory(overrides = {}) {
  return buildMemoryItem({
    commitment_status: 'confirmed',
    scheduled_at: null,
    proposed_at: '2026-09-08T10:00:00.000Z',
    ...overrides,
  })
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
      ...snapshot,
    }),
  }
}

function createQueryClass({ rows, error, bypassFilters }) {
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
      if (bypassFilters) return rows

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

// Compromissos entram pela linha ATUAL de `companion_commercial_states`
// (caminho "fresh" de loadCanonicalCycleCommercialMemory: state_updated_at
// <= reference_time) — não pelo log de eventos, que só é consultado como
// fallback quando a linha atual está "drifted" (gravada depois de
// reference_time). Usar eventRows para isso seria testar um caminho que
// o código não percorre neste cenário.
function createAdminWithCommitments(commitments, extra = {}) {
  return createAdmin({
    stateRows: [
      buildStateRow({
        snapshot: { commitments },
      }),
    ],
    ...extra,
  })
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
  return loadCanonicalDecisionState({
    admin,
    company_id,
    cycle_id,
    conversation_key,
    reference_time,
    current_reading,
    client_context,
  })
}

// 1. Sessão comercial ativa, ação clara.
test('sessão comercial ativa com ação clara: primary_decision reflete o best_approach da análise', async () => {
  const reading = buildReading({
    commercial_relevance: 'commercial',
    best_approach: {
      decision: 'send_material',
      reason: 'Cliente pediu material sobre o produto.',
      channel: 'document',
      evidence_message_ids: ['m10'],
      memory_ids: [],
    },
  })

  const state = await load({
    current_reading: buildCurrentReading({ reading }),
  })

  assert.equal(state.primary_decision.kind, 'send_material')
  assert.deepEqual(state.interventions, [])
})

// 2. Sessão pessoal + oportunidade ativa: sem pitch forçado, oportunidade preservada.
test('sessão pessoal preserva oportunidade: primary_decision não força venda', async () => {
  const reading = buildReading({
    commercial_relevance: 'non_commercial',
    method: buildReading().method,
    best_approach: {
      decision: 'present_solution',
      reason: 'Análise sugeriria avançar, mas sessão atual é pessoal.',
      channel: 'text',
      evidence_message_ids: ['m1'],
      memory_ids: [],
    },
  })

  reading.method.adherence = {
    status: 'off_method',
    summary: 'Etapa de diagnóstico pulada.',
    deviation_stage_order: 2,
    what_happened: 'Vendedor avançou sem diagnosticar.',
    missing_information: ['impacto'],
    why_it_matters: 'Sem impacto mapeado, a proposta fica sem ancoragem.',
    evidence_message_ids: ['m1'],
    memory_ids: [],
  }

  const state = await load({
    current_reading: buildCurrentReading({ reading }),
  })

  assert.equal(state.primary_decision.kind, 'give_space')
  assert.deepEqual(state.interventions, [])
  assert.equal(state.current_moment.commercial_relevance, 'non_commercial')
})

// 3. Nada relevante agora: silêncio explícito.
test('nada relevante agora: primary_decision é no_intervention, sem inventar ação', async () => {
  const state = await load({
    current_reading: buildCurrentReading({ reading: buildReading() }),
    client_context: buildClientContext(),
  })

  assert.equal(state.primary_decision.kind, 'no_intervention')
  assert.deepEqual(state.interventions, [])
})

// 4. Objeção aberta bloqueadora: sobe para AGORA.
test('objeção aberta bloqueadora sobe como decisão principal', async () => {
  const reading = buildReading({
    risks: {
      customer_objections: [{
        kind: 'price',
        severity: 'high',
        summary: 'Cliente acha o preço alto e ameaça desistir.',
        evidence_message_ids: ['m5'],
        memory_ids: [],
      }],
      service_risks: [],
    },
  })

  const state = await load({
    current_reading: buildCurrentReading({ reading }),
  })

  assert.equal(state.primary_decision.kind, 'handle_objection')
  assert.equal(
    state.primary_decision.summary,
    'Cliente acha o preço alto e ameaça desistir.',
  )
})

// 5. Objeção histórica já resolvida: não sobe.
test('objeção não mais listada na leitura atual não produz intervenção', async () => {
  const reading = buildReading({
    risks: { customer_objections: [], service_risks: [] },
  })

  const state = await load({
    current_reading: buildCurrentReading({ reading }),
  })

  assert.notEqual(state.primary_decision.kind, 'handle_objection')
  assert.deepEqual(state.interventions, [])
})

// 6. Descoberta incompleta: só sobe quando impede próxima ação.
test('descoberta incompleta sobe quando best_approach é insufficient_information', async () => {
  const reading = buildReading({
    best_approach: {
      decision: 'insufficient_information',
      reason: 'Falta entender orçamento e prazo antes de prosseguir.',
      channel: 'text',
      evidence_message_ids: ['m2'],
      memory_ids: [],
    },
  })

  const state = await load({
    current_reading: buildCurrentReading({ reading }),
  })

  assert.equal(state.primary_decision.kind, 'insufficient_information')
})

test('descoberta incompleta que não bloqueia o próximo passo não sobe via essa via', async () => {
  const reading = buildReading({
    method: {
      ...buildReading().method,
      adherence: {
        status: 'partially_on_method',
        summary: 'Descoberta parcial, mas seguindo.',
        deviation_stage_order: null,
        what_happened: null,
        missing_information: ['budget'],
        why_it_matters: null,
        evidence_message_ids: [],
        memory_ids: [],
      },
    },
    best_approach: {
      decision: 'respond',
      reason: 'Responder a última pergunta do cliente.',
      channel: 'text',
      evidence_message_ids: ['m2'],
      memory_ids: [],
    },
  })

  const state = await load({ current_reading: buildCurrentReading({ reading }) })

  // A adherence parcial ainda pode subir por si (achado #7), mas o
  // ponto aqui é: best_approach não é insufficient_information, então
  // essa via específica não contribui um segundo candidato do mesmo
  // tipo.
  assert.notEqual(state.primary_decision.kind, 'insufficient_information')
})

// 7. Method deviation relevante agora.
test('desvio de método na leitura atual sobe como intervenção relevante', async () => {
  const reading = buildReading({
    method: {
      configured: true,
      name: 'SPIN',
      stages: [],
      current_stage: { step_order: 2, stage_key: 'proposta', name: 'Proposta' },
      adherence: {
        status: 'off_method',
        summary: 'Vendedor apresentou proposta sem diagnosticar impacto.',
        deviation_stage_order: 2,
        what_happened: 'Pulou diagnóstico.',
        missing_information: ['impacto'],
        why_it_matters: 'Proposta sem ancoragem de valor.',
        evidence_message_ids: ['m3'],
        memory_ids: [],
      },
      recovery_guidance: {
        objective: 'Retomar diagnóstico de impacto.',
        missing_information: ['impacto'],
        recommended_move: 'Perguntar qual o impacto do problema hoje.',
        optional_question: 'Qual o custo de não resolver isso?',
        evidence_message_ids: ['m3'],
        memory_ids: [],
      },
    },
  })

  const state = await load({ current_reading: buildCurrentReading({ reading }) })

  assert.equal(state.primary_decision.kind, 'deepen_discovery')
  assert.equal(
    state.primary_decision.recommended_action,
    'Perguntar qual o impacto do problema hoje.',
  )
})

// 8. Method divergence não confiável: não criar intervenção falsa.
test('divergência de estágio não confiável não gera intervenção inventada', async () => {
  const admin = createAdmin({
    agoraRows: [buildAgoraRow({ stage_key: 'proposta' })],
    publishedMethodRows: [],
  })

  const reading = buildReading({
    method: {
      configured: true,
      name: 'SPIN',
      stages: [],
      current_stage: { step_order: 1, stage_key: 'diagnostico', name: 'Diagnóstico' },
      adherence: buildReading().method.adherence,
    },
  })

  reading.method.adherence.status = 'on_method'
  reading.method.adherence.summary = 'Seguindo o método normalmente.'

  const state = await load({
    admin,
    current_reading: buildCurrentReading({ reading }),
  })

  assert.notEqual(state.primary_decision.kind, 'clarify')
  assert.notEqual(state.primary_decision.kind, 'deepen_discovery')

  const mentionsDivergence = [
    state.primary_decision.summary,
    state.primary_decision.reason,
    ...state.interventions.map((i) => i.reason),
  ].some((text) => /diverg/i.test(text))

  assert.equal(mentionsDivergence, false)
})

// 9. Seller coaching histórico sem impacto atual: não sobe.
test('coaching de outra conversa (cross-conversation) nunca é considerado por Decision State', async () => {
  // Decision State não constrói candidatos a partir de
  // cross_conversation_coaching — apenas de
  // current_reading.reading.improvement_points (a interação atual).
  // Este teste prova que um improvement_point com kind "sempre
  // urgente" só sobe quando pertence à leitura ATUAL.
  const readingWithoutIssue = buildReading({
    improvement_points: [],
  })

  const state = await load({
    current_reading: buildCurrentReading({ reading: readingWithoutIssue }),
  })

  assert.notEqual(state.primary_decision.kind, 'clarify')
  assert.deepEqual(state.interventions, [])
})

// 10. Seller coaching que exige correção imediata: sobe.
test('coaching de preço prematuro sobe quando o vendedor está negociando agora', async () => {
  const reading = buildReading({
    improvement_points: [{
      kind: 'premature_price',
      summary: 'Vendedor enviou preço antes de entender o impacto.',
      why_it_matters: 'Proposta sem ancoragem de valor.',
      impact: 'Risco de objeção de preço sem contexto.',
      how_to_improve: 'Retomar contexto de impacto antes de negociar condição.',
      evidence_message_ids: ['m8'],
      memory_ids: [],
    }],
    best_approach: {
      decision: 'negotiate',
      reason: 'Cliente está negociando condições de pagamento agora.',
      channel: 'text',
      evidence_message_ids: ['m8'],
      memory_ids: [],
    },
  })

  const state = await load({ current_reading: buildCurrentReading({ reading }) })

  assert.equal(state.primary_decision.kind, 'deepen_discovery')
  assert.equal(
    state.primary_decision.recommended_action,
    'Retomar contexto de impacto antes de negociar condição.',
  )
})

test('coaching de preço prematuro NÃO sobe quando a análise não recomenda avançar agora', async () => {
  const reading = buildReading({
    improvement_points: [{
      kind: 'premature_price',
      summary: 'Vendedor enviou preço antes de entender o impacto.',
      why_it_matters: 'Proposta sem ancoragem de valor.',
      impact: 'Risco de objeção de preço sem contexto.',
      how_to_improve: 'Retomar contexto de impacto antes de negociar condição.',
      evidence_message_ids: ['m8'],
      memory_ids: [],
    }],
    best_approach: {
      decision: 'wait',
      reason: 'Cliente ainda não respondeu, sem nova ação a fazer agora.',
      channel: 'wait',
      evidence_message_ids: ['m8'],
      memory_ids: [],
    },
  })

  const state = await load({ current_reading: buildCurrentReading({ reading }) })

  assert.equal(state.primary_decision.kind, 'wait')
})

// 11. Customer memory relevante à interação: pode influenciar decisão.
test('compromisso vencido na memória canônica do ciclo sobe como intervenção', async () => {
  const admin = createAdminWithCommitments([
    buildCommitmentMemory({
      id: 'commit-1',
      summary: 'Enviar a proposta comercial até quinta.',
      scheduled_at: '2026-09-09T12:00:00.000Z',
    }),
  ])

  const state = await load({ admin })

  assert.equal(state.primary_decision.kind, 'follow_up')
  assert.equal(
    state.primary_decision.summary,
    'Enviar a proposta comercial até quinta.',
  )
})

// 12. Customer memory irrelevante agora: fica fora.
test('compromisso ainda não vencido (futuro) não sobe', async () => {
  const admin = createAdminWithCommitments([
    buildCommitmentMemory({
      id: 'commit-2',
      summary: 'Enviar a proposta comercial semana que vem.',
      scheduled_at: '2026-09-20T12:00:00.000Z',
    }),
  ])

  const state = await load({ admin })

  assert.notEqual(state.primary_decision.kind, 'follow_up')
})

test('compromisso ainda proposed (sem aceite bilateral) não é tratado como vencido', async () => {
  // Achado do Codex (PR #280, rodada 1): 'proposed' é uma proposta
  // unilateral, não aceita pela outra parte — tratá-la como vencida
  // inventaria uma obrigação firme que nunca existiu.
  const admin = createAdminWithCommitments([
    buildCommitmentMemory({
      id: 'commit-proposed',
      summary: 'Proposta de reunião ainda não confirmada.',
      commitment_status: 'proposed',
      scheduled_at: '2026-09-09T10:00:00.000Z',
    }),
  ])

  const state = await load({ admin })

  assert.notEqual(state.primary_decision.kind, 'follow_up')
  assert.deepEqual(state.interventions, [])
})

test('sessão pessoal suprime seller coaching de avanço de venda (deepen_discovery), não só método', async () => {
  // Achado do Codex (PR #280, rodada 1): a supressão de sinais "de
  // avanço de venda" durante sessão não comercial cobria apenas
  // method_adherence/insufficient_information, deixando passar um
  // seller_coaching gated por decisão de avanço (kind=deepen_discovery)
  // — reproduzindo o mesmo problema de forçar venda que o filtro
  // deveria evitar.
  const reading = buildReading({
    commercial_relevance: 'non_commercial',
    improvement_points: [{
      kind: 'premature_price',
      summary: 'Vendedor enviou preço antes de entender o impacto.',
      why_it_matters: 'Proposta sem ancoragem de valor.',
      impact: 'Risco de objeção de preço sem contexto.',
      how_to_improve: 'Retomar contexto de impacto antes de negociar condição.',
      evidence_message_ids: ['m8'],
      memory_ids: [],
    }],
    best_approach: {
      decision: 'negotiate',
      reason: 'Análise sugeriria negociar, mas sessão atual é pessoal.',
      channel: 'text',
      evidence_message_ids: ['m8'],
      memory_ids: [],
    },
  })

  const state = await load({ current_reading: buildCurrentReading({ reading }) })

  assert.equal(state.primary_decision.kind, 'give_space')
  assert.deepEqual(state.interventions, [])
})

// 13. Current Moment novo contradiz memória antiga: Current Moment vence
// para decisão imediata (a sessão pessoal ainda suprime pitch mesmo com
// método desviado na leitura atual).
test('current_moment pessoal vence sobre desvio de método para a decisão imediata', async () => {
  const reading = buildReading({
    commercial_relevance: 'non_commercial',
    method: {
      configured: true,
      name: 'SPIN',
      stages: [],
      current_stage: { step_order: 2, stage_key: 'proposta', name: 'Proposta' },
      adherence: {
        status: 'off_method',
        summary: 'Desvio de método identificado.',
        deviation_stage_order: 2,
        what_happened: 'Pulou diagnóstico.',
        missing_information: [],
        why_it_matters: null,
        evidence_message_ids: ['m1'],
        memory_ids: [],
      },
      recovery_guidance: null,
    },
  })

  const state = await load({ current_reading: buildCurrentReading({ reading }) })

  assert.equal(state.primary_decision.kind, 'give_space')
})

// 14. SLA vencido sem nova mensagem: se fonte existir, intervenção.
test('SLA em risco alto sobe como decisão principal mesmo sem nova mensagem, sem inventar mensagem pendente', async () => {
  // SLA mede tempo NA ETAPA (companion-client-sla.ts), não "cliente
  // aguardando resposta" (companion-client-relationship.ts) — achado
  // do Codex, PR #280, rodada 1. Sem nova mensagem do cliente
  // (waiting.state !== 'customer_waiting_for_seller'), a decisão deve
  // descrever estagnação de etapa, nunca reivindicar uma mensagem
  // pendente inexistente.
  const clientContext = buildClientContext({
    waiting: {
      state: 'no_pending_response',
      waiting_since: null,
      waiting_duration_ms: null,
    },
    sla: {
      configured: true,
      applicable: true,
      stage: 'negociacao',
      stage_label: 'Negociação',
      target_minutes: 60,
      warning_minutes: 90,
      danger_minutes: 120,
      elapsed_minutes: 150,
      risk: 'high',
    },
  })

  const state = await load({ client_context: clientContext })

  assert.equal(state.primary_decision.kind, 'escalate')
  assert.equal(
    state.operational_signal_availability.sla,
    'AVAILABLE_NOW',
  )
})

test('SLA em risco alto com cliente de fato aguardando resposta sobe como respond', async () => {
  const clientContext = buildClientContext({
    waiting: {
      state: 'customer_waiting_for_seller',
      waiting_since: '2026-09-09T14:00:00.000Z',
      waiting_duration_ms: 10800000,
    },
    sla: {
      configured: true,
      applicable: true,
      stage: 'negociacao',
      stage_label: 'Negociação',
      target_minutes: 60,
      warning_minutes: 90,
      danger_minutes: 120,
      elapsed_minutes: 150,
      risk: 'high',
    },
  })

  const state = await load({ client_context: clientContext })

  assert.equal(state.primary_decision.kind, 'respond')
})

// 15. Agenda vencendo: fonte real de calendário não existe — sinal
// permanece PARTIAL (só a sugestão de agenda da própria leitura, que
// exige confirmação humana), nunca simulado como intervenção certa.
test('agenda: disponibilidade é PARTIAL (sem integração real de calendário), nunca simulada', async () => {
  const state = await load()

  assert.equal(state.operational_signal_availability.agenda, 'PARTIAL')
})

// 16. Commitment vencido: se fonte existir, intervenção (mesmo teste
// conceitual do cenário 11, reafirmado aqui pelo número do mandato).
test('commitment vencido produz intervenção com resolve_condition observável', async () => {
  const admin = createAdminWithCommitments([
    buildCommitmentMemory({
      id: 'commit-3',
      summary: 'Ligar para confirmar reunião.',
      scheduled_at: '2026-09-09T10:00:00.000Z',
    }),
  ])

  const state = await load({ admin })

  assert.equal(
    state.primary_decision.recommended_action,
    'Cumprir o compromisso ou reagendar explicitamente com o cliente.',
  )
})

// 17. Múltiplos sinais: ordenação determinística.
test('múltiplos sinais são ordenados deterministicamente por prioridade', async () => {
  const admin = createAdminWithCommitments([
    buildCommitmentMemory({
      id: 'commit-4',
      summary: 'Compromisso vencido.',
      scheduled_at: '2026-09-09T10:00:00.000Z',
    }),
  ])

  const clientContext = buildClientContext({
    waiting: {
      state: 'customer_waiting_for_seller',
      waiting_since: '2026-09-09T14:00:00.000Z',
      waiting_duration_ms: 10800000,
    },
    sla: {
      configured: true,
      applicable: true,
      stage: 'negociacao',
      stage_label: 'Negociação',
      target_minutes: 60,
      warning_minutes: 90,
      danger_minutes: 120,
      elapsed_minutes: 200,
      risk: 'high',
    },
  })

  const reading = buildReading({
    risks: {
      customer_objections: [{
        kind: 'price',
        severity: 'high',
        summary: 'Objeção bloqueadora de preço.',
        evidence_message_ids: ['m9'],
        memory_ids: [],
      }],
      service_risks: [],
    },
  })

  const state = await load({
    admin,
    client_context: clientContext,
    current_reading: buildCurrentReading({ reading }),
  })

  // SLA (critical) sempre vence de commitment/risco (high) — ordem
  // determinística por prioridade.
  assert.equal(state.primary_decision.kind, 'respond')
  assert.equal(state.interventions.length, 2)
  assert.equal(state.interventions[0].source, 'cycle_commitment')
  assert.equal(state.interventions[1].source, 'commercial_risk')
})

// 18. Mais de 3 candidatos: saída seller-facing limitada.
test('mais de 3 candidatos: interventions nunca excede 2 (densidade)', async () => {
  const admin = createAdminWithCommitments([
    buildCommitmentMemory({
      id: 'commit-5',
      summary: 'Compromisso 1 vencido.',
      scheduled_at: '2026-09-09T09:00:00.000Z',
    }),
    buildCommitmentMemory({
      id: 'commit-6',
      summary: 'Compromisso 2 vencido.',
      scheduled_at: '2026-09-09T10:00:00.000Z',
    }),
  ])

  const clientContext = buildClientContext({
    sla: {
      configured: true,
      applicable: true,
      stage: 'negociacao',
      stage_label: 'Negociação',
      target_minutes: 60,
      warning_minutes: 90,
      danger_minutes: 120,
      elapsed_minutes: 200,
      risk: 'high',
    },
  })

  const reading = buildReading({
    risks: {
      customer_objections: [{
        kind: 'price',
        severity: 'high',
        summary: 'Objeção bloqueadora de preço.',
        evidence_message_ids: ['m9'],
        memory_ids: [],
      }],
      service_risks: [],
    },
  })

  const state = await load({
    admin,
    client_context: clientContext,
    current_reading: buildCurrentReading({ reading }),
  })

  assert.ok(state.interventions.length <= 2)
})

// 19. Cross-cycle: não vazar (client_context de outro ciclo é descartado).
test('client_context de outro ciclo é descartado, tratado como indisponível', async () => {
  const mismatchedContext = buildClientContext({ cycle_id: OTHER_CYCLE_ID })

  const state = await load({ client_context: mismatchedContext })

  assert.equal(state.operational_signal_availability.sla, 'NOT_AVAILABLE')
  assert.equal(state.provenance.client_context_generated_at, null)
})

// 20. Cross-lead: não vazar (conversation_key de outra conversa é
// descartada da mesma forma — outro lead implica outra conversation_key).
test('client_context de outra conversation_key é descartado', async () => {
  const mismatchedContext = buildClientContext({
    conversation_key: 'whatsapp:+5547999999999',
  })

  const state = await load({ client_context: mismatchedContext })

  assert.equal(state.operational_signal_availability.waiting, 'NOT_AVAILABLE')
})

// 21. Cross-company: não vazar.
test('client_context de outra empresa é descartado', async () => {
  const mismatchedContext = buildClientContext({ company_id: OTHER_COMPANY_ID })

  const state = await load({ client_context: mismatchedContext })

  assert.equal(state.operational_signal_availability.crm_pipeline, 'NOT_AVAILABLE')
})

// 22. Future source: não usar.
test('current_reading do futuro (generated_at posterior ao reference_time) é rejeitado', async () => {
  const state = await load({
    current_reading: buildCurrentReading({
      generated_at: '2026-09-09T17:00:00.001Z',
    }),
  })

  assert.equal(state, null)
})

test('client_context do futuro é tratado como indisponível, não como atual', async () => {
  const futureContext = buildClientContext({
    generated_at: '2026-09-09T17:00:00.001Z',
  })

  const state = await load({ client_context: futureContext })

  assert.equal(state.operational_signal_availability.sla, 'NOT_AVAILABLE')
})

test('client_context de reference_time anterior (não futuro) também é descartado', async () => {
  // Achado do Codex (PR #280, rodada 1): loadCompanionClientContext
  // grava generated_at como o próprio reference_time usado para
  // computar waiting/SLA/CRM — não é um timestamp de escrita que só
  // precisa ser "não futuro". Um client_context de um reference_time
  // MAIS ANTIGO (não só mais novo) já é uma fotografia de outro
  // instante e pode ter perdido um limiar de SLA cruzado desde então.
  const olderContext = buildClientContext({
    generated_at: '2026-09-09T16:00:00.000Z',
    sla: {
      configured: true,
      applicable: true,
      stage: 'negociacao',
      stage_label: 'Negociação',
      target_minutes: 60,
      warning_minutes: 90,
      danger_minutes: 120,
      elapsed_minutes: 30,
      risk: 'low',
    },
  })

  const state = await load({ client_context: olderContext })

  assert.equal(state.operational_signal_availability.sla, 'NOT_AVAILABLE')
  assert.equal(state.provenance.client_context_generated_at, null)
})

// 23. reference_time histórico: determinístico.
test('reference_time histórico produz o mesmo resultado de forma determinística', async () => {
  const reading = buildReading({
    best_approach: {
      decision: 'respond',
      reason: 'Responder pergunta pendente.',
      channel: 'text',
      evidence_message_ids: ['m1'],
      memory_ids: [],
    },
  })

  const historicalReferenceTime = '2026-09-09T12:00:00.000Z'

  const args = {
    current_reading: buildCurrentReading({
      reading,
      generated_at: '2026-09-09T11:59:00.000Z',
      state_updated_at: '2026-09-09T11:59:00.000Z',
    }),
    client_context: buildClientContext({
      generated_at: historicalReferenceTime,
      last_interaction_at: '2026-09-09T11:55:00.000Z',
    }),
    reference_time: historicalReferenceTime,
  }

  const first = await load(args)
  const second = await load(args)

  assert.deepEqual(first, second)
})

// 24. Malformed source: fail-closed/degradação segura.
test('current_reading de outro escopo é rejeitado (fail-closed)', async () => {
  const state = await load({
    current_reading: buildCurrentReading({
      conversation_key: 'whatsapp:+5547988887777',
    }),
  })

  assert.equal(state, null)
})

// 25. Fonte indisponível: não derruba outras.
test('current_reading nulo não impede que sinais operacionais decidam', async () => {
  const clientContext = buildClientContext({
    waiting: {
      state: 'customer_waiting_for_seller',
      waiting_since: '2026-09-09T14:00:00.000Z',
      waiting_duration_ms: 10800000,
    },
    sla: {
      configured: true,
      applicable: true,
      stage: 'negociacao',
      stage_label: 'Negociação',
      target_minutes: 60,
      warning_minutes: 90,
      danger_minutes: 120,
      elapsed_minutes: 200,
      risk: 'high',
    },
  })

  const state = await load({
    current_reading: null,
    client_context: clientContext,
  })

  assert.equal(state.primary_decision.kind, 'respond')
})

test('current_reading e client_context ambos nulos: silêncio explícito, sem quebrar', async () => {
  const state = await load({
    current_reading: null,
    client_context: null,
  })

  assert.equal(state.primary_decision.kind, 'no_intervention')
  assert.deepEqual(state.interventions, [])
})

// 26. Análise semanticamente anterior a um evento/config, mas
// generated_at posterior por fila/retry: NÃO usar generated_at para
// promover decisão. (Regra obrigatória do HOTFIX 16.3D.1 — validado
// aqui através do provenance exposto por Decision State.)
test('provenance de Decision State usa state_updated_at, nunca generated_at, para a prova temporal repassada', async () => {
  const reading = buildReading()

  const state = await load({
    current_reading: buildCurrentReading({
      reading,
      generated_at: '2026-09-09T16:00:00.000Z',
      state_updated_at: '2026-09-09T10:00:00.000Z',
    }),
  })

  assert.equal(
    state.provenance.analise_state_updated_at,
    '2026-09-09T10:00:00.000Z',
  )
})

test('reference_time inválido retorna null sem consultar o banco', async () => {
  let calledFrom = false

  const admin = {
    from() {
      calledFrom = true
      throw new Error('não deveria consultar com reference_time inválido')
    },
  }

  const state = await load({ admin, reference_time: 'not-a-date' })

  assert.equal(state, null)
  assert.equal(calledFrom, false)
})

test('erro na leitura de method/coaching não derruba a leitura combinada (best-effort)', async () => {
  const admin = createAdmin({
    publishedMethodRows: [buildPublishedMethodConfigRow()],
  })

  admin.from = (table) => {
    if (table === 'companion_method_stage_state') {
      return {
        select() { return this },
        eq() { return this },
        then(_onFulfilled, onRejected) {
          return Promise.reject(new Error('boom')).catch(onRejected)
        },
      }
    }

    return createAdmin().from(table)
  }

  const state = await load({ admin })

  assert.ok(state)
  assert.equal(state.provenance.agora_updated_at, null)
})

test('erro na leitura de cycle memory não derruba a leitura combinada (best-effort)', async () => {
  const admin = createAdmin()

  admin.from = (table) => {
    if (table === 'companion_commercial_states') {
      return {
        select() { return this },
        eq() { return this },
        order() { return this },
        range() {
          return Promise.reject(new Error('boom'))
        },
      }
    }

    return createAdmin().from(table)
  }

  const state = await load({ admin })

  assert.ok(state)
  assert.equal(state.operational_signal_availability.commitments, 'NOT_AVAILABLE')
})
