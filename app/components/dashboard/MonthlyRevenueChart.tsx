'use client'

import { useKPIsAndAnalytics } from '@/app/hooks/useKPIsAndAnalytics'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart } from 'recharts'

export function MonthlyRevenueChart() {
  const { monthly, loading } = useKPIsAndAnalytics()

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6 animate-pulse">
        <div className="h-96 bg-gray-200 rounded"></div>
      </div>
    )
  }

  if (monthly.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-center">
        <p className="text-gray-500">Nenhum dado mensal disponível</p>
      </div>
    )
  }

  // Transformar dados para o gráfico (inverter para mostrar do mais antigo para o mais novo)
  const chartData = [...monthly].reverse().map((item) => {
    const date = new Date(item.mes)
    return {
      mes: date.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }),
      'Receita': item.receita_total,
      'Deals': item.deals_ganhos,
      'Ticket Médio': item.receita_media_por_deal,
      'Taxa %': item.taxa_conversao_pct,
    }
  })

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0,
    }).format(value)
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Receita Mensal</h3>

      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="mes" />
          <YAxis yAxisId="left" />
          <YAxis yAxisId="right" orientation="right" />
          <Tooltip 
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #ccc',
              borderRadius: '8px',
            }}
            formatter={(value, name) => {
              if (name === 'Receita') {
                return [formatCurrency(value as number), name]
              }
              return [value, name]
            }}
          />
          <Legend />
          <Bar yAxisId="left" dataKey="Receita" fill="#8b5cf6" name="Receita (R$)" />
          <Line yAxisId="right" type="monotone" dataKey="Deals" stroke="#10b981" name="Deals Ganhos" strokeWidth={2} />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Cartões de resumo */}
      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
          <div className="text-sm font-medium text-purple-600">Receita Total</div>
          <div className="text-3xl font-bold text-purple-900 mt-1">
            {formatCurrency(
              monthly.reduce((sum, m) => sum + m.receita_total, 0)
            )}
          </div>
        </div>

        <div className="p-4 bg-green-50 rounded-lg border border-green-200">
          <div className="text-sm font-medium text-green-600">Ticket Médio</div>
          <div className="text-3xl font-bold text-green-900 mt-1">
            {formatCurrency(
              monthly.reduce((sum, m) => sum + m.receita_media_por_deal, 0) / monthly.length
            )}
          </div>
        </div>
      </div>
    </div>
  )
}