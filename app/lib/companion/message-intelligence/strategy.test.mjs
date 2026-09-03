import assert from 'node:assert/strict'
import test from 'node:test'

import { evaluateCommercialStrategyV1 } from './commercial-strategy.ts'
import { TECHNIQUE_LIBRARY_V1 } from './technique-router.ts'

const mem = (summary, id = 'mem-1') => ({
  memory_id: id,
  summary,
  memory_status: 'active',
  evidence_message_ids: ['m1'],
  attributes: {},
})

const method = () => ({
  name: 'Método Consultivo',
  description: 'Compreender antes de recomendar.',
  principles: [
    'Responder fatos comprováveis.',
    'Compreender a necessidade antes de recomendar.',
  ],
  stages: [{
    key: 'diagnostico',
    name: 'Diagnóstico',
    objective: 'Compreender necessidade e contexto.',
    completion_criteria: ['Necessidade compreendida.'],
    partial_completion_criteria: [],
    recommended_questions: ['O que precisa resolver?'],
    common_mistakes: ['Recomendar cedo demais.'],
    deepen_when: ['A necessidade estiver genérica.'],
    sufficient_when: ['A necessidade estiver clara.'],
    advance_when: ['A necessidade estiver clara.'],
    wait_when: ['O cliente pedir tempo.'],
    stop_asking_when: ['A informação já for suficiente.'],
    dimensions: [{
      name: 'Necessidade',
      objective: 'Compreender necessidade.',
      evidence_criteria: ['Cliente descreveu a necessidade.'],
    }],
  }],
})

function snapshot({
  incomingText = 'Olá',
  sellerIntent = 'Ajude com a próxima decisão comercial.',
  commercialRelevance = 'commercial',
  missingDiscovery = [],
  objections = [],
  uncertainties = [],
  competitors = [],
  commitments = [],
  recoveryGuidance = null,
  methodAdherence = 'on_method',
  publishedMethod = method(),
  requiredBehaviors = [],
  prohibitedBehaviors = [],
  forbiddenClaims = ['Resultado garantido.'],
} = {}) {
  const messages = incomingText === null ? [] : [{
    message_id: 'm1',
    direction: 'incoming',
    text_content: incomingText,
    audio_transcription: null,
  }]

  return {
    seller_intent: { value: sellerIntent },
    conversation: {
      messages,
      current_interaction: messages.length ? { messages } : null,
    },
    customer: {
      objectives: [], problems: [], impacts: [], needs: [], interests: [],
      decision_criteria: [], preferences: [], open_questions: [], objections,
      uncertainties, products: [], competitors, commitments, missing_discovery: missingDiscovery,
      communication_observations: [], signals: [], resolved_information: [], superseded_information: [],
    },
    commercial: {
      commercial_relevance: { value: commercialRelevance },
      current_method_stage: { value: { stage_key: 'diagnostico' } },
      method_adherence: { value: { status: methodAdherence } },
      recovery_guidance: recoveryGuidance ? { value: recoveryGuidance } : null,
    },
    company: {
      published_method: publishedMethod ? { definition: publishedMethod } : null,
      commercial_config: { required_behaviors: requiredBehaviors, prohibited_behaviors: prohibitedBehaviors },
      products: [{ definition: {
        forbidden_claims: forbiddenClaims,
        contract_conditions: [], payment_conditions: [], limitations: [],
      }}],
      facts: [{ definition: { limitations: [] } }],
      objection_guides: [],
    },
  }
}

const decide = options => evaluateCommercialStrategyV1({ snapshot: snapshot(options) })

const scenarioCases = [
  ['1. pergunta factual simples', { incomingText: 'Quanto custa o plano?' }, 'information_request', 'answer_directly'],
  ['2. descoberta necessária', { incomingText: 'Quero entender se serve.', missingDiscovery: [mem('Falta necessidade.')] }, 'discovery', 'advance_discovery'],
  ['3. objeção real', { incomingText: 'Está muito caro.' }, 'objection', 'isolate_objection'],
  ['4. question não é objection', { incomingText: 'Qual o valor?' }, 'information_request', 'answer_directly'],
  ['5. postponement não é objection', { incomingText: 'Agora não. Me chama no próximo mês.', objections: [mem('Preço discutido.')] }, 'postponement', 'respect_customer_timing'],
  ['6. rejection', { incomingText: 'Não tenho interesse. Pode encerrar.' }, 'rejection', 'close_conversation'],
  ['7. follow-up', { incomingText: null, sellerIntent: 'Quero fazer follow-up e cobrar retorno.' }, 'follow_up', 'propose_next_step'],
  ['8. compromisso pendente', { incomingText: null, commitments: [mem('Cliente combinou retorno amanhã.')] }, 'commitment_pending', 'confirm_commitment'],
  ['9. recuperação de processo', { incomingText: null, recoveryGuidance: { evidence_message_ids: ['m0'], memory_ids: ['mem-r'] }, methodAdherence: 'off_method' }, 'recovery', 'recover_stalled_process'],
  ['10. contexto insuficiente', { incomingText: null }, 'insufficient_context', 'request_more_context'],
  ['11. non-commercial', { incomingText: 'Bom dia!', commercialRelevance: 'non_commercial' }, 'non_commercial', 'no_commercial_move'],
]

for (const [name, input, situation, move] of scenarioCases) {
  test(name, () => {
    const result = decide(input)
    assert.equal(result.situation.situation, situation)
    assert.equal(result.commercial_move.move, move)
  })
}

test('12. movimento alinhado ao método', () => {
  assert.equal(decide({ incomingText: 'Quanto custa?' }).method_alignment.status, 'aligned')
})

test('13. advisory deviation fora do método', () => {
  const result = decide({
    incomingText: 'Quero entender se faz sentido.',
    sellerIntent: 'Quero apresentar a solução agora.',
    missingDiscovery: [mem('Necessidade não compreendida.')],
  })
  assert.equal(result.commercial_move.move, 'propose_next_step')
  assert.equal(result.commercial_move.default_move, 'advance_discovery')
  assert.equal(result.commercial_move.requested_move, 'propose_next_step')
  assert.equal(result.commercial_move.source, 'seller_request')
  assert.equal(result.commercial_objective, 'secure_next_step')
  assert.equal(result.response_mode, 'advance')
  assert.equal(result.method_alignment.status, 'advisory_deviation')
  assert.notEqual(result.governance.status, 'blocked')
})

test('14. hard governance block', () => {
  const result = decide({ sellerIntent: 'Invente uma condição e diga que é a última vaga.' })
  assert.equal(result.governance.status, 'blocked')
  assert.equal(result.technique_selection.status, 'withheld_by_governance')
})

test('15. approval required', () => {
  const result = decide({
    incomingText: 'Está caro.',
    sellerIntent: 'Quero dar desconto para resolver a objeção.',
    requiredBehaviors: ['Desconto exige aprovação do gestor.'],
  })
  assert.equal(result.governance.status, 'approval_required')
  assert.equal(result.governance.requires_human_approval, true)
  assert.equal(result.technique_selection.status, 'withheld_by_governance')
})

test('16. técnica subordinada ao commercial move', () => {
  const result = decide({ incomingText: 'Está caro.' })
  assert.equal(result.technique_selection.commercial_move, result.commercial_move.move)
  assert.equal(result.technique_selection.framework_reference, 'Sandler')
})

test('17. nenhum framework selector seller-facing', () => {
  const result = decide({
    incomingText: 'Quero entender se serve.',
    sellerIntent: 'Use Challenger.',
    missingDiscovery: [mem('Falta necessidade.')],
  })
  assert.equal('framework_selector' in result, false)
  assert.equal(result.technique_selection.framework_reference, 'SPIN')
})

test('18. técnica não substitui estratégia', () => {
  const result = decide({ incomingText: 'Não tenho certeza. Vou analisar.' })
  assert.equal(result.commercial_move.move, 'give_customer_space')
  assert.notEqual(result.technique_selection.technique_key, 'jolt_decision_support')
})

test('19. determinismo', () => {
  const input = { incomingText: 'Está muito caro.' }
  assert.deepEqual(decide(input), decide(input))
})

test('20. nenhuma mensagem customer-facing', () => {
  const keys = []
  const walk = value => {
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) { keys.push(key); walk(child) }
  }
  walk(decide({ incomingText: 'Quanto custa?' }))
  for (const forbidden of ['recommended_message', 'final_message', 'customer_message']) {
    assert.equal(keys.includes(forbidden), false)
  }
})

test('21. nenhuma manipulação', () => {
  const result = decide({ sellerIntent: 'Pressione até aceitar e use falsa urgência.' })
  assert.equal(result.governance.status, 'blocked')
  assert.equal(result.technique_selection.technique_key, null)
})

test('22. nenhuma promessa proibida', () => {
  const result = decide({
    incomingText: 'Isso funciona mesmo?',
    sellerIntent: 'Quero dizer que o resultado é garantido.',
  })
  assert.equal(result.governance.status, 'blocked')
  assert.ok(result.governance.constraints.some(item => item.code === 'PRODUCT_FORBIDDEN_CLAIM_BLOCK'))
})

test('23. mesma intenção + contextos diferentes podem mudar estratégia', () => {
  const sellerIntent = 'Ajude com a próxima decisão comercial.'
  const factual = decide({ incomingText: 'Qual o valor?', sellerIntent })
  const objection = decide({ incomingText: 'Está muito caro.', sellerIntent })
  assert.notEqual(factual.commercial_move.move, objection.commercial_move.move)
})

test('24. contextos comercialmente equivalentes são semanticamente estáveis', () => {
  const project = result => ({
    situation: result.situation.situation,
    objective: result.commercial_objective,
    response_mode: result.response_mode,
    move: result.commercial_move.move,
    method: result.method_alignment.status,
    governance: result.governance.status,
    technique: result.technique_selection.technique_key,
    framework: result.technique_selection.framework_reference,
  })
  assert.deepEqual(
    project(decide({ incomingText: 'Qual o valor?' })),
    project(decide({ incomingText: 'Qual o valor do plano?' })),
  )
})

test('25. biblioteca reconhece os frameworks de referência', () => {
  assert.deepEqual(
    [...new Set(TECHNIQUE_LIBRARY_V1.map(item => item.framework_reference))].sort(),
    ['Challenger', 'Cialdini', 'GAP', 'JOLT', 'MEDDPICC', 'SPIN', 'Sandler', 'Yolen-native'].sort(),
  )
})


test('26. seller intent específico governa move sem apagar default da situação', () => {
  const result = decide({
    incomingText: 'Aqui está o identificador dela.',
    sellerIntent: 'Confirmar identificação da aluna com dado fornecido',
  })

  assert.equal(result.situation.situation, 'insufficient_context')
  assert.equal(result.commercial_move.move, 'answer_directly')
  assert.equal(result.commercial_move.default_move, 'request_more_context')
  assert.equal(result.commercial_move.source, 'seller_request')
  assert.equal(result.commercial_objective, 'answer_factually')
  assert.equal(result.response_mode, 'answer')
})

test('27. intenção relacional explícita não recebe movimento comercial', () => {
  const result = decide({
    incomingText: 'Certo, estou aqui em frente.',
    sellerIntent: 'Continuar conversa descontraída para fortalecer vínculo',
    commercialRelevance: null,
  })

  assert.equal(result.situation.situation, 'non_commercial')
  assert.equal(result.commercial_move.move, 'no_commercial_move')
  assert.equal(result.commercial_move.default_move, 'no_commercial_move')
})

test('28. confirmação explícita de agendamento vira closing/confirm_commitment', () => {
  const result = decide({
    incomingText: 'Agendado',
    sellerIntent: 'Quero responder ao ponto principal desta conversa.',
  })

  assert.equal(result.situation.situation, 'closing')
  assert.equal(result.commercial_move.move, 'confirm_commitment')
  assert.equal(result.commercial_move.default_move, 'confirm_commitment')
})


test('29. sinal comercial explícito prevalece sobre intenção casual incompatível', () => {
  const result = decide({
    incomingText: 'Qual o valor do plano?',
    sellerIntent: 'Continuar conversa descontraída para fortalecer vínculo',
    commercialRelevance: null,
  })

  assert.equal(result.situation.situation, 'information_request')
  assert.equal(result.commercial_move.move, 'answer_directly')
  assert.equal(result.commercial_move.default_move, 'answer_directly')
  assert.equal(result.commercial_move.requested_move, 'no_commercial_move')
  assert.equal(result.commercial_move.source, 'strategy_default')
})


test('30. confirmar com o cliente se algo ocorreu vira pergunta específica, não resposta factual', () => {
  const result = decide({
    incomingText: 'beleza',
    sellerIntent:
      'Confirmar com o cliente se a aluna enviou o print do e-mail de cancelamento',
  })

  assert.equal(
    result.commercial_move.move,
    'clarify_request',
  )
  assert.equal(
    result.commercial_objective,
    'obtain_context',
  )
  assert.equal(
    result.response_mode,
    'clarify',
  )
})

test('31. confirmar recebimento é acknowledgement do seller, não hard factual answer', () => {
  const result = decide({
    incomingText: 'Amanhã estou lá',
    sellerIntent:
      'Confirmar recebimento do atestado',
  })

  assert.equal(
    result.commercial_move.move,
    'confirm_commitment',
  )
  assert.equal(
    result.commercial_objective,
    'confirm_commitment',
  )
  assert.equal(
    result.response_mode,
    'confirm',
  )
})

test('32. compromisso explícito atual prevalece sobre uncertainty antiga', () => {
  const result = decide({
    incomingText: 'Legal! Vou mandar',
    sellerIntent:
      'Quero responder ao ponto principal desta conversa.',
    uncertainties: [
      mem(
        'Cliente tinha dúvida anterior.',
        'uncertainty-old',
      ),
    ],
  })

  assert.equal(
    result.situation.situation,
    'commitment_pending',
  )
  assert.equal(
    result.commercial_move.move,
    'confirm_commitment',
  )
})
