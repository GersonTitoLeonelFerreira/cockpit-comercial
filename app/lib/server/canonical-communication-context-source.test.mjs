import assert from 'node:assert/strict'
import test from 'node:test'

import {
  loadCanonicalCommunicationContext,
} from './canonical-communication-context-source.ts'

const COMPANY_ID = '10000000-0000-4000-8000-000000000001'
const OTHER_COMPANY_ID = '10000000-0000-4000-8000-000000000002'

const CYCLE_ID = '30000000-0000-4000-8000-000000000001'
const OTHER_CYCLE_ID = '30000000-0000-4000-8000-000000000002'

const CONVERSATION_KEY = 'whatsapp:+5547999990001'
const OTHER_CONVERSATION_KEY = 'whatsapp:+5547999990002'

const REFERENCE_TIME = '2026-09-09T17:00:00.000Z'

// Admin que nunca deveria ser consultado quando todas as fontes
// suplementares são fornecidas pelo chamador (comportamento padrão dos
// testes abaixo) — qualquer chamada real a `.from()` derruba o teste,
// provando que não há double-scan.
function createUnusedAdmin() {
  return {
    from() {
      assert.fail(
        'admin.from() não deveria ser chamado quando as fontes suplementares já foram fornecidas',
      )
    },
  }
}

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

function buildDecisionState(overrides = {}) {
  return {
    company_id: COMPANY_ID,
    cycle_id: CYCLE_ID,
    conversation_key: CONVERSATION_KEY,
    reference_time: REFERENCE_TIME,

    current_moment: {
      commercial_relevance: 'commercial',
      is_active_session: true,
      last_interaction_at: '2026-09-09T16:55:00.000Z',
      session_gap_ms: 14400000,
    },

    primary_decision: {
      kind: 'no_intervention',
      source: null,
      summary: 'Nenhuma leitura comercial disponível e nenhum sinal operacional pendente.',
      reason: 'Sem evidência suficiente para recomendar qualquer ação agora.',
      recommended_action: 'Nenhuma ação necessária agora.',
      evidence_message_ids: [],
      memory_ids: [],
    },

    interventions: [],

    operational_signal_availability: {
      crm_pipeline: 'NOT_AVAILABLE',
      agenda: 'PARTIAL',
      sla: 'NOT_AVAILABLE',
      waiting: 'NOT_AVAILABLE',
      commitments: 'AVAILABLE_NOW',
      opportunity_inactivity: 'NOT_AVAILABLE',
    },

    provenance: {
      conversation_key: CONVERSATION_KEY,
      cycle_id: CYCLE_ID,
      analise_source_event_id: 'event-current-1',
      analise_state_record_id: 'state-record-1',
      analise_state_version: 3,
      analise_state_updated_at: '2026-09-09T16:59:00.000Z',
      agora_updated_at: null,
      client_context_generated_at: null,
    },

    ...overrides,
  }
}

function buildInterventionCard(overrides = {}) {
  return {
    source: 'commercial_risk',
    kind: 'handle_objection',
    priority: 'medium',
    summary: 'Card padrão.',
    reason: 'Motivo padrão.',
    recommended_action: 'Ação padrão.',
    evidence_message_ids: ['m1'],
    memory_ids: [],
    observed_at: REFERENCE_TIME,
    resolve_condition: 'Resolve quando tratado.',
    ...overrides,
  }
}

function buildCycleMemoryItem(overrides = {}) {
  return {
    kind: 'default_kind',
    summary: 'Resumo padrão.',
    evidence_message_ids: ['m1'],
    memory_status: 'active',
    created_in_state_version: 1,
    updated_in_state_version: 1,
    closed_in_state_version: null,
    memory_id: 'memory-default',
    origin_id: 'origin-default',
    provenance: {
      conversation_key: CONVERSATION_KEY,
      state_record_id: 'state-record-1',
      state_version: 3,
    },
    ...overrides,
  }
}

function buildCommitmentItem(overrides = {}) {
  return buildCycleMemoryItem({
    commitment_status: 'confirmed',
    scheduled_at: '2026-09-08T10:00:00.000Z',
    proposed_at: null,
    ...overrides,
  })
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
      conversation_key: CONVERSATION_KEY,
      agora_updated_at: null,
      analise_source_event_id: 'event-current-1',
      analise_state_record_id: 'state-record-1',
      analise_state_version: 3,
    },

    ...overrides,
  }
}

function load({
  admin = createUnusedAdmin(),
  company_id = COMPANY_ID,
  cycle_id = CYCLE_ID,
  conversation_key = CONVERSATION_KEY,
  reference_time = REFERENCE_TIME,
  decision_state = buildDecisionState(),
  current_reading = null,
  cycle_memory = null,
  method_coaching = null,
} = {}) {
  return loadCanonicalCommunicationContext({
    admin,
    company_id,
    cycle_id,
    conversation_key,
    reference_time,
    decision_state,
    current_reading,
    cycle_memory,
    method_coaching,
  })
}

// 1. Decision = respond: Communication Context orienta resposta, não
// redefine decisão.
test('decision respond: comunicação orienta resposta sem redefinir a decisão', async () => {
  const decisionState = buildDecisionState({
    primary_decision: {
      kind: 'respond',
      source: 'customer_waiting',
      summary: 'Cliente aguardando resposta.',
      reason: 'Cliente aguarda resposta há horas.',
      recommended_action: 'Responder o cliente.',
      evidence_message_ids: ['m1'],
      memory_ids: [],
    },
  })

  const context = await load({ decision_state: decisionState })

  assert.equal(context.executable, true)
  assert.equal(context.decision_kind, 'respond')
  assert.equal(context.communication_goal, 'Responder ao cliente.')
  assert.equal(context.do_not_generate, false)
  assert.deepEqual(context.dominant_intent, decisionState.primary_decision)
})

// 2. Decision = no_intervention: DO_NOT_GENERATE.
test('decision no_intervention: do_not_generate verdadeiro', async () => {
  const context = await load()

  assert.equal(context.executable, true)
  assert.equal(context.decision_kind, 'no_intervention')
  assert.equal(context.do_not_generate, true)
})

// 3. Decision = give_space: sem pitch comercial.
test('decision give_space: constraint impede pitch comercial', async () => {
  const decisionState = buildDecisionState({
    primary_decision: {
      kind: 'give_space',
      source: null,
      summary: 'Sessão atual não é comercial.',
      reason: 'Preservar naturalidade — não forçar avanço de venda nesta interação.',
      recommended_action: 'Responder no tom da conversa atual sem empurrar a venda.',
      evidence_message_ids: [],
      memory_ids: [],
    },
  })

  const context = await load({ decision_state: decisionState })

  assert.equal(context.do_not_generate, false)
  assert.ok(context.constraints.some((c) => c.source === 'give_space'))
  assert.ok(context.prohibited_moves.includes('introduce_pitch'))
  assert.ok(context.prohibited_moves.includes('resurface_commercial_objection'))
})

// 4. Give_space + intervenção operacional: operacional preservada como
// contexto secundário, não vira pitch.
test('give_space com intervenção operacional: sinal preservado em supporting_context, não vira pitch', async () => {
  const operationalCard = buildInterventionCard({
    source: 'client_sla',
    summary: 'SLA crítico.',
  })

  const decisionState = buildDecisionState({
    primary_decision: {
      kind: 'give_space',
      source: null,
      summary: 'Sessão atual não é comercial.',
      reason: 'Preservar naturalidade.',
      recommended_action: 'Responder no tom da conversa atual.',
      evidence_message_ids: [],
      memory_ids: [],
    },
    interventions: [operationalCard],
  })

  const context = await load({ decision_state: decisionState })

  assert.equal(context.decision_kind, 'give_space')
  assert.equal(context.supporting_context.length, 1)
  assert.equal(context.supporting_context[0].source, 'client_sla')
  assert.ok(context.prohibited_moves.includes('introduce_pitch'))
})

// 5. Handle objection: objeção específica disponível.
test('handle_objection: objeção específica resolvida em opportunity_context', async () => {
  const objection = {
    kind: 'price',
    severity: 'high',
    summary: 'Objeção bloqueadora de preço.',
    evidence_message_ids: ['m9'],
    memory_ids: [],
  }

  const decisionState = buildDecisionState({
    primary_decision: {
      kind: 'handle_objection',
      source: 'commercial_risk',
      summary: objection.summary,
      reason: 'Objeção do cliente ainda em aberto na leitura atual.',
      recommended_action: 'Tratar a objeção antes de avançar a conversa.',
      evidence_message_ids: objection.evidence_message_ids,
      memory_ids: [],
    },
  })

  const currentReading = buildCurrentReading({
    reading: buildReading({
      risks: {
        customer_objections: [objection],
        service_risks: [],
      },
    }),
  })

  const context = await load({
    decision_state: decisionState,
    current_reading: currentReading,
  })

  assert.ok(context.opportunity_context.referenced_objection)
  assert.equal(context.opportunity_context.referenced_objection.origin, 'commercial_reading')
  assert.equal(context.opportunity_context.referenced_objection.risk.summary, objection.summary)
})

test('risco de atendimento (confirm_information) não é resolvido como objeção, mesmo com texto coincidente', async () => {
  // Achado do Codex (PR #281, rodada 4): `commercial_risk` cobre tanto
  // objeção do cliente (`kind: 'handle_objection'`) quanto risco de
  // atendimento (`kind: 'confirm_information'`) — sem checar `kind`, um
  // candidato de risco de atendimento com o MESMO texto de uma objeção já
  // suprimida (ex.: numa sessão não comercial, onde `confirm_information`
  // sobrevive mas `handle_objection` é suprimido) poderia ressuscitar essa
  // objeção via correspondência de texto.
  const sharedSummary = 'Prazo de entrega pode não ser cumprido.'

  const currentReading = buildCurrentReading({
    reading: buildReading({
      risks: {
        customer_objections: [
          {
            kind: 'price',
            severity: 'high',
            summary: sharedSummary,
            evidence_message_ids: ['m-objection'],
            memory_ids: [],
          },
        ],
        service_risks: [
          {
            kind: 'delivery',
            severity: 'high',
            summary: sharedSummary,
            evidence_message_ids: ['m-risk'],
            memory_ids: [],
          },
        ],
      },
    }),
  })

  const decisionState = buildDecisionState({
    primary_decision: {
      kind: 'confirm_information',
      source: 'commercial_risk',
      summary: sharedSummary,
      reason: 'Risco de atendimento em aberto.',
      recommended_action: 'Confirmar prazo de entrega com o time interno.',
      evidence_message_ids: ['m-risk'],
      memory_ids: [],
    },
  })

  const context = await load({
    decision_state: decisionState,
    current_reading: currentReading,
  })

  assert.equal(context.decision_kind, 'confirm_information')
  assert.equal(context.opportunity_context.referenced_objection, null)
})

test('duas objeções com o mesmo resumo mas evidência diferente: resolve a que o candidato realmente referencia', async () => {
  // Achado do Codex (PR #281, rodada 5): `normalizeRisks` não exige
  // unicidade de texto entre objeções — comparar só por `summary` podia
  // resolver a PRIMEIRA objeção de texto igual, não necessariamente a que
  // o Decision State selecionou (que pode ser a de evidência/severidade
  // diferente, adicionada depois).
  const sharedSummary = 'Objeção de preço.'

  const firstObjection = {
    kind: 'price',
    severity: 'medium',
    summary: sharedSummary,
    evidence_message_ids: ['m-first'],
    memory_ids: ['mem-first'],
  }

  const secondObjection = {
    kind: 'price',
    severity: 'high',
    summary: sharedSummary,
    evidence_message_ids: ['m-second'],
    memory_ids: ['mem-second'],
  }

  const currentReading = buildCurrentReading({
    reading: buildReading({
      risks: {
        customer_objections: [firstObjection, secondObjection],
        service_risks: [],
      },
    }),
  })

  const decisionState = buildDecisionState({
    primary_decision: {
      kind: 'handle_objection',
      source: 'commercial_risk',
      summary: sharedSummary,
      reason: 'Objeção do cliente ainda em aberto na leitura atual.',
      recommended_action: 'Tratar a objeção antes de avançar a conversa.',
      evidence_message_ids: secondObjection.evidence_message_ids,
      memory_ids: secondObjection.memory_ids,
    },
  })

  const context = await load({
    decision_state: decisionState,
    current_reading: currentReading,
  })

  assert.ok(context.opportunity_context.referenced_objection)
  assert.deepEqual(
    context.opportunity_context.referenced_objection.risk,
    secondObjection,
  )
})

test('duas objeções com resumo E evidência idênticos (só severidade/kind diferentes): match ambíguo não é resolvido', async () => {
  // Achado do Codex (PR #281, rodada 6): `CommercialReadingRisk` não tem
  // identificador estável próprio — mesmo summary+evidence_message_ids+
  // memory_ids iguais não impedem duas objeções distintas (severidade ou
  // kind diferentes, nenhum dos dois preservado no candidato) de
  // coincidir nesses campos. Sem uma identidade totalmente inequívoca,
  // resolver a primeira seria adivinhar — o correto é tratar como não
  // resolvível.
  const sharedSummary = 'Objeção de preço.'
  const sharedEvidence = ['m-shared']
  const sharedMemory = ['mem-shared']

  const objectionA = {
    kind: 'price',
    severity: 'medium',
    summary: sharedSummary,
    evidence_message_ids: sharedEvidence,
    memory_ids: sharedMemory,
  }

  const objectionB = {
    kind: 'timing',
    severity: 'high',
    summary: sharedSummary,
    evidence_message_ids: sharedEvidence,
    memory_ids: sharedMemory,
  }

  const currentReading = buildCurrentReading({
    reading: buildReading({
      risks: {
        customer_objections: [objectionA, objectionB],
        service_risks: [],
      },
    }),
  })

  const decisionState = buildDecisionState({
    primary_decision: {
      kind: 'handle_objection',
      source: 'commercial_risk',
      summary: sharedSummary,
      reason: 'Objeção do cliente ainda em aberto na leitura atual.',
      recommended_action: 'Tratar a objeção antes de avançar a conversa.',
      evidence_message_ids: sharedEvidence,
      memory_ids: sharedMemory,
    },
  })

  const context = await load({
    decision_state: decisionState,
    current_reading: currentReading,
  })

  assert.equal(context.opportunity_context.referenced_objection, null)
})

// 6. Objeção histórica resolvida: não ressuscitar.
test('objeção resolvida (fora da leitura atual) não é ressuscitada', async () => {
  // A objeção só existe em `resolved_information`/histórico — a leitura
  // ATUAL não a lista mais em `risks.customer_objections`, e o Decision
  // State (autoridade sobre risco) não a promoveu a candidato. Nenhuma
  // lógica de Communication Context re-escaneia `resolved_information`
  // por conta própria.
  const currentReading = buildCurrentReading({
    reading: buildReading({
      customer: buildReading().customer,
      risks: {
        customer_objections: [],
        service_risks: [],
      },
    }),
  })

  const decisionState = buildDecisionState()

  const context = await load({
    decision_state: decisionState,
    current_reading: currentReading,
  })

  assert.equal(context.opportunity_context.referenced_objection, null)
})

// 7. Follow-up de compromisso: usar compromisso correto.
test('follow_up: compromisso correto resolvido por memory_id', async () => {
  const commitment = buildCommitmentItem({
    memory_id: 'commit-1',
    summary: 'Enviar a proposta comercial até quinta.',
  })

  const otherCommitment = buildCommitmentItem({
    memory_id: 'commit-2',
    summary: 'Compromisso não referenciado.',
  })

  const decisionState = buildDecisionState({
    primary_decision: {
      kind: 'follow_up',
      source: 'cycle_commitment',
      summary: commitment.summary,
      reason: 'Compromisso agendado já venceu.',
      recommended_action: 'Confirmar com o cliente o andamento do compromisso.',
      evidence_message_ids: ['m1'],
      memory_ids: [commitment.memory_id],
    },
  })

  const context = await load({
    decision_state: decisionState,
    cycle_memory: buildCycleMemory({
      commitments: [otherCommitment, commitment],
    }),
  })

  assert.ok(context.opportunity_context.referenced_commitment)
  assert.equal(
    context.opportunity_context.referenced_commitment.commitment.memory_id,
    'commit-1',
  )
})

// 8. reschedule_requested: orientar reconciliação, não tratar horário
// antigo como confirmado.
test('reschedule_requested: constraint de reconciliação, horário antigo não tratado como confirmado', async () => {
  const commitment = buildCommitmentItem({
    memory_id: 'commit-reschedule',
    summary: 'Reunião de fechamento.',
    commitment_status: 'reschedule_requested',
  })

  const decisionState = buildDecisionState({
    primary_decision: {
      kind: 'follow_up',
      source: 'cycle_commitment',
      summary: commitment.summary,
      reason: 'Pedido de reagendamento pendente.',
      recommended_action: 'Confirmar com o cliente o novo horário do compromisso.',
      evidence_message_ids: ['m1'],
      memory_ids: [commitment.memory_id],
    },
  })

  const context = await load({
    decision_state: decisionState,
    cycle_memory: buildCycleMemory({ commitments: [commitment] }),
  })

  const constraint = context.constraints.find((c) => c.source === 'reschedule_pending')

  assert.ok(constraint)
  assert.ok(context.prohibited_moves.includes('treat_original_time_as_confirmed'))
})

// 9. Customer waiting: objetivo responder.
test('customer_waiting: communication_goal é responder', async () => {
  const decisionState = buildDecisionState({
    primary_decision: {
      kind: 'respond',
      source: 'customer_waiting',
      summary: 'Cliente aguardando resposta.',
      reason: 'Cliente aguarda resposta.',
      recommended_action: 'Responder o cliente.',
      evidence_message_ids: [],
      memory_ids: [],
    },
  })

  const context = await load({ decision_state: decisionState })

  assert.equal(context.communication_goal, 'Responder ao cliente.')
})

// 10. SLA stage risk sem mensagem pendente: não inventar que cliente está
// esperando.
test('SLA de estagnação de etapa (escalate): não inventa mensagem pendente do cliente', async () => {
  const decisionState = buildDecisionState({
    primary_decision: {
      kind: 'escalate',
      source: 'client_sla',
      summary: 'Etapa estagnada.',
      reason: 'SLA da etapa vencido, sem mensagem pendente do cliente.',
      recommended_action: 'Avaliar o próximo passo da oportunidade — não é uma mensagem do cliente aguardando resposta.',
      evidence_message_ids: [],
      memory_ids: [],
    },
  })

  const context = await load({ decision_state: decisionState })

  assert.equal(context.decision_kind, 'escalate')
  assert.equal(context.communication_goal, 'Agir sobre a estagnação operacional.')
  assert.notEqual(context.communication_goal, 'Responder ao cliente.')
})

// 11. Method deviation: vira restrição de abordagem, não jargão interno.
test('desvio de método vira approach_constraint, com texto seller-facing (não jargão para o cliente)', async () => {
  const decisionState = buildDecisionState({
    primary_decision: {
      kind: 'deepen_discovery',
      source: 'method_adherence',
      summary: 'Desvio de método relevante agora.',
      reason: 'Pulou etapa de diagnóstico.',
      recommended_action: 'Aprofundar a descoberta antes de avançar para a próxima etapa.',
      evidence_message_ids: ['m1'],
      memory_ids: [],
    },
  })

  const context = await load({ decision_state: decisionState })

  assert.equal(
    context.method_context.approach_constraint,
    'Aprofundar a descoberta antes de avançar para a próxima etapa.',
  )
  assert.ok(!context.method_context.approach_constraint.toLowerCase().includes('etapa do método'))
  const constraint = context.constraints.find((c) => c.source === 'method_adherence')
  assert.ok(constraint)
})

test('missing_information do method_coaching suprido é exposta em method_context', async () => {
  const decisionState = buildDecisionState({
    primary_decision: {
      kind: 'insufficient_information',
      source: 'insufficient_information',
      summary: 'Descoberta insuficiente para decidir o próximo passo.',
      reason: 'Faltam impacto e critérios de decisão.',
      recommended_action: 'Aprofundar a descoberta antes de avançar para a próxima etapa.',
      evidence_message_ids: ['m1'],
      memory_ids: [],
    },
  })

  const methodCoaching = buildMethodCoaching({
    method: {
      configured: true,
      name: 'Método X',
      stages: [],
      agora_stage: null,
      analise_stage: null,
      stage_divergence: false,
      stage_comparison_reliable: false,
      adherence: null,
      recovery_guidance: {
        objective: 'Confirmar impacto antes de apresentar solução.',
        missing_information: ['impacto', 'critérios de decisão'],
        recommended_move: 'Perguntar sobre o impacto do problema.',
        optional_question: null,
        evidence_message_ids: ['m1'],
        memory_ids: [],
      },
    },
  })

  const context = await load({
    decision_state: decisionState,
    method_coaching: methodCoaching,
  })

  assert.deepEqual(
    context.method_context.missing_information,
    ['impacto', 'critérios de decisão'],
  )
  assert.equal(
    context.provenance.method_coaching_provenance,
    methodCoaching.provenance,
  )
})

test('missing_information NÃO vaza quando nenhum candidato de método/coaching foi selecionado pelo Decision State', async () => {
  // Achado do Codex (PR #281, rodada 1): recovery_guidance.missing_information
  // era exposta incondicionalmente, mesmo quando o candidato de método foi
  // preterido por um sinal operacional de maior prioridade (SLA) — um
  // gerador futuro agiria sobre um candidato que o Decision State
  // deliberadamente não selecionou.
  const decisionState = buildDecisionState({
    primary_decision: {
      kind: 'respond',
      source: 'client_sla',
      summary: 'SLA crítico.',
      reason: 'SLA vencido.',
      recommended_action: 'Responder o cliente.',
      evidence_message_ids: [],
      memory_ids: [],
    },
    interventions: [],
  })

  const methodCoaching = buildMethodCoaching({
    method: {
      configured: true,
      name: 'Método X',
      stages: [],
      agora_stage: null,
      analise_stage: null,
      stage_divergence: false,
      stage_comparison_reliable: false,
      adherence: null,
      recovery_guidance: {
        objective: 'Confirmar impacto antes de apresentar solução.',
        missing_information: ['impacto'],
        recommended_move: 'Perguntar sobre o impacto do problema.',
        optional_question: null,
        evidence_message_ids: ['m1'],
        memory_ids: [],
      },
    },
  })

  const context = await load({
    decision_state: decisionState,
    method_coaching: methodCoaching,
  })

  assert.equal(context.method_context.approach_constraint, null)
  assert.deepEqual(context.method_context.missing_information, [])
})

test('seller_coaching sozinho (method_adherence suprimido) não autoriza expor missing_information de recovery_guidance', async () => {
  // Achado do Codex (PR #281, rodada 2): meu gate por `candidate`
  // genérico (method_adherence OU seller_coaching OU
  // insufficient_information) ainda era amplo demais — um
  // `seller_coaching` sempre-urgente sobrevive mesmo quando
  // `method_adherence` foi suprimido (ex.: sessão não comercial), e não
  // tem relação semântica com `recovery_guidance` (que só existe para
  // desvio de método/descoberta insuficiente).
  const decisionState = buildDecisionState({
    interventions: [
      buildInterventionCard({
        source: 'seller_coaching',
        summary: 'Informação incorreta repassada ao cliente.',
        reason: 'Vendedor informou dado incorreto.',
        recommended_action: 'Corrigir a informação incorreta com o cliente.',
      }),
    ],
  })

  const methodCoaching = buildMethodCoaching({
    method: {
      configured: true,
      name: 'Método X',
      stages: [],
      agora_stage: null,
      analise_stage: null,
      stage_divergence: false,
      stage_comparison_reliable: false,
      adherence: null,
      recovery_guidance: {
        objective: 'Confirmar impacto antes de apresentar solução.',
        missing_information: ['impacto'],
        recommended_move: 'Perguntar sobre o impacto do problema.',
        optional_question: null,
        evidence_message_ids: ['m1'],
        memory_ids: [],
      },
    },
  })

  const context = await load({
    decision_state: decisionState,
    method_coaching: methodCoaching,
  })

  // approach_constraint pode vir do seller_coaching (é literalmente a
  // orientação de abordagem dele) — só missing_information (específico de
  // recovery_guidance) precisa ficar vazio.
  assert.equal(
    context.method_context.approach_constraint,
    'Corrigir a informação incorreta com o cliente.',
  )
  assert.deepEqual(context.method_context.missing_information, [])
})

test('method_coaching de outra análise (mesmo escopo/reference_time, provenance divergente) cai para carga interna', async () => {
  // Achado do Codex (PR #281, rodada 2): a mesma amarração exigida de
  // current_reading contra decision_state.provenance também precisa
  // valer para method_coaching — escopo e reference_time batendo não
  // provam que veio da mesma análise.
  const decisionState = buildDecisionState()

  const failingAdmin = {
    from() {
      throw new Error('DB indisponível no teste')
    },
  }

  const mismatchedMethodCoaching = buildMethodCoaching({
    provenance: {
      conversation_key: CONVERSATION_KEY,
      agora_updated_at: null,
      analise_source_event_id: 'event-OTHER',
      analise_state_record_id: 'state-record-OTHER',
      analise_state_version: 99,
    },
    method: {
      configured: true,
      name: 'Método X',
      stages: [],
      agora_stage: null,
      analise_stage: null,
      stage_divergence: false,
      stage_comparison_reliable: false,
      adherence: null,
      recovery_guidance: {
        objective: 'Objetivo de outra análise.',
        missing_information: ['dado de outra análise'],
        recommended_move: 'Mover de outra análise.',
        optional_question: null,
        evidence_message_ids: ['m1'],
        memory_ids: [],
      },
    },
  })

  const context = await load({
    admin: failingAdmin,
    decision_state: decisionState,
    method_coaching: mismatchedMethodCoaching,
  })

  // O objeto de escopo/instante divergente é descartado — o que volta é
  // uma carga interna (degradada, já que o admin de teste falha em toda
  // consulta), nunca o `missing_information`/`provenance` da fonte
  // divergente fornecida.
  assert.equal(context.executable, true)
  assert.notEqual(
    context.provenance.method_coaching_provenance
      ?.analise_source_event_id,
    'event-OTHER',
  )
  assert.deepEqual(context.method_context.missing_information, [])
})

test('reschedule_requested em intervenção secundária gera constraint mesmo quando a decisão principal referencia OUTRO compromisso', async () => {
  // Achado do Codex (PR #281, rodada 1): resolver só o primeiro
  // compromisso referenciado fazia a decisão principal (compromisso
  // confirmado vencido) "esconder" um pedido de reagendamento numa
  // intervenção secundária.
  const overdueCommitment = buildCommitmentItem({
    memory_id: 'commit-overdue',
    summary: 'Compromisso confirmado vencido.',
    commitment_status: 'confirmed',
  })

  const rescheduleCommitment = buildCommitmentItem({
    memory_id: 'commit-reschedule-secondary',
    summary: 'Compromisso com pedido de reagendamento.',
    commitment_status: 'reschedule_requested',
  })

  const decisionState = buildDecisionState({
    primary_decision: {
      kind: 'follow_up',
      source: 'cycle_commitment',
      summary: overdueCommitment.summary,
      reason: 'Compromisso vencido.',
      recommended_action: 'Confirmar com o cliente.',
      evidence_message_ids: [],
      memory_ids: [overdueCommitment.memory_id],
    },
    interventions: [
      buildInterventionCard({
        source: 'cycle_commitment',
        summary: rescheduleCommitment.summary,
        memory_ids: [rescheduleCommitment.memory_id],
      }),
    ],
  })

  const context = await load({
    decision_state: decisionState,
    cycle_memory: buildCycleMemory({
      commitments: [overdueCommitment, rescheduleCommitment],
    }),
  })

  assert.equal(
    context.opportunity_context.referenced_commitment.commitment.memory_id,
    'commit-overdue',
  )

  const constraint = context.constraints.find((c) => c.source === 'reschedule_pending')
  assert.ok(constraint)
  assert.ok(context.prohibited_moves.includes('treat_original_time_as_confirmed'))
})

test('give_space com intervenção de reschedule_requested: prohibited_moves inclui treat_original_time_as_confirmed além das proibições de give_space', async () => {
  // Achado do Codex (PR #281, rodada 3): o ramo `give_space` de
  // `buildMoves` retornava uma lista fixa de `prohibited_moves`, sem
  // aplicar `hasReschedulePendingConstraint` — um compromisso com pedido
  // de reagendamento sobrevivendo como supporting_context numa sessão
  // pessoal (mandato §12) perdia essa proibição especificamente nesse
  // ramo, apesar de `buildConstraints` já detectar a constraint
  // corretamente.
  const rescheduleCommitment = buildCommitmentItem({
    memory_id: 'commit-reschedule-give-space',
    summary: 'Compromisso com pedido de reagendamento durante sessão pessoal.',
    commitment_status: 'reschedule_requested',
  })

  const decisionState = buildDecisionState({
    primary_decision: {
      kind: 'give_space',
      source: null,
      summary: 'Sessão atual não é comercial.',
      reason: 'Preservar naturalidade.',
      recommended_action: 'Responder no tom da conversa atual.',
      evidence_message_ids: [],
      memory_ids: [],
    },
    interventions: [
      buildInterventionCard({
        source: 'cycle_commitment',
        summary: rescheduleCommitment.summary,
        memory_ids: [rescheduleCommitment.memory_id],
      }),
    ],
  })

  const context = await load({
    decision_state: decisionState,
    cycle_memory: buildCycleMemory({ commitments: [rescheduleCommitment] }),
  })

  assert.equal(context.decision_kind, 'give_space')
  assert.ok(context.prohibited_moves.includes('introduce_pitch'))
  assert.ok(context.prohibited_moves.includes('treat_original_time_as_confirmed'))
})

test('decision wait: do_not_generate verdadeiro (não gerar contrariando a decisão de aguardar)', async () => {
  // Achado do Codex (PR #281, rodada 1): `wait` não estava coberto por
  // `do_not_generate`, permitindo que um gerador futuro produzisse uma
  // mensagem mesmo quando a decisão foi "aguardar antes de agir".
  const decisionState = buildDecisionState({
    primary_decision: {
      kind: 'wait',
      source: null,
      summary: 'Aguardar antes de agir.',
      reason: 'Nada novo sustentado pelo contexto atual.',
      recommended_action: 'Canal recomendado: none.',
      evidence_message_ids: ['m1'],
      memory_ids: [],
    },
  })

  const context = await load({ decision_state: decisionState })

  assert.equal(context.decision_kind, 'wait')
  assert.equal(context.do_not_generate, true)
})

test('current_reading de outra versão do Decision State (mesmo escopo, não do futuro) é descartada', async () => {
  // Achado do Codex (PR #281, rodada 1): escopo + "não é do futuro" não
  // provam que é a MESMA leitura que produziu a decisão — só
  // `decision_state.provenance` identifica isso com precisão.
  const decisionState = buildDecisionState()

  const mismatchedVersionReading = buildCurrentReading({
    state_record_id: 'state-record-OTHER',
    state_version: 99,
    source_event_id: 'event-OTHER',
    reading: buildReading({
      customer: {
        ...buildReading().customer,
        preferences: [evidence('Preferência de outra versão da leitura.')],
      },
    }),
  })

  const context = await load({
    decision_state: decisionState,
    current_reading: mismatchedVersionReading,
  })

  assert.deepEqual(context.customer_context.preferences, [])
  assert.equal(context.provenance.commercial_reading_state_updated_at, null)
})

test('decision_state sem nenhuma leitura (provenance nula): current_reading fornecido é descartado', async () => {
  const decisionState = buildDecisionState({
    provenance: {
      conversation_key: CONVERSATION_KEY,
      cycle_id: CYCLE_ID,
      analise_source_event_id: null,
      analise_state_record_id: null,
      analise_state_version: null,
      analise_state_updated_at: null,
      agora_updated_at: null,
      client_context_generated_at: null,
    },
  })

  const context = await load({
    decision_state: decisionState,
    current_reading: buildCurrentReading(),
  })

  assert.deepEqual(context.customer_context.preferences, [])
})

// 12. Seller coaching: vira orientação de comunicação, não texto ao
// cliente.
test('seller coaching vira constraint de comunicação interna, não aparece como texto ao cliente', async () => {
  const decisionState = buildDecisionState({
    interventions: [
      buildInterventionCard({
        source: 'seller_coaching',
        summary: 'Preço apresentado antes da hora.',
        reason: 'Vendedor apresentou preço sem descoberta suficiente.',
        recommended_action: 'Evitar reforçar preço agora; aprofundar descoberta primeiro.',
      }),
    ],
  })

  const context = await load({ decision_state: decisionState })

  const constraint = context.constraints.find((c) => c.source === 'seller_coaching')

  assert.ok(constraint)
  assert.equal(constraint.statement, 'Evitar reforçar preço agora; aprofundar descoberta primeiro.')
})

// 13. Customer preference relevante: pode ajustar abordagem.
test('preferência do cliente na leitura atual entra em customer_context', async () => {
  const currentReading = buildCurrentReading({
    reading: buildReading({
      customer: {
        ...buildReading().customer,
        preferences: [evidence('Cliente prefere dados objetivos.', ['m3'])],
      },
    }),
  })

  const context = await load({ current_reading: currentReading })

  assert.equal(context.customer_context.preferences.length, 1)
  assert.equal(
    context.customer_context.preferences[0].summary,
    'Cliente prefere dados objetivos.',
  )
})

// 14. Customer memory irrelevante: não entra só porque existe.
test('sem current_reading fornecida, preferências ficam vazias (nunca mineradas de outra fonte)', async () => {
  const context = await load({ current_reading: null })

  assert.deepEqual(context.customer_context.preferences, [])
})

// 15. Person memory vs cycle memory: origens preservadas.
test('person memory permanece NOT_AVAILABLE, distinta da origem cycle_memory dos compromissos', async () => {
  const commitment = buildCommitmentItem({ memory_id: 'commit-x' })

  const decisionState = buildDecisionState({
    primary_decision: {
      kind: 'follow_up',
      source: 'cycle_commitment',
      summary: commitment.summary,
      reason: 'Compromisso vencido.',
      recommended_action: 'Confirmar com o cliente.',
      evidence_message_ids: [],
      memory_ids: [commitment.memory_id],
    },
  })

  const context = await load({
    decision_state: decisionState,
    cycle_memory: buildCycleMemory({ commitments: [commitment] }),
  })

  assert.equal(context.customer_context.person_memory_availability, 'NOT_AVAILABLE')
  assert.equal(context.opportunity_context.referenced_commitment.origin, 'cycle_memory')
})

// 16. Current Moment contradiz memória antiga: Current Moment domina
// comunicação imediata.
test('current_moment do Decision State é reaproveitado verbatim, domina a comunicação imediata', async () => {
  const decisionState = buildDecisionState({
    current_moment: {
      commercial_relevance: 'non_commercial',
      is_active_session: true,
      last_interaction_at: REFERENCE_TIME,
      session_gap_ms: 14400000,
    },
    primary_decision: {
      kind: 'give_space',
      source: null,
      summary: 'Sessão atual não é comercial.',
      reason: 'Preservar naturalidade.',
      recommended_action: 'Responder no tom da conversa atual.',
      evidence_message_ids: [],
      memory_ids: [],
    },
  })

  const context = await load({ decision_state: decisionState })

  assert.deepEqual(context.current_moment, decisionState.current_moment)
  assert.equal(context.decision_kind, 'give_space')
})

// 17. No Decision State: fail closed.
test('sem Decision State: não executável', async () => {
  const context = await load({ decision_state: null })

  assert.equal(context.executable, false)
  assert.equal(context.non_executable_reason, 'no_decision_state')
  assert.equal(context.do_not_generate, true)
  assert.equal(context.dominant_intent, null)
})

// 18. Decision State de outro company: fail closed.
test('Decision State de outra empresa: não executável', async () => {
  const decisionState = buildDecisionState({ company_id: OTHER_COMPANY_ID })

  const context = await load({ decision_state: decisionState })

  assert.equal(context.executable, false)
  assert.equal(context.non_executable_reason, 'decision_state_scope_mismatch')
})

// 19. Decision State de outro cycle: fail closed.
test('Decision State de outro ciclo: não executável', async () => {
  const decisionState = buildDecisionState({ cycle_id: OTHER_CYCLE_ID })

  const context = await load({ decision_state: decisionState })

  assert.equal(context.executable, false)
  assert.equal(context.non_executable_reason, 'decision_state_scope_mismatch')
})

// 20. Decision State de outra conversation: fail closed.
test('Decision State de outra conversation_key: não executável', async () => {
  const decisionState = buildDecisionState({ conversation_key: OTHER_CONVERSATION_KEY })

  const context = await load({ decision_state: decisionState })

  assert.equal(context.executable, false)
  assert.equal(context.non_executable_reason, 'decision_state_scope_mismatch')
})

// 21. Commercial Reading futura: não usar.
test('current_reading do futuro é descartado, preferências ficam vazias', async () => {
  const currentReading = buildCurrentReading({
    generated_at: '2026-09-09T18:00:00.000Z',
    state_updated_at: '2026-09-09T18:00:00.000Z',
    reading: buildReading({
      customer: {
        ...buildReading().customer,
        preferences: [evidence('Preferência do futuro.')],
      },
    }),
  })

  const context = await load({ current_reading: currentReading })

  assert.deepEqual(context.customer_context.preferences, [])
  assert.equal(context.provenance.commercial_reading_state_updated_at, null)
})

// 22. Supplemental source malformed: degradação segura.
test('cycle_memory com commitments malformado (não-array) degrada sem quebrar', async () => {
  const decisionState = buildDecisionState({
    primary_decision: {
      kind: 'follow_up',
      source: 'cycle_commitment',
      summary: 'Compromisso qualquer.',
      reason: 'Vencido.',
      recommended_action: 'Confirmar.',
      evidence_message_ids: [],
      memory_ids: ['commit-missing'],
    },
  })

  const context = await load({
    decision_state: decisionState,
    cycle_memory: buildCycleMemory({ commitments: undefined }),
  })

  assert.equal(context.executable, true)
  assert.equal(context.opportunity_context.referenced_commitment, null)
})

// 23. reference_time replay: determinístico.
test('reference_time histórico produz o mesmo resultado de forma determinística', async () => {
  const historical = '2026-01-01T12:00:00.000Z'

  const decisionState = buildDecisionState({ reference_time: historical })

  const first = await load({ reference_time: historical, decision_state: decisionState })
  const second = await load({ reference_time: historical, decision_state: decisionState })

  assert.deepEqual(first, second)
})

// 24. state_updated_at vs generated_at: semântica correta.
test('provenance usa state_updated_at da leitura, nunca generated_at', async () => {
  const currentReading = buildCurrentReading({
    generated_at: '2026-09-09T16:59:59.000Z',
    state_updated_at: '2026-09-09T10:00:00.000Z',
  })

  const context = await load({ current_reading: currentReading })

  assert.equal(
    context.provenance.commercial_reading_state_updated_at,
    '2026-09-09T10:00:00.000Z',
  )
})

// 25. no_intervention + Commercial Reading rica: continua sem gerar.
test('no_intervention com leitura comercial rica ainda assim não gera', async () => {
  const currentReading = buildCurrentReading({
    reading: buildReading({
      risks: {
        customer_objections: [
          {
            kind: 'price',
            severity: 'high',
            summary: 'Objeção não promovida a candidato.',
            evidence_message_ids: ['m9'],
            memory_ids: [],
          },
        ],
        service_risks: [],
      },
    }),
  })

  const context = await load({ current_reading: currentReading })

  assert.equal(context.decision_kind, 'no_intervention')
  assert.equal(context.do_not_generate, true)
  assert.equal(context.opportunity_context.referenced_objection, null)
})

// 26. give_space + objeção comercial histórica: objeção não é autorizada
// a virar mensagem.
test('give_space com objeção histórica na leitura: objeção não referenciada, prohibited_moves cobre reabrir objeção', async () => {
  const currentReading = buildCurrentReading({
    reading: buildReading({
      risks: {
        customer_objections: [
          {
            kind: 'price',
            severity: 'high',
            summary: 'Objeção histórica ainda presente na leitura.',
            evidence_message_ids: ['m9'],
            memory_ids: [],
          },
        ],
        service_risks: [],
      },
    }),
  })

  const decisionState = buildDecisionState({
    primary_decision: {
      kind: 'give_space',
      source: null,
      summary: 'Sessão atual não é comercial.',
      reason: 'Preservar naturalidade.',
      recommended_action: 'Responder no tom da conversa atual.',
      evidence_message_ids: [],
      memory_ids: [],
    },
  })

  const context = await load({
    decision_state: decisionState,
    current_reading: currentReading,
  })

  // Decision State (16.3E) já suprime handle_objection em give_space —
  // nenhuma intervention com source='commercial_risk' chega aqui, então
  // referenced_objection nunca é resolvida.
  assert.equal(context.opportunity_context.referenced_objection, null)
  assert.ok(context.prohibited_moves.includes('resurface_commercial_objection'))
})

// 27. primary + 2 interventions: contexto não exige misturar todos.
test('primary + 2 interventions: supporting_context não é obrigado a ser consumido junto', async () => {
  const decisionState = buildDecisionState({
    primary_decision: {
      kind: 'respond',
      source: 'client_sla',
      summary: 'SLA crítico.',
      reason: 'SLA vencido.',
      recommended_action: 'Responder o cliente.',
      evidence_message_ids: [],
      memory_ids: [],
    },
    interventions: [
      buildInterventionCard({ source: 'cycle_commitment', summary: 'Compromisso vencido.' }),
      buildInterventionCard({ source: 'commercial_risk', summary: 'Objeção bloqueadora.' }),
    ],
  })

  const context = await load({ decision_state: decisionState })

  assert.equal(context.decision_kind, 'respond')
  assert.equal(context.supporting_context.length, 2)
  // O contrato expõe dominant_intent separadamente de supporting_context —
  // um consumidor pode legitimamente usar só o dominant_intent.
  assert.equal(context.dominant_intent.kind, 'respond')
})

// 28. sem memória: contexto ainda executável se decisão permitir.
test('sem cycle_memory disponível, contexto continua executável', async () => {
  const decisionState = buildDecisionState({
    primary_decision: {
      kind: 'respond',
      source: 'customer_waiting',
      summary: 'Cliente aguardando resposta.',
      reason: 'Cliente aguarda resposta.',
      recommended_action: 'Responder o cliente.',
      evidence_message_ids: [],
      memory_ids: [],
    },
  })

  const context = await load({
    decision_state: decisionState,
    cycle_memory: null,
  })

  assert.equal(context.executable, true)
  assert.equal(context.opportunity_context.referenced_commitment, null)
})

// 29. sem method/coaching: contexto ainda executável se decisão permitir.
test('sem method_coaching disponível, contexto continua executável', async () => {
  const context = await load({ method_coaching: null })

  assert.equal(context.executable, true)
  assert.equal(context.method_context.approach_constraint, null)
  assert.deepEqual(context.method_context.missing_information, [])
})

// 30. sem Decision State: contexto NÃO executável (reafirma cenário 17
// com o nome exato do mandato).
test('sem Decision State (decision_state null): contexto NÃO executável', async () => {
  const context = await load({ decision_state: null })

  assert.equal(context.executable, false)
})

// Cobertura extra: reference_time inválido retorna null sem consultar
// nenhuma fonte (mesma disciplina de 16.3D/16.3E).
test('reference_time inválido retorna null sem consultar fontes suplementares', async () => {
  const context = await load({ reference_time: 'not-a-date' })

  assert.equal(context, null)
})

// Cobertura extra: cycle_memory fornecido mas de escopo divergente cai
// para carga interna best-effort (mesma disciplina de 16.3D/16.3E) — aqui
// provado com um admin que falha, verificando degradação seguraa em vez
// de propagar a exceção.
test('cycle_memory de escopo divergente cai para carga interna, que degrada com segurança se falhar', async () => {
  const decisionState = buildDecisionState()

  const failingAdmin = {
    from() {
      throw new Error('DB indisponível no teste')
    },
  }

  const mismatchedCycleMemory = buildCycleMemory({
    company_id: OTHER_COMPANY_ID,
  })

  const context = await load({
    admin: failingAdmin,
    decision_state: decisionState,
    cycle_memory: mismatchedCycleMemory,
  })

  assert.equal(context.executable, true)
  assert.equal(context.opportunity_context.referenced_commitment, null)
})

// Cobertura extra: cycle_memory explicitamente null (chamador já tentou e
// falhou) é respeitado, sem nova tentativa via admin.
test('cycle_memory explicitamente null é respeitado, sem nova tentativa via admin', async () => {
  const context = await load({
    admin: createUnusedAdmin(),
    cycle_memory: null,
  })

  assert.equal(context.executable, true)
})

// Cobertura extra: evidence é a união deduplicada de dominant_intent +
// supporting_context + constraints.
test('evidence agrega e deduplica evidence_message_ids/memory_ids', async () => {
  const decisionState = buildDecisionState({
    primary_decision: {
      kind: 'respond',
      source: 'client_sla',
      summary: 'SLA crítico.',
      reason: 'SLA vencido.',
      recommended_action: 'Responder o cliente.',
      evidence_message_ids: ['m1', 'm2'],
      memory_ids: [],
    },
    interventions: [
      buildInterventionCard({
        source: 'commercial_risk',
        evidence_message_ids: ['m2', 'm3'],
      }),
    ],
  })

  const context = await load({ decision_state: decisionState })

  assert.deepEqual(
    [...context.evidence.evidence_message_ids].sort(),
    ['m1', 'm2', 'm3'],
  )
})
