'use client'

import { formatCurrency } from '@/app/lib/services/faturamento'

type PerformanceRow = {
  owner_id: string | null
  owner_email: string | null
  total_deals: number
  deals_ganhos: number
  taxa_conversao_pct: number
  valor_total_ganho: number
  dias_medio_ciclo: number
}

export function PerformanceTable({
  performance = [],
}: {
  performance?: PerformanceRow[]
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Performance por Vendedor</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">
                Vendedor
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">
                Total Deals
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">
                Ganhos
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">
                Taxa %
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">
                Receita
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">
                Ciclo (dias)
              </th>
            </tr>
          </thead>

          <tbody className="divide-y">
            {performance.map((p, index) => {
              const rowKey =
                p.owner_id ??
                (p.owner_email ? `email:${p.owner_email}` : null) ??
                `row:${index}`

              return (
                <tr key={rowKey} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {p.owner_email || 'Sem atribuição'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{p.total_deals}</td>
                  <td className="px-6 py-4 text-sm font-semibold text-green-600">
                    {p.deals_ganhos}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {p.taxa_conversao_pct.toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                    {formatCurrency(p.valor_total_ganho)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {p.dias_medio_ciclo.toFixed(1)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}