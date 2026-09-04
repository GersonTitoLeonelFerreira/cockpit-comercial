import type {
  CandidateCritiqueV1,
  CriticInputV1,
  CriticIssueV1,
  CriticResultV1,
} from './critic-contracts'

import {
  critiqueMessageCandidatesV1 as critiqueCoreV1,
} from './commercial-naturalness-critic-core'

function normalizeText(
  value: string,
): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim()
}

function sellerExplicitlyReopensMemory(
  input: CriticInputV1,
): boolean {
  const intent =
    normalizeText(
      input.message_plan
        .seller_intent.value,
    )

  switch (
    input.message_plan
      .situation.situation
  ) {
    case 'objection':
      return /\b(?:objecao|barreira|resistencia|preco|caro|orcamento)\w*/u.test(
        intent,
      )

    case 'uncertainty':
    case 'decision_pending':
      return /\b(?:duvida|incerteza|indecis|decisao|pensar|analisar|risco)\w*/u.test(
        intent,
      )

    default:
      return true
  }
}

function staleMemoryOnlySituation(
  input: CriticInputV1,
): boolean {
  const situation =
    input.message_plan
      .situation

  if (
    ![
      'objection',
      'uncertainty',
      'decision_pending',
    ].includes(
      situation.situation,
    )
  ) {
    return false
  }

  if (
    situation.evidence.length === 0 ||
    !situation.evidence.every(
      evidence =>
        evidence.source === 'memory',
    )
  ) {
    return false
  }

  return !sellerExplicitlyReopensMemory(
    input,
  )
}

function staleMemoryIssue(): CriticIssueV1 {
  return {
    code:
      'SELLER_INTENT_MISMATCH',
    dimension:
      'commercial_coherence',
    severity: 'major',
    detail:
      'A situação comercial está sustentada somente por memória histórica sem evidência no turno atual nem pedido explícito do vendedor para reabrir esse assunto.',
  }
}

function forceWeak(
  critique: CandidateCritiqueV1,
): CandidateCritiqueV1 {
  const issue =
    staleMemoryIssue()

  const issues = [
    ...critique.issues.filter(
      current =>
        !(
          current.code ===
            issue.code &&
          current.detail ===
            issue.detail
        ),
    ),
    issue,
  ]

  return {
    ...critique,
    status: 'weak',
    overall_score:
      Math.min(
        critique.overall_score,
        55,
      ),
    dimensions: {
      ...critique.dimensions,
      commercial_coherence:
        Math.min(
          critique.dimensions
            .commercial_coherence ??
            55,
          55,
        ),
    },
    strengths: [],
    issues,
  }
}

function applyMemoryRelevanceGuard(
  input: CriticInputV1,
  result: CriticResultV1,
): CriticResultV1 {
  if (
    result.status !== 'evaluated' ||
    !staleMemoryOnlySituation(
      input,
    )
  ) {
    return result
  }

  const critiques =
    result.critiques.map(
      forceWeak,
    )

  return {
    ...result,
    critiques,
    recommended_candidate_ids: [],
    acceptable_candidate_ids: [],
    weak_candidate_ids:
      result.ranked_candidate_ids
        .filter(id =>
          critiques.some(
            critique =>
              critique.candidate_id === id,
          ),
        ),
  }
}

export function critiqueMessageCandidatesV1(
  input: CriticInputV1,
): CriticResultV1 {
  return applyMemoryRelevanceGuard(
    input,
    critiqueCoreV1(input),
  )
}

export function createCommercialNaturalnessCriticV1() {
  return {
    critique:
      critiqueMessageCandidatesV1,
  }
}
