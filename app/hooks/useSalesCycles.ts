'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  UserCycle,
  LeadStatus,
  MoveCycleStageRequest,
  AssignCycleOwnerRequest,
  SetNextActionRequest,
  CloseCycleWonRequest,
  CloseCycleLostRequest,
} from '@/app/types/sales_cycles'
import {
  getUserSalesCycles,
  moveCycleStage,
  assignCycleOwner,
  setNextAction,
  closeCycleWon,
  closeCycleLost,
  getCycleEvents,
} from '@/app/lib/services/sales-cycles'

interface UseSalesCyclesOptions {
  ownerUserId?: string
  status?: LeadStatus
  limit?: number
  autoLoad?: boolean
}

interface UseSalesCyclesReturn {
  cycles: UserCycle[]
  loading: boolean
  error: string | null
  loadCycles: () => Promise<void>
  moveCycle: (cycleId: string, toStatus: LeadStatus) => Promise<void>
  assignOwner: (cycleId: string, ownerUserId: string) => Promise<void>
  setAction: (cycleId: string, action: string, date: Date) => Promise<void>
  closeWon: (cycleId: string, wonValue?: number) => Promise<void>
  closeLost: (cycleId: string, lossReason?: string) => Promise<void>
  refetch: () => Promise<void>
}

/**
 * Hook para gerenciar sales cycles do usuário
 * Fornece estado, carregamento, e operações CRUD
 */
export function useSalesCycles(options: UseSalesCyclesOptions = {}): UseSalesCyclesReturn {
  const {
    ownerUserId,
    status,
    limit = 100,
    autoLoad = true,
  } = options

  const [cycles, setCycles] = useState<UserCycle[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ============================================================================
  // Load cycles
  // ============================================================================

  const loadCycles = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const data = await getUserSalesCycles(ownerUserId, status, limit)
      setCycles(data)
    } catch (err: any) {
      const message = err?.message || 'Erro ao carregar ciclos'
      setError(message)
      console.error('[useSalesCycles] Error loading:', err)
    } finally {
      setLoading(false)
    }
  }, [ownerUserId, status, limit])

  // ============================================================================
  // Move cycle to new stage
  // ============================================================================

  const moveCycle = useCallback(
    async (cycleId: string, toStatus: LeadStatus) => {
      try {
        setError(null)
        const req: MoveCycleStageRequest = {
          cycle_id: cycleId,
          to_status: toStatus,
        }
        await moveCycleStage(req)
        await loadCycles() // Refetch
      } catch (err: any) {
        const message = err?.message || 'Erro ao mover ciclo'
        setError(message)
        console.error('[useSalesCycles] Error moving cycle:', err)
        throw err
      }
    },
    [loadCycles]
  )

  // ============================================================================
  // Assign owner to cycle
  // ============================================================================

  const assignOwner = useCallback(
    async (cycleId: string, newOwnerUserId: string) => {
      try {
        setError(null)
        const req: AssignCycleOwnerRequest = {
          cycle_id: cycleId,
          owner_user_id: newOwnerUserId,
        }
        await assignCycleOwner(req)
        await loadCycles() // Refetch
      } catch (err: any) {
        const message = err?.message || 'Erro ao atribuir ciclo'
        setError(message)
        console.error('[useSalesCycles] Error assigning owner:', err)
        throw err
      }
    },
    [loadCycles]
  )

  // ============================================================================
  // Set next action
  // ============================================================================

  const setAction = useCallback(
    async (cycleId: string, action: string, date: Date) => {
      try {
        setError(null)
        const req: SetNextActionRequest = {
          cycle_id: cycleId,
          next_action: action,
          next_action_date: date,
        }
        await setNextAction(req)
        await loadCycles() // Refetch
      } catch (err: any) {
        const message = err?.message || 'Erro ao atualizar ação'
        setError(message)
        console.error('[useSalesCycles] Error setting action:', err)
        throw err
      }
    },
    [loadCycles]
  )

  // ============================================================================
  // Close cycle as won
  // ============================================================================

  const closeWon = useCallback(
    async (cycleId: string, wonValue?: number) => {
      try {
        setError(null)
        const req: CloseCycleWonRequest = {
          cycle_id: cycleId,
          won_value: wonValue,
        }
        await closeCycleWon(req)
        await loadCycles() // Refetch
      } catch (err: any) {
        const message = err?.message || 'Erro ao fechar ciclo'
        setError(message)
        console.error('[useSalesCycles] Error closing won:', err)
        throw err
      }
    },
    [loadCycles]
  )

  // ============================================================================
  // Close cycle as lost
  // ============================================================================

  const closeLost = useCallback(
    async (cycleId: string, lossReason?: string) => {
      try {
        setError(null)
        const req: CloseCycleLostRequest = {
          cycle_id: cycleId,
          loss_reason: lossReason,
        }
        await closeCycleLost(req)
        await loadCycles() // Refetch
      } catch (err: any) {
        const message = err?.message || 'Erro ao fechar ciclo'
        setError(message)
        console.error('[useSalesCycles] Error closing lost:', err)
        throw err
      }
    },
    [loadCycles]
  )

  // ============================================================================
  // Auto-load on mount
  // ============================================================================

  useEffect(() => {
    if (autoLoad) {
      void loadCycles()
    }
  }, [loadCycles, autoLoad])

  return {
    cycles,
    loading,
    error,
    loadCycles,
    moveCycle,
    assignOwner,
    setAction,
    closeWon,
    closeLost,
    refetch: loadCycles,
  }
}