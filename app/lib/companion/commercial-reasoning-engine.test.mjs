import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCommercialReasoning,
} from './commercial-reasoning-engine.ts'

function evidence(summary) {
  return {
    summary,
    evidence_message_ids: ['m1'],
    memory_ids: [],
  }
}

function buildReading({
  relevance = 'commercial',
  role = 'buyer',
  decision = 'handle_objection',
  objection = 'Cliente está sem limite no cartão para concluir o pagamento.',
  missingDiscovery = [],
  commitments = [],
  primaryProduct = true,
  adherence = 'on_method',
  interventionNeeded = true,
} = {}) {
  const product = {
    canonical_product_id: 'product-a',
    name: 'Plano Premium',
    interest_level: 'primary',
    ...evidence('Cliente demonstrou interesse principal no Plano Premium.'),
  }

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
      current_state:
        evidence(
          'Cliente está avaliando o Plano Premium e trouxe uma objeção de pagamento.',
        ),
      last_customer_request_or_decision:
        evidence(
          'Cliente perguntou como pode concluir o pagamento.',
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
        objection
          ? [evidence(objection)]
          : [],
      uncertainties: [],
      discussed_products:
        primaryProduct
          ? [product]
          : [],
      primary_product_interest:
        primaryProduct
          ? product
          : null,
      competitors: [],
      commitments,
      missing_discovery:
        missingDiscovery,
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
        status: adherence,
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
    seller_strengths: [
      {
        kind: 'good_discovery',
        summary: 'O vendedor identificou a restrição de pagamento.',
        why_it_matters: 'Evita prescrever solução errada.',
        evidence_message_ids: ['m1'],
        memory_ids: [],
      },
    ],
    improvement_points: [],
    risks: {
      customer_objections:
        objection
          ? [
              {
                kind: 'payment',
                severity: 'medium',
                summary: objection,
                evidence_message_ids: ['m1'],
                memory_ids: [],
              },
            ]
          : [],
      service_risks: [],
    },
    best_approach: {
      decision,
      reason:
        decision === 'wait'
          ? 'O cliente assumiu a próxima ação e ainda está no prazo.'
          : 'Diagnosticar a causa real da objeção antes de oferecer alternativa.',
      channel:
        decision === 'wait'
          ? 'wait'
          : 'text',
      evidence_message_ids: ['m1'],
      memory_ids: [],
    },
    communication: {
      intervention_needed:
        interventionNeeded,
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

function buildState({
  partyKinds = [],
} = {}) {
  return {
    contract_version:
      'phase-5.1-commercial-state-v1',
    cycle_id: 'cycle-a',
    version: 2,
    commercial_role: 'buyer',
    current_moment: {
      summary: 'Momento atual.',
      evidence_message_ids: ['m1'],
    },
    current_priority: {
      summary: 'Prioridade atual.',
      evidence_message_ids: ['m1'],
    },
    last_analyzed_message_ids: ['m1'],
    last_evidence_message_ids: ['m1'],
    facts:
      partyKinds.map(
        (kind, index) => ({
          id: `fact-${index + 1}`,
          kind,
          value: null,
          summary: kind,
          confidence: 'high',
          evidence_message_ids: ['m1'],
          memory_status: 'active',
          created_in_state_version: 1,
          updated_in_state_version: 1,
          closed_in_state_version: null,
        }),
      ),
    needs: [],
    open_loops: [],
    objections: [],
    commitments: [],
    signals: [],
    uncertainties: [],
    created_at: '2026-09-11T09:00:00-03:00',
    updated_at: '2026-09-11T09:10:00-03:00',
  }
}

function buildInput() {
  return {
    input_version: 'phase-5-input-v1',
    diagnostic_contract_version: 'phase-4-diagnostic-v3',
    company_id: 'company-a',
    cycle_id: 'cycle-a',
    conversation_key: 'conversation-a',
    current_crm_status: 'negociacao',
    reference_time: '2026-09-11T09:15:00-03:00',
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
      required_behaviors: [
        'Responder a pergunta antes de avançar.',
      ],
      prohibited_behaviors: [
        'Inventar desconto.',
      ],
      sales_method: {
        configured: true,
        contract_version: 'commercial-method-v2',
        name: 'Método consultivo',
        description: 'Diagnóstico antes da recomendação.',
        principles: ['Descobrir antes de apresentar.'],
        definition: null,
        steps: [],
      },
      products: [
        {
          product_id: 'product-a',
          contract_version: 'commercial-product-v1',
          definition: null,
          name: 'Plano Premium',
          category: 'Plano',
          base_price: 199,
          active: true,
          indicated_audiences: [],
          needs_addressed: ['Acompanhamento contínuo'],
          benefits: ['Atendimento recorrente'],
          verified_differentiators: [],
          limitations: [],
          contract_conditions: [],
          payment_conditions: [
            'Pagamento por cartão ou Pix conforme política publicada.',
          ],
          allowed_claims: [],
          forbidden_claims: ['Garantia de resultado.'],
        },
      ],
      facts: [
        {
          contract_version: 'commercial-fact-v1',
          definition: null,
          validity_status: 'current',
          category: 'payment',
          fact_key: 'pix_available',
          fact_value: 'Pix disponível conforme política comercial.',
          source_note: 'Configuração publicada.',
        },
      ],
      objection_guides: [
        {
          contract_version: 'commercial-objection-v1',
          definition: null,
          sort_order: 1,
          objection: 'Sem cartão',
          signals: ['sem cartão', 'sem limite'],
          discovery_questions: [
            'Qual é exatamente o bloqueio com o cartão?',
          ],
          recommended_approach:
            'Diagnosticar a causa antes de oferecer alternativa.',
          response_limits: [
            'Não prometer condição fora da política.',
          ],
        },
      ],
    },
  }
}

test(
  'objeção de pagamento combina técnica geral com conhecimento real da empresa',
  () => {
    const result =
      buildCommercialReasoning({
        reading: buildReading(),
        cycle_state: buildState(),
        diagnostic_input: buildInput(),
      })

    assert.equal(result.status, 'ready')
    assert.equal(
      result.decision,
      'handle_objection',
    )
    assert.ok(
      result.selected_techniques.some(
        technique =>
          technique.intelligence_id ===
            'technique.objection_diagnosis',
      ),
    )
    assert.ok(
      result.company_knowledge_used.some(
        item =>
          item.source_type ===
            'objection_guide' ||
          item.source_type ===
            'product_profile' ||
          item.source_type ===
            'official_fact',
      ),
    )
    assert.ok(
      result.comparison.similarities.length > 0,
    )
    assert.equal(
      result.seller_assessment
        .strengths.length,
      1,
    )
  },
)

test(
  'oportunidade de terceiro seleciona handoff sem colapsar interlocutor e prospect',
  () => {
    const result =
      buildCommercialReasoning({
        reading:
          buildReading({
            objection: null,
            decision: 'clarify',
            primaryProduct: false,
          }),
        cycle_state:
          buildState({
            partyKinds: [
              'commercial_party.current_contact.intermediary',
              'commercial_party.related.prospect',
            ],
          }),
        diagnostic_input: buildInput(),
      })

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
  'espera disciplinada impede repetir ação quando cliente assumiu o próximo passo',
  () => {
    const commitment = {
      status: 'confirmed',
      scheduled_at: null,
      proposed_at: null,
      ...evidence(
        'Cliente disse que vai verificar o cartão e te aviso.',
      ),
    }

    const result =
      buildCommercialReasoning({
        reading:
          buildReading({
            objection: null,
            decision: 'wait',
            commitments: [commitment],
            primaryProduct: false,
          }),
        cycle_state: buildState(),
        diagnostic_input: buildInput(),
      })

    assert.ok(
      result.selected_techniques.some(
        technique =>
          technique.intelligence_id ===
            'technique.commitment_wait',
      ),
    )
    assert.ok(
      result.do_not_do.includes(
        'Repetir ação já executada',
      ),
    )
  },
)

test(
  'sessão não comercial preserva contexto e silencia técnicas de avanço',
  () => {
    const result =
      buildCommercialReasoning({
        reading:
          buildReading({
            relevance: 'non_commercial',
            decision: 'no_intervention',
            objection: null,
            primaryProduct: false,
            interventionNeeded: false,
          }),
        cycle_state: buildState(),
        diagnostic_input: buildInput(),
      })

    assert.equal(result.status, 'silent')
    assert.equal(
      result.decision,
      'no_intervention',
    )
    assert.deepEqual(
      result.selected_techniques,
      [],
    )
    assert.deepEqual(
      result.company_knowledge_used,
      [],
    )
  },
)
