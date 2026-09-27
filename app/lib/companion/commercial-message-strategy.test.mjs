import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCommercialMessageStrategy,
  evaluateCommercialMessageDraft,
} from './commercial-message-strategy.ts'

function input({
  turns,
  tone = 'Natural e objetivo.',
  prohibited = [],
} = {}) {
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
      '2026-09-27T20:00:00-03:00',
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
              `2026-09-27T19:${String(index).padStart(2, '0')}:00-03:00`,
            observed_at:
              `2026-09-27T19:${String(index).padStart(2, '0')}:01-03:00`,
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
        'config-generic',
      config_version_number: 1,
      config_contract_version:
        'phase-2-v1',
      business_description:
        'Negócio configurável.',
      target_audience: null,
      value_proposition: null,
      communication_tone:
        tone,
      required_behaviors: [],
      prohibited_behaviors:
        prohibited,
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

function reasoning(overrides = {}) {
  return {
    contract_version:
      'commercial-reasoning-v1',
    status: 'ready',
    decision:
      'set_commitment',
    decision_reason:
      'Avançar com o próximo compromisso.',
    current_situation:
      'Cliente demonstrou intenção clara.',
    objective_now:
      'Retomar o compromisso já demonstrado pelo cliente.',
    do_not_do: [],
    selected_techniques: [],
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
    ...overrides,
  }
}

function coaching(overrides = {}) {
  return {
    contract_version:
      'commercial-coaching-diagnosis-v1',
    status: 'ready',
    client_context_confidence:
      'high',
    seller_execution_confidence:
      'high',
    current_commercial_goal:
      'Retomar o compromisso.',
    client_intent_now: {
      kind:
        'scheduling',
      label:
        'Agendamento ou compromisso de agenda',
      confidence:
        'high',
      evidence_message_id:
        'm1',
    },
    seller_last_valid_move: null,
    seller_strength: null,
    seller_mistake: null,
    sequence_break: {
      happened: true,
      what_changed:
        'A conversa desviou.',
      why_it_hurts:
        'Perde continuidade.',
      evidence_message_ids:
        ['m3'],
    },
    method_state: {
      configured: false,
      current_stage_name: null,
      adherence:
        'not_configured',
      deviation_detected:
        true,
      recovery_objective: null,
      recovery_move: null,
    },
    chosen_technique: null,
    next_action:
      'Retomar o compromisso.',
    do_not_do: [],
    evidence_message_ids:
      ['m1', 'm3'],
    memory_ids: [],
    ...overrides,
  }
}

test(
  'C01 cria estratégia de recuperação ancorada na intenção real do cliente',
  () => {
    const strategy =
      buildCommercialMessageStrategy({
        reasoning:
          reasoning(),
        coaching:
          coaching(),
        diagnostic_input:
          input({
            turns: [
              {
                direction:
                  'incoming',
                text:
                  'Quero agendar uma demonstração do sistema.',
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
                  'Vou te mandar os pacotes.',
              },
            ],
          }),
      })

    assert.match(
      strategy.relationship_bridge,
      /retomar a intenção/i,
    )

    assert.equal(
      strategy.context_reference
        .evidence_message_id,
      'm1',
    )

    assert.equal(
      strategy.context_reference
        .required_in_draft,
      true,
    )

    assert.ok(
      strategy.context_reference
        .anchors
        .includes('demonstracao'),
    )
  },
)

test(
  'facts_allowed usa somente conhecimento selecionado pelo reasoning',
  () => {
    const strategy =
      buildCommercialMessageStrategy({
        reasoning:
          reasoning({
            company_knowledge_used: [
              {
                intelligence_id:
                  'knowledge.payment',
                title:
                  'Política publicada',
                scope: 'company',
                source_type:
                  'company_fact',
                source_id:
                  'fact-a',
                product_id: null,
                why_relevant:
                  'Pagamento recorrente é aceito conforme política publicada.',
              },
            ],
          }),
        coaching:
          coaching({
            sequence_break: {
              happened: false,
              what_changed: null,
              why_it_hurts: null,
              evidence_message_ids: [],
            },
          }),
        diagnostic_input:
          input({
            turns: [
              {
                direction:
                  'incoming',
                text:
                  'Como funciona o pagamento?',
              },
            ],
          }),
      })

    assert.deepEqual(
      strategy.facts_allowed,
      [
        'Pagamento recorrente é aceito conforme política publicada.',
      ],
    )
  },
)

test(
  'limitação de opções reais vira fato obrigatório ausente e proibição explícita',
  () => {
    const strategy =
      buildCommercialMessageStrategy({
        reasoning:
          reasoning({
            limitations: [
              'technique_condition_unmet:technique.guided_choice:grounded_multiple_valid_options_required',
            ],
          }),
        coaching:
          coaching(),
        diagnostic_input:
          input({
            turns: [
              {
                direction:
                  'incoming',
                text:
                  'Quero marcar uma visita.',
              },
            ],
          }),
      })

    assert.ok(
      strategy
        .facts_required_but_missing
        .includes(
          'multiple_valid_options',
        ),
    )

    assert.ok(
      strategy.prohibited_moves
        .some(
          item =>
            /não inventar alternativas/i
              .test(item),
        ),
    )
  },
)

test(
  'critic reprova mensagem transplantável quando recuperação exige referência contextual',
  () => {
    const strategy =
      buildCommercialMessageStrategy({
        reasoning:
          reasoning(),
        coaching:
          coaching(),
        diagnostic_input:
          input({
            turns: [
              {
                direction:
                  'incoming',
                text:
                  'Quero agendar uma demonstração do sistema.',
              },
            ],
          }),
      })

    const result =
      evaluateCommercialMessageDraft({
        message:
          'Oi! Passando para saber se posso te ajudar em alguma coisa.',
        strategy,
      })

    assert.equal(
      result.passed,
      false,
    )

    assert.ok(
      result.violations
        .includes(
          'generic_message',
        ),
    )
  },
)

test(
  'critic bloqueia repetição da última ação outgoing',
  () => {
    const strategy =
      buildCommercialMessageStrategy({
        reasoning:
          reasoning(),
        coaching:
          coaching({
            sequence_break: {
              happened: false,
              what_changed: null,
              why_it_hurts: null,
              evidence_message_ids: [],
            },
            client_intent_now: null,
          }),
        diagnostic_input:
          input({
            turns: [
              {
                direction:
                  'incoming',
                text:
                  'Tenho interesse na consultoria.',
              },
            ],
          }),
      })

    const repeated =
      'Qual é o principal desafio que vocês querem resolver hoje?'

    const result =
      evaluateCommercialMessageDraft({
        message:
          repeated,
        strategy,
        recent_outgoing_messages: [
          repeated,
        ],
      })

    assert.equal(
      result.passed,
      false,
    )

    assert.ok(
      result.violations
        .includes(
          'repeats_recent_seller_action',
        ),
    )
  },
)

test(
  'estratégia permanece business-agnostic em contratação B2B',
  () => {
    const strategy =
      buildCommercialMessageStrategy({
        reasoning:
          reasoning({
            objective_now:
              'Avançar assinatura da licença anual.',
          }),
        coaching:
          coaching({
            sequence_break: {
              happened: false,
              what_changed: null,
              why_it_hurts: null,
              evidence_message_ids: [],
            },
            client_intent_now: {
              kind: 'close',
              label:
                'Fechamento ou contratação',
              confidence:
                'high',
              evidence_message_id:
                'm1',
            },
          }),
        diagnostic_input:
          input({
            turns: [
              {
                direction:
                  'incoming',
                text:
                  'Quero contratar a licença anual.',
              },
            ],
          }),
      })

    assert.equal(
      strategy.objective,
      'Avançar assinatura da licença anual.',
    )

    assert.equal(
      strategy.tone,
      'Natural e objetivo.',
    )

    assert.ok(
      strategy.context_reference
        .anchors
        .includes('licenca'),
    )
  },
)


test(
  'seller intent leve de agradecimento não força repetição artificial do contexto',
  () => {
    const strategy =
      buildCommercialMessageStrategy({
        reasoning:
          reasoning(),
        coaching:
          coaching(),
        diagnostic_input:
          input({
            turns: [
              {
                direction:
                  'incoming',
                text:
                  'Quero agendar uma demonstração do sistema.',
              },
            ],
          }),
        seller_intent:
          'Quero agradecer e encerrar por enquanto.',
      })

    assert.equal(
      strategy.context_reference
        .required_in_draft,
      false,
    )
  },
)
