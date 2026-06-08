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
              Lista priorizada pelo menor score. Quanto menor o score, maior a urgência operacional.
            </p>
          </div>
          <div className="rounded-full border border-[#1a1d2e] bg-[#111318] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#546070]">
            Contato · Agenda · Negociação
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
      <table className="min-w-[1320px] divide-y divide-[#1a1d2e] text-sm">
          <thead className="bg-[#111318] text-left text-[11px] uppercase tracking-[0.12em] text-[#546070]">
            <tr>
              <th className="px-5 py-3 font-bold">Lead</th>
              <th className="px-5 py-3 font-bold">Pulso</th>
              <th className="px-5 py-3 font-bold">Etapa</th>
              <th className="px-5 py-3 font-bold">Próxima ação</th>
              <th className="px-5 py-3 font-bold">Sinal principal</th>
              <th className="px-5 py-3 font-bold">Orientação</th>
              <th className="px-5 py-3 font-bold">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#13162a]">
            {cycles.map((cycle) => (
              <tr key={cycle.cycleId} className="hover:bg-[#111318]/70">
                <td className="px-5 py-4 align-top">
                  <Link
                    href={`/sales-cycles/${cycle.cycleId}`}
                    className="font-bold text-[#edf2f7] hover:text-[#93c5fd]"
                  >
                    {cycle.leadName}
                  </Link>
                  <div className="mt-1 text-xs text-[#546070]">
                    {cycle.leadPhone || cycle.leadEmail || 'Sem contato cadastrado'}
                  </div>
                </td>
                <td className="px-5 py-4 align-top">
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${severityClass[cycle.severity]}`}
                  >
                    {cycle.stateLabel} · {cycle.score}/100
                  </span>
                </td>
                <td className="px-5 py-4 align-top text-[#8fa3bc]">
                  <div className="font-semibold text-[#edf2f7]">{statusLabel(cycle.status)}</div>
                  <div className="mt-1 text-xs text-[#546070]">
                    {cycle.daysInStage == null
                      ? 'Tempo não informado'
                      : `${cycle.daysInStage} dia${cycle.daysInStage === 1 ? '' : 's'} na etapa`}
                  </div>
                </td>
                <td className="px-5 py-4 align-top text-[#8fa3bc]">
                  <div className="max-w-[210px] truncate" title={cycle.nextAction || 'Sem próxima ação'}>
                    {cycle.nextAction || 'Sem próxima ação'}
                  </div>
                  <div className={cycle.isNextActionOverdue ? 'mt-1 text-xs text-red-300' : 'mt-1 text-xs text-[#546070]'}>
                    {cycle.isNextActionOverdue ? 'Vencida · ' : ''}{formatDate(cycle.nextActionDate)}
                  </div>
                </td>
                <td className="max-w-[360px] px-5 py-4 align-top text-[#8fa3bc]">
                  <div className="line-clamp-3 leading-5" title={cycle.mainReason}>
                    {cycle.mainReason}
                  </div>
                </td>
                <td className="max-w-[380px] px-5 py-4 align-top text-[#8fa3bc]">
                  <div className="line-clamp-3 leading-5" title={cycle.recommendedAction}>
                    {cycle.recommendedAction}
                  </div>
                </td>

                <td className="px-5 py-4 align-top">
                  <div className="flex min-w-[150px] flex-col gap-2">
                    <Link
                      href={`/sales-cycles/${cycle.cycleId}`}
                      className="inline-flex items-center justify-center rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs font-black text-blue-200 transition hover:bg-blue-500/15"
                    >
                      Abrir ciclo
                    </Link>

                    {cycle.leadPhone && (
                      <a
                        href={`https://wa.me/${cycle.leadPhone.replace(/\D/g, '').startsWith('55')
                          ? cycle.leadPhone.replace(/\D/g, '')
                          : `55${cycle.leadPhone.replace(/\D/g, '')}`}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-black text-emerald-200 transition hover:bg-emerald-500/15"
                      >
                        WhatsApp
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
