import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  buildSellerExecutionTrace,
  classifySellerActionText,
} from './seller-execution-trace.ts'

const CORPUS =
  JSON.parse(
    readFileSync(
      new URL(
        '../../../docs/companion-v2/corpus/coaching-engine-phase0-cases.json',
        import.meta.url,
      ),
      'utf8',
    ),
  )

function caseById(id) {
  return CORPUS.cases.find(
    item => item.id === id,
  )
}

function inputFromCase(id) {
  const item =
    caseById(id)

  return {
    input_version:
      'phase-5-input-v1',
    diagnostic_contract_version:
      'phase-4-diagnostic-v3',
    company_id:
      'company-a',
    cycle_id:
      'cycle-a',
    conversation_key:
      'conversation-a',
    current_crm_status:
      'respondeu',
    reference_time:
      '2026-09-27T17:00:00-03:00',
    analysis_precondition: {
      status: 'ready',
      limitations: [],
    },
    conversation: {
      active_message_ids:
        item.turns.map(
          (_, index) =>
            `m${index + 1}`,
        ),
      excluded_message_ids: [],
      messages:
        item.turns.map(
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
      configured: false,
      config_version_id: null,
      config_version_number: null,
      config_contract_version: null,
      business_description: null,
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
  'C01 reconstrói pergunta aberta e quebra posterior de sequência',
  () => {
    const trace =
      buildSellerExecutionTrace({
        diagnostic_input:
          inputFromCase('C01'),
      })

    assert.equal(
      trace.events.length,
      2,
    )

    assert.equal(
      trace.events[0]
        .action_type,
      'scheduling_open_question',
    )

    assert.equal(
      trace.events[0]
        .quality.question_quality,
      'open',
    )

    assert.equal(
      trace.events[0]
        .observed_outcome,
      'customer_silent_before_next_seller_action',
    )

    assert.equal(
      trace.events[1]
        .action_type,
      'product_presentation',
    )

    assert.equal(
      trace.events[1]
        .sequence
        .breaks_active_customer_goal,
      true,
    )

    assert.ok(
      trace.events[1]
        .signals.includes(
          'premature_product_offer',
        ),
    )

    assert.equal(
      trace.summary
        .sequence_break_detected,
      true,
    )
  },
)

test(
  'C02 separa baixa confiança de contexto do cliente de alta confiança sobre execução do vendedor',
  () => {
    const trace =
      buildSellerExecutionTrace({
        diagnostic_input:
          inputFromCase('C02'),
      })

    assert.equal(
      trace.summary
        .client_context_confidence,
      'low',
    )

    assert.equal(
      trace.summary
        .seller_execution_confidence,
      'high',
    )

    assert.ok(
      trace.events[0]
        .signals.includes(
          'client_sparse_seller_rich',
        ),
    )
  },
)

test(
  'C03 reconhece escolha guiada e não inventa repetição',
  () => {
    const trace =
      buildSellerExecutionTrace({
        diagnostic_input:
          inputFromCase('C03'),
      })

    assert.equal(
      trace.events[0]
        .action_type,
      'scheduling_guided_choice',
    )

    assert.equal(
      trace.events[0]
        .quality.question_quality,
      'guided_choice',
    )

    assert.equal(
      trace.events[0]
        .sequence
        .repeats_prior_action,
      false,
    )

    assert.equal(
      trace.events[0]
        .sequence
        .breaks_active_customer_goal,
      false,
    )
  },
)

test(
  'C04 registra rejeição das opções como outcome da ação anterior',
  () => {
    const trace =
      buildSellerExecutionTrace({
        diagnostic_input:
          inputFromCase('C04'),
      })

    assert.equal(
      trace.events[0]
        .observed_outcome,
      'customer_rejected_options',
    )

    assert.ok(
      trace.events[0]
        .signals.includes(
          'customer_rejected_options',
        ),
    )
  },
)

test(
  'C05 marca oferta de preço prematura quando cliente ainda só demonstrou interesse genérico',
  () => {
    const trace =
      buildSellerExecutionTrace({
        diagnostic_input:
          inputFromCase('C05'),
      })

    assert.equal(
      trace.events[0]
        .action_type,
      'price_presentation',
    )

    assert.ok(
      trace.events[0]
        .signals.includes(
          'premature_product_offer',
        ),
    )
  },
)

test(
  'C06 detecta descoberta tardia depois de intenção explícita de fechamento',
  () => {
    const trace =
      buildSellerExecutionTrace({
        diagnostic_input:
          inputFromCase('C06'),
      })

    assert.equal(
      trace.events[0]
        .action_type,
      'discovery_question',
    )

    assert.ok(
      trace.events[0]
        .signals.includes(
          'late_discovery_after_close_intent',
        ),
    )

    assert.equal(
      trace.events[0]
        .sequence
        .breaks_active_customer_goal,
      true,
    )
  },
)

test(
  'C07 reconhece probe de objeção como ação concreta do vendedor',
  () => {
    const trace =
      buildSellerExecutionTrace({
        diagnostic_input:
          inputFromCase('C07'),
      })

    assert.equal(
      trace.events[0]
        .action_type,
      'objection_probe',
    )

    assert.equal(
      trace.events[0]
        .commercial_objective,
      'diagnose_objection',
    )
  },
)

test(
  'C08 e C10 mantêm baixa confiança de execução quando ainda não existe mensagem humana do vendedor',
  () => {
    for (
      const id of ['C08', 'C10']
    ) {
      const trace =
        buildSellerExecutionTrace({
          diagnostic_input:
            inputFromCase(id),
        })

      assert.equal(
        trace.events.length,
        0,
        id,
      )

      assert.equal(
        trace.summary
          .seller_execution_confidence,
        'low',
        id,
      )
    }
  },
)

test(
  'C09 sinaliza resposta genérica candidata ao transplant test',
  () => {
    const trace =
      buildSellerExecutionTrace({
        diagnostic_input:
          inputFromCase('C09'),
      })

    assert.ok(
      trace.events[0]
        .signals.includes(
          'generic_response_candidate',
        ),
    )
  },
)

test(
  'mensagens automáticas outgoing não são atribuídas ao vendedor humano',
  () => {
    const input =
      inputFromCase('C03')

    input.conversation.messages
      .push({
        id: 'automation-1',
        message_key:
          'automation-1',
        version: 1,
        sequence: 99,
        direction:
          'outgoing',
        author_kind:
          'automation',
        occurred_at:
          '2026-09-27T18:00:00-03:00',
        observed_at:
          '2026-09-27T18:00:01-03:00',
        content_type:
          'text',
        text_content:
          'Mensagem automática.',
        audio_transcription:
          null,
      })

    const trace =
      buildSellerExecutionTrace({
        diagnostic_input:
          input,
      })

    assert.equal(
      trace.events.length,
      1,
    )
  },
)

test(
  'live Lorena preserva intenção de agendamento e distingue retomada de repetição da pergunta',
  () => {
    const diagnosticInput =
      inputFromCase('C01')

    diagnosticInput.conversation.messages = [
      {
        ...diagnosticInput.conversation.messages[0],
        id: 'm1',
        sequence: 1,
        direction: 'incoming',
        author_kind: 'customer',
        text_content:
          'Podemos fazer uma aula experimental hoje?',
      },
      {
        ...diagnosticInput.conversation.messages[1],
        id: 'm2',
        sequence: 2,
        direction: 'outgoing',
        author_kind: 'human_agent',
        text_content:
          'Você já fez a aula experimental?',
      },
      {
        ...diagnosticInput.conversation.messages[0],
        id: 'm3',
        sequence: 3,
        direction: 'incoming',
        author_kind: 'customer',
        text_content:
          'Não fiz ainda.',
      },
      {
        ...diagnosticInput.conversation.messages[1],
        id: 'm4',
        sequence: 4,
        direction: 'outgoing',
        author_kind: 'human_agent',
        text_content:
          'Que ótimo',
      },
      {
        ...diagnosticInput.conversation.messages[1],
        id: 'm5',
        sequence: 5,
        direction: 'outgoing',
        author_kind: 'human_agent',
        text_content:
          'Qual dia e horário fica melhor para você?',
      },
      {
        ...diagnosticInput.conversation.messages[1],
        id: 'm6',
        sequence: 6,
        direction: 'outgoing',
        author_kind: 'human_agent',
        text_content:
          'Vou te mandar nossos planos para você conhecer.',
      },
    ]

    const trace =
      buildSellerExecutionTrace({
        diagnostic_input:
          diagnosticInput,
      })

    assert.equal(
      trace.summary
        .active_customer_intent
        .kind,
      'scheduling',
    )

    assert.equal(
      trace.summary
        .active_customer_intent
        .confidence,
      'high',
    )

    const acknowledgement =
      trace.events.find(
        event =>
          event.message_id === 'm4',
      )

    assert.equal(
      acknowledgement?.action_type,
      'confirmation',
    )

    assert.equal(
      acknowledgement?.sequence
        .breaks_active_customer_goal,
      false,
    )

    assert.equal(
      trace.events.at(-1)
        .message_id,
      'm6',
    )

    assert.equal(
      trace.events.at(-1)
        .sequence
        .breaks_active_customer_goal,
      true,
    )

    assert.equal(
      classifySellerActionText(
        'Quando seria um bom dia e horário para você fazer a experimental?',
      ),
      'scheduling_open_question',
    )

    assert.equal(
      classifySellerActionText(
        'Ainda faz sentido retomarmos sua experimental?',
      ),
      'reengagement',
    )
  },
)
