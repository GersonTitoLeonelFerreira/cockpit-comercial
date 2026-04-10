'use client'

import * as React from 'react'

const DS = {
  contentBg:     '#090b0f',
  surfaceBg:     '#0d1017',
  panelBg:       '#101420',
  cardBg:        '#141722',
  border:        '#1a1d2e',
  textPrimary:   '#edf2f7',
  textSecondary: '#8fa3bc',
  blueSoft:      '#7eb6ff',
  blue:          '#3b82f6',
  radius:        7,
  radiusContainer: 9,
}

const REPORT_NAV_GROUPS = [
  {
    title: 'Visão Executiva',
    accent: '#3b82f6',
    items: [
      { label: 'Radar do Período', href: '/dashboard/relatorios/radar' },
      { label: 'Relatórios Gerais', href: '/relatorios/gerais' },
    ],
  },
  {
    title: 'Operação',
    accent: '#06b6d4',
    items: [
      { label: 'Visão Executiva', href: '/relatorios/operacao/visao-executiva' },
      { label: 'Ações por Etapa', href: '/relatorios/operacao/acoes-por-etapa' },
      { label: 'Avanço por Ação', href: '/relatorios/operacao/avanco-por-acao' },
      { label: 'Objeções e Perdas', href: '/relatorios/operacao/objecoes-e-perdas' },
      { label: 'Próximas Ações', href: '/relatorios/operacao/proximas-acoes' },
      { label: 'Canais', href: '/relatorios/operacao/canais' },
      { label: 'Desempenho por Consultor', href: '/relatorios/operacao/desempenho-por-consultor' },
    ],
  },
  {
    title: 'Comercial',
    accent: '#8b5cf6',
    items: [
      { label: 'Performance por Produto', href: '/dashboard/relatorios/produto' },
    ],
  },
  {
    title: 'Sazonalidade',
    accent: '#f59e0b',
    items: [
      { label: 'Dia da Semana', href: '/dashboard/relatorios/dia-semana' },
      { label: 'Semana do Mês', href: '/dashboard/relatorios/semana-mes' },
      { label: 'Sazonalidade Mensal', href: '/dashboard/relatorios/sazonalidade-mensal' },
    ],
  },
  {
    title: 'Cadastros',
    accent: '#22c55e',
    items: [
      { label: 'Cadastro de Produtos', href: '/admin/produtos' },
    ],
  },
  {
    title: 'Governança',
    accent: '#ef4444',
    items: [
      { label: 'Score de Aderência', href: '/relatorios/governanca/score-de-aderencia' },
    ],
  },
]

export default function ReportNavDropdown({ currentPath }: { currentPath: string }) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  const currentLabel = REPORT_NAV_GROUPS
    .flatMap((g) => g.items)
    .find((item) => item.href === currentPath)?.label ?? 'Relatórios'

  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', justifyContent: 'center' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <a
          href="/relatorios"
          style={{
            color: DS.textSecondary,
            textDecoration: 'none',
            fontSize: 12,
            fontWeight: 600,
            padding: '7px 12px',
            borderRadius: DS.radius,
            border: `1px solid ${DS.border}`,
            background: DS.panelBg,
            transition: 'all 200ms ease',
          }}
        >
          Hub
        </a>
        <button
          onClick={() => setOpen((v) => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 14px',
            borderRadius: DS.radius,
            border: `1px solid ${open ? 'rgba(59,130,246,0.4)' : DS.border}`,
            background: open ? 'rgba(59,130,246,0.14)' : DS.panelBg,
            color: open ? DS.blueSoft : DS.textSecondary,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 200ms ease',
            outline: 'none',
          }}
        >
          <span>{currentLabel}</span>
          <span style={{ fontSize: 10, transition: 'transform 200ms ease', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
        </button>
      </div>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            background: DS.surfaceBg,
            border: `1px solid ${DS.border}`,
            borderRadius: DS.radiusContainer + 3,
            padding: '12px 0',
            zIndex: 9000,
            minWidth: 560,
            boxShadow: '0 12px 48px rgba(0,0,0,0.6)',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 0,
          }}
        >
          {REPORT_NAV_GROUPS.map((group) => (
            <div key={group.title} style={{ padding: '8px 16px' }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  color: group.accent,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: 6,
                  paddingBottom: 4,
                  borderBottom: `1px solid ${group.accent}20`,
                }}
              >
                {group.title}
              </div>
              {group.items.map((item) => {
                const isActive = item.href === currentPath
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    style={{
                      display: 'block',
                      padding: '6px 10px',
                      borderRadius: DS.radius - 1,
                      fontSize: 12,
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? DS.blueSoft : DS.textSecondary,
                      background: isActive ? 'rgba(59,130,246,0.10)' : 'transparent',
                      textDecoration: 'none',
                      transition: 'all 150ms ease',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.background = `${DS.border}`
                        ;(e.currentTarget as HTMLElement).style.color = DS.textPrimary
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.background = 'transparent'
                        ;(e.currentTarget as HTMLElement).style.color = DS.textSecondary
                      }
                    }}
                  >
                    {item.label}
                  </a>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}