'use client'

import * as React from 'react'

// --- SVG Icons (inline, stroke-style, 20x20 viewBox 24x24) ---

function IconGauge() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2a10 10 0 0 1 10 10c0 2.76-1.12 5.26-2.93 7.07" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M2 12A10 10 0 0 1 12 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M2 12a10 10 0 0 0 2.93 7.07" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 12 8.5 8.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  )
}

function IconChartLine() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 17l5-5 4 4 5-6 4 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 20h18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function IconRadar() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function IconActivity() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconLayers() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2 2 7l10 5 10-5-10-5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconBarChart() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 20V10M12 20V4M6 20v-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function IconTrendingUp() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M23 6l-9.5 9.5-5-5L1 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 6h6v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconCalendar() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 9h18M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function IconClock() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconDatabase() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="12" cy="5" rx="9" ry="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

function IconArrowRight() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconListCheck() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 11l3 3L22 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconUsers() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function IconMessageSquare() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

function IconMap() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3V7Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 4v13M15 7v13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function IconShare2() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

// --- Types ---

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

// --- Data ---

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
        icon: <IconActivity />,
        title: 'Avanço por Ação',
        desc: 'Quais ações geram avanço real de etapa e quais ficam estagnadas',
        href: '/relatorios/operacao/avanco-por-acao',
      },
      {
        icon: <IconMessageSquare />,
        title: 'Objeções e Perdas',
        desc: 'Motivos de perda mais frequentes e padrões de objeção por etapa',
        href: '#',
        comingSoon: true,
      },
      {
        icon: <IconListCheck />,
        title: 'Próximas Ações',
        desc: 'Visão consolidada das próximas ações agendadas por consultor',
        href: '#',
        comingSoon: true,
      },
      {
        icon: <IconShare2 />,
        title: 'Canais',
        desc: 'Performance por canal de contato: ligação, WhatsApp, e-mail, visita',
        href: '#',
        comingSoon: true,
      },
      {
        icon: <IconUsers />,
        title: 'Desempenho por Consultor',
        desc: 'Análise operacional individual: volume, avanço, conversão e cadência',
        href: '#',
        comingSoon: true,
      },
    ],
  },
  {
    id: 'comercial',
    icon: <IconBarChart />,
    title: 'Comercial',
    subtitle: 'Performance de vendas por produto e mix',
    items: [
      {
        icon: <IconTrendingUp />,
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
    subtitle: 'Padrões temporais e variações por ciclo',
    items: [
      {
        icon: <IconClock />,
        title: 'Dia da Semana',
        desc: 'Sazonalidade por dia da semana: leads trabalhados, ganhos e faturamento por dia',
        href: '/dashboard/relatorios/dia-semana',
      },
      {
        icon: <IconCalendar />,
        title: 'Semana do Mês',
        desc: 'Sazonalidade por bloco semanal (1ª a 5ª semana): volume, faturamento, ticket médio e vocação',
        href: '/dashboard/relatorios/semana-mes',
      },
      {
        icon: <IconMap />,
        title: 'Sazonalidade Mensal',
        desc: 'Leitura sazonal por mês do ano: volume, faturamento, ticket médio e vocação de janeiro a dezembro',
        href: '/dashboard/relatorios/sazonalidade-mensal',
      },
    ],
  },
  {
    id: 'cadastros',
    icon: <IconDatabase />,
    title: 'Cadastros / Base',
    subtitle: 'Gestão de catálogo e configurações da base',
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

// --- Components ---

function ReportCard({ item }: { item: ReportItem }) {
  const [hovered, setHovered] = React.useState(false)

  if (item.comingSoon) {
    return (
      <div
        style={{
          background: '#0f0f0f',
          border: '1px solid #1a1a1a',
          borderRadius: 12,
          padding: '18px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          opacity: 0.45,
          cursor: 'default',
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: '#555' }}>{item.icon}</span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#555',
              background: '#1a1a1a',
              border: '1px solid #252525',
              borderRadius: 4,
              padding: '2px 7px',
            }}
          >
            Em breve
          </span>
        </div>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#666' }}>{item.title}</span>
        <span style={{ fontSize: 12, color: '#444', lineHeight: 1.5 }}>{item.desc}</span>
      </div>
    )
  }

  return (
    <a
      href={item.href}
      style={{
        background: hovered ? '#141414' : '#0f0f0f',
        border: `1px solid ${hovered ? '#2e2e2e' : '#202020'}`,
        borderRadius: 12,
        padding: '18px 20px',
        textDecoration: 'none',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        transition: 'border-color 0.15s, background 0.15s',
        cursor: 'pointer',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: hovered ? '#aaa' : '#666' }}>{item.icon}</span>
        <span
          style={{
            color: hovered ? '#888' : '#444',
            transition: 'color 0.15s, transform 0.15s',
            transform: hovered ? 'translateX(2px)' : 'translateX(0)',
            display: 'inline-flex',
          }}
        >
          <IconArrowRight />
        </span>
      </div>
      <span style={{ fontSize: 14, fontWeight: 600 }}>{item.title}</span>
      <span style={{ fontSize: 12, opacity: 0.5, lineHeight: 1.5 }}>{item.desc}</span>
    </a>
  )
}

function SectionBlock({ section }: { section: Section }) {
  return (
    <div style={{ width: '100%' }}>
      {/* Section header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          marginBottom: 16,
          paddingBottom: 14,
          borderBottom: '1px solid #181818',
        }}
      >
        <span
          style={{
            color: '#555',
            marginTop: 1,
            flexShrink: 0,
          }}
        >
          {section.icon}
        </span>
        <div>
          <h2
            style={{
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: '#888',
              margin: 0,
            }}
          >
            {section.title}
          </h2>
          <p style={{ fontSize: 12, color: '#444', margin: '3px 0 0', lineHeight: 1.4 }}>
            {section.subtitle}
          </p>
        </div>
      </div>

      {/* Cards grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 10,
        }}
      >
        {section.items.map((item) => (
          <ReportCard key={item.title} item={item} />
        ))}
      </div>
    </div>
  )
}

// --- Page ---

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