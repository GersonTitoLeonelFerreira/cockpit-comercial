import {
  FINAL_MESSAGE_CONTRACT_VERSION,
  type FinalMessageInputV1,
  type FinalMessageResultV1,
  type FinalMessageSelectionReasonV1,
  type FinalMessageStatusV1,
  type FinalMessageV1,
  type SelectableCriticStatusV1,
} from './final-message-contracts'
import type { CandidateCritiqueV1, CandidateCriticStatusV1 } from './critic-contracts'
import type { MessageCandidateV1 } from './message-candidate'

const uniq = (xs: readonly string[]) => [...new Set(xs)]
const dup = (xs: readonly string[]) => uniq(xs).length !== xs.length
const same = (a: readonly string[], b: readonly string[]) =>
  !dup(a) && !dup(b) && a.length === b.length && a.every(x => new Set(b).has(x))

function generatedIds(i: FinalMessageInputV1) {
  return i.generation_result.candidates.map(c => c.candidate_id)
}

function eligibility(i: FinalMessageInputV1) {
  const generated = uniq(generatedIds(i))
  const set = new Set(generated)
  const eligible = uniq(i.hard_gate_result.passed_candidate_ids).filter(id => set.has(id))
  const pass = new Set(eligible)
  return { eligible, rejected: generated.filter(id => !pass.has(id)) }
}

function empty(
  i: FinalMessageInputV1,
  status: FinalMessageStatusV1,
  selection_reason: FinalMessageSelectionReasonV1,
): FinalMessageResultV1 {
  const { eligible, rejected } = eligibility(i)
  return {
    contract_version: FINAL_MESSAGE_CONTRACT_VERSION,
    status,
    final_message: null,
    selected_candidate_id: null,
    selection_reason,
    eligible_candidate_ids: eligible,
    rejected_candidate_ids: rejected,
  }
}

function byStatus(q: readonly CandidateCritiqueV1[], status: CandidateCriticStatusV1) {
  return q.filter(x => x.status === status).map(x => x.candidate_id)
}

function hardConsistent(i: FinalMessageInputV1) {
  const ids = generatedIds(i)
  if (dup(ids) || i.generation_result.candidates.some(c =>
    typeof c.candidate_id !== 'string' || !c.candidate_id || typeof c.text !== 'string')) return false

  const rows = i.hard_gate_result.candidates
  const rowIds = rows.map(x => x.candidate_id)
  if (!same(rowIds, ids)) return false
  const pass = rows.filter(x => x.status === 'pass').map(x => x.candidate_id)
  const fail = rows.filter(x => x.status === 'fail').map(x => x.candidate_id)
  if (!same(i.hard_gate_result.passed_candidate_ids, pass) ||
      !same(i.hard_gate_result.failed_candidate_ids, fail)) return false

  const s = i.hard_gate_result.status
  if (s === 'blocked' || s === 'approval_required') return rows.length === 0 && pass.length === 0
  if (pass.length === 0) return s === 'all_failed'
  if (pass.length === rows.length) return s === 'all_passed'
  return s === 'partially_passed'
}

function criticEmpty(i: FinalMessageInputV1) {
  const c = i.critic_result
  return c.critiques.length === 0 && c.ranked_candidate_ids.length === 0 &&
    c.recommended_candidate_ids.length === 0 && c.acceptable_candidate_ids.length === 0 &&
    c.weak_candidate_ids.length === 0
}

function criticConsistent(i: FinalMessageInputV1) {
  const c = i.critic_result
  const passed = i.hard_gate_result.passed_candidate_ids
  const generated = new Set(generatedIds(i))
  const ids = c.critiques.map(x => x.candidate_id)
  if (dup(ids) || ids.some(id => !generated.has(id)) || !same(ids, passed)) return false
  if (c.critiques.some(x => !Number.isFinite(x.overall_score) || x.overall_score < 0 || x.overall_score > 100)) return false
  if (!same(c.ranked_candidate_ids, ids)) return false
  if (!same(c.recommended_candidate_ids, byStatus(c.critiques, 'recommended'))) return false
  if (!same(c.acceptable_candidate_ids, byStatus(c.critiques, 'acceptable'))) return false
  if (!same(c.weak_candidate_ids, byStatus(c.critiques, 'weak'))) return false
  if (passed.length === 0) return c.status === 'no_eligible_candidates' && criticEmpty(i)
  return c.status === 'evaluated'
}

function consistent(i: FinalMessageInputV1) {
  if (!hardConsistent(i)) return false
  const h = i.hard_gate_result.status
  const c = i.critic_result.status
  if (h === 'blocked') return c === 'blocked' && criticEmpty(i)
  if (h === 'approval_required') return c === 'approval_required' && criticEmpty(i)
  if (c === 'blocked' || c === 'approval_required') return false
  return criticConsistent(i)
}

function pick(i: FinalMessageInputV1, status: SelectableCriticStatusV1) {
  const candidates = new Map(i.generation_result.candidates.map(c => [c.candidate_id, c] as const))
  const critiques = new Map(i.critic_result.critiques.map(c => [c.candidate_id, c] as const))
  for (const id of i.critic_result.ranked_candidate_ids) {
    const critique = critiques.get(id)
    if (critique?.status !== status) continue
    const candidate = candidates.get(id)
    return candidate ? { candidate, critique } : null
  }
  return null
}

function selected(
  i: FinalMessageInputV1,
  candidate: MessageCandidateV1,
  critique: CandidateCritiqueV1,
  reason: Extract<FinalMessageSelectionReasonV1, 'best_recommended' | 'best_acceptable'>,
): FinalMessageResultV1 {
  if (critique.status !== 'recommended' && critique.status !== 'acceptable') {
    return empty(i, 'inconsistent_input', 'inconsistent_input')
  }
  const final_message: FinalMessageV1 = {
    candidate_id: candidate.candidate_id,
    text: candidate.text,
    critic_status: critique.status,
    overall_score: critique.overall_score,
    commercial_move: candidate.commercial_move,
    commercial_objective: candidate.commercial_objective,
    evidence: candidate.evidence,
    provenance: candidate.provenance,
  }
  const { eligible, rejected } = eligibility(i)
  return {
    contract_version: FINAL_MESSAGE_CONTRACT_VERSION,
    status: 'selected',
    final_message,
    selected_candidate_id: candidate.candidate_id,
    selection_reason: reason,
    eligible_candidate_ids: eligible,
    rejected_candidate_ids: rejected,
  }
}

export function selectFinalMessageV1(i: FinalMessageInputV1): FinalMessageResultV1 {
  if (!consistent(i)) return empty(i, 'inconsistent_input', 'inconsistent_input')
  if (i.hard_gate_result.status === 'blocked') return empty(i, 'blocked', 'hard_gate_blocked')
  if (i.hard_gate_result.status === 'approval_required') return empty(i, 'approval_required', 'approval_required')
  if (i.hard_gate_result.passed_candidate_ids.length === 0) return empty(i, 'no_eligible_candidates', 'no_eligible_candidate')
  const recommended = pick(i, 'recommended')
  if (recommended) return selected(i, recommended.candidate, recommended.critique, 'best_recommended')
  const acceptable = pick(i, 'acceptable')
  if (acceptable) return selected(i, acceptable.candidate, acceptable.critique, 'best_acceptable')
  return empty(i, 'no_acceptable_message', 'no_acceptable_candidate')
}

export function createFinalMessageSelectorV1() {
  return { select: selectFinalMessageV1 }
}
