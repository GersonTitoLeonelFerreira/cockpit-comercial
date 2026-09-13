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

// FASE 16.9 — MENSAGEM não pode mais decidir situação, papéis, objeção,
// técnica ou conhecimento de empresa por conta própria. Este arquivo
// prova, com execução real de função (não apenas checagem estrutural),
// que a MESMA verdade comercial canônica que sustenta AGORA/ANÁLISE/
// CLIENTE (buildCommercialReasoning + buildSellerFacingReasoningProjection)
// chega intacta ao gerador de mensagem (composeSellerMessage), que o
// gerador nunca a recalcula, e que um rascunho que a contradiga é
// reparado pelo gate de revisão em vez de aceito silenciosamente.

const {
  buildCommercialReasoning,
} = await import('./commercial-reasoning-engine.ts')

const {
  buildSellerFacingReasoningProjection,
} = await import('../server/seller-facing-reasoning-projection.ts')

const {
  composeSellerMessage,
} = await import('./lead-seller-message.ts')

const method = {
  id: 'method-1',
  version_number: 1,
  source_contract_version: 'commercial-method-v2',
  name: 'Método consultivo',
  description: 'Método comercial de teste',
  structure_source: 'published_definition',
  principles: [],
  stages: [],
  business_context: {
    business_description: 'Empresa de serviços recorrentes.',
    target_audience: 'Adultos.',
    value_proposition: 'Acompanhamento próximo.',
  },
  seller_rules: {
    communication_tone: 'Humana e direta',
    required_behaviors: [],
    prohibited_behaviors: [],
  },
}

function evidence(summary, ids = ['m1']) {
  return {
    summary,
    evidence_message_ids: ids,
    memory_ids: [],
  }
}

function buildDiagnosticInput({ facts = [] } = {}) {
  return {
    input_version: 'phase-5-input-v1',
    diagnostic_contract_version: 'phase-4-diagnostic-v3',
    company_id: 'company-a',
    cycle_id: 'cycle-a',
    conversation_key: 'conversation-a',
    current_crm_status: 'negociacao',
    reference_time: '2026-09-11T12:00:00-03:00',
    analysis_precondition: { status: 'ready', limitations: [] },
    conversation: {
      active_message_ids: ['m1'],
      excluded_message_ids: [],
      messages: [],
      excluded_messages: [],
    },
    commercial_context: {
      configured: true,
      config_version_id: 'config-a',
      config_version_number: 1,
      config_contract_version: 'phase-2-v1',
      business_description: 'Empresa de serviços recorrentes.',
      target_audience: 'Adultos.',
      value_proposition: 'Acompanhamento próximo.',
      communication_tone: 'Claro.',
      required_behaviors: [],
      prohibited_behaviors: [],
      sales_method: {
        configured: true,
        contract_version: 'commercial-method-v2',
        name: 'Método consultivo',
        description: 'Diagnosticar antes de recomendar.',
        principles: ['Entender o contexto antes de avançar.'],
        definition: null,
        steps: [],
      },
      products: [],
      facts,
      objection_guides: [],
    },
  }
}

function buildState({ role = 'buyer', partyKinds = [] } = {}) {
  return {
    contract_version: 'phase-5.1-commercial-state-v1',
    cycle_id: 'cycle-a',
    version: 2,
    commercial_role: role,
    current_moment: evidence('Momento atual.'),
    current_priority: evidence('Prioridade atual.'),
    last_analyzed_message_ids: ['m1'],
    last_evidence_message_ids: ['m1'],
    facts: partyKinds.map((kind, index) => ({
      id: `party-${index + 1}`,
      kind,
      value: null,
      summary: kind,
      confidence: 'high',
      evidence_message_ids: ['m1'],
      memory_status: 'active',
      created_in_state_version: 1,
      updated_in_state_version: 1,
      closed_in_state_version: null,
    })),
    needs: [],
    open_loops: [],
    objections: [],
    commitments: [],
    signals: [],
    uncertainties: [],
    created_at: '2026-09-11T11:00:00-03:00',
    updated_at: '2026-09-11T11:30:00-03:00',
  }
}

function buildReading({
  role = 'buyer',
  relevance = 'commercial',
  currentState = 'Cliente em negociação.',
  decision = 'clarify',
  objections = [],
  interventionNeeded = true,
} = {}) {
  return {
    contract_version: 'commercial-reading-v1',
    analysis_status: 'complete',
    analysis_limitations: [],
    commercial_role: role,
    commercial_relevance: relevance,
    conversation_summary: {
      initial_context: null,
      evolution: null,
      important_events: [],
      current_state: evidence(currentState),
      last_customer_request_or_decision: evidence(currentState),
    },
    customer: {
      objectives: [],
      problems: [],
      impacts: [],
      needs: [],
      interests: [],
      decision_criteria: [],
      preferences: [],
      open_questions: [],
      objections,
      uncertainties: [],
      discussed_products: [],
      primary_product_interest: null,
      competitors: [],
      commitments: [],
      missing_discovery: [],
      resolved_information: [],
      superseded_information: [],
      communication: { events: [], patterns: [] },
    },
    commercial_evolution: [],
    method: {
      configured: true,
      name: 'Método consultivo',
      stages: [],
      current_stage: null,
      adherence: {
        status: 'on_method',
        summary: 'A condução segue o método.',
        deviation_stage_order: null,
        what_happened: null,
        missing_information: [],
        why_it_matters: null,
        evidence_message_ids: ['m1'],
        memory_ids: [],
      },
      recovery_guidance: null,
    },
    seller_strengths: [],
    improvement_points: [],
    risks: { customer_objections: [], service_risks: [] },
    best_approach: {
      decision,
      reason: 'Entender o contexto relevante antes de qualquer recomendação.',
      channel: 'text',
      evidence_message_ids: ['m1'],
      memory_ids: [],
    },
    communication: {
      intervention_needed: interventionNeeded,
      recommended_question: null,
      recommended_message: null,
    },
    operations: {
      crm: {
        should_change_crm_stage: false,
        recommended_status: null,
        rationale: null,
        requires_human_confirmation: true,
      },
      agenda: {
        should_change_agenda: false,
        expected_next_action_at: null,
        rationale: null,
        requires_human_confirmation: true,
      },
    },
    evidence_message_ids: ['m1'],
    memory_ids: [],
  }
}

function createProvider(outputs, calls = []) {
  let index = 0

  return async (request) => {
    calls.push(request)
    const output = outputs[index]
    index += 1

    if (output === undefined) {
      throw new Error('provider_sem_saida')
    }

    return {
      content: typeof output === 'string' ? output : JSON.stringify(output),
      provider: 'test',
      model: 'test-model',
      request_id: `request-${index}`,
      usage: null,
    }
  }
}

function reasoningInputFor(reasoning) {
  return {
    status: reasoning.status,
    decision: reasoning.decision,
    decision_reason: reasoning.decision_reason,
    current_situation: reasoning.current_situation,
    objective_now: reasoning.objective_now,
    do_not_do: reasoning.do_not_do,
    selected_techniques: reasoning.selected_techniques,
    company_knowledge_used: reasoning.company_knowledge_used,
    limitations: reasoning.limitations,
  }
}

// -----------------------------------------------------------------------
// CASO A — terceiro/irmã: Commercial Reasoning real (buildCommercialReasoning)
// reconhece a oportunidade de terceiro; a projeção seller-facing real
// (buildSellerFacingReasoningProjection) materializa os papéis; a mensagem
// recebe esses papéis reais e um rascunho que trata a interlocutora como
// compradora direta é reparado pelo gate de revisão.
// -----------------------------------------------------------------------
test('CASO A: oportunidade de terceiro chega à mensagem com os mesmos papéis do reasoning canônico, e inversão é reparada', async () => {
  const reading = buildReading({
    role: 'unknown',
    currentState:
      'Juliana informou que a irmã Mariana quer contratar e precisa saber como começar.',
    decision: 'clarify',
  })

  const state = buildState({
    role: 'unknown',
    partyKinds: [
      'commercial_party.current_contact.intermediary',
      'commercial_party.related.prospect',
    ],
  })

  const reasoning = buildCommercialReasoning({
    reading,
    cycle_state: state,
    diagnostic_input: buildDiagnosticInput(),
  })

  assert.notEqual(reasoning.status, 'silent')

  const projection = buildSellerFacingReasoningProjection({
    reasoning,
    reading: { reading },
    state,
  })

  assert.equal(projection.customer_roles.length, 2)
  assert.ok(
    projection.customer_roles.some(
      (role) => role.scope === 'current_contact' && role.role === 'intermediary',
    ),
  )
  assert.ok(
    projection.customer_roles.some(
      (role) => role.scope === 'related' && role.role === 'prospect',
    ),
  )

  const calls = []
  const badRoleInversion =
    'Mariana, que bom que você quer começar! Vamos marcar sua aula experimental?'
  const corrected =
    'Perfeito, Juliana! Me conta um pouco mais sobre a sua irmã para eu te ajudar a encaminhar a aula experimental dela.'

  const result = await composeSellerMessage({
    workingSummary:
      'Juliana (aluna) relatou que a irmã Mariana quer fazer uma aula experimental.',
    sellerIntent:
      'Quero ajudar a encaminhar a aula experimental da irmã dela.',
    method,
    reasoning: reasoningInputFor(reasoning),
    roles: projection.customer_roles,
    provider: createProvider(
      [
        { message: badRoleInversion },
        {
          message: corrected,
          changed: true,
          issue_code: 'canonical_contradiction',
        },
      ],
      calls,
    ),
  })

  assert.equal(result.status, 'ready')
  assert.equal(result.message, corrected)

  const generationPrompt = JSON.parse(calls[0].user_prompt)
  assert.ok(
    generationPrompt.customer_roles.some((entry) => /intermediário/i.test(entry)),
  )
  assert.ok(
    generationPrompt.customer_roles.some((entry) => /prospect/i.test(entry)),
  )

  const reviewPrompt = JSON.parse(calls[1].user_prompt)
  assert.ok(
    reviewPrompt.customer_roles.some((entry) => /prospect/i.test(entry)),
  )
})

// -----------------------------------------------------------------------
// CASO B — objeção de pagamento sem cartão: do_not_do canônico chega à
// mensagem e um rascunho que inventa política fora do conhecimento
// publicado é reparado, nunca aceito silenciosamente.
// -----------------------------------------------------------------------
test('CASO B: do_not_do sobre política de pagamento chega ao gerador e ao gate; rascunho que inventa política é reparado', async () => {
  const reasoning = {
    status: 'ready',
    decision: 'handle_objection',
    decision_reason: 'Cliente perguntou como proceder sem cartão de crédito.',
    current_situation:
      'Cliente perguntou como proceder sem cartão de crédito e não obteve resposta ainda.',
    objective_now: 'Responder à objeção de pagamento sem cartão.',
    do_not_do: [
      'Não inventar uma forma de pagamento ou condição que não esteja no conhecimento de empresa publicado.',
    ],
    selected_techniques: [],
    company_knowledge_used: [
      {
        title: 'Pagamento por cartão recorrente',
        why_relevant:
          'A cobrança é feita por cartão de crédito recorrente conforme política publicada; não há opção sem cartão.',
      },
    ],
    limitations: [],
  }

  const calls = []
  const badInventedPolicy =
    'Sem o cartão, você também pode me pagar direto em dinheiro, sem problema.'
  const corrected =
    'Hoje a cobrança é feita por cartão de crédito recorrente. Você tem outro cartão que possa usar, ou prefere que eu confirme outra alternativa antes de seguirmos?'

  const result = await composeSellerMessage({
    workingSummary:
      'Cliente perguntou explicitamente como proceder sem cartão de crédito.',
    sellerIntent:
      'Quero responder à dúvida sobre pagamento sem cartão.',
    method,
    reasoning,
    provider: createProvider(
      [
        { message: badInventedPolicy },
        {
          message: corrected,
          changed: true,
          issue_code: 'canonical_contradiction',
        },
      ],
      calls,
    ),
  })

  assert.equal(result.status, 'ready')
  assert.equal(result.message, corrected)

  const reviewPrompt = JSON.parse(calls[1].user_prompt)
  assert.equal(
    reviewPrompt.commercial_reasoning.do_not_do[0],
    reasoning.do_not_do[0],
  )
  assert.match(
    calls[1].system_prompt,
    /canonical_contradiction/,
  )
})

// -----------------------------------------------------------------------
// CASO C — cirurgia/congelamento: o Commercial Reasoning real filtra o
// conhecimento de pagamento por falta de relevância semântica; a mensagem
// nunca recebe esse conhecimento porque o próprio reasoning não o
// selecionou (nada é filtrado de novo dentro do gerador).
// -----------------------------------------------------------------------
test('CASO C: cirurgia não injeta conhecimento de pagamento porque o reasoning canônico já filtrou por relevância semântica', async () => {
  const reading = buildReading({
    currentState:
      'Cliente informou cirurgia recente e aguarda orientação sobre como seguir.',
    decision: 'deepen_discovery',
  })

  const state = buildState()

  const diagnosticInput = buildDiagnosticInput({
    facts: [
      {
        contract_version: 'commercial-fact-v1',
        definition: null,
        validity_status: 'current',
        category: 'payment',
        fact_key: 'pix',
        fact_value:
          'Pix disponível somente quando aplicável à política comercial.',
        source_note: 'Configuração publicada.',
      },
    ],
  })

  const reasoning = buildCommercialReasoning({
    reading,
    cycle_state: state,
    diagnostic_input: diagnosticInput,
  })

  assert.equal(
    reasoning.company_knowledge_used.some((item) =>
      /pagamento|pix|cartão|cartao/i.test(item.title),
    ),
    false,
  )

  const calls = []
  const message =
    'Entendo, saúde vem primeiro. Como está a recuperação e quando o médico libera atividades de novo?'

  const result = await composeSellerMessage({
    workingSummary:
      'Cliente relatou cirurgia recente e está em recuperação.',
    sellerIntent:
      'Quero entender melhor a condição atual antes de qualquer próximo passo.',
    method,
    reasoning: reasoningInputFor(reasoning),
    provider: createProvider(
      [{ message }, { message, changed: false, issue_code: 'none' }],
      calls,
    ),
  })

  assert.equal(result.status, 'ready')

  const generationPrompt = JSON.parse(calls[0].user_prompt)
  assert.deepEqual(
    generationPrompt.commercial_reasoning.company_knowledge_used,
    [],
  )
})

// -----------------------------------------------------------------------
// CASO D — plano+preço+link+objeção: um link já enviado não pode ser
// reenviado sem necessidade; a restrição chega como do_not_do canônico e
// um rascunho que repete o link é reparado pelo gate.
// -----------------------------------------------------------------------
test('CASO D: link já enviado não é repetido — do_not_do canônico bloqueia o rascunho que reenvia', async () => {
  const previousLink = 'https://pagamento.exemplo.com/plano-a'

  const reasoning = {
    status: 'ready',
    decision: 'handle_objection',
    decision_reason: 'Cliente já recebeu plano, preço e link, e trouxe uma objeção.',
    current_situation:
      'O plano, o preço e o link de pagamento já foram enviados; o cliente trouxe uma objeção sobre o valor.',
    objective_now: 'Trabalhar a objeção de valor sem repetir o que já foi enviado.',
    do_not_do: [
      'Não reenviar o link de pagamento já enviado sem necessidade nova.',
      'Não repetir a apresentação do plano já feita.',
    ],
    selected_techniques: [],
    company_knowledge_used: [],
    limitations: [],
  }

  const calls = []
  const badRepeat = `Segue novamente o link para pagamento: ${previousLink}`
  const corrected =
    'Entendo a preocupação com o valor — me conta o que pesou mais para você, o valor total ou a forma de pagamento?'

  const result = await composeSellerMessage({
    workingSummary:
      'O plano e o preço já foram apresentados e o link de pagamento já foi enviado; o cliente achou caro.',
    currentInteraction: [
      {
        direction: 'outgoing',
        occurred_at: '2026-09-10T10:00:00.000Z',
        text: `Segue o link para pagamento: ${previousLink}`,
      },
      {
        direction: 'incoming',
        occurred_at: '2026-09-10T10:05:00.000Z',
        text: 'Achei meio caro, hein.',
      },
    ],
    sellerIntent: 'Quero trabalhar a objeção de valor.',
    method,
    reasoning,
    provider: createProvider(
      [
        { message: badRepeat },
        {
          message: corrected,
          changed: true,
          issue_code: 'context_conflict',
        },
      ],
      calls,
    ),
  })

  assert.equal(result.status, 'ready')
  assert.equal(result.message, corrected)
  assert.doesNotMatch(result.message, /pagamento\.exemplo\.com/)
})

// -----------------------------------------------------------------------
// CASO E — waiting: o vendedor já perguntou e aguarda o cliente; o
// do_not_do canônico proíbe cobrar de novo, e um rascunho que repete a
// pergunta é reparado.
// -----------------------------------------------------------------------
test('CASO E: vendedor aguardando resposta do cliente não tem a pergunta repetida — do_not_do bloqueia cobrança duplicada', async () => {
  const reasoning = {
    status: 'ready',
    decision: 'give_space',
    decision_reason: 'O vendedor já perguntou e aguarda a resposta do cliente.',
    current_situation:
      'O vendedor já perguntou sobre a disponibilidade do cliente e aguarda a resposta.',
    objective_now: 'Aguardar a resposta do cliente sem cobrar de novo.',
    do_not_do: [
      'Não repetir ou cobrar uma pergunta que o vendedor já fez e ainda aguarda resposta.',
    ],
    selected_techniques: [],
    company_knowledge_used: [],
    limitations: [],
  }

  const calls = []
  const badRepeatQuestion =
    'Oi! Você teria disponibilidade essa semana para a aula?'
  const corrected =
    'Fico no aguardo do seu retorno sobre a disponibilidade dessa semana, sem pressa.'

  const result = await composeSellerMessage({
    workingSummary:
      'O vendedor já perguntou sobre disponibilidade e aguarda resposta do cliente.',
    currentInteraction: [
      {
        direction: 'outgoing',
        occurred_at: '2026-09-10T09:00:00.000Z',
        text: 'Você teria disponibilidade essa semana para a aula?',
      },
    ],
    sellerIntent: 'Quero responder ao ponto principal desta conversa.',
    method,
    reasoning,
    provider: createProvider(
      [
        { message: badRepeatQuestion },
        {
          message: corrected,
          changed: true,
          issue_code: 'canonical_contradiction',
        },
      ],
      calls,
    ),
  })

  assert.equal(result.status, 'ready')
  assert.equal(result.message, corrected)
})

// -----------------------------------------------------------------------
// CASO F — não comercial: o reasoning canônico fica silent (nenhuma
// técnica, nenhum conhecimento de empresa) e essa restrição chega ao
// gerador, que responde ao pedido explícito do vendedor sem forçar venda.
// -----------------------------------------------------------------------
test('CASO F: conversa não comercial mantém reasoning silent e a mensagem não força venda', async () => {
  const reading = buildReading({
    role: 'unknown',
    relevance: 'non_commercial',
    currentState: 'Conversa pessoal sem relação comercial.',
  })

  const state = buildState({ role: 'unknown' })

  const reasoning = buildCommercialReasoning({
    reading,
    cycle_state: state,
    diagnostic_input: buildDiagnosticInput(),
  })

  assert.equal(reasoning.status, 'silent')
  assert.equal(reasoning.selected_techniques.length, 0)
  assert.equal(reasoning.company_knowledge_used.length, 0)

  const calls = []
  const message = 'Kkkk verdade! Bom saber que deu tudo certo.'

  const result = await composeSellerMessage({
    workingSummary:
      'A conversa atual é pessoal e não existe ação comercial neste momento.',
    sellerIntent:
      'Quero responder somente ao assunto atual, sem transformar isso em venda.',
    method,
    reasoning: reasoningInputFor(reasoning),
    provider: createProvider(
      [{ message }, { message, changed: false, issue_code: 'none' }],
      calls,
    ),
  })

  assert.equal(result.status, 'ready')

  const generationPrompt = JSON.parse(calls[0].user_prompt)
  assert.equal(generationPrompt.commercial_reasoning.status, 'silent')
  assert.deepEqual(
    generationPrompt.commercial_reasoning.company_knowledge_used,
    [],
  )
  assert.match(
    calls[0].system_prompt,
    /não transforme automaticamente/i,
  )
})
