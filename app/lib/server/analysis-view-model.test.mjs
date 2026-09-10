import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ANALYSIS_VIEW_MODEL_OPPORTUNITY_STATUSES,
  buildAnalysisViewModel,
} from './analysis-view-model.ts'

import {
  COMMERCIAL_READING_DECISIONS,
} from '../companion/commercial-reading-contract.ts'

// ---------------------------------------------------------------------------
// FASE 16.6 — testes do presenter seller-facing de ANÁLISE.
//
// `buildAnalysisViewModel` é uma função pura sobre
// `CanonicalIntegratedCommercialContext` — os fixtures abaixo constroem
// esse objeto diretamente (mesma disciplina de teste unitário do
// presenter já usada por agora-view-model.test.mjs, FASE 16.5), cobrindo
// os cenários obrigatórios do mandato FASE 16.6 (seção 36).
// ---------------------------------------------------------------------------

const COMPANY_ID = '10000000-0000-4000-8000-000000000001'
const CYCLE_ID = '30000000-0000-4000-8000-000000000001'
const CONVERSATION_KEY = 'whatsapp:+5547999990001'
const REFERENCE_TIME = '2026-09-11T17:00:00.000Z'

function evidence(summary, overrides = {}) {
  return {
    summary,
    evidence_message_ids: ['m1'],
    memory_ids: [],
    ...overrides,
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
      current_state: evidence('Cliente avaliando proposta comercial.'),
      last_customer_request_or_decision: null,
    },
    customer: {
      objectives: [], problems: [], impacts: [], needs: [], interests: [],
      decision_criteria: [], preferences: [], open_questions: [],
      objections: [], uncertainties: [], discussed_products: [],
      primary_product_interest: null, competitors: [], commitments: [],
      missing_discovery: [], resolved_information: [], superseded_information: [],
      communication: { events: [], patterns: [] },
    },
    commercial_evolution: [
      { key: 'contato', label: 'Contato', status: 'completed', explanation: 'Primeiro contato feito.', evidence_message_ids: ['m1'], memory_ids: [] },
    ],
    method: {
      configured: true,
      name: 'Método Consultivo',
      stages: [],
      current_stage: { step_order: 2, stage_key: 'diagnostico', name: 'Diagnóstico' },
      adherence: { status: 'on_method', summary: 'Condução segue o método.', deviation_stage_order: null, what_happened: null, missing_information: [], why_it_matters: null, evidence_message_ids: [], memory_ids: [] },
      recovery_guidance: null,
    },
    seller_strengths: [
      { kind: 'good_discovery', summary: 'Boa descoberta de necessidade.', why_it_matters: 'Evita proposta genérica.', evidence_message_ids: ['m1'], memory_ids: [] },
    ],
    improvement_points: [
      { kind: 'premature_price', summary: 'Preço apresentado cedo.', why_it_matters: 'Cliente ainda não viu valor completo.', impact: 'Risco de comparação só por preço.', how_to_improve: 'Confirmar impacto antes de negociar.', evidence_message_ids: ['m1'], memory_ids: [] },
    ],
    risks: { customer_objections: [], service_risks: [] },
    best_approach: { decision: 'present_solution', reason: 'Cliente pediu para ver a proposta.', channel: 'text', evidence_message_ids: ['m1'], memory_ids: [] },
    communication: { intervention_needed: true, recommended_question: null, recommended_message: null },
    operations: {
      crm: { should_change_crm_stage: false, recommended_status: null, rationale: null, requires_human_confirmation: true },
      agenda: { should_change_agenda: false, expected_next_action_at: null, rationale: null, requires_human_confirmation: true },
    },
    evidence_message_ids: [],
    memory_ids: [],
    ...overrides,
  }
}

function buildCurrentReading(overrides = {}) {
  return {
    company_id: COMPANY_ID,
    cycle_id: CYCLE_ID,
    conversation_key: CONVERSATION_KEY,
    state_record_id: 'state-1',
    state_version: 3,
    reading: buildReading(overrides.reading),
    source_event_id: 'event-1',
    generated_at: REFERENCE_TIME,
    state_updated_at: REFERENCE_TIME,
    ...overrides,
    ...(overrides.reading ? { reading: buildReading(overrides.reading) } : {}),
  }
}

function memoryItem(overrides = {}) {
  return {
    kind: 'other',
    summary: 'Item de memória de teste.',
    evidence_message_ids: ['m1'],
    memory_status: 'active',
    created_in_state_version: 1,
    updated_in_state_version: 1,
    closed_in_state_version: null,
    memory_id: 'mem-1',
    origin_id: 'origin-1',
    provenance: { conversation_key: CONVERSATION_KEY, state_record_id: 'state-1', state_version: 1 },
    ...overrides,
  }
}

function buildCycleMemory(overrides = {}) {
  return {
    company_id: COMPANY_ID,
    cycle_id: CYCLE_ID,
    reference_time: REFERENCE_TIME,
    conversation_keys: [CONVERSATION_KEY],
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

function buildMethodCoaching(overrides = {}) {
  return {
    company_id: COMPANY_ID,
    cycle_id: CYCLE_ID,
    conversation_key: CONVERSATION_KEY,
    reference_time: REFERENCE_TIME,
    method: {
      configured: true,
      name: 'Método Consultivo',
      stages: [],
      agora_stage: null,
      analise_stage: { source: 'analise_commercial_reading', stage_key: 'diagnostico', step_order: 2, name: 'Diagnóstico' },
      stage_divergence: false,
      stage_comparison_reliable: true,
      adherence: { status: 'on_method', summary: 'Condução segue o método.', deviation_stage_order: null, what_happened: null, missing_information: [], why_it_matters: null, evidence_message_ids: [], memory_ids: [] },
      recovery_guidance: null,
    },
    coaching: {
      seller_strengths: [],
      improvement_points: [],
      source_event_id: 'event-1',
      generated_at: REFERENCE_TIME,
    },
    cross_conversation_coaching: [],
    provenance: { conversation_key: CONVERSATION_KEY, agora_updated_at: null, analise_source_event_id: 'event-1', analise_state_record_id: 'state-1', analise_state_version: 3 },
    ...overrides,
  }
}

function buildIntegratedContext(overrides = {}) {
  return {
    company_id: COMPANY_ID,
    cycle_id: CYCLE_ID,
    conversation_key: CONVERSATION_KEY,
    reference_time: REFERENCE_TIME,

    current_reading: buildCurrentReading(),
    cycle_memory: buildCycleMemory(),
    method_coaching: buildMethodCoaching(),

    decision_state: {
      company_id: COMPANY_ID,
      cycle_id: CYCLE_ID,
      conversation_key: CONVERSATION_KEY,
      reference_time: REFERENCE_TIME,
      current_moment: { commercial_relevance: 'commercial', is_active_session: true, last_interaction_at: REFERENCE_TIME, session_gap_ms: 14400000 },
      primary_decision: { kind: 'present_solution', source: null, silent: false, priority: null, summary: 's', reason: 'r', recommended_action: 'a', evidence_message_ids: [], memory_ids: [] },
      interventions: [],
      operational_signal_availability: { crm_pipeline: 'AVAILABLE_NOW', agenda: 'PARTIAL', sla: 'AVAILABLE_NOW', waiting: 'AVAILABLE_NOW', commitments: 'AVAILABLE_NOW', opportunity_inactivity: 'NOT_AVAILABLE' },
      provenance: { conversation_key: CONVERSATION_KEY, cycle_id: CYCLE_ID, analise_source_event_id: null, analise_state_record_id: null, analise_state_version: null, analise_state_updated_at: null, agora_updated_at: null, client_context_generated_at: null },
    },

    communication_context: null,

    freshness: { current_moment: 'active_session', opportunity: 'available', communication: 'non_executable' },

    ...overrides,
  }
}

// 1 — sem contexto integrado.
test('sem Integrated Commercial Context: available=false, unavailable_reason=no_context, nunca inventa leitura', () => {
  const vm = buildAnalysisViewModel(null)

  assert.equal(vm.available, false)
  assert.equal(vm.unavailable_reason, 'no_context')
  assert.equal(vm.opportunity, null)
  assert.deepEqual(vm.risks, [])
  assert.deepEqual(vm.commitments, [])
  assert.deepEqual(vm.strengths, [])
  assert.deepEqual(vm.improvements, [])
})

// 2 — sem leitura da conversa atual, mas com continuidade do ciclo preservada.
test('sem current_reading (ainda não analisada): unavailable_reason=no_reading, mas commitments/objeções do ciclo continuam disponíveis', () => {
  const ctx = buildIntegratedContext({
    current_reading: null,
    cycle_memory: buildCycleMemory({
      commitments: [memoryItem({ kind: 'follow_up', summary: 'Enviar proposta amanhã.', commitment_status: 'confirmed', scheduled_at: '2026-09-12T12:00:00.000Z' })],
      objections: [memoryItem({ kind: 'price', summary: 'Preço considerado alto.' })],
    }),
  })

  const vm = buildAnalysisViewModel(ctx)

  assert.equal(vm.available, true)
  assert.equal(vm.unavailable_reason, 'no_reading')
  assert.equal(vm.opportunity, null)
  assert.equal(vm.commitments.length, 1)
  assert.equal(vm.objections_open.length, 1)
})

// 3/4 — sessão neutra (non_commercial / uncertain).
test('sessão non_commercial: neutral=true, opportunity/risks suprimidos, mas continuidade preservada', () => {
  const ctx = buildIntegratedContext({
    current_reading: buildCurrentReading({ reading: { commercial_relevance: 'non_commercial' } }),
    cycle_memory: buildCycleMemory({
      commitments: [memoryItem({ commitment_status: 'confirmed', scheduled_at: '2026-09-12T12:00:00.000Z' })],
    }),
  })

  const vm = buildAnalysisViewModel(ctx)

  assert.equal(vm.neutral, true)
  assert.match(vm.neutral_headline, /sem evidência comercial relevante/i)
  assert.equal(vm.opportunity, null)
  assert.deepEqual(vm.risks, [])
  assert.equal(vm.commitments.length, 1, 'continuidade da oportunidade não pode ser apagada por sessão pessoal')
})

test('sessão uncertain: neutral=true com copy distinta de non_commercial', () => {
  const ctx = buildIntegratedContext({
    current_reading: buildCurrentReading({ reading: { commercial_relevance: 'uncertain' } }),
  })

  const vm = buildAnalysisViewModel(ctx)

  assert.equal(vm.neutral, true)
  assert.match(vm.neutral_headline, /evidência comercial suficiente/i)
})

test('commercial_role !== buyer também é neutro (mesma checagem de isNeutralCommercialSession)', () => {
  const ctx = buildIntegratedContext({
    current_reading: buildCurrentReading({ reading: { commercial_role: 'seller_only' } }),
  })

  const vm = buildAnalysisViewModel(ctx)
  assert.equal(vm.neutral, true)
})

// 5 — mapa exaustivo de opportunity.status.
test('DECISION_TO_OPPORTUNITY_STATUS cobre todos os 23 valores de CommercialReadingDecision', () => {
  for (const decision of COMMERCIAL_READING_DECISIONS) {
    const ctx = buildIntegratedContext({
      current_reading: buildCurrentReading({ reading: { best_approach: { decision, reason: 'r', channel: 'text', evidence_message_ids: [], memory_ids: [] } } }),
    })

    const vm = buildAnalysisViewModel(ctx)

    assert.ok(
      ANALYSIS_VIEW_MODEL_OPPORTUNITY_STATUSES.includes(vm.opportunity.status),
      `decision '${decision}' produziu status inválido: ${vm.opportunity.status}`,
    )
  }
})

test('opportunity.headline vem verbatim de conversation_summary.current_state, nunca reescrito', () => {
  const ctx = buildIntegratedContext({
    current_reading: buildCurrentReading({
      reading: { conversation_summary: { initial_context: null, evolution: null, important_events: [], current_state: evidence('Frase concreta e específica desta venda.'), last_customer_request_or_decision: null } },
    }),
  })

  const vm = buildAnalysisViewModel(ctx)
  assert.equal(vm.opportunity.headline, 'Frase concreta e específica desta venda.')
})

// 8/9 — objeções atual vs histórica.
test('objeção com memory_status active aparece em objections_open', () => {
  const ctx = buildIntegratedContext({
    cycle_memory: buildCycleMemory({ objections: [memoryItem({ kind: 'price', summary: 'Preço considerado alto.', memory_status: 'active' })] }),
  })

  const vm = buildAnalysisViewModel(ctx)
  assert.equal(vm.objections_open.length, 1)
  assert.equal(vm.objections_open[0].summary, 'Preço considerado alto.')
})

test('objeção resolvida (memory_status=resolved) NUNCA aparece como trava atual, mesmo mencionada na conversa de hoje', () => {
  const ctx = buildIntegratedContext({
    cycle_memory: buildCycleMemory({
      objections: [
        memoryItem({ kind: 'price', summary: 'Preço considerado alto (já resolvida).', memory_status: 'resolved' }),
        memoryItem({ kind: 'timeline', summary: 'Prazo apertado (substituída por info nova).', memory_status: 'superseded' }),
      ],
    }),
  })

  const vm = buildAnalysisViewModel(ctx)
  assert.deepEqual(vm.objections_open, [])
})

test('múltiplas objeções ativas: só as relevantes (máximo 3), sem despejar tudo', () => {
  const ctx = buildIntegratedContext({
    cycle_memory: buildCycleMemory({
      objections: Array.from({ length: 5 }, (_, i) => memoryItem({ memory_id: `mem-${i}`, summary: `Objeção ${i}` })),
    }),
  })

  const vm = buildAnalysisViewModel(ctx)
  assert.equal(vm.objections_open.length, 3)
})

// 11/12 — riscos reais vs ausência de dado.
test('risco service_risk severidade high/medium aparece; low nunca infla a lista', () => {
  const ctx = buildIntegratedContext({
    current_reading: buildCurrentReading({
      reading: {
        risks: {
          customer_objections: [],
          service_risks: [
            { kind: 'unsupported_promise', severity: 'high', summary: 'Promessa sem confirmação.', evidence_message_ids: [], memory_ids: [] },
            { kind: 'minor', severity: 'low', summary: 'Detalhe menor.', evidence_message_ids: [], memory_ids: [] },
          ],
        },
      },
    }),
  })

  const vm = buildAnalysisViewModel(ctx)
  assert.equal(vm.risks.length, 1)
  assert.equal(vm.risks[0].severity, 'high')
})

test('risco ausência de dado não vira risco automaticamente: sem risks[], lista fica vazia', () => {
  const vm = buildAnalysisViewModel(buildIntegratedContext())
  assert.deepEqual(vm.risks, [])
})

test('risks combina customer_objections + service_risks, ordenado high antes de medium, máximo 3', () => {
  const ctx = buildIntegratedContext({
    current_reading: buildCurrentReading({
      reading: {
        risks: {
          customer_objections: [
            { kind: 'price', severity: 'medium', summary: 'Objeção de preço.', evidence_message_ids: [], memory_ids: [] },
          ],
          service_risks: [
            { kind: 'promise_risk', severity: 'high', summary: 'Risco de promessa.', evidence_message_ids: [], memory_ids: [] },
            { kind: 'other', severity: 'medium', summary: 'Risco b.', evidence_message_ids: [], memory_ids: [] },
            { kind: 'other', severity: 'high', summary: 'Risco c.', evidence_message_ids: [], memory_ids: [] },
          ],
        },
      },
    }),
  })

  const vm = buildAnalysisViewModel(ctx)
  assert.equal(vm.risks.length, 3)
  assert.equal(vm.risks[0].severity, 'high')
  assert.equal(vm.risks[1].severity, 'high')
  assert.equal(vm.risks[2].severity, 'medium')
})

// 13/14/15 — compromissos.
test('compromisso confirmed vencido vira overdue', () => {
  const ctx = buildIntegratedContext({
    cycle_memory: buildCycleMemory({
      commitments: [memoryItem({ kind: 'follow_up', summary: 'Retorno prometido.', commitment_status: 'confirmed', scheduled_at: '2026-09-10T12:00:00.000Z' })],
    }),
  })

  const vm = buildAnalysisViewModel(ctx)
  assert.equal(vm.commitments[0].status, 'overdue')
})

test('compromisso confirmed previsto para hoje vira due_today', () => {
  const ctx = buildIntegratedContext({
    cycle_memory: buildCycleMemory({
      commitments: [memoryItem({ commitment_status: 'confirmed', scheduled_at: '2026-09-11T20:00:00.000Z' })],
    }),
  })

  const vm = buildAnalysisViewModel(ctx)
  assert.equal(vm.commitments[0].status, 'due_today')
})

test('compromisso confirmed futuro (nem hoje) vira pending', () => {
  const ctx = buildIntegratedContext({
    cycle_memory: buildCycleMemory({
      commitments: [memoryItem({ commitment_status: 'confirmed', scheduled_at: '2026-09-20T12:00:00.000Z' })],
    }),
  })

  const vm = buildAnalysisViewModel(ctx)
  assert.equal(vm.commitments[0].status, 'pending')
})

test('compromisso proposed (ainda não aceito) nunca é tratado como vencido, mesmo com data passada', () => {
  const ctx = buildIntegratedContext({
    cycle_memory: buildCycleMemory({
      commitments: [memoryItem({ commitment_status: 'proposed', scheduled_at: '2026-09-01T12:00:00.000Z' })],
    }),
  })

  const vm = buildAnalysisViewModel(ctx)
  assert.equal(vm.commitments[0].status, 'pending')
})

test('compromisso reschedule_requested mantém sua própria categoria', () => {
  const ctx = buildIntegratedContext({
    cycle_memory: buildCycleMemory({
      commitments: [memoryItem({ commitment_status: 'reschedule_requested', scheduled_at: '2026-09-01T12:00:00.000Z' })],
    }),
  })

  const vm = buildAnalysisViewModel(ctx)
  assert.equal(vm.commitments[0].status, 'reschedule_requested')
})

test('compromisso completed nunca reaparece como pendente', () => {
  const ctx = buildIntegratedContext({
    cycle_memory: buildCycleMemory({
      commitments: [memoryItem({ commitment_status: 'completed', scheduled_at: '2026-09-01T12:00:00.000Z' })],
    }),
  })

  const vm = buildAnalysisViewModel(ctx)
  assert.equal(vm.commitments[0].status, 'completed')
})

test('compromisso cancelled reflete cancelled, e memory_status !== active nunca é revivido', () => {
  const ctx = buildIntegratedContext({
    cycle_memory: buildCycleMemory({
      commitments: [
        memoryItem({ memory_id: 'a', commitment_status: 'cancelled' }),
        memoryItem({ memory_id: 'b', commitment_status: 'confirmed', scheduled_at: '2026-09-01T12:00:00.000Z', memory_status: 'superseded' }),
      ],
    }),
  })

  const vm = buildAnalysisViewModel(ctx)
  assert.equal(vm.commitments.length, 1)
  assert.equal(vm.commitments[0].status, 'cancelled')
})

// 16/17/18/20/21 — coaching / strengths / improvements.
test('boa descoberta (strength real) aparece, preferindo a fonte consolidada de method_coaching', () => {
  const ctx = buildIntegratedContext({
    method_coaching: buildMethodCoaching({
      coaching: {
        seller_strengths: [{ kind: 'good_discovery', summary: 'Confirmou necessidade antes de propor.', why_it_matters: 'Evita proposta genérica.', evidence_message_ids: ['m1'], memory_ids: [] }],
        improvement_points: [],
        source_event_id: 'event-1',
        generated_at: REFERENCE_TIME,
      },
    }),
  })

  const vm = buildAnalysisViewModel(ctx)
  assert.equal(vm.strengths.length, 1)
  assert.equal(vm.strengths[0].summary, 'Confirmou necessidade antes de propor.')
})

test('nenhuma força fabricada: seller_strengths vazio produz lista vazia, nunca um elogio genérico', () => {
  const ctx = buildIntegratedContext({
    method_coaching: buildMethodCoaching({ coaching: { seller_strengths: [], improvement_points: [], source_event_id: null, generated_at: null } }),
  })

  const vm = buildAnalysisViewModel(ctx)
  assert.deepEqual(vm.strengths, [])
})

test('improvement principal: kind sempre-urgente aparece primeiro mesmo se estiver depois no array', () => {
  const ctx = buildIntegratedContext({
    method_coaching: buildMethodCoaching({
      coaching: {
        seller_strengths: [],
        improvement_points: [
          { kind: 'premature_price', summary: 'Risco de próximo passo.', why_it_matters: 'w', impact: 'i', how_to_improve: 'h', evidence_message_ids: [], memory_ids: [] },
          { kind: 'poor_objection_handling', summary: 'Sempre-urgente.', why_it_matters: 'w', impact: 'i', how_to_improve: 'h', evidence_message_ids: [], memory_ids: [] },
        ],
        source_event_id: 'event-1',
        generated_at: REFERENCE_TIME,
      },
    }),
  })

  const vm = buildAnalysisViewModel(ctx)
  assert.equal(vm.improvements[0].kind, 'poor_objection_handling')
})

test('máximo de improvements coerente (até 3), não vira relatório de treinamento', () => {
  const ctx = buildIntegratedContext({
    method_coaching: buildMethodCoaching({
      coaching: {
        seller_strengths: [],
        improvement_points: Array.from({ length: 6 }, (_, i) => ({ kind: 'other', summary: `Ponto ${i}`, why_it_matters: 'w', impact: 'i', how_to_improve: 'h', evidence_message_ids: [], memory_ids: [] })),
        source_event_id: 'event-1',
        generated_at: REFERENCE_TIME,
      },
    }),
  })

  const vm = buildAnalysisViewModel(ctx)
  assert.equal(vm.improvements.length, 3)
})

// 22/23 — method deviation.
test('method deviation relevante (off_method) é preservado verbatim, sem reclassificação', () => {
  const ctx = buildIntegratedContext({
    method_coaching: buildMethodCoaching({
      method: {
        configured: true, name: 'Método Consultivo', stages: [], agora_stage: null,
        analise_stage: { source: 'analise_commercial_reading', stage_key: 'diagnostico', step_order: 2, name: 'Diagnóstico' },
        stage_divergence: false, stage_comparison_reliable: true,
        adherence: { status: 'off_method', summary: 'Saiu do método.', deviation_stage_order: 1, what_happened: 'Apresentou preço antes do diagnóstico.', missing_information: ['impacto'], why_it_matters: 'Cliente não viu valor.', evidence_message_ids: [], memory_ids: [] },
        recovery_guidance: { objective: 'Retomar diagnóstico', missing_information: ['impacto'], recommended_move: 'Perguntar sobre o impacto.', optional_question: null, evidence_message_ids: [], memory_ids: [] },
      },
    }),
  })

  const vm = buildAnalysisViewModel(ctx)
  assert.equal(vm.seller_conduct.method.adherence.status, 'off_method')
  assert.equal(vm.seller_conduct.method.adherence.what_happened, 'Apresentou preço antes do diagnóstico.')
  assert.equal(vm.seller_conduct.method.recovery_guidance.recommended_move, 'Perguntar sobre o impacto.')
})

test('stage_divergence só é true quando stage_comparison_reliable também é true', () => {
  const ctx = buildIntegratedContext({
    method_coaching: buildMethodCoaching({
      method: {
        configured: true, name: 'Método', stages: [], agora_stage: null, analise_stage: null,
        stage_divergence: true, stage_comparison_reliable: false,
        adherence: { status: 'on_method', summary: 's', deviation_stage_order: null, what_happened: null, missing_information: [], why_it_matters: null, evidence_message_ids: [], memory_ids: [] },
        recovery_guidance: null,
      },
    }),
  })

  const vm = buildAnalysisViewModel(ctx)
  assert.equal(vm.seller_conduct.stage_divergence, false, 'divergência não confiável nunca aparece como divergência real')
})

test('seller_conduct.method carrega stages/current_stage para reutilizar renderMethod/renderMethodStages sem reimplementar a UI', () => {
  // method_coaching: null simula a mesma cobertura best-effort já usada
  // em outros testes ("Method/Coaching indisponível, mas a leitura
  // atual continua disponível") — em produção, quando method_coaching
  // carrega normalmente, seu `method.stages` é sempre uma cópia exata
  // de `current_reading.reading.method.stages` (o mesmo objeto de
  // origem, ver canonical-method-coaching-source.ts), nunca divergente;
  // aqui isolamos deliberadamente o fallback para `reading.method` para
  // não depender de replicar essa cópia no fixture de teste.
  const ctx = buildIntegratedContext({
    current_reading: buildCurrentReading({
      reading: {
        method: {
          configured: true,
          name: 'Método Consultivo',
          stages: [
            { step_order: 1, stage_key: 'abertura', name: 'Abertura', status: 'completed', explanation: 'Contexto estabelecido.', evidence_message_ids: [], memory_ids: [] },
            { step_order: 2, stage_key: 'diagnostico', name: 'Diagnóstico', status: 'active', explanation: 'Descoberta em andamento.', evidence_message_ids: [], memory_ids: [] },
          ],
          current_stage: { step_order: 2, stage_key: 'diagnostico', name: 'Diagnóstico' },
          adherence: { status: 'on_method', summary: 'ok', deviation_stage_order: null, what_happened: null, missing_information: [], why_it_matters: null, evidence_message_ids: [], memory_ids: [] },
          recovery_guidance: null,
        },
      },
    }),
    method_coaching: null,
  })

  const vm = buildAnalysisViewModel(ctx)
  assert.equal(vm.seller_conduct.method.stages.length, 2)
  assert.equal(vm.seller_conduct.method.current_stage.name, 'Diagnóstico')
  assert.equal(vm.opportunity.stage_name, 'Diagnóstico')
})

test('improvement point preserva impact separado de why_it_matters/how_to_improve', () => {
  const ctx = buildIntegratedContext({
    method_coaching: buildMethodCoaching({
      coaching: {
        seller_strengths: [],
        improvement_points: [
          { kind: 'other', summary: 'Ponto de melhoria.', why_it_matters: 'Por que importa.', impact: 'Impacto concreto.', how_to_improve: 'Como corrigir.', evidence_message_ids: [], memory_ids: [] },
        ],
        source_event_id: 'event-1',
        generated_at: REFERENCE_TIME,
      },
    }),
  })

  const vm = buildAnalysisViewModel(ctx)
  assert.equal(vm.improvements[0].impact, 'Impacto concreto.')
})

// 28/29 — continuidade / cross-conversation.
test('history continuity: cross_conversation_coaching sempre histórico, nunca current, máximo 3', () => {
  const ctx = buildIntegratedContext({
    cycle_memory: buildCycleMemory({ conversation_keys: [CONVERSATION_KEY, 'whatsapp:+5547999990002'] }),
    method_coaching: buildMethodCoaching({
      cross_conversation_coaching: Array.from({ length: 4 }, (_, i) => ({
        conversation_key: `whatsapp:+554799999${i}`,
        source_event_id: `event-${i}`,
        generated_at: REFERENCE_TIME,
        seller_strengths: [{ kind: 'good_discovery', summary: 's', why_it_matters: 'w', evidence_message_ids: [], memory_ids: [] }],
        improvement_points: [],
      })),
    }),
  })

  const vm = buildAnalysisViewModel(ctx)
  assert.equal(vm.continuity.cycle_conversation_count, 2)
  assert.equal(vm.continuity.cross_conversation_signals.length, 3)
  assert.equal(vm.continuity.cross_conversation_signals[0].strengths_count, 1)
})

// 30 — history/evolution.
test('history reflete commercial_evolution verbatim', () => {
  const vm = buildAnalysisViewModel(buildIntegratedContext())
  assert.equal(vm.history.length, 1)
  assert.equal(vm.history[0].key, 'contato')
})

// current_moment.
test('current_moment.is_active_session reflete Decision State verbatim, incluindo null (indeterminado)', () => {
  const ctxActive = buildIntegratedContext()
  assert.equal(buildAnalysisViewModel(ctxActive).current_moment.is_active_session, true)

  const ctxUnknown = buildIntegratedContext({
    decision_state: { ...buildIntegratedContext().decision_state, current_moment: { commercial_relevance: null, is_active_session: null, last_interaction_at: null, session_gap_ms: 14400000 } },
  })
  assert.equal(buildAnalysisViewModel(ctxUnknown).current_moment.is_active_session, null)
})

// provenance.
test('provenance preserva reference_time/state_record_id/state_version/cycle_memory_conversation_keys', () => {
  const vm = buildAnalysisViewModel(buildIntegratedContext())
  assert.equal(vm.provenance.reference_time, REFERENCE_TIME)
  assert.equal(vm.provenance.state_record_id, 'state-1')
  assert.equal(vm.provenance.state_version, 3)
  assert.deepEqual(vm.provenance.cycle_memory_conversation_keys, [CONVERSATION_KEY])
})

// AGORA não é reconstruída aqui / ANÁLISE não gera CTA de AGORA / não gera mensagem.
test('módulo nunca lê decision_state.primary_decision/interventions para montar risks/blockers (não duplica a seleção de AGORA)', () => {
  const ctx = buildIntegratedContext({
    decision_state: {
      ...buildIntegratedContext().decision_state,
      primary_decision: { kind: 'escalate', source: 'client_sla', silent: false, priority: 'critical', summary: 'SINAL SÓ DE AGORA — NÃO PODE VAZAR PARA ANÁLISE', reason: 'r', recommended_action: 'a', evidence_message_ids: [], memory_ids: [] },
      interventions: [{ source: 'client_sla', kind: 'escalate', priority: 'critical', summary: 'OUTRO SINAL SÓ DE AGORA', reason: 'r', recommended_action: 'a', evidence_message_ids: [], memory_ids: [], observed_at: REFERENCE_TIME, resolve_condition: 'x' }],
    },
  })

  const vm = buildAnalysisViewModel(ctx)
  const serialized = JSON.stringify(vm)
  assert.doesNotMatch(serialized, /SINAL SÓ DE AGORA/)
})

test('MIE seller-facing e auto-send continuam inativos: módulo não expõe nenhuma função de envio/despacho/geração de mensagem', async () => {
  const { readFileSync } = await import('node:fs')
  const source = readFileSync(new URL('./analysis-view-model.ts', import.meta.url), 'utf8')
  assert.ok(!/\bsend[A-Z]|auto_send|autoSend|dispatchMessage|generateMessage|suggested_message/.test(source))
})

test('nenhum headline/summary é gerado por template com placeholder — todo texto seller-facing vem de campos verbatim das fontes canônicas', () => {
  const ctx = buildIntegratedContext({
    current_reading: buildCurrentReading({
      reading: { conversation_summary: { initial_context: null, evolution: null, important_events: [], current_state: evidence(''), last_customer_request_or_decision: null } },
    }),
  })

  const vm = buildAnalysisViewModel(ctx)
  // Campo vazio na fonte produz `null`, nunca um texto inventado tipo
  // "A venda está evoluindo." (mandato §21/§23).
  assert.equal(vm.opportunity.headline, null)
})
