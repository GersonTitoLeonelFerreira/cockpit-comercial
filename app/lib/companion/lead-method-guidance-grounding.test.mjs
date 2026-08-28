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
  composeLeadMethodGuidance,
  normalizePublishedCommercialMethod,
} = await import('./lead-method-guidance.ts')

function buildStage(overrides = {}) {
  return {
    key: 'acolher',
    display_order: 1,
    name: 'Acolher',
    objective: 'Criar abertura e compreender o contexto inicial.',
    requirement: 'required',
    completion_criteria: ['Contexto inicial compreendido'],
    partial_completion_criteria: [],
    skip_conditions: [],
    recommended_questions: ['O que trouxe você até aqui?'],
    common_mistakes: [],
    deepen_when: [],
    sufficient_when: ['O motivo do contato estiver claro'],
    advance_when: [],
    wait_when: [],
    stop_asking_when: ['A motivação já estiver clara'],
    dimensions: [],
    ...overrides,
  }
}

const methodResult = normalizePublishedCommercialMethod({
  id: 'ef09c47e-83c5-401d-867c-bdf1f909e838',
  version_number: 1,
  // Colunas legadas mantidas por histórico; propositalmente divergem da
  // definição V2 para provar que não são mais lidas.
  commercial_method_name: 'Metodo legado (não deve ser usado)',
  commercial_method_description:
    'Metodo ato são 3 passos:\nAcolher\nTour\nObter (texto legado, não deve ser parseado)',
  commercial_method_contract_version: 'commercial-method-v2',
  commercial_method_definition: {
    contract_version: 'commercial-method-v2',
    name: 'Metodo ATO',
    description: 'Acolher, compreender no Tour e Obter o desfecho adequado.',
    principles: ['Não transformar descoberta em interrogatório.'],
    stages: [
      buildStage(),
      buildStage({ key: 'tour', display_order: 2, name: 'Tour', objective: 'Compreender a necessidade relevante.' }),
      buildStage({ key: 'obter', display_order: 3, name: 'Obter', objective: 'Conduzir ao desfecho comercial adequado.' }),
    ],
  },
  business_description: 'Academia com atendimento comercial.',
  target_audience: 'Clientes da academia.',
  value_proposition: 'Planos e serviços da academia.',
  communication_tone: 'Clara e humana.',
  required_behaviors: [],
  prohibited_behaviors: [],
})

assert.equal(methodResult.status, 'active')
const method = methodResult.method

test('rejeita pagamento e compra quando o resumo trata apenas de verificação contratual', async () => {
  assert.ok(method)

  let attempt = 0
  const provider = async () => {
    attempt += 1

    if (attempt === 1) {
      return {
        content: JSON.stringify({
          stage_name: 'Obter',
          stage_reason:
            'É preciso confirmar se todas as dúvidas foram sanadas para seguir para pagamento.',
          next_step:
            'Confirme se está tudo certo para o pagamento e obtenha a intenção de efetivar a compra.',
        }),
        provider: 'test',
      }
    }

    return {
      content: JSON.stringify({
        stage_name: 'Acolher',
        stage_reason:
          'O cliente aguarda uma verificação objetiva sobre a situação do contrato após informar o CPF.',
        next_step:
          'Verifique a situação do contrato usando o CPF informado e retorne ao cliente com a confirmação encontrada.',
      }),
      provider: 'test',
    }
  }

  const guidance = await composeLeadMethodGuidance({
    workingSummary:
      'O cliente entrou em contato para saber a situação do seu contrato, questionando inicialmente se o contrato estava cancelado. Foi solicitado o CPF para verificação.',
    method,
    provider,
  })

  assert.equal(attempt, 2)
  assert.equal(guidance.status, 'ready')
  assert.equal(guidance.stage_name, 'Acolher')
  assert.match(guidance.next_step, /verifique a situação do contrato/i)
  assert.doesNotMatch(guidance.next_step, /pagamento|compra/i)
})

test('falha fechado quando as duas tentativas inventam fechamento sem evidência', async () => {
  assert.ok(method)

  const provider = async () => ({
    content: JSON.stringify({
      stage_name: 'Obter',
      stage_reason: 'Conduzir para o fechamento.',
      next_step: 'Confirme a compra e finalize o pagamento.',
    }),
    provider: 'test',
  })

  const guidance = await composeLeadMethodGuidance({
    workingSummary:
      'O cliente pediu confirmação da situação cadastral e enviou o CPF para consulta.',
    method,
    provider,
  })

  assert.equal(guidance.status, 'error')
  assert.equal(guidance.next_step, null)
})
