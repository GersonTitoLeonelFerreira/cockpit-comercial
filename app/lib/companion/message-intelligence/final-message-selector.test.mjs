import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  selectFinalMessageV1,
} from './final-message-selector.ts'

import {
  createShadowEvaluationV1,
} from './shadow-evaluation.ts'

import * as SelectorModule from './final-message-selector.ts'
import * as ShadowModule from './shadow-evaluation.ts'

const TRACE = {
  source_type: 'commercial_fact',
  source_id: 'fact-1',
  source_version: 'v1',
  observed_at: '2026-08-31T21:00:00.000Z',
  evidence_message_ids: ['m1'],
  evidence_memory_ids: ['mem1'],
}

function candidate(id = 'a', text = 'Mensagem A.', overrides = {}) {
  return {
    contract_version: 'message-candidate-v1',
    candidate_id: id,
    text,
    generation_mode: 'deterministic-template-v1',
    commercial_move: 'answer_directly',
    commercial_objective: 'answer_factually',
    content_requirements_covered: [],
    fact_requirements_used: [],
    question_count: 0,
    evidence: {
      message_ids: ['m1'],
      memory_ids: ['mem1'],
    },
    provenance: [TRACE],
    ...overrides,
  }
}

function generation(candidates) {
  return {
    contract_version: 'candidate-generation-result-v1',
    status: candidates.length ? 'generated' : 'not_generated',
    plan_status: 'ready',
    commercial_move: 'answer_directly',
    commercial_objective: 'answer_factually',
    generation_allowed: true,
    candidates,
    limitations: [],
    reason: 'fixture',
  }
}

function hard(candidates, passedIds, status) {
  const passed = new Set(passedIds)
  const rows = candidates.map(item => ({
    candidate_id: item.candidate_id,
    status: passed.has(item.candidate_id) ? 'pass' : 'fail',
    violations: [],
  }))
  const resolved = status ?? (
    candidates.length === 0 || passedIds.length === 0
      ? 'all_failed'
      : passedIds.length === candidates.length
        ? 'all_passed'
        : 'partially_passed'
  )
  return {
    contract_version: 'hard-gate-v1',
    status: resolved,
    candidates: rows,
    passed_candidate_ids: [...passedIds],
    failed_candidate_ids: candidates
      .filter(item => !passed.has(item.candidate_id))
      .map(item => item.candidate_id),
    violations: [],
  }
}

function critique(id, status = 'recommended', score = 90) {
  return {
    candidate_id: id,
    status,
    overall_score: score,
    dimensions: {
      commercial_coherence: score,
      naturalness: score,
      specificity: score,
      clarity: score,
      concision: score,
      question_quality: null,
      next_step_fit: null,
      communication_fit: score,
    },
    strengths: [],
    issues: [],
  }
}

function critic(critiques, ranking, status = 'evaluated') {
  return {
    contract_version: 'commercial-naturalness-critic-v1',
    status,
    critiques,
    ranked_candidate_ids: [...ranking],
    recommended_candidate_ids: critiques.filter(x => x.status === 'recommended').map(x => x.candidate_id),
    acceptable_candidate_ids: critiques.filter(x => x.status === 'acceptable').map(x => x.candidate_id),
    weak_candidate_ids: critiques.filter(x => x.status === 'weak').map(x => x.candidate_id),
  }
}

function input({
  candidates = [candidate()],
  passed = candidates.map(x => x.candidate_id),
  critiques = passed.map(id => critique(id)),
  ranking = critiques.map(x => x.candidate_id),
  hardStatus,
  criticStatus = passed.length ? 'evaluated' : 'no_eligible_candidates',
} = {}) {
  return {
    message_plan: { contract_version: 'message-plan-v1' },
    generation_result: generation(candidates),
    hard_gate_result: hard(candidates, passed, hardStatus),
    critic_result: critic(critiques, ranking, criticStatus),
  }
}

function selected(result) {
  assert.equal(result.status, 'selected')
  assert.ok(result.final_message)
  return result.final_message
}

function shadowFrom(i, result = selectFinalMessageV1(i)) {
  return createShadowEvaluationV1({
    generation_result: i.generation_result,
    hard_gate_result: i.hard_gate_result,
    critic_result: i.critic_result,
    final_message_result: result,
  })
}

test('1. recommended única é selecionada', () => {
  const result = selectFinalMessageV1(input())
  assert.equal(result.selected_candidate_id, 'a')
  assert.equal(result.selection_reason, 'best_recommended')
})

test('2. múltiplas recommended seguem ranking do Critic', () => {
  const candidates = [candidate('a'), candidate('b')]
  const critiques = [critique('a', 'recommended', 99), critique('b', 'recommended', 80)]
  const result = selectFinalMessageV1(input({ candidates, critiques, ranking: ['b', 'a'] }))
  assert.equal(result.selected_candidate_id, 'b')
})

test('3. nenhuma recommended + acceptable seleciona best acceptable', () => {
  const candidates = [candidate('a'), candidate('b')]
  const critiques = [critique('a', 'acceptable', 79), critique('b', 'acceptable', 70)]
  const result = selectFinalMessageV1(input({ candidates, critiques, ranking: ['b', 'a'] }))
  assert.equal(result.selected_candidate_id, 'b')
  assert.equal(result.selection_reason, 'best_acceptable')
})

test('4. weak only → no_acceptable_message', () => {
  const i = input({ critiques: [critique('a', 'weak', 50)] })
  const result = selectFinalMessageV1(i)
  assert.equal(result.status, 'no_acceptable_message')
  assert.equal(result.final_message, null)
})

test('5. zero eligible → no_eligible_candidates', () => {
  const c = candidate('a')
  const result = selectFinalMessageV1(input({ candidates: [c], passed: [], critiques: [], ranking: [] }))
  assert.equal(result.status, 'no_eligible_candidates')
})

test('6. blocked → blocked', () => {
  const i = input({ candidates: [], passed: [], critiques: [], ranking: [], hardStatus: 'blocked', criticStatus: 'blocked' })
  const result = selectFinalMessageV1(i)
  assert.equal(result.status, 'blocked')
  assert.equal(result.final_message, null)
})

test('7. approval_required → approval_required', () => {
  const i = input({ candidates: [], passed: [], critiques: [], ranking: [], hardStatus: 'approval_required', criticStatus: 'approval_required' })
  const result = selectFinalMessageV1(i)
  assert.equal(result.status, 'approval_required')
})

test('8. Hard Gate FAIL nunca selecionada', () => {
  const candidates = [candidate('pass'), candidate('fail')]
  const result = selectFinalMessageV1(input({
    candidates,
    passed: ['pass'],
    critiques: [critique('pass', 'acceptable', 70)],
    ranking: ['pass'],
  }))
  assert.equal(result.selected_candidate_id, 'pass')
  assert.ok(result.rejected_candidate_ids.includes('fail'))
})

test('9. Hard Gate FAIL mesmo com melhor Critic nunca selecionada', () => {
  const candidates = [candidate('pass'), candidate('fail')]
  const i = input({
    candidates,
    passed: ['pass'],
    critiques: [critique('pass', 'acceptable', 70), critique('fail', 'recommended', 99)],
    ranking: ['fail', 'pass'],
  })
  const result = selectFinalMessageV1(i)
  assert.equal(result.status, 'inconsistent_input')
  assert.equal(result.selected_candidate_id, null)
})

test('10. candidate PASS sem critique → inconsistent_input', () => {
  const result = selectFinalMessageV1(input({ critiques: [], ranking: [] }))
  assert.equal(result.status, 'inconsistent_input')
})

test('11. critique sem candidate → inconsistent_input', () => {
  const i = input()
  i.critic_result.critiques.push(critique('ghost'))
  i.critic_result.ranked_candidate_ids.push('ghost')
  i.critic_result.recommended_candidate_ids.push('ghost')
  const result = selectFinalMessageV1(i)
  assert.equal(result.status, 'inconsistent_input')
})

test('12. duplicate critique ID → inconsistent_input', () => {
  const result = selectFinalMessageV1(input({ critiques: [critique('a'), critique('a')], ranking: ['a'] }))
  assert.equal(result.status, 'inconsistent_input')
})

test('13. recommended IDs divergentes → inconsistent_input', () => {
  const i = input()
  i.critic_result.recommended_candidate_ids = []
  assert.equal(selectFinalMessageV1(i).status, 'inconsistent_input')
})

test('14. acceptable IDs divergentes → inconsistent_input', () => {
  const i = input({ critiques: [critique('a', 'acceptable', 70)] })
  i.critic_result.acceptable_candidate_ids = []
  assert.equal(selectFinalMessageV1(i).status, 'inconsistent_input')
})

test('15. weak IDs divergentes → inconsistent_input', () => {
  const i = input({ critiques: [critique('a', 'weak', 50)] })
  i.critic_result.weak_candidate_ids = []
  assert.equal(selectFinalMessageV1(i).status, 'inconsistent_input')
})

test('16. ranking com ID inexistente → inconsistent_input', () => {
  const i = input()
  i.critic_result.ranked_candidate_ids = ['ghost']
  assert.equal(selectFinalMessageV1(i).status, 'inconsistent_input')
})

test('17. ranking com Hard Gate FAIL → inconsistent_input', () => {
  const candidates = [candidate('pass'), candidate('fail')]
  const i = input({ candidates, passed: ['pass'], critiques: [critique('pass')], ranking: ['pass'] })
  i.critic_result.ranked_candidate_ids = ['pass', 'fail']
  assert.equal(selectFinalMessageV1(i).status, 'inconsistent_input')
})

test('18. ranking omite candidate criticada elegível → inconsistent_input', () => {
  const candidates = [candidate('a'), candidate('b')]
  const critiques = [critique('a'), critique('b')]
  const result = selectFinalMessageV1(input({ candidates, critiques, ranking: ['a'] }))
  assert.equal(result.status, 'inconsistent_input')
})

test('19. Hard Gate blocked + Critic evaluated → inconsistent_input', () => {
  const i = input({ candidates: [], passed: [], critiques: [], ranking: [], hardStatus: 'blocked', criticStatus: 'evaluated' })
  assert.equal(selectFinalMessageV1(i).status, 'inconsistent_input')
})

test('20. Critic blocked + Hard Gate all_passed → inconsistent_input', () => {
  const i = input({ criticStatus: 'blocked' })
  assert.equal(selectFinalMessageV1(i).status, 'inconsistent_input')
})

test('21. selected text é idêntico ao candidate', () => {
  const text = '  Texto\ncom espaços exatos.  '
  const c = candidate('a', text)
  const result = selectFinalMessageV1(input({ candidates: [c] }))
  assert.equal(selected(result).text, text)
})

test('22. nenhum rewrite', () => {
  const source = readFileSync(new URL('./final-message-selector.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /rewrite|polish|sanitize|paraphrase|regenerate/iu)
})

test('23. nenhum merge de candidates', () => {
  const source = readFileSync(new URL('./final-message-selector.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /mergeCandidates|combineCandidates|joinCandidates/iu)
})

test('24. provenance preservada', () => {
  const c = candidate()
  const result = selectFinalMessageV1(input({ candidates: [c] }))
  assert.deepEqual(selected(result).provenance, c.provenance)
})

test('25. evidence preservada', () => {
  const c = candidate()
  const result = selectFinalMessageV1(input({ candidates: [c] }))
  assert.deepEqual(selected(result).evidence, c.evidence)
})

test('26. commercial_move preservado', () => {
  const c = candidate('a', 'x', { commercial_move: 'respect_customer_timing' })
  const result = selectFinalMessageV1(input({ candidates: [c] }))
  assert.equal(selected(result).commercial_move, c.commercial_move)
})

test('27. commercial_objective preservado', () => {
  const c = candidate('a', 'x', { commercial_objective: 'respect_timing' })
  const result = selectFinalMessageV1(input({ candidates: [c] }))
  assert.equal(selected(result).commercial_objective, c.commercial_objective)
})

test('28. critic score preservado', () => {
  const result = selectFinalMessageV1(input({ critiques: [critique('a', 'recommended', 83)] }))
  assert.equal(selected(result).overall_score, 83)
})

test('29. critic status preservado', () => {
  const result = selectFinalMessageV1(input({ critiques: [critique('a', 'acceptable', 72)] }))
  assert.equal(selected(result).critic_status, 'acceptable')
})

test('30. determinismo estrutural sem fontes não determinísticas', () => {
  const source = readFileSync(new URL('./final-message-selector.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /Math\.random|Date\.now|randomUUID/iu)
})

test('31. mesmo input → mesmo result', () => {
  const i = input()
  assert.deepEqual(selectFinalMessageV1(i), selectFinalMessageV1(i))
})

test('32. Scenario 20 A/B preservado', () => {
  const a = candidate('a', 'O valor depende de cotação para este caso.')
  const b = candidate('b', 'O suporte está incluído no plano informado.')
  const ra = selectFinalMessageV1(input({ candidates: [a], critiques: [critique('a')] }))
  const rb = selectFinalMessageV1(input({ candidates: [b], critiques: [critique('b')] }))
  assert.equal(selected(ra).text, a.text)
  assert.equal(selected(rb).text, b.text)
  assert.notEqual(selected(ra).text, selected(rb).text)
})

test('33. não usa LLM', () => {
  const source = readFileSync(new URL('./final-message-selector.ts', import.meta.url), 'utf8') + readFileSync(new URL('./shadow-evaluation.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /openai|anthropic|chat\.completions|responses\.create|generateText/iu)
})

test('34. não usa network', () => {
  const source = readFileSync(new URL('./final-message-selector.ts', import.meta.url), 'utf8') + readFileSync(new URL('./shadow-evaluation.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|axios|https?:\/\//iu)
})

test('35. não usa random', () => {
  const source = readFileSync(new URL('./final-message-selector.ts', import.meta.url), 'utf8') + readFileSync(new URL('./shadow-evaluation.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /Math\.random|randomUUID/iu)
})

test('36. não usa relógio', () => {
  const source = readFileSync(new URL('./final-message-selector.ts', import.meta.url), 'utf8') + readFileSync(new URL('./shadow-evaluation.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /Date\.now|new Date\s*\(/iu)
})

test('37. zero auto-send', () => {
  const s = shadowFrom(input())
  assert.equal(s.automatic_send, false)
})

test('38. zero CRM write', () => {
  const s = shadowFrom(input())
  assert.equal(s.automatic_crm_write, false)
})

test('39. zero Agenda write', () => {
  const s = shadowFrom(input())
  assert.equal(s.automatic_agenda_write, false)
})

test('40. zero runtime live', () => {
  const source = readFileSync(new URL('./final-message-selector.ts', import.meta.url), 'utf8') + readFileSync(new URL('./shadow-evaluation.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /chrome\.runtime|sendMessage|whatsapp|lead-seller-message|stateful-communication|stateful-copilot/iu)
})

test('41. shadow contract serializável', () => {
  const shadow = shadowFrom(input())
  assert.deepEqual(JSON.parse(JSON.stringify(shadow)), shadow)
})

test('42. shadow selected recommended', () => {
  const s = shadowFrom(input())
  assert.equal(s.final_status, 'selected')
  assert.equal(s.selected_critic_status, 'recommended')
  assert.equal(s.selected_overall_score, 90)
})

test('43. shadow selected acceptable', () => {
  const i = input({ critiques: [critique('a', 'acceptable', 72)] })
  const s = shadowFrom(i)
  assert.equal(s.selected_critic_status, 'acceptable')
  assert.equal(s.would_surface_message, true)
})

test('44. shadow no acceptable', () => {
  const i = input({ critiques: [critique('a', 'weak', 50)] })
  const s = shadowFrom(i)
  assert.equal(s.final_status, 'no_acceptable_message')
  assert.equal(s.selected_critic_status, null)
})

test('45. shadow blocked', () => {
  const i = input({ candidates: [], passed: [], critiques: [], ranking: [], hardStatus: 'blocked', criticStatus: 'blocked' })
  const s = shadowFrom(i)
  assert.equal(s.final_status, 'blocked')
  assert.equal(s.would_surface_message, false)
})

test('46. shadow approval', () => {
  const i = input({ candidates: [], passed: [], critiques: [], ranking: [], hardStatus: 'approval_required', criticStatus: 'approval_required' })
  const s = shadowFrom(i)
  assert.equal(s.final_status, 'approval_required')
})

test('47. would_surface_message true somente quando selected', () => {
  const selectedShadow = shadowFrom(input())
  const weakInput = input({ critiques: [critique('a', 'weak', 40)] })
  const weakShadow = shadowFrom(weakInput)
  assert.equal(selectedShadow.would_surface_message, true)
  assert.equal(weakShadow.would_surface_message, false)
})

test('48. automatic_send sempre false', () => {
  for (const i of [input(), input({ critiques: [critique('a', 'weak', 40)] })]) {
    assert.equal(shadowFrom(i).automatic_send, false)
  }
})

test('49. automatic_crm_write sempre false', () => {
  assert.equal(shadowFrom(input()).automatic_crm_write, false)
})

test('50. automatic_agenda_write sempre false', () => {
  assert.equal(shadowFrom(input()).automatic_agenda_write, false)
})

test('51. Final Message não contém winner oculto fora do contrato', () => {
  const result = selectFinalMessageV1(input())
  assert.equal('winner' in result, false)
  assert.equal('winner' in result.final_message, false)
})

test('52. selector não recalcula Critic', () => {
  const source = readFileSync(new URL('./final-message-selector.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /CRITIC_THRESHOLDS|CRITIC_DIMENSION_WEIGHTS|overall_score\s*[+*/-]/u)
})

test('53. selector não reranqueia', () => {
  const source = readFileSync(new URL('./final-message-selector.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\.sort\s*\(/u)
})

test('54. selector não cria fallback legacy', () => {
  const source = readFileSync(new URL('./final-message-selector.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /legacy|fallback|lead-seller-message/iu)
})

test('55. no_acceptable não gera texto', () => {
  const result = selectFinalMessageV1(input({ critiques: [critique('a', 'weak', 50)] }))
  assert.equal(result.final_message, null)
  assert.equal(result.selected_candidate_id, null)
})

test('56. duplicate generation candidate ID → inconsistent_input', () => {
  const candidates = [candidate('a', 'A'), candidate('a', 'B')]
  const result = selectFinalMessageV1(input({ candidates, passed: ['a'], critiques: [critique('a')], ranking: ['a'] }))
  assert.equal(result.status, 'inconsistent_input')
})

test('57. Hard Gate pass/fail arrays divergentes → inconsistent_input', () => {
  const i = input()
  i.hard_gate_result.failed_candidate_ids = ['a']
  assert.equal(selectFinalMessageV1(i).status, 'inconsistent_input')
})

test('58. critic score inválido → inconsistent_input', () => {
  const result = selectFinalMessageV1(input({ critiques: [critique('a', 'recommended', 101)] }))
  assert.equal(result.status, 'inconsistent_input')
})

test('59. Critic no_eligible com Hard Gate PASS → inconsistent_input', () => {
  const i = input({ criticStatus: 'no_eligible_candidates' })
  assert.equal(selectFinalMessageV1(i).status, 'inconsistent_input')
})

test('60. selected candidate pertence aos eligible IDs', () => {
  const result = selectFinalMessageV1(input())
  assert.ok(result.eligible_candidate_ids.includes(result.selected_candidate_id))
})

test('61. candidate text inacessível → inconsistent_input', () => {
  const c = candidate('a', null)
  const result = selectFinalMessageV1(input({ candidates: [c] }))
  assert.equal(result.status, 'inconsistent_input')
  assert.equal(result.final_message, null)
})
