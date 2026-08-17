import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildStatefulActiveResponseData,
} from './stateful-copilot-active-response.ts'

const context = {
  cycle_id:
    '20000000-0000-4000-8000-000000000001',

  current_status:
    'contato',

  current_next_action:
    'Retornar contato',

  current_next_action_date:
    '2026-08-18T15:00:00.000Z',
}

function buildOutput({
  crmShouldChange = false,
  crmStatus = null,
  crmRationale = null,
  agendaShouldChange = false,
  agendaDate = null,
} = {}) {
  return {
    operational_suggestions: {
      crm: {
        should_change_crm_stage:
          crmShouldChange,

        recommended_status:
          crmStatus,

        rationale:
          crmRationale,

        requires_human_confirmation:
          true,
      },

      agenda: {
        should_change_agenda:
          agendaShouldChange,

        expected_next_action_at:
          agendaDate,

        rationale:
          agendaShouldChange
            ? 'Existe próximo passo confirmado.'
            : null,

        requires_human_confirmation:
          true,
      },
    },

    interpretation: {
      current_moment: {
        summary:
          'Lead demonstrou interesse e a conversa segue aberta.',
      },
    },

    strategy: {
      next_move:
        'Responder a dúvida e confirmar o próximo passo.',

      rationale:
        'A conversa ainda precisa avançar antes de qualquer fechamento.',

      suggested_message:
        'Posso te explicar esse ponto e depois alinhamos o próximo passo?',
    },
  }
}

test(
  'active mantém etapa e agenda quando V2 não recomenda alteração operacional',
  () => {
    const result =
      buildStatefulActiveResponseData({
        context,
        output:
          buildOutput(),
      })

    assert.equal(
      result.engine_source,
      'stateful',
    )

    assert.equal(
      result.suggestion
        .recommended_status,
      'contato',
    )

    assert.equal(
      result.suggestion
        .confidence,
      null,
    )

    assert.equal(
      result.suggestion
        .next_action,
      'Retornar contato',
    )

    assert.equal(
      result.suggestion
        .next_action_date,
      '2026-08-18T15:00:00.000Z',
    )

    assert.equal(
      result.coaching
        .suggested_message,
      'Posso te explicar esse ponto e depois alinhamos o próximo passo?',
    )

    assert.equal(
      Object.hasOwn(
        result,
        'saved_coaching',
      ),
      false,
    )
  },
)

test(
  'active traduz recomendações V2 de CRM e agenda sem aplicar automaticamente',
  () => {
    const result =
      buildStatefulActiveResponseData({
        context,
        output:
          buildOutput({
            crmShouldChange:
              true,

            crmStatus:
              'negociacao',

            crmRationale:
              'Lead pediu condições comerciais.',

            agendaShouldChange:
              true,

            agendaDate:
              '2026-08-19T18:00:00.000Z',
          }),
      })

    assert.equal(
      result.suggestion
        .recommended_status,
      'negociacao',
    )

    assert.equal(
      result.suggestion
        .next_action,
      'Responder a dúvida e confirmar o próximo passo.',
    )

    assert.equal(
      result.suggestion
        .next_action_date,
      '2026-08-19T18:00:00.000Z',
    )

    assert.equal(
      result.suggestion
        .reason_for_recommendation,
      'Lead pediu condições comerciais.',
    )

    assert.equal(
      result.suggestion
        .source,
      'yolen',
    )

    assert.equal(
      result.suggestion
        .confidence,
      null,
    )

    assert.equal(
      Object.hasOwn(
        result,
        'saved_coaching',
      ),
      false,
    )
  },
)

test(
  'active identifica fechamento sem liberar aplicação automática',
  () => {
    const result =
      buildStatefulActiveResponseData({
        context,
        output:
          buildOutput({
            crmShouldChange:
              true,

            crmStatus:
              'perdido',

            crmRationale:
              'Lead confirmou escolha por concorrente.',
          }),
      })

    assert.equal(
      result.suggestion
        .should_close_lost,
      true,
    )

    assert.equal(
      result.suggestion
        .should_close_won,
      false,
    )

    assert.equal(
      result.suggestion
        .close_reason,
      'Lead confirmou escolha por concorrente.',
    )

    assert.equal(
      Object.hasOwn(
        result,
        'saved_coaching',
      ),
      false,
    )
  },
)
