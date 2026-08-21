import test from 'node:test'
import assert from 'node:assert/strict'

const originalApiKey =
  process.env.OPENAI_API_KEY

const originalFetch =
  globalThis.fetch

process.env.OPENAI_API_KEY =
  'commercial-relevance-regression-key'

let providerAvailable =
  true

let providerResponse = {
  confidence: 0.91,
  action_channel: 'whatsapp',
  summary:
    'O contato respondeu e informou quando enviaria um documento.',
  tags: [],
  commercial_relevance:
    'non_commercial',
  facts: {
    lead_responded: true,
    no_response: false,
    commercial_objection_active: false,
    follow_up_requested: true,
    follow_up_has_date_or_period: true,
    visit_or_test_drive_scheduled: false,
    explicit_win: false,
    explicit_loss: false,
    final_intent:
      'Enviar o currículo mais tarde.',
  },
}

globalThis.fetch = async () => ({
  ok:
    providerAvailable,
  status:
    providerAvailable
      ? 200
      : 503,
  async json() {
    return {
      choices: [
        {
          message: {
            content:
              JSON.stringify(
                providerResponse,
              ),
          },
        },
      ],
    }
  },
})

const {
  analyzeConversationWithCopilotDetailed,
} = await import(
  '../ai/sales-copilot.ts'
)

test.after(() => {
  if (originalApiKey === undefined) {
    delete process.env.OPENAI_API_KEY
  } else {
    process.env.OPENAI_API_KEY =
      originalApiKey
  }

  globalThis.fetch =
    originalFetch
})

test('V1 mantém o estado comercial quando uma conversa pessoal termina com promessa de enviar currículo', async () => {
  providerAvailable =
    true

  providerResponse = {
    ...providerResponse,
    commercial_relevance:
      'non_commercial',
  }

  const result =
    await analyzeConversationWithCopilotDetailed({
      context: {
        cycle_id:
          'cycle-synthetic-personal-resume',
        current_status:
          'negociacao',
        current_next_action:
          'Retomar proposta vigente',
        current_next_action_date:
          '2026-08-25T15:00:00.000Z',
        recent_events: [],
      },
      source:
        'whatsapp',
      conversationText: [
        'Vendedor: Como foi seu dia?',
        'Cliente: Foi corrido, ainda vou preparar o jantar.',
        'Vendedor: Vi uma vaga que combina com sua experiência. Posso revisar seu currículo se quiser.',
        'Cliente: Obrigado pela ajuda. Mais tarde eu mando meu currículo.',
        'Vendedor: Sem problema. E melhorou daquele desconforto depois do almoço?',
        'Cliente: Melhorou sim, agora vou descansar.',
      ].join('\n'),
    })

  assert.equal(
    result.suggestion.recommended_status,
    'negociacao',
  )
  assert.equal(
    result.suggestion.next_action,
    null,
  )
  assert.equal(
    result.suggestion.next_action_date,
    null,
  )
  assert.equal(
    result.suggestion.action_result,
    null,
  )
  assert.equal(
    result.suggestion.result_detail,
    null,
  )
  assert.equal(
    result.suggestion.should_close_won,
    false,
  )
  assert.equal(
    result.suggestion.should_close_lost,
    false,
  )
  assert.match(
    result.suggestion.summary,
    /sem evidência comercial relevante/i,
  )
})

test('V1 aplica fail-closed quando a relevância comercial está incerta ou o modelo fica indisponível', async () => {
  providerAvailable =
    true

  providerResponse = {
    ...providerResponse,
    commercial_relevance:
      'uncertain',
  }

  const uncertain =
    await analyzeConversationWithCopilotDetailed({
      context: {
        cycle_id:
          'cycle-uncertain',
        current_status:
          'respondeu',
        recent_events: [],
      },
      source:
        'whatsapp',
      conversationText:
        'Cliente: Depois vejo isso e te aviso.',
    })

  assert.equal(
    uncertain.suggestion.next_action,
    null,
  )
  assert.equal(
    uncertain.suggestion.next_action_date,
    null,
  )

  providerAvailable =
    false

  const unavailable =
    await analyzeConversationWithCopilotDetailed({
      context: {
        cycle_id:
          'cycle-provider-unavailable',
        current_status:
          'negociacao',
        recent_events: [],
      },
      source:
        'whatsapp',
      conversationText:
        'Cliente: Amanhã às 16h eu confirmo.',
    })

  assert.equal(
    unavailable.suggestion.next_action,
    null,
  )
  assert.equal(
    unavailable.suggestion.next_action_date,
    null,
  )
  assert.equal(
    unavailable.diagnostics.selected_rule,
    'commercial_relevance_uncertain',
  )
})

test('V1 reativa a decisão comercial quando a sessão volta explicitamente para a venda', async () => {
  providerAvailable =
    true

  providerResponse = {
    confidence:
      0.94,
    action_channel:
      'whatsapp',
    summary:
      'O contato retomou o plano e aceitou um horário de continuidade.',
    tags: [],
    commercial_relevance:
      'commercial',
    facts: {
      lead_responded:
        true,
      no_response:
        false,
      commercial_objection_active:
        false,
      follow_up_requested:
        true,
      follow_up_has_date_or_period:
        true,
      visit_or_test_drive_scheduled:
        false,
      explicit_win:
        false,
      explicit_loss:
        false,
      final_intent:
        'Retomar o plano amanhã às 16h.',
    },
  }

  const result =
    await analyzeConversationWithCopilotDetailed({
      context: {
        cycle_id:
          'cycle-commercial-reactivated',
        current_status:
          'respondeu',
        recent_events: [],
      },
      source:
        'whatsapp',
      conversationText:
        'Cliente: Sobre o plano que você me passou ontem, pode me ligar amanhã às 16h para fecharmos?',
    })

  assert.equal(
    result.suggestion.next_action,
    'Confirmar agenda / próximo passo',
  )
  assert.notEqual(
    result.suggestion.next_action_date,
    null,
  )
  assert.equal(
    result.diagnostics.engine,
    'yolen',
  )
})
