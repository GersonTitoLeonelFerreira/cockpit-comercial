import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCommercialCoachingDiagnosis,
} from './commercial-coaching-engine.ts'

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

function input(turns) {
  return {
    input_version:
      'phase-5-input-v1',
    diagnostic_contract_version:
      'phase-4-diagnostic-v3',
    company_id:
      'company-generic',
    cycle_id:
      'cycle-generic',
    conversation_key:
      'conversation-generic',
    current_crm_status:
      'respondeu',
    reference_time:
      '2026-09-27T19:00:00-03:00',
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
              `2026-09-27T18:${String(index).padStart(2, '0')}:00-03:00`,
            observed_at:
              `2026-09-27T18:${String(index).padStart(2, '0')}:01-03:00`,
            content_type:
              'text',
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
        'config-generic',
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
      facts: [],
      objection_guides: [],
    },
  }
}

function reading({
  strengths = [],
  improvements = [],
  adherence = 'on_method',
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
          'Conversa comercial em andamento.',
        ),
      last_customer_request_or_decision:
        evidence(
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
      objections: [],
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
          'next-step',
        name:
          'Próximo compromisso',
      },
      adherence: {
        status: adherence,
        summary:
          'Leitura canônica.',
        deviation_stage_order:
          adherence ===
            'off_method'
            ? 2
            : null,
        what_happened: null,
        missing_information: [],
        why_it_matters: null,
        evidence_message_ids: [],
        memory_ids: [],
      },
      recovery_guidance: null,
    },
    seller_strengths:
      strengths,
    improvement_points:
      improvements,
    risks: {
      customer_objections: [],
      service_risks: [],
    },
    best_approach: {
      decision:
        'set_commitment',
      reason:
        'Transformar interesse em próximo compromisso.',
      channel: 'text',
      evidence_message_ids:
        ['m1'],
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
        recommended_status: null,
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
    evidence_message_ids:
      ['m1'],
    memory_ids: [],
  }
}

function reasoning({
  objective =
    'Retomar o próximo compromisso do cliente.',
  technique = null,
  doNotDo = [],
} = {}) {
  return {
    contract_version:
      'commercial-reasoning-v1',
    status: 'ready',
    decision:
      'set_commitment',
    decision_reason:
      'A conversa pede continuidade do compromisso.',
    current_situation:
      'Cliente já demonstrou intenção e precisa do próximo passo.',
    objective_now:
      objective,
    do_not_do:
      doNotDo,
    selected_techniques:
      technique
        ? [technique]
        : [],
    company_knowledge_used: [],
    seller_assessment: {
      strengths: [],
      improvement_points: [],
    },
    comparison: {
      similarities: [],
      differences: [],
    },
    evidence_message_ids:
      ['m1'],
    memory_ids: [],
    limitations: [],
  }
}

test(
  'C01 transforma quebra de sequência em diagnóstico de coaching com evidência',
  () => {
    const diagnosis =
      buildCommercialCoachingDiagnosis({
        reading:
          reading(),
        reasoning:
          reasoning({
            doNotDo: [
              'Não abandonar o objetivo comercial ativo.',
            ],
          }),
        diagnostic_input:
          input([
            {
              direction:
                'incoming',
              text:
                'Quero agendar uma demonstração.',
            },
            {
              direction:
                'outgoing',
              text:
                'Quando você quer fazer a demonstração?',
            },
            {
              direction:
                'outgoing',
              text:
                'Vou te mandar nossos pacotes para você conhecer.',
            },
          ]),
      })

    assert.equal(
      diagnosis.sequence_break
        .happened,
      true,
    )

    assert.ok(
      diagnosis.seller_mistake
        .summary
        .includes(
          'saiu do objetivo comercial',
        ),
    )

    assert.ok(
      diagnosis.seller_mistake
        .evidence_message_ids
        .includes('m3'),
    )

    assert.equal(
      diagnosis.seller_strength
        .source,
      'seller_execution_trace',
    )
  },
)

test(
  'cliente fala pouco mas execução do vendedor continua com confiança alta',
  () => {
    const diagnosis =
      buildCommercialCoachingDiagnosis({
        reading:
          reading(),
        reasoning:
          reasoning(),
        diagnostic_input:
          input([
            {
              direction:
                'incoming',
              text:
                'Tenho interesse.',
            },
            {
              direction:
                'outgoing',
              text:
                'Antes de te recomendar uma solução, qual é o principal desafio que vocês querem resolver hoje?',
            },
          ]),
      })

    assert.equal(
      diagnosis.client_context_confidence,
      'low',
    )

    assert.equal(
      diagnosis.seller_execution_confidence,
      'high',
    )

    assert.ok(
      diagnosis.seller_strength
        .summary
        .includes(
          'buscou contexto',
        ),
    )
  },
)

test(
  'fato novo depois da ação impede coaching congelado em erro de espera',
  () => {
    const diagnosis =
      buildCommercialCoachingDiagnosis({
        reading:
          reading({
            improvements: [
              {
                kind:
                  'unanswered_question',
                summary:
                  'Cliente ainda não respondeu.',
                why_it_matters:
                  'É preciso resposta.',
                impact:
                  'Venda parada.',
                how_to_improve:
                  'Perguntar novamente.',
                evidence_message_ids:
                  ['m2'],
                memory_ids: [],
              },
            ],
          }),
        reasoning:
          reasoning(),
        diagnostic_input:
          input([
            {
              direction:
                'incoming',
              text:
                'Quero agendar uma visita.',
            },
            {
              direction:
                'outgoing',
              text:
                'Tenho terça às 14h ou quinta às 10h. Qual funciona melhor?',
            },
            {
              direction:
                'incoming',
              text:
                'Nenhum desses horários funciona.',
            },
          ]),
      })

    assert.equal(
      diagnosis.seller_mistake,
      null,
    )
  },
)

test(
  'diagnóstico continua business-agnostic para software B2B',
  () => {
    const diagnosis =
      buildCommercialCoachingDiagnosis({
        reading:
          reading(),
        reasoning:
          reasoning({
            objective:
              'Avançar contratação da licença.',
            technique: {
              intelligence_id:
                'principle.company_rules_before_claim',
              title:
                'Regra da empresa antes da afirmação',
              kind:
                'principle',
              scope:
                'general',
              why_applicable:
                'A contratação depende de condições publicadas.',
              risks: [],
            },
          }),
        diagnostic_input:
          input([
            {
              direction:
                'incoming',
              text:
                'Quero contratar a licença anual. Como faço para assinar?',
            },
            {
              direction:
                'outgoing',
              text:
                'Vou te orientar pelo próximo passo da assinatura.',
            },
          ]),
      })

    assert.equal(
      diagnosis.client_intent_now
        .kind,
      'close',
    )

    assert.equal(
      diagnosis.current_commercial_goal,
      'Avançar contratação da licença.',
    )

    assert.equal(
      diagnosis.chosen_technique
        .title,
      'Regra da empresa antes da afirmação',
    )
  },
)

test(
  'live recovery não elogia a ação que causou a quebra e aponta a etapa de método a recuperar',
  () => {
    const currentReading =
      reading({
        strengths: [
          {
            kind: 'good_presentation',
            summary:
              'O vendedor apresentou uma oferta detalhada com preços e condições.',
            why_it_matters:
              'A oferta trouxe informações comerciais.',
            evidence_message_ids: [
              'm3',
            ],
            memory_ids: [],
          },
        ],
        adherence:
          'off_method',
      })

    currentReading.method.stages = [
      {
        step_order: 1,
        stage_key:
          'discovery',
        name: 'Descoberta',
        status: 'partial',
        explanation:
          'Ainda falta concluir o próximo compromisso ligado ao objetivo do cliente.',
        evidence_message_ids: [
          'm2',
        ],
        memory_ids: [],
      },
      {
        step_order: 2,
        stage_key:
          'presentation',
        name: 'Apresentação',
        status: 'active',
        explanation:
          'A oferta foi apresentada antes de concluir a etapa anterior.',
        evidence_message_ids: [
          'm3',
        ],
        memory_ids: [],
      },
    ]
    currentReading.method.current_stage = {
      step_order: 2,
      stage_key:
        'presentation',
      name: 'Apresentação',
    }
    currentReading.method.adherence.deviation_stage_order = 1
    currentReading.method.adherence.why_it_matters =
      'A etapa anterior ainda precisa ser concluída.'
    currentReading.method.recovery_guidance = {
      objective:
        'Concluir o compromisso ligado ao objetivo original do cliente.',
      missing_information: [],
      recommended_move:
        'Retomar o objetivo original antes de apresentar outra oferta.',
      optional_question: null,
      evidence_message_ids: [
        'm2',
        'm3',
      ],
      memory_ids: [],
    }

    const diagnosis =
      buildCommercialCoachingDiagnosis({
        reading:
          currentReading,
        reasoning:
          reasoning({
            objective:
              'Retomar o objetivo original do cliente.',
          }),
        diagnostic_input:
          input([
            {
              direction:
                'incoming',
              text:
                'Quero agendar uma demonstração.',
            },
            {
              direction:
                'outgoing',
              text:
                'Qual dia e horário fica melhor para você?',
            },
            {
              direction:
                'outgoing',
              text:
                'Vou te mandar nossos pacotes e preços.',
            },
          ]),
      })

    assert.doesNotMatch(
      diagnosis.seller_strength
        ?.summary ?? '',
      /oferta detalhada|preços e condições/i,
    )

    assert.match(
      diagnosis.seller_strength
        ?.summary ?? '',
      /compromisso de agenda/i,
    )

    assert.equal(
      diagnosis.method_state
        .current_stage_name,
      'Apresentação',
    )

    assert.equal(
      diagnosis.method_state
        .recommended_stage_name,
      'Descoberta',
    )

    assert.match(
      diagnosis.method_state
        .recommended_stage_reason ?? '',
      /concluir o compromisso/i,
    )
  },
)

test(
  'live Lorena sem deviation_stage_order ainda remove elogio contraditório e recupera etapa parcial anterior',
  () => {
    const currentReading =
      reading({
        strengths: [
          {
            kind: 'good_presentation',
            summary:
              'O vendedor apresentou uma oferta promocional detalhada com planos, preços e links.',
            why_it_matters:
              'A oferta trouxe informações comerciais.',
            evidence_message_ids: [
              'm5',
            ],
            memory_ids: [],
          },
        ],
        adherence:
          'partially_on_method',
      })

    currentReading.method.stages = [
      {
        step_order: 1,
        stage_key:
          'discovery',
        name: 'Descoberta',
        status: 'partial',
        explanation:
          'O objetivo de agendamento ainda não foi concluído.',
        evidence_message_ids: [
          'm4',
        ],
        memory_ids: [],
      },
      {
        step_order: 2,
        stage_key:
          'presentation',
        name: 'Apresentação',
        status: 'active',
        explanation:
          'Planos foram apresentados antes da conclusão do compromisso anterior.',
        evidence_message_ids: [
          'm5',
        ],
        memory_ids: [],
      },
    ]
    currentReading.method.current_stage = {
      step_order: 2,
      stage_key:
        'presentation',
      name: 'Apresentação',
    }
    currentReading.method.adherence.deviation_stage_order = null
    currentReading.method.recovery_guidance = null

    const diagnosis =
      buildCommercialCoachingDiagnosis({
        reading:
          currentReading,
        reasoning:
          reasoning({
            objective:
              'Retomar a intenção de agendamento sem repetir a pergunta anterior.',
          }),
        diagnostic_input:
          input([
            {
              direction:
                'incoming',
              text:
                'Podemos fazer uma aula experimental hoje?',
            },
            {
              direction:
                'outgoing',
              text:
                'Você já fez a aula experimental?',
            },
            {
              direction:
                'incoming',
              text:
                'Não fiz ainda.',
            },
            {
              direction:
                'outgoing',
              text:
                'Qual dia e horário fica melhor para você?',
            },
            {
              direction:
                'outgoing',
              text:
                'Vou te mandar nossos planos. O plano custa R$ 209,90.',
            },
          ]),
      })

    assert.doesNotMatch(
      diagnosis.seller_strength
        ?.summary ?? '',
      /oferta promocional|planos, preços|links/i,
    )

    assert.equal(
      diagnosis.sequence_break
        .happened,
      true,
    )

    assert.equal(
      diagnosis.method_state
        .current_stage_name,
      'Apresentação',
    )

    assert.equal(
      diagnosis.method_state
        .recommended_stage_name,
      'Descoberta',
    )
  },
)
