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

function incoming(id, text, author_kind) {
  return {
    id,
    direction: 'incoming',
    ...(author_kind ? { author_kind } : {}),
    text_content: text,
    audio_transcription: null,
  }
}

function outgoing(id, text, author_kind) {
  return {
    id,
    direction: 'outgoing',
    ...(author_kind ? { author_kind } : {}),
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

// R2.4 — author_kind é a autoridade de autoria. Fixture obrigatória:
// M1 incoming/customer, M2 outgoing/automation, M3 outgoing/human_agent,
// M4 outgoing/unknown. Uma automação (bot/flow do ManyChat) enviada como
// outgoing NUNCA pode contar como "o vendedor já agiu" nem entrar em
// evidence_message_ids; 'unknown' falha fechado pelo mesmo motivo.
test(
  'M2 (outgoing/automation) nunca conta como ação do vendedor nem entra em evidence_message_ids',
  () => {
    const result =
      deriveCommercialResponsibilityFromUserPrompt(
        prompt([
          incoming(
            'm1',
            'Tenho interesse no plano anual.',
            'customer',
          ),
          outgoing(
            'm2',
            'Você prefere começar hoje ou amanhã?',
            'automation',
          ),
        ]),
      )

    assert.equal(
      result.seller_action_already_performed,
      false,
    )
    assert.ok(
      !result.evidence_message_ids.includes(
        'm2',
      ),
    )
  },
)

test(
  'M3 (outgoing/human_agent) pode entrar em evidence_message_ids e conta como ação do vendedor',
  () => {
    const result =
      deriveCommercialResponsibilityFromUserPrompt(
        prompt([
          incoming(
            'm1',
            'Tenho interesse no plano anual.',
            'customer',
          ),
          outgoing(
            'm2',
            'Você prefere começar hoje ou amanhã?',
            'human_agent',
          ),
        ]),
      )

    assert.equal(
      result.seller_action_already_performed,
      true,
    )
    assert.ok(
      result.evidence_message_ids.includes(
        'm2',
      ),
    )
  },
)

test(
  'M4 (outgoing/unknown) falha fechado — nunca conta como ação do vendedor nem entra em evidence_message_ids',
  () => {
    const result =
      deriveCommercialResponsibilityFromUserPrompt(
        prompt([
          incoming(
            'm1',
            'Tenho interesse no plano anual.',
            'customer',
          ),
          outgoing(
            'm2',
            'Você prefere começar hoje ou amanhã?',
            'unknown',
          ),
        ]),
      )

    assert.equal(
      result.seller_action_already_performed,
      false,
    )
    assert.ok(
      !result.evidence_message_ids.includes(
        'm2',
      ),
    )
  },
)

test(
  'M1 (incoming/customer) é evidência válida de compromisso futuro do cliente',
  () => {
    const result =
      deriveCommercialResponsibilityFromUserPrompt(
        prompt([
          outgoing(
            'm1',
            'Consegue confirmar o pagamento?',
            'human_agent',
          ),
          incoming(
            'm2',
            'Vou verificar o limite do cartão e te aviso.',
            'customer',
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
  },
)

test(
  'compromisso futuro atribuído a mensagem incoming com author_kind unknown falha fechado (não vira customer_commitment)',
  () => {
    const result =
      deriveCommercialResponsibilityFromUserPrompt(
        prompt([
          outgoing(
            'm1',
            'Consegue confirmar o pagamento?',
            'human_agent',
          ),
          incoming(
            'm2',
            'Vou verificar o limite do cartão e te aviso.',
            'unknown',
          ),
        ]),
      )

    assert.notEqual(
      result.pending_fact,
      'customer_commitment',
    )
  },
)

// R2.4 (correção final) — waiting_on/pending_fact também são claims de
// autoria, não apenas de transporte. Casos A-F obrigatórios: só
// outgoing+human_agent e incoming+customer podem transferir
// responsabilidade comercial; automation/unknown nunca podem fazê-lo
// apenas por direction — devem falhar fechado (waiting_on='unknown',
// pending_fact=null), usando os tipos já existentes.

test(
  'A. outgoing + human_agent transfere responsabilidade ao cliente',
  () => {
    const result =
      deriveCommercialResponsibilityFromUserPrompt(
        prompt([
          incoming(
            'm1',
            'Tenho interesse no plano anual.',
            'customer',
          ),
          outgoing(
            'm2',
            'Combinado, qualquer coisa me chama.',
            'human_agent',
          ),
        ]),
      )

    assert.equal(
      result.waiting_on,
      'customer',
    )
    assert.equal(
      result.pending_fact,
      'customer_response',
    )
  },
)

test(
  'B. incoming + customer transfere responsabilidade ao vendedor',
  () => {
    const result =
      deriveCommercialResponsibilityFromUserPrompt(
        prompt([
          outgoing(
            'm1',
            'Posso te ajudar em algo?',
            'human_agent',
          ),
          incoming(
            'm2',
            'Esse plano permite pagamento no Pix?',
            'customer',
          ),
        ]),
      )

    assert.equal(
      result.waiting_on,
      'seller',
    )
    assert.equal(
      result.pending_fact,
      'seller_response',
    )
  },
)

test(
  'C. outgoing + automation não transfere responsabilidade ao cliente apenas por direction',
  () => {
    const result =
      deriveCommercialResponsibilityFromUserPrompt(
        prompt([
          incoming(
            'm1',
            'Tenho interesse no plano anual.',
            'customer',
          ),
          outgoing(
            'm2',
            'Combinado, qualquer coisa me chama.',
            'automation',
          ),
        ]),
      )

    assert.notEqual(
      result.waiting_on,
      'customer',
    )
    assert.notEqual(
      result.pending_fact,
      'customer_response',
    )
    assert.equal(
      result.waiting_on,
      'unknown',
    )
    assert.equal(
      result.pending_fact,
      null,
    )
  },
)

test(
  'D. outgoing + unknown não transfere responsabilidade ao cliente apenas por direction',
  () => {
    const result =
      deriveCommercialResponsibilityFromUserPrompt(
        prompt([
          incoming(
            'm1',
            'Tenho interesse no plano anual.',
            'customer',
          ),
          outgoing(
            'm2',
            'Combinado, qualquer coisa me chama.',
            'unknown',
          ),
        ]),
      )

    assert.notEqual(
      result.waiting_on,
      'customer',
    )
    assert.notEqual(
      result.pending_fact,
      'customer_response',
    )
    assert.equal(
      result.waiting_on,
      'unknown',
    )
    assert.equal(
      result.pending_fact,
      null,
    )
  },
)

test(
  'E. incoming + unknown não transfere responsabilidade ao vendedor apenas por direction',
  () => {
    const result =
      deriveCommercialResponsibilityFromUserPrompt(
        prompt([
          outgoing(
            'm1',
            'Posso te ajudar em algo?',
            'human_agent',
          ),
          incoming(
            'm2',
            'Esse plano permite pagamento no Pix?',
            'unknown',
          ),
        ]),
      )

    assert.notEqual(
      result.waiting_on,
      'seller',
    )
    assert.notEqual(
      result.pending_fact,
      'seller_response',
    )
    assert.equal(
      result.waiting_on,
      'unknown',
    )
    assert.equal(
      result.pending_fact,
      null,
    )
  },
)

test(
  'F. incoming + automation não transfere responsabilidade ao vendedor apenas por direction',
  () => {
    const result =
      deriveCommercialResponsibilityFromUserPrompt(
        prompt([
          outgoing(
            'm1',
            'Posso te ajudar em algo?',
            'human_agent',
          ),
          incoming(
            'm2',
            'Esse plano permite pagamento no Pix?',
            'automation',
          ),
        ]),
      )

    assert.notEqual(
      result.waiting_on,
      'seller',
    )
    assert.notEqual(
      result.pending_fact,
      'seller_response',
    )
    assert.equal(
      result.waiting_on,
      'unknown',
    )
    assert.equal(
      result.pending_fact,
      null,
    )
  },
)
