'use client'

import * as React from 'react'

// ============================================================================
// DESIGN TOKENS — mesmos do shell/kanban
// ============================================================================
const DS = {
  contentBg:     '#090b0f',
  panelBg:       '#0d0f14',
  cardBg:        '#141722',
  surfaceBg:     '#111318',
  border:        '#1a1d2e',
  borderSubtle:  '#13162a',
  textPrimary:   '#edf2f7',
  textSecondary: '#8fa3bc',
  textMuted:     '#546070',
  textLabel:     '#4a5569',
  blue:          '#3b82f6',
  blueSoft:      '#93c5fd',
  blueLight:     '#60a5fa',
  greenBg:       'rgba(22,163,74,0.10)',
  greenBorder:   'rgba(34,197,94,0.25)',
  greenText:     '#86efac',
  amberBg:       'rgba(245,158,11,0.12)',
  amberBorder:   'rgba(245,158,11,0.3)',
  amberText:     '#fef3c7',
  redBg:         'rgba(239,68,68,0.10)',
  redBorder:     'rgba(239,68,68,0.3)',
  redText:       '#fca5a5',
  selectBg:      '#0d0f14',
  shadowCard:    '0 1px 4px rgba(0,0,0,0.4)',
  radius:        7,
  radiusContainer: 9,
} as const

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

function IconShieldCheck() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7l-9-5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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
        icon: <IconGauge />,
        title: 'Visão Executiva',
        desc: 'Síntese gerencial da operação — sinais, gargalos, alavancas e prioridades do período',
        href: '/relatorios/operacao/visao-executiva',
      },
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
        href: '/relatorios/operacao/objecoes-e-perdas',
      },
      {
        icon: <IconListCheck />,
        title: 'Próximas Ações',
        desc: 'Visão consolidada das próximas ações agendadas por consultor',
        href: '/relatorios/operacao/proximas-acoes',
        comingSoon: false,
      },
      {
        icon: <IconShare2 />,
        title: 'Canais',
        desc: 'Performance por canal de contato: ligação, WhatsApp, e-mail, visita',
        href: '/relatorios/operacao/canais',
        comingSoon: false,
      },
      {
        icon: <IconUsers />,
        title: 'Desempenho por Consultor',
        desc: 'Análise operacional individual: volume, avanço, conversão e cadência',
        href: '/relatorios/operacao/desempenho-por-consultor',
        comingSoon: false,
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
  {
    id: 'governanca',
    icon: <IconShieldCheck />,
    title: 'Governança',
    subtitle: 'Disciplina operacional, uso correto do sistema e qualidade de processo',
    items: [
      {
        icon: <IconShieldCheck />,
        title: 'Score de Aderência',
        desc: 'Score 0–100 por consultor: registro de atividades, disciplina de agenda, saúde da carteira e aderência ao processo',
        href: '/relatorios/governanca/score-de-aderencia',
      },
    ],
  },
]

// --- Accent color per section ---
const SECTION_ACCENTS: Record<string, string> = {
  executiva: DS.blue,
  operacao: '#06b6d4',
  comercial: '#8b5cf6',
  sazonalidade: '#f59e0b',
  cadastros: '#22c55e',
  governanca: '#ef4444',
}

// --- Components ---

function ReportCard({ item, sectionId }: { item: ReportItem; sectionId: string }) {
  const [hovered, setHovered] = React.useState(false)
  const accent = SECTION_ACCENTS[sectionId] || DS.blue

  if (item.comingSoon) {
    return (
      <div
        style={{
          background: DS.panelBg,
          border: `1px solid ${DS.border}`,
          borderRadius: DS.radiusContainer,
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
          <span style={{ color: DS.textMuted }}>{item.icon}</span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: DS.textMuted,
              background: DS.surfaceBg,
              border: `1px solid ${DS.border}`,
              borderRadius: 4,
              padding: '2px 7px',
            }}
          >
            Em breve
          </span>
        </div>
        <span style={{ fontSize: 14, fontWeight: 600, color: DS.textLabel }}>{item.title}</span>
        <span style={{ fontSize: 12, color: DS.textMuted, lineHeight: 1.5 }}>{item.desc}</span>
      </div>
    )
  }

  return (
    <a
      href={item.href}
      style={{
        background: hovered
          ? `linear-gradient(135deg, ${accent}08, ${accent}14)`
          : DS.cardBg,
        border: `1px solid ${hovered ? `${accent}40` : DS.border}`,
        borderRadius: DS.radiusContainer,
        padding: '18px 20px',
        textDecoration: 'none',
        color: DS.textPrimary,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        transition: 'border-color 200ms ease, background 200ms ease, transform 200ms ease, box-shadow 200ms ease',
        cursor: 'pointer',
        transform: hovered ? 'translateY(-2px)' : 'none',
        boxShadow: hovered
          ? `0 4px 16px rgba(0,0,0,0.4), 0 0 8px ${accent}18`
          : DS.shadowCard,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: hovered ? accent : DS.textLabel, transition: 'color 200ms ease' }}>{item.icon}</span>
        <span
          style={{
            color: hovered ? accent : DS.textMuted,
            transition: 'color 200ms ease, transform 200ms ease',
            transform: hovered ? 'translateX(3px)' : 'translateX(0)',
            display: 'inline-flex',
          }}
        >
          <IconArrowRight />
        </span>
      </div>
      <span style={{ fontSize: 14, fontWeight: 700 }}>{item.title}</span>
      <span style={{ fontSize: 12, color: DS.textSecondary, lineHeight: 1.5 }}>{item.desc}</span>
    </a>
  )
}

function SectionBlock({ section }: { section: Section }) {
  const accent = SECTION_ACCENTS[section.id] || DS.blue

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
          borderBottom: `1px solid ${DS.border}`,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: DS.radius,
            background: `${accent}15`,
            border: `1px solid ${accent}30`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color: accent,
          }}
        >
          {section.icon}
        </div>
        <div>
          <h2
            style={{
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: accent,
              margin: 0,
            }}
          >
            {section.title}
          </h2>
          <p style={{ fontSize: 12, color: DS.textSecondary, margin: '3px 0 0', lineHeight: 1.4 }}>
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
          <ReportCard key={item.title} item={item} sectionId={section.id} />
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
        background: DS.contentBg,
        color: DS.textPrimary,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* HEADER com degradê azul — mesmo padrão do Pipeline */}
      <div
        style={{
          background: `linear-gradient(135deg, ${DS.blue}18 0%, ${DS.contentBg} 60%)`,
          borderBottom: `1px solid ${DS.border}`,
          padding: '32px 24px 28px',
        }}
      >
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 800,
              margin: '0 0 6px',
              letterSpacing: '-0.01em',
              color: DS.textPrimary,
            }}
          >
            Relatórios
          </h1>
          <p style={{ fontSize: 13, color: DS.textSecondary, margin: 0 }}>
            Central de análises e relatórios do seu time comercial
          </p>
        </div>
      </div>

      {/* CONTEÚDO */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '32px 24px 80px',
        }}
      >
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          {/* Sections */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 48 }}>
            {sections.map((section) => (
              <SectionBlock key={section.id} section={section} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}