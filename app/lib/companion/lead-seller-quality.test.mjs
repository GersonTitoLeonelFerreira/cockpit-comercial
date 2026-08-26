import assert from 'node:assert/strict'
import test from 'node:test'

import {
  composeSellerFacingGuidance,
} from './lead-seller-guidance.ts'
import {
  composeSellerMessage,
} from './lead-seller-message.ts'

const method = {
  id: 'method-1',
  version_number: 1,
  source_contract_version: 'v2',
  name: 'Método publicado',
  description: 'Atender com clareza e avançar somente quando houver sinal comercial.',
  structure_source: 'structured_definition',
  principles: ['Não forçar venda.'],
  stages: [
    {
      key: 'descoberta',
      name: 'Descoberta',
      display_order: 1,
      objective: 'Entender a necessidade.',
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
    {
      key: 'conclusao',
      name: 'Conclusão',
      display_order: 2,
      objective: 'Concluir quando o cliente já decidiu.',
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
    business_description: 'Empresa de serviços.',
    target_audience: null,
    value_proposition: null,
  },
  seller_rules: {
    communication_tone: 'Claro e humano.',
    required_behaviors: [],
    prohibited_behaviors: ['Não inventar condições.'],
  },
}

function providerSequence(contents) {
  const calls = []
  let index = 0

  const provider = async (input) => {
    calls.push(input)
    const content = contents[Math.min(index, contents.length - 1)]
    index += 1
    return { content }
  }

  provider.calls = calls
  return provider
}

test('A — suporte Gympass mantém orientação operacional, específica e sem virar venda', async () => {
  const provider = providerSequence([
    JSON.stringify({
      next_step: 'Responda de forma natural e fique à disposição.',
      seller_intents: [
        'Quero responder de forma natural.',
      ],
    }),
    JSON.stringify({
      next_step:
        'Esclareça a dúvida sobre o check-in no app sem assumir uma regra que ainda não esteja confirmada no contexto.',
      seller_intents: [
        'Quero explicar somente o que está confirmado sobre o check-in.',
        'Quero confirmar se conseguiu acessar o app.',
        'Quero encerrar o atendimento depois de esclarecer o check-in.',
      ],
    }),
  ])

  const result = await composeSellerFacingGuidance({
    mode: 'operational',
    workingSummary:
      'Cliente assinou Gympass pelo Wellhub e perguntou se basta fazer check-in pelo aplicativo quando chegar.',
    currentInteraction: [
      {
        direction: 'incoming',
        occurred_at: '2026-08-25T20:00:00-03:00',
        text: 'Quando eu chegar é só fazer o check-in pelo app?',
      },
    ],
    method,
    provider,
  })

  assert.equal(result.status, 'not_applicable')
  assert.match(result.next_step, /check-in/i)
  assert.equal(result.seller_intents.length, 3)
  assert.doesNotMatch(
    `${result.next_step} ${result.seller_intents.join(' ')}`,
    /matr[ií]cula|proposta|pagamento|fechamento/i,
  )
  assert.equal(provider.calls.length, 2)
  assert.match(
    provider.calls[1].system_prompt,
    /gen[eé]ric/i,
  )
})

test('B — contrato/CPF permanece verificação contratual sem pagamento ou fechamento', async () => {
  const provider = providerSequence([
    JSON.stringify({
      next_step:
        'Consulte a situação do contrato usando o CPF solicitado e retorne apenas com o que estiver confirmado.',
      seller_intents: [
        'Quero consultar a situação do contrato com o CPF solicitado.',
        'Quero confirmar quais dados são necessários para consultar o contrato.',
        'Quero retornar com a verificação do contrato.',
      ],
    }),
  ])

  const result = await composeSellerFacingGuidance({
    mode: 'operational',
    workingSummary:
      'Cliente perguntou a situação do contrato. O CPF foi solicitado para consulta.',
    currentInteraction: [],
    method,
    provider,
  })

  assert.equal(result.status, 'not_applicable')
  assert.match(result.next_step, /contrato/i)
  assert.match(result.next_step, /CPF/i)
  assert.doesNotMatch(
    `${result.next_step} ${result.seller_intents.join(' ')}`,
    /pagamento|fechamento|comprar|proposta/i,
  )
})

test('C — venda real permite orientação de conclusão quando plano e valor já foram discutidos', async () => {
  const provider = providerSequence([
    JSON.stringify({
      stage_name: 'Conclusão',
      stage_reason:
        'O cliente já conhece o plano, o valor foi discutido e perguntou como concluir.',
      next_step:
        'Explique como concluir o plano com base no valor já discutido e confirme se falta alguma etapa que esteja registrada no contexto.',
      seller_intents: [
        'Quero explicar como concluir o plano com o valor já discutido.',
        'Quero confirmar se ficou alguma dúvida sobre o plano antes de concluir.',
      ],
    }),
  ])

  const result = await composeSellerFacingGuidance({
    mode: 'commercial',
    workingSummary:
      'Cliente conhece o plano. O valor já foi discutido. Cliente perguntou como concluir.',
    currentInteraction: [],
    method,
    provider,
  })

  assert.equal(result.status, 'ready')
  assert.equal(result.stage_name, 'Conclusão')
  assert.match(result.next_step, /plano/i)
  assert.match(result.next_step, /valor/i)
})

test('D — intenção explícita de apenas agradecer vence orientação mais ativa', async () => {
  const provider = providerSequence([
    JSON.stringify({
      message:
        'Obrigado pela mensagem! Fico à disposição se precisar de algo.',
    }),
  ])

  const result = await composeSellerMessage({
    workingSummary:
      'Cliente enviou os documentos solicitados. A orientação anterior era confirmar os documentos.',
    currentInteraction: [
      {
        direction: 'incoming',
        occurred_at: null,
        text: 'Enviei os documentos.',
      },
    ],
    sellerIntent:
      'Quero apenas agradecer e dizer que fico à disposição.',
    method,
    guidance: {
      status: 'ready',
      method_name: method.name,
      stage_name: 'Descoberta',
      next_step: 'Confirme os documentos recebidos.',
    },
    provider,
  })

  assert.equal(result.status, 'ready')
  assert.match(result.message, /obrigado/i)
  assert.doesNotMatch(result.message, /document/i)
  assert.equal(provider.calls.length, 1)
})

test('E — contexto rico rejeita mensagem intercambiável e retenta com o fato específico', async () => {
  const gympassProvider = providerSequence([
    JSON.stringify({
      message: 'Qualquer dúvida, fico à disposição.',
    }),
    JSON.stringify({
      message:
        'Sobre o check-in pelo app, posso te orientar somente com o que estiver confirmado aqui. Se precisar, pode me chamar.',
    }),
  ])

  const gympass = await composeSellerMessage({
    workingSummary:
      'Cliente usa Gympass pelo Wellhub e perguntou sobre o check-in no aplicativo.',
    currentInteraction: [],
    sellerIntent:
      'Quero responder à dúvida operacional que ele trouxe.',
    method,
    guidance: null,
    provider: gympassProvider,
  })

  const contractProvider = providerSequence([
    JSON.stringify({
      message: 'Qualquer dúvida, fico à disposição.',
    }),
    JSON.stringify({
      message:
        'Vou verificar a situação do contrato com base no CPF solicitado e retorno com o que estiver confirmado.',
    }),
  ])

  const contract = await composeSellerMessage({
    workingSummary:
      'Cliente perguntou a situação do contrato e o CPF foi solicitado para consulta.',
    currentInteraction: [],
    sellerIntent:
      'Quero responder à dúvida do contrato sem falar de pagamento.',
    method,
    guidance: null,
    provider: contractProvider,
  })

  assert.equal(gympass.status, 'ready')
  assert.equal(contract.status, 'ready')
  assert.equal(gympassProvider.calls.length, 2)
  assert.equal(contractProvider.calls.length, 2)
  assert.match(gympass.message, /check-in|app/i)
  assert.match(contract.message, /contrato|CPF/i)
  assert.notEqual(gympass.message, contract.message)
})

test('grounding não numérico rejeita matrícula inventada e retenta sem o fato', async () => {
  const provider = providerSequence([
    JSON.stringify({
      message:
        'Para concluir sua matrícula, faça o check-in pelo app quando chegar.',
    }),
    JSON.stringify({
      message:
        'Sobre o check-in pelo app, vou me limitar ao que está confirmado no seu atendimento.',
    }),
  ])

  const result = await composeSellerMessage({
    workingSummary:
      'Cliente usa Gympass pelo Wellhub e perguntou se basta fazer check-in pelo aplicativo quando chegar.',
    currentInteraction: [],
    sellerIntent:
      'Quero responder à dúvida sobre o check-in sem inventar informação.',
    method,
    guidance: null,
    provider,
  })

  assert.equal(result.status, 'ready')
  assert.doesNotMatch(result.message, /matr[ií]cula/i)
  assert.equal(provider.calls.length, 2)
  assert.match(
    provider.calls[1].system_prompt,
    /matr[ií]cula/i,
  )
})

test('segunda saída ainda genérica falha fechado', async () => {
  const provider = providerSequence([
    JSON.stringify({
      message: 'Qualquer dúvida, fico à disposição.',
    }),
    JSON.stringify({
      message: 'Pode me chamar se precisar.',
    }),
  ])

  const result = await composeSellerMessage({
    workingSummary:
      'Cliente perguntou a situação do contrato e o CPF foi solicitado para consulta.',
    currentInteraction: [],
    sellerIntent:
      'Quero responder à dúvida atual.',
    method,
    guidance: null,
    provider,
  })

  assert.equal(result.status, 'error')
  assert.equal(result.message, null)
  assert.equal(provider.calls.length, 2)
})
