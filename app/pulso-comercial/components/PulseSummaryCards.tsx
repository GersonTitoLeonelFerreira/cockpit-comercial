import type { SalesPulseSummary } from '@/app/types/sales-pulse'

const cards = [
  {
    key: 'totalOpenCycles',
    label: 'Ciclos no Pulso',
    hint: 'Mesmo escopo operacional do Cockpit',
    detail: 'Contato + Agenda + Negociação',
    tone: 'blue',
  },
  {
    key: 'averageScore',
    label: 'Score médio',
    hint: 'Saúde média das negociações',
    detail: 'Escala de 0 a 100',
    tone: 'neutral',
  },
  {
    key: 'criticalCycles',
    label: 'Pulso crítico',
    hint: 'Ciclos que exigem ação imediata',
    detail: 'Maior risco operacional',
    tone: 'red',
  },
  {
    key: 'deadCycles',
    label: 'Sem pulso',
    hint: 'Ciclos praticamente parados',
    detail: 'Sem sinal comercial suficiente',
    tone: 'zinc',
  },
  {
    key: 'overdueNextActions',
    label: 'Ações vencidas',
    hint: 'Próximas ações atrasadas',
    detail: 'Follow-up fora da cadência',
    tone: 'amber',
  },
] as const

const toneClass = {
  blue: 'border-blue-500/25 bg-blue-500/10 text-blue-100',
  neutral: 'border-[#1a1d2e] bg-[#0d0f14] text-[#edf2f7]',
  red: 'border-red-500/25 bg-red-500/10 text-red-100',
  zinc: 'border-zinc-500/25 bg-zinc-500/10 text-zinc-200',
  amber: 'border-amber-500/25 bg-amber-500/10 text-amber-100',
} as const

function formatCardValue(card: (typeof cards)[number], summary: SalesPulseSummary) {
  const value = summary[card.key]

  if (card.key === 'averageScore') {
    return `${value}/100`
  }

  return String(value)
}

export default function PulseSummaryCards({ summary }: { summary: SalesPulseSummary }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <div
          key={card.key}
          className={`rounded-2xl border p-5 shadow-[0_12px_28px_rgba(0,0,0,0.24)] ${toneClass[card.tone]}`}
        >
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] opacity-70">
            {card.label}
          </div>
          <div className="mt-3 text-3xl font-black tracking-tight">
            {formatCardValue(card, summary)}
          </div>
          <div className="mt-2 text-xs font-semibold leading-5 opacity-90">{card.hint}</div>
          <div className="mt-1 text-[11px] leading-5 opacity-60">{card.detail}</div>
        </div>
      ))}
    </div>
  )
}
