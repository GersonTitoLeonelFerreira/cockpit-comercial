'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  getSalesFunnel,
  getPerformanceByOwner,
  getMonthlySalesAnalysis,
  getLostAnalysis,
  getCycleAuditHistory,
  getUpcomingDeals,
} from '@/app/lib/services/sales-analytics'

export interface SalesFunnelData {
  status: string
  total_deals: number
  deals_ganhos: number
  deals_perdidos: number
  taxa_conversao_pct: number
  valor_medio_ganho: number
  valor_total_ganho: number
}

export interface PerformanceData {
  owner_id: string
  owner_email: string
  total_deals: number
  deals_ganhos: number
  deals_perdidos: number
  deals_ativos: number
  taxa_conversao_pct: number
  valor_total_ganho: number
  dias_medio_ciclo: number
}

export interface MonthlySalesData {
  mes: string
  total_deals_criados: number
  deals_ganhos: number
  deals_perdidos: number
  taxa_conversao_pct: number
  receita_total: number
  receita_media_por_deal: number
}

export interface LostAnalysisData {
  lost_reason: string
  total_deals_perdidos: number
  percentual_pct: number
  dias_ate_perda: number
}

export interface AuditHistoryData {
  audit_id: string
  sales_cycle_id: string
  operation: string
  changed_at: string
  changed_by_email: string
  changes_summary: string
  old_data: any
  new_data: any
}

export function useKPIsAndAnalytics() {
  const [funnel, setFunnel] = useState<SalesFunnelData[]>([])
  const [performance, setPerformance] = useState<PerformanceData[]>([])
  const [monthly, setMonthly] = useState<MonthlySalesData[]>([])
  const [lost, setLost] = useState<LostAnalysisData[]>([])
  const [upcomingDeals, setUpcomingDeals] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAllAnalytics = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const [
        funnelData,
        perfData,
        monthlyData,
        lostData,
        upcomingData,
      ] = await Promise.all([
        getSalesFunnel(),
        getPerformanceByOwner(),
        getMonthlySalesAnalysis(),
        getLostAnalysis(),
        getUpcomingDeals(7),
      ])

      setFunnel(funnelData)
      setPerformance(perfData)
      setMonthly(monthlyData)
      setLost(lostData)
      setUpcomingDeals(upcomingData)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao buscar analytics'
      setError(message)
      console.error('Erro em useKPIsAndAnalytics:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAllAnalytics()
  }, [fetchAllAnalytics])

  // Calcular KPIs principais
  const getMainKPIs = useCallback(() => {
    if (funnel.length === 0) {
      return {
        totalDeals: 0,
        dealsGanhos: 0,
        dealsPerdidos: 0,
        receitaTotal: 0,
        taxaConversao: 0,
      }
    }

    const totalDeals = funnel.reduce((sum, f) => sum + f.total_deals, 0)
    const dealsGanhos = funnel.reduce((sum, f) => sum + f.deals_ganhos, 0)
    const dealsPerdidos = funnel.reduce((sum, f) => sum + f.deals_perdidos, 0)
    const receitaTotal = funnel.reduce((sum, f) => sum + f.valor_total_ganho, 0)
    const taxaConversao = totalDeals > 0 ? (dealsGanhos / totalDeals) * 100 : 0

    return {
      totalDeals,
      dealsGanhos,
      dealsPerdidos,
      receitaTotal,
      taxaConversao: parseFloat(taxaConversao.toFixed(2)),
    }
  }, [funnel])

  // Melhor performer
  const getTopPerformer = useCallback(() => {
    if (performance.length === 0) return null
    return performance[0]
  }, [performance])

  // Mês com melhor receita
  const getBestMonth = useCallback(() => {
    if (monthly.length === 0) return null
    return monthly[0]
  }, [monthly])

  return {
    // Data
    funnel,
    performance,
    monthly,
    lost,
    upcomingDeals,

    // State
    loading,
    error,

    // Methods
    fetchAllAnalytics,
    getMainKPIs,
    getTopPerformer,
    getBestMonth,
  }
}   