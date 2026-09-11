import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assessCommercialTruthFromUserPrompt,
} from './commercial-truth.ts'

import {
  buildCommercialIntelligenceLibrary,
  rankCommercialIntelligence,
} from './commercial-intelligence-library.ts'

import {
  buildCommercialReasoning,
} from './commercial-reasoning-engine.ts'

function evidence(summary, ids = ['m1']) {
  return {
    summary,
    evidence_message_ids: ids,
    memory_ids: [],
  }
}

function buildDiagnosticInput() {
  return {
    input_version: 'phase-5-input-v1',
    diagnostic_contract_version: 'phase-4-diagnostic-v3',
    company_id: 'company-a',
    cycle_id: 'cycle-a',
    conversation_key: 'conversation-a',
    current_crm_status: 'negociacao',
    reference_time: '2026-09-11T12:00:00-03:00',
    analysis_precondition: {
      status: 'ready',
      limitations: [],
    },
    conversation: {
      active_message_ids: ['m1'],
      excluded_message_ids: [],
      messages: [],
      excluded_messages: [],
    },
    commercial_context: {
      configured: true,
      config_version_id: 'config-a',
      config_version_number: 1,
      config_contract_version: 'phase-2-v1',
      business_description: 'Empresa de serviços recorrentes.',
      target_audience: 'Adultos.',
      value_proposition: 'Acompanhamento próximo.',
      communication_tone: 'Claro.',
      required_behaviors: [],
      prohibited_behaviors: [],
      sales_method: {
        configured: true,
        contract_version: 'commercial-method-v2',
        name: 'Método consultivo',
        description: 'Diagnosticar antes de recomendar.',
        principles: ['Entender o contexto antes de avançar.'],
        definition: null,
        steps: [],
      },
      products: [
        {
          product_id: 'plano-a',
          contract_version: 'commercial-product-v1',
          definition: null,
          name: 'Plano A',
          category: 'Plano',
          base_price: 199,
          active: true,
          indicated_audiences: [],
          needs_addressed: [],
          benefits: [],
          verified_differentiators: [],
          limitations: [],
          contract_conditions: [],
          payment_conditions: [
            'Pagamento recorrente por cartão conforme política publicada.',
          ],
          allowed_claims: [],
          forbidden_claims: [],
        },
      ],
      facts: [
        {
          contract_version: 'commercial-fact-v1',
          definition: null,
          validity_status: 'current',
          category: 'payment',
          fact_key: 'pix',
          fact_value: 'Pix disponível somente quando aplicável à política comercial.',
          source_note: 'Configuração publicada.',
        },
      ],
      objection_guides: [],
    },
  }
}

function buildState({
  role = 'buyer',
  partyKinds = [],
} = {}) {
  return {
    contract_version: 'phase-5.1-commercial-state-v1',
    cycle_id: 'cycle-a',
    version: 2,
    commercial_role: role,
    current_moment: evidence('Momento atual.'),
    current_priority: evidence('Prioridade atual.'),
    last_analyzed_message_ids: ['m1'],
    last_evidence_message_ids: ['m1'],
    facts: partyKinds.map((kind, index) => ({
      id: `party-${index + 1}`,
      kind,
      value: null,
      summary: kind,
      confidence: 'high',
      evidence_message_ids: ['m1'],
      memory_status: 'active',
      created_in_state_version: 1,
      updated_in_state_version: 1,
      closed_in_state_version: null,
    })),
    needs: [],
    open_loops: [],
    objections: [],
    commitments: [],
    signals: [],
    uncertainties: [],
    created_at: '2026-09-11T11:00:00-03:00',
    updated_at: '2026-09-11T11:30:00-03:00',
  }
}

function buildReading({
  role = 'buyer',
  relevance = 'commercial',
  currentState = 'Cliente informou cirurgia recente e aguarda orientação sobre como seguir.',
  decision = 'deepen_discovery',
} = {}) {
  return {
    contract_version: 'commercial-reading-v1',
    analysis_status: 'complete',
    analysis_limitations: [],
    commercial_role: role,
    commercial_relevance: relevance,
    conversation_summary: {
      initial_context: null,
      evolution: null,
      important_events: [],
      current_state: evidence(currentState),
      last_customer_request_or_decision: evidence(currentState),
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
      missing_discovery: [
        {
          topic: 'other',
          ...evidence('Entender a condição atual antes de orientar qualquer próximo passo.'),
        },
      ],
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
      name: 'Método consultivo',
      stages: [],
      current_stage: null,
      adherence: {
        status: 'on_method',
        summary: 'A condução segue o método.',
        deviation_stage_order: null,
        what_happened: null,
        missing_information: [],
        why_it_matters: null,
        evidence_message_ids: ['m1'],
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
      decision,
      reason: 'Entender o contexto relevante antes de qualquer recomendação.',
      channel: 'text',
      evidence_message_ids: ['m1'],
      memory_ids: [],
    },
    communication: {
      intervention_needed: true,
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
  }
}

function buildTruthPrompt({
  text,
  previousState = null,
}) {
  return JSON.stringify({
    input: {
      diagnostic_input: {
        current_crm_status: 'negociacao',
        commercial_context: {
          products: [],
        },
        conversation: {
          messages: [
            {
              id: 'm-current',
              direction: 'incoming',
              text_content: text,
              audio_transcription: null,
            },
          ],
          context_bridge_messages: [],
        },
      },
      state_context: {
        previous_state: previousState,
      },
    },
  })
}

test(
  '16.9 regressão: saudação isolada sem memória comercial continua neutra',
  () => {
    const result = assessCommercialTruthFromUserPrompt(
      buildTruthPrompt({ text: 'Bom dia' }),
    )

    assert.equal(
      result.requires_commercial_relevance,
      false,
    )
  },
)

test(
  '16.9 regressão: saudação curta preserva continuidade quando existe objeção comercial ativa',
  () => {
    const previousState = {
      commercial_role: 'buyer',
      facts: [],
      needs: [],
      open_loops: [],
      objections: [
        {
          id: 'obj-1',
          kind: 'payment',
          summary: 'Cliente está sem cartão disponível.',
          memory_status: 'active',
          evidence_message_ids: ['m-old'],
        },
      ],
      commitments: [],
      signals: [],
      uncertainties: [],
    }

    const result = assessCommercialTruthFromUserPrompt(
      buildTruthPrompt({
        text: 'Bom dia',
        previousState,
      }),
    )

    assert.equal(
      result.requires_commercial_relevance,
      true,
    )
    assert.ok(
      result.signal_categories.includes(
        'active_commercial_continuity',
      ),
    )
  },
)

test(
  '16.9 regressão: conhecimento de pagamento não entra por bônus de escopo em contexto de cirurgia',
  () => {
    const input = buildDiagnosticInput()
    const library =
      buildCommercialIntelligenceLibrary(input)

    const ranked = rankCommercialIntelligence({
      entries: library,
      query: {
        company_id: input.company_id,
        product_ids: [],
        situations: ['discovery_gap'],
        signals: ['missing_context'],
        objectives: [
          'Entender a condição atual antes de orientar qualquer próximo passo.',
        ],
        limit: 20,
      },
    })

    const unrelatedPaymentKnowledge =
      ranked.filter((item) =>
        item.entry.kind === 'company_knowledge' &&
        /pagamento|pix|cartão|cartao/i.test(
          `${item.entry.title} ${item.entry.description}`,
        ),
      )

    assert.deepEqual(
      unrelatedPaymentKnowledge,
      [],
    )
  },
)

test(
  '16.9 regressão: oportunidade de terceiro comercial não fica silenciosa por papel legado do interlocutor',
  () => {
    const result = buildCommercialReasoning({
      reading: buildReading({
        role: 'unknown',
        currentState: 'Juliana informou que a irmã Mariana quer contratar e precisa saber como começar.',
        decision: 'clarify',
      }),
      cycle_state: buildState({
        role: 'unknown',
        partyKinds: [
          'commercial_party.current_contact.intermediary',
          'commercial_party.related.prospect',
        ],
      }),
      diagnostic_input: buildDiagnosticInput(),
    })

    assert.notEqual(result.status, 'silent')
    assert.ok(
      result.selected_techniques.some(
        technique =>
          technique.intelligence_id ===
            'technique.third_party_handoff',
      ),
    )
  },
)

test(
  '16.9 regressão: contexto de cirurgia seleciona descoberta e não injeta regra de pagamento',
  () => {
    const result = buildCommercialReasoning({
      reading: buildReading(),
      cycle_state: buildState(),
      diagnostic_input: buildDiagnosticInput(),
    })

    assert.ok(
      result.selected_techniques.some(
        technique =>
          technique.intelligence_id ===
            'technique.discovery_before_prescription',
      ),
    )

    assert.equal(
      result.company_knowledge_used.some((item) =>
        /pagamento|pix|cartão|cartao/i.test(item.title),
      ),
      false,
    )
  },
)
