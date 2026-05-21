export type PulseFilterKey =
  | 'todos'
  | 'criticos'
  | 'sem_pulso'
  | 'fracos'
  | 'acoes_vencidas'
  | 'sem_proxima_acao'
  | 'contato'
  | 'agenda'
  | 'negociacao'

type PulseFilter = {
  key: PulseFilterKey
  label: string
  description: string
}

const filters: PulseFilter[] = [
  {
    key: 'todos',
    label: 'Todos',
    description: 'Todos os ciclos no Pulso',
  },
  {
    key: 'criticos',
    label: 'Pulso crítico',
    description: 'Exigem ação imediata',
  },
  {
    key: 'sem_pulso',
    label: 'Sem pulso',
    description: 'Sem sinal comercial suficiente',
  },
  {
    key: 'fracos',
    label: 'Pulso fraco',
    description: 'Começando a perder cadência',
  },
  {
    key: 'acoes_vencidas',
    label: 'Ações vencidas',
    description: 'Próximas ações atrasadas',
  },
  {
    key: 'sem_proxima_acao',
    label: 'Sem próxima ação',
    description: 'Sem próximo passo definido',
  },
  {
    key: 'contato',
    label: 'Contato',
    description: 'Ciclos em contato',
  },
  {
    key: 'agenda',
    label: 'Agenda',
    description: 'Ciclos em agenda',
  },
  {
    key: 'negociacao',
    label: 'Negociação',
    description: 'Ciclos em negociação',
  },
]

export default function PulseFilters({
  activeFilter,
  onChange,
}: {
  activeFilter: PulseFilterKey
  onChange: (filter: PulseFilterKey) => void
}) {
  return (
    <div className="rounded-2xl border border-[#1a1d2e] bg-[#0d0f14] p-4 shadow-[0_12px_28px_rgba(0,0,0,0.20)]">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-black text-[#edf2f7]">Filtros do Pulso</h2>
          <p className="mt-1 text-xs leading-5 text-[#8fa3bc]">
            Use os filtros para priorizar o que precisa de ação agora.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((filter) => {
          const active = activeFilter === filter.key

          return (
            <button
              key={filter.key}
              type="button"
              onClick={() => onChange(filter.key)}
              className={[
                'rounded-xl border px-3 py-2 text-left transition-all',
                active
                  ? 'border-blue-500/60 bg-blue-500/15 text-blue-100 shadow-[0_0_0_1px_rgba(59,130,246,0.20)]'
                  : 'border-[#1a1d2e] bg-[#111318] text-[#8fa3bc] hover:border-[#2a3350] hover:text-[#edf2f7]',
              ].join(' ')}
            >
              <div className="text-xs font-black">{filter.label}</div>
              <div className="mt-0.5 text-[10px] opacity-70">{filter.description}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
