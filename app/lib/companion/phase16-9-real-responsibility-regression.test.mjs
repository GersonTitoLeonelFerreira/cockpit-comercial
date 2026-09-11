import assert from 'node:assert/strict'
import test from 'node:test'

import {
  loadCanonicalDecisionStateWithResponsibility,
} from '../server/canonical-commercial-responsibility.ts'

const COMPANY_ID = '10000000-0000-4000-8000-000000000001'
const CYCLE_ID = '30000000-0000-4000-8000-000000000001'
const CONVERSATION_KEY = 'phone:554484352775'
const REFERENCE_TIME = '2026-09-11T19:30:00.000Z'

function evidence(summary, ids = ['seller-asked-schedule']) {
  return {
    summary,
    evidence_message_ids: ids,
    memory_ids: [],
  }
}

function currentReading() {
  return {
    company_id: COMPANY_ID,
    cycle_id: CYCLE_ID,
    conversation_key: CONVERSATION_KEY,
    state_record_id: 'state-1',
    state_version: 2,
    source_event_id: 'event-1',
    generated_at: '2026-09-11T19:28:30.000Z',
    state_updated_at: '2026-09-11T19:28:30.000Z',
    reading: {
      contract_version: 'commercial-reading-v1',
      analysis_status: 'complete',
      analysis_limitations: [],
      commercial_role: 'buyer',
      commercial_relevance: 'commercial',
      conversation_summary: {
        initial_context: null,
        evolution: null,
        important_events: [],
        current_state: evidence(
          'O vendedor perguntou qual dia e horário fica melhor para a aula experimental e aguarda resposta.',
        ),
        last_customer_request_or_decision: evidence(
          'Cliente informou que ainda não fez a aula experimental.',
          ['customer-not-done'],
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
        objections: [],
        uncertainties: [],
        discussed_products: [],
        primary_product_interest: null,
        competitors: [],
        commitments: [],
        missing_discovery: [
          {
            topic: 'timeline',
            ...evidence('Dia e horário da aula experimental ainda não informados.'),
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
        name: 'Método comercial',
        stages: [],
        current_stage: null,
        adherence: {
          status: 'partially_on_method',
          summary: 'Falta confirmar data e horário.',
          deviation_stage_order: null,
          what_happened: 'A pergunta já foi feita pelo vendedor.',
          missing_information: [
            'Dia e horário da aula experimental.',
          ],
          why_it_matters: 'A agenda ainda não foi definida.',
          evidence_message_ids: ['seller-asked-schedule'],
          memory_ids: [],
        },
        recovery_guidance: {
          target_stage_key: 'descoberta',
          target_stage_name: 'Descoberta',
          objective: 'Confirmar data e horário da aula experimental.',
          missing_information: ['Dia e horário.'],
          recommended_move: 'Buscar a confirmação da data e horário da aula experimental.',
        },
      },
      seller_strengths: [],
      improvement_points: [],
      risks: {
        customer_objections: [],
        service_risks: [],
      },
      best_approach: {
        decision: 'deepen_discovery',
        reason: 'Buscar a confirmação da data e horário da aula experimental.',
        channel: 'text',
        evidence_message_ids: ['seller-asked-schedule'],
        memory_ids: [],
      },
      communication: {
        intervention_needed: true,
        recommended_question: 'Qual dia e horário fica melhor para você?',
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
      evidence_message_ids: [
        'customer-not-done',
        'seller-asked-schedule',
      ],
      memory_ids: [],
    },
  }
}

function clientContext() {
  return {
    contract_version: 'companion-client-context-v1',
    generated_at: REFERENCE_TIME,
    identity: {
      company_id: COMPANY_ID,
      cycle_id: CYCLE_ID,
      conversation_key: CONVERSATION_KEY,
      current_status: 'novo',
    },
    relationship: {
      first_known_interaction_at: '2026-09-10T14:33:00.000Z',
      relationship_age_ms: 103440000,
      latest_customer_message_at: '2026-09-11T19:26:00.000Z',
      latest_seller_message_at: '2026-09-11T19:28:00.000Z',
      last_interaction_at: '2026-09-11T19:28:00.000Z',
      known_interaction_count: 9,
    },
    waiting: {
      state: 'seller_waiting_for_customer',
      waiting_since: '2026-09-11T19:28:00.000Z',
      waiting_duration_ms: 120000,
    },
    timeline: [],
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
  }
}

test(
  '16.9 real: vendedor que já perguntou data e horário deve aguardar o cliente, não repetir descoberta',
  async () => {
    const state = await loadCanonicalDecisionStateWithResponsibility({
      admin: {},
      company_id: COMPANY_ID,
      cycle_id: CYCLE_ID,
      conversation_key: CONVERSATION_KEY,
      reference_time: REFERENCE_TIME,
      current_reading: currentReading(),
      client_context: clientContext(),
      cycle_memory: null,
      method_coaching: null,
    })

    assert.ok(state)
    assert.equal(
      state.primary_decision.kind,
      'wait',
      'waiting determinístico precisa dominar um best_approach que repetiria ação já executada',
    )
    assert.match(
      state.primary_decision.recommended_action,
      /aguard|esper/i,
    )
    assert.doesNotMatch(
      state.primary_decision.recommended_action,
      /pergunt|confirmar|buscar a confirmação/i,
      'não pode mandar o vendedor repetir a pergunta já feita',
    )
  },
)
