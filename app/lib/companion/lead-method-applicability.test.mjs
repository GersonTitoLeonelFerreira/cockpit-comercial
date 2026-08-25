import assert from 'node:assert/strict'
import { register } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

register(
  fileURLToPath(
    new URL(
      '../../../scripts/typescript-test-loader.mjs',
      import.meta.url,
    ),
  ),
  import.meta.url,
)

const {
  classifyLeadMethodApplicability,
} = await import('./lead-method-applicability.ts')

test('conversa atual de contratação bloqueia aplicação do método sem apagar o resumo', async () => {
  let request = null

  const result = await classifyLeadMethodApplicability({
    workingSummary:
      'O contato possui histórico de relacionamento comercial, mas a conversa atual trata de uma vaga em processo de contratação aguardando decisão da diretoria.',
    currentInteraction: [
      {
        direction: 'incoming',
        occurred_at: '2026-08-25T09:55:00-03:00',
        text: 'Ouviu meu áudio?',
      },
      {
        direction: 'outgoing',
        occurred_at: '2026-08-25T10:00:00-03:00',
        text: 'A vaga ainda não foi selecionada. A diretoria vai definir a contratação.',
      },
    ],
    provider: async (payload) => {
      request = payload
      return {
        content: JSON.stringify({
          decision: 'no_commercial_action',
          current_signal: 'none',
          reason:
            'A interação atual é sobre contratação e não contém uma ação de venda para o contato.',
        }),
        provider: 'test',
      }
    },
  })

  assert.equal(result.status, 'no_commercial_action')
  assert.match(request.system_prompt, /contratação ou emprego/)

  const userPrompt = JSON.parse(request.user_prompt)
  assert.match(
    userPrompt.working_summary,
    /histórico de relacionamento comercial/,
  )
  assert.equal(userPrompt.current_interaction.length, 2)
})

test('histórico comercial antigo não reativa método durante conversa operacional como a Rayane', async () => {
  const result = await classifyLeadMethodApplicability({
    workingSummary:
      'Rayane já teve contatos comerciais antigos e existe histórico salvo na Yolen.',
    currentInteraction: [
      {
        direction: 'outgoing',
        occurred_at: '2026-08-25T12:22:00-03:00',
        text: 'Ray, sei que você está no horário de almoço mas só para tirar uma dúvida: você fez o pedido da geladeira?',
      },
    ],
    provider: async () => ({
      content: JSON.stringify({
        decision: 'apply_method',
        current_signal: 'none',
        reason:
          'Existe histórico comercial anterior que poderia ser retomado.',
      }),
      provider: 'test',
    }),
  })

  assert.equal(result.status, 'no_commercial_action')
  assert.match(
    result.reason,
    /não contém sinal comercial/i,
  )
})

test('saudação neutra sozinha não reativa proposta antiga', async () => {
  const result = await classifyLeadMethodApplicability({
    workingSummary:
      'Larissa recebeu proposta da Yolen e apresentou objeção ao investimento anteriormente.',
    currentInteraction: [
      {
        direction: 'incoming',
        occurred_at: '2026-08-25T10:15:00-03:00',
        text: 'Bom dia',
      },
    ],
    provider: async () => ({
      content: JSON.stringify({
        decision: 'no_commercial_action',
        current_signal: 'none',
        reason:
          'A interação atual é apenas uma saudação e não retomou a proposta.',
      }),
      provider: 'test',
    }),
  })

  assert.equal(result.status, 'no_commercial_action')
})

test('continuação explícita de pendência comercial pode aplicar método', async () => {
  const result = await classifyLeadMethodApplicability({
    workingSummary:
      'Larissa recebeu proposta da Yolen, apresentou objeção ao investimento e ainda não confirmou decisão.',
    currentInteraction: [
      {
        direction: 'incoming',
        occurred_at: '2026-08-25T10:15:00-03:00',
        text: 'Sobre aquela proposta, consigo pagar em três vezes?',
      },
    ],
    provider: async () => ({
      content: JSON.stringify({
        decision: 'apply_method',
        current_signal: 'direct_continuation',
        reason:
          'A interação atual retomou explicitamente a proposta e a condição de pagamento.',
      }),
      provider: 'test',
    }),
  })

  assert.equal(result.status, 'apply_method')
})

test('interação comercial explícita aplica método', async () => {
  const result = await classifyLeadMethodApplicability({
    workingSummary:
      'O lead está conhecendo a solução da empresa.',
    currentInteraction: [
      {
        direction: 'incoming',
        occurred_at: '2026-08-25T10:15:00-03:00',
        text: 'Quanto custa e como funciona o plano?',
      },
    ],
    provider: async () => ({
      content: JSON.stringify({
        decision: 'apply_method',
        current_signal: 'commercial',
        reason:
          'O cliente perguntou diretamente sobre preço e funcionamento da oferta.',
      }),
      provider: 'test',
    }),
  })

  assert.equal(result.status, 'apply_method')
})

test('sem interação atual falha fechada sem chamar IA', async () => {
  let providerCalls = 0

  const result = await classifyLeadMethodApplicability({
    workingSummary: 'Há contexto suficiente.',
    currentInteraction: [],
    provider: async () => {
      providerCalls += 1
      return {
        content: '{}',
        provider: 'test',
      }
    },
  })

  assert.equal(result.status, 'no_commercial_action')
  assert.equal(providerCalls, 0)
})

test('saída inválida do gate falha fechada sem inventar orientação comercial', async () => {
  const result = await classifyLeadMethodApplicability({
    workingSummary: 'Há contexto suficiente.',
    currentInteraction: [
      {
        direction: 'incoming',
        occurred_at: null,
        text: 'Olá',
      },
    ],
    provider: async () => ({
      content:
        '{"decision":"talvez","current_signal":"none","reason":"incerto"}',
      provider: 'test',
    }),
  })

  assert.equal(result.status, 'error')
})
