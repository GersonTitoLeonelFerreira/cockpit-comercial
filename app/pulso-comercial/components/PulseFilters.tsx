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
}

const filters: PulseFilter[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'criticos', label: 'Críticos' },
  { key: 'acoes_vencidas', label: 'Atrasados' },
  { key: 'sem_pulso', label: 'Sem pulso' },
  { key: 'fracos', label: 'Pulso fraco' },
  { key: 'sem_proxima_acao', label: 'Sem próxima ação' },
  { key: 'contato', label: 'Contato' },
  { key: 'agenda', label: 'Agenda' },
  { key: 'negociacao', label: 'Negociação' },
]

export default function PulseFilters({
  activeFilter,
  onChange,
}: {
  activeFilter: PulseFilterKey
  onChange: (filter: PulseFilterKey) => void
}) {
  return (
    <div className="rounded-2xl border border-[#1a1d2e] bg-[#0d0f14] px-4 py-3 shadow-[0_10px_24px_rgba(0,0,0,0.18)]">
      <div className="flex items-center gap-3 overflow-x-auto whitespace-nowrap pb-1">
        {filters.map((filter) => {
          const active = activeFilter === filter.key

          return (
            <button
              key={filter.key}
              type="button"
              onClick={() => onChange(filter.key)}
              className={[
                'shrink-0 rounded-full border px-3 py-1.5 text-xs font-black transition-all',
                active
                  ? 'border-blue-500/60 bg-blue-500/15 text-blue-100 shadow-[0_0_0_1px_rgba(59,130,246,0.20)]'
                  : 'border-[#1a1d2e] bg-[#111318] text-[#8fa3bc] hover:border-[#2a3350] hover:text-[#edf2f7]',
              ].join(' ')}
            >
              {filter.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}