export type RevenueAllocationDay = {
  date: string
  value: number
  sourceKind: 'seller' | 'extra'
  sourceId: string
}

export type RevenueAllocationCycle = {
  id: string
  sellerId: string
  date: string
  rawValue: number
}

export function allocateOfficialSellerRevenueToCycles(
  cycles: RevenueAllocationCycle[],
  revenueDays: RevenueAllocationDay[],
): Map<string, number> {
  const officialBySellerDay = new Map<string, number>()

  for (const day of revenueDays) {
    if (day.sourceKind !== 'seller' || !day.sourceId) continue

    const key = `${day.sourceId}|${day.date}`
    officialBySellerDay.set(key, (officialBySellerDay.get(key) ?? 0) + day.value)
  }

  const cyclesBySellerDay = new Map<string, RevenueAllocationCycle[]>()

  for (const cycle of cycles) {
    const key = `${cycle.sellerId}|${cycle.date}`
    const group = cyclesBySellerDay.get(key) ?? []
    group.push(cycle)
    cyclesBySellerDay.set(key, group)
  }

  const allocated = new Map<string, number>()

  for (const [key, group] of cyclesBySellerDay) {
    const rawTotal = group.reduce((sum, cycle) => sum + Math.max(0, cycle.rawValue), 0)
    const officialTotal = Number(officialBySellerDay.get(key) || 0)

    for (const cycle of group) {
      const share = rawTotal > 0
        ? Math.max(0, cycle.rawValue) / rawTotal
        : 1 / group.length

      allocated.set(cycle.id, officialTotal * share)
    }
  }

  return allocated
}
