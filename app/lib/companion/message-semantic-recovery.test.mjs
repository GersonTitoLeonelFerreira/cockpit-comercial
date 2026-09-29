// Recuperação semântica da MENSAGEM: estratégia correta + critic correto
// nunca podem terminar num dead-end só porque o redator (LLM) insiste em
// errar. O critic NÃO é relaxado: a copy recuperada passa pelo mesmo
// critic, pela mesma validação e pelo mesmo gate customer-facing.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  composeSellerMessage,
  SELLER_FACING_UNAVAILABLE_MESSAGE,
  SELLER_FACING_UNSAFE_MESSAGE,
} from './lead-seller-message.ts'

import {
  composeStrategyGroundedMessage,
  customerRequestTopic,
  evaluateCommercialMessageDraft,
} from './commercial-message-strategy.ts'

const method = {
  name: 'Método comercial',
  description: null,
  stages: [],
  business_context: null,
  seller_rules: [],
}

// Estratégia canônica de reativação (mesmo formato de
// buildCommercialMessageStrategy): intenção antiga não confirmada, pergunta
// de agenda e oferta já enviadas sem resposta.
function reactivationStrategy({
  reference = 'Podemos fazer a aula experimental hoje?',
  anchors = ['podemos', 'fazer', 'aula', 'experimental', 'hoje'],
  technique = 'technique.state_change_reactivation',
  requiredAction = 'reengagement',
  outboundAllowed = true,
} = {}) {
  return {
    contract_version: 'commercial-message-strategy-v1',
    outbound_allowed: outboundAllowed,
    objective: outboundAllowed
      ? 'Reativar a conversa descobrindo o estado atual do interesse antes de voltar ao passo antigo.'
      : null,
    relationship_bridge:
      'Retomar a intenção já demonstrada pelo cliente antes de introduzir uma etapa comercial diferente.',
    context_reference: reference
      ? {
          text: reference,
          evidence_message_id: 'm-request',
          required_in_draft: true,
          anchors,
        }
      : null,
    technique_id: technique,
    technique_title: 'Reativação por mudança de estado',
    desired_microcommitment:
      'Obter uma resposta curta que revele o estado atual do interesse (continua, mudou, adiou ou resolveu), sem exigir decisão agora.',
    facts_allowed: [],
    facts_required_but_missing: [],
    prohibited_moves: [
      'Não voltar diretamente para dia e horário.',
      'Não repetir a oferta enviada.',
      'Não tratar a intenção antiga como confirmada nem pedir data, horário, pagamento ou decisão antes de reconfirmar o interesse atual.',
      'Não inventar entusiasmo, urgência, escassez, perda, relacionamento ou necessidade que o cliente não demonstrou.',
    ],
    blocked_action_types: [
      'scheduling_open_question',
      'scheduling_guided_choice',
      'price_presentation',
      'product_presentation',
      'close_request',
      'commitment_request',
    ],
    required_action_type: outboundAllowed ? requiredAction : null,
    tone: 'Humana e direta',
    max_length: 420,
    temporal_frame: {
      evaluated_at: '2026-09-29T15:00:00.000Z',
      momentum: 'stalled',
      reactivation_mode: 'reactivate',
      requalify_before_continuing: true,
      elapsed_since_last_customer_message: '4 dias',
      elapsed_since_customer_intent: '19 dias',
      customer_waiting_for_seller_for: null,
      intent_time_window_expired: true,
      unanswered_seller_attempts: 2,
      enthusiasm_evidenced: false,
      guidance: [],
    },
    reactivation_tactics: [],
    evidence_message_ids: ['m-request'],
    memory_ids: [],
  }
}

const lorenaReasoning = {
  status: 'ready',
  decision: 'reactivate',
  decision_reason:
    'Interesse histórico real, oportunidade sem continuidade e interesse atual não confirmado.',
  current_situation:
    'Interesse histórico em aula experimental; a oportunidade perdeu continuidade e o interesse atual não foi confirmado.',
  objective_now:
    'Reativar/requalificar o estado atual antes de voltar ao passo antigo.',
  do_not_do: [
    'Não voltar diretamente para dia/horário.',
    'Não presumir interesse atual.',
    'Não repetir a oferta.',
    'Não repetir ação recente sem fato novo.',
  ],
  selected_techniques: [
    {
      intelligence_id: 'technique.state_change_reactivation',
      title: 'Reativação por mudança de estado',
      kind: 'technique',
      scope: 'general',
      why_applicable: 'O interesse existiu, mas a conversa perdeu continuidade.',
      risks: [],
    },
  ],
  company_knowledge_used: [],
  limitations: [],
}

const lorenaInteraction = [
  {
    direction: 'outgoing',
    occurred_at: '2026-09-10T16:28:00.000Z',
    text: 'Qual dia e horário fica melhor para você?',
  },
  {
    direction: 'outgoing',
    occurred_at: '2026-09-25T13:00:00.000Z',
    text: 'PROMOÇÃO DE SETEMBRO! Plano mensal R$ 129,90. Faça sua matrícula e aproveite!',
  },
]

const ADVERSARIAL_DRAFTS = [
  // Repete a ação antiga sem resposta / trata a intenção como atual.
  'Oi, Lorena! Qual dia e horário fica melhor para sua aula experimental?',
  // Presume o interesse atual.
  'Oi, Lorena! Vi que você ainda quer fazer a aula experimental, qual horário fica melhor?',
  // Oferta/pressão em vez de reativar.
  'Oi, Lorena! Temos uma promoção especial de matrícula só hoje, quer aproveitar a aula experimental?',
]

// Redator que INSISTE em errar: toda geração devolve um rascunho inválido.
// O reviewer é configurável (padrão: aprova a copy sem alterar).
function adversarialProvider({
  drafts = ADVERSARIAL_DRAFTS,
  review = candidate => ({ message: candidate, changed: false, issue_code: 'none' }),
} = {}) {
  const calls = []
  let generation = 0

  const provider = async request => {
    calls.push(request)

    if (request.prompt_version.includes('review')) {
      const candidate = JSON.parse(request.user_prompt).candidate_message
      const output = review(candidate)

      if (output instanceof Error) {
        throw output
      }

      return { content: JSON.stringify(output), provider: 'test' }
    }

    const draft = drafts[Math.min(generation, drafts.length - 1)]
    generation += 1

    return { content: JSON.stringify({ message: draft }), provider: 'test' }
  }

  return { provider, calls }
}

function generationCalls(calls) {
  return calls.filter(call => !call.prompt_version.includes('review'))
}

function reviewCalls(calls) {
  return calls.filter(call => call.prompt_version.includes('review'))
}

function lorenaRequest(overrides = {}) {
  return {
    workingSummary:
      'Lorena pediu para fazer uma aula experimental. A pergunta de dia e horário ficou sem resposta e depois foi enviada uma oferta de planos, também sem resposta.',
    currentInteraction: lorenaInteraction,
    sellerIntent: 'Quero responder ao ponto principal desta conversa.',
    recipientName: 'Lorena Galvão',
    method,
    reasoning: lorenaReasoning,
    messageStrategy: reactivationStrategy(),
    ...overrides,
  }
}

test('ADVERSARIAL: redator insiste em 3 rascunhos inválidos → Yolen entrega copy segura da estratégia (status ready)', async () => {
  const strategy = reactivationStrategy()
  const { provider, calls } = adversarialProvider()

  const result = await composeSellerMessage({
    ...lorenaRequest({ messageStrategy: strategy }),
    provider,
  })

  assert.equal(result.status, 'ready', JSON.stringify(result))
  assert.equal(result.error, null)
  assert.equal(result.diagnostics.source, 'strategy_grounded')

  // As 3 violações reais continuam registradas (critic intacto).
  const failures = result.diagnostics.failures.join(' ')
  assert.match(failures, /repete uma ação recente|intenção antiga/)
  assert.match(failures, /técnica comercial escolhida/)

  const message = result.message

  // O MESMO critic aprova a copy entregue, sem nenhuma violação.
  assert.deepEqual(
    evaluateCommercialMessageDraft({
      message,
      strategy,
      recent_outgoing_messages: lorenaInteraction.map(entry => entry.text),
    }).violations,
    [],
  )

  // Estratégia executada: relembra o pedido real, pergunta o estado atual.
  assert.match(message, /^Oi, Lorena!/)
  assert.match(message, /aula experimental/)
  assert.equal((message.match(/\?/g) ?? []).length, 1, 'uma única pergunta')
  assert.match(message, /chegou a|faz sentido|mudou/)

  // Nada do que a estratégia proíbe.
  assert.doesNotMatch(message, /\b(dia|horário|horario|hoje|amanhã|semana)\b/i, 'sem dia/horário')
  assert.doesNotMatch(message, /R\$|preço|preco|valor|promo|matrícula|plano/i, 'sem preço/oferta')
  assert.doesNotMatch(message, /ainda quer|você quer|vc quer/i, 'não presume interesse atual')
  assert.doesNotMatch(message, /últimas vagas|só hoje|corre|não perca/i, 'sem urgência inventada')
  assert.doesNotMatch(message, /disposição|qualquer dúvida|aguardo/i, 'sem filler')
  assert.doesNotMatch(message, /Galvão/, 'só o primeiro nome')

  // Limite determinístico: 3 gerações + 1 revisão (sem loop).
  assert.equal(generationCalls(calls).length, 3)
  assert.equal(reviewCalls(calls).length, 1)
})

test('ADVERSARIAL: a copy recuperada passa pelo gate customer-facing — nunca é liberada sem revisão', async () => {
  const { provider, calls } = adversarialProvider()

  await composeSellerMessage({ ...lorenaRequest(), provider })

  const reviewed = reviewCalls(calls)
  assert.equal(reviewed.length, 1)
  assert.match(JSON.parse(reviewed[0].user_prompt).candidate_message, /aula experimental/)
})

test('ADVERSARIAL: reviewer também insiste em reescrita inválida → erro seller-facing, sem diagnóstico técnico e sem loop', async () => {
  const { provider, calls } = adversarialProvider({
    review: () => ({
      message: 'Oi, Lorena! Qual dia e horário fica melhor para você?',
      changed: true,
      issue_code: 'canonical_contradiction',
    }),
  })

  const result = await composeSellerMessage({ ...lorenaRequest(), provider })

  assert.equal(result.status, 'error')
  assert.equal(result.message, null)
  assert.equal(result.error, SELLER_FACING_UNSAFE_MESSAGE)
  assert.doesNotMatch(
    result.error,
    /repeats_recent_seller_action|assumes_current_intent|technique_mismatch|critic|técnica comercial/,
  )
  assert.match(result.diagnostics.failures.join(' '), /critic da estratégia comercial/)
  assert.equal(generationCalls(calls).length, 3)
  assert.equal(reviewCalls(calls).length, 1)
})

test('ADVERSARIAL: rascunho válido, reviewer reescreve mal e o reparo pós-review insiste no erro → copy da estratégia, revisada', async () => {
  const valid =
    'Oi, Lorena! Sobre a aula experimental que você tinha pedido: de lá pra cá, isso mudou ou ainda faz sentido retomarmos?'
  let reviews = 0

  const { provider, calls } = adversarialProvider({
    drafts: [valid, ADVERSARIAL_DRAFTS[0]],
    review: candidate => {
      reviews += 1

      return reviews === 1
        ? { message: 'Oi, Lorena! Qual dia e horário fica melhor para você?', changed: true, issue_code: 'canonical_contradiction' }
        : { message: candidate, changed: false, issue_code: 'none' }
    },
  })

  const result = await composeSellerMessage({ ...lorenaRequest(), provider })

  assert.equal(result.status, 'ready', JSON.stringify(result))
  assert.equal(result.diagnostics.source, 'strategy_grounded')
  assert.match(result.message, /Quando a gente conversou/)
  // 1ª geração + revisão + reparo pós-review + revisão da copy recuperada.
  assert.equal(generationCalls(calls).length, 2)
  assert.equal(reviewCalls(calls).length, 2)
})

test('limite determinístico: mesmo no pior caminho não passam de 7 chamadas ao provider', async () => {
  let generation = 0
  const calls = []

  const provider = async request => {
    calls.push(request)

    if (request.prompt_version.includes('review')) {
      // Toda revisão reescreve para algo inválido.
      return {
        content: JSON.stringify({ message: 'Qual dia e horário fica melhor para você?', changed: true, issue_code: 'context_conflict' }),
        provider: 'test',
      }
    }

    generation += 1

    // A 1ª e a 3ª gerações são válidas; as demais, inválidas.
    return {
      content: JSON.stringify({
        message:
          generation % 2 === 1
            ? 'Oi, Lorena! Sobre a aula experimental: de lá pra cá, algo mudou ou ainda faz sentido retomarmos?'
            : ADVERSARIAL_DRAFTS[1],
      }),
      provider: 'test',
    }
  }

  const result = await composeSellerMessage({ ...lorenaRequest(), provider })

  assert.equal(result.status, 'error')
  assert.equal(result.error, SELLER_FACING_UNSAFE_MESSAGE)
  assert.ok(calls.length <= 7, `${calls.length} chamadas`)
})

test('opt-out real continua sem mensagem: nenhuma chamada ao redator e nenhum fallback', async () => {
  const { provider, calls } = adversarialProvider()

  const result = await composeSellerMessage({
    ...lorenaRequest({ messageStrategy: reactivationStrategy({ outboundAllowed: false }) }),
    provider,
  })

  assert.equal(result.status, 'no_message')
  assert.equal(result.message, null)
  assert.equal(calls.length, 0)
  assert.equal(composeStrategyGroundedMessage({ strategy: reactivationStrategy({ outboundAllowed: false }) }), null)
})

test('sem ação canônica segura (escolha guiada sem opções reais) o erro é correto — nunca uma copy inventada', async () => {
  const strategy = {
    ...reactivationStrategy({ requiredAction: 'scheduling_guided_choice', technique: 'technique.guided_choice' }),
    facts_required_but_missing: ['multiple_valid_options'],
    blocked_action_types: [],
    temporal_frame: null,
  }
  const { provider } = adversarialProvider({
    drafts: ['Oi, Lorena! Prefere terça às 10h ou quinta às 15h?'],
  })

  const result = await composeSellerMessage({ ...lorenaRequest({ messageStrategy: strategy }), provider })

  assert.equal(result.status, 'error')
  assert.equal(result.error, SELLER_FACING_UNSAFE_MESSAGE)
  assert.equal(composeStrategyGroundedMessage({ strategy }), null)
})

test('sem fala concreta do cliente para ancorar a retomada não há fallback (copy seria genérica)', async () => {
  const strategy = reactivationStrategy({ reference: null })
  const { provider } = adversarialProvider()

  const result = await composeSellerMessage({ ...lorenaRequest({ messageStrategy: strategy }), provider })

  assert.equal(result.status, 'error')
  assert.equal(result.error, SELLER_FACING_UNSAFE_MESSAGE)
  assert.equal(composeStrategyGroundedMessage({ strategy }), null)
  assert.equal(composeStrategyGroundedMessage({ strategy: reactivationStrategy({ reference: 'Ok, obrigado.', anchors: ['obrigado'] }) }), null)
})

test('falha transitória do redator e do gate vira frase seller-facing de indisponibilidade', async () => {
  const calls = []
  const provider = async request => {
    calls.push(request)

    if (request.prompt_version.includes('review')) {
      throw new Error('timeout')
    }

    return { content: JSON.stringify({ message: ADVERSARIAL_DRAFTS[0] }), provider: 'test' }
  }

  const result = await composeSellerMessage({ ...lorenaRequest(), provider })

  assert.equal(result.status, 'error')
  assert.equal(result.error, SELLER_FACING_UNAVAILABLE_MESSAGE)
  assert.equal(result.diagnostics.stage, 'customer_facing_review')
})

test('assunto do pedido é citado sem o horizonte antigo e sem a formulação da pergunta, em qualquer setor', () => {
  const cases = [
    ['Podemos fazer a aula experimental hoje?', 'fazer a aula experimental'],
    ['Consigo agendar uma demonstração do sistema essa semana?', 'agendar uma demonstração do sistema'],
    ['Posso visitar o apartamento de dois quartos no sábado às 10h?', 'visitar o apartamento de dois quartos'],
    ['Queria marcar uma avaliação amanhã de manhã.', 'marcar uma avaliação'],
    ['Vocês podem me mandar uma proposta para 30 usuários?', 'receber uma proposta para 30 usuários'],
    ['Oi, tudo bem? Quero agendar uma avaliação para minha filha.', 'agendar uma avaliação para sua filha'],
    ['Quanto custa o plano de internet de 500 mega?', 'o plano de internet de 500 mega'],
    // A voz do cliente vira a do vendedor: "nosso condomínio" → "seu condomínio".
    ['Vocês podem me mandar uma proposta para a manutenção predial do nosso condomínio?', 'receber uma proposta para a manutenção predial do seu condomínio'],
    ['Queria orçar a reforma da nossa loja.', 'orçar a reforma da sua loja'],
    // Pedido em segunda pessoa: o assunto é o que o cliente queria entender
    // ou receber, nunca "me explicar"/"me mandar".
    ['Você pode me explicar como funciona o plano anual?', 'entender como funciona o plano anual'],
    ['Vocês poderiam me detalhar melhor o contrato de manutenção?', 'entender o contrato de manutenção'],
    ['Me explica como funciona a garantia estendida?', 'entender como funciona a garantia estendida'],
    ['Pode me mandar o catálogo de cursos?', 'receber o catálogo de cursos'],
    // Abreviação não quebra a frase: o nome continua no assunto citado.
    ['Gostaria de fazer uma avaliação com a Dra. Ana na sexta.', 'fazer uma avaliação com a Dra. Ana'],
    ['Oi! Quero agendar a visita com o Sr. Paulo amanhã.', 'agendar a visita com o Sr. Paulo'],
  ]

  for (const [text, topic] of cases) {
    assert.equal(customerRequestTopic(text), topic, text)
  }

  // Sem assunto concreto: nunca inventa.
  for (const text of ['Que horas vocês abrem?', 'Ok', 'Obrigado!']) {
    assert.equal(customerRequestTopic(text), null, text)
  }
})

test('técnica escolhida muda a condução da pergunta de retomada, sempre com um único microcompromisso', () => {
  for (const technique of [
    'technique.state_change_reactivation',
    'technique.permission_based_reengagement',
    'technique.pattern_interrupt_reengagement',
    'technique.contextual_reengagement',
  ]) {
    const strategy = reactivationStrategy({ technique })
    const composed = composeStrategyGroundedMessage({ strategy, recipient_name: 'Lorena Galvão' })

    assert.ok(composed, technique)
    assert.equal((composed.message.match(/\?/g) ?? []).length, 1, technique)
    assert.deepEqual(
      evaluateCommercialMessageDraft({
        message: composed.message,
        strategy,
        recent_outgoing_messages: lorenaInteraction.map(entry => entry.text),
      }).violations,
      [],
      `${technique}: ${composed.message}`,
    )
  }
})

test('pedido em segunda pessoa ("você pode me explicar…") não termina em erro: a copy da estratégia cita o que o cliente queria entender', async () => {
  const strategy = reactivationStrategy({
    reference: 'Você pode me explicar como funciona o plano anual?',
    anchors: ['explicar', 'funciona', 'plano', 'anual'],
  })
  const { provider } = adversarialProvider()

  const result = await composeSellerMessage({
    ...lorenaRequest({ messageStrategy: strategy }),
    provider,
  })

  assert.equal(result.status, 'ready', JSON.stringify(result.diagnostics))
  assert.equal(result.diagnostics.source, 'strategy_grounded')
  assert.match(result.message, /você tinha comentado sobre entender como funciona o plano anual\./)
  assert.doesNotMatch(result.message, /\bme explicar\b/)
})

test('abreviação no pedido ("Dra. Ana") chega inteira à copy da estratégia', () => {
  const strategy = reactivationStrategy({
    reference: 'Gostaria de fazer uma avaliação com a Dra. Ana na sexta.',
    anchors: ['fazer', 'avaliacao', 'ana'],
  })
  const composed = composeStrategyGroundedMessage({ strategy, recipient_name: 'Paula Lima' })

  assert.ok(composed)
  assert.match(composed.message, /você tinha comentado sobre fazer uma avaliação com a Dra\. Ana\. /)
  assert.doesNotMatch(composed.message, /sexta/)
})
