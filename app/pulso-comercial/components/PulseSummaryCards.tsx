import type { SalesPulseSummary } from '@/app/types/sales-pulse'

const cards = [
  {
    key: 'totalOpenCycles',
    label: 'Ciclos em ação',
    helper: 'Contato, Agenda e Negociação',
    tone: 'blue',
  },
  {
    key: 'criticalCycles',
    label: 'Críticos',
    helper: 'Atacar primeiro',
    tone: 'red',
  },
  {
    key: 'overdueNextActions',
    label: 'Atrasados',
    helper: 'Follow-up vencido',
    tone: 'amber',
  },
  {
    key: 'deadCycles',
    label: 'Sem pulso',
    helper: 'Sem cadência',
    tone: 'zinc',
  },
  {
    key: 'averageScore',
    label: 'Saúde média',
    helper: 'Escala de 0 a 100',
    tone: 'neutral',
  },
] as const

const toneClass = {
  blue: 'border-blue-500/25 bg-blue-500/10 text-blue-100',
  red: 'border-red-500/25 bg-red-500/10 text-red-100',
  amber: 'border-amber-500/25 bg-amber-500/10 text-amber-100',
  zinc: 'border-zinc-500/25 bg-zinc-500/10 text-zinc-200',
  neutral: 'border-[#1a1d2e] bg-[#0d0f14] text-[#edf2f7]',
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
          className={`rounded-2xl border p-4 shadow-[0_12px_28px_rgba(0,0,0,0.22)] ${toneClass[card.tone]}`}
        >
          <div className="text-[10px] font-black uppercase tracking-[0.12em] opacity-70">
            {card.label}
          </div>

          <div className="mt-2 text-3xl font-black tracking-tight">
            {formatCardValue(card, summary)}
          </div>

          <div className="mt-1 text-xs font-semibold leading-5 opacity-75">
            {card.helper}
          </div>
        </div>
      ))}
    </div>
  )
}