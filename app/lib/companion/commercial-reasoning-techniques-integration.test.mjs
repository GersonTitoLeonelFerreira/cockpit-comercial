import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCommercialReasoning,
} from './commercial-reasoning-engine.ts'

function evidence(
  summary,
  ids = ['m1'],
) {
  return {
    summary,
    evidence_message_ids:
      ids,
    memory_ids: [],
  }
}

function baseReading({
  decision = 'deepen_discovery',
  currentState = 'Conversa comercial ativa.',
  lastCustomer = 'Cliente demonstrou interesse.',
  objections = [],
} = {}) {
  return {
    contract_version:
      'commercial-reading-v1',
    analysis_status:
      'complete',
    analysis_limitations: [],
    commercial_role: 'buyer',
    commercial_relevance:
      'commercial',
    conversation_summary: {
      initial_context: null,
      evolution: null,
      important_events: [],
      current_state:
        evidence(
          currentState,
        ),
      last_customer_request_or_decision:
        evidence(
          lastCustomer,
        ),
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
      objections:
        objections.map(
          summary =>
            evidence(summary),
        ),
      uncertainties: [],
      discussed_products: [],
      primary_product_interest:
        null,
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
      configured: true,
      name:
        'Método consultivo',
      stages: [],
      current_stage: {
        step_order: 2,
        stage_key:
          'commitment',
        name:
          'Próximo compromisso',
      },
      adherence: {
        status: 'on_method',
        summary:
          'Leitura canônica.',
        deviation_stage_order:
          null,
        what_happened: null,
        missing_information: [],
        why_it_matters: null,
        evidence_message_ids: [],
        memory_ids: [],
      },
      recovery_guidance:
        null,
    },
    seller_strengths: [],
    improvement_points: [],
    risks: {
      customer_objections:
        objections.map(
          summary => ({
            kind:
              'objection',
            severity:
              'medium',
            summary,
            evidence_message_ids:
              ['m1'],
            memory_ids: [],
          }),
        ),
      service_risks: [],
    },
    best_approach: {
      decision,
      reason:
        'Avançar de acordo com o contexto atual.',
      channel: 'text',
      evidence_message_ids: [
        'm1',
      ],
      memory_ids: [],
    },
    communication: {
      intervention_needed: true,
      recommended_question: null,
      recommended_message: null,
    },
    operations: {
      crm: {
        should_change_crm_stage:
          false,
        recommended_status:
          null,
        rationale: null,
        requires_human_confirmation:
          true,
      },
      agenda: {
        should_change_agenda:
          false,
        expected_next_action_at:
          null,
        rationale: null,
        requires_human_confirmation:
          true,
      },
    },
    evidence_message_ids: [
      'm1',
    ],
    memory_ids: [],
  }
}

function state() {
  return {
    contract_version:
      'phase-5.1-commercial-state-v1',
    cycle_id: 'cycle-a',
    version: 2,
    commercial_role:
      'buyer',
    current_moment:
      evidence('Momento.'),
    current_priority:
      evidence('Prioridade.'),
    last_analyzed_message_ids: [
      'm1',
    ],
    last_evidence_message_ids: [
      'm1',
    ],
    facts: [],
    needs: [],
    open_loops: [],
    objections: [],
    commitments: [],
    signals: [],
    uncertainties: [],
    created_at:
      '2026-09-27T16:00:00-03:00',
    updated_at:
      '2026-09-27T17:00:00-03:00',
  }
}

function input({
  turns,
  facts = [],
} = {}) {
  return {
    input_version:
      'phase-5-input-v1',
    diagnostic_contract_version:
      'phase-4-diagnostic-v3',
    company_id: 'company-a',
    cycle_id: 'cycle-a',
    conversation_key:
      'conversation-a',
    current_crm_status:
      'respondeu',
    reference_time:
      '2026-09-27T17:30:00-03:00',
    analysis_precondition: {
      status: 'ready',
      limitations: [],
    },
    conversation: {
      active_message_ids:
        turns.map(
          (_, index) =>
            `m${index + 1}`,
        ),
      excluded_message_ids: [],
      messages:
        turns.map(
          (turn, index) => ({
            id:
              `m${index + 1}`,
            message_key:
              `message-${index + 1}`,
            version: 1,
            sequence:
              index + 1,
            direction:
              turn.direction,
            author_kind:
              turn.direction ===
                'incoming'
                ? 'customer'
                : 'human_agent',
            occurred_at:
              `2026-09-27T17:${String(index).padStart(2, '0')}:00-03:00`,
            observed_at:
              `2026-09-27T17:${String(index).padStart(2, '0')}:01-03:00`,
            content_type: 'text',
            text_content:
              turn.text,
            audio_transcription:
              null,
          }),
        ),
      excluded_messages: [],
    },
    commercial_context: {
      configured: true,
      config_version_id:
        'config-a',
      config_version_number: 1,
      config_contract_version:
        'phase-2-v1',
      business_description:
        'Empresa.',
      target_audience:
        'Adultos.',
      value_proposition:
        'Atendimento.',
      communication_tone:
        'Claro.',
      required_behaviors: [],
      prohibited_behaviors: [],
      sales_method: {
        configured: true,
        contract_version:
          'commercial-method-v2',
        name:
          'Método consultivo',
        description:
          'Descobrir e avançar.',
        principles: [],
        definition: null,
        steps: [],
      },
      products: [],
      facts:
        facts.map(
          (
            fact,
            index,
          ) => ({
            contract_version:
              'commercial-fact-v1',
            definition: null,
            validity_status:
              'current',
            category:
              fact.category,
            fact_key:
              fact.fact_key ??
              `fact-${index + 1}`,
            fact_value:
              fact.fact_value,
            source_note:
              'Configuração publicada.',
          }),
        ),
      objection_guides: [],
    },
  }
}

test(
  'C01 sem disponibilidade oficial bloqueia guided choice e preserva a restrição de não inventar horário',
  () => {
    const result =
      buildCommercialReasoning({
        reading:
          baseReading({
            currentState:
              'Cliente queria fazer uma experimental, mas a conversa desviou para planos.',
            lastCustomer:
              'Cliente quer fazer uma experimental.',
          }),
        cycle_state:
          state(),
        diagnostic_input:
          input({
            turns: [
              {
                direction:
                  'incoming',
                text:
                  'Quero fazer uma experimental.',
              },
              {
                direction:
                  'outgoing',
                text:
                  'Quando você quer fazer a experimental?',
              },
              {
                direction:
                  'outgoing',
                text:
                  'Vou te mandar nossos planos para você conhecer.',
              },
            ],
          }),
      })

    assert.equal(
      result.selected_techniques
        .some(
          item =>
            item.intelligence_id ===
              'technique.guided_choice',
        ),
      false,
    )

    assert.ok(
      result.selected_techniques
        .some(
          item =>
            item.intelligence_id ===
              'technique.contextual_reengagement',
        ),
    )

    assert.match(
      result.objective_now,
      /retomar.*intenção|continuidade/i,
    )

    assert.doesNotMatch(
      result.objective_now,
      /qual dia|qual horário|perguntar.*horário/i,
    )

    assert.ok(
      result.limitations.includes(
        'technique_condition_unmet:technique.guided_choice:grounded_multiple_valid_options_required',
      ),
    )

    assert.ok(
      result.do_not_do
        .some(
          item =>
            /não inventar horários/i
              .test(item),
        ),
    )
  },
)

test(
  'C01 com disponibilidade oficial seleciona guided choice',
  () => {
    const result =
      buildCommercialReasoning({
        reading:
          baseReading({
            currentState:
              'Cliente quer retomar o agendamento da experimental.',
            lastCustomer:
              'Cliente quer fazer uma experimental.',
          }),
        cycle_state:
          state(),
        diagnostic_input:
          input({
            turns: [
              {
                direction:
                  'incoming',
                text:
                  'Quero fazer uma experimental.',
              },
            ],
            facts: [
              {
                category:
                  'availability',
                fact_key:
                  'experimental_slots',
                fact_value:
                  'Horários disponíveis: terça 18h ou quarta 19h.',
              },
            ],
          }),
      })

    assert.ok(
      result.selected_techniques
        .some(
          item =>
            item.intelligence_id ===
              'technique.guided_choice',
        ),
    )
  },
)

test(
  'C03 mantém commitment_wait mas não repete guided choice já executada',
  () => {
    const result =
      buildCommercialReasoning({
        reading:
          baseReading({
            decision: 'wait',
            currentState:
              'Vendedor ofereceu duas opções e aguarda resposta.',
            lastCustomer:
              'Cliente quer agendar.',
          }),
        cycle_state:
          state(),
        diagnostic_input:
          input({
            turns: [
              {
                direction:
                  'incoming',
                text:
                  'Quero agendar.',
              },
              {
                direction:
                  'outgoing',
                text:
                  'Tenho terça às 18h ou quarta às 19h. Qual fica melhor?',
              },
            ],
          }),
      })

    assert.ok(
      result.selected_techniques
        .some(
          item =>
            item.intelligence_id ===
              'technique.commitment_wait',
        ),
    )

    assert.equal(
      result.selected_techniques
        .some(
          item =>
            item.intelligence_id ===
              'technique.guided_choice',
        ),
      false,
    )

    assert.ok(
      result.do_not_do
        .some(
          item =>
            /não repetir a pergunta/i
              .test(item),
        ),
    )
  },
)

test(
  'C04 fato novo bloqueia commitment_wait',
  () => {
    const result =
      buildCommercialReasoning({
        reading:
          baseReading({
            decision: 'wait',
            currentState:
              'Cliente rejeitou os horários apresentados.',
            lastCustomer:
              'Nenhum desses horários consigo.',
          }),
        cycle_state:
          state(),
        diagnostic_input:
          input({
            turns: [
              {
                direction:
                  'incoming',
                text:
                  'Quero agendar.',
              },
              {
                direction:
                  'outgoing',
                text:
                  'Tenho terça às 18h ou quarta às 19h. Qual fica melhor?',
              },
              {
                direction:
                  'incoming',
                text:
                  'Nenhum desses horários consigo.',
              },
            ],
          }),
      })

    assert.equal(
      result.selected_techniques
        .some(
          item =>
            item.intelligence_id ===
              'technique.commitment_wait',
        ),
      false,
    )

    assert.ok(
      result.limitations
        .some(
          item =>
            item ===
              'technique_condition_unmet:technique.commitment_wait:no_new_customer_fact_after_action',
        ),
    )
  },
)

test(
  'C05 mantém discovery_before_prescription aplicável quando preço foi apresentado cedo',
  () => {
    const result =
      buildCommercialReasoning({
        reading:
          baseReading({
            currentState:
              'Cliente demonstrou interesse inicial e recebeu preço antes de descoberta suficiente.',
            lastCustomer:
              'Cliente perguntou como funciona.',
          }),
        cycle_state:
          state(),
        diagnostic_input:
          input({
            turns: [
              {
                direction:
                  'incoming',
                text:
                  'Queria saber como funciona.',
              },
              {
                direction:
                  'outgoing',
                text:
                  'O plano custa R$ 199 e inclui estes benefícios.',
              },
            ],
          }),
      })

    assert.ok(
      result.selected_techniques
        .some(
          item =>
            item.intelligence_id ===
              'technique.discovery_before_prescription',
        ),
    )
  },
)

test(
  'probe de objeção já executado não seleciona novo objection diagnosis enquanto aguarda resposta',
  () => {
    const result =
      buildCommercialReasoning({
        reading:
          baseReading({
            decision:
              'handle_objection',
            currentState:
              'Cliente trouxe restrição de cartão e vendedor perguntou a causa.',
            lastCustomer:
              'Estou sem limite no cartão.',
            objections: [
              'Cliente está sem limite no cartão.',
            ],
          }),
        cycle_state:
          state(),
        diagnostic_input:
          input({
            turns: [
              {
                direction:
                  'incoming',
                text:
                  'Estou sem limite no cartão.',
              },
              {
                direction:
                  'outgoing',
                text:
                  'O bloqueio é limite disponível ou você está sem o cartão agora?',
              },
            ],
          }),
      })

    assert.equal(
      result.selected_techniques
        .some(
          item =>
            item.intelligence_id ===
              'technique.objection_diagnosis',
        ),
      false,
    )

    assert.ok(
      result.limitations
        .some(
          item =>
            item ===
              'technique_condition_unmet:technique.objection_diagnosis:do_not_repeat_objection_probe',
        ),
    )
  },
)
