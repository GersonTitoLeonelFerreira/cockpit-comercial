'use client'

import { KPICards } from '@/app/components/dashboard/KPICards'
import { PerformanceTable } from '@/app/components/dashboard/PerformanceTable'
import { UpcomingDeals } from '@/app/components/dashboard/UpcomingDeals'
import { SalesFunnelChart } from '@/app/components/dashboard/SalesFunnelChart'
import { MonthlyRevenueChart } from '@/app/components/dashboard/MonthlyRevenueChart'
import { LostAnalysisChart } from '@/app/components/dashboard/LostAnalysisChart'

export default function SalesDashboardPage() {
  return (
    <div className="space-y-6 p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Dashboard de Vendas</h1>
          <p className="text-gray-600 mt-2">Acompanhe a performance do seu time em tempo real</p>
        </div>

        {/* KPIs */}
        <KPICards />

        {/* Gráficos principais */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <SalesFunnelChart />
          <MonthlyRevenueChart />
        </div>

        {/* Performance dos Vendedores */}
        <div className="mt-6">
          <PerformanceTable />
        </div>

        {/* Próximos deals e Análise de Perdas */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <UpcomingDeals />
          <LostAnalysisChart />
        </div>
      </div>
    </div>
  )
}