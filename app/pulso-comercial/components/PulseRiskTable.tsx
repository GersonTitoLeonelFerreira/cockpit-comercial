import Link from 'next/link'
import type { SalesPulseCyclePulse, SalesPulseSeverity } from '@/app/types/sales-pulse'

const severityClass: Record<SalesPulseSeverity, string> = {
  positive: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  neutral: 'border-blue-500/30 bg-blue-500/10 text-blue-200',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  danger: 'border-red-500/30 bg-red-500/10 text-red-200',
  dead: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-300',
}

function formatDate(value: string | null) {
  if (!value) return 'Sem data'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Data inválida'

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function statusLabel(status: string) {
  if (status === 'respondeu') return 'Agenda'
  if (status === 'negociacao') return 'Negociação'
  if (status === 'contato') return 'Contato'
  return status
}

function whatsappHref(phone: string) {
  const clean = phone.replace(/\D/g, '')
  const withCountry = clean.startsWith('55') ? clean : `55${clean}`
  return `https://wa.me/${withCountry}`
}

export default function PulseRiskTable({ cycles }: { cycles: SalesPulseCyclePulse[] }) {
  if (cycles.length === 0) {
    return (
      <div className="rounded-2xl border border-[#1a1d2e] bg-[#0d0f14] p-6 text-sm text-[#8fa3bc]">
        Nenhum ciclo em andamento encontrado no Pulso Comercial.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[#1a1d2e] bg-[#0d0f14] shadow-[0_16px_36px_rgba(0,0,0,0.24)]">
      <div className="border-b border-[#1a1d2e] px-5 py-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-base font-black text-[#edf2f7]">Ciclos em andamento</h2>
            <p className="mt-1 text-xs leading-5 text-[#8fa3bc]">
              Priorize os ciclos com menor score e próxima ação vencida.
            </p>
          </div>

          <div className="rounded-full border border-[#1a1d2e] bg-[#111318] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#546070]">
            {cycles.length} ciclo{cycles.length === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      <div className="divide-y divide-[#13162a]">
        {cycles.map((cycle) => (
          <div
            key={cycle.cycleId}
            className="grid gap-4 px-5 py-4 transition hover:bg-[#111318]/70 xl:grid-cols-[minmax(240px,0.8fr)_minmax(360px,1.2fr)_minmax(190px,0.55fr)]"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/sales-cycles/${cycle.cycleId}`}
                  className="truncate text-sm font-black text-[#edf2f7] hover:text-[#93c5fd]"
                >
                  {cycle.leadName}
                </Link>

                <span
                  className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-black ${severityClass[cycle.severity]}`}
                >
                  {cycle.stateLabel} · {cycle.score}/100
                </span>
              </div>

              <div className="mt-2 flex flex-wrap gap-2 text-xs text-[#8fa3bc]">
                <span>{statusLabel(cycle.status)}</span>
                <span className="text-[#334155]">•</span>
                <span>
                  {cycle.daysInStage == null
                    ? 'tempo não informado'
                    : `${cycle.daysInStage}d na etapa`}
                </span>
              </div>

              <div className="mt-1 text-xs text-[#546070]">
                {cycle.leadPhone || cycle.leadEmail || 'Sem contato cadastrado'}
              </div>
            </div>

            <div className="min-w-0 rounded-xl border border-[#1a1d2e] bg-[#111318] p-3">
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[#546070]">
                Próximo movimento
              </div>

              <div className="mt-2 text-sm font-bold leading-5 text-[#edf2f7]">
                {cycle.recommendedAction}
              </div>

              <div className="mt-2 text-xs leading-5 text-[#8fa3bc]">
                {cycle.mainReason}
              </div>

              <div
                className={
                  cycle.isNextActionOverdue
                    ? 'mt-2 text-xs font-bold text-red-300'
                    : 'mt-2 text-xs font-semibold text-[#546070]'
                }
              >
                {cycle.nextAction || 'Sem próxima ação definida'} · {cycle.isNextActionOverdue ? 'Vencida · ' : ''}
                {formatDate(cycle.nextActionDate)}
              </div>
            </div>

            <div className="flex min-w-[180px] flex-col justify-center gap-2">
              <Link
                href={`/sales-cycles/${cycle.cycleId}`}
                className="inline-flex items-center justify-center rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs font-black text-blue-200 transition hover:bg-blue-500/15"
              >
                Abrir ciclo
              </Link>

              {cycle.leadPhone && (
                <a
                  href={whatsappHref(cycle.leadPhone)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-black text-emerald-200 transition hover:bg-emerald-500/15"
                >
                  WhatsApp
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}