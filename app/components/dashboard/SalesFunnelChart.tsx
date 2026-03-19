'use client'

import { useKPIsAndAnalytics } from '@/app/hooks/useKPIsAndAnalytics'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

export function SalesFunnelChart() {
  const { funnel, loading } = useKPIsAndAnalytics()

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6 animate-pulse">
        <div className="h-96 bg-gray-200 rounded"></div>
      </div>
    )
  }

  if (funnel.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-center">
        <p className="text-gray-500">Nenhum dado de funil disponível</p>
      </div>
    )
  }

  // Transformar dados para o gráfico
  const chartData = funnel.map((item) => ({
    status: item.status.charAt(0).toUpperCase() + item.status.slice(1),
    'Total Deals': item.total_deals,
    'Ganhos': item.deals_ganhos,
    'Perdidos': item.deals_perdidos,
  }))

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Funil de Vendas</h3>
      
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="status" />
          <YAxis />
          <Tooltip 
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #ccc',
              borderRadius: '8px',
            }}
          />
          <Legend />
          <Bar dataKey="Total Deals" fill="#3b82f6" />
          <Bar dataKey="Ganhos" fill="#10b981" />
          <Bar dataKey="Perdidos" fill="#ef4444" />
        </BarChart>
      </ResponsiveContainer>

      {/* Estatísticas adicionais */}
      <div className="mt-6 grid grid-cols-3 gap-4">
        {funnel.map((item) => (
          <div key={item.status} className="p-3 bg-gray-50 rounded">
            <div className="text-sm font-medium text-gray-600 capitalize">
              {item.status}
            </div>
            <div className="text-2xl font-bold text-gray-900 mt-1">
              {item.total_deals}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Taxa: {item.taxa_conversao_pct.toFixed(1)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}