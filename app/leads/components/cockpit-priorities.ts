export type CockpitPriorityBucket = 'overdue' | 'today' | 'missing'

export type CockpitPriorityStatus =
  | 'novo'
  | 'contato'
  | 'respondeu'
  | 'negociacao'
  | 'ganho'
  | 'perdido'

export type CockpitPriorityItemSnapshot = {
  id: string
  status: CockpitPriorityStatus
  next_action: string | null
  next_action_date: string | null
  stage_entered_at: string
}

export type CockpitPriorityBuckets<T extends CockpitPriorityItemSnapshot> = Record<
  CockpitPriorityBucket,
  T[]
>

const OPERATIONAL_PRIORITY_STATUSES = new Set<CockpitPriorityStatus>([
  'contato',
  'respondeu',
  'negociacao',
])

function toValidTimestamp(value: string | null) {
  if (!value) return null

  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

function isSameLocalDay(dateA: Date, dateB: Date) {
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  )
}

export function getCockpitPriorityBucket(
  item: CockpitPriorityItemSnapshot,
  now: Date,
): CockpitPriorityBucket | null {
  if (!OPERATIONAL_PRIORITY_STATUSES.has(item.status)) return null

  const actionTimestamp = toValidTimestamp(item.next_action_date)

  if (actionTimestamp !== null) {
    if (actionTimestamp < now.getTime()) return 'overdue'

    const actionDate = new Date(actionTimestamp)
    if (isSameLocalDay(actionDate, now)) return 'today'
  }

  if (!item.next_action?.trim() || actionTimestamp === null) return 'missing'

  return null
}

export function buildCockpitPriorityBuckets<T extends CockpitPriorityItemSnapshot>(
  items: T[],
  now: Date,
): CockpitPriorityBuckets<T> {
  const buckets: CockpitPriorityBuckets<T> = {
    overdue: [],
    today: [],
    missing: [],
  }

  for (const item of items) {
    const bucket = getCockpitPriorityBucket(item, now)
    if (bucket) buckets[bucket].push(item)
  }

  buckets.overdue.sort(
    (a, b) =>
      (toValidTimestamp(a.next_action_date) ?? 0) -
      (toValidTimestamp(b.next_action_date) ?? 0),
  )
  buckets.today.sort(
    (a, b) =>
      (toValidTimestamp(a.next_action_date) ?? 0) -
      (toValidTimestamp(b.next_action_date) ?? 0),
  )
  buckets.missing.sort(
    (a, b) =>
      (toValidTimestamp(a.stage_entered_at) ?? 0) -
      (toValidTimestamp(b.stage_entered_at) ?? 0),
  )

  return buckets
}

