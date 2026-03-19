'use client'

import { useKPIsAndAnalytics } from '@/app/hooks/useKPIsAndAnalytics'

export function KPICards() {
  const { performance, loading } = useKPIsAndAnalytics()

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg shadow p-6 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-20 mb-2"></div>
            <div className="h-8 bg-gray-200 rounded w-16"></div>
          </div>
        ))}
      </div>
    )
  }

  // Calcular KPIs a partir dos dados
  const totalDeals = performance.reduce((sum, p) => sum + p.total_deals, 0)
  const dealsGanhos = performance.reduce((sum, p) => sum + p.deals_ganhos, 0)
  const dealsPerdidos = performance.reduce((sum, p) => sum + p.deals_perdidos, 0)
  const receitaTotal = performance.reduce((sum, p) => sum + p.valor_total_ganho, 0)
  const taxaConversao = totalDeals > 0 ? ((dealsGanhos / totalDeals) * 100) : 0

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value)
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      {/* Total de Deals */}
      <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
        <div className="text-sm font-medium text-gray-600">Total de Deals</div>
        <div className="text-3xl font-bold text-gray-900 mt-2">{totalDeals}</div>
        <div className="text-xs text-gray-500 mt-1">Todos os ciclos</div>
      </div>

      {/* Deals Ganhos */}
      <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
        <div className="text-sm font-medium text-gray-600">Deals Ganhos</div>
        <div className="text-3xl font-bold text-green-600 mt-2">{dealsGanhos}</div>
        <div className="text-xs text-gray-500 mt-1">
          {totalDeals > 0 ? ((dealsGanhos / totalDeals) * 100).toFixed(1) : 0}%
        </div>
      </div>

      {/* Deals Perdidos */}
      <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-500">
        <div className="text-sm font-medium text-gray-600">Deals Perdidos</div>
        <div className="text-3xl font-bold text-red-600 mt-2">{dealsPerdidos}</div>
        <div className="text-xs text-gray-500 mt-1">
          {totalDeals > 0 ? ((dealsPerdidos / totalDeals) * 100).toFixed(1) : 0}%
        </div>
      </div>

      {/* Receita Total */}
      <div className="bg-white rounded-lg shadow p-6 border-l-4 border-purple-500">
        <div className="text-sm font-medium text-gray-600">Receita Total</div>
        <div className="text-3xl font-bold text-purple-600 mt-2">
          {formatCurrency(receitaTotal)}
        </div>
        <div className="text-xs text-gray-500 mt-1">Ganhos acumulados</div>
      </div>

      {/* Taxa de Conversão */}
      <div className="bg-white rounded-lg shadow p-6 border-l-4 border-yellow-500">
        <div className="text-sm font-medium text-gray-600">Taxa Conversão</div>
        <div className="text-3xl font-bold text-yellow-600 mt-2">
          {taxaConversao.toFixed(2)}%
        </div>
        <div className="text-xs text-gray-500 mt-1">Deal/Total</div>
      </div>
    </div>
  )
}