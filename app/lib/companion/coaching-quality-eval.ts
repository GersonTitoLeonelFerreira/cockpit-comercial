export const COACHING_QUALITY_EVAL_VERSION =
  'coaching-quality-eval-v1' as const

export const COACHING_QUALITY_BASELINE_THRESHOLD =
  85 as const

export const COACHING_QUALITY_GROUNDING_FLOOR =
  90 as const

export const COACHING_QUALITY_DIMENSION_WEIGHTS =
  Object.freeze({
    context_fidelity: 15,
    seller_execution_diagnosis: 15,
    sequence_method: 15,
    non_obviousness: 10,
    technique: 15,
    practical_action: 10,
    message_quality: 10,
    grounding_safety: 10,
  } as const)

export type CoachingQualityDimension =
  keyof typeof COACHING_QUALITY_DIMENSION_WEIGHTS

export type CoachingQualityScores =
  Record<CoachingQualityDimension, number>

export type CoachingQualityBlockingViolation =
  | 'generic_message'
  | 'invented_fact'
  | 'unsupported_company_claim'
  | 'automatic_send'

export type CoachingQualityEvaluation = {
  version:
    typeof COACHING_QUALITY_EVAL_VERSION
  case_id: string
  weighted_score: number
  meets_baseline: boolean
  blocking_violations:
    CoachingQualityBlockingViolation[]
  scores: CoachingQualityScores
}

function requireScore(
  value: number,
  dimension: CoachingQualityDimension,
): number {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  ) {
    throw new RangeError(
      `Invalid coaching quality score for ${dimension}: expected 0..100.`,
    )
  }

  return value
}

export function evaluateCoachingQuality({
  case_id,
  scores,
  blocking_violations = [],
}: {
  case_id: string
  scores: CoachingQualityScores
  blocking_violations?:
    CoachingQualityBlockingViolation[]
}): CoachingQualityEvaluation {
  const entries =
    Object.entries(
      COACHING_QUALITY_DIMENSION_WEIGHTS,
    ) as [
      CoachingQualityDimension,
      number,
    ][]

  const normalizedScores =
    Object.fromEntries(
      entries.map(
        ([dimension]) => [
          dimension,
          requireScore(
            scores[dimension],
            dimension,
          ),
        ],
      ),
    ) as CoachingQualityScores

  const weightTotal =
    entries.reduce(
      (total, [, weight]) =>
        total + weight,
      0,
    )

  const weightedScore =
    entries.reduce(
      (total, [dimension, weight]) =>
        total +
        normalizedScores[dimension] *
          weight,
      0,
    ) / weightTotal

  const uniqueViolations =
    Array.from(
      new Set(
        blocking_violations,
      ),
    )

  const roundedScore =
    Math.round(
      weightedScore * 100,
    ) / 100

  const meetsBaseline =
    roundedScore >=
      COACHING_QUALITY_BASELINE_THRESHOLD &&
    normalizedScores.grounding_safety >=
      COACHING_QUALITY_GROUNDING_FLOOR &&
    uniqueViolations.length === 0

  return {
    version:
      COACHING_QUALITY_EVAL_VERSION,
    case_id,
    weighted_score:
      roundedScore,
    meets_baseline:
      meetsBaseline,
    blocking_violations:
      uniqueViolations,
    scores:
      normalizedScores,
  }
}
