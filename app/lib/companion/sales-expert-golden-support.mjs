// Cadeia canônica compartilhada pelos goldens de recuperação do especialista
// comercial: entrada → temporal context → Commercial Reading → Seller
// Execution Trace → Reasoning → Coaching → AnalysisViewModel → Message
// Strategy. Os testes (sales-expert-recovery-golden e
// seller-facing-end-to-end-golden) usam exatamente a mesma montagem.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  buildCommercialReasoning,
} from './commercial-reasoning-engine.ts'

import {
  buildCommercialCoachingDiagnosis,
} from './commercial-coaching-engine.ts'

import {
  buildCommercialMessageStrategy,
} from './commercial-message-strategy.ts'

import {
  applySellerExecutionCoachingToNeutralView,
  buildAnalysisViewModel,
} from '../server/analysis-view-model.ts'

export const CORPUS =
  JSON.parse(
    readFileSync(
      new URL(
        '../../../docs/companion-v2/corpus/sales-expert-recovery-golden.json',
        import.meta.url,
      ),
      'utf8',
    ),
  )

export function caseById(id) {
  const item =
    CORPUS.cases.find(
      entry => entry.id === id,
    )

  assert.ok(item, `caso ${id} ausente`)

  return item
}

export function evidence(
  summary,
  ids = ['m1'],
) {
  return {
    summary,
    evidence_message_ids: ids,
    memory_ids: [],
  }
}

export function buildInput(
  turns,
  referenceTime,
) {
  return {
    input_version:
      'phase-5-input-v1',
    diagnostic_contract_version:
      'phase-4-diagnostic-v3',
    company_id:
      'company-golden',
    cycle_id:
      'cycle-golden',
    conversation_key:
      'conversation-golden',
    current_crm_status:
      'respondeu',
    reference_time:
      referenceTime,
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
      excluded_messages: [],
      messages:
        turns.map(
          ([direction, at, text], index) => ({
            id: `m${index + 1}`,
            message_key:
              `message-${index + 1}`,
            version: 1,
            sequence: index + 1,
            direction:
              direction === 'in'
                ? 'incoming'
                : 'outgoing',
            author_kind:
              direction === 'in'
                ? 'customer'
                : 'human_agent',
            occurred_at: at,
            observed_at: at,
            content_type: 'text',
            text_content: text,
            audio_transcription: null,
          }),
        ),
    },
    commercial_context: {
      configured: true,
      config_version_id:
        'config-golden',
      config_version_number: 1,
      config_contract_version:
        'phase-2-v1',
      business_description:
        'Empresa genérica.',
      target_audience: null,
      value_proposition: null,
      communication_tone: null,
      required_behaviors: [],
      prohibited_behaviors: [],
      sales_method: {
        configured: false,
        contract_version: null,
        name: null,
        description: null,
        principles: [],
        definition: null,
        steps: [],
      },
      products: [],
      facts: [],
      objection_guides: [],
    },
  }
}

export function buildReading(
  spec = {},
) {
  const relevance =
    spec.relevance ?? 'commercial'

  const neutral =
    relevance !== 'commercial'

  const hasMethodGap =
    Array.isArray(
      spec.method_missing_information,
    ) &&
    spec.method_missing_information
      .length > 0

  return {
    contract_version:
      'commercial-reading-v1',
    analysis_status: 'complete',
    analysis_limitations: [],
    commercial_role:
      spec.role ?? 'buyer',
    commercial_relevance:
      relevance,
    conversation_summary: {
      initial_context: null,
      evolution: null,
      important_events: [],
      current_state:
        evidence(
          neutral
            ? 'Momento atual sem relevância comercial confirmada.'
            : 'Conversa comercial em andamento.',
        ),
      last_customer_request_or_decision:
        neutral
          ? null
          : evidence(
              'Cliente demonstrou intenção comercial.',
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
        (spec.objections ?? [])
          .map(
            summary =>
              evidence(summary),
          ),
      uncertainties: [],
      discussed_products: [],
      primary_product_interest: null,
      competitors: [],
      commitments: [],
      missing_discovery:
        (spec.missing_discovery ?? [])
          .map(
            item => ({
              topic: item.topic,
              summary: item.summary,
              evidence_message_ids:
                item.evidence ?? ['m1'],
              memory_ids: [],
            }),
          ),
      resolved_information: [],
      superseded_information: [],
      communication: {
        events: [],
        patterns: [],
      },
    },
    commercial_evolution: [],
    method: {
      configured: hasMethodGap,
      name:
        hasMethodGap
          ? 'Método consultivo'
          : null,
      stages: [],
      current_stage: null,
      adherence: {
        status:
          hasMethodGap
            ? 'off_method'
            : 'not_configured',
        summary: '',
        deviation_stage_order: null,
        what_happened: null,
        missing_information:
          spec.method_missing_information ??
          [],
        why_it_matters: null,
        evidence_message_ids: [],
        memory_ids: [],
      },
      recovery_guidance: null,
    },
    seller_strengths:
      neutral
        ? []
        : (spec.strengths ?? []).map(
            item => ({
              kind: item.kind,
              summary: item.summary,
              why_it_matters:
                item.why_it_matters,
              evidence_message_ids:
                item.evidence,
              memory_ids: [],
            }),
          ),
    improvement_points: [],
    risks: {
      customer_objections: [],
      service_risks: [],
    },
    best_approach: {
      decision:
        spec.best_approach ??
        'respond',
      reason:
        'Leitura persistida da última análise.',
      channel: 'text',
      evidence_message_ids: ['m1'],
      memory_ids: [],
    },
    communication: {
      intervention_needed:
        !neutral,
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

export function buildState({
  partyKinds = [],
  commercialMemory = false,
} = {}) {
  return {
    contract_version:
      'phase-5.1-commercial-state-v1',
    cycle_id: 'cycle-golden',
    version: 1,
    commercial_role: 'buyer',
    current_moment:
      evidence('Momento atual.'),
    current_priority:
      evidence('Prioridade atual.'),
    last_analyzed_message_ids: ['m1'],
    last_evidence_message_ids: ['m1'],
    facts:
      partyKinds.map(
        (kind, index) => ({
          id: `fact-${index + 1}`,
          kind,
          summary: kind,
          value: null,
          confidence: 'high',
          evidence_message_ids: ['m1'],
          memory_status: 'active',
          created_in_state_version: 1,
          updated_in_state_version: 1,
          closed_in_state_version: null,
        }),
      ),
    needs:
      commercialMemory
        ? [
            {
              id: 'need-1',
              kind: 'need.product',
              summary: 'Necessidade comercial ativa.',
              confidence: 'high',
              evidence_message_ids: ['m1'],
              memory_status: 'active',
              created_in_state_version: 1,
              updated_in_state_version: 1,
              closed_in_state_version: null,
            },
          ]
        : [],
    open_loops: [],
    objections: [],
    commitments: [],
    signals: [],
    uncertainties: [],
    created_at:
      '2026-09-01T00:00:00Z',
    updated_at:
      '2026-09-01T00:00:00Z',
  }
}

export function runCase(item) {
  const input =
    buildInput(
      item.turns,
      item.evaluated_at,
    )

  const reading =
    buildReading(item.reading)

  const state =
    buildState({
      partyKinds:
        item.state_party_kinds ?? [],
    })

  const reasoning =
    buildCommercialReasoning({
      reading,
      cycle_state: state,
      diagnostic_input: input,
      evaluated_at:
        item.evaluated_at,
    })

  const coaching =
    buildCommercialCoachingDiagnosis({
      reading,
      reasoning,
      diagnostic_input: input,
      evaluated_at:
        item.evaluated_at,
      cycle_state: state,
    })

  const strategy =
    buildCommercialMessageStrategy({
      reasoning,
      coaching,
      diagnostic_input: input,
    })

  const analysis =
    applySellerExecutionCoachingToNeutralView(
      buildAnalysisViewModel({
        current_reading: {
          reading,
          state_record_id: 'state-1',
          state_version: 1,
          state_updated_at:
            item.evaluated_at,
        },
        cycle_memory: null,
        method_coaching: null,
        decision_state: null,
        reference_time:
          item.evaluated_at,
      }),
      coaching,
    )

  return {
    input,
    reading,
    reasoning,
    coaching,
    strategy,
    analysis,
    temporal:
      reasoning.temporal_context,
  }
}
