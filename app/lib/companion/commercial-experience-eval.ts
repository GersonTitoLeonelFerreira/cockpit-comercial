import type {
  CommercialReadingDecision,
} from './commercial-reading-contract'

import type {
  DiagnosticLeadStatus,
} from './diagnostic-contract'

export const COMMERCIAL_EXPERIENCE_EVAL_VERSION =
  'commercial-experience-eval-v1' as const

export type CommercialExperienceTurn = {
  direction: 'incoming' | 'outgoing'
  text: string
}

export type CommercialExperienceExpected = {
  commercial_relevance:
    'commercial' | 'non_commercial' | 'uncertain'

  buyer_side: boolean
  third_party_prospect: boolean

  minimum_stage:
    DiagnosticLeadStatus | null

  waiting_on:
    'seller' | 'customer' | 'unknown'

  decision:
    CommercialReadingDecision | null

  technique_ids: string[]
  required_company_knowledge_sources: string[]

  must_not: string[]
}

export type CommercialExperienceCase = {
  id: string
  title: string
  scenario: string
  turns: CommercialExperienceTurn[]
  company_rules: string[]
  expected: CommercialExperienceExpected
}

export type CommercialExperienceObserved = {
  commercial_relevance:
    'commercial' | 'non_commercial' | 'uncertain'

  buyer_side: boolean
  third_party_prospect: boolean

  stage:
    DiagnosticLeadStatus | null

  waiting_on:
    'seller' | 'customer' | 'unknown'

  decision:
    CommercialReadingDecision | null

  technique_ids: string[]
  company_knowledge_sources: string[]

  orientation: string
}

export type CommercialExperienceEvalCheck = {
  key: string
  passed: boolean
  expected: string
  observed: string
}

export type CommercialExperienceEvalResult = {
  version:
    typeof COMMERCIAL_EXPERIENCE_EVAL_VERSION

  case_id: string
  passed: boolean
  score: number
  checks: CommercialExperienceEvalCheck[]
}

const STAGE_RANK: Partial<
  Record<DiagnosticLeadStatus, number>
> = {
  novo: 0,
  contato: 1,
  respondeu: 2,
  negociacao: 3,
}

function normalized(
  value: string,
): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function stageMeetsMinimum(
  observed: DiagnosticLeadStatus | null,
  minimum: DiagnosticLeadStatus | null,
): boolean {
  if (minimum === null) {
    return true
  }

  if (observed === null) {
    return false
  }

  const minimumRank =
    STAGE_RANK[minimum]
  const observedRank =
    STAGE_RANK[observed]

  if (
    minimumRank === undefined ||
    observedRank === undefined
  ) {
    return observed === minimum
  }

  return observedRank >= minimumRank
}

function containsAll(
  observed: string[],
  expected: string[],
): boolean {
  const set = new Set(observed)
  return expected.every(item => set.has(item))
}

function pushCheck(
  checks: CommercialExperienceEvalCheck[],
  key: string,
  passed: boolean,
  expected: unknown,
  observed: unknown,
): void {
  checks.push({
    key,
    passed,
    expected:
      JSON.stringify(expected),
    observed:
      JSON.stringify(observed),
  })
}

export function evaluateCommercialExperience({
  experience,
  observed,
}: {
  experience: CommercialExperienceCase
  observed: CommercialExperienceObserved
}): CommercialExperienceEvalResult {
  const checks:
    CommercialExperienceEvalCheck[] = []

  const expected =
    experience.expected

  pushCheck(
    checks,
    'commercial_relevance',
    observed.commercial_relevance ===
      expected.commercial_relevance,
    expected.commercial_relevance,
    observed.commercial_relevance,
  )

  pushCheck(
    checks,
    'buyer_side',
    observed.buyer_side ===
      expected.buyer_side,
    expected.buyer_side,
    observed.buyer_side,
  )

  pushCheck(
    checks,
    'third_party_prospect',
    observed.third_party_prospect ===
      expected.third_party_prospect,
    expected.third_party_prospect,
    observed.third_party_prospect,
  )

  pushCheck(
    checks,
    'minimum_stage',
    stageMeetsMinimum(
      observed.stage,
      expected.minimum_stage,
    ),
    expected.minimum_stage,
    observed.stage,
  )

  pushCheck(
    checks,
    'waiting_on',
    observed.waiting_on ===
      expected.waiting_on,
    expected.waiting_on,
    observed.waiting_on,
  )

  pushCheck(
    checks,
    'decision',
    expected.decision === null ||
    observed.decision ===
      expected.decision,
    expected.decision,
    observed.decision,
  )

  pushCheck(
    checks,
    'techniques',
    containsAll(
      observed.technique_ids,
      expected.technique_ids,
    ),
    expected.technique_ids,
    observed.technique_ids,
  )

  pushCheck(
    checks,
    'company_knowledge',
    containsAll(
      observed.company_knowledge_sources,
      expected
        .required_company_knowledge_sources,
    ),
    expected.required_company_knowledge_sources,
    observed.company_knowledge_sources,
  )

  const orientation =
    normalized(observed.orientation)

  const prohibitedMatches =
    expected.must_not.filter(
      item =>
        orientation.includes(
          normalized(item),
        ),
    )

  pushCheck(
    checks,
    'must_not',
    prohibitedMatches.length === 0,
    [],
    prohibitedMatches,
  )

  const passedCount =
    checks.filter(check => check.passed)
      .length

  const score =
    checks.length === 0
      ? 0
      : Math.round(
          (
            passedCount /
            checks.length
          ) * 100,
        )

  return {
    version:
      COMMERCIAL_EXPERIENCE_EVAL_VERSION,
    case_id:
      experience.id,
    passed:
      checks.every(check => check.passed),
    score,
    checks,
  }
}
