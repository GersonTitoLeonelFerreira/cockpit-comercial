export type ExecutionDayOverrides = Record<string, boolean>
export type WorkDays = Record<number, boolean>

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

function toYMD(value: string): string {
  return (value ?? '').split('T')[0].split(' ')[0]
}

function toLocalDate(value: string): Date {
  const date = new Date(`${toYMD(value)}T00:00:00`)
  date.setHours(0, 0, 0, 0)
  return date
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

export function countExecutionDaysUntilToday(
  startYMD: string,
  endYMD: string,
  workDays: WorkDays,
  overrides: ExecutionDayOverrides = {},
  referenceDate: Date = new Date(),
): number {
  const start = toLocalDate(startYMD)
  const end = toLocalDate(endYMD)
  const today = new Date(referenceDate)
  today.setHours(0, 0, 0, 0)

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
  const today = new Date(referenceDate)
  today.setHours(0, 0, 0, 0)

  return countExecutionDaysBetween(
    today,
    toLocalDate(endYMD),
    workDays,
    overrides,
  )
}
