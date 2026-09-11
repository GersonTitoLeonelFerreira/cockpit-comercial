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
  version_number: 4,
  source_contract_version: 'commercial-method-v2',
  name: 'Metodo AVANÇAR',
  description: 'Método comercial de teste',
  structure_source: 'published_definition',
  principles: [],
  stages: [],
  business_context: {
    business_description: 'Empresa de serviços',
    target_audience: 'Clientes da empresa',
    value_proposition: 'Atendimento consultivo',
  },
  seller_rules: {
    communication_tone: 'Humana e direta',
    required_behaviors: [],
    prohibited_behaviors: [
      'Não inventar condições comerciais',
    ],
  },
}

// FASE 16.9 — a mensagem não recebe mais uma orientação própria
// (SellerMessageGuidance) descolada da verdade comercial. Estes
// fixtures representam o mesmo CommercialReasoning canônico que
// AGORA/ANÁLISE/CLIENTE já consomem via loadCanonicalSellerReasoning.
function buildReasoning({
  status = 'ready',
  current_situation = 'A cliente ainda não detalhou a necessidade.',
  objective_now = 'Aprofundar a necessidade antes de apresentar proposta.',
  do_not_do = [],
  selected_techniques = [],
  company_knowledge_used = [],
} = {}) {
  return {
    status,
    decision: status === 'silent' ? 'no_intervention' : 'clarify',
    decision_reason: objective_now,
    current_situation,
    objective_now,
    do_not_do,
    selected_techniques,
    company_knowledge_used,
    limitations: [],
  }
}

function buildRoles(roles = []) {
  return roles
}

function createProvider(
  outputs,
  calls = [],
) {
  let index = 0

  return async (request) => {
    calls.push(request)

    const output = outputs[index]
    index += 1

    if (output === undefined) {
      throw new Error(
        'provider_sem_saida',
      )
    }

    return {
      content:
        typeof output === 'string'
          ? output
          : JSON.stringify(output),
      provider: 'test',
      model: 'test-model',
      request_id: `request-${index}`,
      usage: null,
    }
  }
}

function reviewedSame(message) {
  return {
    message,
    changed: false,
    issue_code: 'none',
  }
}

test('não gera mensagem sem intenção explícita do vendedor', async () => {
  let called = false

  const result = await composeSellerMessage({
    workingSummary:
      'Cliente está avaliando a solução.',
    sellerIntent: '',
    method,
    provider: async () => {
      called = true
      return {
        content: '{}',
        provider: 'test',
      }
    },
  })

  assert.equal(result.status, 'error')
  assert.equal(called, false)
})

test('mensagem recebe intenção do vendedor, resumo e Commercial Reasoning sem transformar recomendação em bloqueio', async () => {
  const calls = []
  const message =
    'Hoje, em qual parte do follow-up vocês mais sentem que as oportunidades acabam se perdendo?'

  const result = await composeSellerMessage({
    workingSummary:
      'A cliente explicou que perde oportunidades por falta de follow-up e ainda não recebeu proposta.',
    sellerIntent:
      'Quero perguntar qual parte do follow-up mais atrapalha a equipe hoje.',
    method,
    reasoning: buildReasoning({
      objective_now:
        'Aprofundar a necessidade antes de apresentar proposta.',
    }),
    provider: createProvider(
      [
        { message },
        reviewedSame(message),
      ],
      calls,
    ),
  })

  assert.equal(result.status, 'ready')
  assert.match(result.message, /follow-up/i)

  const generationPrompt =
    JSON.parse(calls[0].user_prompt)

  assert.match(
    generationPrompt.seller_intent,
    /perguntar/i,
  )
  assert.match(
    generationPrompt.working_summary,
    /perde oportunidades/i,
  )
  assert.equal(
    generationPrompt.commercial_reasoning.objective_now,
    'Aprofundar a necessidade antes de apresentar proposta.',
  )
  assert.match(
    calls[0].system_prompt,
    /intenção do vendedor é a ação principal/i,
  )
  assert.match(
    calls[0].system_prompt,
    /DIRIGIDA AO CLIENTE/,
  )
  assert.equal(calls.length, 2)
})

test('sem orientação comercial ativa ainda permite resposta pedida pelo vendedor sem forçar venda', async () => {
  const calls = []
  const message =
    'Kkkk eu também achei isso 😂'

  const result = await composeSellerMessage({
    workingSummary:
      'A conversa atual é pessoal e não existe ação comercial neste momento.',
    sellerIntent:
      'Quero responder de forma natural ao assunto atual.',
    method,
    reasoning: buildReasoning({
      status: 'silent',
      objective_now:
        'Preservar o contexto sem forçar avanço comercial.',
      do_not_do: [
        'Não forçar ação comercial enquanto a relevância da sessão não estiver confirmada.',
      ],
    }),
    provider: createProvider(
      [
        { message },
        reviewedSame(message),
      ],
      calls,
    ),
  })

  assert.equal(result.status, 'ready')
  const generationPrompt =
    JSON.parse(calls[0].user_prompt)

  assert.equal(
    generationPrompt.commercial_reasoning.status,
    'silent',
  )
  assert.match(
    calls[0].system_prompt,
    /não transforme automaticamente/i,
  )
})

test('interação canônica atual entra como contexto factual da mensagem', async () => {
  const calls = []
  const message =
    'Perfeito, então combinamos amanhã às 15h.'

  const result = await composeSellerMessage({
    workingSummary:
      'A cliente demonstrou interesse em continuar a conversa.',
    currentInteraction: [
      {
        direction: 'incoming',
        occurred_at:
          '2026-08-25T14:00:00.000Z',
        text:
          'Amanhã às 15h funciona para mim.',
      },
    ],
    sellerIntent:
      'Quero confirmar o horário que a cliente acabou de informar.',
    method,
    provider: createProvider(
      [
        { message },
        reviewedSame(message),
      ],
      calls,
    ),
  })

  assert.equal(result.status, 'ready')
  assert.match(result.message, /15h/)

  const generationPrompt =
    JSON.parse(calls[0].user_prompt)

  assert.equal(
    generationPrompt
      .current_interaction[0].text,
    'Amanhã às 15h funciona para mim.',
  )
})

test('horário equivalente 09:00 no contexto pode ser escrito como 9h na mensagem', async () => {
  const message =
    'Se tiver alguma dúvida sobre a aula de amanhã às 9h, pode me chamar por aqui.'

  const result = await composeSellerMessage({
    workingSummary:
      'A cliente pediu informações sobre a aula de emagrecimento e recebeu o horário.',
    currentInteraction: [
      {
        direction: 'incoming',
        occurred_at:
          '2026-08-28T22:41:00.000Z',
        text:
          'Oi boa noite, q horas é aula amanhã de emagrecimento?',
      },
      {
        direction: 'outgoing',
        occurred_at:
          '2026-08-28T22:56:00.000Z',
        text:
          '09:00 da manhã',
      },
    ],
    sellerIntent:
      'Quero responder ao ponto principal desta conversa.',
    method,
    provider: createProvider([
      { message },
      reviewedSame(message),
    ]),
  })

  assert.equal(result.status, 'ready')
  assert.match(result.message, /9h/)
})

test('horário realmente diferente continua bloqueado pelo gate', async () => {
  const message =
    'Se tiver alguma dúvida sobre a aula de amanhã às 10h, pode me chamar por aqui.'

  const result = await composeSellerMessage({
    workingSummary:
      'A cliente pediu informações sobre a aula de emagrecimento e recebeu o horário.',
    currentInteraction: [
      {
        direction: 'outgoing',
        occurred_at:
          '2026-08-28T22:56:00.000Z',
        text:
          '09:00 da manhã',
      },
    ],
    sellerIntent:
      'Quero responder ao ponto principal desta conversa.',
    method,
    provider: createProvider([
      { message },
      { message },
    ]),
  })

  assert.equal(result.status, 'error')
  assert.match(
    result.error,
    /horário sem base/i,
  )
})

test('intenção do vendedor pode contrariar a orientação sem ser bloqueada', async () => {
  const calls = []
  const message =
    'Podemos marcar uma ligação amanhã para conversarmos?'

  const result = await composeSellerMessage({
    workingSummary:
      'A cliente ainda não detalhou a necessidade e aceitou continuar o contato.',
    sellerIntent:
      'Quero marcar uma ligação amanhã.',
    method,
    reasoning: buildReasoning({
      objective_now:
        'Descobrir a necessidade antes de apresentar proposta.',
    }),
    provider: createProvider(
      [
        { message },
        reviewedSame(message),
      ],
      calls,
    ),
  })

  assert.equal(result.status, 'ready')
  assert.match(
    result.message,
    /ligação amanhã/i,
  )
  assert.match(
    calls[0].system_prompt,
    /intenção do vendedor é a ação principal/i,
  )
})

test('rejeita valor numérico inventado fora do resumo, interação e intenção', async () => {
  const message =
    'Claro! O investimento é de R$ 499,00 e vou explicar os detalhes.'

  const result = await composeSellerMessage({
    workingSummary:
      'A cliente pediu mais informações sobre a solução.',
    sellerIntent:
      'Quero responder que vou explicar os detalhes.',
    method,
    provider: createProvider([
      { message },
      reviewedSame(message),
    ]),
  })

  assert.equal(result.status, 'error')
  assert.equal(result.message, null)
  assert.match(
    result.error,
    /sem base no contexto/i,
  )
})

test('seller intent de fazer pergunta vira pergunta customer-facing, nunca resposta ao vendedor', async () => {
  const calls = []

  const result = await composeSellerMessage({
    workingSummary:
      'A contratação foi aceita. A foto presencial ainda precisa ser realizada para concluir o acesso.',
    currentInteraction: [
      {
        direction: 'incoming',
        occurred_at:
          '2026-08-27T03:00:00.000Z',
        text: 'Tá feito',
      },
      {
        direction: 'outgoing',
        occurred_at:
          '2026-08-27T03:01:00.000Z',
        text:
          'Tudo certo! Agora só falta sua foto.',
      },
    ],
    sellerIntent:
      'Quero fazer uma pergunta para avançar com clareza.',
    method,
    reasoning: buildReasoning({
      objective_now:
        'Confirmar quando o cliente virá concluir a etapa presencial.',
    }),
    provider: createProvider(
      [
        {
          message:
            'Oi! Pode mandar sua pergunta para que eu possa ajudar e esclarecer tudo para você.',
        },
        {
          message:
            'Você pretende vir amanhã para fazermos sua foto e deixarmos seu acesso pronto?',
          changed: true,
          issue_code:
            'role_inversion',
        },
      ],
      calls,
    ),
  })

  assert.equal(result.status, 'ready')
  assert.equal(
    result.message,
    'Você pretende vir amanhã para fazermos sua foto e deixarmos seu acesso pronto?',
  )
  assert.equal(calls.length, 2)
  assert.match(
    calls[1].system_prompt,
    /role_inversion/,
  )
})

test('regra é multissetorial: aprovação jurídica também mantém vendedor como emissor e cliente como destinatário', async () => {
  const result = await composeSellerMessage({
    workingSummary:
      'A proposta comercial já foi aceita, mas a aprovação jurídica ainda está pendente.',
    currentInteraction: [],
    sellerIntent:
      'Quero confirmar se o jurídico já aprovou para avançarmos.',
    method,
    reasoning: buildReasoning({
      objective_now:
        'Confirmar a aprovação jurídica antes da assinatura.',
    }),
    provider: createProvider([
      {
        message:
          'Me diga qual pergunta você quer fazer sobre a aprovação jurídica.',
      },
      {
        message:
          'O jurídico já conseguiu concluir a aprovação ou ainda ficou algum ponto pendente?',
        changed: true,
        issue_code:
          'seller_intent_not_executed',
      },
    ]),
  })

  assert.equal(result.status, 'ready')
  assert.match(
    result.message,
    /^O jurídico já conseguiu/,
  )
  assert.doesNotMatch(
    result.message,
    /me diga qual pergunta/i,
  )
})

test('gate final continua bloqueando fato protegido inventado durante a revisão', async () => {
  const result = await composeSellerMessage({
    workingSummary:
      'Existe uma pendência antes do próximo passo.',
    currentInteraction: [],
    sellerIntent:
      'Quero confirmar o que ainda falta para avançar.',
    method,
    provider: createProvider([
      {
        message:
          'Posso confirmar se ficou alguma pendência antes de avançarmos?',
      },
      {
        message:
          'Posso confirmar se ficou alguma pendência? O valor final é R$ 999.',
        changed: true,
        issue_code:
          'context_conflict',
      },
    ]),
  })

  assert.equal(result.status, 'error')
  assert.equal(result.message, null)
  assert.match(
    result.error,
    /valor, percentual, data ou horário sem base/i,
  )
})

test('customer_knowledge_used canônico é aceito como fato legítimo, mesmo sem estar no resumo/interação', async () => {
  const message =
    'O pagamento é feito por cartão de crédito recorrente, conforme nossa política.'

  const result = await composeSellerMessage({
    workingSummary:
      'A cliente perguntou como funciona o pagamento.',
    sellerIntent:
      'Quero explicar como funciona o pagamento.',
    method,
    reasoning: buildReasoning({
      company_knowledge_used: [
        {
          title: 'Política de pagamento recorrente',
          why_relevant:
            'Pagamento é cobrado por cartão de crédito recorrente conforme política publicada.',
        },
      ],
    }),
    provider: createProvider([
      { message },
      reviewedSame(message),
    ]),
  })

  assert.equal(result.status, 'ready')
  assert.match(result.message, /cartão/i)
})

test('papel de terceiro é transmitido ao gerador e ao gate de revisão', async () => {
  const calls = []
  const message =
    'Perfeito! Me conta um pouco mais sobre a sua irmã para eu te ajudar a encaminhar a aula experimental dela.'

  const roles = buildRoles([
    {
      scope: 'current_contact',
      role: 'intermediary',
      label: 'Juliana',
      evidence_message_ids: ['m1'],
    },
    {
      scope: 'related',
      role: 'prospect',
      label: 'Mariana',
      evidence_message_ids: ['m1'],
    },
  ])

  const result = await composeSellerMessage({
    workingSummary:
      'Juliana informou que a irmã Mariana quer fazer uma aula experimental.',
    sellerIntent:
      'Quero ajudar a encaminhar a aula experimental da irmã dela.',
    method,
    reasoning: buildReasoning({
      current_situation:
        'Juliana relatou que a irmã Mariana quer contratar.',
      objective_now:
        'Entender a necessidade de Mariana através de Juliana.',
    }),
    roles,
    provider: createProvider(
      [
        { message },
        reviewedSame(message),
      ],
      calls,
    ),
  })

  assert.equal(result.status, 'ready')

  const generationPrompt =
    JSON.parse(calls[0].user_prompt)

  assert.ok(
    generationPrompt.customer_roles.some((entry) =>
      /intermediário/i.test(entry),
    ),
  )
  assert.ok(
    generationPrompt.customer_roles.some((entry) =>
      /prospect/i.test(entry),
    ),
  )
  assert.match(
    calls[0].system_prompt,
    /oportunidade de terceiro/i,
  )
  assert.match(
    calls[1].system_prompt,
    /oportunidade de terceiro/i,
  )

  const reviewPrompt =
    JSON.parse(calls[1].user_prompt)

  assert.ok(
    reviewPrompt.customer_roles.some((entry) =>
      /prospect/i.test(entry),
    ),
  )
})
