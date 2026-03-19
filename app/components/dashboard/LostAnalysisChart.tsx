'use client'

import { useKPIsAndAnalytics } from '@/app/hooks/useKPIsAndAnalytics'
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts'

const COLORS = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e', '#06b6d4', '#0ea5e9', '#6366f1']

export function LostAnalysisChart() {
  const { lost, loading } = useKPIsAndAnalytics()

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6 animate-pulse">
        <div className="h-96 bg-gray-200 rounded"></div>
      </div>
    )
  }

  if (lost.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-center">
        <p className="text-green-600 font-medium">✓ Nenhum deal perdido registrado</p>
      </div>
    )
  }

  // Transformar dados para o gráfico
  const chartData = lost.map((item) => ({
    name: item.lost_reason || 'Sem motivo',
    value: item.total_deals_perdidos,
    percentual: item.percentual_pct, // ✅ Agora sim!
  }))

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Motivos de Perda</h3>

      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name }) => {
                const item = chartData.find(d => d.name === name)
                return `${name}: ${item?.percentual.toFixed(1)}%`
              }}
            outerRadius={100}
            fill="#8884d8"
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip 
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #ccc',
              borderRadius: '8px',
            }}
            formatter={(value, name) => {
              if (name === 'value') {
                return [value, 'Deals']
              }
              return [value, name]
            }}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Tabela de detalhes */}
      <div className="mt-6 space-y-2">
        {lost.map((item, index) => (
          <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded">
            <div className="flex items-center gap-3">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              ></div>
              <span className="text-sm font-medium text-gray-900">
                {item.lost_reason || 'Sem motivo'}
              </span>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold text-gray-900">
                {item.total_deals_perdidos}
              </div>
              <div className="text-xs text-gray-500">
                {item.percentual_pct.toFixed(1)}%
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}