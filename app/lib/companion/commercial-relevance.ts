export const COMMERCIAL_RELEVANCES = [
  'commercial',
  'non_commercial',
  'uncertain',
] as const

export type CommercialRelevance =
  (typeof COMMERCIAL_RELEVANCES)[number]

export function isCommercialRelevance(
  value: unknown,
): value is CommercialRelevance {
  return (
    typeof value === 'string' &&
    COMMERCIAL_RELEVANCES.includes(
      value as CommercialRelevance,
    )
  )
}

export function isCommerciallyActionable(
  value: CommercialRelevance,
): value is 'commercial' {
  return value === 'commercial'
}
