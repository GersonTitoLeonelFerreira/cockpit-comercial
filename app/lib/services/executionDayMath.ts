export type ExecutionDayOverrides = Record<string, boolean>
export type WorkDays = Record<number, boolean>
export type ExecutionDayCalendarSpan = {
  periodStart: string
  periodEnd: string
  workDays: WorkDays
  executionDayOverrides?: ExecutionDayOverrides
}

export function getDefaultWorkDays(): WorkDays {
  return {
    0: false,
    1: true,
    2: true,
    3: true,
    4: true,
    5: true,
    6: false,
  }
}

export function normalizeWorkDays(value: unknown): WorkDays {
  const fallback = getDefaultWorkDays()

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fallback
  }

  const source = value as Record<string, unknown>
  const normalized: WorkDays = { ...fallback }

  for (const key of Object.keys(fallback)) {
    const configuredValue = source[key]

    if (typeof configuredValue === 'boolean') {
      normalized[Number(key)] = configuredValue
    }
  }

  return normalized
}

export function normalizeExecutionDayOverrides(value: unknown): ExecutionDayOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const normalized: ExecutionDayOverrides = {}

  for (const [date, enabled] of Object.entries(value as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue

    if (typeof enabled === 'boolean') {
      normalized[date] = enabled
    }
  }

  return normalized
}

function toYMD(value: string): string {
  return (value ?? '').split('T')[0].split(' ')[0]
}

function toLocalDate(value: string): Date {
  const date = new Date(`${toYMD(value)}T00:00:00`)
  date.setHours(0, 0, 0, 0)
  return date
}

export function getBusinessDateKey(referenceDate: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(referenceDate)
  const values = new Map(parts.map((part) => [part.type, part.value]))

  return `${values.get('year')}-${values.get('month')}-${values.get('day')}`
}

export function shiftDateKey(dateKey: string, days: number): string {
  const [year, month, day] = toYMD(dateKey).split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day, 12))

  date.setUTCDate(date.getUTCDate() + days)

  return date.toISOString().slice(0, 10)
}

function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

export function isExecutionDay(
  date: Date,
  workDays: WorkDays,
  overrides: ExecutionDayOverrides = {},
): boolean {
  const key = toDateKey(date)

  if (Object.prototype.hasOwnProperty.call(overrides, key)) {
    return Boolean(overrides[key])
  }

  return Boolean(workDays[date.getDay()])
}

function countExecutionDaysBetween(
  start: Date,
  end: Date,
  workDays: WorkDays,
  overrides: ExecutionDayOverrides,
): number {
  if (end < start) return 0

  let count = 0
  const current = new Date(start)

  while (current <= end) {
    if (isExecutionDay(current, workDays, overrides)) count += 1
    current.setDate(current.getDate() + 1)
  }

  return count
}

export function countExecutionDaysInRange(
  startYMD: string,
  endYMD: string,
  workDays: WorkDays,
  overrides: ExecutionDayOverrides = {},
): number {
  return countExecutionDaysBetween(
    toLocalDate(startYMD),
    toLocalDate(endYMD),
    workDays,
    overrides,
  )
}

export function countExecutionDaysAcrossCalendars(
  startYMD: string,
  endYMD: string,
  calendars: ExecutionDayCalendarSpan[],
  fallbackWorkDays: WorkDays = getDefaultWorkDays(),
): number {
  const start = toLocalDate(startYMD)
  const end = toLocalDate(endYMD)

  if (end < start) return 0

  let count = 0
  const current = new Date(start)

  while (current <= end) {
    const key = toDateKey(current)
    const calendar = calendars.find(
      (item) => key >= toYMD(item.periodStart) && key <= toYMD(item.periodEnd),
    )
    const workDays = calendar?.workDays ?? fallbackWorkDays
    const overrides = calendar?.executionDayOverrides ?? {}

    if (isExecutionDay(current, workDays, overrides)) count += 1
    current.setDate(current.getDate() + 1)
  }

  return count
}

export function countExecutionDaysUntilToday(
  startYMD: string,
  endYMD: string,
  workDays: WorkDays,
  overrides: ExecutionDayOverrides = {},
  referenceDate: Date = new Date(),
): number {
  const start = toLocalDate(startYMD)
  const end = toLocalDate(endYMD)
  const today = toLocalDate(getBusinessDateKey(referenceDate))

  return countExecutionDaysBetween(
    start,
    today < end ? today : end,
    workDays,
    overrides,
  )
}

export function countRemainingExecutionDays(
  endYMD: string,
  workDays: WorkDays,
  overrides: ExecutionDayOverrides = {},
  referenceDate: Date = new Date(),
): number {
  const today = toLocalDate(getBusinessDateKey(referenceDate))

  return countExecutionDaysBetween(
    today,
    toLocalDate(endYMD),
    workDays,
    overrides,
  )
}
