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

const method = normalizePublishedCommercialMethod({
  id: 'ef09c47e-83c5-401d-867c-bdf1f909e838',
  version_number: 1,
  commercial_method_name: 'Metodo ATO',
  commercial_method_description: 'Metodo ato são 3 passos:\nAcolher\nTour\nObter',
  commercial_method_contract_version: 'commercial-method-v1',
  commercial_method_definition: null,
  business_description: 'Academia com atendimento comercial.',
  target_audience: 'Clientes da academia.',
  value_proposition: 'Planos e serviços da academia.',
  communication_tone: 'Clara e humana.',
  required_behaviors: [],
  prohibited_behaviors: [],
})

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
