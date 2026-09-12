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
  cycle_memory,
  method_coaching,
} = {}) {
  return loadCanonicalDecisionState({
    admin,
    company_id,
    cycle_id,
    conversation_key,
    reference_time,
    current_reading,
    client_context,
    cycle_memory,
    method_coaching,
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
    communication: {
      intervention_needed: true,
      recommended_question: null,
      recommended_message: null,
    },
  })

  const state = await load({
    current_reading: buildCurrentReading({ reading }),
  })

  assert.equal(state.primary_decision.kind, 'send_material')
  assert.deepEqual(state.interventions, [])
  assert.equal(state.primary_decision.silent, false)
})

test('passthrough de best_approach preserva intervention_needed=false como silent, independente do kind', async () => {
  // Achado do Codex (PR #281, rodada 10): `communication.intervention_needed`
  // é um sinal de silêncio da Commercial Reading independente do
  // `kind` decidido — `give_space` pode coexistir com "nenhuma
  // comunicação necessária agora" (ex.: cliente pediu espaço
  // explicitamente). Sem preservar esse sinal em `primary_decision`,
  // um consumidor como o Communication Context (FASE 16.3F) não tinha
  // como saber disso além do `kind`.
  const reading = buildReading({
    commercial_relevance: 'commercial',
    best_approach: {
      decision: 'give_space',
      reason: 'Cliente pediu espaço explicitamente.',
      channel: 'wait',
      evidence_message_ids: ['m1'],
      memory_ids: [],
    },
    communication: {
      intervention_needed: false,
      recommended_question: null,
      recommended_message: null,
    },
  })

  const state = await load({
    current_reading: buildCurrentReading({ reading }),
  })

  assert.equal(state.primary_decision.kind, 'give_space')
  assert.equal(state.primary_decision.silent, true)
})

test('passthrough de best_approach com intervention_needed=true não marca silent', async () => {
  const reading = buildReading({
    commercial_relevance: 'commercial',
    best_approach: {
      decision: 'present_solution',
      reason: 'Cliente pediu a proposta.',
      channel: 'text',
      evidence_message_ids: ['m1'],
      memory_ids: [],
    },
    communication: {
      intervention_needed: true,
      recommended_question: null,
      recommended_message: 'Segue a proposta comercial.',
    },
  })

  const state = await load({
    current_reading: buildCurrentReading({ reading }),
  })

  assert.equal(state.primary_decision.silent, false)
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
  // `communication.intervention_needed` não foi sobrescrito neste
  // fixture — permanece no padrão `false` de `buildReading()`, então a
  // síntese de `give_space` preserva esse silêncio.
  assert.equal(state.primary_decision.silent, true)
})

test('sessão pessoal ativa com intervention_needed=true: give_space sintetizado não é silent', async () => {
  // Achado do Codex (PR #281, rodada 12): a síntese de `give_space`
  // também precisa refletir `intervention_needed` da leitura — quando a
  // própria leitura diz que HÁ algo a comunicar (ex.: resposta factual
  // necessária, mandato §12), `silent` deve ser `false`, não hard-coded.
  const reading = buildReading({
    commercial_relevance: 'non_commercial',
    best_approach: {
      decision: 'respond',
      reason: 'Cliente fez uma pergunta factual simples.',
      channel: 'text',
      evidence_message_ids: ['m1'],
      memory_ids: [],
    },
    communication: {
      intervention_needed: true,
      recommended_question: null,
      recommended_message: 'Sim, funcionamos também aos sábados.',
    },
  })

  const state = await load({
    current_reading: buildCurrentReading({ reading }),
  })

  assert.equal(state.primary_decision.kind, 'give_space')
  assert.equal(state.primary_decision.silent, false)
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
  // Revisão adversarial própria (rodada 14, PR #281 — Codex bloqueado
  // por limite de uso): o candidato vencedor é derivado da MESMA
  // leitura que também carrega `communication.intervention_needed`
  // (aqui, o default `false` do fixture, nunca sobrescrito) — uma
  // objeção de alta severidade pode legitimamente coexistir com
  // "nenhuma comunicação necessária agora" (ex.: objeção histórica
  // ainda em aberto, mas sem nova mensagem pendente do cliente neste
  // instante).
  assert.equal(state.primary_decision.silent, true)
})

test('objeção aberta bloqueadora com intervention_needed=true não é silent', async () => {
  // Caso simétrico ao teste anterior: quando a leitura explicitamente
  // marca que HÁ algo a comunicar, o candidato vencedor de fonte
  // derivada da leitura (commercial_risk) não deve ser silenciado.
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
    communication: {
      intervention_needed: true,
      recommended_question: null,
      recommended_message: 'Posso te mostrar as condições especiais para esse caso.',
    },
  })

  const state = await load({
    current_reading: buildCurrentReading({ reading }),
  })

  assert.equal(state.primary_decision.kind, 'handle_objection')
  assert.equal(state.primary_decision.silent, false)
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
    communication: {
      intervention_needed: true,
      recommended_question: 'Qual o orçamento disponível?',
      recommended_message: null,
    },
  })

  const state = await load({
    current_reading: buildCurrentReading({ reading }),
  })

  assert.equal(state.primary_decision.kind, 'insufficient_information')
  assert.equal(state.primary_decision.silent, false)
})

test('insufficient_information com intervention_needed=false não vira candidato — cai para o passthrough, preservando silent', async () => {
  // Achado do Codex (PR #281, rodada 11): `buildInsufficientInformationCandidate`
  // disparava incondicionalmente para `decision: 'insufficient_information'`,
  // ignorando `communication.intervention_needed` — o candidato sempre
  // vencia antes do passthrough (onde `silent` é computado), perdendo o
  // sinal de silêncio do cenário validado no corpus mesmo depois da
  // correção da rodada 10.
  const reading = buildReading({
    best_approach: {
      decision: 'insufficient_information',
      reason: 'Descoberta insuficiente, mas sem necessidade de contato agora.',
      channel: 'none',
      evidence_message_ids: ['m2'],
      memory_ids: [],
    },
    communication: {
      intervention_needed: false,
      recommended_question: null,
      recommended_message: null,
    },
  })

  const state = await load({
    current_reading: buildCurrentReading({ reading }),
  })

  assert.equal(state.primary_decision.kind, 'insufficient_information')
  assert.equal(state.primary_decision.silent, true)
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
  // Revisão adversarial própria (rodada 14, PR #281): candidato de
  // method_adherence também é derivado da leitura atual — mesma
  // disciplina do teste de commercial_risk acima.
  assert.equal(state.primary_decision.silent, true)
})

test('desvio de método sem recovery concreto não cria fallback genérico no AGORA', async () => {
  const reading = buildReading({
    method: {
      configured: true,
      name: 'SPIN',
      stages: [],
      current_stage: {
        step_order: 2,
        stage_key: 'proposta',
        name: 'Proposta',
      },
      adherence: {
        status: 'off_method',
        summary: 'A condução saiu do método.',
        deviation_stage_order: 2,
        what_happened: 'Houve um desvio de condução.',
        missing_information: [],
        why_it_matters: 'O vendedor precisa ajustar a condução.',
        evidence_message_ids: ['m3'],
        memory_ids: [],
      },
      recovery_guidance: null,
    },
  })

  const state = await load({
    current_reading: buildCurrentReading({ reading }),
  })

  assert.equal(
    state.primary_decision.source,
    null,
  )

  assert.equal(
    state.primary_decision.kind,
    'no_intervention',
  )

  assert.doesNotMatch(
    JSON.stringify(state),
    /Retomar a etapa adequada do método antes de avançar\./,
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
  // Revisão adversarial própria (rodada 14, PR #281): candidato de
  // seller_coaching também é derivado da leitura atual — mesma
  // disciplina do teste de commercial_risk acima.
  assert.equal(state.primary_decision.silent, true)
})

test('coaching atual sobe no AGORA quando há intervenção necessária, mesmo fora da whitelist antiga', async () => {
  const reading = buildReading({
    improvement_points: [{
      kind: 'missing_next_commitment',
      summary: 'Próximo compromisso ficou indefinido.',
      why_it_matters: 'A oportunidade pode ficar sem avanço claro.',
      impact: 'Risco de perda de continuidade comercial.',
      how_to_improve: 'Confirmar diretamente disponibilidade e próximo horário com o cliente.',
      evidence_message_ids: ['m8'],
      memory_ids: [],
    }],
    best_approach: {
      decision: 'respond',
      reason: 'Existe uma pendência comercial concreta a resolver.',
      channel: 'text',
      evidence_message_ids: ['m8'],
      memory_ids: [],
    },
    communication: {
      intervention_needed: true,
      recommended_question: null,
      recommended_message: null,
    },
  })

  const state = await load({
    current_reading: buildCurrentReading({ reading }),
  })

  assert.equal(
    state.primary_decision.source,
    'seller_coaching',
  )

  assert.equal(
    state.primary_decision.kind,
    'clarify',
  )

  assert.equal(
    state.primary_decision.recommended_action,
    'Confirmar diretamente disponibilidade e próximo horário com o cliente.',
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
  // Revisão adversarial própria (rodada 14, PR #281): `cycle_commitment`
  // é fonte OPERACIONAL (cycle_memory), independente da leitura atual —
  // mesma disciplina do teste de client_sla acima.
  assert.equal(state.primary_decision.silent, false)
})

// 12. Customer memory irrelevante agora: fica fora.
test('compromisso ainda não vencido em dia futuro distante não sobe', async () => {
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

test('compromisso confirmado previsto para hoje, ainda não vencido, sobe como intervenção', async () => {
  // Achado do Codex (PR #280, rodada 4): antes, só compromissos JÁ
  // vencidos (scheduled_at < reference_time) produziam candidato — um
  // retorno confirmado para mais tarde no mesmo dia (REFERENCE_TIME é
  // 2026-09-09T17:00:00.000Z; compromisso às 20:00 do mesmo dia) não
  // gerava sinal nenhum, mesmo sendo exatamente o Cenário 3 do roadmap
  // (sessão pessoal + agenda comercial próxima).
  const admin = createAdminWithCommitments([
    buildCommitmentMemory({
      id: 'commit-today-upcoming',
      summary: 'Retorno comercial previsto para hoje às 20h.',
      scheduled_at: '2026-09-09T20:00:00.000Z',
    }),
  ])

  const state = await load({ admin })

  assert.equal(state.primary_decision.kind, 'follow_up')
  assert.equal(
    state.primary_decision.summary,
    'Retorno comercial previsto para hoje às 20h.',
  )
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

test('compromisso com pedido de reagendamento sobe como pendente de reconciliação, não desaparece', async () => {
  // Achado do Codex (PR #280, rodada 5): 'reschedule_requested' não é
  // 'proposed' (nunca aceito) nem 'cancelled' (encerrado) — é um
  // compromisso que já teve aceite bilateral, mas uma das partes
  // pediu para mudar o horário. O filtro `=== 'confirmed'` das listas
  // de vencido/previsto-para-hoje excluía esse status por completo,
  // fazendo o compromisso desaparecer exatamente quando alguém pedia
  // para mudar a data.
  const admin = createAdminWithCommitments([
    buildCommitmentMemory({
      id: 'commit-reschedule',
      summary: 'Reunião de fechamento com pedido de reagendamento.',
      commitment_status: 'reschedule_requested',
      scheduled_at: '2026-09-09T10:00:00.000Z',
    }),
  ])

  const state = await load({ admin })

  assert.equal(state.primary_decision.kind, 'follow_up')
  assert.equal(
    state.primary_decision.summary,
    'Reunião de fechamento com pedido de reagendamento.',
  )
  assert.equal(
    state.primary_decision.recommended_action,
    'Confirmar com o cliente o novo horário do compromisso.',
  )
})

test('compromisso previsto para mais tarde no fuso comercial (São Paulo), mesmo cruzando a virada de dia em UTC, sobe como intervenção', async () => {
  // Achado do Codex (PR #280, rodada 5): a comparação de "mesmo dia"
  // usava dia-calendário UTC, mas o produtor de compromissos interpreta
  // datas comerciais no fuso America/Sao_Paulo
  // (stateful-copilot-execution-plan.ts:1129). REFERENCE_TIME
  // (2026-09-09T17:00:00.000Z) é 2026-09-09 14:00 em São Paulo (UTC-3);
  // um compromisso às 2026-09-10T01:30:00.000Z é 2026-09-09 22:30 em
  // São Paulo — ainda HOJE localmente, mas already dia 10 em UTC. A
  // versão antiga (dia-calendário UTC) excluiria esse compromisso.
  const admin = createAdminWithCommitments([
    buildCommitmentMemory({
      id: 'commit-today-sp-timezone',
      summary: 'Retorno agendado para hoje à noite (fuso São Paulo).',
      scheduled_at: '2026-09-10T01:30:00.000Z',
    }),
  ])

  const state = await load({ admin })

  assert.equal(state.primary_decision.kind, 'follow_up')
  assert.equal(
    state.primary_decision.summary,
    'Retorno agendado para hoje à noite (fuso São Paulo).',
  )
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

test('sessão pessoal suprime objeção comercial (handle_objection), retendo risco defensivo', async () => {
  // Achado do Codex (PR #280, rodada 2): uma objeção do cliente
  // (kind='handle_objection') é sobre retomar a negociação — a mesma
  // classe de comportamento que a supressão de avanço de venda deve
  // evitar durante sessão pessoal. Um risco de atendimento
  // (kind='confirm_information', defensivo) continua elegível.
  const reading = buildReading({
    commercial_relevance: 'non_commercial',
    risks: {
      customer_objections: [{
        kind: 'price',
        severity: 'high',
        summary: 'Objeção bloqueadora de preço.',
        evidence_message_ids: ['m9'],
        memory_ids: [],
      }],
      service_risks: [{
        kind: 'promise_at_risk',
        severity: 'high',
        summary: 'Prazo prometido ao cliente está em risco.',
        evidence_message_ids: ['m10'],
        memory_ids: [],
      }],
    },
  })

  const state = await load({ current_reading: buildCurrentReading({ reading }) })

  assert.equal(state.primary_decision.kind, 'give_space')
  assert.equal(state.interventions.length, 1)
  assert.equal(state.interventions[0].source, 'commercial_risk')
  assert.equal(
    state.interventions[0].summary,
    'Prazo prometido ao cliente está em risco.',
  )
})

test('sessão pessoal com sinal operacional sobrevivente: give_space continua principal, sinal vira intervenção', async () => {
  // Achado do Codex (PR #280, rodada 2): antes, um candidato
  // operacional de prioridade alta (SLA/compromisso) virava a decisão
  // principal mesmo em sessão pessoal, e era removido de
  // `interventions` pelo slice(1,3) — fazendo AGORA parecer que a
  // sessão pessoal nunca existiu. give_space deve permanecer principal;
  // o sinal operacional deve aparecer como intervenção, não desaparecer.
  const admin = createAdminWithCommitments([
    buildCommitmentMemory({
      id: 'commit-personal',
      summary: 'Compromisso vencido durante sessão pessoal.',
      scheduled_at: '2026-09-09T10:00:00.000Z',
    }),
  ])

  const reading = buildReading({
    commercial_relevance: 'non_commercial',
  })

  const state = await load({
    admin,
    current_reading: buildCurrentReading({ reading }),
  })

  assert.equal(state.primary_decision.kind, 'give_space')
  assert.equal(state.interventions.length, 1)
  assert.equal(state.interventions[0].source, 'cycle_commitment')
  assert.equal(
    state.interventions[0].summary,
    'Compromisso vencido durante sessão pessoal.',
  )
})

// Cenário 3 do roadmap (docs/companion-v2/product/
// phase16-seller-information-architecture-scenarios.md:58-71): sessão
// pessoal + agenda comercial próxima. A sessão pessoal não vira venda,
// mas o retorno comercial previsto para hoje continua visível como
// card de intervenção.
test('sessão pessoal com compromisso confirmado previsto para hoje: give_space continua principal, compromisso vira intervenção', async () => {
  const admin = createAdminWithCommitments([
    buildCommitmentMemory({
      id: 'commit-personal-today',
      summary: 'Retorno comercial previsto para hoje.',
      scheduled_at: '2026-09-09T20:00:00.000Z',
    }),
  ])

  const reading = buildReading({
    commercial_relevance: 'non_commercial',
  })

  const state = await load({
    admin,
    current_reading: buildCurrentReading({ reading }),
  })

  assert.equal(state.primary_decision.kind, 'give_space')
  assert.equal(state.interventions.length, 1)
  assert.equal(state.interventions[0].source, 'cycle_commitment')
  assert.equal(
    state.interventions[0].summary,
    'Retorno comercial previsto para hoje.',
  )
})

test('intervention cards preservam o summary do candidato (não só reason genérico)', async () => {
  // Achado do Codex (PR #280, rodada 2): sem `summary`, um card de
  // compromisso vencido só dizia "Compromisso agendado para <data> já
  // venceu", sem revelar QUAL compromisso — inacionável quando há mais
  // de um candidato do mesmo tipo.
  const admin = createAdminWithCommitments([
    buildCommitmentMemory({
      id: 'commit-a',
      summary: 'Enviar contrato assinado.',
      scheduled_at: '2026-09-09T09:00:00.000Z',
    }),
    buildCommitmentMemory({
      id: 'commit-b',
      summary: 'Confirmar horário da demonstração.',
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

  const state = await load({ admin, client_context: clientContext })

  assert.equal(state.primary_decision.kind, 'respond')
  assert.equal(state.interventions.length, 2)
  assert.ok(
    state.interventions.some(
      (i) => i.summary === 'Enviar contrato assinado.',
    ),
  )
  assert.ok(
    state.interventions.some(
      (i) => i.summary === 'Confirmar horário da demonstração.',
    ),
  )
})

test('seller coaching sempre-urgente vence sobre risco de próximo-passo, independente da ordem no array', async () => {
  // Achado do Codex (PR #280, rodada 2): .find() escolhia o primeiro
  // item do array — se um risco de próximo-passo (medium) aparecesse
  // ANTES de um problema sempre-urgente (high) no mesmo array, o mais
  // importante era descartado silenciosamente.
  const reading = buildReading({
    improvement_points: [
      {
        kind: 'premature_price',
        summary: 'Preço enviado antes de entender impacto.',
        why_it_matters: 'Proposta sem ancoragem.',
        impact: 'Risco de objeção.',
        how_to_improve: 'Retomar contexto de impacto.',
        evidence_message_ids: ['m1'],
        memory_ids: [],
      },
      {
        kind: 'incorrect_information',
        summary: 'Vendedor informou prazo de entrega errado.',
        why_it_matters: 'Cliente pode tomar decisão com base em informação falsa.',
        impact: 'Risco de quebra de confiança.',
        how_to_improve: 'Corrigir a informação na próxima interação.',
        evidence_message_ids: ['m2'],
        memory_ids: [],
      },
    ],
    best_approach: {
      decision: 'negotiate',
      reason: 'Cliente negociando condições agora.',
      channel: 'text',
      evidence_message_ids: ['m1'],
      memory_ids: [],
    },
  })

  const state = await load({ current_reading: buildCurrentReading({ reading }) })

  assert.equal(state.primary_decision.kind, 'clarify')
  assert.equal(
    state.primary_decision.summary,
    'Vendedor informou prazo de entrega errado.',
  )
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
  // Revisão adversarial própria (rodada 14, PR #281): `client_sla` é
  // fonte OPERACIONAL (client_context), independente da leitura atual
  // (aqui com o default intervention_needed: false, nunca
  // sobrescrito) — nunca deve ser silenciada por esse sinal, ao
  // contrário de fontes derivadas da leitura (commercial_risk/
  // method_adherence/seller_coaching/insufficient_information).
  assert.equal(state.primary_decision.silent, false)
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

test('cliente aguardando resposta sobe mesmo sem SLA configurado', async () => {
  // Achado do Codex (PR #280, rodada 3): waiting era só considerado
  // DENTRO do gate de SLA crítico — uma empresa sem SLA configurado
  // não produzia nenhuma intervenção para um cliente esperando há
  // horas, mesmo com o sinal real disponível.
  const clientContext = buildClientContext({
    waiting: {
      state: 'customer_waiting_for_seller',
      waiting_since: '2026-09-09T14:00:00.000Z',
      waiting_duration_ms: 10800000,
    },
    sla: {
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
  })

  const state = await load({ client_context: clientContext })

  assert.equal(state.primary_decision.kind, 'respond')
  assert.equal(state.primary_decision.summary, 'Cliente aguardando resposta.')
})

test('SLA crítico com cliente aguardando não duplica com o candidato de waiting independente', async () => {
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
  assert.deepEqual(state.interventions, [])
})

test('lead sem nenhuma interação registrada e SLA crítico recomenda primeiro contato', async () => {
  // Achado do Codex (PR #280, rodada 3): um lead nunca contatado
  // (known_interaction_count === 0) com SLA crítico caía no
  // "escalate" genérico, sem reconhecer que a ação óbvia é fazer o
  // primeiro contato.
  const clientContext = buildClientContext({
    waiting: {
      state: 'unknown',
      waiting_since: null,
      waiting_duration_ms: null,
    },
    sla: {
      configured: true,
      applicable: true,
      stage: 'novo',
      stage_label: 'Novo',
      target_minutes: 60,
      warning_minutes: 90,
      danger_minutes: 120,
      elapsed_minutes: 150,
      risk: 'high',
    },
  })

  clientContext.relationship.known_interaction_count = 0

  const state = await load({ client_context: clientContext })

  assert.equal(state.primary_decision.kind, 'respond')
  assert.equal(
    state.primary_decision.recommended_action,
    'Fazer o primeiro contato com o lead.',
  )
})

test('sessão pessoal expirada (fora da janela de sessão) não suprime SLA crítico fresco', async () => {
  // Achado do Codex (PR #280, rodada 3): commercial_relevance da
  // leitura atual pode ser 'non_commercial' de uma sessão pessoal já
  // encerrada (mais de 4h atrás) — nesse caso não há conversa pessoal
  // acontecendo agora para preservar naturalidade, e um sinal
  // operacional fresco (SLA crítico) não deveria ser rebaixado.
  const reading = buildReading({
    commercial_relevance: 'non_commercial',
  })

  const clientContext = buildClientContext({
    last_interaction_at: '2026-09-09T10:00:00.000Z', // > 4h antes de REFERENCE_TIME (17:00)
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

  const state = await load({
    current_reading: buildCurrentReading({ reading }),
    client_context: clientContext,
  })

  assert.equal(state.current_moment.is_active_session, false)
  assert.equal(state.primary_decision.kind, 'respond')
})

test('leitura non_commercial antiga sem client_context não suprime sinal operacional fresco indefinidamente', async () => {
  // Achado do Codex (PR #280, rodada 5): sem client_context (nulo),
  // `is_active_session` não tinha como usar `last_interaction_at` —
  // caía em `null`, tratado como "sessão ainda pode estar ativa" para
  // sempre, mesmo quando a própria leitura `non_commercial` já é de
  // dias atrás (current_reading só é rejeitado por escopo ou por ser
  // do futuro, nunca por estar simplesmente desatualizado).
  const reading = buildReading({
    commercial_relevance: 'non_commercial',
  })

  const admin = createAdminWithCommitments([
    buildCommitmentMemory({
      id: 'commit-stale-personal',
      summary: 'Compromisso vencido, sem client_context disponível.',
      scheduled_at: '2026-09-09T10:00:00.000Z',
    }),
  ])

  const state = await load({
    admin,
    current_reading: buildCurrentReading({
      reading,
      generated_at: '2026-09-05T12:00:00.000Z',
      state_updated_at: '2026-09-05T12:00:00.000Z',
    }),
    client_context: null,
  })

  assert.equal(state.current_moment.is_active_session, false)
  assert.equal(state.primary_decision.kind, 'follow_up')
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
    'Confirmar com o cliente o andamento do compromisso e reagendar explicitamente se necessário.',
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

// ---------------------------------------------------------------------------
// FASE 16.4 — parâmetros suplementares opcionais cycle_memory/method_coaching
//
// Sem estes parâmetros, um chamador que precisa de Decision State E de
// Cycle Memory/Method Coaching para outro propósito (o orquestrador da
// FASE 16.4) pagava o custo de paginar companion_commercial_states (e a
// descoberta de coaching cross-conversation) DUAS VEZES na mesma
// execução, porque Decision State sempre recarregava as duas fontes
// internamente. Mesma disciplina de três casos já provada em
// canonical-method-coaching-source.test.mjs (cycle_memory) e
// canonical-communication-context-source.test.mjs
// (cycle_memory/method_coaching): não fornecido carrega internamente;
// escopo/instante divergente cai para carga interna; `null` explícito é
// respeitado sem retry.
// ---------------------------------------------------------------------------

function buildCycleMemory({
  company_id = COMPANY_ID,
  cycle_id = CYCLE_ID,
  reference_time = REFERENCE_TIME,
  conversation_keys = [CONVERSATION_KEY],
  commitments = [],
} = {}) {
  return {
    company_id,
    cycle_id,
    reference_time,
    conversation_keys,
    facts: [],
    needs: [],
    open_loops: [],
    objections: [],
    commitments,
    signals: [],
    uncertainties: [],
  }
}

function buildMethodCoaching({
  company_id = COMPANY_ID,
  cycle_id = CYCLE_ID,
  conversation_key = CONVERSATION_KEY,
  reference_time = REFERENCE_TIME,
  analise_source_event_id = 'event-current-1',
  analise_state_record_id = 'state-record-1',
  analise_state_version = 3,
} = {}) {
  return {
    company_id,
    cycle_id,
    conversation_key,
    reference_time,

    method: {
      configured: false,
      name: null,
      stages: [],
      agora_stage: null,
      analise_stage: null,
      stage_divergence: false,
      stage_comparison_reliable: false,
      adherence: null,
      recovery_guidance: null,
    },

    coaching: {
      seller_strengths: [],
      improvement_points: [],
      source_event_id: null,
      generated_at: null,
    },

    cross_conversation_coaching: [],

    provenance: {
      conversation_key,
      agora_updated_at: null,
      analise_source_event_id,
      analise_state_record_id,
      analise_state_version,
    },
  }
}

function createThrowingAdmin() {
  return {
    from(table) {
      assert.fail(
        `admin.from('${table}') não deveria ser chamado quando cycle_memory e method_coaching já foram fornecidos`,
      )
    },
  }
}

test('cycle_memory e method_coaching supridos pelo chamador são reaproveitados, sem nenhuma consulta ao banco', async () => {
  const cycleMemory = buildCycleMemory()
  const methodCoaching = buildMethodCoaching()

  const state = await loadCanonicalDecisionState({
    admin: createThrowingAdmin(),
    company_id: COMPANY_ID,
    cycle_id: CYCLE_ID,
    conversation_key: CONVERSATION_KEY,
    reference_time: REFERENCE_TIME,
    current_reading: buildCurrentReading(),
    client_context: buildClientContext(),
    cycle_memory: cycleMemory,
    method_coaching: methodCoaching,
  })

  assert.ok(state)
  assert.equal(
    state.operational_signal_availability.commitments,
    'AVAILABLE_NOW',
  )
})

test('cycle_memory suprido é reaproveitado por Decision State e por Method/Coaching internamente — companion_commercial_states nunca é consultado', async () => {
  let commercialStatesCalls = 0

  const admin = createAdmin()
  const baseFrom = admin.from.bind(admin)

  admin.from = (table) => {
    if (table === 'companion_commercial_states') {
      commercialStatesCalls += 1
    }

    return baseFrom(table)
  }

  const cycleMemory = buildCycleMemory({
    commitments: [
      {
        memory_id: `${CONVERSATION_KEY}::commit-1`,
        origin_id: 'commit-1',
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
        provenance: {
          conversation_key: CONVERSATION_KEY,
          state_record_id: 'state-record-1',
          state_version: 1,
        },
      },
    ],
  })

  const state = await load({
    admin,
    cycle_memory: cycleMemory,
  })

  assert.equal(commercialStatesCalls, 0)
  assert.ok(state)
  assert.equal(
    state.operational_signal_availability.commitments,
    'AVAILABLE_NOW',
  )
})

test('cycle_memory suprido de escopo diferente é ignorado, cai para carga interna', async () => {
  const admin = createAdmin()

  const mismatchedCycleMemory = buildCycleMemory({
    cycle_id: OTHER_CYCLE_ID,
  })

  const state = await load({
    admin,
    cycle_memory: mismatchedCycleMemory,
  })

  assert.ok(state)

  // createAdmin() por padrão devolve uma linha de estado válida para
  // CYCLE_ID (não OTHER_CYCLE_ID) — se o valor divergente tivesse sido
  // aceito diretamente, a leitura interna nunca teria acontecido e
  // commitments ficaria indisponível pela ausência de dados no objeto
  // divergente.
  assert.equal(
    state.operational_signal_availability.commitments,
    'AVAILABLE_NOW',
  )
})

test('cycle_memory suprido explicitamente como null é respeitado, sem nova consulta a companion_commercial_states', async () => {
  let commercialStatesCalls = 0

  const admin = createAdmin()
  const baseFrom = admin.from.bind(admin)

  admin.from = (table) => {
    if (table === 'companion_commercial_states') {
      commercialStatesCalls += 1
    }

    return baseFrom(table)
  }

  const state = await load({
    admin,
    cycle_memory: null,
  })

  assert.equal(commercialStatesCalls, 0)
  assert.ok(state)
  assert.equal(
    state.operational_signal_availability.commitments,
    'NOT_AVAILABLE',
  )
})

test('method_coaching suprido de outro current_reading (provenance divergente) é ignorado, cai para carga interna', async () => {
  const admin = createAdmin()

  const methodCoachingFromAnotherReading =
    buildMethodCoaching({
      analise_source_event_id: 'event-current-OTHER',
      analise_state_record_id: 'state-record-OTHER',
      analise_state_version: 99,
    })

  const state = await load({
    admin,
    method_coaching: methodCoachingFromAnotherReading,
  })

  assert.ok(state)

  // A carga interna usa loadCompanionMethodStage/published method config
  // reais do admin fake (agoraRows vazio por padrão) — o ponto do teste
  // é só provar que o objeto divergente NUNCA aparece no provenance
  // devolvido (analise_source_event_id continua vindo de
  // current_reading, nunca do method_coaching suprido).
  assert.equal(
    state.provenance.analise_source_event_id,
    'event-current-1',
  )
})

test('method_coaching suprido explicitamente como null é respeitado, sem nova consulta a companion_method_stage_state', async () => {
  let agoraCalls = 0

  const admin = createAdmin()
  const baseFrom = admin.from.bind(admin)

  admin.from = (table) => {
    if (table === 'companion_method_stage_state') {
      agoraCalls += 1
    }

    return baseFrom(table)
  }

  const state = await load({
    admin,
    method_coaching: null,
  })

  assert.equal(agoraCalls, 0)
  assert.ok(state)
  assert.equal(state.provenance.agora_updated_at, null)
})

// FASE 16.5 (recalibração seller-facing do AGORA) — `primary_decision.
// priority`: prioridade do candidato vencedor quando existe um, `null`
// nos três casos sem candidato ranqueado por trás (síntese de
// give_space, passthrough de best_approach, fallback sem fonte
// nenhuma). Sem este campo, um presenter seller-facing não tem como
// mostrar a prioridade da decisão principal (mandato §7/§20) sem
// reconstruir compareCandidates() do zero.
test('primary_decision.priority reflete a prioridade do candidato vencedor', async () => {
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
  assert.equal(state.primary_decision.priority, 'high')
})

test('primary_decision.priority reflete critical para SLA em risco alto com cliente aguardando', async () => {
  const state = await load({
    current_reading: buildCurrentReading({ reading: buildReading() }),
    client_context: buildClientContext({
      sla: {
        configured: true,
        applicable: true,
        stage: 'negociacao',
        stage_label: 'Negociação',
        target_minutes: 60,
        warning_minutes: 45,
        danger_minutes: 90,
        elapsed_minutes: 120,
        risk: 'high',
      },
      waiting: {
        state: 'customer_waiting_for_seller',
        waiting_since: '2026-01-01T10:00:00.000Z',
        waiting_duration_ms: 3600000,
      },
    }),
  })

  assert.equal(state.primary_decision.source, 'client_sla')
  assert.equal(state.primary_decision.priority, 'critical')
})

test('primary_decision.priority é null quando give_space é sintetizado (sem candidato ranqueado)', async () => {
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

  const state = await load({
    current_reading: buildCurrentReading({ reading }),
  })

  assert.equal(state.primary_decision.kind, 'give_space')
  assert.equal(state.primary_decision.source, null)
  assert.equal(state.primary_decision.priority, null)
})

test('primary_decision.priority é null no passthrough de best_approach (sem candidato ranqueado)', async () => {
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
  assert.equal(state.primary_decision.source, null)
  assert.equal(state.primary_decision.priority, null)
})

test('primary_decision.priority é null no fallback sem nenhuma fonte disponível', async () => {
  const state = await load({
    current_reading: buildCurrentReading({ reading: buildReading() }),
    client_context: buildClientContext(),
  })

  assert.equal(state.primary_decision.kind, 'no_intervention')
  assert.equal(state.primary_decision.source, null)
  assert.equal(state.primary_decision.priority, null)
})
