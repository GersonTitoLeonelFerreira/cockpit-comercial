import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  runHardGatesV1,
} from './hard-gates.ts'

import * as HardGatesModule from './hard-gates.ts'

const TRACE = {
  source_type: 'commercial_fact',
  source_id: 'fact-1',
  source_version: 'commercial-fact-v2',
  observed_at: '2026-08-31T18:00:00.000Z',
  evidence_message_ids: ['m1'],
  evidence_memory_ids: ['mem1'],
}

const OTHER_TRACE = {
  source_type: 'commercial_fact',
  source_id: 'fact-other',
  source_version: 'commercial-fact-v2',
  observed_at: '2026-08-31T18:00:00.000Z',
  evidence_message_ids: ['m999'],
  evidence_memory_ids: ['mem999'],
}

const knownFact = (
  key = 'fact.support_hours',
  value = 'Atendimento em horário comercial.',
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
  provenance: [TRACE],
})

const basePlan = overrides => ({
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
    reason: 'Plano definido.',
    source: 'strategy_default',
    requested_move: null,
  },
  method_alignment: {},
  governance_status: 'allowed',
  technique: {
    framework_reference: 'Yolen-native',
  },
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
  communication_style: {},
  evidence: {
    message_ids: ['m1'],
    memory_ids: ['mem1'],
  },
  provenance: [TRACE],
  generation_constraints: {
    generation_allowed: true,
    items: [],
  },
  ...overrides,
})

const baseCandidate = overrides => ({
  contract_version: 'message-candidate-v1',
  candidate_id: 'candidate-1',
  text: 'Atendimento em horário comercial.',
  generation_mode: 'deterministic-template-v1',
  commercial_move: 'answer_directly',
  commercial_objective: 'answer_factually',
  content_requirements_covered: ['answer_requested_information'],
  fact_requirements_used: ['fact.support_hours'],
  question_count: 0,
  evidence: {
    message_ids: ['m1'],
    memory_ids: ['mem1'],
  },
  provenance: [TRACE],
  ...overrides,
})

const generation = (plan, candidates = [baseCandidate()], overrides = {}) => ({
  contract_version: 'candidate-generation-result-v1',
  status:
    plan.status === 'blocked'
      ? 'blocked'
      : plan.status === 'approval_required'
        ? 'approval_required'
        : plan.status === 'needs_information'
          ? 'needs_information'
          : candidates.length > 0
            ? 'generated'
            : 'not_generated',
  plan_status: plan.status,
  commercial_move: plan.commercial_move.move,
  commercial_objective: plan.commercial_objective,
  generation_allowed: plan.generation_constraints.generation_allowed,
  candidates,
  limitations: [],
  reason: 'fixture',
  ...overrides,
})

const evaluate = (plan, result = generation(plan)) =>
  runHardGatesV1({
    message_plan: plan,
    generation_result: result,
  })

const codes = result => result.violations.map(item => item.code)
const candidateCodes = result => result.candidates.flatMap(item => item.violations.map(v => v.code))

const noFactPlan = overrides => basePlan({
  content_requirements: [],
  fact_requirements: [],
  evidence: { message_ids: [], memory_ids: [] },
  provenance: [],
  ...overrides,
})

const noFactCandidate = overrides => baseCandidate({
  text: 'Certo.',
  content_requirements_covered: [],
  fact_requirements_used: [],
  evidence: { message_ids: [], memory_ids: [] },
  provenance: [],
  ...overrides,
})

const quotePlan = () => basePlan({
  status: 'ready_with_constraints',
  content_requirements: [
    'answer_requested_information',
    'explain_quote_requirement',
  ],
  fact_requirements: [{
    ...knownFact('product.pricing', {
      model: 'quote_required',
      amount: null,
      currency: 'BRL',
      amount_qualifier: null,
      recurrence: null,
      installment_count: null,
      installment_amount_basis: null,
      note: null,
    }),
    assertion_policy: 'describe_constraint_only',
    gap_impact: 'soft',
  }],
})

const quoteCandidate = text => baseCandidate({
  text,
  content_requirements_covered: [
    'answer_requested_information',
    'explain_quote_requirement',
  ],
  fact_requirements_used: ['product.pricing'],
})

test('1. candidate válido PASS', () => {
  const result = evaluate(basePlan())
  assert.equal(result.status, 'all_passed')
  assert.deepEqual(result.passed_candidate_ids, ['candidate-1'])
  assert.deepEqual(result.failed_candidate_ids, [])
})

test('2. blocked sem candidates é terminal válido', () => {
  const plan = basePlan({
    status: 'blocked',
    generation_constraints: { generation_allowed: false, items: [] },
  })
  const result = evaluate(plan, generation(plan, []))
  assert.equal(result.status, 'blocked')
  assert.equal(result.violations.length, 0)
})

test('3. blocked com candidate FAIL crítico', () => {
  const plan = basePlan({
    status: 'blocked',
    generation_constraints: { generation_allowed: false, items: [] },
  })
  const result = evaluate(plan, generation(plan, [baseCandidate()]))
  assert.equal(result.status, 'all_failed')
  assert.ok(candidateCodes(result).includes('GOVERNANCE_BLOCKED_CANDIDATE'))
})

test('4. approval sem candidates é terminal válido', () => {
  const plan = basePlan({
    status: 'approval_required',
    generation_constraints: { generation_allowed: false, items: [] },
  })
  const result = evaluate(plan, generation(plan, []))
  assert.equal(result.status, 'approval_required')
  assert.equal(result.violations.length, 0)
})

test('5. approval com candidate FAIL', () => {
  const plan = basePlan({
    status: 'approval_required',
    generation_constraints: { generation_allowed: false, items: [] },
  })
  const result = evaluate(plan, generation(plan, [baseCandidate()]))
  assert.ok(candidateCodes(result).includes('APPROVAL_REQUIRED_CANDIDATE'))
})

test('6. generation_allowed false + candidate FAIL', () => {
  const plan = basePlan({
    generation_constraints: { generation_allowed: false, items: [] },
  })
  const result = evaluate(plan, generation(plan, [baseCandidate()], {
    generation_allowed: false,
  }))
  assert.ok(candidateCodes(result).includes('GENERATION_NOT_ALLOWED_CANDIDATE'))
})

test('7. generation result blocked + candidate é inconsistente', () => {
  const plan = basePlan()
  const result = evaluate(plan, generation(plan, [baseCandidate()], {
    status: 'blocked',
    generation_allowed: false,
  }))
  assert.ok(codes(result).includes('GENERATION_STATUS_CANDIDATE_CONFLICT'))
  assert.ok(codes(result).includes('GENERATION_STATUS_PLAN_CONFLICT'))
})

test('8. commercial move mismatch', () => {
  const result = evaluate(basePlan(), generation(basePlan(), [baseCandidate({
    commercial_move: 'close_conversation',
  })]))
  assert.ok(candidateCodes(result).includes('COMMERCIAL_MOVE_MISMATCH'))
})

test('9. commercial objective mismatch', () => {
  const plan = basePlan()
  const result = evaluate(plan, generation(plan, [baseCandidate({
    commercial_objective: 'stop_pursuit',
  })]))
  assert.ok(candidateCodes(result).includes('COMMERCIAL_OBJECTIVE_MISMATCH'))
})

test('10. max_questions 0', () => {
  const plan = noFactPlan()
  const candidate = noFactCandidate({ text: 'Posso confirmar isso?', question_count: 1 })
  const result = evaluate(plan, generation(plan, [candidate]))
  assert.ok(candidateCodes(result).includes('QUESTION_LIMIT_EXCEEDED'))
})

test('11. max_questions 1 excedido', () => {
  const plan = noFactPlan({
    question_plan: {
      should_ask: true,
      max_questions: 1,
    },
    next_step_plan: { kind: 'ask' },
  })
  const candidate = noFactCandidate({
    text: 'Qual o ponto? E qual o prazo?',
    question_count: 2,
  })
  const result = evaluate(plan, generation(plan, [candidate]))
  assert.ok(candidateCodes(result).includes('QUESTION_LIMIT_EXCEEDED'))
})

test('12. question_count metadata inconsistente', () => {
  const plan = noFactPlan({
    question_plan: { should_ask: true, max_questions: 1 },
    next_step_plan: { kind: 'ask' },
  })
  const candidate = noFactCandidate({ text: 'Qual o ponto?', question_count: 0 })
  const result = evaluate(plan, generation(plan, [candidate]))
  assert.ok(candidateCodes(result).includes('QUESTION_COUNT_MISMATCH'))
})

test('13. should_ask=false com pergunta', () => {
  const plan = noFactPlan()
  const candidate = noFactCandidate({ text: 'Tudo certo?', question_count: 1 })
  const result = evaluate(plan, generation(plan, [candidate]))
  assert.ok(candidateCodes(result).includes('SHOULD_NOT_ASK_HAS_QUESTION'))
})

test('14. requirement faltando em coverage', () => {
  const plan = basePlan()
  const candidate = baseCandidate({ content_requirements_covered: [] })
  const result = evaluate(plan, generation(plan, [candidate]))
  assert.ok(candidateCodes(result).includes('CONTENT_REQUIREMENT_MISSING'))
})

test('15. coverage extra não autorizada', () => {
  const plan = basePlan()
  const candidate = baseCandidate({
    content_requirements_covered: ['answer_requested_information', 'propose_next_step'],
  })
  const result = evaluate(plan, generation(plan, [candidate]))
  assert.ok(candidateCodes(result).includes('CONTENT_REQUIREMENT_EXTRA'))
})

test('16. fact requirement inexistente', () => {
  const plan = noFactPlan()
  const candidate = noFactCandidate({ fact_requirements_used: ['fact.ghost'] })
  const result = evaluate(plan, generation(plan, [candidate]))
  assert.ok(candidateCodes(result).includes('FACT_REQUIREMENT_UNKNOWN'))
})

test('17. must_not_assert referenciado', () => {
  const plan = noFactPlan({
    fact_requirements: [{
      ...knownFact('fact.secret', 'Prazo interno de 30 dias.'),
      assertion_policy: 'must_not_assert',
      necessity: 'supporting',
    }],
  })
  const candidate = noFactCandidate({ fact_requirements_used: ['fact.secret'] })
  const result = evaluate(plan, generation(plan, [candidate]))
  assert.ok(candidateCodes(result).includes('MUST_NOT_ASSERT_REFERENCED'))
})

test('18. forbidden fact referenciado', () => {
  const plan = noFactPlan({
    fact_requirements: [{
      ...knownFact('fact.forbidden', 'Promessa proibida.'),
      status: 'forbidden',
      assertion_policy: 'must_not_assert',
      necessity: 'supporting',
    }],
  })
  const candidate = noFactCandidate({ fact_requirements_used: ['fact.forbidden'] })
  const result = evaluate(plan, generation(plan, [candidate]))
  assert.ok(candidateCodes(result).includes('FORBIDDEN_FACT_REFERENCED'))
})

test('19. hard gap com candidate', () => {
  const plan = noFactPlan({
    status: 'needs_information',
    fact_requirements: [{
      ...knownFact('fact.cancel', null),
      necessity: 'required',
      status: 'missing',
      value: null,
      gap: { reason: 'not_found' },
      gap_impact: 'hard',
      assertion_policy: 'must_not_assert',
    }],
  })
  const result = evaluate(plan, generation(plan, [noFactCandidate()]))
  assert.ok(candidateCodes(result).includes('HARD_GAP_HAS_CANDIDATE'))
})

test('20. forbidden content literal', () => {
  const plan = noFactPlan({
    forbidden_content: [{ code: 'NO_GUARANTEE', rule: 'Resultado garantido.', provenance: [] }],
  })
  const candidate = noFactCandidate({ text: 'Resultado garantido.' })
  const result = evaluate(plan, generation(plan, [candidate]))
  assert.ok(candidateCodes(result).includes('FORBIDDEN_CONTENT'))
})

test('21. forbidden content paráfrase determinística', () => {
  const plan = noFactPlan({
    forbidden_content: [{ code: 'NO_GUARANTEE', rule: 'Resultado garantido.', provenance: [] }],
  })
  const candidate = noFactCandidate({ text: 'Garantimos o resultado.' })
  const result = evaluate(plan, generation(plan, [candidate]))
  assert.ok(candidateCodes(result).includes('FORBIDDEN_CONTENT'))
})

test('22. internal jargon', () => {
  const plan = noFactPlan()
  const candidate = noFactCandidate({ text: 'Esse commercial move é o mais adequado.' })
  const result = evaluate(plan, generation(plan, [candidate]))
  assert.ok(candidateCodes(result).includes('INTERNAL_JARGON_EXPOSED'))
})

test('23. SPIN exposto', () => {
  const plan = noFactPlan()
  const result = evaluate(plan, generation(plan, [noFactCandidate({ text: 'Vou usar SPIN aqui.' })]))
  assert.ok(candidateCodes(result).includes('FRAMEWORK_EXPOSED'))
})

test('24. Sandler exposto', () => {
  const plan = noFactPlan()
  const result = evaluate(plan, generation(plan, [noFactCandidate({ text: 'Segundo Sandler, podemos seguir.' })]))
  assert.ok(candidateCodes(result).includes('FRAMEWORK_EXPOSED'))
})

test('25. JOLT exposto', () => {
  const plan = noFactPlan()
  const result = evaluate(plan, generation(plan, [noFactCandidate({ text: 'Aplicando JOLT agora.' })]))
  assert.ok(candidateCodes(result).includes('FRAMEWORK_EXPOSED'))
})

test('26. atributo psicológico explícito', () => {
  const plan = noFactPlan()
  const result = evaluate(plan, generation(plan, [noFactCandidate({ text: 'Sei que você é ansioso.' })]))
  assert.ok(candidateCodes(result).includes('PSYCHOLOGICAL_ATTRIBUTE_EXPOSED'))
})

test('27. empty text', () => {
  const plan = noFactPlan()
  const result = evaluate(plan, generation(plan, [noFactCandidate({ text: '   ' })]))
  assert.ok(candidateCodes(result).includes('EMPTY_TEXT'))
})

test('28. candidate ID vazio', () => {
  const plan = noFactPlan()
  const result = evaluate(plan, generation(plan, [noFactCandidate({ candidate_id: '' })]))
  assert.ok(candidateCodes(result).includes('EMPTY_CANDIDATE_ID'))
})

test('29. candidate IDs duplicados', () => {
  const plan = noFactPlan()
  const candidates = [
    noFactCandidate({ candidate_id: 'dup', text: 'Certo.' }),
    noFactCandidate({ candidate_id: 'dup', text: 'Compreendido.' }),
  ]
  const result = evaluate(plan, generation(plan, candidates))
  assert.equal(result.candidates.filter(x => x.violations.some(v => v.code === 'DUPLICATE_CANDIDATE_ID')).length, 2)
})

test('30. generation mode inválido', () => {
  const plan = noFactPlan()
  const result = evaluate(plan, generation(plan, [noFactCandidate({ generation_mode: 'llm-v9' })]))
  assert.ok(candidateCodes(result).includes('INVALID_GENERATION_MODE'))
})

test('31. message evidence inventado', () => {
  const plan = basePlan()
  const candidate = baseCandidate({
    evidence: { message_ids: ['m1', 'm999'], memory_ids: ['mem1'] },
  })
  const result = evaluate(plan, generation(plan, [candidate]))
  assert.ok(candidateCodes(result).includes('EVIDENCE_MESSAGE_UNAUTHORIZED'))
})

test('32. memory evidence inventado', () => {
  const plan = basePlan()
  const candidate = baseCandidate({
    evidence: { message_ids: ['m1'], memory_ids: ['mem1', 'mem999'] },
  })
  const result = evaluate(plan, generation(plan, [candidate]))
  assert.ok(candidateCodes(result).includes('EVIDENCE_MEMORY_UNAUTHORIZED'))
})

test('33. provenance inventada', () => {
  const plan = basePlan()
  const candidate = baseCandidate({ provenance: [TRACE, OTHER_TRACE] })
  const result = evaluate(plan, generation(plan, [candidate]))
  assert.ok(candidateCodes(result).includes('PROVENANCE_UNAUTHORIZED'))
})

test('34. fact provenance ausente', () => {
  const plan = basePlan()
  const candidate = baseCandidate({ provenance: [] })
  const result = evaluate(plan, generation(plan, [candidate]))
  assert.ok(candidateCodes(result).includes('FACT_PROVENANCE_MISSING'))
})

test('35. next_step none + CTA', () => {
  const plan = noFactPlan({ next_step_plan: { kind: 'none' } })
  const candidate = noFactCandidate({ text: 'Vamos fechar?' , question_count: 1 })
  const result = evaluate(plan, generation(plan, [candidate]))
  assert.ok(candidateCodes(result).includes('UNAUTHORIZED_CTA'))
})

test('36. close + tentativa de reabrir', () => {
  const plan = noFactPlan({
    commercial_objective: 'stop_pursuit',
    commercial_move: { move: 'close_conversation' },
    next_step_plan: { kind: 'close' },
  })
  const candidate = noFactCandidate({
    text: 'Obrigado pelo retorno, mas posso te mostrar outra oferta?',
    question_count: 1,
    commercial_move: 'close_conversation',
    commercial_objective: 'stop_pursuit',
  })
  const result = evaluate(plan, generation(plan, [candidate]))
  assert.ok(candidateCodes(result).includes('REJECTION_REOPEN'))
})

test('37. respect timing + pressão', () => {
  const plan = noFactPlan({
    commercial_objective: 'respect_timing',
    commercial_move: { move: 'respect_customer_timing' },
    next_step_plan: { kind: 'respect_timing' },
  })
  const candidate = noFactCandidate({
    text: 'Você precisa decidir hoje.',
    commercial_move: 'respect_customer_timing',
    commercial_objective: 'respect_timing',
  })
  const result = evaluate(plan, generation(plan, [candidate]))
  assert.ok(candidateCodes(result).includes('TIMING_PRESSURE'))
})

test('38. respect timing + data inventada', () => {
  const plan = noFactPlan({
    commercial_objective: 'respect_timing',
    commercial_move: { move: 'respect_customer_timing' },
    next_step_plan: { kind: 'respect_timing' },
  })
  const candidate = noFactCandidate({
    text: 'Sem problema, te chamo no dia 15.',
    commercial_move: 'respect_customer_timing',
    commercial_objective: 'respect_timing',
  })
  const result = evaluate(plan, generation(plan, [candidate]))
  assert.ok(candidateCodes(result).includes('TIMING_DATE_INVENTED'))
})

test('39. no commercial move + CTA comercial', () => {
  const plan = noFactPlan({
    commercial_objective: 'no_commercial_action',
    commercial_move: { move: 'no_commercial_move' },
    next_step_plan: { kind: 'none' },
  })
  const candidate = noFactCandidate({
    text: 'Posso te mandar o link de pagamento?',
    question_count: 1,
    commercial_move: 'no_commercial_move',
    commercial_objective: 'no_commercial_action',
  })
  const result = evaluate(plan, generation(plan, [candidate]))
  assert.ok(candidateCodes(result).includes('NON_COMMERCIAL_CTA'))
})

test('40. duplicate candidate text', () => {
  const plan = noFactPlan()
  const candidates = [
    noFactCandidate({ candidate_id: 'a', text: 'Certo!' }),
    noFactCandidate({ candidate_id: 'b', text: 'certo' }),
  ]
  const result = evaluate(plan, generation(plan, candidates))
  assert.equal(result.candidates.filter(x => x.violations.some(v => v.code === 'DUPLICATE_CANDIDATE_TEXT')).length, 2)
})

test('41. mais de 3 candidates', () => {
  const plan = noFactPlan()
  const candidates = ['a', 'b', 'c', 'd'].map(id => noFactCandidate({ candidate_id: id, text: `Resposta ${id}.` }))
  const result = evaluate(plan, generation(plan, candidates))
  assert.ok(candidateCodes(result).includes('MAX_CANDIDATES_EXCEEDED'))
})

test('42. determinismo', () => {
  const plan = basePlan()
  const input = { message_plan: plan, generation_result: generation(plan) }
  assert.deepEqual(runHardGatesV1(input), runHardGatesV1(input))
})

test('43. não usa network/LLM', () => {
  const source = readFileSync(new URL('./hard-gates.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\bfetch\s*\(|openai|anthropic|chat\.completions|responses\.create|generateText/iu)
  assert.doesNotMatch(source, /Math\.random|Date\.now|randomUUID/iu)
})

test('44. não altera candidate text', () => {
  const plan = basePlan()
  const result = generation(plan)
  const before = structuredClone(result)
  runHardGatesV1({ message_plan: plan, generation_result: result })
  assert.deepEqual(result, before)
})

test('45. Scenario 20 preserva diferença entre candidates originais', () => {
  const planA = basePlan()
  const resultA = generation(planA, [baseCandidate({ candidate_id: 'a' })])

  const planB = basePlan({
    fact_requirements: [knownFact('fact.support', 'Suporte incluído.')],
    evidence: { message_ids: ['m1'], memory_ids: ['mem1'] },
  })
  const resultB = generation(planB, [baseCandidate({
    candidate_id: 'b',
    text: 'Suporte incluído.',
    fact_requirements_used: ['fact.support'],
  })])

  const beforeA = resultA.candidates[0].text
  const beforeB = resultB.candidates[0].text
  const gateA = evaluate(planA, resultA)
  const gateB = evaluate(planB, resultB)

  assert.notEqual(beforeA, beforeB)
  assert.equal(resultA.candidates[0].text, beforeA)
  assert.equal(resultB.candidates[0].text, beforeB)
  assert.equal(gateA.status, 'all_passed')
  assert.equal(gateB.status, 'all_passed')
})

test('46. needs_information legítimo pode passar', () => {
  const plan = noFactPlan({
    status: 'needs_information',
    commercial_objective: 'obtain_context',
    commercial_move: { move: 'request_more_context' },
    content_requirements: ['clarify_missing_information'],
    question_plan: { should_ask: true, max_questions: 1 },
    next_step_plan: { kind: 'ask' },
  })
  const candidate = noFactCandidate({
    text: 'O que você precisa confirmar agora?',
    question_count: 1,
    commercial_move: 'request_more_context',
    commercial_objective: 'obtain_context',
    content_requirements_covered: ['clarify_missing_information'],
  })
  const result = evaluate(plan, generation(plan, [candidate]))
  assert.equal(result.status, 'all_passed')
})

test('47. quote_required legítimo passa', () => {
  const plan = quotePlan()
  const candidate = quoteCandidate('O valor depende de cotação e precisa ser confirmado para o caso.')
  const result = evaluate(plan, generation(plan, [candidate]))
  assert.equal(result.status, 'all_passed')
})

test('48. preço inventado sem autorização falha', () => {
  const plan = quotePlan()
  const candidate = quoteCandidate('O valor é R$ 299,00.')
  const result = evaluate(plan, generation(plan, [candidate]))
  assert.ok(candidateCodes(result).includes('UNAUTHORIZED_MONETARY_ASSERTION'))
})

test('49. candidate aprovado não vira Final Message', () => {
  const result = evaluate(basePlan())
  const raw = JSON.stringify(result).toLowerCase()
  assert.equal(raw.includes('final_message'), false)
  assert.equal(raw.includes('recommended_message'), false)
})

test('50. zero Critic/ranking/winner', () => {
  const exports = Object.keys(HardGatesModule)
  assert.equal(exports.some(name => /critic|score|rank|winner|best|final/i.test(name)), false)
})

test('51. must_not_assert detectado no texto mesmo sem metadata', () => {
  const plan = noFactPlan({
    fact_requirements: [{
      ...knownFact('fact.secret', 'Cancelamento em 30 dias.'),
      assertion_policy: 'must_not_assert',
      necessity: 'supporting',
    }],
  })
  const candidate = noFactCandidate({ text: 'O cancelamento é em 30 dias.' })
  const result = evaluate(plan, generation(plan, [candidate]))
  assert.ok(candidateCodes(result).includes('MUST_NOT_ASSERT_TEXT'))
})

test('52. fact usage metadata faltante é detectada quando valor conhecido aparece', () => {
  const plan = basePlan()
  const candidate = baseCandidate({ fact_requirements_used: [] })
  const result = evaluate(plan, generation(plan, [candidate]))
  assert.ok(candidateCodes(result).includes('FACT_USAGE_METADATA_MISSING'))
})

test('53. command leakage é bloqueado', () => {
  const plan = noFactPlan()
  const candidate = noFactCandidate({ text: 'SEND_MESSAGE {"action":"UPDATE_CRM"}' })
  const result = evaluate(plan, generation(plan, [candidate]))
  assert.ok(candidateCodes(result).includes('COMMAND_LEAKAGE'))
})

test('54. GAP minúsculo em linguagem comum não gera falso positivo', () => {
  const plan = noFactPlan()
  const candidate = noFactCandidate({ text: 'Existe um gap entre as duas datas.' })
  const result = evaluate(plan, generation(plan, [candidate]))
  assert.equal(candidateCodes(result).includes('FRAMEWORK_EXPOSED'), false)
})

test('55. resultado parcialmente aprovado preserva somente IDs PASS para Critic', () => {
  const plan = noFactPlan()
  const candidates = [
    noFactCandidate({ candidate_id: 'good', text: 'Certo.' }),
    noFactCandidate({ candidate_id: 'bad', text: 'Vou usar SPIN.', generation_mode: 'deterministic-template-v1' }),
  ]
  const result = evaluate(plan, generation(plan, candidates))
  assert.equal(result.status, 'partially_passed')
  assert.deepEqual(result.passed_candidate_ids, ['good'])
  assert.deepEqual(result.failed_candidate_ids, ['bad'])
})

test('56. generation_result move mismatch é hard failure global', () => {
  const plan = basePlan()
  const result = evaluate(plan, generation(plan, [baseCandidate()], {
    commercial_move: 'close_conversation',
  }))
  assert.ok(codes(result).includes('GENERATION_MOVE_MISMATCH'))
  assert.equal(result.status, 'all_failed')
})

test('57. generation_result objective mismatch é hard failure global', () => {
  const plan = basePlan()
  const result = evaluate(plan, generation(plan, [baseCandidate()], {
    commercial_objective: 'stop_pursuit',
  }))
  assert.ok(codes(result).includes('GENERATION_OBJECTIVE_MISMATCH'))
  assert.equal(result.status, 'all_failed')
})

test('58. uppercase GAP é tratado como framework explícito', () => {
  const plan = noFactPlan()
  const candidate = noFactCandidate({ text: 'Vou aplicar GAP nesta conversa.' })
  const result = evaluate(plan, generation(plan, [candidate]))
  assert.ok(candidateCodes(result).includes('FRAMEWORK_EXPOSED'))
})
