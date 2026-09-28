import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  buildSellerExecutionTrace,
} from './seller-execution-trace.ts'

import {
  buildSellerSequenceMethodAssessment,
} from './seller-sequence-method-assessment.ts'

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
          'Descobrir, conduzir e avançar.',
        principles: [
          'Não pular etapas sem evidência.',
        ],
        definition: null,
        steps: [
          {
            step_order: 1,
            name: 'Descoberta',
            objective:
              'Entender contexto.',
            completion_criteria: [],
            recommended_questions: [],
            is_required: true,
          },
          {
            step_order: 2,
            name: 'Próximo compromisso',
            objective:
              'Transformar intenção em ação.',
            completion_criteria: [],
            recommended_questions: [],
            is_required: true,
          },
        ],
      },
      products: [],
      facts: [],
      objection_guides: [],
    },
  }
}

function reading({
  adherence = 'on_method',
  recovery = null,
} = {}) {
  return {
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
        status: adherence,
        summary:
          'Leitura canônica.',
        deviation_stage_order:
          adherence ===
            'on_method'
            ? null
            : 2,
        what_happened: null,
        missing_information: [],
        why_it_matters: null,
        evidence_message_ids: [],
        memory_ids: [],
      },
      recovery_guidance:
        recovery,
    },
  }
}

function assess(id, readingArgs) {
  const input =
    inputFromCase(id)

  const trace =
    buildSellerExecutionTrace({
      diagnostic_input:
        input,
    })

  return buildSellerSequenceMethodAssessment({
    reading:
      reading(
        readingArgs,
      ),
    diagnostic_input:
      input,
    trace,
  })
}

test(
  'C01 conecta pergunta aberta de agendamento com scheduling_choice e detecta quebra de sequência',
  () => {
    const result =
      assess('C01')

    assert.ok(
      result.situations.includes(
        'scheduling_choice',
      ),
    )

    assert.ok(
      result.signals.includes(
        'seller_already_asked_open_question',
      ),
    )

    assert.ok(
      result.signals.includes(
        'sequence_break',
      ),
    )

    assert.equal(
      result.sequence
        .waiting_for_customer,
      false,
    )
  },
)

test(
  'C02 preserva o sinal client_sparse_seller_rich sem exigir mais fala do cliente',
  () => {
    const result =
      assess('C02')

    assert.ok(
      result.signals.includes(
        'client_sparse_seller_rich',
      ),
    )
  },
)

test(
  'C03 transforma ação final com compromisso pendente em waiting_for_customer',
  () => {
    const result =
      assess('C03')

    assert.equal(
      result.sequence
        .waiting_for_customer,
      true,
    )

    assert.ok(
      result.situations.includes(
        'waiting_for_customer',
      ),
    )

    assert.ok(
      result.signals.includes(
        'seller_action_already_performed',
      ),
    )

    assert.ok(
      result.signals.includes(
        'waiting_on_customer',
      ),
    )
  },
)

test(
  'C04 reconhece fato novo e não mantém waiting congelado',
  () => {
    const result =
      assess('C04')

    assert.equal(
      result.sequence
        .customer_fact_after_action,
      true,
    )

    assert.equal(
      result.sequence
        .waiting_for_customer,
      false,
    )

    assert.ok(
      result.signals.includes(
        'customer_rejected_options',
      ),
    )
  },
)

test(
  'C05 conecta oferta prematura a discovery_gap e missing_context',
  () => {
    const result =
      assess('C05')

    assert.ok(
      result.situations.includes(
        'discovery_gap',
      ),
    )

    assert.ok(
      result.signals.includes(
        'missing_context',
      ),
    )

    assert.equal(
      result.method
        .deviation_detected,
      true,
    )
  },
)

test(
  'C06 marca descoberta tardia depois de intenção explícita de fechamento',
  () => {
    const result =
      assess('C06')

    assert.ok(
      result.signals.includes(
        'late_discovery_after_close_intent',
      ),
    )

    assert.ok(
      result.situations.includes(
        'next_step_choice',
      ),
    )

    assert.equal(
      result.method
        .deviation_detected,
      true,
    )
  },
)

test(
  'método publicado e Commercial Reading permanecem fontes de verdade para estágio e recuperação',
  () => {
    const result =
      assess(
        'C01',
        {
          adherence:
            'off_method',
          recovery: {
            objective:
              'Retomar o compromisso de agendamento.',
            missing_information: [],
            recommended_move:
              'Retomar a experimental antes de apresentar outra etapa.',
            optional_question: null,
            evidence_message_ids: [
              'm2',
            ],
            memory_ids: [],
          },
        },
      )

    assert.equal(
      result.method
        .configured,
      true,
    )

    assert.equal(
      result.method
        .current_stage.name,
      'Próximo compromisso',
    )

    assert.equal(
      result.method
        .recovery_objective,
      'Retomar o compromisso de agendamento.',
    )

    assert.equal(
      result.method.source,
      'commercial_reading',
    )
  },
)

test(
  'espera antiga vira stale_waiting_for_customer sem apagar o fato de que o vendedor já pediu o compromisso',
  () => {
    const diagnosticInput =
      inputFromCase('C03')

    diagnosticInput.reference_time =
      '2026-09-30T17:00:00-03:00'

    const trace =
      buildSellerExecutionTrace({
        diagnostic_input:
          diagnosticInput,
      })

    const result =
      buildSellerSequenceMethodAssessment({
        reading: reading(),
        diagnostic_input:
          diagnosticInput,
        trace,
      })

    assert.equal(
      result.sequence
        .waiting_for_customer,
      true,
    )

    assert.equal(
      result.sequence
        .stale_waiting_for_customer,
      true,
    )

    assert.ok(
      result.sequence
        .waiting_duration_ms >=
        48 * 60 * 60 * 1000,
    )

    assert.ok(
      result.signals.includes(
        'stale_waiting_for_customer',
      ),
    )
  },
)
