'use client'

import * as React from 'react'

export default function RelatoriosHubPage() {
  const cardBase: React.CSSProperties = {
    background: '#0f0f0f',
    border: '1px solid #202020',
    borderRadius: 16,
    padding: 24,
    textDecoration: 'none',
    color: 'white',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    transition: 'border-color 0.15s',
  }

  const cards = [
    {
      emoji: '📊',
      title: 'Relatórios Gerais',
      desc: 'SLA, leads em risco, tempo médio por etapa e análise do funil',
      href: '/relatorios/gerais',
    },
    {
      emoji: '📦',
      title: 'Performance por Produto',
      desc: 'Ticket médio, conversão e faturamento por produto',
      href: '/dashboard/relatorios/produto',
    },
    {
      emoji: '📅',
      title: 'Dia da Semana',
      desc: 'Sazonalidade por dia da semana: leads trabalhados, ganhos e faturamento por dia',
      href: '/dashboard/relatorios/dia-semana',
    },
    {
      emoji: '🗓️',
      title: 'Semana do Mês',
      desc: 'Sazonalidade por bloco semanal (1ª a 5ª semana): volume, faturamento, ticket médio e vocação',
      href: '/dashboard/relatorios/semana-mes',
    },
    {
      emoji: '📅',
      title: 'Sazonalidade Mensal',
      desc: 'Leitura sazonal por mês do ano: volume, faturamento, ticket médio e vocação de janeiro a dezembro',
      href: '/dashboard/relatorios/mes',
    },
    {
      emoji: '🛒',
      title: 'Cadastro de Produtos',
      desc: 'Gerenciar catálogo de produtos (criar, editar, ativar/desativar)',
      href: '/admin/produtos',
    },
  ]

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0c0c0c',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 16px',
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 32, textAlign: 'center' }}>
        Relatórios
      </h1>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
          maxWidth: 900,
          width: '100%',
        }}
      >
        {cards.map((card) => (
          <a
            key={card.href}
            href={card.href}
            style={cardBase}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLAnchorElement).style.borderColor = '#333'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLAnchorElement).style.borderColor = '#202020'
            }}
          >
            <span style={{ fontSize: 32 }}>{card.emoji}</span>
            <span style={{ fontSize: 18, fontWeight: 700 }}>{card.title}</span>
            <span style={{ fontSize: 13, opacity: 0.7 }}>{card.desc}</span>
          </a>
        ))}
      </div>
    </div>
  )
}