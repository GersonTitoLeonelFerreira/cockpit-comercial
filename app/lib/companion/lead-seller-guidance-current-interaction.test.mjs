import assert from 'node:assert/strict'
import { register } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

register(
  fileURLToPath(
    new URL('../../../scripts/typescript-test-loader.mjs', import.meta.url),
  ),
  import.meta.url,
)

const { composeSellerFacingGuidance } =
  await import('./lead-seller-guidance.ts')

const method = {
  id: 'method-v4',
  version_number: 4,
  source_contract_version: 'commercial-method-v2',
  name: 'Metodo AVANÇAR',
  description: 'Método comercial de teste.',
  structure_source: 'structured_definition',
  principles: [],
  stages: [
    {
      key: 'formalizacao',
      name: 'Formalização',
      display_order: 5,
      objective: 'Concluir as pendências depois da decisão.',
      requirement: 'required',
      completion_criteria: [],
      partial_completion_criteria: [],
      skip_conditions: [],
      deepen_when: [],
      sufficient_when: [],
      advance_when: [],
      wait_when: [],
      stop_asking_when: [],
      recommended_questions: [],
      common_mistakes: [],
      dimensions: [],
    },
  ],
  business_context: {
    business_description: 'Academia',
    target_audience: 'Alunos',
    value_proposition: 'Treino',
  },
  seller_rules: {
    communication_tone: 'Direta e humana',
    required_behaviors: [],
    prohibited_behaviors: [],
  },
}

test('orientação recebe a interação atual e trata outgoing como ação já executada', async () => {
  const calls = []

  const result = await composeSellerFacingGuidance({
    mode: 'commercial',
    workingSummary:
      'A contratação já foi decidida. Falta concluir a etapa presencial da foto.',
    currentInteraction: [
      {
        direction: 'outgoing',
        occurred_at: '2026-08-27T00:50:00.000Z',
        text: 'Tudo certo! Ficará então apenas sua foto que iremos tirar no dia que você vier.',
      },
      {
        direction: 'outgoing',
        occurred_at: '2026-08-27T00:51:00.000Z',
        text: 'Você virá amanhã?',
      },
    ],
    method,
    provider: async (request) => {
      calls.push(request)
      return {
        content: JSON.stringify({
          stage_name: 'Formalização',
          stage_reason: 'A decisão já ocorreu e resta uma pendência operacional.',
          next_step: 'Aguarde a resposta sobre a vinda de amanhã antes de fazer nova cobrança.',
          seller_intents: [
            'Quero aguardar a resposta da cliente antes de mandar outra mensagem.',
          ],
        }),
        provider: 'test',
        model: 'test',
        request_id: 'req-1',
        usage: null,
      }
    },
  })

  assert.equal(result.status, 'ready')
  assert.equal(result.stage_name, 'Formalização')
  assert.match(result.next_step, /Aguarde a resposta/i)
  assert.equal(calls.length, 1)

  const payload = JSON.parse(calls[0].user_prompt)
  assert.equal(payload.current_interaction.at(-1).text, 'Você virá amanhã?')
  assert.match(calls[0].system_prompt, /direction="outgoing".*já foram enviadas/s)
  assert.match(calls[0].system_prompt, /NÃO recomende repetir a mesma ação/)
})
