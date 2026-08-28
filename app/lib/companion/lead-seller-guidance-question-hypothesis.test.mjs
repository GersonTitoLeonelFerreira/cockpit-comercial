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
  description: 'Teste',
  structure_source: 'structured_definition',
  principles: [],
  stages: [{
    key: 'formalizacao',
    name: 'Formalização',
    display_order: 5,
    objective: 'Concluir pendências',
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
  }],
  business_context: {
    business_description: 'Academia',
    target_audience: 'Alunos',
    value_proposition: 'Treino',
  },
  seller_rules: {
    communication_tone: 'Direta',
    required_behaviors: [],
    prohibited_behaviors: [],
  },
}

test('pergunta do cliente não vira fato confirmado na orientação', async () => {
  const outputs = [
    {
      stage_name: 'Formalização',
      stage_reason: 'Existe uma dúvida operacional.',
      next_step: 'Explique que é só fazer o check-in pelo app.',
      seller_intents: ['Quero informar que basta fazer o check-in pelo app.'],
    },
    {
      stage_name: 'Formalização',
      stage_reason: 'Existe uma dúvida operacional.',
      next_step: 'Confirme a regra correta do check-in antes de orientar a cliente.',
      seller_intents: ['Quero verificar a regra do check-in antes de responder.'],
    },
  ]
  let index = 0

  const result = await composeSellerFacingGuidance({
    mode: 'commercial',
    workingSummary: 'A cliente está em formalização e perguntou sobre o aplicativo.',
    currentInteraction: [{
      direction: 'incoming',
      occurred_at: '2026-08-27T01:00:00.000Z',
      text: 'Quando eu chegar é só fazer o check-in pelo app?',
    }],
    method,
    provider: async () => ({
      content: JSON.stringify(outputs[index++]),
      provider: 'test',
      model: 'test',
      request_id: 'req',
      usage: null,
    }),
  })

  assert.equal(result.status, 'ready')
  assert.match(result.next_step, /Confirme a regra correta/i)
  assert.equal(index, 2)
})
