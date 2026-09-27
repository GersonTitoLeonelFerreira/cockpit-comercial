import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildSellerExecutionTrace,
} from './seller-execution-trace.ts'

function input(turns) {
  return {
    input_version:
      'phase-5-input-v1',
    diagnostic_contract_version:
      'phase-4-diagnostic-v3',
    company_id: 'company-generic',
    cycle_id: 'cycle-generic',
    conversation_key:
      'conversation-generic',
    current_crm_status:
      'respondeu',
    reference_time:
      '2026-09-27T18:30:00-03:00',
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

test(
  'software B2B reconhece intenção explícita de contratação sem depender de vocabulário de academia',
  () => {
    const trace =
      buildSellerExecutionTrace({
        diagnostic_input:
          input([
            {
              direction:
                'incoming',
              text:
                'Quero contratar a licença anual. Como faço o pagamento?',
            },
            {
              direction:
                'outgoing',
              text:
                'Posso te enviar a proposta e orientar o próximo passo para assinatura.',
            },
          ]),
      })

    assert.equal(
      trace.events[0]
        .customer_intent_before_action
        .kind,
      'close',
    )

    assert.equal(
      trace.events[0]
        .customer_intent_before_action
        .confidence,
      'high',
    )
  },
)

test(
  'serviço com visita reconhece escolha guiada de agenda sem usar experimental ou plano',
  () => {
    const trace =
      buildSellerExecutionTrace({
        diagnostic_input:
          input([
            {
              direction:
                'incoming',
              text:
                'Quero agendar uma visita técnica.',
            },
            {
              direction:
                'outgoing',
              text:
                'Tenho terça às 14h ou quinta às 10h. Qual horário funciona melhor para a visita?',
            },
          ]),
      })

    assert.equal(
      trace.events[0]
        .action_type,
      'scheduling_guided_choice',
    )
  },
)

test(
  'consultoria é reconhecida como apresentação de oferta sem depender da palavra plano',
  () => {
    const trace =
      buildSellerExecutionTrace({
        diagnostic_input:
          input([
            {
              direction:
                'incoming',
              text:
                'Tenho interesse na consultoria de processos.',
            },
            {
              direction:
                'outgoing',
              text:
                'A consultoria inclui diagnóstico, desenho do processo e acompanhamento da implantação.',
            },
          ]),
      })

    assert.equal(
      trace.events[0]
        .action_type,
      'product_presentation',
    )
  },
)

test(
  'descoberta funciona em venda consultiva genérica sem referência vertical',
  () => {
    const trace =
      buildSellerExecutionTrace({
        diagnostic_input:
          input([
            {
              direction:
                'incoming',
              text:
                'Quero entender se a solução serve para a minha empresa.',
            },
            {
              direction:
                'outgoing',
              text:
                'Qual é o principal desafio que vocês querem resolver hoje?',
            },
          ]),
      })

    assert.equal(
      trace.events[0]
        .action_type,
      'discovery_question',
    )
  },
)
