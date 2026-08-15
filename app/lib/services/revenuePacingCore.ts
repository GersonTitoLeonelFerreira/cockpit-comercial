export type RevenuePacing = {
  totalExecutionDays: number
  elapsedExecutionDays: number
  remainingExecutionDays: number
  totalReal: number
  goal: number
  gap: number
  averagePerElapsedExecutionDay: number
  requiredPerRemainingExecutionDay: number
  projection: number
  pacingRatio: number
}

export function buildRevenuePacingFromDayCounts(params: {
  totalReal: number
  goal: number
  totalExecutionDays: number
  elapsedExecutionDays: number
  remainingExecutionDays: number
}): RevenuePacing {
  const totalReal = Math.max(0, Number(params.totalReal) || 0)
  const goal = Math.max(0, Number(params.goal) || 0)
  const totalExecutionDays = Math.max(0, Number(params.totalExecutionDays) || 0)
  const elapsedExecutionDays = Math.max(0, Number(params.elapsedExecutionDays) || 0)
  const remainingExecutionDays = Math.max(0, Number(params.remainingExecutionDays) || 0)
  const gap = Math.max(0, goal - totalReal)
  const averagePerElapsedExecutionDay =
    elapsedExecutionDays > 0 ? totalReal / elapsedExecutionDays : 0
  const requiredPerRemainingExecutionDay =
    remainingExecutionDays > 0 ? gap / remainingExecutionDays : gap
  const projection = averagePerElapsedExecutionDay * Math.max(1, totalExecutionDays)
  const pacingRatio = goal > 0 ? projection / goal : 0

  return {
    totalExecutionDays,
    elapsedExecutionDays,
    remainingExecutionDays,
    totalReal,
    goal,
    gap,
    averagePerElapsedExecutionDay,
    requiredPerRemainingExecutionDay,
    projection,
    pacingRatio,
  }
}
