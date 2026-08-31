import {
  HARD_GATE_CONTRACT_VERSION,
  type CandidateHardGateResultV1,
  type HardGateCodeV1,
  type HardGateInputV1,
  type HardGateResultStatusV1,
  type HardGateResultV1,
  type HardGateViolationV1,
} from './hard-gate-contracts'
import type { MessageCandidateV1 } from './message-candidate'
import type { MessagePlanV1 } from './message-plan'
import type { SourceTraceV1 } from './source-trace'

const MODE = 'deterministic-template-v1' as const
const JARGON = [
  /\bcommercial\s+move\b/iu, /\bknowledge\s+gap\b/iu,
  /\bgovernance\b/iu, /\bmethod\s+alignment\b/iu,
  /\bdecision\s+criterion\b/iu, /\bcriterio\s+decisorio\b/iu,
  /\bmessage\s+planner\b/iu, /\bprovenance\b/iu, /\bframework\b/iu,
] as const
const FRAMEWORKS = [
  /\bSPIN\b/u, /\bSandler\b/u, /\bJOLT\b/u, /\bMEDDPICC\b/u,
  /\bChallenger\b/u, /\bCialdini\b/u, /\bGAP\b/u,
] as const
const COMMANDS = [
  /\bSEND_MESSAGE\b/iu, /\bAUTO_SEND\b/iu,
  /\bUPDATE_CRM\b/iu, /\bCREATE_TASK\b/iu,
  /["'](?:action|command|tool)["']\s*:\s*["'][A-Z_]{3,}["']/u,
] as const
const CTA = [
  /\bvamos\s+fechar\b/iu, /\bfechamos\b/iu, /\bvamos\s+avancar\b/iu,
  /\bpodemos\s+seguir\b/iu,
  /\bposso\s+(?:te\s+)?(?:mandar|enviar)\s+(?:o\s+)?(?:link|pagamento|proposta|oferta|condicao)\b/iu,
  /\bquer\s+que\s+eu\s+(?:mande|envie|mostre)\b/iu,
  /\bposso\s+(?:te\s+)?ligar\b/iu, /\b(?:agendamos|marcamos)\b/iu,
] as const
const REOPEN = [
  /\bmas\s+posso\b/iu, /\bposso\s+(?:te\s+)?mostrar\s+outra\b/iu,
  /\bquer\s+que\s+eu\s+(?:te\s+)?(?:mande|envie|mostre)\s+outra\b/iu,
  /\boutra\s+(?:oferta|condicao|proposta)\b/iu,
  /\b(?:podemos|vamos)\s+(?:continuar|seguir|avancar|fechar)\b/iu,
] as const
const PRESSURE = [
  /\b(?:precisa|tem que)\s+decidir\b/iu, /\b(?:fechar|decidir)\s+hoje\b/iu,
  /\bultima\s+(?:chance|oportunidade|vaga)\b/iu, /\bnao\s+(?:deixe|perca)\b/iu,
  /\burgente\b/iu, /\bvamos\s+fechar\b/iu, /\bpreciso\s+de\s+uma\s+resposta\b/iu,
] as const
const NON_COMMERCIAL_CTA = [
  ...CTA, /\blink\s+de\s+pagamento\b/iu,
  /\bavancar\s+com\s+(?:a\s+)?proposta\b/iu,
  /\bfechar\s+(?:o\s+)?(?:plano|contrato|negocio)\b/iu, /\bcontratar\b/iu,
] as const

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR').replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim()
}
function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
}
function tokens(value: string): string[] {
  return normalize(value).split(/\s+/u).filter(x => x.length >= 4)
    .map(x => x.length >= 6 ? x.slice(0, 6) : x)
}
function semanticMatch(text: string, rule: string): boolean {
  const t = normalize(text), r = normalize(rule)
  if (!r) return false
  if (t.includes(r)) return true
  const rt = new Set(tokens(rule)), tt = new Set(tokens(text))
  if (!rt.size) return false
  let hits = 0
  for (const token of rt) if (tt.has(token)) hits += 1
  return hits / rt.size >= 0.75
}
function traceKey(t: SourceTraceV1): string {
  return JSON.stringify({
    source_type: t.source_type, source_id: t.source_id,
    source_version: t.source_version, observed_at: t.observed_at,
    source_cycle_id: t.source_cycle_id ?? null, inheritance: t.inheritance ?? null,
    evidence_message_ids: unique(t.evidence_message_ids ?? []),
    evidence_memory_ids: unique(t.evidence_memory_ids ?? []),
  })
}
function countQuestions(text: string): number { return (text.match(/\?/gu) ?? []).length }
function matches(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(text))
}
function matchesNormalized(text: string, patterns: readonly RegExp[]): boolean {
  const normalized = normalize(text)
  return patterns.some(pattern => pattern.test(normalized))
}
function v(code: HardGateCodeV1, detail: string, id: string | null = null, critical = false): HardGateViolationV1 {
  return { code, detail, candidate_id: id, severity: critical ? 'critical' : 'error' }
}
function uniqViolations(items: readonly HardGateViolationV1[]): HardGateViolationV1[] {
  const map = new Map<string, HardGateViolationV1>()
  for (const item of items) {
    const key = [item.candidate_id ?? '', item.code, item.severity, item.detail].join('|')
    if (!map.has(key)) map.set(key, item)
  }
  return [...map.values()].sort((a, b) =>
    (a.candidate_id ?? '').localeCompare(b.candidate_id ?? '', 'en', { numeric: true }) ||
    a.code.localeCompare(b.code) || a.detail.localeCompare(b.detail))
}
function valueStrings(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  if (typeof value === 'number' && Number.isFinite(value)) return [String(value)]
  if (Array.isArray(value)) return value.flatMap(valueStrings)
  if (value && typeof value === 'object') return Object.values(value).flatMap(valueStrings)
  return []
}
function materializes(text: string, value: unknown): boolean {
  return valueStrings(value).filter(x => !/^\d+(?:\.\d+)?$/u.test(x) && normalize(x).length >= 4)
    .some(x => semanticMatch(text, x))
}
function money(text: string): number[] {
  const out: number[] = []
  const regex = /(?:R\$\s*([\d.]+(?:,\d{1,2})?)|([\d.]+(?:,\d{1,2})?)\s*reais\b)/giu
  for (const match of text.matchAll(regex)) {
    const raw = match[1] ?? match[2]
    if (!raw) continue
    const amount = Number(raw.replace(/\./g, '').replace(',', '.'))
    if (Number.isFinite(amount)) out.push(amount)
  }
  return out
}
function authorizedMoney(plan: MessagePlanV1): Array<{ key: string; amount: number }> {
  return plan.fact_requirements.filter(r => r.assertion_policy === 'may_assert').flatMap(r => {
    const objectAmount = r.value && typeof r.value === 'object' && !Array.isArray(r.value)
      ? (r.value as Record<string, unknown>).amount : null
    const amounts = valueStrings(r.value).flatMap(money)
    if (typeof objectAmount === 'number' && Number.isFinite(objectAmount)) amounts.push(objectAmount)
    return [...new Set(amounts)].map(amount => ({ key: r.requirement_key, amount }))
  })
}
function psychology(text: string): boolean {
  return /\bvoce\s+(?:e|esta|parece|continua)\s+(?:muito\s+)?(?:ansioso|ansiosa|inseguro|insegura|impulsivo|impulsiva|indeciso|indecisa)\b/u.test(normalize(text))
}
function temporal(text: string): string[] {
  const n = normalize(text)
  const patterns = [
    /\bdia\s+\d{1,2}\b/gu,
    /\b\d{1,2}\s+de\s+(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/gu,
    /\b(?:amanha|depois de amanha)\b/gu,
    /\b(?:segunda|terca|quarta|quinta|sexta|sabado|domingo)(?: feira)?\b/gu,
  ]
  return unique(patterns.flatMap(p => [...n.matchAll(p)].map(x => x[0])))
}
function temporalAuthorized(expr: string, plan: MessagePlanV1): boolean {
  const e = normalize(expr)
  return plan.fact_requirements.filter(r => r.assertion_policy === 'may_assert')
    .flatMap(r => valueStrings(r.value)).some(x => normalize(x).includes(e))
}

function factViolations(plan: MessagePlanV1, c: MessageCandidateV1): HardGateViolationV1[] {
  const out: HardGateViolationV1[] = []
  const byKey = new Map(plan.fact_requirements.map(r => [r.requirement_key, r] as const))
  const used = new Set(c.fact_requirements_used)
  for (const key of used) {
    const r = byKey.get(key)
    if (!r) { out.push(v('FACT_REQUIREMENT_UNKNOWN', `Fact requirement inexistente: ${key}.`, c.candidate_id, true)); continue }
    if (r.assertion_policy === 'must_not_assert') out.push(v('MUST_NOT_ASSERT_REFERENCED', `${key} possui must_not_assert.`, c.candidate_id, true))
    if (r.status === 'forbidden') out.push(v('FORBIDDEN_FACT_REFERENCED', `${key} possui status forbidden.`, c.candidate_id, true))
  }
  for (const r of plan.fact_requirements) {
    if (r.assertion_policy === 'must_not_assert' && materializes(c.text, r.value))
      out.push(v('MUST_NOT_ASSERT_TEXT', `Texto materializa ${r.requirement_key}.`, c.candidate_id, true))
    if (r.status === 'forbidden' && materializes(c.text, r.value))
      out.push(v('FORBIDDEN_FACT_TEXT', `Texto materializa fato proibido ${r.requirement_key}.`, c.candidate_id, true))
    if (r.assertion_policy === 'may_assert' && materializes(c.text, r.value) && !used.has(r.requirement_key))
      out.push(v('FACT_USAGE_METADATA_MISSING', `Texto usa ${r.requirement_key} sem metadata.`, c.candidate_id))
  }
  const allowed = authorizedMoney(plan)
  for (const amount of money(c.text)) {
    const matching = allowed.filter(x => Math.abs(x.amount - amount) < 0.005)
    if (!matching.length) out.push(v('UNAUTHORIZED_MONETARY_ASSERTION', `Valor monetário ${amount} não autorizado.`, c.candidate_id, true))
    else if (!matching.some(x => used.has(x.key))) out.push(v('FACT_USAGE_METADATA_MISSING', 'Valor monetário autorizado sem fact requirement correspondente.', c.candidate_id))
  }
  return out
}
function evidenceViolations(plan: MessagePlanV1, c: MessageCandidateV1): HardGateViolationV1[] {
  const out: HardGateViolationV1[] = [], messages = new Set(plan.evidence.message_ids), memories = new Set(plan.evidence.memory_ids)
  for (const id of c.evidence.message_ids) if (!messages.has(id)) out.push(v('EVIDENCE_MESSAGE_UNAUTHORIZED', `message_id não autorizado: ${id}.`, c.candidate_id, true))
  for (const id of c.evidence.memory_ids) if (!memories.has(id)) out.push(v('EVIDENCE_MEMORY_UNAUTHORIZED', `memory_id não autorizado: ${id}.`, c.candidate_id, true))
  return out
}
function provenanceViolations(plan: MessagePlanV1, c: MessageCandidateV1): HardGateViolationV1[] {
  const out: HardGateViolationV1[] = [], used = new Set(c.fact_requirements_used)
  const requirements = plan.fact_requirements.filter(r => used.has(r.requirement_key))
  const allowed = new Set([...plan.provenance, ...requirements.flatMap(r => r.provenance)].map(traceKey))
  const candidateKeys = new Set(c.provenance.map(traceKey))
  for (const trace of c.provenance) if (!allowed.has(traceKey(trace))) out.push(v('PROVENANCE_UNAUTHORIZED', 'SourceTrace fora da lineage autorizada.', c.candidate_id, true))
  for (const r of requirements) if (r.provenance.length && !r.provenance.some(t => candidateKeys.has(traceKey(t))))
    out.push(v('FACT_PROVENANCE_MISSING', `Provenance ausente para ${r.requirement_key}.`, c.candidate_id, true))
  return out
}
function nextStepViolations(plan: MessagePlanV1, c: MessageCandidateV1, questions: number): HardGateViolationV1[] {
  const out: HardGateViolationV1[] = [], kind = plan.next_step_plan.kind
  if (kind === 'none' && (questions > 0 || matchesNormalized(c.text, CTA))) out.push(v('UNAUTHORIZED_CTA', 'next_step none não autoriza pergunta/CTA comercial.', c.candidate_id, true))
  if (plan.commercial_move.move === 'close_conversation' && matchesNormalized(c.text, REOPEN)) out.push(v('REJECTION_REOPEN', 'close_conversation não permite reabertura.', c.candidate_id, true))
  if (kind === 'give_space' && matchesNormalized(c.text, PRESSURE)) out.push(v('TIMING_PRESSURE', 'give_space não permite pressão.', c.candidate_id, true))
  if (plan.commercial_move.move === 'respect_customer_timing' || kind === 'respect_timing') {
    if (matchesNormalized(c.text, PRESSURE)) out.push(v('TIMING_PRESSURE', 'respect_timing não permite pressão.', c.candidate_id, true))
    for (const expr of temporal(c.text)) if (!temporalAuthorized(expr, plan)) out.push(v('TIMING_DATE_INVENTED', `Referência temporal não autorizada: ${expr}.`, c.candidate_id, true))
  }
  if (plan.commercial_move.move === 'no_commercial_move' && matchesNormalized(c.text, NON_COMMERCIAL_CTA)) out.push(v('NON_COMMERCIAL_CTA', 'no_commercial_move não permite CTA comercial.', c.candidate_id, true))
  return out
}
function coverageTextViolations(plan: MessagePlanV1, c: MessageCandidateV1, questions: number): HardGateViolationV1[] {
  const out: HardGateViolationV1[] = [], covered = new Set(c.content_requirements_covered), n = normalize(c.text)
  if (covered.has('explain_quote_requirement') && !/(?:cotacao|confirmar|confirmacao|calculad|depende)/u.test(n)) out.push(v('CONTENT_COVERAGE_TEXT_INCONSISTENT', 'Coverage de quote sem limitação verificável no texto.', c.candidate_id))
  if (covered.has('clarify_missing_information') && plan.question_plan.should_ask && questions === 0) out.push(v('CONTENT_COVERAGE_TEXT_INCONSISTENT', 'Coverage de clarificação sem pergunta.', c.candidate_id))
  if (covered.has('propose_next_step') && !matchesNormalized(c.text, CTA) && !/\b(?:proxima etapa|seguir|avancar)\b/u.test(n)) out.push(v('CONTENT_COVERAGE_TEXT_INCONSISTENT', 'Coverage de próximo passo sem CTA verificável.', c.candidate_id))
  return out
}

function candidateViolations(plan: MessagePlanV1, c: MessageCandidateV1): HardGateViolationV1[] {
  const out: HardGateViolationV1[] = [], questions = countQuestions(c.text)
  if (!c.text.trim()) out.push(v('EMPTY_TEXT', 'Candidate text vazio.', c.candidate_id, true))
  if (!c.candidate_id.trim()) out.push(v('EMPTY_CANDIDATE_ID', 'candidate_id vazio.', c.candidate_id, true))
  if (c.generation_mode !== MODE) out.push(v('INVALID_GENERATION_MODE', `generation_mode inválido: ${c.generation_mode}.`, c.candidate_id, true))
  if (c.commercial_move !== plan.commercial_move.move) out.push(v('COMMERCIAL_MOVE_MISMATCH', 'commercial_move diverge do plano.', c.candidate_id, true))
  if (c.commercial_objective !== plan.commercial_objective) out.push(v('COMMERCIAL_OBJECTIVE_MISMATCH', 'commercial_objective diverge do plano.', c.candidate_id, true))
  if (questions > plan.question_plan.max_questions) out.push(v('QUESTION_LIMIT_EXCEEDED', `${questions} perguntas excedem máximo ${plan.question_plan.max_questions}.`, c.candidate_id, true))
  if (questions !== c.question_count) out.push(v('QUESTION_COUNT_MISMATCH', `question_count=${c.question_count}; texto=${questions}.`, c.candidate_id))
  if (!plan.question_plan.should_ask && questions > 0) out.push(v('SHOULD_NOT_ASK_HAS_QUESTION', 'should_ask=false com pergunta.', c.candidate_id, true))
  const planned = new Set(plan.content_requirements), covered = new Set(c.content_requirements_covered)
  for (const r of plan.content_requirements) if (!covered.has(r)) out.push(v('CONTENT_REQUIREMENT_MISSING', `Coverage obrigatório ausente: ${r}.`, c.candidate_id, true))
  for (const r of c.content_requirements_covered) if (!planned.has(r)) out.push(v('CONTENT_REQUIREMENT_EXTRA', `Coverage não autorizado: ${r}.`, c.candidate_id))
  out.push(...coverageTextViolations(plan, c, questions), ...factViolations(plan, c), ...evidenceViolations(plan, c), ...provenanceViolations(plan, c), ...nextStepViolations(plan, c, questions))
  for (const f of plan.forbidden_content) if (semanticMatch(c.text, f.rule)) out.push(v('FORBIDDEN_CONTENT', `Forbidden content: ${f.code}.`, c.candidate_id, true))
  if (matchesNormalized(c.text, JARGON)) out.push(v('INTERNAL_JARGON_EXPOSED', 'Jargão interno exposto.', c.candidate_id, true))
  if (matches(c.text, FRAMEWORKS)) out.push(v('FRAMEWORK_EXPOSED', 'Framework comercial exposto.', c.candidate_id, true))
  if (psychology(c.text)) out.push(v('PSYCHOLOGICAL_ATTRIBUTE_EXPOSED', 'Atributo psicológico explícito.', c.candidate_id, true))
  if (matches(c.text, COMMANDS)) out.push(v('COMMAND_LEAKAGE', 'Comando/payload operacional exposto.', c.candidate_id, true))
  return uniqViolations(out)
}

function globalViolations(plan: MessagePlanV1, input: HardGateInputV1): HardGateViolationV1[] {
  const r = input.generation_result, out: HardGateViolationV1[] = [], has = r.candidates.length > 0
  if (r.plan_status !== plan.status) out.push(v('GENERATION_PLAN_STATUS_MISMATCH', 'generation_result.plan_status diverge do plano.', null, true))
  if (r.commercial_move !== plan.commercial_move.move) out.push(v('GENERATION_MOVE_MISMATCH', 'generation_result.commercial_move diverge do plano.', null, true))
  if (r.commercial_objective !== plan.commercial_objective) out.push(v('GENERATION_OBJECTIVE_MISMATCH', 'generation_result.commercial_objective diverge do plano.', null, true))
  if (r.generation_allowed !== plan.generation_constraints.generation_allowed) out.push(v('GENERATION_ALLOWED_MISMATCH', 'generation_allowed diverge do plano.', null, true))
  if (['blocked', 'approval_required', 'not_generated'].includes(r.status) && has) out.push(v('GENERATION_STATUS_CANDIDATE_CONFLICT', `${r.status} não pode carregar candidates.`, null, true))
  if (r.status === 'generated' && !has) out.push(v('GENERATION_STATUS_CANDIDATE_CONFLICT', 'generated exige candidate.', null, true))
  if (plan.status === 'blocked' && r.status !== 'blocked') out.push(v('GENERATION_STATUS_PLAN_CONFLICT', 'Plano blocked exige result blocked.', null, true))
  if (plan.status === 'approval_required' && r.status !== 'approval_required') out.push(v('GENERATION_STATUS_PLAN_CONFLICT', 'Plano approval_required exige result approval_required.', null, true))
  if (plan.status === 'needs_information' && r.status !== 'needs_information') out.push(v('GENERATION_STATUS_PLAN_CONFLICT', 'Plano needs_information exige result needs_information.', null, true))
  if (!['blocked', 'approval_required', 'needs_information'].includes(plan.status) && !['generated', 'not_generated'].includes(r.status)) out.push(v('GENERATION_STATUS_PLAN_CONFLICT', `Status ${r.status} incompatível com ${plan.status}.`, null, true))
  return uniqViolations(out)
}
function setViolations(plan: MessagePlanV1, input: HardGateInputV1): Map<number, HardGateViolationV1[]> {
  const result = input.generation_result, map = new Map<number, HardGateViolationV1[]>()
  const add = (i: number, item: HardGateViolationV1) => map.set(i, [...(map.get(i) ?? []), item])
  const hardGap = plan.fact_requirements.some(r => r.necessity === 'required' && r.gap_impact === 'hard' && r.assertion_policy === 'must_not_assert')
  result.candidates.forEach((c, i) => {
    if (plan.status === 'blocked') add(i, v('GOVERNANCE_BLOCKED_CANDIDATE', 'Plano blocked não pode possuir candidate.', c.candidate_id, true))
    if (plan.status === 'approval_required') add(i, v('APPROVAL_REQUIRED_CANDIDATE', 'Plano approval_required não pode possuir candidate.', c.candidate_id, true))
    if (!plan.generation_constraints.generation_allowed || !result.generation_allowed) add(i, v('GENERATION_NOT_ALLOWED_CANDIDATE', 'Candidate com generation_allowed=false.', c.candidate_id, true))
    if (hardGap) add(i, v('HARD_GAP_HAS_CANDIDATE', 'Candidate apesar de required hard gap must_not_assert.', c.candidate_id, true))
  })
  const ids = new Map<string, number[]>(), texts = new Map<string, number[]>()
  result.candidates.forEach((c, i) => {
    ids.set(c.candidate_id, [...(ids.get(c.candidate_id) ?? []), i])
    const n = normalize(c.text); texts.set(n, [...(texts.get(n) ?? []), i])
  })
  for (const indexes of ids.values()) if (indexes.length > 1) for (const i of indexes) add(i, v('DUPLICATE_CANDIDATE_ID', `candidate_id duplicado: ${result.candidates[i].candidate_id}.`, result.candidates[i].candidate_id, true))
  for (const [text, indexes] of texts) if (text && indexes.length > 1) for (const i of indexes) add(i, v('DUPLICATE_CANDIDATE_TEXT', 'Texto equivalente a outro candidate.', result.candidates[i].candidate_id, true))
  if (result.candidates.length > 3) result.candidates.forEach((c, i) => add(i, v('MAX_CANDIDATES_EXCEEDED', `${result.candidates.length} candidates excedem máximo 3.`, c.candidate_id, true)))
  return map
}
function statusFor(plan: MessagePlanV1, input: HardGateInputV1, globals: readonly HardGateViolationV1[], candidates: readonly CandidateHardGateResultV1[]): HardGateResultStatusV1 {
  if (plan.status === 'blocked' && input.generation_result.status === 'blocked' && !input.generation_result.candidates.length && !globals.length) return 'blocked'
  if (plan.status === 'approval_required' && input.generation_result.status === 'approval_required' && !input.generation_result.candidates.length && !globals.length) return 'approval_required'
  const pass = candidates.filter(c => c.status === 'pass').length
  if (!candidates.length || !pass) return 'all_failed'
  return pass === candidates.length ? 'all_passed' : 'partially_passed'
}

export function runHardGatesV1(input: HardGateInputV1): HardGateResultV1 {
  const plan = input.message_plan, globals = globalViolations(plan, input), set = setViolations(plan, input)
  let candidates: CandidateHardGateResultV1[] = input.generation_result.candidates.map((c, i) => {
    const violations = uniqViolations([...candidateViolations(plan, c), ...(set.get(i) ?? [])])
    return { candidate_id: c.candidate_id, status: violations.length ? 'fail' : 'pass', violations }
  })
  if (globals.length && candidates.length) candidates = candidates.map(c => ({
    ...c, status: 'fail', violations: uniqViolations([...c.violations, ...globals.map(g => ({ ...g, candidate_id: c.candidate_id }))]),
  }))
  const passed = candidates.filter(c => c.status === 'pass').map(c => c.candidate_id)
  const failed = candidates.filter(c => c.status === 'fail').map(c => c.candidate_id)
  return {
    contract_version: HARD_GATE_CONTRACT_VERSION,
    status: statusFor(plan, input, globals, candidates),
    candidates,
    passed_candidate_ids: passed,
    failed_candidate_ids: failed,
    violations: uniqViolations([...globals, ...candidates.flatMap(c => c.violations)]),
  }
}

export function createHardGateV1() {
  return { evaluate: runHardGatesV1 }
}