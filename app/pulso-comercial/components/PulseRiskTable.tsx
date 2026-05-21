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

export default function PulseRiskTable({ cycles }: { cycles: SalesPulseCyclePulse[] }) {
  if (cycles.length === 0) {
    return (
      <div className="rounded-2xl border border-[#1a1d2e] bg-[#0d0f14] p-6 text-sm text-[#8fa3bc]">
        Nenhum ciclo crítico encontrado neste momento.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[#1a1d2e] bg-[#0d0f14]">
      <div className="border-b border-[#1a1d2e] px-5 py-4">
        <h2 className="text-base font-black text-[#edf2f7]">Ciclos que precisam de ação</h2>
        <p className="mt-1 text-xs text-[#8fa3bc]">
          Priorizados pelo menor score de pulso.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-[#1a1d2e] text-sm">
          <thead className="bg-[#111318] text-left text-[11px] uppercase tracking-[0.12em] text-[#546070]">
            <tr>
              <th className="px-5 py-3 font-bold">Lead</th>
              <th className="px-5 py-3 font-bold">Pulso</th>
              <th className="px-5 py-3 font-bold">Status</th>
              <th className="px-5 py-3 font-bold">Próxima ação</th>
              <th className="px-5 py-3 font-bold">Motivo</th>
              <th className="px-5 py-3 font-bold">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#13162a]">
            {cycles.map((cycle) => (
              <tr key={cycle.cycleId} className="hover:bg-[#111318]/70">
                <td className="px-5 py-4">
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
                <td className="px-5 py-4">
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${severityClass[cycle.severity]}`}
                  >
                    {cycle.stateLabel} · {cycle.score}
                  </span>
                </td>
                <td className="px-5 py-4 text-[#8fa3bc]">{cycle.status}</td>
                <td className="px-5 py-4 text-[#8fa3bc]">
                  <div>{cycle.nextAction || 'Sem próxima ação'}</div>
                  <div className={cycle.isNextActionOverdue ? 'mt-1 text-xs text-red-300' : 'mt-1 text-xs text-[#546070]'}>
                    {formatDate(cycle.nextActionDate)}
                  </div>
                </td>
                <td className="max-w-[340px] px-5 py-4 text-[#8fa3bc]">{cycle.mainReason}</td>
                <td className="max-w-[360px] px-5 py-4 text-[#8fa3bc]">{cycle.recommendedAction}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
