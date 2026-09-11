import assert from 'node:assert/strict'
import test from 'node:test'

import {
  deriveCommercialResponsibilityFromUserPrompt,
} from './commercial-responsibility.ts'

function prompt(messages) {
  return JSON.stringify({
    input: {
      diagnostic_input: {
        conversation: {
          messages,
        },
      },
    },
  })
}

function incoming(id, text) {
  return {
    id,
    direction: 'incoming',
    text_content: text,
    audio_transcription: null,
  }
}

function outgoing(id, text) {
  return {
    id,
    direction: 'outgoing',
    text_content: text,
    audio_transcription: null,
  }
}

test(
  'mensagem do vendedor com pergunta deixa resposta pendente com o cliente e marca ação já feita',
  () => {
    const result =
      deriveCommercialResponsibilityFromUserPrompt(
        prompt([
          incoming(
            'm1',
            'Tenho interesse no plano anual.',
          ),
          outgoing(
            'm2',
            'Perfeito. Você prefere começar hoje ou amanhã?',
          ),
        ]),
      )

    assert.equal(
      result.pending_fact,
      'customer_response',
    )
    assert.equal(
      result.seller_action_already_performed,
      true,
    )
    assert.equal(
      result.waiting_on,
      'customer',
    )
    assert.ok(
      result.evidence_message_ids.includes(
        'm2',
      ),
    )
  },
)

test(
  'cliente dizendo que vai verificar algo mantém responsabilidade com o cliente',
  () => {
    const result =
      deriveCommercialResponsibilityFromUserPrompt(
        prompt([
          outgoing(
            'm1',
            'Consegue confirmar o pagamento?',
          ),
          incoming(
            'm2',
            'Vou verificar o limite do cartão e te aviso.',
          ),
        ]),
      )

    assert.equal(
      result.pending_fact,
      'customer_commitment',
    )
    assert.equal(
      result.waiting_on,
      'customer',
    )
    assert.equal(
      result.seller_action_already_performed,
      true,
    )
  },
)

test(
  'nova pergunta do cliente transfere a próxima resposta ao vendedor',
  () => {
    const result =
      deriveCommercialResponsibilityFromUserPrompt(
        prompt([
          incoming(
            'm1',
            'Esse plano permite pagamento no Pix?',
          ),
        ]),
      )

    assert.equal(
      result.pending_fact,
      'seller_response',
    )
    assert.equal(
      result.waiting_on,
      'seller',
    )
    assert.equal(
      result.seller_action_already_performed,
      false,
    )
  },
)
