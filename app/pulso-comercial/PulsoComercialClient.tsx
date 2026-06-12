'use client'

import { useEffect, useMemo, useState } from 'react'
import type { SalesPulseCyclePulse, SalesPulsePageData, SalesPulseSummary } from '@/app/types/sales-pulse'
import PulseSummaryCards from './components/PulseSummaryCards'
import PulseRiskTable from './components/PulseRiskTable'
import PulseFilters, { type PulseFilterKey } from './components/PulseFilters'

const PAGE_SIZE = 30

function formatGeneratedAt(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return 'Agora'

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function applyPulseFilter(cycles: SalesPulseCyclePulse[], filter: PulseFilterKey) {
  switch (filter) {
    case 'criticos':
      return cycles.filter((cycle) => cycle.state === 'critico')
    case 'sem_pulso':
      return cycles.filter((cycle) => cycle.state === 'sem_pulso')
    case 'fracos':
      return cycles.filter((cycle) => cycle.state === 'fraco')
    case 'acoes_vencidas':
      return cycles.filter((cycle) => cycle.isNextActionOverdue)
    case 'sem_proxima_acao':
      return cycles.filter((cycle) => !cycle.nextActionDate)
    case 'contato':
      return cycles.filter((cycle) => cycle.status === 'contato')
    case 'agenda':
      return cycles.filter((cycle) => cycle.status === 'respondeu')
    case 'negociacao':
      return cycles.filter((cycle) => cycle.status === 'negociacao')
    case 'todos':
    default:
      return cycles
  }
}

function buildSummaryFromCycles(cycles: SalesPulseCyclePulse[]): SalesPulseSummary {
  const totalOpenCycles = cycles.length
  const scoreSum = cycles.reduce((sum, cycle) => sum + cycle.score, 0)

  return {
    totalOpenCycles,
    strongCycles: cycles.filter((cycle) => cycle.state === 'forte').length,
    activeCycles: cycles.filter((cycle) => cycle.state === 'ativo').length,
    weakCycles: cycles.filter((cycle) => cycle.state === 'fraco').length,
    criticalCycles: cycles.filter((cycle) => cycle.state === 'critico').length,
    deadCycles: cycles.filter((cycle) => cycle.state === 'sem_pulso').length,
    overdueNextActions: cycles.filter((cycle) => cycle.isNextActionOverdue).length,
    cyclesWithoutNextAction: cycles.filter((cycle) => !cycle.nextActionDate).length,
    averageScore: totalOpenCycles === 0 ? 0 : Math.round(scoreSum / totalOpenCycles),
  }
}

export default function PulsoComercialClient({ data }: { data: SalesPulsePageData }) {
  const [activeFilter, setActiveFilter] = useState<PulseFilterKey>('todos')
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>('company')
  const [currentPage, setCurrentPage] = useState(1)

  const ownerScopedCycles = useMemo(() => {
    if (!data.canFilterBySeller || selectedOwnerId === 'company') {
      return data.cycles
    }

    return data.cycles.filter((cycle) => cycle.ownerUserId === selectedOwnerId)
  }, [data.canFilterBySeller, data.cycles, selectedOwnerId])

  const summary = useMemo(() => buildSummaryFromCycles(ownerScopedCycles), [ownerScopedCycles])

  const filteredCycles = useMemo(
    () => applyPulseFilter(ownerScopedCycles, activeFilter),
    [activeFilter, ownerScopedCycles]
  )

  const totalPages = Math.max(1, Math.ceil(filteredCycles.length / PAGE_SIZE))

  const paginatedCycles = useMemo(() => {
    const safePage = Math.min(currentPage, totalPages)
    const start = (safePage - 1) * PAGE_SIZE

    return filteredCycles.slice(start, start + PAGE_SIZE)
  }, [currentPage, filteredCycles, totalPages])

  useEffect(() => {
    setCurrentPage(1)
  }, [activeFilter, selectedOwnerId])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  return (
    <div className="min-h-full bg-[#090b0f] text-[#edf2f7]">
      <div className="mb-4 rounded-3xl border border-[#1a1d2e] bg-[#0d0f14] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#3b82f6]">
              Pulso Comercial
            </div>

            <h1 className="mt-2 text-2xl font-black tracking-tight text-[#edf2f7]">
              O que precisa de ação agora
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#8fa3bc]">
              Acompanhe os ciclos em andamento e priorize quem precisa de contato, retomada ou próximo passo.
            </p>
          </div>

          <div className="rounded-2xl border border-[#1a1d2e] bg-[#111318] px-4 py-3 text-xs text-[#8fa3bc]">
            Atualizado em
            <div className="mt-1 font-bold text-[#edf2f7]">{formatGeneratedAt(data.generatedAt)}</div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {data.canFilterBySeller && (
          <div className="rounded-2xl border border-[#1a1d2e] bg-[#0d0f14] px-4 py-3 shadow-[0_10px_24px_rgba(0,0,0,0.18)]">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#546070]">
                  Visão do Pulso
                </div>
                <div className="mt-1 text-xs text-[#8fa3bc]">
                  Alterne entre a empresa inteira e um vendedor específico.
                </div>
              </div>

              <select
                value={selectedOwnerId}
                onChange={(event) => setSelectedOwnerId(event.target.value)}
                className="min-h-[40px] rounded-xl border border-[#1a1d2e] bg-[#111318] px-3 text-sm font-bold text-[#edf2f7] outline-none transition focus:border-blue-500/60"
              >
                <option value="company">Empresa inteira</option>
                {data.sellerOptions.map((seller) => (
                  <option key={seller.id} value={seller.id}>
                    {seller.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <PulseSummaryCards summary={summary} />

        <PulseFilters activeFilter={activeFilter} onChange={setActiveFilter} />

        <PulseRiskTable
          cycles={paginatedCycles}
          totalCycles={filteredCycles.length}
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={PAGE_SIZE}
          onPageChange={setCurrentPage}
        />
      </div>
    </div>
  )
}