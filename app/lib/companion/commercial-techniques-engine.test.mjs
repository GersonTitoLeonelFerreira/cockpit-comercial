import assert from 'node:assert/strict'
import test from 'node:test'

import {
  GENERAL_COMMERCIAL_INTELLIGENCE_LIBRARY,
  rankCommercialIntelligence,
} from './commercial-intelligence-library.ts'

import {
  buildCommercialTechniqueContext,
  selectApplicableCommercialTechniques,
} from './commercial-techniques-engine.ts'

import {
  buildSellerExecutionTrace,
} from './seller-execution-trace.ts'

import {
  buildSellerSequenceMethodAssessment,
} from './seller-sequence-method-assessment.ts'

function evidence(summary) {
  return {
    summary,
    evidence_message_ids: ['m1'],
    memory_ids: [],
  }
}

function reading({
  objections = [],
} = {}) {
  return {
    customer: {
      discussed_products: [],
      objections:
        objections.map(
          summary =>
            evidence(summary),
        ),
    },
    risks: {
      customer_objections: [],
    },
    method: {
      configured: true,
      name:
        'Método consultivo',
      current_stage: null,
      adherence: {
        status:
          'on_method',
        evidence_message_ids: [],
      },
      recovery_guidance: null,
    },
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
      '2026-09-27T18:00:00-03:00',
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

function methodReading({
  objections = [],
} = {}) {
  const base =
    reading({
      objections,
    })

  return {
    ...base,
    method: {
      ...base.method,
      stages: [],
      adherence: {
        ...base.method
          .adherence,
        summary:
          'Leitura canônica.',
        deviation_stage_order:
          null,
        what_happened: null,
        missing_information: [],
        why_it_matters: null,
        memory_ids: [],
      },
    },
  }
}

function context({
  turns,
  facts = [],
  objections = [],
} = {}) {
  const diagnosticInput =
    input({
      turns,
      facts,
    })

  const currentReading =
    methodReading({
      objections,
    })

  const trace =
    buildSellerExecutionTrace({
      diagnostic_input:
        diagnosticInput,
    })

  const sequenceMethod =
    buildSellerSequenceMethodAssessment({
      reading:
        currentReading,
      diagnostic_input:
        diagnosticInput,
      trace,
    })

  return buildCommercialTechniqueContext({
    reading:
      currentReading,
    diagnostic_input:
      diagnosticInput,
    trace,
    sequence_method:
      sequenceMethod,
  })
}

function rank({
  situations,
  signals,
}) {
  return rankCommercialIntelligence({
    entries:
      GENERAL_COMMERCIAL_INTELLIGENCE_LIBRARY,
    query: {
      company_id:
        'company-a',
      product_ids: [],
      situations,
      signals,
      objectives: [],
      limit: 20,
    },
  })
}

test(
  'guided choice fica condicional sem múltiplas opções reais groundeadas',
  () => {
    const techniqueContext =
      context({
        turns: [
          {
            direction:
              'incoming',
            text:
              'Quero fazer uma experimental.',
          },
        ],
      })

    const ranked =
      rank({
        situations: [
          'scheduling_choice',
        ],
        signals: [
          ...techniqueContext
            .supplemental_signals,
        ],
      })

    const result =
      selectApplicableCommercialTechniques({
        ranked,
        context:
          techniqueContext,
      })

    const decision =
      result.decisions.find(
        item =>
          item.intelligence_id ===
            'technique.guided_choice',
      )

    assert.equal(
      decision.status,
      'conditional',
    )

    assert.ok(
      decision
        .unmet_requirements
        .includes(
          'grounded_multiple_valid_options_required',
        ),
    )

    assert.equal(
      result.selected_ranked
        .some(
          item =>
            item.entry.id ===
              'technique.guided_choice',
        ),
      false,
    )
  },
)

test(
  'dois horários em fato oficial vigente habilitam grounded multiple_valid_options',
  () => {
    const techniqueContext =
      context({
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
      })

    assert.equal(
      techniqueContext
        .grounded_options
        .scheduling_option_count,
      2,
    )

    assert.ok(
      techniqueContext
        .supplemental_signals
        .includes(
          'multiple_valid_options',
        ),
    )

    const ranked =
      rank({
        situations: [
          'scheduling_choice',
        ],
        signals: [
          ...techniqueContext
            .supplemental_signals,
        ],
      })

    const result =
      selectApplicableCommercialTechniques({
        ranked,
        context:
          techniqueContext,
      })

    assert.ok(
      result.selected_ranked
        .some(
          item =>
            item.entry.id ===
              'technique.guided_choice',
        ),
    )
  },
)

test(
  'horários escritos apenas pelo vendedor não contam como disponibilidade oficial',
  () => {
    const techniqueContext =
      context({
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
      })

    assert.equal(
      techniqueContext
        .grounded_options
        .scheduling_option_count,
      0,
    )

    assert.equal(
      techniqueContext
        .grounded_options
        .has_multiple_valid_options,
      false,
    )
  },
)

test(
  'commitment_wait é aplicável somente enquanto não existe fato novo do cliente',
  () => {
    const waitingContext =
      context({
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
              'Quando você quer vir?',
          },
        ],
      })

    const waitingRanked =
      rank({
        situations: [
          'waiting_for_customer',
        ],
        signals: [
          'waiting_on_customer',
          'seller_action_already_performed',
        ],
      })

    const waitingResult =
      selectApplicableCommercialTechniques({
        ranked:
          waitingRanked,
        context:
          waitingContext,
      })

    assert.ok(
      waitingResult
        .selected_ranked
        .some(
          item =>
            item.entry.id ===
              'technique.commitment_wait',
        ),
    )

    const factContext =
      context({
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
      })

    const factResult =
      selectApplicableCommercialTechniques({
        ranked:
          waitingRanked,
        context:
          factContext,
      })

    const decision =
      factResult.decisions
        .find(
          item =>
            item.intelligence_id ===
              'technique.commitment_wait',
        )

    assert.equal(
      decision.status,
      'blocked',
    )
  },
)

test(
  'objection diagnosis não pode ser repetido enquanto vendedor aguarda resposta do probe',
  () => {
    const techniqueContext =
      context({
        objections: [
          'Cliente está sem limite no cartão.',
        ],
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
      })

    const ranked =
      rank({
        situations: [
          'payment_objection',
        ],
        signals: [
          'objection_open',
        ],
      })

    const result =
      selectApplicableCommercialTechniques({
        ranked,
        context:
          techniqueContext,
      })

    const decision =
      result.decisions.find(
        item =>
          item.intelligence_id ===
            'technique.objection_diagnosis',
      )

    assert.equal(
      decision.status,
      'blocked',
    )

    assert.ok(
      decision
        .unmet_requirements
        .includes(
          'do_not_repeat_objection_probe',
        ),
    )
  },
)

test(
  'ranking contextual é obrigatório para selecionar técnica',
  () => {
    const techniqueContext =
      context({
        turns: [
          {
            direction:
              'incoming',
            text:
              'Tenho interesse.',
          },
        ],
      })

    const fakeRanked = [
      {
        entry:
          GENERAL_COMMERCIAL_INTELLIGENCE_LIBRARY
            .find(
              item =>
                item.id ===
                  'technique.guided_choice',
            ),
        score: 10,
        matched_signals: [],
        matched_situations: [],
        matched_objectives: [],
        ranking_reasons: [],
      },
    ]

    const result =
      selectApplicableCommercialTechniques({
        ranked:
          fakeRanked,
        context:
          techniqueContext,
      })

    assert.equal(
      result.selected_ranked
        .length,
      0,
    )

    assert.equal(
      result.decisions[0]
        .status,
      'blocked',
    )

    assert.ok(
      result.decisions[0]
        .unmet_requirements
        .includes(
          'contextual_match_required',
        ),
    )
  },
)
