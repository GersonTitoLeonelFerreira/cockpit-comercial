'use client'

import { useKPIsAndAnalytics } from '@/app/hooks/useKPIsAndAnalytics'

export function UpcomingDeals() {
  const { upcomingDeals, loading } = useKPIsAndAnalytics()

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-40 mb-4"></div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    )
  }

  if (upcomingDeals.length === 0) {
    return (
      <div className="bg-green-50 rounded-lg p-6 border border-green-200">
        <div className="text-center">
          <p className="text-green-700 font-medium">✓ Nenhum deal vencendo nos próximos 7 dias</p>
          <p className="text-sm text-green-600 mt-1">Tudo em dia!</p>
        </div>
      </div>
    )
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  const daysUntil = (date: string) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const deadline = new Date(date)
    deadline.setHours(0, 0, 0, 0)
    const diff = Math.floor((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    return diff
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b">
        <h3 className="text-lg font-semibold text-gray-900">
          Próximos Vencimentos ({upcomingDeals.length})
        </h3>
      </div>

      <div className="divide-y max-h-96 overflow-y-auto">
        {upcomingDeals.map((deal) => {
          const days = daysUntil(deal.next_action_date)
          const isUrgent = days <= 2

          return (
            <div key={deal.id} className="p-4 hover:bg-gray-50 transition">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">
                      Lead #{deal.lead_id?.slice(0, 8) || 'N/A'}
                    </span>
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                        isUrgent
                          ? 'bg-red-100 text-red-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {deal.status_display || deal.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Owner: {deal.owner_email || 'Não atribuído'}
                  </p>
                  {deal.next_action && (
                    <p className="text-sm text-gray-600 mt-1">
                      Ação: <span className="font-medium">{deal.next_action}</span>
                    </p>
                  )}
                </div>

                <div className="text-right ml-4">
                  <div className="text-sm font-semibold text-gray-900">
                    {formatDate(deal.next_action_date)}
                  </div>
                  <div
                    className={`text-xs font-medium mt-1 ${
                      isUrgent ? 'text-red-600 font-bold' : 'text-gray-600'
                    }`}
                  >
                    {days === 0
                      ? '🔴 HOJE'
                      : days === 1
                      ? '🟡 Amanhã'
                      : `${days} dias`}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}