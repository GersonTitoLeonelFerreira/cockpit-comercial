import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCommercialBehaviorPromptRules,
} from './commercial-behavior-prompt-rules.ts'

test(
  'última mensagem outgoing não encerra pedido anterior por construção',
  () => {
    const rules =
      buildCommercialBehaviorPromptRules({
        communication_tone: null,
        required_behaviors: [],
        prohibited_behaviors: [],
      })

    assert.match(
      rules,
      /Não determine responsabilidade comercial apenas por quem enviou a última mensagem/,
    )

    assert.match(
      rules,
      /mensagem outgoing genérica não transfere a responsabilidade ao cliente/,
    )

    assert.match(
      rules,
      /pedido, pergunta ou compromisso anterior continua sem conclusão/,
    )

    assert.match(
      rules,
      /vendedor continua devendo a próxima ação/,
    )
  },
)
