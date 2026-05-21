import type { SalesPulseSummary } from '@/app/types/sales-pulse'

const cards = [
  {
    key: 'totalOpenCycles',
    label: 'Ciclos no Pulso',
    hint: 'Contato + Agenda/Respondeu + Negociação',
  },
  {
    key: 'averageScore',
    label: 'Score médio',
    hint: 'Média de saúde dos ciclos no Pulso',
  },
  {
    key: 'criticalCycles',
    label: 'Pulso crítico',
    hint: 'Ciclos que exigem ação imediata',
  },
  {
    key: 'deadCycles',
    label: 'Sem pulso',
    hint: 'Ciclos praticamente abandonados',
  },
  {
    key: 'overdueNextActions',
    label: 'Ações vencidas',
    hint: 'Próximas ações atrasadas',
  },
] as const

export default function PulseSummaryCards({ summary }: { summary: SalesPulseSummary }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <div
          key={card.key}
          className="rounded-2xl border border-[#1a1d2e] bg-[#0d0f14] p-5 shadow-[0_12px_28px_rgba(0,0,0,0.24)]"
        >
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#546070]">
            {card.label}
          </div>
          <div className="mt-3 text-3xl font-black tracking-tight text-[#edf2f7]">
            {summary[card.key]}
          </div>
          <div className="mt-2 text-xs leading-5 text-[#8fa3bc]">{card.hint}</div>
        </div>
      ))}
    </div>
  )
}
