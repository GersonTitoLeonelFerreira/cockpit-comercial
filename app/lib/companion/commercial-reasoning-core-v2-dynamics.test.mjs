import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCommercialReasoningCoreV2Dynamics,
} from './commercial-reasoning-core-v2-dynamics.ts'

function message({
  id,
  sequence,
  direction,
  occurred_at,
  text_content,
}) {
  return {
    id,
    message_key:
      `key-${id}`,
    version:
      1,
    sequence,
    direction,
    occurred_at,
    observed_at:
      occurred_at,
    content_type:
      'text',
    text_content,
    audio_transcription:
      null,
  }
}

function buildInput() {
  const messages = [
    message({
      id: 'm1',
      sequence: 1,
      direction: 'incoming',
      occurred_at: '2026-09-10T10:22:00-03:00',
      text_content:
        'me manda a grade das aulas coletivas pf?',
    }),
    message({
      id: 'm2',
      sequence: 2,
      direction: 'outgoing',
      occurred_at: '2026-09-10T10:31:00-03:00',
      text_content:
        '[Arquivo: GRADE ATUALIZADA.pdf]',
    }),
    message({
      id: 'm3',
      sequence: 3,
      direction: 'incoming',
      occurred_at: '2026-09-10T14:40:00-03:00',
      text_content:
        'Eu e minha amiga gostaríamos de fazer a aula experimental na sexta às 18h, poderia agendar para nós?',
    }),
    message({
      id: 'm4',
      sequence: 4,
      direction: 'incoming',
      occurred_at: '2026-09-11T08:34:00-03:00',
      text_content:
        'Eu e minha amiga gostaríamos de fazer a aula experimental na sexta às 18h, poderia agendar para nós?',
    }),
    message({
      id: 'm5',
      sequence: 5,
      direction: 'outgoing',
      occurred_at: '2026-09-12T07:14:00-03:00',
      text_content:
        'Bom dia, como posso ajudar?',
    }),
  ]

  return {
    diagnostic_input: {
      conversation: {
        active_message_ids:
          messages.map(
            item => item.id,
          ),
        messages,
      },
    },
  }
}

test(
  'dinâmica comercial detecta material atendido, repetição, demora, terceira pessoa e agendamento',
  () => {
    const result =
      buildCommercialReasoningCoreV2Dynamics(
        buildInput(),
      )

    assert.deepEqual(
      result.resolved_attachment_requests,
      [
        {
          request_message_id:
            'm1',
          attachment_message_id:
            'm2',
          attachment_file_name:
            'GRADE ATUALIZADA.pdf',
        },
      ],
    )

    assert.equal(
      result.repeated_customer_requests.length,
      1,
    )

    assert.equal(
      result.repeated_customer_requests[0]
        .first_message_id,
      'm3',
    )

    assert.equal(
      result.repeated_customer_requests[0]
        .repeated_message_id,
      'm4',
    )

    assert.equal(
      result.repeated_customer_requests[0]
        .similarity,
      1,
    )

    assert.ok(
      result.seller_response_gaps.some(
        gap =>
          gap.customer_message_id === 'm4' &&
          gap.seller_message_id === 'm5' &&
          gap.delay_minutes > 1_300,
      ),
    )

    assert.ok(
      result.third_party_mentions.some(
        item =>
          item.message_id === 'm4' &&
          item.relation_terms.includes('amiga'),
      ),
    )

    assert.equal(
      result.explicit_schedule_requests.length,
      2,
    )

    assert.equal(
      result.explicit_schedule_requests[1]
        .has_explicit_time_reference,
      true,
    )
  },
)
