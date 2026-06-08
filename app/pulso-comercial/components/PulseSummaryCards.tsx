import type { SalesPulseSummary } from '@/app/types/sales-pulse'

const cards = [
  {
    key: 'totalOpenCycles',
    label: 'Ciclos no Pulso',
    hint: 'Contato · Agenda · Negociação',
    detail: 'Base viva que precisa de cadência comercial.',
    tone: 'blue',
  },
  {
    key: 'averageScore',
    label: 'Score médio',
    hint: 'Saúde geral das negociações',
    detail: 'Quanto menor, maior a urgência da operação.',
    tone: 'neutral',
  },
  {
    key: 'criticalCycles',
    label: 'Pulso crítico',
    hint: 'Exigem ação imediata',
    detail: 'Prioridade máxima para retomada hoje.',
    tone: 'red',
  },
  {
    key: 'deadCycles',
    label: 'Sem pulso',
    hint: 'Ciclos praticamente parados',
    detail: 'Sem sinal comercial suficiente para avançar.',
    tone: 'zinc',
  },
  {
    key: 'overdueNextActions',
    label: 'Ações vencidas',
    hint: 'Follow-ups atrasados',
    detail: 'Quebra de cadência operacional.',
    tone: 'amber',
  },
] as const

const toneClass = {
  blue: {
    card: 'border-blue-500/25 bg-blue-500/10 text-blue-100',
    badge: 'border-blue-500/25 bg-blue-500/10 text-blue-200',
  },
  neutral: {
    card: 'border-[#1a1d2e] bg-[#0d0f14] text-[#edf2f7]',
    badge: 'border-[#1a1d2e] bg-[#111318] text-[#8fa3bc]',
  },
  red: {
    card: 'border-red-500/25 bg-red-500/10 text-red-100',
    badge: 'border-red-500/25 bg-red-500/10 text-red-200',
  },
  zinc: {
    card: 'border-zinc-500/25 bg-zinc-500/10 text-zinc-200',
    badge: 'border-zinc-500/25 bg-zinc-500/10 text-zinc-300',
  },
  amber: {
    card: 'border-amber-500/25 bg-amber-500/10 text-amber-100',
    badge: 'border-amber-500/25 bg-amber-500/10 text-amber-200',
  },
} as const

function formatCardValue(card: (typeof cards)[number], summary: SalesPulseSummary) {
  const value = summary[card.key]

  if (card.key === 'averageScore') {
    return `${value}/100`
  }

  return String(value)
}

function getExecutiveReading(card: (typeof cards)[number], summary: SalesPulseSummary) {
  const value = Number(summary[card.key] ?? 0)

  if (card.key === 'totalOpenCycles') {
    if (value === 0) return 'Sem ciclos vivos no Pulso'
    return `${value} ciclo${value === 1 ? '' : 's'} para acompanhar`
  }

  if (card.key === 'averageScore') {
    if (value >= 75) return 'Operação aquecida'
    if (value >= 50) return 'Operação em atenção'
    if (value >= 25) return 'Operação esfriando'
    return 'Operação crítica'
  }

  if (card.key === 'criticalCycles') {
    if (value === 0) return 'Sem emergência operacional'
    return `${value} ciclo${value === 1 ? '' : 's'} para atacar agora`
  }

  if (card.key === 'deadCycles') {
    if (value === 0) return 'Sem abandono relevante'
    return `${value} ciclo${value === 1 ? '' : 's'} sem cadência`
  }

  if (card.key === 'overdueNextActions') {
    if (value === 0) return 'Cadência em dia'
    return `${value} ação${value === 1 ? '' : 'ões'} fora do prazo`
  }

  return 'Leitura operacional'
}

function getPriorityLabel(card: (typeof cards)[number], summary: SalesPulseSummary) {
  const value = Number(summary[card.key] ?? 0)

  if (card.key === 'criticalCycles' && value > 0) return 'Prioridade 1'
  if (card.key === 'overdueNextActions' && value > 0) return 'Tratar hoje'
  if (card.key === 'deadCycles' && value > 0) return 'Retomar cadência'
  if (card.key === 'averageScore') {
    if (value >= 75) return 'Saudável'
    if (value >= 50) return 'Atenção'
    return 'Risco'
  }

  return 'Monitorar'
}

export default function PulseSummaryCards({ summary }: { summary: SalesPulseSummary }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => {
        const tone = toneClass[card.tone]

        return (
          <div
            key={card.key}
            className={`rounded-2xl border p-5 shadow-[0_12px_28px_rgba(0,0,0,0.24)] ${tone.card}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="text-[11px] font-black uppercase tracking-[0.12em] opacity-70">
                {card.label}
              </div>

              <div className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${tone.badge}`}>
                {getPriorityLabel(card, summary)}
              </div>
            </div>

            <div className="mt-3 text-3xl font-black tracking-tight">
              {formatCardValue(card, summary)}
            </div>

            <div className="mt-2 text-xs font-black leading-5 opacity-95">
              {getExecutiveReading(card, summary)}
            </div>

            <div className="mt-2 border-t border-white/10 pt-2 text-[11px] leading-5 opacity-70">
              <div>{card.hint}</div>
              <div>{card.detail}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}