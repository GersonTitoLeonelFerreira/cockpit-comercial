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
  composeSellerMessage,
} = await import('./lead-seller-message.ts')

const method = {
  id: 'method-1',
  version_number: 1,
  source_contract_version: 'commercial-method-v1',
  name: 'Metodo ATO',
  description: 'Acolher, Tour, Obter',
  structure_source: 'declared_description',
  principles: [],
  stages: [
    {
      key: 'tour',
      name: 'Tour',
      display_order: 2,
      objective: null,
      completion_criteria: [],
      partial_completion_criteria: [],
      deepen_when: [],
      sufficient_when: [],
      advance_when: [],
      wait_when: [],
      stop_asking_when: [],
      recommended_questions: [],
      common_mistakes: [],
    },
  ],
  business_context: {
    business_description: 'Yolen',
    target_audience: 'Empresas com equipe comercial',
    value_proposition: 'Ajudar a executar melhor o processo comercial',
  },
  seller_rules: {
    communication_tone: 'Humana e direta',
    required_behaviors: [],
    prohibited_behaviors: ['Não inventar condições comerciais'],
  },
}

test('não gera mensagem sem intenção explícita do vendedor', async () => {
  let called = false

  const result = await composeSellerMessage({
    workingSummary: 'Cliente está avaliando a solução.',
    sellerIntent: '',
    method,
    guidance: null,
    provider: async () => {
      called = true
      return { content: '{}', provider: 'test' }
    },
  })

  assert.equal(result.status, 'error')
  assert.equal(called, false)
})

test('mensagem recebe intenção do vendedor, resumo e orientação sem transformar recomendação em bloqueio', async () => {
  let request = null

  const result = await composeSellerMessage({
    workingSummary:
      'A cliente explicou que perde oportunidades por falta de follow-up e ainda não recebeu proposta.',
    sellerIntent:
      'Quero perguntar qual parte do follow-up mais atrapalha a equipe hoje.',
    method,
    guidance: {
      status: 'ready',
      method_name: 'Metodo ATO',
      stage_name: 'Tour',
      next_step:
        'Aprofundar a necessidade antes de apresentar proposta.',
    },
    provider: async (payload) => {
      request = payload
      return {
        content: JSON.stringify({
          message:
            'Hoje, em qual parte do follow-up vocês mais sentem que as oportunidades acabam se perdendo?',
        }),
        provider: 'test',
      }
    },
  })

  assert.equal(result.status, 'ready')
  assert.match(result.message, /follow-up/i)

  const userPrompt = JSON.parse(request.user_prompt)
  assert.match(userPrompt.seller_intent, /perguntar/i)
  assert.match(userPrompt.working_summary, /perde oportunidades/i)
  assert.equal(userPrompt.yolen_guidance.stage_name, 'Tour')
  assert.match(request.system_prompt, /intenção do vendedor é a ação principal/i)
})

test('sem orientação comercial ativa ainda permite resposta pedida pelo vendedor sem forçar venda', async () => {
  let request = null

  const result = await composeSellerMessage({
    workingSummary:
      'A conversa atual é pessoal e não existe ação comercial neste momento.',
    sellerIntent:
      'Quero responder de forma natural ao assunto atual.',
    method,
    guidance: {
      status: 'not_applicable',
      method_name: 'Metodo ATO',
      stage_name: null,
      next_step: null,
    },
    provider: async (payload) => {
      request = payload
      return {
        content: JSON.stringify({
          message: 'Kkkk eu também achei isso 😂',
        }),
        provider: 'test',
      }
    },
  })

  assert.equal(result.status, 'ready')
  const userPrompt = JSON.parse(request.user_prompt)
  assert.equal(userPrompt.yolen_guidance.status, 'not_applicable')
  assert.match(request.system_prompt, /não transforme automaticamente/i)
})
