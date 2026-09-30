import {
  countExecutionDaysInRange,
  countExecutionDaysUntilToday,
  countRemainingExecutionDays,
  type ExecutionDayOverrides,
  type WorkDays,
} from './executionDayMath'
import {
  buildRevenuePacingFromDayCounts,
  type RevenuePacing,
} from './revenuePacingCore'

export type { RevenuePacing } from './revenuePacingCore'

export function buildRevenuePacing(params: {
  totalReal: number
  goal: number
  periodStart: string
  periodEnd: string
  workDays: WorkDays
  executionDayOverrides?: ExecutionDayOverrides
  referenceDate?: Date
}): RevenuePacing {
  const overrides = params.executionDayOverrides ?? {}
  const referenceDate = params.referenceDate ?? new Date()

  const totalExecutionDays = countExecutionDaysInRange(
    params.periodStart,
    params.periodEnd,
    params.workDays,
    overrides,
  )
  const elapsedExecutionDays = countExecutionDaysUntilToday(
    params.periodStart,
    params.periodEnd,
    params.workDays,
    overrides,
    referenceDate,
  )
  const remainingExecutionDays = countRemainingExecutionDays(
    params.periodEnd,
    params.workDays,
    overrides,
    referenceDate,
  )

  return buildRevenuePacingFromDayCounts({
    totalExecutionDays,
    elapsedExecutionDays,
    remainingExecutionDays,
    totalReal: params.totalReal,
    goal: params.goal,
  })
}
