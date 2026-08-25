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

test('conversa atual de contratação pode bloquear aplicação do método sem apagar o resumo', async () => {
  let request = null

  const result = await classifyLeadMethodApplicability({
    workingSummary:
      'O contato possui histórico de relacionamento, mas a conversa atual trata de uma vaga em processo de contratação aguardando decisão da diretoria.',
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
    /histórico de relacionamento/,
  )
  assert.equal(userPrompt.current_interaction.length, 2)
})

test('pendência comercial real pode aplicar método mesmo após abertura neutra', async () => {
  const result = await classifyLeadMethodApplicability({
    workingSummary:
      'Larissa recebeu a proposta da Yolen, apresentou objeção ao investimento e ainda não confirmou decisão.',
    currentInteraction: [
      {
        direction: 'incoming',
        occurred_at: '2026-08-25T10:15:00-03:00',
        text: 'Bom dia',
      },
    ],
    provider: async () => ({
      content: JSON.stringify({
        decision: 'apply_method',
        reason:
          'Existe uma pendência comercial explícita e atual no relacionamento que pode ser retomada.',
      }),
      provider: 'test',
    }),
  })

  assert.equal(result.status, 'apply_method')
})

test('saída inválida do gate falha fechada sem inventar orientação comercial', async () => {
  const result = await classifyLeadMethodApplicability({
    workingSummary: 'Há contexto suficiente.',
    currentInteraction: [],
    provider: async () => ({
      content: '{"decision":"talvez","reason":"incerto"}',
      provider: 'test',
    }),
  })

  assert.equal(result.status, 'error')
})
