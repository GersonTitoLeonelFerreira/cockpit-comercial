'use client'

import { useMemo, useState } from 'react'
import type { SalesPulseCyclePulse, SalesPulsePageData } from '@/app/types/sales-pulse'
import PulseSummaryCards from './components/PulseSummaryCards'
import PulseRiskTable from './components/PulseRiskTable'
import PulseFilters, { type PulseFilterKey } from './components/PulseFilters'

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

export default function PulsoComercialClient({ data }: { data: SalesPulsePageData }) {
  const [activeFilter, setActiveFilter] = useState<PulseFilterKey>('todos')

  const filteredCycles = useMemo(
    () => applyPulseFilter(data.cycles, activeFilter),
    [activeFilter, data.cycles]
  )

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
        <PulseSummaryCards summary={data.summary} />

        <PulseFilters activeFilter={activeFilter} onChange={setActiveFilter} />

        <PulseRiskTable cycles={filteredCycles} />
      </div>
    </div>
  )
}