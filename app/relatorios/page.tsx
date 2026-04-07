'use client'

import * as React from 'react'

// ---------------------------------------------------------------------------
// SVG Icons
// ---------------------------------------------------------------------------

function IconGauge() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12" />
      <path d="M12 12 8 8" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

function IconRadar() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z" />
      <path d="M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
    </svg>
  )
}

function IconChartLine() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  )
}

function IconActivity() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  )
}

function IconLayers() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  )
}

function IconBarChart() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  )
}

function IconPackage() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  )
}

function IconCalendar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function IconDatabase() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  )
}

function IconTrendingUp() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  )
}

function IconAlertTriangle() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function IconClock() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function IconWifi() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
  )
}

function IconUsers() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReportItem {
  icon: React.ReactNode
  title: string
  desc: string
  href: string
  comingSoon?: boolean
}

interface Section {
  id: string
  icon: React.ReactNode
  title: string
  subtitle: string
  items: ReportItem[]
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const sections: Section[] = [
  {
    id: 'executiva',
    icon: <IconGauge />,
    title: 'Visão Executiva',
    subtitle: 'Leitura macro e diagnóstico do período',
    items: [
      {
        icon: <IconRadar />,
        title: 'Radar do Período',
        desc: 'Classificação do cenário atual: favorável, neutro ou arriscado — com base real e explicável',
        href: '/dashboard/relatorios/radar',
      },
      {
        icon: <IconChartLine />,
        title: 'Relatórios Gerais',
        desc: 'SLA, leads em risco, tempo médio por etapa e análise do funil',
        href: '/relatorios/gerais',
      },
    ],
  },
  {
    id: 'operacao',
    icon: <IconActivity />,
    title: 'Operação',
    subtitle: 'Relatórios operacionais detalhados por consultor e etapa',
    items: [
      {
        icon: <IconLayers />,
        title: 'Ações por Etapa',
        desc: 'Distribuição das ações operacionais registradas em cada etapa do funil',
        href: '/relatorios/operacao/acoes-por-etapa',
      },
      {
        icon: <IconTrendingUp />,
        title: 'Avanço por Ação',
        desc: 'Taxa de conversão para cada ação registrada — quais avançam o lead',
        href: '#',
        comingSoon: true,
      },
      {
        icon: <IconAlertTriangle />,
        title: 'Objeções e Perdas',
        desc: 'Padrões de objeção e análise de perdas por etapa e consultor',
        href: '#',
        comingSoon: true,
      },
      {
        icon: <IconClock />,
        title: 'Próximas Ações',
        desc: 'Visão das próximas ações planejadas e pendências operacionais',
        href: '#',
        comingSoon: true,
      },
      {
        icon: <IconWifi />,
        title: 'Canais',
        desc: 'Performance por canal de contato: WhatsApp, ligação, e-mail e outros',
        href: '#',
        comingSoon: true,
      },
      {
        icon: <IconUsers />,
        title: 'Desempenho por Consultor',
        desc: 'Ranking e análise comparativa de produtividade por consultor',
        href: '#',
        comingSoon: true,
      },
    ],
  },
  {
    id: 'comercial',
    icon: <IconBarChart />,
    title: 'Comercial',
    subtitle: 'Performance de vendas, mix e faturamento',
    items: [
      {
        icon: <IconPackage />,
        title: 'Performance por Produto',
        desc: 'Ticket médio, conversão e faturamento por produto',
        href: '/dashboard/relatorios/produto',
      },
    ],
  },
  {
    id: 'sazonalidade',
    icon: <IconCalendar />,
    title: 'Sazonalidade',
    subtitle: 'Análise temporal e padrões sazonais',
    items: [
      {
        icon: <IconCalendar />,
        title: 'Dia da Semana',
        desc: 'Sazonalidade por dia da semana: leads trabalhados, ganhos e faturamento',
        href: '/dashboard/relatorios/dia-semana',
      },
      {
        icon: <IconCalendar />,
        title: 'Semana do Mês',
        desc: 'Sazonalidade por bloco semanal (1ª a 5ª semana): volume, faturamento e ticket médio',
        href: '/dashboard/relatorios/semana-mes',
      },
      {
        icon: <IconCalendar />,
        title: 'Sazonalidade Mensal',
        desc: 'Leitura sazonal por mês do ano: volume, faturamento, ticket médio e vocação',
        href: '/dashboard/relatorios/sazonalidade-mensal',
      },
    ],
  },
  {
    id: 'cadastros',
    icon: <IconDatabase />,
    title: 'Cadastros / Base',
    subtitle: 'Gestão de catálogo e configurações',
    items: [
      {
        icon: <IconDatabase />,
        title: 'Cadastro de Produtos',
        desc: 'Gerenciar catálogo de produtos (criar, editar, ativar/desativar)',
        href: '/admin/produtos',
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function ReportCard({ item }: { item: ReportItem }) {
  const [hovered, setHovered] = React.useState(false)

  if (item.comingSoon) {
    return (
      <div
        style={{
          background: '#0a0a0a',
          border: '1px solid #191919',
          borderRadius: 12,
          padding: '16px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          opacity: 0.5,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ color: '#555' }}>{item.icon}</div>
          <span
            style={{
              fontSize: 10,
              padding: '2px 8px',
              borderRadius: 20,
              background: '#1e1e1e',
              color: '#555',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Em breve
          </span>
        </div>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#555' }}>{item.title}</span>
        <span style={{ fontSize: 12, color: '#444' }}>{item.desc}</span>
      </div>
    )
  }

  return (
    <a
      href={item.href}
      style={{
        background: '#0f0f0f',
        border: `1px solid ${hovered ? '#333' : '#202020'}`,
        borderRadius: 12,
        padding: '16px 18px',
        textDecoration: 'none',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ color: '#9aa' }}>{item.icon}</div>
      <span style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>{item.title}</span>
      <span style={{ fontSize: 12, color: '#666' }}>{item.desc}</span>
    </a>
  )
}

function SectionBlock({ section }: { section: Section }) {
  return (
    <div>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ color: '#9aa' }}>{section.icon}</span>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'white' }}>{section.title}</h2>
          <p style={{ fontSize: 12, color: '#555', margin: 0 }}>{section.subtitle}</p>
        </div>
      </div>

      {/* Cards grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 12,
        }}
      >
        {section.items.map((item) => (
          <ReportCard key={item.href + item.title} item={item} />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RelatoriosHubPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0c0c0c',
        color: 'white',
        padding: '48px 24px 80px',
        overflowY: 'auto',
      }}
    >
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        {/* Page header */}
        <div style={{ marginBottom: 48 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-0.01em' }}>
            Relatórios
          </h1>
          <p style={{ fontSize: 13, color: '#555', margin: 0 }}>
            Central de análises e relatórios do seu time comercial
          </p>
        </div>

        {/* Sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 48 }}>
          {sections.map((section) => (
            <SectionBlock key={section.id} section={section} />
          ))}
        </div>
      </div>
    </div>
  )
}