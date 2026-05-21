'use client'

import type { SalesPulsePageData, SalesPulseSeverity } from '@/app/types/sales-pulse'
import PulseSummaryCards from './components/PulseSummaryCards'
import PulseRiskTable from './components/PulseRiskTable'

const severityClass: Record<SalesPulseSeverity, string> = {
  positive: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  neutral: 'border-blue-500/30 bg-blue-500/10 text-blue-200',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  danger: 'border-red-500/30 bg-red-500/10 text-red-200',
  dead: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-300',
}

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

export default function PulsoComercialClient({ data }: { data: SalesPulsePageData }) {
  return (
    <div className="min-h-full bg-[#090b0f] text-[#edf2f7]">
      <div className="mb-8 rounded-3xl border border-[#1a1d2e] bg-[#0d0f14] p-6 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#3b82f6]">
              Nova ferramenta
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-[#edf2f7]">
              Pulso Comercial
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[#8fa3bc]">
              Mede a saúde das negociações abertas e mostra quais ciclos estão vivos, esfriando,
              em risco ou sem sinal comercial suficiente para avançar.
            </p>
          </div>

          <div className="rounded-2xl border border-[#1a1d2e] bg-[#111318] px-4 py-3 text-xs text-[#8fa3bc]">
            Atualizado em
            <div className="mt-1 font-bold text-[#edf2f7]">{formatGeneratedAt(data.generatedAt)}</div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <PulseSummaryCards summary={data.summary} />

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <PulseRiskTable cycles={data.cycles} />

          <aside className="space-y-4">
            <div className="rounded-2xl border border-[#1a1d2e] bg-[#0d0f14] p-5">
              <h2 className="text-base font-black text-[#edf2f7]">Ações recomendadas</h2>
              <p className="mt-1 text-xs leading-5 text-[#8fa3bc]">
                Leitura automática dos principais sinais dos ciclos abertos.
              </p>

              <div className="mt-4 space-y-3">
                {data.recommendedActions.map((action) => (
                  <div
                    key={`${action.label}-${action.detail}`}
                    className={`rounded-2xl border p-4 ${severityClass[action.severity]}`}
                  >
                    <div className="text-sm font-black">{action.label}</div>
                    <div className="mt-1 text-xs leading-5 opacity-90">{action.detail}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-[#1a1d2e] bg-[#0d0f14] p-5">
              <h2 className="text-base font-black text-[#edf2f7]">Como ler o Pulso</h2>
              <div className="mt-4 space-y-3 text-xs leading-5 text-[#8fa3bc]">
                <p>
                  <strong className="text-emerald-200">Pulso Forte</strong>: ciclo aquecido, com sinais
                  recentes e próximo passo claro.
                </p>
                <p>
                  <strong className="text-blue-200">Pulso Ativo</strong>: ciclo saudável, mas ainda sem
                  forte sinal de fechamento.
                </p>
                <p>
                  <strong className="text-amber-200">Pulso Fraco</strong>: ciclo começando a perder
                  cadência.
                </p>
                <p>
                  <strong className="text-red-200">Pulso Crítico</strong>: ciclo com risco alto de perda
                  por atraso, falta de ação ou tempo parado.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
