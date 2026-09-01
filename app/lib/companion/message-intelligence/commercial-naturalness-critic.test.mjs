import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  critiqueMessageCandidatesV1,
} from './commercial-naturalness-critic.ts'

import {
  CRITIC_DIMENSION_WEIGHTS,
  CRITIC_THRESHOLDS,
} from './critic-contracts.ts'

import * as CriticModule from './commercial-naturalness-critic.ts'

const knownFact = (
  key = 'fact.support',
  value = 'O plano inclui suporte por WhatsApp.',
) => ({
  requirement_key: key,
  necessity: 'required',
  status: 'available',
  knowledge_status: 'resolved',
  subject: {},
  value,
  gap: null,
  gap_impact: null,
  assertion_policy: 'may_assert',
  provenance: [],
})

function plan(overrides = {}) {
  const base = {
    contract_version: 'message-plan-v1',
    status: 'ready',
    situation: {
      situation: 'information_request',
      confidence: 'high',
      evidence: [],
    },
    commercial_objective: 'answer_factually',
    response_mode: 'answer',
    commercial_move: {
      move: 'answer_directly',
      reason: 'Responder o que foi pedido.',
      source: 'strategy_default',
      requested_move: null,
    },
    method_alignment: {},
    governance_status: 'allowed',
    technique: {},
    content_requirements: ['answer_requested_information'],
    fact_requirements: [knownFact()],
    knowledge_gaps: [],
    forbidden_content: [],
    approval_boundaries: {},
    question_plan: {
      should_ask: false,
      purpose: 'none',
      max_questions: 0,
      question_type: 'none',
      required_information: [],
      avoid_reasking_known_fact: true,
      known_information_skipped: [],
    },
    next_step_plan: {
      kind: 'answer_and_wait',
      commercial_move: 'answer_directly',
      requires_customer_action: false,
      mutates_crm: false,
      mutates_agenda: false,
    },
    communication_style: {
      target_length: 'medium',
      directness: 'balanced',
      paragraph_density: 'balanced',
      question_density: 'none',
      formality: 'neutral',
      emoji_policy: 'unconstrained',
      greeting_policy: 'unconstrained',
      closing_policy: 'unconstrained',
    },
    evidence: {
      message_ids: [],
      memory_ids: [],
    },
    provenance: [],
    generation_constraints: {
      generation_allowed: true,
      items: [],
    },
  }

  return {
    ...base,
    ...overrides,
    situation: {
      ...base.situation,
      ...(overrides.situation ?? {}),
    },
    commercial_move: {
      ...base.commercial_move,
      ...(overrides.commercial_move ?? {}),
    },
    question_plan: {
      ...base.question_plan,
      ...(overrides.question_plan ?? {}),
    },
    next_step_plan: {
      ...base.next_step_plan,
      ...(overrides.next_step_plan ?? {}),
    },
    communication_style: {
      ...base.communication_style,
      ...(overrides.communication_style ?? {}),
    },
    generation_constraints: {
      ...base.generation_constraints,
      ...(overrides.generation_constraints ?? {}),
    },
  }
}

function candidateFor(
  messagePlan,
  text = 'O plano inclui suporte por WhatsApp.',
  overrides = {},
) {
  return {
    contract_version: 'message-candidate-v1',
    candidate_id: 'candidate-a',
    text,
    generation_mode: 'deterministic-template-v1',
    commercial_move: messagePlan.commercial_move.move,
    commercial_objective: messagePlan.commercial_objective,
    content_requirements_covered: [
      ...messagePlan.content_requirements,
    ],
    fact_requirements_used:
      messagePlan.fact_requirements
        .filter(item => item.assertion_policy === 'may_assert')
        .map(item => item.requirement_key),
    question_count: (text.match(/\?/gu) ?? []).length,
    evidence: {
      message_ids: [],
      memory_ids: [],
    },
    provenance: [],
    ...overrides,
  }
}

function generation(messagePlan, candidates) {
  return {
    contract_version: 'candidate-generation-result-v1',
    status:
      messagePlan.status === 'needs_information'
        ? 'needs_information'
        : 'generated',
    plan_status: messagePlan.status,
    commercial_move: messagePlan.commercial_move.move,
    commercial_objective: messagePlan.commercial_objective,
    generation_allowed: true,
    candidates,
    limitations: [],
    reason: 'fixture',
  }
}

function hardGate(
  candidates,
  passedIds = candidates.map(item => item.candidate_id),
  status,
) {
  const passed = new Set(passedIds)
  const resolvedStatus = status ?? (
    passedIds.length === 0
      ? 'all_failed'
      : passedIds.length === candidates.length
        ? 'all_passed'
        : 'partially_passed'
  )

  return {
    contract_version: 'hard-gate-v1',
    status: resolvedStatus,
    candidates: candidates.map(item => ({
      candidate_id: item.candidate_id,
      status: passed.has(item.candidate_id) ? 'pass' : 'fail',
      violations: passed.has(item.candidate_id) ? [] : [{ code: 'TEST_FAIL' }],
    })),
    passed_candidate_ids: [...passedIds],
    failed_candidate_ids: candidates
      .filter(item => !passed.has(item.candidate_id))
      .map(item => item.candidate_id),
    violations: [],
  }
}

function evaluate(
  messagePlan,
  candidates = [candidateFor(messagePlan)],
  passedIds = candidates.map(item => item.candidate_id),
  hardStatus,
) {
  return critiqueMessageCandidatesV1({
    message_plan: messagePlan,
    generation_result: generation(messagePlan, candidates),
    hard_gate_result: hardGate(candidates, passedIds, hardStatus),
  })
}

function critique(result, id = 'candidate-a') {
  return result.critiques.find(item => item.candidate_id === id)
}

function issueCodes(result, id = 'candidate-a') {
  return critique(result, id)?.issues.map(item => item.code) ?? []
}

function objectionPlan(overrides = {}) {
  return plan({
    situation: { situation: 'objection' },
    commercial_objective: 'address_objection',
    response_mode: 'reframe',
    commercial_move: { move: 'resolve_objection' },
    content_requirements: [
      'acknowledge_customer_point',
      'address_objection',
    ],
    fact_requirements: [],
    next_step_plan: {
      kind: 'answer_and_wait',
      commercial_move: 'resolve_objection',
    },
    ...overrides,
  })
}

test('1. candidate boa → recommended', () => {
  const p = plan()
  const result = evaluate(p)
  assert.equal(critique(result).status, 'recommended')
})

test('2. candidate aceitável → acceptable', () => {
  const p = objectionPlan({
    communication_style: { target_length: 'short', directness: 'direct' },
  })
  const c = candidateFor(
    p,
    'Entendi seu ponto. Esse ponto merece ser separado antes de qualquer decisão. Temos uma solução que pode fazer sentido para você e podemos conversar melhor sobre o que está pesando.',
    { fact_requirements_used: [] },
  )
  const result = evaluate(p, [c])
  assert.equal(critique(result).status, 'acceptable')
})

test('3. candidate artificial → weak', () => {
  const p = objectionPlan()
  const c = candidateFor(
    p,
    'Entendo perfeitamente sua colocação. Compreendo seu ponto e gostaria de esclarecer. Temos uma solução que pode fazer sentido para você. Fico à disposição para quaisquer esclarecimentos.',
    { fact_requirements_used: [] },
  )
  const result = evaluate(p, [c])
  assert.equal(critique(result).status, 'weak')
})

test('4. candidate genérica → specificity reduzida', () => {
  const p = objectionPlan()
  const generic = candidateFor(
    p,
    'Entendi. Temos uma solução que pode fazer sentido para você. Podemos conversar melhor?',
    { fact_requirements_used: [] },
  )
  const result = evaluate(p, [generic])
  assert.ok(critique(result).dimensions.specificity < 65)
  assert.ok(issueCodes(result).includes('GENERIC_RESPONSE'))
})

test('5. candidate contextual → specificity maior', () => {
  const p = objectionPlan()
  const generic = candidateFor(p, 'Entendi. Temos uma solução que pode fazer sentido para você. Podemos conversar melhor?', {
    candidate_id: 'generic', fact_requirements_used: [],
  })
  const contextual = candidateFor(p, 'Entendi seu ponto. O que está pesando mais nessa percepção antes de você decidir?', {
    candidate_id: 'contextual', fact_requirements_used: [], question_count: 1,
  })
  const result = evaluate(p, [generic, contextual])
  assert.ok(
    critique(result, 'contextual').dimensions.specificity >
    critique(result, 'generic').dimensions.specificity,
  )
})

test('6. mesma intenção + contextos diferentes preservam qualidade específica', () => {
  const a = plan({
    fact_requirements: [knownFact('product.pricing', 'O valor depende de cotação.')],
    content_requirements: ['answer_requested_information', 'explain_quote_requirement'],
  })
  const b = plan({
    situation: { situation: 'comparison' },
    commercial_objective: 'confirm_decision_criteria',
    commercial_move: { move: 'compare_on_criteria' },
    fact_requirements: [knownFact('product.allowed_claims', 'O suporte está incluído.')],
    content_requirements: ['surface_verified_difference', 'confirm_decision_criterion'],
  })
  const ca = candidateFor(a, 'O valor depende de cotação e precisa ser confirmado para este caso.', {
    fact_requirements_used: ['product.pricing'],
  })
  const cb = candidateFor(b, 'O suporte está incluído. Vou considerar o ponto que você indicou como mais importante na escolha.', {
    fact_requirements_used: ['product.allowed_claims'],
  })
  assert.ok(critique(evaluate(a, [ca])).dimensions.specificity >= 80)
  assert.ok(critique(evaluate(b, [cb])).dimensions.specificity >= 80)
})

test('7. Scenario 20 penaliza opção intercambiável e preserva opções contextuais', () => {
  const a = plan({
    fact_requirements: [knownFact('product.pricing', 'O valor depende de cotação.')],
    content_requirements: ['answer_requested_information', 'explain_quote_requirement'],
  })
  const b = plan({
    situation: { situation: 'comparison' },
    commercial_objective: 'confirm_decision_criteria',
    commercial_move: { move: 'compare_on_criteria' },
    fact_requirements: [],
    content_requirements: ['confirm_decision_criterion'],
  })
  const genericA = candidateFor(a, 'Entendi. Temos uma solução que pode fazer sentido para você. Podemos conversar melhor?', { fact_requirements_used: [] })
  const genericB = candidateFor(b, genericA.text, { fact_requirements_used: [] })
  const tailoredA = candidateFor(a, 'O valor depende de cotação e precisa ser confirmado para este caso.', { fact_requirements_used: ['product.pricing'] })
  const tailoredB = candidateFor(b, 'Vou considerar o ponto que você indicou como mais importante na escolha.', { fact_requirements_used: [] })
  assert.ok(critique(evaluate(a, [tailoredA])).dimensions.specificity > critique(evaluate(a, [genericA])).dimensions.specificity)
  assert.ok(critique(evaluate(b, [tailoredB])).dimensions.specificity > critique(evaluate(b, [genericB])).dimensions.specificity)
  assert.notEqual(tailoredA.text, tailoredB.text)
})

test('8. boilerplate excessivo reduz naturalness', () => {
  const p = plan()
  const c = candidateFor(p, 'Espero que esteja bem. O plano inclui suporte por WhatsApp. Fico à disposição para quaisquer esclarecimentos.')
  const result = evaluate(p, [c])
  assert.ok(critique(result).dimensions.naturalness < 80)
  assert.ok(issueCodes(result).includes('BOILERPLATE_DOMINATES'))
})

test('9. mensagem robótica é penalizada', () => {
  const p = plan()
  const c = candidateFor(p, 'Entendo perfeitamente sua colocação. Conforme mencionado anteriormente, o plano inclui suporte por WhatsApp.')
  const result = evaluate(p, [c])
  assert.ok(issueCodes(result).includes('ROBOTIC_LANGUAGE'))
})

test('10. linguagem natural recebe naturalness alta', () => {
  const result = evaluate(plan())
  assert.ok(critique(result).dimensions.naturalness >= 88)
})

test('11. repetição é penalizada', () => {
  const p = objectionPlan()
  const c = candidateFor(p, 'Entendi seu ponto. Entendo o que está pesando. Compreendo essa dúvida.', { fact_requirements_used: [] })
  const result = evaluate(p, [c])
  assert.ok(issueCodes(result).includes('REPETITIVE_LANGUAGE'))
})

test('12. clareza cai com frase excessivamente complexa', () => {
  const p = plan({ communication_style: { target_length: 'long' } })
  const long = 'O plano inclui suporte por WhatsApp e, considerando que você precisa avaliar diferentes pontos antes de tomar uma decisão e que existem aspectos que podem variar conforme o uso e conforme a necessidade de cada cenário específico, vale organizar tudo com cuidado para que a leitura permaneça suficientemente completa sem deixar nenhum aspecto relevante de fora.'
  const result = evaluate(p, [candidateFor(p, long)])
  assert.ok(critique(result).dimensions.clarity < 80)
})

test('13. target short respeitado', () => {
  const p = plan({ communication_style: { target_length: 'short' } })
  const result = evaluate(p)
  assert.ok(critique(result).dimensions.concision >= 90)
})

test('14. target short violado', () => {
  const p = plan({ communication_style: { target_length: 'short' } })
  const text = 'O plano inclui suporte por WhatsApp. ' + Array.from({ length: 65 }, () => 'detalhe').join(' ')
  const result = evaluate(p, [candidateFor(p, text)])
  assert.ok(critique(result).dimensions.concision < 60)
  assert.ok(issueCodes(result).includes('OVERLONG_FOR_TARGET'))
})

test('15. target long não penaliza conteúdo desenvolvido', () => {
  const p = plan({ communication_style: { target_length: 'long' } })
  const text = 'O plano inclui suporte por WhatsApp. Esse suporte acompanha o uso para que a informação fique clara durante a operação e para que você tenha uma referência objetiva ao avaliar o que está incluído.'
  const result = evaluate(p, [candidateFor(p, text)])
  assert.ok(critique(result).dimensions.concision >= 90)
})

test('16. direct respeitado', () => {
  const p = plan({ communication_style: { directness: 'direct' } })
  const result = evaluate(p)
  assert.ok(critique(result).dimensions.communication_fit >= 90)
})

test('17. direct com rodeio excessivo', () => {
  const p = plan({ communication_style: { directness: 'direct' } })
  const c = candidateFor(p, 'Espero que esteja bem. Agradeço o contato. O plano inclui suporte por WhatsApp. Fico à disposição.')
  const result = evaluate(p, [c])
  assert.ok(critique(result).dimensions.communication_fit < 80)
  assert.ok(issueCodes(result).includes('INDIRECT_FOR_DIRECT_STYLE'))
})

test('18. formalidade alinhada', () => {
  const p = plan({ communication_style: { formality: 'formal' } })
  const c = candidateFor(p, 'O plano inclui suporte por WhatsApp. Permaneço à disposição caso precise confirmar algum ponto.')
  const result = evaluate(p, [c])
  assert.ok(critique(result).dimensions.communication_fit >= 90)
})

test('19. ausência de informação de voz não gera invenção nem penalidade', () => {
  const p = plan({ communication_style: {
    greeting_policy: 'preserve_seller',
    closing_policy: 'preserve_seller',
    emoji_policy: 'preserve',
  } })
  const result = evaluate(p)
  assert.ok(critique(result).dimensions.communication_fit >= 90)
  assert.equal(issueCodes(result).includes('FORMALITY_MISMATCH'), false)
})

test('20. question quality boa', () => {
  const p = objectionPlan({
    response_mode: 'ask',
    commercial_move: { move: 'isolate_objection' },
    question_plan: {
      should_ask: true,
      purpose: 'isolate_objection',
      max_questions: 1,
      question_type: 'objection_clarification',
      required_information: ['objection_driver'],
    },
    next_step_plan: { kind: 'ask', commercial_move: 'isolate_objection' },
  })
  const c = candidateFor(p, 'Entendi seu ponto. O que está pesando mais nessa percepção?', { fact_requirements_used: [] })
  const result = evaluate(p, [c])
  assert.ok(critique(result).dimensions.question_quality >= 90)
})

test('21. pergunta vaga', () => {
  const p = objectionPlan({
    response_mode: 'ask',
    commercial_move: { move: 'isolate_objection' },
    question_plan: { should_ask: true, purpose: 'isolate_objection', max_questions: 1 },
    next_step_plan: { kind: 'ask', commercial_move: 'isolate_objection' },
  })
  const c = candidateFor(p, 'Entendi seu ponto. O que você acha?', { fact_requirements_used: [] })
  const result = evaluate(p, [c])
  assert.ok(critique(result).dimensions.question_quality < 70)
  assert.ok(issueCodes(result).includes('VAGUE_QUESTION'))
})

test('22. pergunta desalinhada com QuestionPlan', () => {
  const p = plan({
    response_mode: 'ask',
    commercial_move: { move: 'confirm_decision_criteria' },
    content_requirements: ['confirm_decision_criterion'],
    fact_requirements: [],
    question_plan: { should_ask: true, purpose: 'confirm_decision_criterion', max_questions: 1, required_information: ['decision_criteria'] },
    next_step_plan: { kind: 'ask', commercial_move: 'confirm_decision_criteria' },
  })
  const c = candidateFor(p, 'Qual é o seu nome?', { fact_requirements_used: [] })
  const result = evaluate(p, [c])
  assert.ok(issueCodes(result).includes('QUESTION_PURPOSE_MISMATCH'))
})

test('23. no-question scenario é not applicable', () => {
  const result = evaluate(plan())
  assert.equal(critique(result).dimensions.question_quality, null)
})

test('24. CTA adequado', () => {
  const p = plan({
    commercial_objective: 'secure_next_step',
    response_mode: 'advance',
    commercial_move: { move: 'propose_next_step' },
    content_requirements: ['propose_next_step'],
    fact_requirements: [],
    next_step_plan: { kind: 'propose_next_step', commercial_move: 'propose_next_step', requires_customer_action: true },
  })
  const c = candidateFor(p, 'Se fizer sentido, podemos seguir para a próxima etapa.', { fact_requirements_used: [] })
  const result = evaluate(p, [c])
  assert.ok(critique(result).dimensions.next_step_fit >= 88)
})

test('25. CTA genérico', () => {
  const p = plan({
    commercial_objective: 'secure_next_step',
    response_mode: 'advance',
    commercial_move: { move: 'propose_next_step' },
    content_requirements: ['propose_next_step'],
    fact_requirements: [],
    next_step_plan: { kind: 'propose_next_step', commercial_move: 'propose_next_step', requires_customer_action: true },
  })
  const c = candidateFor(p, 'Vamos avançar?', { fact_requirements_used: [] })
  const result = evaluate(p, [c])
  assert.ok(critique(result).dimensions.next_step_fit < 75)
  assert.ok(issueCodes(result).includes('GENERIC_NEXT_STEP'))
})

test('26. next step none é not applicable', () => {
  const p = plan({ next_step_plan: { kind: 'none' } })
  const result = evaluate(p)
  assert.equal(critique(result).dimensions.next_step_fit, null)
})

test('27. objection bem tratada', () => {
  const p = objectionPlan()
  const c = candidateFor(p, 'Entendi seu ponto. Vale separar exatamente o que está pesando antes de decidir.', { fact_requirements_used: [] })
  const result = evaluate(p, [c])
  assert.ok(critique(result).dimensions.commercial_coherence >= 88)
})

test('28. objection com pitch genérico', () => {
  const p = objectionPlan()
  const c = candidateFor(p, 'Entendi seu ponto. Temos uma solução que pode fazer sentido para você.', { fact_requirements_used: [] })
  const result = evaluate(p, [c])
  assert.ok(issueCodes(result).includes('GENERIC_OBJECTION_HANDLING'))
  assert.ok(critique(result).dimensions.commercial_coherence < 85)
})

test('29. postponement natural', () => {
  const p = plan({
    situation: { situation: 'postponement' },
    commercial_objective: 'respect_timing',
    response_mode: 'wait',
    commercial_move: { move: 'respect_customer_timing' },
    content_requirements: ['respect_customer_timing'],
    fact_requirements: [],
    next_step_plan: { kind: 'respect_timing', commercial_move: 'respect_customer_timing' },
  })
  const c = candidateFor(p, 'Sem problema, respeito seu tempo. Fique à vontade para avaliar com calma.', { fact_requirements_used: [] })
  const result = evaluate(p, [c])
  assert.ok(critique(result).dimensions.next_step_fit >= 88)
  assert.ok(critique(result).dimensions.naturalness >= 88)
})

test('30. rejection natural', () => {
  const p = plan({
    situation: { situation: 'rejection' },
    commercial_objective: 'stop_pursuit',
    response_mode: 'stop',
    commercial_move: { move: 'close_conversation' },
    content_requirements: ['close_without_pressure'],
    fact_requirements: [],
    next_step_plan: { kind: 'close', commercial_move: 'close_conversation' },
  })
  const c = candidateFor(p, 'Obrigado pelo retorno. Tudo certo.', { fact_requirements_used: [] })
  const result = evaluate(p, [c])
  assert.ok(critique(result).dimensions.next_step_fit >= 88)
  assert.equal(critique(result).status, 'recommended')
})

test('31. non-commercial não é penalizado por não vender', () => {
  const p = plan({
    situation: { situation: 'non_commercial' },
    commercial_objective: 'no_commercial_action',
    response_mode: 'acknowledge',
    commercial_move: { move: 'no_commercial_move' },
    content_requirements: ['acknowledge_non_commercial'],
    fact_requirements: [],
    next_step_plan: { kind: 'none', commercial_move: 'no_commercial_move' },
  })
  const c = candidateFor(p, 'Certo, entendi.', { fact_requirements_used: [] })
  const result = evaluate(p, [c])
  assert.ok(critique(result).dimensions.commercial_coherence >= 88)
  assert.ok(critique(result).overall_score >= 80)
})

test('32. Hard Gate FAIL não entra na avaliação', () => {
  const p = plan()
  const pass = candidateFor(p, undefined, { candidate_id: 'pass' })
  const fail = candidateFor(p, 'O plano inclui suporte por WhatsApp. Uma resposta excelente.', { candidate_id: 'fail' })
  const result = evaluate(p, [pass, fail], ['pass'], 'partially_passed')
  assert.deepEqual(result.critiques.map(item => item.candidate_id), ['pass'])
  assert.equal(result.ranked_candidate_ids.includes('fail'), false)
})

test('33. Hard Gate PASS entra', () => {
  const p = plan()
  const c = candidateFor(p)
  const result = evaluate(p, [c], ['candidate-a'])
  assert.equal(result.critiques.length, 1)
})

test('34. partially_passed avalia apenas IDs PASS', () => {
  const p = plan()
  const a = candidateFor(p, undefined, { candidate_id: 'a' })
  const b = candidateFor(p, undefined, { candidate_id: 'b' })
  const c = candidateFor(p, undefined, { candidate_id: 'c' })
  const result = evaluate(p, [a, b, c], ['a', 'c'], 'partially_passed')
  assert.deepEqual(result.critiques.map(item => item.candidate_id), ['a', 'c'])
})

test('35. blocked terminal', () => {
  const p = plan({ status: 'blocked' })
  const result = critiqueMessageCandidatesV1({
    message_plan: p,
    generation_result: generation(p, []),
    hard_gate_result: hardGate([], [], 'blocked'),
  })
  assert.equal(result.status, 'blocked')
  assert.equal(result.critiques.length, 0)
})

test('36. approval terminal', () => {
  const p = plan({ status: 'approval_required' })
  const result = critiqueMessageCandidatesV1({
    message_plan: p,
    generation_result: generation(p, []),
    hard_gate_result: hardGate([], [], 'approval_required'),
  })
  assert.equal(result.status, 'approval_required')
})

test('37. zero eligible candidates', () => {
  const p = plan()
  const c = candidateFor(p)
  const result = evaluate(p, [c], [], 'all_failed')
  assert.equal(result.status, 'no_eligible_candidates')
  assert.deepEqual(result.ranked_candidate_ids, [])
})

test('38. ranking determinístico', () => {
  const p = objectionPlan()
  const strong = candidateFor(p, 'Entendi seu ponto. Vale separar exatamente o que está pesando antes de decidir.', { candidate_id: 'strong', fact_requirements_used: [] })
  const weak = candidateFor(p, 'Entendi. Temos uma solução que pode fazer sentido para você. Podemos conversar melhor?', { candidate_id: 'weak', fact_requirements_used: [] })
  const result = evaluate(p, [weak, strong])
  assert.deepEqual(result.ranked_candidate_ids, ['strong', 'weak'])
})

test('39. empate determinístico usa candidate_id', () => {
  const p = plan()
  const b = candidateFor(p, undefined, { candidate_id: 'candidate-b' })
  const a = candidateFor(p, undefined, { candidate_id: 'candidate-a' })
  const result = evaluate(p, [b, a])
  assert.deepEqual(result.ranked_candidate_ids, ['candidate-a', 'candidate-b'])
})

test('40. mesmo input → mesmo resultado', () => {
  const p = plan()
  const candidates = [candidateFor(p)]
  const input = {
    message_plan: p,
    generation_result: generation(p, candidates),
    hard_gate_result: hardGate(candidates),
  }
  assert.deepEqual(
    critiqueMessageCandidatesV1(input),
    critiqueMessageCandidatesV1(input),
  )
})

test('41. não altera candidate text', () => {
  const p = plan()
  const candidates = [candidateFor(p)]
  const input = {
    message_plan: p,
    generation_result: generation(p, candidates),
    hard_gate_result: hardGate(candidates),
  }
  const before = structuredClone(input)
  critiqueMessageCandidatesV1(input)
  assert.deepEqual(input, before)
})

test('42. não gera candidate', () => {
  const p = plan()
  const result = evaluate(p)
  assert.equal('candidates' in result, false)
  assert.equal(result.critiques.length, 1)
})

test('43. não produz Final Message', () => {
  const result = evaluate(plan())
  const raw = JSON.stringify(result).toLowerCase()
  assert.equal(raw.includes('final_message'), false)
  assert.equal(raw.includes('finalmessage'), false)
})

test('44. não possui selected_candidate_id', () => {
  const result = evaluate(plan())
  assert.equal('selected_candidate_id' in result, false)
  assert.equal('winner' in result, false)
})

test('45. não usa LLM/network/random/time', () => {
  const source = readFileSync(new URL('./commercial-naturalness-critic.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\bfetch\s*\(|openai|anthropic|chat\.completions|responses\.create|generateText/iu)
  assert.doesNotMatch(source, /Math\.random|Date\.now|randomUUID/iu)
})

test('46. score fica dentro de 0–100', () => {
  const p = objectionPlan()
  const candidates = [
    candidateFor(p, 'Entendi seu ponto. Vale entender o que está pesando.', { candidate_id: 'a', fact_requirements_used: [] }),
    candidateFor(p, 'Entendo perfeitamente sua colocação. Temos uma solução robusta que pode fazer sentido para você.', { candidate_id: 'b', fact_requirements_used: [] }),
  ]
  const result = evaluate(p, candidates)
  for (const item of result.critiques) {
    assert.ok(item.overall_score >= 0 && item.overall_score <= 100)
    for (const score of Object.values(item.dimensions)) {
      assert.ok(score === null || (score >= 0 && score <= 100))
    }
  }
})

test('47. thresholds são explícitos', () => {
  assert.deepEqual(CRITIC_THRESHOLDS, { recommended: 80, acceptable: 65 })
})

test('48. recommended IDs', () => {
  const p = plan()
  const result = evaluate(p)
  assert.deepEqual(result.recommended_candidate_ids, ['candidate-a'])
})

test('49. acceptable IDs', () => {
  const p = objectionPlan({ communication_style: { target_length: 'short', directness: 'direct' } })
  const c = candidateFor(p, 'Entendi seu ponto. Esse ponto merece ser separado antes de qualquer decisão. Temos uma solução que pode fazer sentido para você e podemos conversar melhor sobre o que está pesando.', { candidate_id: 'acceptable', fact_requirements_used: [] })
  const result = evaluate(p, [c])
  assert.deepEqual(result.acceptable_candidate_ids, ['acceptable'])
})

test('50. weak IDs', () => {
  const p = objectionPlan()
  const c = candidateFor(p, 'Entendo perfeitamente sua colocação. Compreendo seu ponto e gostaria de esclarecer. Temos uma solução que pode fazer sentido para você. Fico à disposição para quaisquer esclarecimentos.', { candidate_id: 'weak', fact_requirements_used: [] })
  const result = evaluate(p, [c])
  assert.deepEqual(result.weak_candidate_ids, ['weak'])
})

test('51. pesos documentados somam 100', () => {
  assert.equal(Object.values(CRITIC_DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0), 100)
  assert.equal(CRITIC_DIMENSION_WEIGHTS.commercial_coherence, 25)
  assert.equal(CRITIC_DIMENSION_WEIGHTS.naturalness, 20)
  assert.equal(CRITIC_DIMENSION_WEIGHTS.specificity, 20)
})

test('52. dimensão não aplicável é retirada da média sem zerar score', () => {
  const result = evaluate(plan())
  const item = critique(result)
  assert.equal(item.dimensions.question_quality, null)
  assert.equal(item.dimensions.next_step_fit, null)
  assert.ok(item.overall_score >= 80)
})

test('53. pergunta sobre critério conhecido e específica supera pergunta vaga', () => {
  const p = plan({
    commercial_objective: 'confirm_decision_criteria',
    response_mode: 'ask',
    commercial_move: { move: 'confirm_decision_criteria' },
    content_requirements: ['confirm_decision_criterion'],
    fact_requirements: [],
    question_plan: { should_ask: true, purpose: 'confirm_decision_criterion', max_questions: 1, required_information: ['decision_criteria'] },
    next_step_plan: { kind: 'ask', commercial_move: 'confirm_decision_criteria' },
  })
  const specific = candidateFor(p, 'O que pesa mais para você nessa escolha?', { candidate_id: 'specific', fact_requirements_used: [] })
  const vague = candidateFor(p, 'O que você acha?', { candidate_id: 'vague', fact_requirements_used: [] })
  const result = evaluate(p, [vague, specific])
  assert.ok(critique(result, 'specific').dimensions.question_quality > critique(result, 'vague').dimensions.question_quality)
})

test('54. formalidade informal clara é penalizada em plano formal', () => {
  const p = plan({ communication_style: { formality: 'formal' } })
  const c = candidateFor(p, 'Beleza, o plano inclui suporte por WhatsApp pra você.')
  const result = evaluate(p, [c])
  assert.ok(issueCodes(result).includes('FORMALITY_MISMATCH'))
})

test('55. exports não incluem winner/final/selected nem geração', () => {
  const exports = Object.keys(CriticModule)
  assert.equal(exports.some(name => /winner|final|selected|generate|rewrite|polish|sanitize/i.test(name)), false)
  assert.ok(exports.includes('createCommercialNaturalnessCriticV1'))
  assert.ok(exports.includes('critiqueMessageCandidatesV1'))
})

test('56. acknowledgement isolado não conta como tratamento completo de objeção', () => {
  const p = objectionPlan()

  const c = candidateFor(
    p,
    'Entendi seu ponto.',
    {
      fact_requirements_used: [],
    },
  )

  const result = evaluate(p, [c])
  const evaluated = critique(result)

  assert.ok(
    evaluated.dimensions.commercial_coherence < 80,
  )

  assert.ok(
    issueCodes(result).includes(
      'WEAK_COMMERCIAL_EXECUTION',
    ),
  )

  assert.notEqual(
    evaluated.status,
    'recommended',
  )
})

test('57. mera menção temática não conta como resposta factual', () => {
  const p = plan()

  const c = candidateFor(
    p,
    'Sobre o valor, posso te explicar.',
    {
      fact_requirements_used: [],
    },
  )

  const result = evaluate(p, [c])
  const evaluated = critique(result)

  assert.ok(
    evaluated.dimensions.commercial_coherence < 80,
  )

  assert.ok(
    evaluated.dimensions.specificity < 80,
  )
})
