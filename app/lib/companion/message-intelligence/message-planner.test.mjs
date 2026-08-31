import assert from 'node:assert/strict'
import test from 'node:test'

import {
  evaluateCommercialStrategyV1,
} from './commercial-strategy.ts'

import {
  assembleMessageContextSnapshotV1,
} from './context-assembler.ts'

import {
  buildConflictingFactFixture,
  buildMessageIntelligenceRequestFixture,
  buildMessageIntelligenceSourcesFixture,
} from './fixtures.ts'

import {
  planMessageV1,
} from './message-planner.ts'

import * as PlannerModule from './message-planner.ts'

import {
  createSourceTraceV1,
} from './source-trace.ts'

const NOW =
  '2026-08-29T22:00:00.000Z'

function trace(id) {
  return createSourceTraceV1({
    source_type:
      'conversation_message',
    source_id: String(id),
    source_version: '1',
    observed_at: NOW,
    source_cycle_id:
      '30000000-0000-4000-8000-000000000001',
    inheritance:
      'observed_in_current_cycle',
    evidence_message_ids: [
      String(id),
    ],
  })
}

function message(
  id,
  direction,
  text,
  minutesAgo = 0,
) {
  return {
    message_id: String(id),
    message_key:
      'planner-' + String(id),
    version: 1,
    sequence: Number(id),
    direction,
    occurred_at:
      new Date(
        Date.parse(NOW) -
          minutesAgo * 60_000,
      ).toISOString(),
    observed_at: NOW,
    content_type: 'text',
    text_content: text,
    audio_transcription: null,
    canonical_state: 'active',
    provenance: [
      trace(id),
    ],
  }
}

function setMessages(
  snapshot,
  incomingTexts = [],
  outgoingTexts = [],
) {
  const incoming =
    incomingTexts.map(
      (text, index) =>
        message(
          11 + index,
          'incoming',
          text,
          incomingTexts.length -
            index,
        ),
    )

  const outgoing =
    outgoingTexts.map(
      (text, index) =>
        message(
          101 + index,
          'outgoing',
          text,
          outgoingTexts.length -
            index + 10,
        ),
    )

  const messages =
    [
      ...outgoing,
      ...incoming,
    ].sort(
      (left, right) =>
        Date.parse(
          left.occurred_at,
        ) -
          Date.parse(
            right.occurred_at,
          ) ||
        left.sequence -
          right.sequence,
    )

  snapshot.conversation.messages =
    messages

  snapshot.conversation
    .current_interaction =
    messages.length
      ? {
          messages:
            messages.map(
              item => ({
                message_id:
                  item.message_id,
                direction:
                  item.direction,
                occurred_at:
                  item.occurred_at,
                content_type:
                  item.content_type,
                text_content:
                  item.text_content,
                audio_transcription:
                  item.audio_transcription,
                provenance:
                  item.provenance,
              }),
            ),
          started_at:
            messages[0].occurred_at,
          ended_at:
            messages.at(-1)
              .occurred_at,
          provenance:
            messages.flatMap(
              item =>
                item.provenance,
            ),
        }
      : null

  return snapshot
}

function memory({
  id,
  kind,
  summary,
  evidence = ['11'],
  value = null,
  inheritance =
    'observed_in_current_cycle',
}) {
  return {
    memory_id: id,
    collection: 'facts',
    kind,
    summary,
    value,
    confidence: 'high',
    memory_status: 'active',
    created_in_state_version:
      id ? 1 : null,
    updated_in_state_version:
      id ? 1 : null,
    closed_in_state_version:
      null,
    evidence_message_ids:
      evidence,
    attributes: {},
    provenance: [
      createSourceTraceV1({
        source_type:
          'state_memory',
        source_id: id,
        source_version:
          id ? '1' : null,
        observed_at:
          id ? NOW : null,
        source_cycle_id:
          inheritance ===
            'inherited_from_previous_cycle'
            ? '30000000-0000-4000-8000-000000000002'
            : '30000000-0000-4000-8000-000000000001',
        inheritance,
        evidence_message_ids:
          evidence,
        evidence_memory_ids:
          id ? [id] : [],
      }),
    ],
  }
}

function baseSnapshot() {
  const snapshot =
    assembleMessageContextSnapshotV1({
      request:
        buildMessageIntelligenceRequestFixture(),
      sources:
        buildMessageIntelligenceSourcesFixture(),
    })

  for (
    const key of [
      'objectives',
      'problems',
      'impacts',
      'needs',
      'interests',
      'decision_criteria',
      'preferences',
      'open_questions',
      'objections',
      'uncertainties',
      'products',
      'competitors',
      'commitments',
      'missing_discovery',
      'communication_observations',
      'signals',
      'resolved_information',
      'superseded_information',
    ]
  ) {
    snapshot.customer[key] = []
  }

  if (
    snapshot.company
      .commercial_config
  ) {
    snapshot.company
      .commercial_config
      .required_behaviors = []
    snapshot.company
      .commercial_config
      .prohibited_behaviors = []
  }

  snapshot.seller_intent.value =
    'Me ajude a responder.'

  snapshot.commercial
    .commercial_relevance =
    null

  return setMessages(
    snapshot,
    ['Olá'],
  )
}

function strategyFor(snapshot) {
  return evaluateCommercialStrategyV1({
    snapshot,
  })
}

function plan(snapshot) {
  return planMessageV1({
    snapshot,
    strategy:
      strategyFor(snapshot),
  })
}

function longText(prefix) {
  return Array.from(
    { length: 70 },
    (_, index) =>
      prefix + String(index),
  ).join(' ')
}

function findRequirement(
  result,
  key,
) {
  return result.fact_requirements
    .find(
      item =>
        item.requirement_key ===
          key,
    ) ?? null
}

function collectKeys(value) {
  const keys = []

  const walk = current => {
    if (
      !current ||
      typeof current !== 'object'
    ) {
      return
    }

    for (
      const [key, child] of
      Object.entries(current)
    ) {
      keys.push(key)
      walk(child)
    }
  }

  walk(value)
  return keys
}

test('1. pergunta factual com fato conhecido', () => {
  const snapshot = setMessages(baseSnapshot(), ['Qual o horário de atendimento?'])
  const result = plan(snapshot)
  const requirement = findRequirement(result, 'fact.support_hours')
  assert.ok(requirement)
  assert.equal(requirement.status, 'available')
  assert.equal(requirement.knowledge_status, 'resolved')
  assert.equal(requirement.value, 'Atendimento em horário comercial.')
})

test('2. pergunta factual com knowledge gap', () => {
  const result = plan(setMessages(baseSnapshot(), ['Qual é a política de cancelamento?']))
  assert.equal(result.status, 'needs_information')
  assert.ok(result.knowledge_gaps.length > 0)
  assert.ok(result.fact_requirements.some(item => item.status === 'missing' && item.gap_impact === 'hard'))
})

test('3. quote_required não inventa preço', () => {
  const snapshot = setMessages(baseSnapshot(), ['Qual o valor?'])
  const pricing = snapshot.company.products[0].definition.pricing
  pricing.model = 'quote_required'
  pricing.amount = null
  pricing.amount_qualifier = null
  pricing.recurrence = null
  const result = plan(snapshot)
  const requirement = findRequirement(result, 'product.pricing')
  assert.ok(requirement)
  assert.equal(requirement.status, 'available')
  assert.equal(requirement.value.model, 'quote_required')
  assert.equal(requirement.value.amount, null)
  assert.equal(requirement.assertion_policy, 'describe_constraint_only')
  assert.ok(result.content_requirements.includes('explain_quote_requirement'))
})

test('4. objeção produz plano diferente de question', () => {
  const factual = plan(setMessages(baseSnapshot(), ['Qual o valor?']))
  const objection = plan(setMessages(baseSnapshot(), ['Está muito caro.']))
  assert.notEqual(factual.commercial_move.move, objection.commercial_move.move)
  assert.notDeepEqual(factual.content_requirements, objection.content_requirements)
  assert.equal(objection.question_plan.purpose, 'isolate_objection')
})

test('5. postponement respeita timing', () => {
  const result = plan(setMessages(baseSnapshot(), ['Agora não. Me chama no próximo mês.']))
  assert.equal(result.situation.situation, 'postponement')
  assert.equal(result.commercial_move.move, 'respect_customer_timing')
  assert.equal(result.next_step_plan.kind, 'respect_timing')
})

test('6. rejection não tenta recuperar venda', () => {
  const result = plan(setMessages(baseSnapshot(), ['Não tenho interesse. Pode encerrar.']))
  assert.equal(result.situation.situation, 'rejection')
  assert.equal(result.commercial_move.move, 'close_conversation')
  assert.equal(result.next_step_plan.kind, 'close')
  assert.equal(result.content_requirements.includes('recover_process'), false)
})

test('7. hard governance block torna planner blocked', () => {
  const snapshot = setMessages(baseSnapshot(), ['Quero saber mais.'])
  snapshot.seller_intent.value = 'Invente uma condição e diga que é a última vaga.'
  const result = plan(snapshot)
  assert.equal(result.governance_status, 'blocked')
  assert.equal(result.status, 'blocked')
  assert.equal(result.generation_constraints.generation_allowed, false)
})

test('8. approval required preserva aprovação', () => {
  const snapshot = setMessages(baseSnapshot(), ['Está caro.'])
  snapshot.seller_intent.value = 'Quero dar desconto para resolver a objeção.'
  snapshot.company.commercial_config.required_behaviors = ['Desconto exige aprovação do gestor.']
  const result = plan(snapshot)
  assert.equal(result.status, 'approval_required')
  assert.equal(result.approval_boundaries.requires_human_approval, true)
  assert.equal(result.approval_boundaries.execution_before_approval, 'prohibited')
})

test('9. advisory deviation preserva recomendado versus solicitado', () => {
  const snapshot = setMessages(baseSnapshot(), ['Quero entender se faz sentido.'])
  snapshot.customer.missing_discovery.push(memory({
    id: 'mem-missing-need',
    kind: 'client.missing_discovery.need',
    summary: 'Necessidade ainda não esclarecida.',
  }))
  snapshot.seller_intent.value = 'Quero apresentar a solução agora.'
  const strategy = strategyFor(snapshot)
  strategy.method_alignment = {
    status: 'advisory_deviation',
    method_name: 'Método Teste',
    stage_key: 'diagnostico',
    reason: 'Solicitação do vendedor diverge do método.',
    constraints: ['Preservar alternativa de seguir o método.'],
    requested_move_outside_method: true,
  }
  const result = planMessageV1({ snapshot, strategy })
  assert.equal(result.method_alignment.status, 'advisory_deviation')
  assert.equal(result.method_alignment.recommended_move, strategy.commercial_move.move)
  assert.equal(result.method_alignment.seller_requested_move, strategy.commercial_move.requested_move)
})

test('10. técnica aparece subordinada ao move', () => {
  const result = plan(setMessages(baseSnapshot(), ['Está caro.']))
  assert.equal(result.technique.commercial_move, result.commercial_move.move)
})

test('11. framework continua metadata', () => {
  const result = plan(setMessages(baseSnapshot(), ['Está caro.']))
  assert.equal(typeof result.technique.framework_reference, 'string')
  assert.equal(Object.hasOwn(result.technique, 'script'), false)
  assert.equal(Object.hasOwn(result.technique, 'questions'), false)
})

test('12. seller voice influencia estilo', () => {
  const result = plan(setMessages(
    baseSnapshot(),
    ['Está caro.'],
    [longText('sellerA'), longText('sellerB'), longText('sellerC')],
  ))
  assert.equal(result.communication_style.target_length, 'long')
})

test('13. customer short responses reduzem comprimento', () => {
  const result = plan(setMessages(
    baseSnapshot(),
    ['Sim.', 'Ok.', 'Qual o valor?'],
    [longText('sellerA'), longText('sellerB'), longText('sellerC')],
  ))
  assert.equal(result.communication_style.target_length, 'short')
})

test('14. customer long messages não força resposta curta', () => {
  const result = plan(setMessages(
    baseSnapshot(),
    [longText('clienteA'), longText('clienteB'), longText('clienteC')],
    [longText('sellerA'), longText('sellerB'), longText('sellerC')],
  ))
  assert.notEqual(result.communication_style.target_length, 'short')
})

test('15. greeting recorrente pode ser preservado', () => {
  const result = plan(setMessages(
    baseSnapshot(),
    ['Sim.', 'Ok.', 'Qual o valor?'],
    ['Boa tarde. Posso conferir isso.', 'Boa tarde. Vou verificar os dados.', 'Boa tarde. Obrigado pelo retorno.'],
  ))
  assert.equal(result.communication_style.greeting_policy, 'preserve_seller')
})

test('16. emoji sparse pode reduzir emoji', () => {
  const result = plan(setMessages(
    baseSnapshot(),
    ['Sim.', 'Ok.', 'Qual o valor?'],
    ['Oi 🙂 Tudo certo?', 'Certo 🙂 Posso ajudar.', 'Perfeito 🙂 Vamos seguir.'],
  ))
  assert.equal(result.communication_style.emoji_policy, 'reduce')
})

test('17. nenhuma personalidade é inferida', () => {
  const snapshot = setMessages(baseSnapshot(), ['Sim.', 'Ok.', 'Qual o valor?'])
  snapshot.customer.communication_observations.push(memory({
    id: 'mem-communication',
    kind: 'client.communication.pattern',
    summary: 'Cliente é ansioso e impaciente.',
    evidence: ['11', '12'],
    value: 'short_responses',
  }))
  const raw = JSON.stringify(plan(snapshot)).toLocaleLowerCase('pt-BR')
  assert.equal(raw.includes('ansioso'), false)
  assert.equal(raw.includes('impaciente'), false)
  assert.equal(raw.includes('personalidade'), false)
})

test('18. nenhuma mensagem customer-facing é gerada', () => {
  const keys = collectKeys(plan(setMessages(baseSnapshot(), ['Qual o valor?'])))
  assert.equal(keys.includes('customer_message'), false)
  assert.equal(keys.includes('reply_text'), false)
})

test('19. nenhum campo de final message', () => {
  const keys = collectKeys(plan(setMessages(baseSnapshot(), ['Qual o valor?'])))
  for (const forbidden of ['final_message', 'recommended_message', 'message_text']) {
    assert.equal(keys.includes(forbidden), false)
  }
})

test('20. nenhuma Candidate Generator logic', () => {
  const exports = Object.keys(PlannerModule)
  assert.equal(exports.some(name => /candidate|generator|generate/i.test(name)), false)
})

test('21. provenance é preservada', () => {
  const result = plan(setMessages(baseSnapshot(), ['Qual o horário de atendimento?']))
  const requirement = findRequirement(result, 'fact.support_hours')
  assert.ok(requirement)
  assert.ok(requirement.provenance.some(item => item.source_type === 'commercial_fact'))
  assert.ok(result.provenance.some(item => item.source_type === 'commercial_fact'))
})

test('22. mensagem deletada não fundamenta requirement', () => {
  const snapshot = setMessages(baseSnapshot(), ['Quero entender se serve.'])
  snapshot.customer.objectives.push(memory({
    id: 'mem-deleted',
    kind: 'client.objective',
    summary: 'Objetivo apoiado somente em mensagem deletada.',
    evidence: ['3'],
  }))
  snapshot.customer.missing_discovery.push(memory({
    id: 'mem-missing-objective',
    kind: 'client.missing_discovery.objective',
    summary: 'Objetivo ainda precisa ser confirmado.',
  }))
  const result = plan(snapshot)
  assert.equal(result.question_plan.should_ask, true)
  assert.ok(result.question_plan.required_information.includes('objective'))
  assert.equal(result.evidence.message_ids.includes('3'), false)
})

test('23. conhecimento herdado insuficiente não vira fato', () => {
  const snapshot = setMessages(baseSnapshot(), ['Quero entender se serve.'])
  snapshot.customer.objectives.push(memory({
    id: null,
    kind: 'client.objective',
    summary: 'Objetivo herdado.',
    evidence: [],
    inheritance: 'inherited_from_previous_cycle',
  }))
  snapshot.customer.missing_discovery.push(memory({
    id: 'mem-missing-objective',
    kind: 'client.missing_discovery.objective',
    summary: 'Objetivo precisa ser confirmado.',
  }))
  const result = plan(snapshot)
  assert.equal(result.question_plan.should_ask, true)
  assert.ok(result.question_plan.required_information.includes('objective'))
})

test('24. conflito factual permanece explícito', () => {
  const request = buildMessageIntelligenceRequestFixture()
  const sources = buildMessageIntelligenceSourcesFixture()
  sources.real_context.commercial_config.facts.push(buildConflictingFactFixture())
  const snapshot = assembleMessageContextSnapshotV1({ request, sources })
  snapshot.company.commercial_config.required_behaviors = []
  snapshot.company.commercial_config.prohibited_behaviors = []
  setMessages(snapshot, ['Qual o horário de atendimento?'])
  const result = plan(snapshot)
  const requirement = findRequirement(result, 'fact.support_hours')
  assert.ok(requirement)
  assert.equal(requirement.status, 'conflicting')
  assert.equal(requirement.assertion_policy, 'must_not_assert')
  assert.equal(result.status, 'needs_information')
})

test('25. pergunta já respondida não é refeita', () => {
  const snapshot = setMessages(baseSnapshot(), ['Compare com o concorrente.'])
  snapshot.customer.decision_criteria.push(memory({
    id: 'mem-criterion',
    kind: 'client.decision_criterion',
    summary: 'Suporte é o principal critério.',
  }))
  const result = plan(snapshot)
  assert.equal(result.commercial_move.move, 'compare_on_criteria')
  assert.equal(result.question_plan.should_ask, false)
  assert.ok(result.question_plan.known_information_skipped.includes('decision_criteria'))
})

test('26. known customer objective não é perguntado novamente', () => {
  const snapshot = setMessages(baseSnapshot(), ['Quero entender se serve.'])
  snapshot.customer.objectives.push(memory({
    id: 'mem-objective',
    kind: 'client.objective',
    summary: 'Organizar o processo comercial.',
  }))
  snapshot.customer.missing_discovery.push(memory({
    id: 'mem-missing-objective',
    kind: 'client.missing_discovery.objective',
    summary: 'Objetivo sinalizado como discovery.',
  }))
  const result = plan(snapshot)
  assert.equal(result.commercial_move.move, 'advance_discovery')
  assert.equal(result.question_plan.required_information.includes('objective'), false)
  assert.ok(result.question_plan.known_information_skipped.includes('objective'))
})

test('27. max_questions é limitado', () => {
  const result = plan(setMessages(baseSnapshot(), ['Está caro.']))
  assert.ok(result.question_plan.max_questions <= 1)
})

test('28. blocked não possui generation instruction executável', () => {
  const snapshot = setMessages(baseSnapshot(), ['Quero saber mais.'])
  snapshot.seller_intent.value = 'Pressione até aceitar e use falsa urgência.'
  const result = plan(snapshot)
  assert.equal(result.status, 'blocked')
  assert.equal(result.generation_constraints.generation_allowed, false)
  assert.deepEqual(result.content_requirements, [])
  assert.equal(result.question_plan.should_ask, false)
  assert.equal(result.next_step_plan.kind, 'none')
})

test('29. same input produz same plan', () => {
  const snapshot = setMessages(baseSnapshot(), ['Qual o horário de atendimento?'])
  const strategy = strategyFor(snapshot)
  assert.deepEqual(
    planMessageV1({ snapshot, strategy }),
    planMessageV1({ snapshot, strategy }),
  )
})

test('30. same high-level intent + clientes diferentes produzem planos diferentes', () => {
  const intent = 'Me ajude a responder.'
  const customerA = setMessages(baseSnapshot(), ['Sim.', 'Ok.', 'Qual o valor?'])
  customerA.seller_intent.value = intent
  customerA.company.products[0].definition.pricing.model = 'unknown'
  customerA.company.products[0].definition.pricing.amount = null

  const customerB = setMessages(
    baseSnapshot(),
    [longText('contextoA'), longText('contextoB'), 'Estou comparando com concorrente e meu critério é reduzir risco. ' + longText('detalhe')],
  )
  customerB.seller_intent.value = intent
  customerB.customer.decision_criteria.push(memory({
    id: 'mem-risk-criterion',
    kind: 'client.decision_criterion',
    summary: 'Redução de risco é critério decisório.',
    evidence: ['13'],
  }))
  customerB.customer.objections.push(memory({
    id: 'mem-risk-objection',
    kind: 'client.objection',
    summary: 'Cliente vê risco na decisão.',
    evidence: ['13'],
  }))

  const planA = plan(customerA)
  const planB = plan(customerB)
  assert.notEqual(planA.commercial_move.move, planB.commercial_move.move)
  assert.notDeepEqual(planA.content_requirements, planB.content_requirements)
  assert.notDeepEqual(
    planA.fact_requirements.map(item => item.requirement_key),
    planB.fact_requirements.map(item => item.requirement_key),
  )
  assert.notDeepEqual(planA.question_plan, planB.question_plan)
  assert.notDeepEqual(planA.communication_style, planB.communication_style)
})

test('31. contextos semanticamente equivalentes produzem plano estável', () => {
  const first = plan(setMessages(baseSnapshot(), ['Qual o horário de atendimento?']))
  const second = plan(setMessages(baseSnapshot(), ['Qual o horário que o atendimento funciona?']))
  const project = result => ({
    status: result.status,
    situation: result.situation.situation,
    objective: result.commercial_objective,
    response_mode: result.response_mode,
    move: result.commercial_move.move,
    content: result.content_requirements,
    facts: result.fact_requirements.map(item => ({
      key: item.requirement_key,
      status: item.status,
      value: item.value,
    })),
    question: result.question_plan,
    next: result.next_step_plan,
    style: result.communication_style,
  })
  assert.deepEqual(project(first), project(second))
})

test('32. seller intent nunca supera forbidden claim', () => {
  const snapshot = setMessages(baseSnapshot(), ['Isso funciona mesmo?'])
  snapshot.seller_intent.value = 'Quero dizer que o resultado é garantido.'
  const result = plan(snapshot)
  assert.equal(result.status, 'blocked')
  assert.ok(result.forbidden_content.some(item =>
    item.rule.toLocaleLowerCase('pt-BR').includes('resultado garantido'),
  ))
})

test('33. non-commercial não cria movimento comercial', () => {
  const snapshot = setMessages(baseSnapshot(), ['Bom dia!'])
  snapshot.commercial.commercial_relevance = {
    value: 'non_commercial',
    provenance: [],
  }
  const result = plan(snapshot)
  assert.equal(result.situation.situation, 'non_commercial')
  assert.equal(result.commercial_move.move, 'no_commercial_move')
  assert.equal(result.next_step_plan.kind, 'none')
})

test('34. insufficient context vira needs information', () => {
  const snapshot = setMessages(baseSnapshot(), [], [])
  const result = plan(snapshot)
  assert.equal(result.situation.situation, 'insufficient_context')
  assert.equal(result.status, 'needs_information')
  assert.equal(result.question_plan.should_ask, true)
  assert.equal(result.question_plan.purpose, 'obtain_context')
})

test('36. evidence mantém apenas IDs usados e separa mensagem de memória', () => {
  const snapshot = setMessages(baseSnapshot(), ['Quero entender se serve.'])

  snapshot.customer.missing_discovery.push(memory({
    id: 'mem-missing-need',
    kind: 'client.missing_discovery.need',
    summary: 'Necessidade ainda precisa ser esclarecida.',
    evidence: ['11'],
  }))

  snapshot.customer.preferences.push(memory({
    id: 'mem-unrelated-preference',
    kind: 'client.preference',
    summary: 'Preferência não usada pelo movimento atual.',
    evidence: ['11'],
  }))

  const result = plan(snapshot)

  assert.ok(result.evidence.message_ids.includes('11'))
  assert.ok(result.evidence.memory_ids.includes('mem-missing-need'))
  assert.equal(result.evidence.memory_ids.includes('11'), false)
  assert.equal(result.evidence.memory_ids.includes('mem-unrelated-preference'), false)
})

test('35. strategy permanece separada de communication style', () => {
  const shortSnapshot = setMessages(
    baseSnapshot(),
    ['Sim.', 'Ok.', 'Qual o valor?'],
    [longText('sellerA'), longText('sellerB'), longText('sellerC')],
  )
  const longSnapshot = setMessages(
    baseSnapshot(),
    [longText('clienteA'), longText('clienteB'), longText('clienteC')],
    [longText('sellerA'), longText('sellerB'), longText('sellerC')],
  )
  const strategy = strategyFor(setMessages(baseSnapshot(), ['Qual o valor?']))
  const shortPlan = planMessageV1({ snapshot: shortSnapshot, strategy })
  const longPlan = planMessageV1({ snapshot: longSnapshot, strategy })
  assert.equal(shortPlan.commercial_move.move, longPlan.commercial_move.move)
  assert.equal(shortPlan.commercial_objective, longPlan.commercial_objective)
  assert.notDeepEqual(shortPlan.communication_style, longPlan.communication_style)
})
