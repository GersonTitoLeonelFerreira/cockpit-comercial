'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getUserSalesCycles,
  moveCycleStage,
  assignCycleOwner,
  setCycleNextAction,
} from '../lib/salesCyclesService'
import type { SalesCycle, CycleStatus } from '../types/sales_cycles'

export type UseSalesCyclesState = {
  cycles: SalesCycle[]
  loading: boolean
  error: string | null
  loadCycles: () => Promise<void>
  moveCycle: (
    cycleId: string,
    fromStatus: CycleStatus,
    toStatus: CycleStatus,
    opts?: { dealValue?: number | null; lossReason?: string | null }
  ) => Promise<void>
  assignOwner: (cycleId: string, newOwnerId: string) => Promise<void>
  closeWon: (cycleId: string, fromStatus: CycleStatus, dealValue?: number | null) => Promise<void>
  closeLost: (cycleId: string, fromStatus: CycleStatus, lossReason?: string | null) => Promise<void>
  setNextAction: (cycleId: string, action: string | null, date: string | null) => Promise<void>
}

export function useSalesCycles(
  userId: string,
  companyId: string,
  refetchIntervalMs = 0
): UseSalesCyclesState {
  const [cycles, setCycles] = useState<SalesCycle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadCycles = useCallback(async () => {
    if (!userId || !companyId) return
    setLoading(true)
    setError(null)
    try {
      const data = await getUserSalesCycles(userId, companyId)
      setCycles(data)
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao carregar ciclos.')
    } finally {
      setLoading(false)
    }
  }, [userId, companyId])

  // initial load + refetch interval
  useEffect(() => {
    void loadCycles()

    if (refetchIntervalMs > 0) {
      intervalRef.current = setInterval(() => void loadCycles(), refetchIntervalMs)
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [loadCycles, refetchIntervalMs])

  const moveCycle = useCallback(
    async (
      cycleId: string,
      fromStatus: CycleStatus,
      toStatus: CycleStatus,
      opts?: { dealValue?: number | null; lossReason?: string | null }
    ) => {
      // Optimistic update
      setCycles((prev) =>
        prev.map((c) =>
          c.id === cycleId ? { ...c, status: toStatus, stage_entered_at: new Date().toISOString() } : c
        )
      )
      try {
        await moveCycleStage(cycleId, companyId, fromStatus, toStatus, userId, opts)
      } catch (e: any) {
        // rollback
        setCycles((prev) =>
          prev.map((c) => (c.id === cycleId ? { ...c, status: fromStatus } : c))
        )
        throw e
      }
    },
    [companyId, userId]
  )

  const assignOwner = useCallback(
    async (cycleId: string, newOwnerId: string) => {
      await assignCycleOwner(cycleId, companyId, newOwnerId, userId)
      setCycles((prev) => prev.filter((c) => c.id !== cycleId))
    },
    [companyId, userId]
  )

  const closeWon = useCallback(
    async (cycleId: string, fromStatus: CycleStatus, dealValue?: number | null) => {
      await moveCycle(cycleId, fromStatus, 'ganho', { dealValue })
    },
    [moveCycle]
  )

  const closeLost = useCallback(
    async (cycleId: string, fromStatus: CycleStatus, lossReason?: string | null) => {
      await moveCycle(cycleId, fromStatus, 'perdido', { lossReason })
    },
    [moveCycle]
  )

  const setNextAction = useCallback(
    async (cycleId: string, action: string | null, date: string | null) => {
      await setCycleNextAction(cycleId, companyId, userId, action, date)
      setCycles((prev) =>
        prev.map((c) =>
          c.id === cycleId ? { ...c, next_action: action, next_action_date: date } : c
        )
      )
    },
    [companyId, userId]
  )

  return {
    cycles,
    loading,
    error,
    loadCycles,
    moveCycle,
    assignOwner,
    closeWon,
    closeLost,
    setNextAction,
  }
}
