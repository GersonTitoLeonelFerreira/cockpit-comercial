import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyCommercialReasoningCoreV2FactualGuard,
} from './commercial-reasoning-core-v2-factual-guard.ts'

function buildInput(
  text =
    'Quero Pilates para duas pessoas na sexta-feira às 18h.',
) {
  return {
    diagnostic_input: {
      reference_time:
        '2026-09-13T22:16:53.667Z',

      conversation: {
        messages: [
          {
            id:
              'm1',

            content_type:
              'text',

            text_content:
              text,

            audio_transcription:
              null,
          },
        ],
      },

      commercial_context: {
        sales_method: {
          configured:
            true,

          name:
            'Método Yolen',
        },
      },
    },

    state_context: {
      previous_state:
        null,
    },
  }
}

function buildOutput(
  suggestedMessage,
) {
  return {
    contract_version:
      'commercial-reasoning-core-v2',

    status:
      'ready',

    commercial_role:
      'buyer',

    commercial_relevance:
      'commercial',

    situation: {
      summary:
        'A cliente pediu uma aula experimental.',
      customer_intent:
        'Agendar Pilates.',
      commercial_stage:
        'conclusao_operacional',
      confidence:
        'high',
      evidence_message_ids: [
        'm1',
      ],
    },

    responsibility: {
      waiting_on:
        'seller',
      summary:
        'O vendedor precisa verificar disponibilidade.',
      evidence_message_ids: [
        'm1',
      ],
    },

    decision: {
      action:
        'schedule',
      objective:
        'Concluir o próximo passo.',
      reason:
        'A cliente já informou sua preferência.',
      evidence_message_ids: [
        'm1',
      ],
    },

    coaching: {
      strengths:
        [],

      improvement_points:
        [],
    },

    method: {
      configured:
        true,
      name:
        'Método Yolen',
      current_stage:
        'Conclusão',
      adherence:
        'on_method',
      deviation:
        null,
      recovery_move:
        'Verificar disponibilidade.',
      evidence_message_ids: [
        'm1',
      ],
    },

    technique: {
      name:
        'redução de fricção',
      why_applicable:
        'A cliente já avançou.',
      do_not_do:
        [],
    },

    communication: {
      intervention_needed:
        true,
      recommended_question:
        null,
      suggested_message:
        suggestedMessage,
    },

    factuality: {
      facts_used: [
        {
          summary:
            'A cliente pediu Pilates.',
          evidence_message_ids: [
            'm1',
          ],
        },
      ],

      unknowns: [
        'A disponibilidade da vaga ainda não está confirmada.',
      ],
    },

    evidence_message_ids: [
      'm1',
    ],
  }
}

test(
  'Factual Guard remove evidence IDs inexistentes e bloqueia horário inventado',
  () => {
    const output =
      buildOutput(
        'Posso confirmar sua aula às 19h.',
      )

    output
      .situation
      .evidence_message_ids
      .push(
        'm-inexistente',
      )

    output
      .evidence_message_ids
      .push(
        'm-inexistente',
      )

    const result =
      applyCommercialReasoningCoreV2FactualGuard({
        input:
          buildInput(),
        output,
      })

    assert.deepEqual(
      result
        .output
        .situation
        .evidence_message_ids,
      [
        'm1',
      ],
    )

    assert.deepEqual(
      result
        .output
        .evidence_message_ids,
      [
        'm1',
      ],
    )

    assert.equal(
      result
        .output
        .communication
        .suggested_message,
      null,
    )

    assert.ok(
      result
        .report
        .adjustment_codes
        .includes(
          'EVIDENCE_IDS_SANITIZED',
        ),
    )

    assert.ok(
      result
        .report
        .adjustment_codes
        .includes(
          'UNSUPPORTED_NUMERIC_COMMUNICATION_BLOCKED',
        ),
    )
  },
)

test(
  'Factual Guard preserva pergunta segura do caso Carla com horário suportado',
  () => {
    const result =
      applyCommercialReasoningCoreV2FactualGuard({
        input:
          buildInput(),

        output:
          buildOutput(
            'Vocês querem que eu verifique disponibilidade para a próxima sexta-feira, às 18h?',
          ),
      })

    assert.equal(
      result
        .output
        .communication
        .suggested_message,
      'Vocês querem que eu verifique disponibilidade para a próxima sexta-feira, às 18h?',
    )

    assert.equal(
      result
        .report
        .adjusted,
      false,
    )
  },
)

test(
  'Factual Guard bloqueia confirmação operacional quando disponibilidade segue desconhecida',
  () => {
    const result =
      applyCommercialReasoningCoreV2FactualGuard({
        input:
          buildInput(),

        output:
          buildOutput(
            'Perfeito, sua aula está agendada para sexta-feira às 18h.',
          ),
      })

    assert.equal(
      result
        .output
        .communication
        .suggested_message,
      null,
    )

    assert.ok(
      result
        .report
        .adjustment_codes
        .includes(
          'UNVERIFIED_OPERATIONAL_CONFIRMATION_BLOCKED',
        ),
    )
  },
)


test(
  'Factual Guard remove destinatário não verificado da saudação sem perder a mensagem',
  () => {
    const result =
      applyCommercialReasoningCoreV2FactualGuard({
        input:
          buildInput(),

        output:
          buildOutput(
            'Oi, Carla e Juscelaine! Vou verificar a disponibilidade para sexta-feira às 18h.',
          ),
      })

    assert.equal(
      result
        .output
        .communication
        .suggested_message,
      'Oi! Vou verificar a disponibilidade para sexta-feira às 18h.',
    )

    assert.ok(
      result
        .report
        .adjustment_codes
        .includes(
          'UNVERIFIED_RECIPIENT_GREETING_SANITIZED',
        ),
    )
  },
)


test(
  'Factual Guard bloqueia materialização de data não presente no contexto',
  () => {
    const result =
      applyCommercialReasoningCoreV2FactualGuard({
        input:
          buildInput(),

        output:
          buildOutput(
            'Vocês querem tentar no dia 18/09 às 18h?',
          ),
      })

    assert.equal(
      result
        .output
        .communication
        .suggested_message,
      null,
    )

    assert.ok(
      result
        .report
        .adjustment_codes
        .includes(
          'UNSUPPORTED_NUMERIC_COMMUNICATION_BLOCKED',
        ),
    )

    assert.ok(
      result
        .output
        .factuality
        .unknowns
        .some(
          item =>
            item.includes(
              '18/09',
            ),
        ),
    )
  },
)


test(
  'Factual Guard não transforma participante conhecido em identidade do destinatário',
  () => {
    const result =
      applyCommercialReasoningCoreV2FactualGuard({
        input:
          buildInput(
            'Os nomes informados são Carla e Juscelaine. Quero Pilates para duas pessoas na sexta-feira às 18h.',
          ),

        output:
          buildOutput(
            'Oi, Carla! Vi que você pediu Pilates para você e a Juscelaine, sexta-feira às 18h.',
          ),
      })

    assert.equal(
      result
        .output
        .communication
        .suggested_message,
      'Oi! Vi que você pediu Pilates para duas pessoas, sexta-feira às 18h.',
    )

    assert.ok(
      result
        .report
        .adjustment_codes
        .includes(
          'UNVERIFIED_RECIPIENT_GREETING_SANITIZED',
        ),
    )

    assert.ok(
      result
        .report
        .adjustment_codes
        .includes(
          'UNVERIFIED_RECIPIENT_RELATION_SANITIZED',
        ),
    )
  },
)


test(
  'Factual Guard silencia comunicação quando a conversa não é comercialmente acionável',
  () => {
    const output =
      buildOutput(
        'Posso te ajudar a fechar agora.',
      )

    output.commercial_relevance =
      'non_commercial'

    output.decision.action =
      'no_intervention'

    const result =
      applyCommercialReasoningCoreV2FactualGuard({
        input:
          buildInput(
            'Obrigado, tenha um ótimo final de semana.',
          ),

        output,
      })

    assert.equal(
      result
        .output
        .communication
        .intervention_needed,
      false,
    )

    assert.equal(
      result
        .output
        .communication
        .recommended_question,
      null,
    )

    assert.equal(
      result
        .output
        .communication
        .suggested_message,
      null,
    )

    assert.ok(
      result
        .report
        .adjustment_codes
        .includes(
          'NON_ACTIONABLE_COMMUNICATION_NORMALIZED',
        ),
    )
  },
)


test(
  'Factual Guard silencia provider mesmo quando a conversa possui relevância comercial',
  () => {
    const output =
      buildOutput(
        'Posso te ajudar a contratar nosso plano.',
      )

    output.commercial_role =
      'provider'

    output.commercial_relevance =
      'commercial'

    output.decision.action =
      'no_intervention'

    const result =
      applyCommercialReasoningCoreV2FactualGuard({
        input:
          buildInput(
            'Olá, sou representante de uma empresa e gostaria de apresentar nossos serviços.',
          ),

        output,
      })

    assert.equal(
      result
        .output
        .commercial_role,
      'provider',
    )

    assert.equal(
      result
        .output
        .commercial_relevance,
      'commercial',
    )

    assert.equal(
      result
        .output
        .communication
        .intervention_needed,
      false,
    )

    assert.equal(
      result
        .output
        .communication
        .recommended_question,
      null,
    )

    assert.equal(
      result
        .output
        .communication
        .suggested_message,
      null,
    )

    assert.ok(
      result
        .report
        .adjustment_codes
        .includes(
          'NON_ACTIONABLE_COMMUNICATION_NORMALIZED',
        ),
    )
  },
)
